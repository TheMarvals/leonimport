import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { fetchLabel, extractFirstPage } from '@/lib/label-service';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { mlId, station } = await req.json();
    if (!mlId) return NextResponse.json({ error: 'Falta mlId' }, { status: 400 });
    if (!station) {
      return NextResponse.json({ fallback: true, code: 'STATION_REQUIRED', error: 'La orden no tiene una mesa asignada.' }, { status: 503 });
    }

    const printer = await prisma.printerConfig.findFirst({
      where: { purpose: 'PACKING', stationName: String(station), isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { printerName: true },
    });
    if (!printer) {
      return NextResponse.json({
        fallback: true,
        code: 'PRINTER_NOT_ASSIGNED',
        error: `No hay una impresora asignada a ${station}; usa la impresión manual.`,
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

    return NextResponse.json({
      ready: true,
      provider: 'qz',
      printerName: printer.printerName,
      pdfBase64: Buffer.from(singlePage).toString('base64'),
      jobName: `Etiqueta ML-${mlId}`,
      source: sourceLabel,
    });

  } catch (error: any) {
    console.error('[PrintRoute] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
