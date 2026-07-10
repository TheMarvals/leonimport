import { useEffect, useRef, useCallback } from 'react';

interface ScannerOptions {
  onScan: (sku: string) => void;
  onInvalidScan?: (data: { burst: string; deltaT: number }) => void;
  enabled?: boolean;
  minBurstSpeed?: number;  // ms máximo entre caracteres (100ms = tolera jitter)
  maxTotalTime?: number;   // ms máximo para la ráfaga completa
  prefixesToStrip?: string[]; // Prefijos de fábrica a sanitizar (ej: '00', 'ID')
}

/**
 * useScanner — Hook de Acero para captura HID profesional.
 * 
 * Blindajes:
 * - Safety Switch: ignora ráfagas si hay INPUT/TEXTAREA/modal enfocado.
 * - Discriminador de velocidad: rechaza entrada manual lenta.
 * - Sanitización de prefijos de hardware.
 * - preventDefault en TODA la ráfaga (incluido el primer carácter).
 */
export const useScanner = ({
  onScan,
  onInvalidScan,
  enabled = true,
  minBurstSpeed = 100,
  maxTotalTime = 300,
  prefixesToStrip = ['00'],
}: ScannerOptions) => {
  const buffer = useRef<string>('');
  const lastKeyTime = useRef<number>(0);
  const burstStartTime = useRef<number>(0);
  const isBursting = useRef<boolean>(false);

  // Estabilizar callbacks para evitar re-registros innecesarios del listener
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onInvalidScanRef = useRef(onInvalidScan);
  onInvalidScanRef.current = onInvalidScan;

  const sanitizeSku = useCallback(
    (raw: string): string => {
      let clean = raw.trim();
      for (const prefix of prefixesToStrip) {
        if (clean.startsWith(prefix)) {
          clean = clean.slice(prefix.length);
        }
      }
      return clean;
    },
    [prefixesToStrip],
  );

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Safety Switch: no interceptar si hay un campo de texto enfocado
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[data-scanner-ignore]') // Escape hatch para modals
      ) {
        return;
      }

      const now = Date.now();
      const timeSinceLastKey = now - lastKeyTime.current;

      // 2. Detectar inicio de ráfaga
      if (buffer.current === '') {
        burstStartTime.current = now;
        isBursting.current = false;
      }

      // 3. ¿Velocidad de escáner o humano?
      const isRapid = timeSinceLastKey < minBurstSpeed || buffer.current === '';

      if (isRapid) {
        // Después del 2do carácter rápido, confirmar que es una ráfaga
        if (buffer.current.length >= 1) {
          isBursting.current = true;
        }

        // Bloquear TODOS los caracteres de la ráfaga (incluido el primero del Enter)
        if (isBursting.current) {
          e.preventDefault();
          e.stopPropagation();
        }

        if (e.key === 'Enter') {
          // Siempre prevenir el Enter del escáner
          e.preventDefault();
          e.stopPropagation();

          const totalTime = now - burstStartTime.current;

          if (totalTime < maxTotalTime && buffer.current.length > 3) {
            onScanRef.current(sanitizeSku(buffer.current));
          } else if (buffer.current.length > 3) {
            onInvalidScanRef.current?.({ burst: buffer.current, deltaT: totalTime });
          }

          buffer.current = '';
          isBursting.current = false;
        } else if (e.key.length === 1) {
          buffer.current += e.key;
        }
      } else {
        // Entrada lenta = humano. Resetear buffer.
        buffer.current = e.key.length === 1 ? e.key : '';
        burstStartTime.current = now;
        isBursting.current = false;
      }

      lastKeyTime.current = now;
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enabled, minBurstSpeed, maxTotalTime, sanitizeSku]);
};
