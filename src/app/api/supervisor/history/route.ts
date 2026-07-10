import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const history = await prisma.order.findMany({
    where: { status: 'SHIPPED' },
    orderBy: { shippedAt: 'desc' },
    take: 50,
    include: {
      items: {
        include: { product: true }
      }
    }
  });

  return NextResponse.json(history);
}
