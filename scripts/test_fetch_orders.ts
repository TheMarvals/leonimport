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

import { fetchPendingOrders } from '../src/lib/mercadolibre';

async function main() {
  console.log('Fetching orders...');
  const orders = await fetchPendingOrders(5);
  console.log('Fetched orders count:', orders.length);
  console.log('Sample order:', JSON.stringify(orders[0], null, 2));
}

main().catch(console.error);
