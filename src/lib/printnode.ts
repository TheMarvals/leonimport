import { prisma } from './prisma';

const PRINTNODE_API = 'https://api.printnode.com';

export type PrintNodePrinter = {
  id: number;
  name: string;
  description?: string | null;
  state?: string | null;
  computer?: {
    id: number;
    name: string;
    state?: string | null;
  } | null;
};

export type PrintPurpose = 'PACKING' | 'SKU';

export type PrintAttempt =
  | { printed: true; provider: 'printnode'; jobId: string; printerName: string }
  | { printed: false; fallback: true; code: string; reason: string };

function apiKey(): string {
  return process.env.PRINTNODE_API_KEY?.trim() || '';
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${apiKey()}:`).toString('base64')}`,
    'Content-Type': 'application/json',
  };
}

export function isPrintNodeConfigured(): boolean {
  return apiKey().length > 0;
}

async function printNodeRequest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${PRINTNODE_API}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  });
}

export async function listPrintNodePrinters(): Promise<PrintNodePrinter[]> {
  if (!isPrintNodeConfigured()) return [];
  const response = await printNodeRequest('/printers');
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`PrintNode rechazó la consulta (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  return response.json();
}

async function getRemotePrinter(printNodeId: number): Promise<PrintNodePrinter | null> {
  const response = await printNodeRequest(`/printers/${printNodeId}`);
  if (!response.ok) return null;
  const data = await response.json();
  return (Array.isArray(data) ? data[0] : data) || null;
}

export async function printPdfWithPrintNode(input: {
  purpose: PrintPurpose;
  stationName?: string | null;
  pdf: Buffer | Uint8Array;
  title: string;
  copies?: number;
}): Promise<PrintAttempt> {
  if (!isPrintNodeConfigured()) {
    return {
      printed: false,
      fallback: true,
      code: 'PRINTNODE_NOT_CONFIGURED',
      reason: 'PrintNode aún no está configurado. Usa la impresión manual.',
    };
  }

  const printer = await prisma.printerConfig.findFirst({
    where: {
      purpose: input.purpose,
      isActive: true,
      ...(input.purpose === 'PACKING'
        ? { stationName: input.stationName || '__SIN_MESA__' }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!printer) {
    return {
      printed: false,
      fallback: true,
      code: 'PRINTER_NOT_ASSIGNED',
      reason: input.purpose === 'PACKING'
        ? `La ${input.stationName || 'mesa'} no tiene una impresora asignada.`
        : 'Bodega no tiene una impresora SKU asignada.',
    };
  }

  let remotePrinter: PrintNodePrinter | null;
  try {
    remotePrinter = await getRemotePrinter(printer.printNodeId);
  } catch {
    remotePrinter = null;
  }

  if (!remotePrinter || remotePrinter.state !== 'online') {
    return {
      printed: false,
      fallback: true,
      code: 'PRINTER_OFFLINE',
      reason: `La impresora ${printer.name} no está disponible en PrintNode.`,
    };
  }

  const response = await printNodeRequest('/printjobs', {
    method: 'POST',
    body: JSON.stringify({
      printerId: printer.printNodeId,
      title: input.title,
      contentType: 'pdf_base64',
      content: Buffer.from(input.pdf).toString('base64'),
      source: 'Leon Import WMS',
      expireAfter: 600,
      options: { copies: Math.max(1, input.copies || 1) },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return {
      printed: false,
      fallback: true,
      code: 'PRINTNODE_REJECTED_JOB',
      reason: `PrintNode rechazó el trabajo (${response.status})${detail ? `: ${detail}` : ''}`,
    };
  }

  return {
    printed: true,
    provider: 'printnode',
    jobId: (await response.text()).replaceAll('"', '').trim(),
    printerName: printer.name,
  };
}
