import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const productToDelete = await prisma.product.findUnique({
      where: { id },
      select: { sku: true, name: true }
    });

    if (!productToDelete) {
      return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    }

    // Verificar si el producto tiene order items vinculados
    const orderItemsCount = await prisma.orderItem.count({
      where: { productId: id }
    });

    if (orderItemsCount > 0) {
      return NextResponse.json({ 
        error: `No se puede eliminar porque está en ${orderItemsCount} órden(es). Debe resolver las órdenes primero.` 
      }, { status: 409 });
    }

    // Usamos una transacción para eliminar relaciones y el producto
    await prisma.$transaction(async (tx) => {
      await tx.productLocation.deleteMany({ where: { productId: id } });
      await tx.productSupplier.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });

    await prisma.auditLog.create({
      data: {
        userId: session.name || session.role || 'WMS',
        action: 'DELETE_PRODUCT',
        metadata: { sku: productToDelete.sku, name: productToDelete.name }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    return NextResponse.json({ error: 'No se pudo eliminar el producto' }, { status: 500 });
  }
}
