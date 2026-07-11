import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { status: 'PACKING', lockedBy: null },
        { status: 'PACKING', lockedBy: session.userId },
      ],
    },
    include: {
      cubicle: true,
      items: {
        include: {
          product: true
        }
      }
    },
    orderBy: { updatedAt: 'asc' }
  });

  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await req.json();
  const { action, orderId } = body;

  if (!orderId || !action) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });

  try {
    if (action === 'START_PACKING') {
      const sourceOrder = await prisma.order.findUnique({
        where: { id: orderId }
      });
      if (!sourceOrder) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

      const orderIds = sourceOrder.shippingId
        ? (await prisma.order.findMany({
            where: {
              shippingId: sourceOrder.shippingId,
              status: 'PACKING',
              OR: [
                { lockedBy: null },
                { lockedBy: session.userId }
              ]
            },
            select: { id: true }
          })).map(o => o.id)
        : [orderId];

      await prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data: { 
          lockedBy: session.userId,
          lockExpiresAt: new Date(Date.now() + 1000 * 60 * 30)
        }
      });

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      return NextResponse.json(order);
    }

    if (action === 'COMPLETE_PACKING') {
      const { station, methods } = body;
      const sourceOrder = await prisma.order.findUnique({
        where: { id: orderId }
      });
      if (!sourceOrder) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

      const orderIds = sourceOrder.shippingId
        ? (await prisma.order.findMany({
            where: { shippingId: sourceOrder.shippingId, lockedBy: session.userId },
            select: { id: true }
          })).map(o => o.id)
        : [orderId];

      let finalPackingMethod = 'MANUAL';
      if (Array.isArray(methods) && methods.length > 0) {
        if (methods.length > 1) finalPackingMethod = 'MIXED';
        else finalPackingMethod = methods[0];
      }

      const shippedAt = new Date();
      await prisma.$transaction(async tx => {
        await tx.order.updateMany({
          where: { id: { in: orderIds } },
          data: {
            status: 'SHIPPED',
            packedByUserId: session.userId,
            packingStation: station || 'Mesa 1',
            packingMethod: finalPackingMethod,
            shippedAt,
            lockedBy: null,
            lockExpiresAt: null
          }
        });

        await tx.auditLog.create({
          data: {
            orderId: sourceOrder.id,
            userId: session.userId,
            action: 'COMPLETE_PACKING',
            metadata: { station: station || 'Mesa 1', methods: methods || [], orderIds }
          }
        });
      });

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      return NextResponse.json(order);
    }

    if (action === 'CANCEL_PACKING') {
      const sourceOrder = await prisma.order.findUnique({
        where: { id: orderId }
      });
      if (!sourceOrder) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });

      const orderIds = sourceOrder.shippingId
        ? (await prisma.order.findMany({
            where: { shippingId: sourceOrder.shippingId, lockedBy: session.userId },
            select: { id: true }
          })).map(o => o.id)
        : [orderId];

      await prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data: { 
          lockedBy: null,
          lockExpiresAt: null
        }
      });

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      return NextResponse.json(order);
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error: any) {
    console.error('Packing Action Error:', error);
    return NextResponse.json({ error: 'Ocurrió un error al procesar la orden' }, { status: 500 });
  }
}
