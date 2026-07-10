import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Vincular una ubicación a un producto (añadir/actualizar stock)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { productId, locationId, quantity } = await req.json();
  if (!productId || !locationId || quantity === undefined) {
    return NextResponse.json({ error: 'productId, locationId y quantity requeridos' }, { status: 400 });
  }

  const numQuantity = Number(quantity);

  const [product, location] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { sku: true, name: true } }),
    prisma.location.findUnique({ where: { id: locationId } })
  ]);

  const prevLoc = await prisma.productLocation.findUnique({
    where: { productId_locationId: { productId, locationId } }
  });
  const qtyBefore = prevLoc?.quantity || 0;
  
  if (numQuantity <= 0) {
    // Si la cantidad es 0 o menor, eliminamos el registro para limpiar la BD
    try {
      await prisma.productLocation.delete({
        where: { productId_locationId: { productId, locationId } }
      });

      await prisma.auditLog.create({
        data: {
          userId: session.name || session.role || 'WMS',
          action: 'STOCK_ADJUST',
          metadata: {
            sku: product?.sku,
            productName: product?.name,
            location: location ? `${location.aisle}-${location.section}-${location.level}` : '',
            quantityBefore: qtyBefore,
            quantityAfter: 0,
            note: 'Eliminado stock de ubicación (0 o menor)'
          }
        }
      });

      return NextResponse.json({ success: true, deleted: true });
    } catch {
      // Ignorar si no existía
      return NextResponse.json({ success: true, deleted: false });
    }
  }

  const link = await prisma.productLocation.upsert({
    where: { productId_locationId: { productId, locationId } },
    update: { quantity: numQuantity },
    create: { productId, locationId, quantity: numQuantity },
    include: { location: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.name || session.role || 'WMS',
      action: 'STOCK_ADJUST',
      metadata: {
        sku: product?.sku,
        productName: product?.name,
        location: location ? `${location.aisle}-${location.section}-${location.level}` : '',
        quantityBefore: qtyBefore,
        quantityAfter: numQuantity,
        note: qtyBefore === 0 ? 'Stock inicial asignado' : 'Ajuste manual de stock'
      }
    }
  });

  return NextResponse.json(link, { status: 201 });
}

// Desvincular/Eliminar stock de una ubicación
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { productId, locationId } = await req.json();
  if (!productId || !locationId) return NextResponse.json({ error: 'productId y locationId requeridos' }, { status: 400 });

  const [product, location] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { sku: true, name: true } }),
    prisma.location.findUnique({ where: { id: locationId } })
  ]);

  const prevLoc = await prisma.productLocation.findUnique({
    where: { productId_locationId: { productId, locationId } }
  });
  const qtyBefore = prevLoc?.quantity || 0;

  try {
    await prisma.productLocation.delete({ 
      where: { productId_locationId: { productId, locationId } } 
    });

    await prisma.auditLog.create({
      data: {
        userId: session.name || session.role || 'WMS',
        action: 'STOCK_ADJUST',
        metadata: {
          sku: product?.sku,
          productName: product?.name,
          location: location ? `${location.aisle}-${location.section}-${location.level}` : '',
          quantityBefore: qtyBefore,
          quantityAfter: 0,
          note: 'Stock de ubicación eliminado por completo'
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting product location stock:', error);
    return NextResponse.json({ error: 'No se pudo eliminar el stock' }, { status: 500 });
  }
}
