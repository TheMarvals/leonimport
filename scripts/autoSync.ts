import * as fs from 'fs';
import * as path from 'path';
import { syncOrders } from '../src/lib/sync-orders';

// Cargar .env manualmente (tsx no carga .env automáticamente)
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return; // saltar comentarios y líneas vacías
    const [key, ...rest] = trimmed.split('=');
    if (key && rest.length > 0) {
      process.env[key.trim()] = rest.join('=').replace(/^["']|["']$/g, '');
    }
  });
}

async function sync() {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] 🔄 Iniciando Sincronización Gateway -> WMS...`);
  try {
    const result = await syncOrders(30);
    console.log(
      `[${timestamp}] ✅ Sync exitosa: ${result.imported} importadas, ` +
      `${result.resolutionRequired} pendientes de vincular, ` +
      `${result.skipped} saltadas.`
    );
  } catch (err: any) {
    console.error(`[${timestamp}] ❌ Error de sync: ${err.message}`);
  }
}

// Ejecutar cada 2 minutos
const INTERVAL = 120000;
console.log(`🚀 Worker de Auto-Sincronización iniciado (Intervalo: ${INTERVAL / 1000}s)`);
setInterval(sync, INTERVAL);
sync();
