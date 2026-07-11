const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const product = await prisma.product.findUnique({
    where: { sku: 'ZAP-00001' }
  })
  console.log('Product:', product)
  
  const orderItem = await prisma.orderItem.findFirst({
    where: { productId: product?.id },
    include: { product: true }
  })
  console.log('OrderItem:', orderItem)
}

main().finally(() => prisma.$disconnect())
