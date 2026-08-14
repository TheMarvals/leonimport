import { createCanvas } from 'canvas';
import JsBarcode from 'jsbarcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type SkuLabelProduct = { sku: string; name: string };

const MM_TO_PT = 72 / 25.4;
const LABEL_SIZES = {
  small: { width: 50, height: 25 },
  medium: { width: 70, height: 35 },
  large: { width: 100, height: 50 },
} as const;

function safeText(value: string): string {
  return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '').trim();
}

function fitText(text: string, maxChars: number): string {
  const cleaned = safeText(text);
  return cleaned.length <= maxChars ? cleaned : `${cleaned.slice(0, Math.max(1, maxChars - 3))}...`;
}

export async function generateSkuLabelsPdf(products: SkuLabelProduct[], size: string): Promise<Uint8Array> {
  const dimensions = LABEL_SIZES[size as keyof typeof LABEL_SIZES] || LABEL_SIZES.medium;
  const width = dimensions.width * MM_TO_PT;
  const height = dimensions.height * MM_TO_PT;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const product of products) {
    const page = pdf.addPage([width, height]);
    const padding = 5;
    const titleSize = dimensions.width <= 50 ? 6 : dimensions.width >= 100 ? 9 : 7;
    const nameSize = dimensions.width <= 50 ? 6 : dimensions.width >= 100 ? 9 : 7;

    page.drawText('LEON IMPORT', { x: padding, y: height - padding - titleSize, size: titleSize, font: bold, color: rgb(0.61, 0.11, 0.19) });
    page.drawText(fitText(product.name, dimensions.width <= 50 ? 34 : dimensions.width >= 100 ? 75 : 50), {
      x: padding,
      y: height - padding - titleSize - nameSize - 3,
      size: nameSize,
      font: regular,
      color: rgb(0.05, 0.05, 0.05),
    });

    const canvas = createCanvas(Math.max(320, Math.round(width * 3)), 150);
    JsBarcode(canvas, product.sku, {
      format: 'CODE128',
      width: 2,
      height: 65,
      margin: 4,
      fontSize: 20,
      displayValue: true,
      background: '#ffffff',
      lineColor: '#000000',
    });
    const barcode = await pdf.embedPng(canvas.toBuffer('image/png'));
    const availableHeight = Math.max(22, height - titleSize - nameSize - 20);
    const scale = Math.min((width - padding * 2) / barcode.width, availableHeight / barcode.height);
    const barcodeWidth = barcode.width * scale;
    const barcodeHeight = barcode.height * scale;
    page.drawImage(barcode, {
      x: (width - barcodeWidth) / 2,
      y: 3,
      width: barcodeWidth,
      height: barcodeHeight,
    });
  }

  return pdf.save();
}
