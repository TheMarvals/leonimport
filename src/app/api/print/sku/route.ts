import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { generateSkuLabelsPdf, getSkuLabelDimensions } from '@/lib/sku-label-pdf';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !['BODEGUERO', 'SUPERVISOR', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  try {
    const { ids, counts = [], size = 'medium' } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
      return NextResponse.json({ error: 'Selecciona entre 1 y 200 productos' }, { status: 400 });
    }
    const skuPrinter = await prisma.printerConfig.findFirst({
      where: { purpose: 'SKU', isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { printerName: true, labelSize: true },
    });
    if (!skuPrinter) return NextResponse.json({ fallback: true, code: 'PRINTER_NOT_ASSIGNED' }, { status: 503 });

    const products = await prisma.product.findMany({
      where: { id: { in: ids.map(String) } },
      select: { id: true, sku: true, name: true },
    });
    const byId = new Map(products.map(product => [product.id, product]));
    const labels: { sku: string; name: string }[] = [];
    ids.forEach((id: string, index: number) => {
      const product = byId.get(String(id));
      const copies = Math.min(500, Math.max(1, Number.parseInt(String(counts[index] || 1), 10) || 1));
      if (product) for (let copy = 0; copy < copies; copy++) labels.push(product);
    });
    if (labels.length > 500) return NextResponse.json({ error: 'Máximo 500 etiquetas por trabajo' }, { status: 400 });

    const selectedSize = skuPrinter.labelSize || String(size);
    const pdf = await generateSkuLabelsPdf(labels, selectedSize);
    return NextResponse.json({
      ready: true,
      provider: 'qz',
      printerName: skuPrinter.printerName,
      pdfBase64: Buffer.from(pdf).toString('base64'),
      jobName: `Etiquetas SKU (${labels.length})`,
      size: getSkuLabelDimensions(selectedSize),
    });
  } catch (error: any) {
    console.error('[SKU Print] Error:', error);
    return NextResponse.json({ fallback: true, error: error.message || 'No se pudo imprimir' }, { status: 500 });
  }
}
