import { getHighResImageUrl } from './image-utils';
import RedisManager from './redis';

/**
 * Cliente directo a la API de MercadoLibre.
 * 
 * Obtiene un access_token válido desde el gateway (que maneja OAuth)
 * y luego consulta la API de ML directamente para obtener órdenes y envíos.
 * 
 * Flujo:
 *   1. GET /api/accounts/:id/token → gateway → access_token válido
 *   2. GET api.mercadolibre.com/orders/search → órdenes ready_to_ship
 *   3. GET api.mercadolibre.com/shipments/{id} → detalle de envío (opcional)
 * 
 * El token se cachea en memoria y se refresca automáticamente al expirar.
 */

const ML_API_BASE = 'https://api.mercadolibre.com';

// Configuración desde .env
const GATEWAY_URL = () => process.env.ML_GATEWAY_URL || 'https://gateway.themarvals.com';
const GATEWAY_API_KEY = () => process.env.ML_GATEWAY_API_KEY || '';
const ML_ACCOUNT_ID = () => process.env.ML_ACCOUNT_ID || 'a7c9cdcf-4fbb-4e39-be78-a69bfea76d70';
const ML_SELLER_ID = () => process.env.ML_SELLER_ID || '1513023287';

type TokenCache = {
  access_token: string;
  expires_at: number; // timestamp ms
};

let tokenCache: TokenCache | null = null;

/**
 * Obtiene un access_token válido desde el gateway.
 * Hace cache del token y lo refresca solo cuando expira.
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Usar cache si el token aún es válido (con 5 min de margen)
  if (tokenCache && tokenCache.expires_at > now + 5 * 60 * 1000) {
    return tokenCache.access_token;
  }

  const url = `${GATEWAY_URL()}/api/accounts/${ML_ACCOUNT_ID()}/token`;
  const res = await fetch(url, {
    headers: { 'x-api-key': GATEWAY_API_KEY() },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get ML token: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : now + 6 * 60 * 60 * 1000;

  tokenCache = {
    access_token: data.access_token,
    expires_at: expiresAt,
  };

  return data.access_token;
}

/**
 * Headers de autenticación para llamar a la API de ML.
 */
async function mlHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

/**
 * Tipos de datos que devuelve la API de MercadoLibre.
 */
export type MlOrderItem = {
  item: {
    id: string;
    title: string;
    seller_sku?: string;
  };
  quantity: number;
  variation_id?: number | null;
  unit_price: number;
  sale_fee: number;
};

export type MlOrder = {
  id: number;
  status: string;
  date_created: string;
  shipping?: {
    id: number;
    status: string;
    logistic_type: string;
    shipping_option?: {
      shipping_method_id?: number;
      name?: string;
    };
  };
  order_items: MlOrderItem[];
  buyer?: {
    id: number;
    nickname: string;
    first_name?: string;
    last_name?: string;
  };
  payments?: Array<{
    id: number;
    status: string;
    transaction_amount: number;
    currency_id: string;
  }>;
};

export type MlShipment = {
  id: number;
  status: string;
  logistic_type: string;
  shipping_mode: string;
  date_created: string;
  date_first_printed?: string;
  sender_id: number;
  receiver_id: number;
  tracking_number?: string;
  shipping_details?: {
    delivery_promise?: {
      display_text?: string;
    };
  };
  receiver_address?: {
    city?: { name: string };
    state?: { name: string };
    zip_code?: string;
    comment?: string;
  };
};

/** Cache de imágenes de items (por item ID) para no repetir llamadas a la API */
const itemImageCache = new Map<string, string | null>();

/** Cache de category_id por item ID */
const itemCategoryCache = new Map<string, string | null>();

/** Cache de paths de categoría ML (category_id → path string) */
const categoryPathCache = new Map<string, string>();

/** Tipo para respuesta de /categories/{id} de ML */
type MlCategoryPathResponse = {
  id: string;
  name: string;
  path_from_root: { id: string; name: string }[];
};

/**
 * Obtiene la URL de la imagen principal de un item desde la API de ML.
 * Usa cache en 3 niveles: L1 (memoria) → L2 (Redis) → API.
 * Las imágenes se cachean con TTL corto (1h) porque pueden cambiar.
 */
