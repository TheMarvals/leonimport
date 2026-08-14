import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

function normalizePem(value: string): string {
  const normalized = value.replace(/^base64:/, '');
  return normalized.includes('BEGIN ')
    ? normalized.replaceAll('\\n', '\n')
    : Buffer.from(normalized, 'base64').toString('utf8');
}

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) return new NextResponse(null, { status: 401 });
  const certificate = process.env.QZ_CERTIFICATE?.trim();
  if (!certificate) return new NextResponse(null, { status: 204 });
  return new NextResponse(normalizePem(certificate), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
