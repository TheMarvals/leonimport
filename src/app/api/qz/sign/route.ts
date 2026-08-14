import { createSign } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

function normalizePrivateKey(value: string): string {
  const normalized = value.replace(/^base64:/, '');
  return normalized.includes('BEGIN ') ? normalized.replaceAll('\\n', '\n') : Buffer.from(normalized, 'base64').toString('utf8');
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const privateKey = process.env.QZ_PRIVATE_KEY?.trim();
  if (!privateKey) return NextResponse.json({ error: 'Firma QZ no configurada' }, { status: 503 });

  try {
    const { request } = await req.json();
    if (typeof request !== 'string' || request.length > 100_000) {
      return NextResponse.json({ error: 'Solicitud de firma inválida' }, { status: 400 });
    }
    const signer = createSign('RSA-SHA512');
    signer.update(request);
    signer.end();
    return NextResponse.json({ signature: signer.sign(normalizePrivateKey(privateKey), 'base64') });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'No se pudo firmar el trabajo' }, { status: 500 });
  }
}
