import { prisma } from './prisma';
import RedisManager from './redis';
import { fetchPendingOrders, fetchSingleOrder } from './mercadolibre';
import { generateSku, extractFamilyBase } from './sku-generator';

type RawItem = {
  sku?: string;
  title?: string;
  quantity: number;
  price?: string | number;
  image?: string | null;
  categoryPath?: string | null; // Path de categoría ML (ej: "Electrónica > Cables")
};

export type SyncResult = {
  success: boolean;
  imported: number;
  skipped: number;
  resolutionRequired: number;
  totalProcessed: number;
};

/**
 * Obtiene la hora actual en Chile (America/Santiago).
 */
function getChileHour(): number {
  return parseInt(new Date().toLocaleString('es-CL', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'America/Santiago'
  }));
}

/**
 * Obtiene el día de la semana en Chile (0=Dom, 1=Lun, ..., 6=Sáb).
 */
function getChileDayOfWeek(): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    weekday: 'long'
  }).format(new Date());
  const map: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6
  };
  return map[name] ?? 0;
}

/**
 * Genera un mensaje de despacho amigable en español para mostrar al operario.
 *
 * Flex (Leon Express):
 *   Lun-Sáb antes de 12 PM → "Tienes que darle el paquete a tu conductor hoy."
 *   Lun-Sáb después de 12 PM → "Tienes que darle el paquete a tu conductor [mañana/el lunes]."
 *   Domingo → "Tienes que darle el paquete a tu conductor el lunes."
 *   → Los conductores trabajan Lun-Sáb. Domingo NO.
 *
 * Colecta (Cross Docking):
 *   Lun-Vie antes de 4 PM → "Tienes que darle el paquete a la colecta lo antes posible para no demorarte."
 *   Lun-Vie después de 4 PM → "Tienes que darle el paquete a la colecta que pasará [mañana/el lunes] entre las 16:00 y 18:00 hs para no demorarte."
 *   Sáb-Dom → "Tienes que darle el paquete a la colecta que pasará el lunes entre las 16:00 y 18:00 hs para no demorarte."
 *   → El camión de ML no pasa sábados ni domingos.
 *
 * Otros: "Tienes que entregar el paquete antes de las [HH:mm] del [dd/mm/aaaa]."
 */
function formatPriorityMessage(
  logisticType: string,
  isFlex: boolean,
  shippingDetails: any,
): string | null {
  const hour = getChileHour();
  const dayOfWeek = getChileDayOfWeek();

  if (isFlex) {
    // Flex: conductores trabajan Lun-Sáb. Domingo NO. Cutoff 12 PM.
    if (dayOfWeek === 0) {
      return 'Tienes que darle el paquete a tu conductor el lunes.';
    }
    if (hour < 12) {
      return 'Tienes que darle el paquete a tu conductor hoy.';
    }
    // Sábado después de 12 PM → lunes (domingo no es hábil)
    if (dayOfWeek === 6) {
      return 'Tienes que darle el paquete a tu conductor el lunes.';
    }
    // Lun-Vie después de 12 PM → mañana (sábado es hábil)
    return 'Tienes que darle el paquete a tu conductor mañana.';
  }

  if (logisticType === 'cross_docking' || logisticType === 'xd_drop_off') {
    // Colecta: camión Lun-Vie. Sáb y Dom NO. Cutoff 4 PM.
    const isColectaWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isFridayAfterCutoff = dayOfWeek === 5 && hour >= 16;
    if (isColectaWeekend || isFridayAfterCutoff) {
      return 'Tienes que darle el paquete a la colecta que pasará el lunes entre las 16:00 y 18:00 hs para no demorarte.';
    }
    if (hour >= 16) {
      return 'Tienes que darle el paquete a la colecta que pasará mañana entre las 16:00 y 18:00 hs para no demorarte.';
    }
    return 'Tienes que darle el paquete a la colecta lo antes posible para no demorarte.';
  }

  // Otros tipos logísticos
  const limitDate = shippingDetails?.limit_date ? new Date(shippingDetails.limit_date) : null;
  if (limitDate) {
    const hora = limitDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
    const fecha = limitDate.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `Tienes que entregar el paquete antes de las ${hora} del ${fecha}.`;
  }

  return logisticType?.toUpperCase() || null;
}

