'use client';
import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook para interceptar la lectura de un escáner físico (pistola QR/Barcode)
 * El escáner emula pulsaciones de teclado ultrarrápidas y termina en Enter.
 */
export function usePhysicalScanner(onScan: (code: string) => void, enabled: boolean = true) {
  const barcodeBuffer = useRef('');
  const lastKeyTime = useRef(0);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;

    // Ignorar si el usuario está escribiendo intencionalmente en un input/textarea (ej. buscador)
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    const currentTime = Date.now();
    const timeDiff = currentTime - lastKeyTime.current;

    // Si pasaron más de 100ms desde la última tecla, 
    // asumimos que es tipeo humano y limpiamos el buffer.
    if (timeDiff > 100 && barcodeBuffer.current.length > 0) {
      barcodeBuffer.current = '';
    }

    lastKeyTime.current = currentTime;

    if (e.key === 'Enter') {
      // Un código de barras válido generalmente tiene al menos 3 o 4 caracteres.
      if (barcodeBuffer.current.length > 3) {
        onScan(barcodeBuffer.current);
        barcodeBuffer.current = '';
        e.preventDefault();
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Guardamos la tecla impresa
      barcodeBuffer.current += e.key;
    }
  }, [onScan, enabled]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