async function fetchItemImage(itemId: string, headers: Record<string, string>): Promise<string | null> {
  if (!itemId) return null;

  // L1: Cache en memoria (rápido)
  if (itemImageCache.has(itemId)) {
    return itemImageCache.get(itemId) ?? null;
  }

  // L2: Cache en Redis (persistente entre reinicios)
  const redisKey = `ml:img:${itemId}`;
  const redisVal = await RedisManager.cacheGet(redisKey, 'img');
  if (redisVal !== null) {
    // Promover a L1
    itemImageCache.set(itemId, redisVal === '' ? null : redisVal);
    return redisVal === '' ? null : redisVal;
  }

  // Miss en ambos niveles → llamar a la API
  try {
    const res = await fetch(`${ML_API_BASE}/items/${itemId}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      itemImageCache.set(itemId, null);
      const ttl = res.status === 404 ? 3600 : 30; // 1 hora para 404, 30s para errores temporales (como 429)
      await RedisManager.cacheSet(redisKey, '', ttl, 'img'); // '' = null en Redis
      return null;
    }

    const data = await res.json();
    let imageUrl: string | null = null;

    if (data.pictures && Array.isArray(data.pictures) && data.pictures.length > 0) {
      imageUrl = data.pictures[0].url || data.pictures[0].secure_url || null;
    }

    if (!imageUrl && data.thumbnail) {
      imageUrl = data.thumbnail;
    }

    imageUrl = getHighResImageUrl(imageUrl);
    itemImageCache.set(itemId, imageUrl);
    // Persistir en Redis
    await RedisManager.cacheSet(redisKey, imageUrl ?? '', 3600, 'img');

    // También cachear el category_id si viene en la respuesta
    if (data.category_id) {
      itemCategoryCache.set(itemId, data.category_id);
    }

    return imageUrl;
  } catch (err) {
    console.error(`Error fetching image for item ${itemId}:`, err);
    itemImageCache.set(itemId, null);
    await RedisManager.cacheSet(redisKey, '', 30, 'img'); // Solo 30s para errores de red/timeout
    return null;
  }
}

/**
 * Obtiene el category_id de un item desde la API de ML.
 * Usa cache en 3 niveles: L1 (memoria) → L2 (Redis) → API.
 */
async function fetchItemCategoryId(itemId: string, headers: Record<string, string>): Promise<string | null> {
  if (!itemId) return null;

  // L1: Cache en memoria (rápido)
  if (itemCategoryCache.has(itemId)) {
    return itemCategoryCache.get(itemId) ?? null;
  }

  // L2: Cache en Redis (persistente entre reinicios)
  const redisKey = `ml:catitem:${itemId}`;
  const redisVal = await RedisManager.cacheGet(redisKey, 'catitem');
  if (redisVal !== null) {
    // Promover a L1
    itemCategoryCache.set(itemId, redisVal === '' ? null : redisVal);
    return redisVal === '' ? null : redisVal;
  }

  // Miss en ambos niveles → llamar a la API
  try {
    const res = await fetch(`${ML_API_BASE}/items/${itemId}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      itemCategoryCache.set(itemId, null);
      await RedisManager.cacheSet(redisKey, '', 604800, 'catitem'); // '' = null en Redis
      return null;
    }

    const data = await res.json();
    const categoryId = data.category_id || null;
    itemCategoryCache.set(itemId, categoryId);
    // Persistir en Redis
    await RedisManager.cacheSet(redisKey, categoryId ?? '', 604800, 'catitem');
    return categoryId;
  } catch (err) {
    console.error(`Error fetching category for item ${itemId}:`, err);
    itemCategoryCache.set(itemId, null);
    await RedisManager.cacheSet(redisKey, '', 604800, 'catitem');
    return null;
  }
}

/**
 * Obtiene el path de categoría de ML (ej: "Electrónica > Cables HDMI > Cables").
 * Usa cache en 3 niveles: L1 (memoria) → L2 (Redis) → API.
 */
