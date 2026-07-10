import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { generateSku } from '@/lib/sku-generator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sku/generate?name=Polera Algodón
 * Genera un SKU automático basado en el nombre del producto.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const name = req.nextUrl.searchParams.get('name');
  const brand = req.nextUrl.searchParams.get('brand') || undefined;
  const color = req.nextUrl.searchParams.get('color') || undefined;
  const size = req.nextUrl.searchParams.get('size') || undefined;
  
  if (!name) return NextResponse.json({ error: 'Parámetro "name" requerido' }, { status: 400 });

  const sku = await generateSku(name, brand, color, size);
  return NextResponse.json({ sku });
}
