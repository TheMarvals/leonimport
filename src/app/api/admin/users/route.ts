import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import bcryptjs from 'bcryptjs';

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { role: { in: ['SUPERVISOR', 'PICKER', 'PACKER'] } },
    select: { id: true, name: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  try {
    const { name, pin, role } = await req.json();
    
    if (!name?.trim() || !/^\d{4,6}$/.test(pin) || !['SUPERVISOR', 'PICKER', 'PACKER'].includes(role)) {
      return NextResponse.json({ error: 'Nombre, rol y PIN de 4 a 6 números son requeridos' }, { status: 400 });
    }

    const hashedPin = await bcryptjs.hash(pin, 10);

    const newUser = await prisma.user.create({
      data: { 
        name: name.trim(),
        pin: hashedPin, 
        plainPin: pin,
        role 
      }
    });

    return NextResponse.json({ id: newUser.id, name: newUser.name, role: newUser.role, isActive: newUser.isActive, createdAt: newUser.createdAt });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  try {
    const { id, name, pin, role, isActive } = await req.json();
    if (!id || !name?.trim() || !['SUPERVISOR', 'PICKER', 'PACKER'].includes(role)) {
      return NextResponse.json({ error: 'Usuario, nombre y rol válidos son requeridos' }, { status: 400 });
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: 'El PIN debe tener entre 4 y 6 números' }, { status: 400 });
    }
    if (id === session.userId && isActive === false) {
      return NextResponse.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 409 });
    }
    
    // Solo permitimos campos específicos para evitar errores de Prisma con campos como 'createdAt'
    const updateData: any = { name: name.trim(), role, isActive };
    
    if (pin) {
      updateData.pin = await bcryptjs.hash(pin, 10);
      updateData.plainPin = pin;
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json({ id: updatedUser.id, name: updatedUser.name, role: updatedUser.role, isActive: updatedUser.isActive, createdAt: updatedUser.createdAt });
  } catch (error: any) {
    console.error('Error actualizando usuario:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session.isLoggedIn || !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Solo supervisores' }, { status: 403 });
  }

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'Falta ID de usuario' }, { status: 400 });
    if (id === session.userId) return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 409 });

    await prisma.user.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: 'Usuario eliminado correctamente' });
  } catch (error: any) {
    console.error('Error eliminando usuario:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
