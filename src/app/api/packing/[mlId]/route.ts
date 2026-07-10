import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mlId: string }> }
) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { mlId } = await params;

  try {
    const order = await prisma.order.findUnique({
      where: { mlId },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    if (order.status !== 'PACKING') {
      return NextResponse.json({ 
        error: `La orden está en estado ${order.status}. Debe estar en PACKING.` 
      }, { status: 400 });
    }

    // Auto-bloquear si no está bloqueada
    if (!order.lockedBy) {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          lockedBy: session.userId,
          lockExpiresAt: new Date(Date.now() + 1000 * 60 * 30)
        }
      });
    } else if (order.lockedBy !== session.userId) {
       // Si está bloqueada por otro, verificar si el bloqueo expiró
       if (order.lockExpiresAt && order.lockExpiresAt < new Date()) {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              lockedBy: session.userId,
              lockExpiresAt: new Date(Date.now() + 1000 * 60 * 30)
            }
          });
       } else {
         return NextResponse.json({ 
           error: `La orden está siendo procesada por otro usuario.` 
         }, { status: 403 });
       }
    }

    return NextResponse.json(order);
  } catch (error: any) {
    console.error('Packing Get Error:', error);
    return NextResponse.json({ error: 'Error al buscar la orden' }, { status: 500 });
  }
}
