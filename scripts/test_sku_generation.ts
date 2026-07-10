import * as fs from 'fs';
import * as path from 'path';

// Load env before other imports that use prisma/env
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

import { prisma } from '../src/lib/prisma';

async function main() {
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { mlId: '47323477642' },
        { shippingId: '47323477642' }
      ]
    },
    include: {
      items: {
        include: {
          product: true
        }
      }
    }
  });
  console.log('Order 47323477642 details in DB:', JSON.stringify(order, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
