import { getIronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  userId: string;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'PICKER' | 'PACKER';
  isLoggedIn: boolean;
  station?: string;
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'leonimport-wms-secret-key-min-32-characters-long!',
  cookieName: 'wms-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
  },
};

export async function getSession() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  return session;
}

export { sessionOptions };
