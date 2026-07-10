import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { SessionData } from './lib/session';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/sync/ml'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Permitir acceso a rutas públicas y assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/sounds') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Verificar sesión
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, {
    password: process.env.SESSION_SECRET || 'leonimport-wms-secret-key-min-32-characters-long!',
    cookieName: 'wms-session',
  });

  if (!session.isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Proteger rutas por rol
  if (pathname.startsWith('/admin') && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (pathname.startsWith('/supervisor') && !['SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
