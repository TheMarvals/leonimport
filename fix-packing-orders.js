const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    where: { status: 'PACKING' },
    include: { items: true }
  });
  
  let fixedCount = 0;
  for (const order of orders) {
    const isActuallyPicked = order.items.every(i => i.quantityPicked >= i.quantityTotal);
    if (!isActuallyPicked) {
      console.log(`Orden ${order.mlId} está en PACKING pero no ha sido pickeada por completo. Revirtiendo a PENDING...`);
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'PENDING', lockedBy: null, lockExpiresAt: null }
      });
      fixedCount++;
    }
  }
  console.log(`Se arreglaron ${fixedCount} órdenes atascadas.`);
}

main().finally(() => prisma.$disconnect());
