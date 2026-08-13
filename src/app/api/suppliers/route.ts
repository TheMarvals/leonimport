import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const suppliers = await prisma.supplier.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  const { name, contact, country, notes } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

  const supplier = await prisma.supplier.create({
    data: {
      name: name.trim(),
      contact: contact?.trim() || null,
      country: country?.trim() || null,
      notes: notes?.trim() || null,
    },
  });
  return NextResponse.json(supplier, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  try {
    const { id, name, contact, country, notes } = await req.json();
    if (!id || !name?.trim()) {
      return NextResponse.json({ error: 'Proveedor y nombre requeridos' }, { status: 400 });
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        name: name.trim(),
        contact: contact?.trim() || null,
        country: country?.trim() || null,
        notes: notes?.trim() || null,
      },
      include: { _count: { select: { products: true } } },
    });
    return NextResponse.json(supplier);
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
    }
    console.error('Error actualizando proveedor:', error);
    return NextResponse.json({ error: 'No se pudo actualizar el proveedor' }, { status: 500 });
  }
}