/**
 * Resuelve productos para una lista de ítems en batch:
 * 1. Busca todos los SKU en una sola query
 * 2. Para los que no encontró, busca por alias/título (individual, son pocos)
 * 3. Para los que siguen sin coincidir, crea/actualiza productos ML-MISSING
 */
export type ResolveStats = {
  reusedSku: number;
  reusedAlias: number;
  autoCreated: number;
  missingCreated: number;
};

async function resolveItems(
  rawItems: RawItem[],
  mlIdStr: string
): Promise<{ itemsToCreate: any[]; anyItemNeedsResolution: boolean; stats: ResolveStats }> {
  const itemsToCreate: any[] = [];
  let anyItemNeedsResolution = false;

  // --- OPTIMIZACIÓN: Batch lookup de productos por SKU ---
  const uniqueSkus = [...new Set(rawItems.map(i => i.sku).filter((s): s is string => s !== undefined && s !== ''))];
  const foundProducts = uniqueSkus.length > 0
    ? await prisma.product.findMany({ where: { sku: { in: uniqueSkus } } })
    : [];
  const productBySku = new Map(foundProducts.map(p => [p.sku, p]));

  let reusedSku = 0, reusedAlias = 0, autoCreated = 0, missingCreated = 0;

  for (const rawItem of rawItems) {
    const itemSku = rawItem.sku;
    const itemTitle = rawItem.title;
    const itemLabel = itemTitle || itemSku || '(sin nombre)';

    // Paso 1: Buscar por SKU directo (desde el Map ya cargado)
    let product: any = itemSku ? productBySku.get(itemSku) ?? null : null;

    if (product) {
      reusedSku++;
      console.log(`[Resolve] ♻️ REUSADO (${product.sku}) ← ${itemLabel} [SKU]`);
      
      // Actualizar salePrice desde la orden de ML si el producto no tiene precio
      if (rawItem.price && !product.salePrice) {
        await prisma.product.update({
          where: { id: product.id },
          data: { salePrice: parseFloat(String(rawItem.price)), currency: 'CLP' }
        });
        console.log(`[Resolve] 💰 PRECIO ASIGNADO (${product.sku}): $${parseFloat(String(rawItem.price)).toLocaleString('es-CL')}`);
      }
    }

    // Paso 2: Si no se encontró por SKU, buscar por alias, título o nombre
    if (!product) {
      const orConditions: any[] = [];
      if (itemSku) orConditions.push({ mlAliases: { has: itemSku } });
      if (itemTitle) {
        orConditions.push({ mlAliases: { has: itemTitle } });
        // También buscar por nombre exacto (insensible a mayúsculas)
        orConditions.push({ name: { equals: itemTitle, mode: 'insensitive' } });
      }
      if (orConditions.length > 0) {
        product = await prisma.product.findFirst({
          where: { OR: orConditions, NOT: { sku: { startsWith: 'ML-MISSING' } } }
        });
      }
      if (product) {
        reusedAlias++;
        console.log(`[Resolve] ♻️ REUSADO (${product.sku}) ← ${itemLabel} [ALIAS]`);
        
        // Actualizar salePrice desde la orden de ML si el producto no tiene precio
        if (rawItem.price && !product.salePrice) {
          await prisma.product.update({
            where: { id: product.id },
            data: { salePrice: parseFloat(String(rawItem.price)), currency: 'CLP' }
          });
          console.log(`[Resolve] 💰 PRECIO ASIGNADO (${product.sku}): $${parseFloat(String(rawItem.price)).toLocaleString('es-CL')}`);
        }
      }
    }

    // Paso 3: Si sigue sin producto válido, intentar auto-crear o crear ML-MISSING
    if (!product || product.sku.startsWith('ML-MISSING')) {
      const itemTitleSafe = itemTitle || rawItem.sku || '';
      const familyBase = itemTitleSafe ? extractFamilyBase(itemTitleSafe, rawItem.categoryPath || undefined) : 9000;

      if (familyBase !== 9000) {
        // 📦 Categoría conocida → crear producto real con SKU generado
        try {
          const newSku = await generateSku(itemTitleSafe);
          const mlCategoryPath = rawItem.categoryPath || null;
          product = await prisma.product.upsert({
            where: { sku: newSku },
            update: { ...(rawItem.image ? { imageUrl: rawItem.image } : {}), mlCategoryPath },
            create: {
              sku: newSku,
              name: itemTitle || `Producto ${newSku}`,
              salePrice: rawItem.price ? parseFloat(String(rawItem.price)) : 0,
              currency: 'CLP',
              imageUrl: rawItem.image || null,
              mlAliases: [itemSku, itemTitle].filter((s): s is string => !!s),
              categoryFamily: familyBase !== 9000 ? familyBase : null,
              mlCategoryPath,
            }
          });

          console.log(`[Resolve] 🆕 CREADO ${newSku} ← ${itemLabel} (familia ${familyBase})`);
          autoCreated++;
        } catch (err) {
          // Si falla la generación, caer en ML-MISSING
          console.error(`[Resolve] ❌ Error generando SKU para "${itemTitleSafe}":`, err);
          anyItemNeedsResolution = true;
          const missingSku = `ML-MISSING-${itemSku || mlIdStr}`;
          product = await prisma.product.upsert({
            where: { sku: missingSku },
            update: { ...(rawItem.image ? { imageUrl: rawItem.image } : {}) },
            create: {
              sku: missingSku,
              name: itemTitle || `Producto Desconocido ML-${mlIdStr}`,
              salePrice: rawItem.price ? parseFloat(String(rawItem.price)) : 0,
              currency: 'CLP',
              imageUrl: rawItem.image || null,
              categoryFamily: familyBase !== 9000 ? familyBase : null,
            }
          });
          console.log(`[Resolve] ⚠️ ML-MISSING ${missingSku} ← ${itemLabel} (error en generateSku)`);
          missingCreated++;
        }
      } else {
        // ❓ Categoría default (9000) → crear ML-MISSING para revisión manual
        anyItemNeedsResolution = true;
        const missingSku = `ML-MISSING-${itemSku || mlIdStr}`;
        product = await prisma.product.upsert({
          where: { sku: missingSku },
          update: { ...(rawItem.image ? { imageUrl: rawItem.image } : {}) },
          create: {
            sku: missingSku,
            name: itemTitle || `Producto Desconocido ML-${mlIdStr}`,
            salePrice: rawItem.price ? parseFloat(String(rawItem.price)) : 0,
            currency: 'CLP',
            imageUrl: rawItem.image || null,
            categoryFamily: familyBase !== 9000 ? familyBase : null,
          }
        });
        console.log(`[Resolve] ❓ ML-MISSING ${missingSku} ← ${itemLabel} (familia 9000 sin clasificar)`);
        missingCreated++;
      }
    }

    itemsToCreate.push({
      productId: product.id,
      quantityTotal: rawItem.quantity,
      quantityPicked: 0,
      mlImageUrl: rawItem.image || null
    });
  }

  if (rawItems.length > 1 || reusedSku > 0 || reusedAlias > 0 || autoCreated > 0 || missingCreated > 0) {
    console.log(`[Resolve] 📊 resumen: ${reusedSku} por SKU, ${reusedAlias} por alias, ${autoCreated} creados, ${missingCreated} ML-MISSING (total ${rawItems.length} items)`);
  }

  return { itemsToCreate, anyItemNeedsResolution, stats: { reusedSku, reusedAlias, autoCreated, missingCreated } };
}

