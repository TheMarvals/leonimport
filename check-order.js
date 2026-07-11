const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const order = await prisma.order.findUnique({
    where: { mlId: '47356149287' },
    include: { items: true }
  });
  console.log(JSON.stringify(order, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2));
}

main().finally(() => prisma.$disconnect());
