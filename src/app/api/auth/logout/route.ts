import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import RedisManager from '@/lib/redis';

export async function POST(req: NextRequest) {
  const session = await getSession();
  
  if (session.station && session.userId) {
    try {
      await RedisManager.unlockStation(session.station, session.userId);
    } catch (error) {
      console.error('Error unlocking station on logout:', error);
    }
  }

  session.destroy();
  return NextResponse.redirect(new URL('/login', req.nextUrl.origin), {
    status: 303,
  });
}