/**
 * Refresca una orden específica desde ML, actualizando metadatos y items sin duplicar.
 * 
 * - Actualiza isFlex, priorityMessage, buyerName, shippingId
 * - Para items: actualiza quantityTotal en OrderItems existentes o crea nuevos si no existen
 * - NO crea productos duplicados (usa resolveItems con la búsqueda mejorada)
 * 
 * @param orderId ID de la orden en nuestra DB
 * @returns La orden actualizada, o null si no se encontró en ML
 */
export async function refreshOrder(orderId: string) {
  // 1. Buscar la orden en nuestra DB
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: { select: { id: true, sku: true } }
        }
      }
    }
  });

  if (!order) {
    throw new Error(`Orden ${orderId} no encontrada en DB`);
  }

  // 2. Obtener datos actuales desde ML
  // Buscar por ml_order_id desde el mlId (ml_shipment_external_id)
  // Necesitamos el ml_order_id, lo buscamos o intentamos con un fetch de ML
  // El mlId es el ml_shipment_external_id, que no es el order id de ML.
  // Intentamos con shipments y si falla, usamos una búsqueda más amplia.
  
  // Usar el mlOrderId almacenado (el ID real de la orden en ML)
  if (!order.mlOrderId) {
    throw new Error(`La orden ${orderId} no tiene mlOrderId. Solo las órdenes sincronizadas después de la actualización tienen este campo.`);
  }

  const freshData = await fetchSingleOrder(order.mlOrderId);
  if (!freshData) {
    return null;
  }

  // 3. Calcular prioridad (formato amigable)
  const shippingDetails = freshData.shipping_details || null;
  const isFlex = freshData.is_flex === true || freshData.logistic_type === 'self_service';
  const priorityMessage = formatPriorityMessage(
    freshData.logistic_type || '',
    isFlex,
    shippingDetails
  );

  // 3.5. Evaluar estado (Cancelado o Despachado)
  const isCancelled = freshData.order_status === 'cancelled' || freshData.shipping_status === 'cancelled';
  const isShipped = freshData.shipping_status === 'shipped' || freshData.shipping_status === 'delivered';
  
  let newStatus = order.status;
  if (isCancelled && order.status !== 'CANCELLED') newStatus = 'CANCELLED' as any;
  else if (isShipped && order.status !== 'SHIPPED') newStatus = 'SHIPPED' as any;

  // 4. Actualizar metadatos de la orden
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: newStatus !== order.status ? newStatus : undefined,
      isFlex,
      priorityMessage,
      buyerName: freshData.buyer_name ?? undefined,
      shippingId: freshData.ml_shipping_id ?? undefined,
    }
  });

  if (newStatus !== order.status) {
    console.log(`[Sync] 🚨 Estado actualizado vía refresh: ${orderId} -> ${newStatus}`);
  }

  // 5. Sincronizar items (sin duplicar)
  const rawItems: RawItem[] = JSON.parse(freshData.items_json);
  
  // Resolver productos (crear solo los que no existan en DB)
  const { itemsToCreate } = await resolveItems(rawItems, order.mlId);

  // Sincronizar items usando upsert con unique constraint (orderId + productId)
  // Esto previene duplicados incluso en race conditions (2+ refreshes concurrentes)
  for (const newItem of itemsToCreate) {
    await prisma.orderItem.upsert({
      where: {
        orderId_productId: {
          orderId,
          productId: newItem.productId,
        },
      },
      create: {
        orderId,
        productId: newItem.productId,
        quantityTotal: newItem.quantityTotal,
        quantityPicked: 0,
        mlImageUrl: newItem.mlImageUrl,
      },
      update: {
        quantityTotal: newItem.quantityTotal,
        mlImageUrl: newItem.mlImageUrl ?? undefined,
      },
    });
  }

  // 6. Retornar la orden actualizada
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            include: {
              locations: { include: { location: true } }
            }
          }
        }
      }
    }
  });
}

