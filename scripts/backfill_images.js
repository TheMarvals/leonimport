const fs = require('fs');
const path = require('path');

// Cargar .env manualmente
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
  });
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Configuración del Gateway (tomada de .env)
const GATEWAY_URL = process.env.ML_GATEWAY_URL || 'https://gateway.themarvals.com';
const GATEWAY_API_KEY = process.env.ML_GATEWAY_API_KEY || 'le-ml-gateway-dev-key-2026';

async function backfillWmsImages() {
  console.log('--- Iniciando Backfill de Imágenes en WMS (desde Gateway) ---');

  try {
    // 1. Disparar reparación en el Gateway
    console.log('Solicitando al Gateway que repare imágenes faltantes (limit: 10)...');
    const repairRes = await fetch(`${GATEWAY_URL}/api/shipments/repair-images`, {
      method: 'POST',
      headers: { 
        'x-api-key': GATEWAY_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ limit: 10 })
    });

    if (repairRes.ok) {
      const repairData = await repairRes.json();
      console.log(`Gateway procesó: ${repairData.found} y reparó: ${repairData.repaired} imágenes.`);
      if (repairData.errors && repairData.errors.length > 0) {
        console.log('Detalle de algunos errores:', JSON.stringify(repairData.errors, null, 2));
      }
    } else {
      const errorText = await repairRes.text();
      console.error(`❌ Falló la solicitud de reparación (${repairRes.status}): ${errorText}`);
    }

    // 2. Obtener historial del Gateway (incluye los ya importados)
    console.log('Obteniendo historial actualizado del Gateway...');
    const response = await fetch(`${GATEWAY_URL}/api/shipments/history/all?limit=200`, {
      headers: { 'x-api-key': GATEWAY_API_KEY }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error Gateway (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const shipments = data.shipments;
    console.log(`Se obtuvieron ${shipments.length} envíos del historial del Gateway.`);

    let updatedCount = 0;

    for (const shipment of shipments) {
      if (!shipment.item_image) continue;

      // 2. Buscar si este envío existe en el WMS y NO tiene imagen
      const mlOrderId = String(shipment.ml_order_id);

      const wmsOrder = await prisma.order.findUnique({
        where: { mlId: mlOrderId },
        include: { items: true }
      });

      if (wmsOrder) {
        for (const item of wmsOrder.items) {
          if (!item.mlImageUrl) {
            await prisma.orderItem.update({
              where: { id: item.id },
              data: { mlImageUrl: shipment.item_image }
            });
            
            // También actualizar la imagen maestra del producto si no tiene una
            const product = await prisma.product.findUnique({ where: { id: item.productId } });
            if (product && !product.imageUrl) {
               await prisma.product.update({
                 where: { id: product.id },
                 data: { imageUrl: shipment.item_image }
               });
            }

            console.log(`✅ Foto actualizada para Orden ${mlOrderId} (SKU: ${product?.sku}): ${shipment.item_image}`);
            updatedCount++;
          }
        }
      }
    }

    console.log(`\nProceso completado. Se actualizaron ${updatedCount} imágenes en el WMS.`);

  } catch (error) {
    console.error('❌ Error consultando el Gateway:', error.message);
  }
}

backfillWmsImages()
  .finally(() => prisma.$disconnect());
