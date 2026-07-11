import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const product = await prisma.product.findUnique({
    where: { sku: 'ZAP-00001' }
  })
  console.log('Product:', product)
  const orderItems = await prisma.orderItem.findMany({
    where: { productId: product?.id }
  })
  console.log('OrderItems:', orderItems)
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
