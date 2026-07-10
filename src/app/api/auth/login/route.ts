import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import bcryptjs from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { name, pin } = await req.json();

    if (!name || !pin) {
      return NextResponse.json({ error: 'Nombre y PIN requeridos' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, isActive: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 401 });
    }

    const pinValid = await bcryptjs.compare(pin, user.pin);
    if (!pinValid) {
      return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
    }

    // Crear sesión
    const session = await getSession();
    session.userId = user.id;
    session.name = user.name;
    session.role = user.role;
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json({ success: true, name: user.name, role: user.role });
  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
