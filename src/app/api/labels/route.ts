import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/labels?ids=id1,id2,id3&size=small|medium
 * Genera HTML imprimible con etiquetas de barcode para los productos seleccionados.
 * Usa JsBarcode en el cliente (se carga vía CDN en el HTML generado).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const ids = req.nextUrl.searchParams.get('ids')?.split(',') || [];
  const counts = req.nextUrl.searchParams.get('counts')?.split(',') || [];
  const size = req.nextUrl.searchParams.get('size') || 'medium';

  if (ids.length === 0) return NextResponse.json({ error: 'Sin productos seleccionados' }, { status: 400 });

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { suppliers: { include: { supplier: true } } },
  });

  // Expandir productos según counts
  const expandedProducts: any[] = [];
  products.forEach((p, index) => {
    const count = counts[index] ? parseInt(counts[index]) : 1;
    for (let i = 0; i < count; i++) {
      expandedProducts.push(p);
    }
  });

  const labelWidth = size === 'small' ? '50mm' : size === 'large' ? '100mm' : '70mm';
  const labelHeight = size === 'small' ? '25mm' : size === 'large' ? '50mm' : '35mm';
  const fontSize = size === 'small' ? '7px' : size === 'large' ? '11px' : '9px';
  const barcodeMaxHeight = size === 'small' ? '12mm' : size === 'large' ? '25mm' : '17mm';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Etiquetas — León Import</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <style>
    @page { size: auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Arial', sans-serif; padding: 2mm; }
    .label-grid { display: flex; flex-wrap: wrap; gap: 2mm; }
    .label {
      width: ${labelWidth};
      height: ${labelHeight};
      border: 0.5px solid #ccc;
      padding: 1.5mm 2mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      page-break-inside: avoid;
      overflow: hidden;
    }
    .label-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5mm;
    }
    .label-brand {
      font-weight: 900;
      font-size: ${fontSize};
      color: #9B1B30;
    }
    .label-name {
      font-size: ${fontSize};
      font-weight: bold;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 0.5mm;
    }
    .label-price {
      font-size: calc(${fontSize} + 2px);
      font-weight: 900;
    }
    .barcode-container { 
      text-align: center; 
      display: flex; 
      justify-content: center; 
      align-items: center;
      flex: 1;
      min-h: 0;
    }
    .barcode-container svg { 
      max-width: 100%; 
      max-height: ${barcodeMaxHeight}; 
      height: auto; 
    }
    @media print {
      .no-print { display: none !important; }
      .label { border: 0.1px solid #eee; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="padding: 10px; background: #222; color: white; margin: -2mm -2mm 10px -2mm; display: flex; gap: 15px; align-items: center; position: sticky; top: 0; z-index: 100;">
    <button onclick="window.print()" style="padding: 10px 30px; background: #9B1B30; color: white; border: none; border-radius: 8px; font-weight: 900; cursor: pointer; font-size: 14px; text-transform: uppercase;">
      🖨️ IMPRIMIR ${expandedProducts.length} ETIQUETAS
    </button>
    <span style="color: #aaa; font-size: 12px; font-weight: bold;">TAMAÑO: ${size.toUpperCase()}</span>
  </div>

  <div class="label-grid">
    ${expandedProducts.map((p, idx) => `
      <div class="label">
        <div class="label-header">
          <span class="label-brand">LEÓN IMPORT</span>
          ${p.salePrice ? `<span class="label-price">$${new Intl.NumberFormat('es-CL').format(p.salePrice)}</span>` : ''}
        </div>
        <div class="label-name">${p.name}</div>
        <div class="barcode-container">
          <svg id="barcode-${idx}" class="barcode" data-sku="${p.sku}"></svg>
        </div>
      </div>
    `).join('')}
  </div>

  <script>
    document.querySelectorAll('.barcode').forEach(el => {
      JsBarcode('#' + el.id, el.dataset.sku, {
        format: 'CODE128',
        width: 1.5,
        height: ${size === 'small' ? 20 : size === 'large' ? 40 : 30},
        fontSize: ${size === 'small' ? 10 : 13},
        margin: 2,
        textMargin: 2,
        displayValue: true,
      });
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
