import { getMlGatewayApiKey, getMlGatewayUrl } from './ml-gateway-config';

export async function fetchOfficialLabel(
  id: string,
  accountId: string,
  kind: 'shipment' | 'order',
  fetcher: typeof fetch = fetch,
): Promise<Buffer> {
  if (!/^\d{1,20}$/.test(id)) throw new Error('Identificador de Mercado Libre inválido');
  const authorization = await fetcher(`${getMlGatewayUrl()}/api/accounts/${encodeURIComponent(accountId)}/token`, {
    headers: { 'x-api-key': getMlGatewayApiKey() }, cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (!authorization.ok) throw new Error('No se pudo autorizar la impresión en Mercado Libre');
  const credentials = await authorization.json();
  if (!credentials.access_token || !credentials.ml_user_id) throw new Error('Autorización incompleta');
  const headers = { Authorization: `Bearer ${credentials.access_token}` };
  const get = (path: string) => fetcher(`https://api.mercadolibre.com${path}`, {
    headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  let shipmentId = id;
  if (kind === 'order') {
    const response = await get(`/orders/${id}`);
    if (!response.ok) throw new Error('No se pudo consultar la venta en Mercado Libre');
    const order = await response.json();
    if (String(order.seller?.id) !== String(credentials.ml_user_id)) throw new Error('La venta pertenece a otra cuenta');
    shipmentId = String(order.shipping?.id || '');
  }
  if (!/^\d{1,20}$/.test(shipmentId)) throw new Error('La venta no tiene un envío disponible');
  const detail = await get(`/shipments/${shipmentId}`);
  if (!detail.ok) throw new Error('No se pudo consultar el envío en Mercado Libre');
  const shipment = await detail.json();
  if (String(shipment.id) !== shipmentId || String(shipment.sender_id) !== String(credentials.ml_user_id)) {
    throw new Error('El envío no corresponde a esta cuenta');
  }
  const response = await get(`/shipment_labels?shipment_ids=${shipmentId}&response_type=pdf`);
  if (!response.ok) throw new Error('La etiqueta oficial todavía no está disponible en Mercado Libre');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Mercado Libre no devolvió una etiqueta PDF válida');
  return buffer;
}
