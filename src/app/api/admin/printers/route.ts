import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

const ALLOWED_STATIONS = ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6'];

async function authorize() {
  const session = await getSession();
  return session.isLoggedIn && ['SUPERVISOR', 'ADMIN'].includes(session.role);
}

export async function GET() {
  if (!(await authorize())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const configs = await prisma.printerConfig.findMany({
    where: { isActive: true },
    orderBy: [{ purpose: 'asc' }, { stationName: 'asc' }],
  });

  return NextResponse.json({ configs });
}

export async function POST(req: NextRequest) {
  if (!(await authorize())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  try {
    const body = await req.json();
    const id = body.id ? String(body.id) : null;
    const printerName = String(body.printerName || '').trim();
    const purpose = String(body.purpose || '');
    const stationName = purpose === 'PACKING' ? String(body.stationName || '') : null;
    const name = String(body.name || printerName).trim();

    if (!printerName || !name) {
      return NextResponse.json({ error: 'Selecciona una impresora QZ válida' }, { status: 400 });
    }
    if (!['PACKING', 'SKU'].includes(purpose)) {
      return NextResponse.json({ error: 'Tipo de impresora inválido' }, { status: 400 });
    }
    if (purpose === 'PACKING' && !ALLOWED_STATIONS.includes(stationName || '')) {
      return NextResponse.json({ error: 'Selecciona una mesa válida' }, { status: 400 });
    }

    const current = id
      ? await prisma.printerConfig.findUnique({ where: { id } })
      : await prisma.printerConfig.findFirst({ where: { printerName, purpose: purpose as any, stationName } });
    const conflicting = await prisma.printerConfig.findMany({
      where: {
        isActive: true,
        purpose: purpose as any,
        stationName,
        ...(current ? { id: { not: current.id } } : {}),
      },
      select: { id: true },
    });

    const config = await prisma.$transaction(async transaction => {
      if (conflicting.length > 0) {
        await transaction.printerConfig.updateMany({
          where: { id: { in: conflicting.map(item => item.id) } },
          data: { isActive: false },
        });
      }
      if (current) {
        return transaction.printerConfig.update({
          where: { id: current.id },
          data: { printerName, name, purpose: purpose as any, stationName, labelSize: body.labelSize || null, isActive: true },
        });
      }
      return transaction.printerConfig.create({
        data: { printerName, name, purpose: purpose as any, stationName, labelSize: body.labelSize || null },
      });
    });

    return NextResponse.json(config, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'No se pudo guardar la impresora' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await authorize())) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'Falta la impresora' }, { status: 400 });
    await prisma.printerConfig.update({ where: { id: String(id) }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'No se pudo quitar la impresora' }, { status: 500 });
  }
}
