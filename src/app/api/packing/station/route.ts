import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import RedisManager from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const stations = ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6'];
    const details = [];

    for (const station of stations) {
      const ownerId = await RedisManager.getStationOwner(station);
      let ownerName = null;
      if (ownerId) {
        const user = await prisma.user.findUnique({ where: { id: ownerId } });
        ownerName = user ? user.name : 'Otro usuario';
      }
      details.push({
        name: station,
        isLocked: !!ownerId,
        lockedByUserId: ownerId,
        lockedByUserName: ownerName,
        isMine: ownerId === session.userId,
      });
    }

    return NextResponse.json({ 
      success: true,
      stations, 
      activeStation: session.station || null, 
      details 
    });
  } catch (error) {
    console.error('Error fetching stations:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { action, stationName } = await req.json();

    if (action === 'LOCK') {
      if (!stationName) {
        return NextResponse.json({ error: 'Mesa requerida' }, { status: 400 });
      }

      // 1. Si ya tiene esta mesa asignada, no hacer nada
      if (session.station === stationName) {
        return NextResponse.json({ success: true, station: stationName });
      }

      // 2. Si ya tiene otra mesa asignada, liberarla primero
      if (session.station) {
        await RedisManager.unlockStation(session.station, session.userId);
      }

      // 3. Intentar bloquear la nueva mesa
      const success = await RedisManager.lockStation(stationName, session.userId);
      if (success) {
        session.station = stationName;
        await session.save();
        return NextResponse.json({ success: true, station: stationName });
      } else {
        return NextResponse.json({ error: 'La mesa ya está ocupada por otro operario' }, { status: 409 });
      }
    }

    if (action === 'UNLOCK') {
      const currentStation = session.station || stationName;
      if (currentStation) {
        await RedisManager.unlockStation(currentStation, session.userId);
        session.station = undefined;
        await session.save();
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (error) {
    console.error('Error modifying station:', error);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
