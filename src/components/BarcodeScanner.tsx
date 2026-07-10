'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, CameraOff, X, SwitchCamera } from 'lucide-react';

interface BarcodeScannerProps {
  /** Callback que se dispara al leer un código exitosamente */
  onScan: (code: string) => void;
  /** Si es true, muestra el visor de cámara siempre abierto (modo embedded) */
  embedded?: boolean;
  /** Texto descriptivo para el botón de abrir escáner */
  buttonLabel?: string;
}

/**
 * BarcodeScanner — Componente reutilizable de escaneo por cámara.
 * 
 * Usa la librería html5-qrcode para leer códigos de barras 1D (Code128, EAN, UPC)
 * y QR desde la cámara del teléfono o computadora.
 * 
 * Modos:
 * - Botón flotante (por defecto): Muestra un botón rojo que al presionar abre un modal de cámara.
 * - Embedded: Muestra el visor de cámara siempre visible en el layout.
 */
export default function BarcodeScanner({ onScan, embedded = false, buttonLabel = 'ESCANEAR' }: BarcodeScannerProps) {
  const [isOpen, setIsOpen] = useState(embedded);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cooldownRef = useRef(false);
  const mountedRef = useRef(true);

  /**
   * Mata agresivamente todos los tracks de video del navegador 
   * que hayan quedado huérfanos del escáner.
   */
  const killAllVideoTracks = useCallback(() => {
    try {
      // Buscar todos los <video> dentro de nuestro contenedor y matar sus streams
      const container = document.getElementById('barcode-scanner-region');
      if (container) {
        const videos = container.querySelectorAll('video');
        videos.forEach((video) => {
          const stream = video.srcObject as MediaStream | null;
          if (stream) {
            stream.getTracks().forEach(track => {
              track.stop();
            });
            video.srcObject = null;
          }
        });
      }
    } catch {
      // Ignorar errores de cleanup
    }
  }, []);

  const stopScanner = useCallback(async () => {
    // 1. Detener la instancia de html5-qrcode
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState?.();
        // Solo intentar stop() si el scanner está escaneando (state 2)
        if (state === 2) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear?.();
      } catch {
        // Ignorar — puede fallar si ya estaba detenido
      }
      scannerRef.current = null;
    }

    // 2. Kill agresivo de los media tracks del navegador
    killAllVideoTracks();
  }, [killAllVideoTracks]);

  const startScanner = useCallback(async () => {
    if (!containerRef.current || !mountedRef.current) return;
    
    try {
      // Importar dinámicamente para evitar problemas con SSR en Next.js
      const { Html5Qrcode } = await import('html5-qrcode');

      // Limpiar instancia previa si existe
      await stopScanner();

      const scannerId = 'barcode-scanner-region';

      // Asegurar que el contenedor DOM existe y el componente sigue montado
      if (!document.getElementById(scannerId) || !mountedRef.current) return;
      
      const scanner = new Html5Qrcode(scannerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode },
        {
          fps: 30, // 30 FPS en lugar de 10 para mayor fluidez y captura rápida
          qrbox: { width: 280, height: 150 },
          aspectRatio: 1.777,
          disableFlip: true, // Desactivar la búsqueda de códigos invertidos (espejo) duplica la velocidad de procesamiento
        },
        (decodedText: string) => {
          if (!mountedRef.current) return;
          // Cooldown para evitar lecturas duplicadas rápidas
          if (cooldownRef.current) return;
          cooldownRef.current = true;

          setLastCode(decodedText);
          onScan(decodedText);

          // Vibrar el teléfono como feedback háptico (si el navegador lo soporta)
          if (navigator.vibrate) {
            navigator.vibrate(150);
          }

          // Cooldown de 1.5 segundos entre lecturas
          setTimeout(() => {
            cooldownRef.current = false;
            if (mountedRef.current) setLastCode(null);
          }, 1500);
        },
        () => {
          // Ignorar errores de frames sin código detectado (es normal)
        }
      );

      if (mountedRef.current) setError(null);
    } catch (err: any) {
      console.error('Error al iniciar cámara:', err);
      if (!mountedRef.current) return;
      if (err.toString().includes('NotAllowedError')) {
        setError('Permiso de cámara denegado. Habilita el acceso a la cámara en la configuración de tu navegador.');
      } else if (err.toString().includes('NotFoundError')) {
        setError('No se encontró una cámara disponible en este dispositivo.');
      } else {
        setError('Error al acceder a la cámara. Verifica los permisos.');
      }
    }
  }, [facingMode, onScan, stopScanner]);

  // Iniciar/detener escáner cuando se abre o cierra
  useEffect(() => {
    if (isOpen) {
      // Delay mínimo para que el DOM renderice el contenedor
      const timer = setTimeout(() => startScanner(), 100);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
    }
  }, [isOpen, startScanner, stopScanner]);

  // Cleanup agresivo al desmontar el componente
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Forzar cierre síncrono e inmediato de la cámara al desmontar
      if (scannerRef.current) {
        try {
          scannerRef.current.stop?.().catch?.(() => {});
          scannerRef.current.clear?.();
        } catch {
          // No importa si falla
        }
        scannerRef.current = null;
      }
      // Kill agresivo de todos los tracks de video del contenedor
      killAllVideoTracks();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cambiar cámara (frontal <-> trasera)
  const toggleCamera = async () => {
    await stopScanner();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // Reiniciar escáner cuando cambia facingMode
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => startScanner(), 200);
      return () => clearTimeout(timer);
    }
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    stopScanner();
    setIsOpen(false);
    setError(null);
    setLastCode(null);
  };

  // Modo botón flotante
  if (!isOpen && !embedded) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="bg-wms-surface border border-wms-border hover:bg-white/10 text-wms-muted hover:text-white px-5 py-3 rounded-2xl font-black text-xs md:text-sm transition-all active:scale-95 flex items-center justify-center gap-2.5 w-full uppercase tracking-wider"
      >
        <Camera size={20} /> {buttonLabel === 'ESCANEAR' ? 'CÁMARA' : buttonLabel}
      </button>
    );
  }

  // Vista del escáner (modal o embedded)
  const scannerView = (
    <div ref={containerRef} className="relative w-full">
      {/* Controles superiores */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-leon-red rounded-full animate-pulse" />
          <span className="text-xs font-black text-wms-muted uppercase tracking-widest">Cámara activa</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleCamera}
            className="bg-wms-surface border border-wms-border text-wms-muted hover:text-white p-2 rounded-xl transition-colors"
            title="Cambiar cámara"
          >
            <SwitchCamera size={16} />
          </button>
          {!embedded && (
            <button
              onClick={close}
              className="bg-wms-surface border border-wms-border text-wms-muted hover:text-leon-red p-2 rounded-xl transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Contenedor de la cámara */}
      <div className="relative rounded-2xl overflow-hidden border-2 border-wms-border bg-black">
        <div id="barcode-scanner-region" className="w-full" />
        
        {/* Overlay de éxito al leer */}
        {lastCode && (
          <div className="absolute inset-0 bg-green-500/20 border-4 border-green-500 rounded-2xl flex items-center justify-center z-20 animate-in fade-in duration-200">
            <div className="bg-green-500 text-black px-6 py-3 rounded-2xl font-black text-lg shadow-2xl">
              ✓ {lastCode}
            </div>
          </div>
        )}
      </div>

      {/* Mensaje de error */}
      {error && (
        <div className="mt-3 bg-leon-red/10 border border-leon-red/20 text-leon-red p-4 rounded-2xl text-sm font-bold flex items-start gap-3">
          <CameraOff size={20} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <p className="text-center text-wms-muted/40 text-[10px] mt-3 uppercase tracking-widest font-black">
        Apunta la cámara al código de barras del producto
      </p>
    </div>
  );

  // Si es embedded, renderizar directamente
  if (embedded) {
    return <div className="w-full">{scannerView}</div>;
  }

  // Modal flotante
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-wms-bg border border-wms-border rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        {scannerView}
      </div>
    </div>
  );
}
