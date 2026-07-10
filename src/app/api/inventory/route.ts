import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Asignar producto a ubicación con cantidad
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || session.role !== 'SUPERVISOR') {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  const { productId, locationId, quantity } = await req.json();
  if (!productId || !locationId || quantity === undefined) {
    return NextResponse.json({ error: 'Campos requeridos' }, { status: 400 });
  }

  const assignment = await prisma.productLocation.upsert({
    where: {
      productId_locationId: { productId, locationId },
    },
    update: { quantity: Number(quantity) },
    create: { productId, locationId, quantity: Number(quantity) },
  });

  return NextResponse.json(assignment);
}
