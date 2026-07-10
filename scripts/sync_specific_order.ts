import * as fs from 'fs';
import * as path from 'path';

// Load env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join('=').replace(/^["']|["']$/g, '');
    }
  });
}

import { fetchSingleOrder } from '../src/lib/mercadolibre';
import { prisma } from '../src/lib/prisma';
import { extractFamilyBase, generateSku } from '../src/lib/sku-generator';

async function resolveItems(
  rawItems: any[],
  mlIdStr: string
): Promise<{ itemsToCreate: any[] }> {
  const itemsToCreate: any[] = [];

  for (const rawItem of rawItems) {
    const itemSku = rawItem.sku;
    const itemTitle = rawItem.title;
    const itemLabel = itemTitle || itemSku || '(sin nombre)';

    let product = itemSku
      ? await prisma.product.findUnique({ where: { sku: itemSku } })
      : null;

    if (!product) {
      const orConditions: any[] = [];
      if (itemSku) orConditions.push({ mlAliases: { has: itemSku } });
      if (itemTitle) {
        orConditions.push({ mlAliases: { has: itemTitle } });
        orConditions.push({ name: { equals: itemTitle, mode: 'insensitive' } });
      }
      if (orConditions.length > 0) {
        product = await prisma.product.findFirst({
          where: { OR: orConditions, NOT: { sku: { startsWith: 'ML-MISSING' } } }
        });
      }
    }

    if (!product) {
      const itemTitleSafe = itemTitle || rawItem.sku || '';
      const familyBase = itemTitleSafe ? extractFamilyBase(itemTitleSafe, rawItem.categoryPath || undefined) : 9000;

      if (familyBase !== 9000) {
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
            categoryFamily: familyBase,
            mlCategoryPath,
          }
        });
        console.log(`[Resolve] 🆕 CREADO ${newSku} ← ${itemLabel} (familia ${familyBase})`);
      } else {
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
            categoryFamily: null,
          }
        });
        console.log(`[Resolve] ❓ ML-MISSING ${missingSku} ← ${itemLabel}`);
      }
    } else {
      console.log(`[Resolve] ♻️ REUSADO (${product.sku}) ← ${itemLabel}`);
    }

    itemsToCreate.push({
      productId: product.id,
      quantityTotal: rawItem.quantity,
      mlImageUrl: rawItem.image || null
    });
  }

  return { itemsToCreate };
}

async function main() {
  const orderIdStr = '2000016985718896';
  console.log(`Fetching specific order ${orderIdStr}...`);
  const shipment = await fetchSingleOrder(BigInt(orderIdStr));

  if (!shipment) {
    console.log(`❌ Order ${orderIdStr} not found on MercadoLibre API.`);
    return;
  }

  console.log('Order found on ML:');
  console.log(`Shipping ID: ${shipment.ml_shipping_id}`);
  console.log(`Logistic type: ${shipment.logistic_type}`);
  console.log(`Items:`, shipment.items_json);

  const mlIdStr = String(shipment.ml_shipment_external_id);
  const rawItems = JSON.parse(shipment.items_json);

  // Check if already exists in DB
  const existingOrder = await prisma.order.findUnique({
    where: { mlId: mlIdStr }
  });

  if (existingOrder) {
    console.log(`Order ${mlIdStr} already exists in DB.`);
    return;
  }

  const { itemsToCreate } = await resolveItems(rawItems, mlIdStr);

  const isFlex = shipment.is_flex;
  const shippingDetails = shipment.shipping_details;
  
  // Generar mensaje amigable (replicando lógica de formatPriorityMessage de sync-orders.ts)
  let priorityMessage: string | null = null;

  const hour = parseInt(new Date().toLocaleString('es-CL', {
    hour: '2-digit',
    hour12: false,
    timeZone: 'America/Santiago'
  }));
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    weekday: 'long'
  }).format(new Date());
  const dayMap: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6
  };
  const dayOfWeek = dayMap[dayName] ?? 0;

  if (isFlex) {
    // Flex: conductores trabajan Lun-Sáb. Domingo NO. Cutoff 12 PM.
    if (dayOfWeek === 0) {
      priorityMessage = 'Tienes que darle el paquete a tu conductor el lunes.';
    } else if (hour < 12) {
      priorityMessage = 'Tienes que darle el paquete a tu conductor hoy.';
    } else if (dayOfWeek === 6) {
      // Sábado después de 12 PM → lunes (domingo no es hábil)
      priorityMessage = 'Tienes que darle el paquete a tu conductor el lunes.';
    } else {
      // Lun-Vie después de 12 PM → mañana (sábado es hábil)
      priorityMessage = 'Tienes que darle el paquete a tu conductor mañana.';
    }
  } else if (shipment.logistic_type === 'cross_docking' || shipment.logistic_type === 'xd_drop_off') {
    // Colecta: camión Lun-Vie. Sáb y Dom NO. Cutoff 4 PM.
    const isColectaWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isFridayAfterCutoff = dayOfWeek === 5 && hour >= 16;
    if (isColectaWeekend || isFridayAfterCutoff) {
      priorityMessage = 'Tienes que darle el paquete a la colecta que pasará el lunes entre las 16:00 y 18:00 hs para no demorarte.';
    } else if (hour >= 16) {
      priorityMessage = 'Tienes que darle el paquete a la colecta que pasará mañana entre las 16:00 y 18:00 hs para no demorarte.';
    } else {
      priorityMessage = 'Tienes que darle el paquete a la colecta lo antes posible para no demorarte.';
    }
  } else {
    // Otros tipos logísticos
    const limitDate = (shippingDetails as any)?.limit_date ? new Date((shippingDetails as any).limit_date) : null;
    if (limitDate) {
      const hora = limitDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
      const fecha = limitDate.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
      priorityMessage = `Tienes que entregar el paquete antes de las ${hora} del ${fecha}.`;
    } else {
      priorityMessage = shipment.logistic_type?.toUpperCase() || null;
    }
  }

  const newOrder = await prisma.order.create({
    data: {
      mlId: mlIdStr,
      mlOrderId: shipment.ml_order_id,
      shippingId: shipment.ml_shipping_id,
      status: 'PENDING',
      isFlex,
      priorityMessage,
      buyerName: shipment.buyer_name
    }
  });

  for (const item of itemsToCreate) {
    await prisma.orderItem.create({
      data: {
        orderId: newOrder.id,
        productId: item.productId,
        quantityTotal: item.quantityTotal,
        mlImageUrl: item.mlImageUrl
      }
    });
  }

  console.log(`🎉 Order imported successfully! ID: ${newOrder.id}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
