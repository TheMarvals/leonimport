/**
 * Servicio de etiquetas multi-intento:
 * 1. Gateway (proxy ML) — rápido, canal oficial
 * 2. API de ML directa — fallback si el gateway falla
 * 3. Etiqueta local generada con pdf-lib — último recurso
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { prisma } from './prisma';

const ML_API_BASE = 'https://api.mercadolibre.com';
const GATEWAY_URL = () => process.env.ML_GATEWAY_URL || 'https://gateway.themarvals.com';
const GATEWAY_API_KEY = () => process.env.ML_GATEWAY_API_KEY || '';
const ML_ACCOUNT_ID = () => process.env.ML_ACCOUNT_ID || 'a7c9cdcf-4fbb-4e39-be78-a69bfea76d70';

type LabelResult = {
  buffer: Buffer;
  source: 'gateway' | 'ml-direct' | 'fallback';
};

/**
 * Obtiene un access_token de ML desde el gateway.
 */
async function getMLToken(): Promise<string | null> {
  try {
    const url = `${GATEWAY_URL()}/api/accounts/${ML_ACCOUNT_ID()}/token`;
    const res = await fetch(url, {
      headers: { 'x-api-key': GATEWAY_API_KEY() },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

/**
 * Intento 1: Obtener etiqueta desde el gateway.
 */
async function fetchFromGateway(mlId: string): Promise<Buffer | null> {
  const gatewayUrl = GATEWAY_URL();
  const apiKey = GATEWAY_API_KEY();
  if (!gatewayUrl || !apiKey) return null;

  try {
    const response = await fetch(`${gatewayUrl}/api/shipments/external/${mlId}/labels`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.error(`[LabelService] Gateway error ${response.status}:`, await response.text().catch(() => ''));
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('[LabelService] Gateway fetch error:', err);
    return null;
  }
}

/**
 * Intento 2: Obtener etiqueta desde la API de ML directamente.
 * 
 * Estrategia:
 * - Si mlId parece shipment ID (16+ dígitos), intentar shipments/{id}/labels
 * - Si parece order ID (11 dígitos), buscar la orden primero para obtener shipping.id
 */
async function fetchFromMLDirect(mlId: string): Promise<Buffer | null> {
  const token = await getMLToken();
  if (!token) return null;

  const headers = { 'Authorization': `Bearer ${token}` };
  const isShipmentId = mlId.length < 14;

  try {
    if (isShipmentId) {
      // Intentar obtener etiqueta directamente desde shipments API
      const shipRes = await fetch(`${ML_API_BASE}/shipments/${mlId}/labels`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (shipRes.ok) {
        const buf = Buffer.from(await shipRes.arrayBuffer());
        if (buf.length > 100) return buf;
      }
      // Si falla, buscar shipment details para debugging
      const detailRes = await fetch(`${ML_API_BASE}/shipments/${mlId}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (detailRes.ok) {
        const data = await detailRes.json();
        if (data.logistic_type === 'self_service') {
          console.log(`[LabelService] Orden ${mlId} es FLEX — sin etiqueta ML`);
          return null;
        }
      }
    }

    // Intentar como order ID: buscar la orden para obtener shipping.id
    const orderRes = await fetch(`${ML_API_BASE}/orders/${mlId}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (orderRes.ok) {
      const order = await orderRes.json();
      const shippingId = order.shipping?.id;
      if (shippingId) {
        const shipRes = await fetch(`${ML_API_BASE}/shipments/${shippingId}/labels`, {
          headers,
          signal: AbortSignal.timeout(10000),
        });
        if (shipRes.ok) {
          const buf = Buffer.from(await shipRes.arrayBuffer());
          if (buf.length > 100) return buf;
        }
      } else {
        console.log(`[LabelService] Orden ${mlId} no tiene shipping asociado`);
      }
    }

    return null;
  } catch (err) {
    console.error('[LabelService] ML direct fetch error:', err);
    return null;
  }
}

/**
 * Intento 3: Generar una etiqueta de packing local con pdf-lib.
 */
async function generateFallbackLabel(mlId: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  
  // Cargar fuente estándar (Courier para código de barras simulado)
  const font = await pdfDoc.embedFont(StandardFonts.CourierBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Courier);

  // Página de etiqueta tamaño 4x6 inches (aprox 300x450 puntos)
  const width = 300;
  const height = 450;
  const page = pdfDoc.addPage([width, height]);

  const drawCentered = (text: string, y: number, size: number, bold: boolean = false) => {
    const f = bold ? font : fontRegular;
    const textWidth = f.widthOfTextAtSize(text, size);
    const x = (width - textWidth) / 2;
    page.drawText(text, { x, y, size, font: f, color: rgb(0, 0, 0) });
  };

  // ── Header ──
  drawCentered('LEON IMPORT', height - 40, 16, true);
  drawCentered('PACKING LABEL', height - 60, 12, true);

  // Línea separadora
  page.drawLine({
    start: { x: 20, y: height - 80 },
    end: { x: width - 20, y: height - 80 },
    thickness: 2,
    color: rgb(0, 0, 0),
  });

  // ── Información de la orden ──
  drawCentered(`Orden ML: ${mlId}`, height - 110, 10, true);

  // Fecha
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  drawCentered(`Fecha: ${dateStr}`, height - 130, 8);

  // ── Código de barras simulado ──
  const barcodeY = height - 200;
  const barcodeText = mlId;
  const barcodeFontSize = 18;
  const barcodeWidth = font.widthOfTextAtSize(barcodeText, barcodeFontSize);
  const barcodeX = (width - barcodeWidth) / 2;

  // Dibujar barras simuladas (líneas verticales)
  let barX = barcodeX;
  for (let i = 0; i < barcodeText.length; i++) {
    const char = barcodeText[i];
    const barWidth = char === '1' ? 4 : char === '0' ? 2 : 3;
    const barHeight = 50 - (parseInt(char, 10) || 5) * 2;

    page.drawRectangle({
      x: barX,
      y: barcodeY - barHeight,
      width: barWidth,
      height: barHeight,
      color: rgb(0, 0, 0),
    });

    barX += barWidth + 2;
  }

  // Texto del código debajo
  drawCentered(barcodeText, barcodeY - 25, 8, true);

  // ── Pie ──
  page.drawLine({
    start: { x: 20, y: 50 },
    end: { x: width - 20, y: 50 },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  drawCentered('León Import WMS', 30, 7);
  drawCentered('Etiqueta generada localmente', 18, 6);

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Obtiene el PDF de la etiqueta para una orden.
 * 
 * Estrategia multi-intento:
 * 1. Gateway → más rápido, canal oficial
 * 2. API de ML directa → fallback si gateway no funciona
 * 3. Fallback local → siempre funciona
 */
export async function fetchLabel(mlId: string): Promise<LabelResult> {
  // Look up real shipping ID from DB (mlId is now ML order ID, but labels need shipping ID)
  const order = await prisma.order.findUnique({ 
    where: { mlId },
    select: { shippingId: true, mlOrderId: true }
  });
  const shippingId = order?.shippingId || mlId;
  const mlOrderId = order?.mlOrderId ? String(order.mlOrderId) : mlId;

  // 1. Gateway (uses shipping ID — the external ID the gateway expects)
  const gatewayBuf = await fetchFromGateway(shippingId);
  if (gatewayBuf && gatewayBuf.length > 100) {
    console.log(`[LabelService] ✅ Etiqueta obtenida desde gateway para ${mlId} (shippingId=${shippingId})`);
    return { buffer: gatewayBuf, source: 'gateway' };
  }

  // 2. ML directo (uses shipping ID for direct API call)
  const mlBuf = await fetchFromMLDirect(shippingId);
  if (mlBuf && mlBuf.length > 100) {
    console.log(`[LabelService] ✅ Etiqueta obtenida desde ML directo para ${mlId} (shippingId=${shippingId})`);
    return { buffer: mlBuf, source: 'ml-direct' };
  }

  // 3. Fallback local deshabilitado por requerimiento (siempre usar etiqueta oficial de ML)
  throw new Error(`No se pudo obtener la etiqueta oficial de MercadoLibre para la orden/envío ${mlId} (shippingId: ${shippingId})`);
}

/**
 * Extrae solo la primera página de un PDF (útil para labels que vienen con múltiples páginas).
 */
export async function extractFirstPage(pdfBuffer: Buffer): Promise<Buffer> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    if (pdfDoc.getPageCount() <= 1) return pdfBuffer;

    const newPdf = await PDFDocument.create();
    const [firstPage] = await newPdf.copyPages(pdfDoc, [0]);
    newPdf.addPage(firstPage);
    return Buffer.from(await newPdf.save());
  } catch {
    return pdfBuffer;
  }
}
