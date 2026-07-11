import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const item = await prisma.product.findUnique({
    where: { sku: 'FUE-AO-55-12V2A-001' }
  });
  console.log(JSON.stringify(item, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