/**
 * Ejecuta un ciclo completo de sincronización:
 * 1. Obtiene órdenes listas para despachar desde la API de MercadoLibre
 * 2. Procesa/importa cada orden (crea o actualiza órdenes y sus items)
 * 3. Re-evalúa órdenes PENDING en busca de fantasmas
 * 4. Retorna el resultado
 *
 * Usa un lock distribuido (Redis → Postgres EmergencyLock) para evitar
 * ejecuciones concurrentes entre procesos (autoSync + API).
 */
export async function syncOrders(limit: number = 30, offset: number = 0): Promise<SyncResult> {
  // Lock distribuido: previene syncs concurrentes entre procesos
  const LOCK_TTL = 300; // 5 minutos
  const lockAcquired = await RedisManager.lockOrder('sync_lock', 'global', LOCK_TTL);
  if (!lockAcquired) {
    console.log('[SyncLock] ⏳ Sync ya en ejecución en otro proceso, ignorando llamada concurrente');
    return { success: true, imported: 0, skipped: 0, resolutionRequired: 0, totalProcessed: 0 };
  }

  const syncStart = Date.now();

  try {
    // 1. Obtener órdenes directo desde la API de MercadoLibre
    const shipments = await fetchPendingOrders(limit, offset);

    let importedCount = 0;
    let skippedCount = 0;
    let resolutionRequiredCount = 0;
    let totalReusedSku = 0, totalReusedAlias = 0, totalAutoCreated = 0, totalMissingCreated = 0;

    // 2. Pre-fetch all existing orders in ONE batch query (evita 30 queries individuales)
    // Check by BOTH mlId (new: order ID) and mlOrderId (handles orders imported before the fix with shipping ID as mlId)
    const allMlIds = shipments.map(s => String(s.ml_shipment_external_id));
    const allMlOrderIds = shipments.map(s => s.ml_order_id).filter((id): id is number => id != null).map(id => BigInt(id));
    const existingOrders = (allMlIds.length > 0 || allMlOrderIds.length > 0)
      ? await prisma.order.findMany({ 
          where: { 
            OR: [
              { mlId: { in: allMlIds } },
              ...(allMlOrderIds.length > 0 ? [{ mlOrderId: { in: allMlOrderIds } }] : []),
            ]
          } 
        })
      : [];
    const existingOrdersByMlId = new Map(existingOrders.map(o => [o.mlId, o]));
    const existingOrdersByMlOrderId = new Map(
      existingOrders.filter(o => o.mlOrderId != null).map(o => [Number(o.mlOrderId!), o])
    );

    // 3. Process each shipment
    for (const shipment of shipments) {
      const mlIdStr = String(shipment.ml_shipment_external_id);

      // --- CÁLCULO DE PRIORIDAD (formato amigable) ---
      const shippingDetails = shipment.shipping_details || null;
      const isFlex = shipment.is_flex === true || shipment.logistic_type === 'self_service';
      const priorityMessage = formatPriorityMessage(
        shipment.logistic_type || '',
        isFlex,
        shippingDetails
      );

      const buyerName = shipment.buyer_name || null;

      // Check if order already exists in our DB (desde los Maps pre-cargados)
      const existingOrder = existingOrdersByMlId.get(mlIdStr) 
        || existingOrdersByMlOrderId.get(shipment.ml_order_id) 
        || null;

      if (existingOrder) {
        // La orden ya existe en nuestra DB → actualizar metadatos según sea necesario
        // (mlOrderId y shippingId pueden ser null si la orden se creó antes de que el schema los incluyera)
        // También actualizamos priorityMessage si cambió (viejo formato → nuevo formato amigable)
        // También evaluamos si fue cancelada o despachada en la vista reciente
        const isCancelled = shipment.order_status === 'cancelled' || shipment.shipping_status === 'cancelled';
        const isShipped = shipment.shipping_status === 'shipped' || shipment.shipping_status === 'delivered';
        let newStatus = existingOrder.status;
        if (isCancelled && existingOrder.status !== 'CANCELLED') newStatus = 'CANCELLED' as any;
        else if (isShipped && existingOrder.status !== 'SHIPPED') newStatus = 'SHIPPED' as any;

        const needsStatusUpdate = newStatus !== existingOrder.status;
        const needsMetadataUpdate = !existingOrder.mlOrderId || !existingOrder.shippingId;
        const needsMlIdFix = existingOrder.mlId !== mlIdStr; // mlId viejo era shipping ID (2000...)
        const needsPriorityUpdate = existingOrder.priorityMessage !== priorityMessage;

        if (needsMetadataUpdate || needsMlIdFix || needsPriorityUpdate || needsStatusUpdate) {
          await prisma.order.update({
            where: { id: existingOrder.id },
            data: {
              ...(needsMlIdFix ? { mlId: mlIdStr } : {}), // Fix mlId from shipping ID to order ID
              status: needsStatusUpdate ? newStatus : undefined,
              mlOrderId: shipment.ml_order_id ?? undefined,
              shippingId: shipment.ml_shipping_id ?? undefined,
              isFlex: shipment.is_flex ?? undefined,
              buyerName: shipment.buyer_name ?? undefined,
              priorityMessage,
            }
          });
          
          if (needsStatusUpdate) {
            console.log(`[Sync] 🚨 Estado actualizado para orden existente: ${mlIdStr} -> ${newStatus}`);
          }
          if (needsMlIdFix) {
            console.log(`[Sync] 🔧 mlId corregido: ${existingOrder.mlId} → ${mlIdStr}`);
          }
          if (needsPriorityUpdate) {
            console.log(`[Sync] 💬 priorityMessage actualizado: "${existingOrder.priorityMessage}" → "${priorityMessage}"`);
          }
          console.log(`[Sync] 🔄 Metadatos actualizados para orden existente ${mlIdStr} (mlOrderId=${shipment.ml_order_id}, shippingId=${shipment.ml_shipping_id})`);
        }
        skippedCount++;
        continue;
      }

      // --- CREACIÓN DE ÓRDENES NUEVAS ---
      const rawItems: RawItem[] = shipment.items_json ? JSON.parse(shipment.items_json) : [{
        sku: shipment.item_sku,
        title: shipment.item_title,
        quantity: shipment.item_quantity || 1,
        price: shipment.item_price || 0,
        image: shipment.item_image
      }];

      const { itemsToCreate, anyItemNeedsResolution, stats } = await resolveItems(rawItems, mlIdStr);
      totalReusedSku += stats.reusedSku;
      totalReusedAlias += stats.reusedAlias;
      totalAutoCreated += stats.autoCreated;
      totalMissingCreated += stats.missingCreated;
      let newStatus: any = 'PENDING';
      const mlShippingStatus = shipment.shipping_status;
      const mlOrderStatus = shipment.order_status;

      if (mlOrderStatus === 'cancelled' || mlOrderStatus === 'invalid' || mlShippingStatus === 'cancelled') {
        newStatus = 'CANCELLED';
      } else if (mlShippingStatus === 'shipped' || mlShippingStatus === 'delivered') {
        newStatus = 'SHIPPED';
      } else if (!shipment.ml_shipping_id || shipment.logistic_type === 'fulfillment') {
        // Si no tiene ID de envío (ej. compra sin envío / retira en tienda) o es FULL (gestionado por MercadoLibre),
        // lo consideramos completado para que no ensucie la pantalla de picking.
        newStatus = 'SHIPPED';
      } else {
        newStatus = anyItemNeedsResolution ? 'RESOLUTION_REQUIRED' : 'PENDING';
        if (anyItemNeedsResolution) resolutionRequiredCount++;
      }

      // Merge items por productId para evitar duplicados dentro de la misma orden
      // (2 items de ML pueden resolverse al mismo producto en nuestra DB)
      const mergedItems = new Map<string, (typeof itemsToCreate)[0]>();
      for (const item of itemsToCreate) {
        const existing = mergedItems.get(item.productId);
        if (existing) {
          existing.quantityTotal += item.quantityTotal;
        } else {
          mergedItems.set(item.productId, { ...item });
        }
      }

      try {
        // 1. Crear la orden (sin items) para evitar P2002 en OrderItem por productId duplicado
        const newOrder = await prisma.order.create({
          data: {
            mlId: mlIdStr,
            mlOrderId: shipment.ml_order_id,
            shippingId: shipment.ml_shipping_id,
            status: newStatus,
            isFlex,
            priorityMessage,
            buyerName
          }
        });

        // 2. Crear/actualizar cada OrderItem con upsert (maneja duplicados productId)
        for (const item of mergedItems.values()) {
          await prisma.orderItem.upsert({
            where: {
              orderId_productId: {
                orderId: newOrder.id,
                productId: item.productId,
              },
            },
            create: {
              orderId: newOrder.id,
              productId: item.productId,
              quantityTotal: item.quantityTotal,
              quantityPicked: 0,
              mlImageUrl: item.mlImageUrl,
            },
            update: {
              quantityTotal: item.quantityTotal,
              mlImageUrl: item.mlImageUrl ?? undefined,
            },
          });
        }

        importedCount++;
      } catch (err: any) {
        // Race condition: orden creada por otro proceso entre el pre-fetch y el create
        if (err?.code === 'P2002') {
          skippedCount++;
        } else {
          throw err;
        }
      }
    }

    // 4. Re-evaluación final de órdenes activas (fantasmas y cancelaciones silenciosas)
    const activeOrders = await prisma.order.findMany({
      where: { status: { in: ['PENDING', 'PICKING', 'PACKING', 'RESOLUTION_REQUIRED'] } },
      orderBy: { updatedAt: 'asc' }, // Más antiguas primero
      take: 15, // Lote pequeño para no ahogar la API de ML
      select: {
        id: true,
        status: true,
        mlOrderId: true,
        updatedAt: true,
        items: {
          select: {
            product: { select: { sku: true } }
          }
        }
      }
    });

    for (const order of activeOrders) {
      // 4.1 Verificar productos fantasma (ML-MISSING)
      const hasGhost = order.items.some(i => i.product.sku.startsWith('ML-MISSING'));
      if (hasGhost && order.status !== 'RESOLUTION_REQUIRED') {
        await prisma.order.update({ where: { id: order.id }, data: { status: 'RESOLUTION_REQUIRED' } });
        continue;
      }

      // 4.2 Auditoría activa con ML para atrapar cancelaciones silenciosas
      // Solo refrescamos si la orden lleva más de 30 minutos sin actualizarse
      const timeSinceUpdate = Date.now() - order.updatedAt.getTime();
      if (order.mlOrderId && timeSinceUpdate > 30 * 60 * 1000) {
         try {
             await refreshOrder(order.id);
             // Forzamos la actualización de updatedAt para no volver a auditarla inmediatamente
             await prisma.order.update({ where: { id: order.id }, data: { updatedAt: new Date() } });
         } catch(e) {
             console.warn(`[Sync] Fallo auditoría de orden ${order.id}:`, e);
         }
      }
    }

    // 5. Limpiar ML-MISSING huérfanos (sin order items)
    try {
      const orphans = await prisma.product.findMany({
        where: {
          sku: { startsWith: 'ML-MISSING' },
          orderItems: { none: {} },
        },
        select: { id: true, sku: true }
      });

      if (orphans.length > 0) {
        await prisma.product.deleteMany({
          where: { id: { in: orphans.map(o => o.id) } }
        });
        console.log(`[Cleanup] 🧹 ${orphans.length} ML-MISSING huérfanos eliminados`);
      }
    } catch (cleanupErr) {
      console.error('[Cleanup] Error eliminando huérfanos:', cleanupErr);
    }

    const result: SyncResult = {
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      resolutionRequired: resolutionRequiredCount,
      totalProcessed: shipments.length
    };

    // 6. Registrar en SyncLog
    try {
      await prisma.syncLog.create({
        data: {
          status: 'SUCCESS',
          durationMs: Date.now() - syncStart,
          imported: result.imported,
          skipped: result.skipped,
          resolutionRequired: result.resolutionRequired,
          totalProcessed: result.totalProcessed,
          reusedBySku: totalReusedSku,
          reusedByAlias: totalReusedAlias,
          autoCreated: totalAutoCreated,
          missingCreated: totalMissingCreated,
          completedAt: new Date(),
        }
      });
    } catch (logErr) {
      console.error('[SyncLog] Error al registrar:', logErr);
    }

    return result;

  } catch (error: any) {
    // Si el sync falla, registrar el error en SyncLog
    const durationMs = Date.now() - syncStart;
    try {
      await prisma.syncLog.create({
        data: {
          status: 'ERROR',
          durationMs,
          completedAt: new Date(),
          error: error.message || 'Error desconocido',
        }
      });
    } catch (logErr) {
      console.error('[SyncLog] Error al registrar fallo:', logErr);
    }
    throw error;
  } finally {
    await RedisManager.unlockOrder('sync_lock', 'global');
  }
}
