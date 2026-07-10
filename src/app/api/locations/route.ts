import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Listar ubicaciones
export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const locations = await prisma.location.findMany({
    include: {
      products: {
        include: { product: true },
      },
    },
    orderBy: [{ aisle: 'asc' }, { sequenceIndex: 'asc' }],
  });

  return NextResponse.json(locations);
}

// Crear ubicación
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || session.role !== 'SUPERVISOR') {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  const { aisle, section, level, sequenceIndex } = await req.json();
  if (!aisle || !section || !level || sequenceIndex === undefined) {
    return NextResponse.json({ error: 'Todos los campos son requeridos' }, { status: 400 });
  }

  const location = await prisma.location.create({
    data: { aisle, section, level, sequenceIndex: Number(sequenceIndex) },
  });

  return NextResponse.json(location, { status: 201 });
}
