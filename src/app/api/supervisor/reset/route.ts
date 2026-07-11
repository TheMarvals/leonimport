import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores o administradores' }, { status: 403 });
  }

  try {
    // 1. Resetear estados de las órdenes
    const result = await prisma.order.updateMany({
      where: {
        status: { in: ['PICKING', 'PACKING', 'RESOLUTION_REQUIRED', 'SHIPPED'] }
      },
      data: {
        status: 'PENDING',
        lockedBy: null,
        lockExpiresAt: null,
        packedByUserId: null,
        packingStation: null,
        shippedAt: null,
        cubicleId: null,
        cubicleNumber: null
      }
    });

    // 2. Resetear el progreso de recolección de los ítems
    await prisma.orderItem.updateMany({
      data: { quantityPicked: 0 }
    });

    return NextResponse.json({ 
      success: true, 
      count: result.count,
      message: `${result.count} órdenes y sus productos han sido reseteados a cero.`
    });
  } catch (error) {
    console.error('Reset Error:', error);
    return NextResponse.json({ error: 'Error al resetear el sistema' }, { status: 500 });
  }
}
