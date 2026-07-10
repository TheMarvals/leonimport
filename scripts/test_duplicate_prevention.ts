/**
 * Test de integración: Verifica que el sistema previene OrderItems duplicados.
 *
 * Escenarios:
 * 1. La constraint @@unique([orderId, productId]) rechaza duplicados en DB
 * 2. upsert con mismo orderId+productId no crea duplicados (mergea cantidades)
 * 3. merge de itemsToCreate por productId (simula el fix en syncOrders)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

async function main() {
  console.log('🧪 TEST: Prevención de OrderItems duplicados\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ─── Setup: crear datos de prueba ───
  console.log('📦 Creando datos de prueba...');
  
  const productA = await prisma.product.create({
    data: {
      sku: `TEST-DUP-A-${Date.now()}`,
      name: 'Test Product A (dup prevention)',
      salePrice: 1000,
      currency: 'CLP',
    },
  });
  
  const productB = await prisma.product.create({
    data: {
      sku: `TEST-DUP-B-${Date.now()}`,
      name: 'Test Product B (dup prevention)',
      salePrice: 2000,
      currency: 'CLP',
    },
  });

  const order = await prisma.order.create({
    data: {
      mlId: `TEST-ORDER-${Date.now()}`,
      status: 'PENDING',
      buyerName: 'Integration Test',
    },
  });

  console.log(`  Producto A: ${productA.sku} (${productA.id.slice(0,8)}...)`);
  console.log(`  Producto B: ${productB.sku} (${productB.id.slice(0,8)}...)`);
  console.log(`  Orden: mlId=${order.mlId}\n`);

  try {
    // ─── Test 1: @@unique constraint ───
    console.log('📋 Test 1: La constraint UNIQUE rechaza duplicados');
    console.log('  (Intentar crear 2 OrderItems con mismo orderId+productId)');
    
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: productA.id,
        quantityTotal: 5,
        quantityPicked: 0,
      },
    });

    try {
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: productA.id, // mismo productId → debe fallar
          quantityTotal: 3,
          quantityPicked: 0,
        },
      });
      assert('Constraint: P2002 no se lanzó (duplicado creado!)', false);
    } catch (err: any) {
      assert(`Constraint: P2002 lanzado correctamente (code=${err.code})`, err.code === 'P2002');
    }

    // ─── Test 2: upsert no crea duplicados ───
    console.log('\n📋 Test 2: upsert con mismo orderId+productId');
    console.log('  (Simula el fix: upsert en vez de create)');

    const upserted1 = await prisma.orderItem.upsert({
      where: {
        orderId_productId: {
          orderId: order.id,
          productId: productB.id,
        },
      },
      create: {
        orderId: order.id,
        productId: productB.id,
        quantityTotal: 2,
        quantityPicked: 0,
      },
      update: {
        quantityTotal: 2,
      },
    });
    assert('Upsert 1: item creado correctamente', upserted1.quantityTotal === 2);

    // Segundo upsert con mismo orderId+productId (simula 2 items ML que resuelven al mismo producto)
    const upserted2 = await prisma.orderItem.upsert({
      where: {
        orderId_productId: {
          orderId: order.id,
          productId: productB.id,
        },
      },
      create: {
        orderId: order.id,
        productId: productB.id,
        quantityTotal: 3, // Esta sería la quantity del segundo item
        quantityPicked: 0,
      },
      update: {
        quantityTotal: 3, // upsert actualiza al último valor
      },
    });
    assert('Upsert 2: mismo item actualizado (no duplicado)', upserted2.quantityTotal === 3);
    
    // Verificar que solo hay 1 OrderItem para productB
    const countB = await prisma.orderItem.count({
      where: { orderId: order.id, productId: productB.id },
    });
    assert('Solo 1 OrderItem para productB (sin duplicados)', countB === 1);

    // ─── Test 3: Merge de itemsToCreate por productId ───
    console.log('\n📋 Test 3: Merge de itemsToCreate por productId');
    console.log('  (Simula el merge en syncOrders: 2 items mismo producto → 1 con suma)');

    // Simular itemsToCreate con duplicados
    const rawItems = [
      { productId: productA.id, quantityTotal: 5 },
      { productId: productA.id, quantityTotal: 3 }, // mismo productId → debe mergearse
      { productId: productB.id, quantityTotal: 2 },
    ];

    // Merge igual que en syncOrders
    const mergedMap = new Map<string, typeof rawItems[0]>();
    for (const item of rawItems) {
      const existing = mergedMap.get(item.productId);
      if (existing) {
        existing.quantityTotal += item.quantityTotal;
      } else {
        mergedMap.set(item.productId, { ...item });
      }
    }

    const mergedItems = Array.from(mergedMap.values());
    
    assert('Merge: 3 raw items → 2 merged (productA tiene 2 duplicados)', mergedItems.length === 2);
    
    const mergedA = mergedItems.find(i => i.productId === productA.id);
    assert('Merge: productA quantity = 5+3 = 8', mergedA?.quantityTotal === 8);
    
    const mergedB = mergedItems.find(i => i.productId === productB.id);
    assert('Merge: productB quantity = 2', mergedB?.quantityTotal === 2);

    // ─── Test 4: Upsert secuencial con merged items ───
    console.log('\n📋 Test 4: Upsert secuencial con items mergeados');
    console.log('  (Flujo completo: crea orden, upsert items mergeados)');

    const order2 = await prisma.order.create({
      data: {
        mlId: `TEST-ORDER2-${Date.now()}`,
        status: 'PENDING',
      },
    });

    for (const item of mergedItems) {
      await prisma.orderItem.upsert({
        where: {
          orderId_productId: {
            orderId: order2.id,
            productId: item.productId,
          },
        },
        create: {
          orderId: order2.id,
          productId: item.productId,
          quantityTotal: item.quantityTotal,
          quantityPicked: 0,
        },
        update: {
          quantityTotal: item.quantityTotal,
        },
      });
    }

    const totalItems = await prisma.orderItem.count({
      where: { orderId: order2.id },
    });
    assert('Orden2: tiene exactamente 2 items (no 3)', totalItems === 2);

    const order2A = await prisma.orderItem.findFirst({
      where: { orderId: order2.id, productId: productA.id },
    });
    assert('Orden2: productA qty = 8 (sumado)', order2A?.quantityTotal === 8);

    const order2B = await prisma.orderItem.findFirst({
      where: { orderId: order2.id, productId: productB.id },
    });
    assert('Orden2: productB qty = 2', order2B?.quantityTotal === 2);

    // ─── Resumen ───
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n📊 RESULTADOS: ${passed} pasaron, ${failed} fallaron de ${passed + failed} tests\n`);

    if (failed > 0) {
      process.exit(1);
    }

  } finally {
    // ─── Cleanup ───
    console.log('🧹 Limpiando datos de prueba...');
    await prisma.orderItem.deleteMany({
      where: { OR: [{ orderId: order.id }, { orderId: (await prisma.order.findFirst({ where: { mlId: { startsWith: 'TEST-ORDER2' } } }))?.id || '' }] },
    });
    await prisma.order.deleteMany({ where: { mlId: { startsWith: 'TEST-ORDER' } } });
    await prisma.product.deleteMany({ where: { sku: { startsWith: 'TEST-DUP-' } } });
    console.log('  Limpieza completada.\n');
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error('\n💥 Error fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
