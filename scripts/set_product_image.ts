/**
 * Asigna una imagen a un producto por SKU.
 *
 * Uso: npx tsx scripts/set_product_image.ts <sku> <imageUrl>
 *
 * Ejemplo:
 *   npx tsx scripts/set_product_image.ts 2RL-10001 https://http2.mlstatic.com/D_NQ_NP_123456-O.jpg
 *
 * También actualiza todos los OrderItems de ese producto que no tengan mlImageUrl.
 */
import { PrismaClient } from '@prisma/client';
import { getHighResImageUrl } from '../src/lib/image-utils';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Uso: npx tsx scripts/set_product_image.ts <sku> <imageUrl>');
    console.error('');
    console.error('Ejemplo:');
    console.error('  npx tsx scripts/set_product_image.ts 2RL-10001 https://http2.mlstatic.com/D_NQ_NP_123456-O.jpg');
    process.exit(1);
  }

  const [sku, imageUrl] = args;

  // Validar URL y normalizar (HTTPS + alta resolución)
  try {
    new URL(imageUrl);
  } catch {
    console.error(`❌ URL inválida: ${imageUrl}`);
    process.exit(1);
  }
  const normalizedUrl = getHighResImageUrl(imageUrl);
  if (!normalizedUrl) {
    console.error(`❌ No se pudo normalizar la URL: ${imageUrl}`);
    process.exit(1);
  }

  // Buscar producto
  const product = await prisma.product.findUnique({ where: { sku } });
  if (!product) {
    console.error(`❌ Producto con SKU "${sku}" no encontrado`);
    process.exit(1);
  }

  console.log(`📦 Producto: ${product.sku} — ${product.name.substring(0, 50)}`);
  console.log(`   Imagen actual: ${product.imageUrl || '(ninguna)'}`);
  console.log(`   Nueva imagen: ${normalizedUrl}`);

  // Actualizar producto
  await prisma.product.update({
    where: { sku },
    data: { imageUrl: normalizedUrl },
  });
  console.log(`✅ Product.imageUrl actualizado`);

  // Actualizar OrderItems sin mlImageUrl
  const affectedItems = await prisma.orderItem.findMany({
    where: { productId: product.id, mlImageUrl: null },
  });

  if (affectedItems.length > 0) {
    await prisma.orderItem.updateMany({
      where: { productId: product.id, mlImageUrl: null },
      data: { mlImageUrl: normalizedUrl },
    });
    console.log(`✅ ${affectedItems.length} OrderItem(s) con mlImageUrl actualizado`);
  } else {
    console.log(`ℹ️  No hay OrderItems sin imagen para este producto`);
  }

  console.log(`\n🎯 Listo. Refresca la página para ver el cambio.`);
}

main()
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
