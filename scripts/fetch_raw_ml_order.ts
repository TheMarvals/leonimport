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

async function main() {
  const token = await getAccessToken();
  const headers = { 'Authorization': `Bearer ${token}` };
  
  const orderIds = ['2000011983023750', '2000011988572718'];
  
  for (const orderId of orderIds) {
    console.log(`\n=================== ORDER ${orderId} ===================`);
    const orderRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
    const orderData = await orderRes.json();
    console.log('ORDER STATUS:', orderData.status);
    console.log('ORDER STATUS DETAIL:', orderData.status_detail);
    console.log('SHIPPING:', JSON.stringify(orderData.shipping, null, 2));
    console.log('TAGS:', orderData.tags);
    console.log('FEEDBACK:', orderData.feedback);
  }
}

main().catch(console.error);
