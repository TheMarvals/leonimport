const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const missings = await prisma.product.findMany({
    where: { sku: { startsWith: 'ML-MISSING' } }
  });

  console.log(`Encontrados ${missings.length} productos ML-MISSING:`);
  
  for (const m of missings) {
    console.log(`\nFantasma: ${m.name} (SKU: ${m.sku})`);
    
    const keywords = m.name.toLowerCase().split(' ').filter(w => w.length > 3);
    
    if (keywords.length === 0) {
      console.log('  No se pudo extraer palabras clave.');
      continue;
    }
    
    const possibleMatches = await prisma.product.findMany({
      where: {
        AND: [
          { sku: { not: { startsWith: 'ML-MISSING' } } },
          {
            OR: keywords.map(kw => ({
              name: { contains: kw, mode: 'insensitive' }
            }))
          }
        ]
      },
      take: 5
    });

    if (possibleMatches.length > 0) {
      console.log(`  Posibles coincidencias en tu BD:`);
      for (const p of possibleMatches) {
        console.log(`    - ${p.name} (SKU: ${p.sku})`);
      }
    } else {
      console.log(`  No se encontraron productos similares en la BD.`);
    }
  }
}

main().finally(() => prisma.$disconnect());
