import { NextRequest, NextResponse } from 'next/server';
import { refreshOrder } from '@/lib/sync-orders';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sync/refresh
 * 
 * Refresca una orden específica desde MercadoLibre, actualizando metadatos e items
 * sin duplicar productos ni OrderItems.
 * 
 * Body: { orderId: string }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Falta orderId' }, { status: 400 });
    }

    const updatedOrder = await refreshOrder(orderId);

    if (updatedOrder === null) {
      return NextResponse.json(
        { error: 'Orden no encontrada en MercadoLibre. Puede que ya no esté disponible en ML.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
    });
  } catch (error: any) {
    console.error('Refresh Order Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al refrescar la orden' },
      { status: 500 }
    );
  }
}
