import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const history = await prisma.order.findMany({
    // shippedAt es la marca autoritativa escrita por una mesa al despachar.
    // El OR conserva órdenes históricas sincronizadas desde MercadoLibre.
    where: {
      OR: [
        { shippedAt: { not: null } },
        { status: 'SHIPPED' }
      ]
    },
    orderBy: [{ shippedAt: 'desc' }, { updatedAt: 'desc' }],
    take: 100,
    include: {
      cubicle: true,
      items: {
        include: { product: true }
      }
    }
  });

  return NextResponse.json(history, {
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}
