import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { extractFamilyBase } from '@/lib/sku-generator';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const categoryFilter = searchParams.get('category');

  const where: any = {
    NOT: {
      sku: { startsWith: 'ML-MISSING-' }
    }
  };

  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { sku: { contains: query, mode: 'insensitive' } }
    ];
  }

  if (categoryFilter) {
    where.categoryFamily = parseInt(categoryFilter);
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      suppliers: {
        include: { supplier: true },
        orderBy: { isDefault: 'desc' },
      },
      locations: { include: { location: true } },
    },
    orderBy: { name: 'asc' },
    take: query ? 20 : 1000,
  });
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { sku, name, brand, color, size, imageUrl, salePrice, currency, supplierId, costPrice } = await req.json();
  if (!sku || !name) return NextResponse.json({ error: 'SKU y nombre requeridos' }, { status: 400 });

  try {
    const categoryFamily = extractFamilyBase(name);

    const product = await prisma.product.create({
      data: {
        sku: sku.toUpperCase(),
        name,
        brand: brand || null,
        color: color || null,
        size: size || null,
        imageUrl: imageUrl || null,
        salePrice: salePrice ? Number(salePrice) : null,
        currency: currency || 'CLP',
        categoryFamily: categoryFamily !== 9000 ? categoryFamily : null,
        ...(supplierId ? {
          suppliers: {
            create: {
              supplierId,
              costPrice: costPrice ? Number(costPrice) : 0,
              currency: currency || 'CLP',
              isDefault: true,
            },
          },
        } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.name || session.role || 'WMS',
        action: 'CREATE_PRODUCT',
        metadata: { sku: product.sku, name: product.name }
      }
    });

    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    console.error('Error creating product:', err);
    return NextResponse.json({ error: 'SKU ya existe o error interno' }, { status: 409 });
  }
}
