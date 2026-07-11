const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const imageUrl = 'https://http2.mlstatic.com/D_NQ_NP_833615-MLC74751410141_022024-O.webp'; // Ejemplo de imagen
  
  await prisma.product.update({
    where: { sku: 'ZAP-00001' },
    data: { imageUrl: imageUrl }
  })
  
  await prisma.orderItem.updateMany({
    where: { productId: 'prod-ZAP-00001', mlImageUrl: null },
    data: { mlImageUrl: imageUrl }
  })
  
  console.log('Imagen de ZAP-00001 actualizada con éxito a:', imageUrl);
}

main().finally(() => prisma.$disconnect())
