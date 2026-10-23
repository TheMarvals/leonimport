/** No persistir la máscara de privacidad de ML como si fuera un nombre. */
export function usableName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return !name || /(?:x{3,}|\*{3,})/i.test(name) || /^(null|undefined|comprador(?: ml)?|sin nombre|no disponible)$/i.test(name) ? null : name;
}

export function buyerNameUpdate(previous: unknown, incoming: unknown): string | undefined {
  const name = usableName(incoming);
  return name && !usableName(previous) ? name : undefined;
}

export async function fetchRecipientName(orderId: string | number | bigint, shippingId: string | number | undefined, headers: Record<string, string>, request: typeof fetch = fetch): Promise<string | null> {
  if (!shippingId) return null;
  try {
    const response = await request(`https://api.mercadolibre.com/orders/${orderId}/shipments?views=destination&list_all=true`, {
      headers: { ...headers, 'X-New-Domain': 'true', 'X-Api-Version': '2' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const shipment = (Array.isArray(data) ? data : [data]).find(s => String(s?.id) === String(shippingId) && (!s.type || s.type === 'forward'));
    return usableName(shipment?.receiver_address?.receiver_name || shipment?.destination?.receiver_name);
  } catch { return null; }
}
