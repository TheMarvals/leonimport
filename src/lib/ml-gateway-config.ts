export function getMlGatewayUrl(): string {
  return (process.env.ML_GATEWAY_URL || 'https://gateway.themarvals.com').replace(/\/+$/, '');
}

export function getMlGatewayApiKey(): string {
  const configured = (process.env.ML_GATEWAY_API_KEY || '').trim();
  // API_KEYS del gateway usa "app-id:secreto", pero X-API-Key recibe solo
  // el secreto. Aceptamos ambos formatos para evitar fallos de despliegue.
  const separator = configured.indexOf(':');
  return separator >= 0 ? configured.slice(separator + 1).trim() : configured;
}

export function getMlGatewayAppId(): string {
  return (process.env.ML_GATEWAY_APP_ID || 'leon-import-wms').trim();
}
