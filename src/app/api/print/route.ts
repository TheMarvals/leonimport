import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { fetchLabel, extractFirstPage } from '@/lib/label-service';
import { isPrintNodeConfigured, printPdfWithPrintNode } from '@/lib/printnode';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { mlId, station } = await req.json();
    if (!mlId) return NextResponse.json({ error: 'Falta mlId' }, { status: 400 });
    if (!isPrintNodeConfigured()) {
      return NextResponse.json({
        fallback: true,
        code: 'PRINTNODE_NOT_CONFIGURED',
        error: 'PrintNode aún no está configurado; usa la impresión manual.',
      }, { status: 503 });
    }

    // 1. Obtener el PDF con multi-intento (gateway → ML directo → fallback local)
    const { buffer, source } = await fetchLabel(mlId);
    
    // 2. Extraer solo la primera página
    const singlePage = await extractFirstPage(buffer);

    const sourceLabel = 
      source === 'gateway' ? 'ML Gateway' :
      source === 'ml-direct' ? 'ML Directo' :
      'Local (fallback)';

    console.log(`[PrintRoute] Etiqueta obtenida desde ${sourceLabel} para ${mlId}`);

    const result = await printPdfWithPrintNode({
      purpose: 'PACKING',
      stationName: station,
      pdf: singlePage,
      title: `Etiqueta ML-${mlId}`,
    });
    if (!result.printed) return NextResponse.json({ ...result, source: sourceLabel }, { status: 503 });
    return NextResponse.json({ success: true, ...result, source: sourceLabel });

  } catch (error: any) {
    console.error('[PrintRoute] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
