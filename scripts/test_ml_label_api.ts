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

const GATEWAY_URL = process.env.ML_GATEWAY_URL || 'https://gateway.themarvals.com';
const GATEWAY_API_KEY = process.env.ML_GATEWAY_API_KEY || '';
const ML_ACCOUNT_ID = process.env.ML_ACCOUNT_ID || 'a7c9cdcf-4fbb-4e39-be78-a69bfea76d70';

async function getAccessToken(): Promise<string> {
  const tokenRes = await fetch(`${GATEWAY_URL}/api/accounts/${ML_ACCOUNT_ID}/token`, {
    headers: { 'x-api-key': GATEWAY_API_KEY }
  });
  const data = await tokenRes.json();
  return data.access_token;
}

async function testEndpoints() {
  const token = await getAccessToken();
  const headers = { 'Authorization': `Bearer ${token}` };
  
  const testIds = ['2000011983023750', '2000011988572718'];
  
  for (const id of testIds) {
    console.log(`\n=================== PROBANDO ID: ${id} ===================`);
    
    // 1. Intentar buscar envíos asociados al Order ID
    console.log(`\n1. Buscando envíos asociados en MercadoLibre (shipments/search?orders=${id})...`);
    const searchRes = await fetch(`https://api.mercadolibre.com/shipments/search?orders=${id}`, { headers });
    console.log('STATUS:', searchRes.status);
    const searchData = await searchRes.json();
    console.log('RESPONSE:', JSON.stringify(searchData, null, 2));

    // 2. Intentar pedir etiqueta usando el ID directamente como si fuera Shipment ID
    console.log(`\n2. Intentando obtener etiqueta directa (shipments/${id}/labels)...`);
    const labelDirectRes = await fetch(`https://api.mercadolibre.com/shipments/${id}/labels?response_type=pdf`, { headers });
    console.log('STATUS:', labelDirectRes.status);
    if (!labelDirectRes.ok) {
      console.log('RESPONSE:', await labelDirectRes.text());
    } else {
      console.log('¡Éxito! Se obtuvo un PDF de tamaño:', (await labelDirectRes.arrayBuffer()).byteLength);
    }
    
    // 3. Intentar a través de nuestro Gateway
    console.log(`\n3. Intentando a través de nuestro Gateway (${GATEWAY_URL}/api/shipments/external/${id}/labels)...`);
    const gatewayRes = await fetch(`${GATEWAY_URL}/api/shipments/external/${id}/labels`, {
      headers: { 'x-api-key': GATEWAY_API_KEY }
    });
    console.log('STATUS:', gatewayRes.status);
    console.log('RESPONSE:', await gatewayRes.text());
  }
}

testEndpoints().catch(console.error);