async function fetchCategoryPath(categoryId: string, headers: Record<string, string>): Promise<string | null> {
  if (!categoryId) return null;

  // L1: Cache en memoria
  if (categoryPathCache.has(categoryId)) {
    return categoryPathCache.get(categoryId) ?? null;
  }

  // L2: Cache en Redis
  const redisKey = `ml:catpath:${categoryId}`;
  const redisVal = await RedisManager.cacheGet(redisKey, 'catpath');
  if (redisVal !== null) {
    // Promover a L1
    categoryPathCache.set(categoryId, redisVal);
    return redisVal === '' ? null : redisVal;
  }

  // Miss en ambos niveles → llamar a la API
  try {
    const res = await fetch(`${ML_API_BASE}/categories/${categoryId}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      categoryPathCache.set(categoryId, '');
      await RedisManager.cacheSet(redisKey, '', 604800, 'catpath');
      return null;
    }

    const data: MlCategoryPathResponse = await res.json();
    // Construir el path completo: "Deportes y Fitness > Fitness > Pesas y Mancuernas"
    const path = (data.path_from_root || [])
      .map(c => c.name)
      .join(' > ');

    categoryPathCache.set(categoryId, path);
    // Persistir en Redis
    await RedisManager.cacheSet(redisKey, path, 604800, 'catpath');
    return path;
  } catch (err) {
    console.error(`Error fetching category path for ${categoryId}:`, err);
    categoryPathCache.set(categoryId, '');
    await RedisManager.cacheSet(redisKey, '', 604800, 'catpath');
    return null;
  }
}

/** Ejecuta N funciones async con un límite de concurrencia */
async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number = 5
): Promise<void> {
  const queue = [...items];
  const results: Promise<void>[] = [];

  for (let i = 0; i < concurrency && queue.length > 0; i++) {
    results.push((async function worker() {
      while (queue.length > 0) {
        const item = queue.shift()!;
        await fn(item);
      }
    })());
  }

  await Promise.all(results);
}

/**
 * Respuesta unificada de órdenes lista para que syncOrders las procese.
 * Coincide con el formato que antes devolvía el gateway.
 */
export type MlShipmentOrder = {
  ml_shipment_id: string;
  ml_shipment_external_id: number;
  ml_shipping_id: string | null;
  ml_order_id: number;
  items_json: string; // JSON string de items
  item_sku: string;
  item_title: string;
  item_quantity: number;
  item_price: number;
  item_image: string | null;
  is_flex: boolean;
  logistic_type: string;
  shipping_details: object | null;
  buyer_name: string | null;
  shipping_status: string | null;
  order_status: string | null;
};

/**
 * Obtiene órdenes listas para despachar (ready_to_ship) desde ML.
 * 
 * @param limit Máximo de órdenes a obtener (default 50)
 * @returns Array de órdenes en formato unificado para syncOrders
 */
export async function fetchPendingOrders(limit: number = 50, offset: number = 0): Promise<MlShipmentOrder[]> {
  const headers = await mlHeaders();
  const sellerId = ML_SELLER_ID();

  // El cache de imágenes ahora usa Redis con TTL de 1h (las imágenes pueden cambiar).
  // El cache de categorías ML no necesita TTL porque ML no cambia sus categorías.
  // Al reiniciar el proceso, se recuperan de Redis.

  // Buscar órdenes más recientes primero (sort=date_desc) para captar órdenes nuevas en cada sync
  const searchUrl = `${ML_API_BASE}/orders/search?seller=${sellerId}&sort=date_desc&limit=${limit}&offset=${offset}`;
  
  const searchRes = await fetch(searchUrl, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!searchRes.ok) {
    const err = await searchRes.text();
    console.error('ML Orders search error:', err);
    throw new Error(`ML API error: ${searchRes.status} - ${err}`);
  }

  const searchData = await searchRes.json();
  const orders: MlOrder[] = searchData.results || [];

  if (orders.length === 0) {
    return [];
  }

  // Recolectar todos los item IDs únicos para buscar imágenes y categorías en batch
  const allItemIds = new Set<string>();
  for (const order of orders) {
    for (const item of (order.order_items || [])) {
      if (item.item?.id) allItemIds.add(item.item.id);
    }
  }

  // Precargar imágenes de todos los items en paralelo (con límite de concurrencia)
  const itemIds = [...allItemIds];
  await runWithConcurrency(itemIds, id => fetchItemImage(id, headers).then(() => {}), 5);

  // Precargar category_ids para items que no se cachearon durante fetchItemImage
  await runWithConcurrency(itemIds, id => fetchItemCategoryId(id, headers).then(() => {}), 5);

  // Recolectar category_ids únicos y precargar sus paths
  const uniqueCategoryIds = new Set<string>();
  for (const itemId of itemIds) {
    const catId = itemCategoryCache.get(itemId);
    if (catId) uniqueCategoryIds.add(catId);
  }
  await runWithConcurrency([...uniqueCategoryIds], catId => fetchCategoryPath(catId, headers).then(() => {}), 5);

  // Para cada orden, obtener detalles de items (seller_sku) y shipping
  const results: MlShipmentOrder[] = [];

  for (const order of orders) {
    // Obtener detalle completo de la orden (incluye seller_sku)
    const orderDetailRes = await fetch(`${ML_API_BASE}/orders/${order.id}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    let orderDetail: MlOrder = order;
    if (orderDetailRes.ok) {
      orderDetail = await orderDetailRes.json();
    }

    // Obtener detalle del envío
    let shipment: MlShipment | null = null;
    const shippingId = order.shipping?.id || orderDetail.shipping?.id;
    if (shippingId) {
      const shipRes = await fetch(`${ML_API_BASE}/shipments/${shippingId}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (shipRes.ok) {
        shipment = await shipRes.json();
      }
    }

    // Mapear items a items_json con imágenes y categoría ML desde el cache
    const items = orderDetail.order_items || [];
    const mappedItems = items.map(item => {
      const mlItem = item.item || { id: '', title: '', seller_sku: undefined };
      const imageUrl = mlItem.id ? (itemImageCache.get(mlItem.id) ?? null) : null;
      // Obtener category_path desde el cache de categorías
      const categoryId = mlItem.id ? (itemCategoryCache.get(mlItem.id) ?? null) : null;
      const categoryPath = categoryId ? (categoryPathCache.get(categoryId) ?? null) : null;
      return {
        listingId: mlItem.id,
        variationId: item.variation_id ? String(item.variation_id) : '',
        sku: mlItem.seller_sku || '',
        title: mlItem.title,
        quantity: item.quantity || 0,
        price: item.unit_price || 0,
        image: imageUrl,
        categoryPath, // Ej: "Deportes y Fitness > Fitness > Pesas y Mancuernas"
      };
    });

    // Item principal (primer item)
    const firstItem = mappedItems[0] || { sku: '', title: '', quantity: 0, price: 0, image: null };
    const logisticType = shipment?.logistic_type || order.shipping?.logistic_type || '';
    const isFlex = logisticType === 'self_service';

    let shippingDetails: object | null = null;
    if (shipment?.shipping_details) {
      shippingDetails = shipment.shipping_details;
    } else if (orderDetail.shipping) {
      shippingDetails = { logistic_type: logisticType };
    }

    // Nombre del comprador
    const buyerName = order.buyer
      ? [order.buyer.first_name, order.buyer.last_name].filter(Boolean).join(' ') || order.buyer.nickname
      : null;

    results.push({
      ml_shipment_id: `ml-order-${order.id}`,
      ml_shipment_external_id: shipment?.id ? Number(shipment.id) : order.id, // Shipping ID como clave del paquete físico
      ml_shipping_id: shipment?.id ? String(shipment.id) : null,
      ml_order_id: order.id,
      items_json: JSON.stringify(mappedItems),
      item_sku: firstItem.sku,
      item_title: firstItem.title,
      item_quantity: firstItem.quantity,
      item_price: firstItem.price,
      item_image: firstItem.image,
      is_flex: isFlex,
      logistic_type: logisticType,
      shipping_details: shippingDetails,
      buyer_name: buyerName,
      shipping_status: shipment?.status || order.shipping?.status || null,
      order_status: orderDetail.status || null,
    });
  }

  // --- AGRUPAR órdenes que comparten el mismo envío ---
  // Un comprador puede hacer varias compras que se despachan en el mismo paquete.
  // El picker necesita ver TODOS los items juntos para armar la caja completa.
  const grouped = new Map<string, MlShipmentOrder>();
  for (const r of results) {
    const groupKey = r.ml_shipping_id || String(r.ml_shipment_external_id); // Agrupar por shipping ID; sin shipping → cada orden es independiente

    const existing = grouped.get(groupKey);
    if (!existing) {
      grouped.set(groupKey, r);
    } else {
      // Fusionar items de la orden adicional en la orden existente del mismo envío
      const existingItems: any[] = JSON.parse(existing.items_json);
      const newItems: any[] = JSON.parse(r.items_json);
      existingItems.push(...newItems);
      existing.items_json = JSON.stringify(existingItems);

      // Actualizar conteo total
      existing.item_quantity = existingItems.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0);

      console.log(`[ML] 📦 Agrupadas órdenes ML #${existing.ml_order_id} + #${r.ml_order_id} en envío ${groupKey} (${existingItems.length} items)`);
    }
  }

  return [...grouped.values()];
}

/**
 * Obtiene una orden específica de MercadoLibre por su ID de orden.
 * Útil para refrescar manualmente una orden sin necesidad de sync completo.
 * 
 * @param mlOrderId ID numérico de la orden en ML (ej. 123456789)
 * @returns Los datos de la orden en formato MlShipmentOrder, o null si no se encuentra
 */
export async function fetchSingleOrder(mlOrderId: number | bigint): Promise<MlShipmentOrder | null> {
  const headers = await mlHeaders();

  // Obtener detalle completo de la orden
  const orderDetailRes = await fetch(`${ML_API_BASE}/orders/${mlOrderId}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (!orderDetailRes.ok) {
    if (orderDetailRes.status === 404) return null;
    const err = await orderDetailRes.text();
    throw new Error(`ML API error fetching order ${mlOrderId}: ${orderDetailRes.status} - ${err}`);
  }

  const orderDetail: MlOrder = await orderDetailRes.json();

  // Obtener imágenes y categorías para cada item
  const allItemIds = (orderDetail.order_items || [])
    .map(item => item.item?.id)
    .filter((id): id is string => !!id);

  for (const itemId of allItemIds) {
    await fetchItemImage(itemId, headers).then(() => {});
    await fetchItemCategoryId(itemId, headers).then(() => {});
  }

  // Precargar category paths
  const uniqueCategoryIds = [...new Set(allItemIds
    .map(id => itemCategoryCache.get(id))
    .filter((id): id is string => !!id))];
  for (const catId of uniqueCategoryIds) {
    await fetchCategoryPath(catId, headers).then(() => {});
  }

  // Obtener detalle del envío
  let shipment: MlShipment | null = null;
  const shippingId = orderDetail.shipping?.id;
  if (shippingId) {
    const shipRes = await fetch(`${ML_API_BASE}/shipments/${shippingId}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (shipRes.ok) {
      shipment = await shipRes.json();
    }
  }

  // Mapear items
  const items = orderDetail.order_items || [];
  const mappedItems = items.map(item => {
    const mlItem = item.item || { id: '', title: '', seller_sku: undefined };
    const imageUrl = mlItem.id ? (itemImageCache.get(mlItem.id) ?? null) : null;
    const categoryId = mlItem.id ? (itemCategoryCache.get(mlItem.id) ?? null) : null;
    const categoryPath = categoryId ? (categoryPathCache.get(categoryId) ?? null) : null;
    return {
      listingId: mlItem.id,
      variationId: item.variation_id ? String(item.variation_id) : '',
      sku: mlItem.seller_sku || '',
      title: mlItem.title,
      quantity: item.quantity || 0,
      price: item.unit_price || 0,
      image: imageUrl,
      categoryPath,
    };
  });

  const firstItem = mappedItems[0] || { sku: '', title: '', quantity: 0, price: 0, image: null };
  const logisticType = shipment?.logistic_type || orderDetail.shipping?.logistic_type || '';
  const isFlex = logisticType === 'self_service';

  let shippingDetails: object | null = null;
  if (shipment?.shipping_details) {
    shippingDetails = shipment.shipping_details;
  } else if (orderDetail.shipping) {
    shippingDetails = { logistic_type: logisticType };
  }

  const buyerName = orderDetail.buyer
    ? [orderDetail.buyer.first_name, orderDetail.buyer.last_name].filter(Boolean).join(' ') || orderDetail.buyer.nickname
    : null;

  return {
    ml_shipment_id: `ml-order-${orderDetail.id}`,
    ml_shipment_external_id: orderDetail.id, // Siempre usar order ID (único) — el shipping ID puede ser compartido
    ml_shipping_id: shipment?.id ? String(shipment.id) : null,
    ml_order_id: orderDetail.id,
    items_json: JSON.stringify(mappedItems),
    item_sku: firstItem.sku,
    item_title: firstItem.title,
    item_quantity: firstItem.quantity,
    item_price: firstItem.price,
    item_image: firstItem.image,
    is_flex: isFlex,
    logistic_type: logisticType,
    shipping_details: shippingDetails,
    buyer_name: buyerName,
    shipping_status: shipment?.status || orderDetail.shipping?.status || null,
    order_status: orderDetail.status || null,
  };
}

/**
 * Limpia el cache de token (forzar refresco en la próxima llamada).
 */
export function clearTokenCache(): void {
  tokenCache = null;
}
