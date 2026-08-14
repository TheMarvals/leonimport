'use client';

let qzInstance: any = null;
let securityConfigured = false;

async function getQz() {
  if (!qzInstance) {
    const qzModule = await import('qz-tray');
    qzInstance = (qzModule as any).default || qzModule;
  }

  if (!securityConfigured) {
    securityConfigured = true;
    try {
      const certificateResponse = await fetch('/api/qz/certificate', { cache: 'no-store' });
      if (certificateResponse.ok) {
        const certificate = await certificateResponse.text();
        if (certificate.trim()) {
          qzInstance.security.setCertificatePromise((resolve: (value: string) => void) => resolve(certificate));
          qzInstance.security.setSignatureAlgorithm('SHA512');
          qzInstance.security.setSignaturePromise((request: string) => (
            (resolve: (value: string) => void, reject: (reason: unknown) => void) => {
              fetch('/api/qz/sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request }),
              })
                .then(response => response.ok ? response.json() : Promise.reject(new Error('No se pudo firmar el trabajo QZ')))
                .then(data => resolve(data.signature))
                .catch(reject);
            }
          ));
        }
      }
    } catch {
      // Sin certificado propio QZ funciona en modo Community mostrando su aviso.
    }
  }

  return qzInstance;
}

async function connectQz() {
  const qz = await getQz();
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 1, delay: 0.5 });
  }
  return qz;
}

export async function listLocalQzPrinters(): Promise<string[]> {
  const qz = await connectQz();
  const printers = await qz.printers.find();
  return Array.isArray(printers) ? printers : [printers].filter(Boolean);
}

export async function printPdfWithQz(input: {
  printerName: string;
  pdfBase64: string;
  jobName: string;
  size?: { width: number; height: number } | null;
}): Promise<void> {
  const qz = await connectQz();
  const printer = await qz.printers.find(input.printerName);
  const config = qz.configs.create(printer, {
    jobName: input.jobName,
    colorType: 'grayscale',
    interpolation: 'nearest-neighbor',
    ...(input.size ? { units: 'mm', size: input.size } : {}),
  });
  await qz.print(config, [{
    type: 'pixel',
    format: 'pdf',
    flavor: 'base64',
    data: input.pdfBase64,
  }]);
}
