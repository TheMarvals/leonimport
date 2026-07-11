import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import bcryptjs from 'bcryptjs';

export async function GET() {
  const session = await getSession();
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { name, pin, role } = await req.json();
    
    if (!name || !pin || !role) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const hashedPin = await bcryptjs.hash(pin, 10);

    const newUser = await prisma.user.create({
      data: { 
        name, 
        pin: hashedPin, 
        plainPin: pin,
        role 
      }
    });

    return NextResponse.json(newUser);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { id, name, pin, role, isActive } = await req.json();
    
    // Solo permitimos campos específicos para evitar errores de Prisma con campos como 'createdAt'
    const updateData: any = { name, role, isActive };
    
    if (pin && pin.length > 0 && pin.length < 15) {
      updateData.pin = await bcryptjs.hash(pin, 10);
      updateData.plainPin = pin;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(updatedUser);
  } catch (error: any) {
    console.error('Error actualizando usuario:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'Falta ID de usuario' }, { status: 400 });

    await prisma.user.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: 'Usuario eliminado correctamente' });
  } catch (error: any) {
    console.error('Error eliminando usuario:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

