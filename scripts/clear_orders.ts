/**
 * Script para limpiar todas las transacciones, órdenes y logs de la base de datos
 * manteniendo el catálogo de productos (inventario), ubicaciones, proveedores y usuarios.
 *
 * Uso: npx tsx scripts/clear_orders.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Iniciando Limpieza de Base de Datos (Órdenes e Historial) ===\n');

  try {
    // 1. Eliminar OrderItems (detalle de ítems en las órdenes)
    console.log('🗑️ Eliminando detalle de ítems de órdenes (OrderItem)...');
    const orderItems = await prisma.orderItem.deleteMany({});
    console.log(`   Eliminados ${orderItems.count} registros.`);

    // 2. Eliminar AuditLogs (historial de auditoría)
    console.log('🗑️ Eliminando logs de auditoría (AuditLog)...');
    const auditLogs = await prisma.auditLog.deleteMany({});
    console.log(`   Eliminados ${auditLogs.count} registros.`);

    // 3. Eliminar SyncConflicts (conflictos de sincronización)
    console.log('🗑️ Eliminando conflictos de sincronización (SyncConflict)...');
    const syncConflicts = await prisma.syncConflict.deleteMany({});
    console.log(`   Eliminados ${syncConflicts.count} registros.`);

    // 4. Eliminar EmergencyLocks (bloqueos temporales)
    console.log('🗑️ Eliminando bloqueos de seguridad (EmergencyLock)...');
    const emergencyLocks = await prisma.emergencyLock.deleteMany({});
    console.log(`   Eliminados ${emergencyLocks.count} registros.`);

    // 5. Eliminar SyncLogs (historial de sincronizaciones)
    console.log('🗑️ Eliminando logs de sincronización (SyncLog)...');
    const syncLogs = await prisma.syncLog.deleteMany({});
    console.log(`   Eliminados ${syncLogs.count} registros.`);

    // 6. Eliminar Orders (órdenes de MercadoLibre)
    console.log('🗑️ Eliminando órdenes (Order)...');
    const orders = await prisma.order.deleteMany({});
    console.log(`   Eliminados ${orders.count} registros.`);

    console.log('\n✅ Limpieza completada con éxito. El inventario, usuarios, ubicaciones y proveedores permanecen intactos.');

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
