import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { productMatchScore } from '@/lib/product-matching';

export const dynamic = 'force-dynamic';

const productInclude = {
  locations: { include: { location: true } },
  suppliers: { include: { supplier: true } },
  marketplaceListings: { orderBy: { updatedAt: 'desc' as const } },
  _count: { select: { orderItems: true } },
};

function summarizeProduct(product: any, score?: number) {
  return {
    ...product,
    score,
    totalStock: product.locations.reduce((total: number, location: any) => total + location.quantity, 0),
    listingCount: product.marketplaceListings.length,
    orderCount: product._count.orderItems,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  const query = req.nextUrl.searchParams.get('q')?.trim();
  const sourceId = req.nextUrl.searchParams.get('sourceId');

  if (sourceId) {
    const source = await prisma.product.findFirst({
      where: { id: sourceId, isActive: true },
      include: productInclude,
    });
    if (!source) return NextResponse.json({ error: 'Producto origen no encontrado' }, { status: 404 });

    const candidates = await prisma.product.findMany({
      where: { isActive: true, id: { not: sourceId }, NOT: { sku: { startsWith: 'ML-MISSING' } } },
      select: { id: true, sku: true, name: true, brand: true, color: true, size: true },
      orderBy: { updatedAt: 'desc' },
      take: 3000,
    });

    const ranked = candidates
      .map(candidate => ({ candidate, score: productMatchScore(source, candidate) }))
      .filter(result => result.score >= 35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    const scoreById = new Map(ranked.map(result => [result.candidate.id, result.score]));
    const detailedCandidates = ranked.length ? await prisma.product.findMany({
      where: { id: { in: ranked.map(result => result.candidate.id) } },
      include: productInclude,
    }) : [];
    const detailById = new Map(detailedCandidates.map(candidate => [candidate.id, candidate]));
    const suggestions = ranked
      .map(result => detailById.get(result.candidate.id))
      .filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate)
      .map(candidate => summarizeProduct(candidate, scoreById.get(candidate.id)));

    return NextResponse.json({ source: summarizeProduct(source), suggestions });
  }

  if (!query || query.length < 2) return NextResponse.json([]);
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      NOT: { sku: { startsWith: 'ML-MISSING' } },
      OR: [
        { sku: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
        { mlAliases: { has: query } },
        { marketplaceListings: { some: { sellerSku: { contains: query, mode: 'insensitive' } } } },
      ],
    },
    include: productInclude,
    orderBy: { name: 'asc' },
    take: 30,
  });

  return NextResponse.json(products.map(product => summarizeProduct(product)));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  const { sourceProductId, targetProductId } = await req.json();
  if (!sourceProductId || !targetProductId || sourceProductId === targetProductId) {
    return NextResponse.json({ error: 'Selecciona dos productos diferentes' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async tx => {
      const [source, target] = await Promise.all([
        tx.product.findFirst({ where: { id: sourceProductId, isActive: true }, include: productInclude }),
        tx.product.findFirst({ where: { id: targetProductId, isActive: true }, include: productInclude }),
      ]);
      if (!source || !target) throw new Error('PRODUCT_NOT_FOUND');

      const activeOrder = await tx.orderItem.findFirst({
        where: {
          productId: { in: [source.id, target.id] },
          order: { status: { in: ['PICKING', 'PACKING'] } }
        },
        select: { id: true }
      });
      if (activeOrder) throw new Error('ACTIVE_ORDER');

      const sourceItems = await tx.orderItem.findMany({ where: { productId: source.id } });
      for (const item of sourceItems) {
        const existing = await tx.orderItem.findUnique({
          where: { orderId_productId: { orderId: item.orderId, productId: target.id } }
        });
        if (existing) {
          await tx.orderItem.update({
            where: { id: existing.id },
            data: {
              quantityTotal: { increment: item.quantityTotal },
              quantityPicked: { increment: item.quantityPicked },
              mlImageUrl: existing.mlImageUrl || item.mlImageUrl,
            }
          });
          await tx.orderItem.delete({ where: { id: item.id } });
        } else {
          await tx.orderItem.update({ where: { id: item.id }, data: { productId: target.id } });
        }
      }

      for (const location of source.locations) {
        await tx.productLocation.upsert({
          where: { productId_locationId: { productId: target.id, locationId: location.locationId } },
          update: { quantity: { increment: location.quantity } },
          create: { productId: target.id, locationId: location.locationId, quantity: location.quantity }
        });
      }
      await tx.productLocation.deleteMany({ where: { productId: source.id } });

      for (const supplier of source.suppliers) {
        const existing = await tx.productSupplier.findUnique({
          where: { productId_supplierId: { productId: target.id, supplierId: supplier.supplierId } }
        });
        if (!existing) {
          await tx.productSupplier.create({
            data: {
              productId: target.id,
              supplierId: supplier.supplierId,
              costPrice: supplier.costPrice,
              currency: supplier.currency,
              isDefault: supplier.isDefault && !target.suppliers.some(item => item.isDefault),
            }
          });
        }
      }
      await tx.productSupplier.deleteMany({ where: { productId: source.id } });

      await tx.marketplaceListing.updateMany({
        where: { productId: source.id },
        data: { productId: target.id, linkSource: 'PRODUCT_MERGE', confidence: 100 }
      });

      const aliases = [...new Set([
        ...target.mlAliases,
        ...source.mlAliases,
        source.sku,
        source.name,
        ...source.marketplaceListings.flatMap(listing => [listing.sellerSku, listing.title]),
      ].filter((value): value is string => !!value?.trim()).map(value => value.trim()))];

      await tx.product.update({
        where: { id: target.id },
        data: {
          mlAliases: { set: aliases },
          imageUrl: target.imageUrl || source.imageUrl,
          salePrice: target.salePrice ?? source.salePrice,
          categoryFamily: target.categoryFamily ?? source.categoryFamily,
          mlCategoryPath: target.mlCategoryPath || source.mlCategoryPath,
        }
      });

      await tx.product.update({
        where: { id: source.id },
        data: { isActive: false, mergedIntoId: target.id }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          action: 'MERGE_PRODUCTS',
          metadata: {
            sourceProductId: source.id,
            sourceSku: source.sku,
            targetProductId: target.id,
            targetSku: target.sku,
            movedOrders: sourceItems.length,
            movedStock: source.locations.reduce((sum, location) => sum + location.quantity, 0),
            movedListings: source.marketplaceListings.length,
          }
        }
      });

      return {
        success: true,
        source: { id: source.id, sku: source.sku, name: source.name },
        target: { id: target.id, sku: target.sku, name: target.name },
      };
    }, { maxWait: 5000, timeout: 30000, isolationLevel: 'Serializable' });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Product merge error:', error);
    if (error?.message === 'PRODUCT_NOT_FOUND') {
      return NextResponse.json({ error: 'Uno de los productos ya no está disponible' }, { status: 404 });
    }
    if (error?.message === 'ACTIVE_ORDER') {
      return NextResponse.json({ error: 'No se puede fusionar: uno de los productos está en picking o packing' }, { status: 409 });
    }
    if (error?.code === 'P2034') {
      return NextResponse.json({ error: 'Los productos cambiaron durante el merge. Intenta nuevamente.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se pudo completar el merge' }, { status: 500 });
  }
}
