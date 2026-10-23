/** Etiquetas oficiales consultadas directamente en Mercado Libre. */
import { PDFDocument } from 'pdf-lib';
import { prisma } from './prisma';
import { fetchOfficialLabel } from './ml-label-api';

const LEGACY_ACCOUNT_ID = () => process.env.ML_ACCOUNT_ID || 'a7c9cdcf-4fbb-4e39-be78-a69bfea76d70';
type LabelResult = { buffer: Buffer; source: 'ml-direct' };

export async function fetchLabel(mlId: string): Promise<LabelResult> {
  const order = await prisma.order.findUnique({
    where: { mlId },
    select: { shippingId: true, mlOrderId: true, mlAccount: { select: { gatewayAccountId: true } } },
  });
  const accountId = order?.mlAccount?.gatewayAccountId || LEGACY_ACCOUNT_ID();
  const id = String(order?.shippingId || order?.mlOrderId || mlId);
  const kind = order?.shippingId ? 'shipment' : order?.mlOrderId || id.length >= 14 ? 'order' : 'shipment';
  const buffer = await fetchOfficialLabel(String(id), accountId, kind);
  return { buffer, source: 'ml-direct' };
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
