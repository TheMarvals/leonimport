import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { fetchLabel, extractFirstPage } from '@/lib/label-service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mlId: string }> }
) {
  const session = await getSession();
  if (!session.isLoggedIn) return new NextResponse('No autorizado', { status: 401 });

  const { mlId } = await params;

  try {
    // Obtener etiqueta con multi-intento (gateway → ML directo → fallback local)
    const { buffer, source } = await fetchLabel(mlId);
    
    // Extraer solo la primera página
    const singlePage = await extractFirstPage(buffer);

    const sourceLabel = 
      source === 'gateway' ? 'ML Gateway' :
      source === 'ml-direct' ? 'ML Directo' :
      'Local (fallback)';

    console.log(`[LabelRoute] Etiqueta servida desde ${sourceLabel} para ${mlId}`);

    return new NextResponse(singlePage as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="label-${mlId}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error('[LabelRoute] Error:', error);
    return new NextResponse('Error interno del servidor generando la etiqueta', { status: 500 });
  }
}
