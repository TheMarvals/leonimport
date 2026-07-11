import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const parseNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const includeInactive = req.nextUrl.searchParams.get('all') === 'true' && ['SUPERVISOR', 'ADMIN'].includes(session.role);
  const cubicles = await prisma.cubicle.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { number: 'asc' },
    include: {
      orders: {
        // El cubículo queda libre cuando un packer toma la orden (lockedBy).
        where: { status: 'PACKING', lockedBy: null },
        select: { id: true, mlId: true, shippingId: true },
        take: 1
      }
    }
  });

  return NextResponse.json(cubicles.map(cubicle => ({
    id: cubicle.id,
    number: cubicle.number,
    isActive: cubicle.isActive,
    occupied: cubicle.orders.length > 0,
    order: cubicle.orders[0] || null
  })));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  const body = await req.json();
  const number = parseNumber(body.number);
  if (!number) {
    return NextResponse.json({ error: 'Ingresa un número de cubículo válido' }, { status: 400 });
  }

  const existing = await prisma.cubicle.findUnique({ where: { number } });
  if (existing?.isActive) {
    return NextResponse.json({ error: `El cubículo ${number} ya existe` }, { status: 409 });
  }

  const cubicle = existing
    ? await prisma.cubicle.update({ where: { id: existing.id }, data: { isActive: true } })
    : await prisma.cubicle.create({ data: { number } });

  return NextResponse.json(cubicle, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  const body = await req.json();
  const number = parseNumber(body.number);
  if (!body.id || !number) {
    return NextResponse.json({ error: 'ID y número válidos son requeridos' }, { status: 400 });
  }

  const duplicate = await prisma.cubicle.findFirst({
    where: { number, id: { not: body.id } }
  });
  if (duplicate) {
    return NextResponse.json({ error: `El cubículo ${number} ya existe` }, { status: 409 });
  }

  const occupied = await prisma.order.findFirst({
    where: { cubicleId: body.id, status: 'PACKING', lockedBy: null },
    select: { id: true }
  });
  if (occupied) {
    return NextResponse.json({ error: 'No puedes editar un cubículo ocupado' }, { status: 409 });
  }

  const cubicle = await prisma.cubicle.update({
    where: { id: body.id },
    data: { number }
  });
  return NextResponse.json(cubicle);
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const cubicle = await prisma.cubicle.findUnique({
    where: { id: body.id },
    include: {
      orders: {
        where: { status: 'PACKING', lockedBy: null },
        select: { id: true },
        take: 1
      },
      _count: { select: { orders: true } }
    }
  });
  if (!cubicle) {
    return NextResponse.json({ error: 'Cubículo no encontrado' }, { status: 404 });
  }
  if (cubicle.orders.length > 0) {
    return NextResponse.json({ error: 'No puedes eliminar un cubículo ocupado' }, { status: 409 });
  }

  if (cubicle._count.orders > 0) {
    await prisma.cubicle.update({ where: { id: cubicle.id }, data: { isActive: false } });
  } else {
    await prisma.cubicle.delete({ where: { id: cubicle.id } });
  }

  return NextResponse.json({ success: true });
}
