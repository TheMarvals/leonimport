import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Vincular un proveedor a un producto (con costo)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { productId, supplierId, costPrice, currency, isDefault } = await req.json();
  if (!productId || !supplierId || costPrice === undefined) {
    return NextResponse.json({ error: 'productId, supplierId y costPrice requeridos' }, { status: 400 });
  }

  // Si se marca como default, quitar el default de los demás
  if (isDefault) {
    await prisma.productSupplier.updateMany({
      where: { productId },
      data: { isDefault: false },
    });
  }

  const link = await prisma.productSupplier.upsert({
    where: { productId_supplierId: { productId, supplierId } },
    update: { costPrice: Number(costPrice), currency: currency || 'CLP', isDefault: !!isDefault },
    create: { productId, supplierId, costPrice: Number(costPrice), currency: currency || 'CLP', isDefault: !!isDefault },
    include: { supplier: true },
  });

  return NextResponse.json(link, { status: 201 });
}

// Desvincular un proveedor de un producto
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  await prisma.productSupplier.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
