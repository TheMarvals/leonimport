'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useScanner } from '@/hooks/useScanner';
import { audioService } from '@/lib/audio';
import { useWmsStore } from '@/store/useWmsStore';
import { showConfirmModal } from '@/lib/toast';
import { getHighResImageUrl } from '@/lib/image-utils';

interface PackingStationProps {
  stationNumber: number;
}

export const PackingStation: React.FC<PackingStationProps> = ({ stationNumber }) => {
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const { hasSyncConflict, conflictMessage, clearConflict } = useWmsStore();

  const handleScan = async (code: string) => {
    setError(null);
    
    // 1. Si no hay orden cargada, buscarla por ID de etiqueta
    if (!currentOrder) {
      try {
        const res = await fetch(`/api/packing/${code}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error al buscar orden');
        }
        const order = await res.json();
        setCurrentOrder(order);
        setCurrentItemIndex(0);
        audioService.playSuccess();
      } catch (err: any) {
        audioService.playError();
        setError(err.message);
      }
      return;
    }

    // 2. Si ya hay orden, validar si el código escaneado es el SKU del producto actual
    const currentItem = currentOrder.items[currentItemIndex];
    if (code === currentItem.product.sku) {
      handleNextItem();
    } else {
      audioService.playError();
      setError(`SKU Incorrecto: Escaneaste ${code} pero se esperaba ${currentItem.product.sku}`);
    }
  };

  const handleNextItem = () => {
    audioService.playSuccess();
    if (currentItemIndex < currentOrder.items.length - 1) {
      setCurrentItemIndex(prev => prev + 1);
    } else {
      setIsFinishing(true);
    }
  };

  const completePacking = async () => {
    if (!currentOrder) return;
    try {
      const res = await fetch('/api/packing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'COMPLETE_PACKING',
          orderId: currentOrder.id,
          station: `Mesa ${stationNumber}`
        })
      });
      if (res.ok) {
        audioService.playSuccess();
        setCurrentOrder(null);
        setCurrentItemIndex(0);
        setIsFinishing(false);
      } else {
        throw new Error('Error al cerrar orden');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useScanner({
    onScan: handleScan,
    onInvalidScan: (data) => {
      audioService.playError();
      setError(`Error de lectura: Ráfaga inestable (${data.deltaT}ms)`);
      fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'INVALID_SCAN',
          userId: 'station-' + stationNumber,
          metadata: { burst: data.burst, deltaT: data.deltaT, station: stationNumber },
        }),
      });
    },
  });

  const currentItem = currentOrder?.items[currentItemIndex];

  return (
    <div className="flex flex-col h-screen bg-wms-bg text-wms-text font-sans overflow-hidden">
      <div className="leon-brand-bar" />

      {/* Header */}
      <div className="bg-wms-surface p-4 border-b border-wms-border flex justify-between items-center shadow-xl">
        <h1 className="text-2xl font-black italic tracking-tighter">
          MESA DE ARMADO <span className="text-leon-red font-black">#{stationNumber}</span>
        </h1>
        <div className="flex items-center gap-4">
          {currentOrder && (
            <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-xl border border-wms-border">
              <span className="text-[10px] font-black text-wms-muted uppercase tracking-widest">Orden ML</span>
              <span className="text-sm font-black text-white">#{currentOrder.mlId}</span>
            </div>
          )}
          <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-[10px] font-black border border-green-500/30 uppercase tracking-widest">
            ● ONLINE
          </div>
        </div>
      </div>

      {/* Alerta de Conflicto */}
      {hasSyncConflict && (
        <div className="bg-amber-900/40 border-b-2 border-amber-500 p-4 flex items-center justify-between animate-pulse">
          <p className="text-amber-300 font-bold text-sm">⚠ {conflictMessage}</p>
          <button onClick={clearConflict} className="text-amber-500 underline text-sm font-black uppercase">Cerrar</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* FOTO GIGANTE (70%) */}
        <div className="w-[70%] bg-black relative flex items-center justify-center border-r border-wms-border group">
          {currentItem ? (
            <>
              <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden relative">
                <Image
                  src={getHighResImageUrl(currentItem.product.imageUrl) ?? ''}
                  alt=""
                  fill
                  className="object-cover blur-3xl scale-110"
                  sizes="70vw"
                />
              </div>
              <Image
                src={getHighResImageUrl(currentItem.product.imageUrl) ?? ''}
                alt={currentItem.product.name}
                fill
                className="object-contain p-12 transition-transform duration-500 group-hover:scale-105"
                priority
              />
              <div className="absolute top-8 right-8 flex flex-col gap-3">
                <div className="bg-leon-red text-white px-8 py-4 rounded-2xl text-5xl font-black shadow-[0_0_50px_rgba(235,33,46,0.3)]">
                  {currentItem.product.color || '---'}
                </div>
                {currentItem.product.size && (
                  <div className="bg-white text-black px-6 py-3 rounded-xl text-3xl font-black self-end shadow-2xl border-4 border-black">
                    TALLA: {currentItem.product.size}
                  </div>
                )}
              </div>
              
              {/* Indicador de Progreso */}
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-4">
                {currentOrder.items.map((_: any, idx: number) => (
                  <div 
                    key={idx} 
                    className={`h-4 w-12 rounded-full border transition-all duration-300 ${
                      idx === currentItemIndex ? 'bg-leon-red border-leon-red w-20' : 
                      idx < currentItemIndex ? 'bg-green-500 border-green-500 opacity-50' : 'bg-white/10 border-white/20'
                    }`} 
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="text-wms-muted flex flex-col items-center gap-8 animate-pulse">
              <div className="w-48 h-48 border-8 border-dashed border-wms-border rounded-full flex items-center justify-center">
                <span className="text-8xl">📦</span>
              </div>
              <div className="text-center">
                <p className="text-3xl font-black italic tracking-tighter text-white mb-2 uppercase">ESPERANDO ETIQUETA</p>
                <p className="text-wms-muted font-bold uppercase tracking-widest text-sm">Escanea el código de envío para comenzar</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 bg-red-950/90 backdrop-blur-md z-50 flex items-center justify-center p-12 text-center">
              <div className="bg-black p-12 border-4 border-leon-red rounded-[40px] shadow-[0_0_100px_rgba(235,33,46,0.4)] max-w-2xl">
                <h2 className="text-7xl font-black text-leon-red mb-6 italic tracking-tighter">¡ALERTA!</h2>
                <p className="text-3xl font-bold text-white mb-10 leading-relaxed uppercase">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="bg-leon-red hover:bg-white hover:text-leon-red text-white px-16 py-8 rounded-2xl text-3xl font-black transition-all transform active:scale-90 uppercase tracking-tighter"
                >
                  ENTENDIDO
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Controles (30%) */}
        <div className="w-[30%] p-8 flex flex-col justify-between bg-wms-surface border-l border-wms-border shadow-[-20px_0_40px_rgba(0,0,0,0.4)]">
          <div className="space-y-8">
            <div>
              <label className="text-wms-muted text-xs font-black uppercase tracking-widest mb-3 block">Producto Actual</label>
              <h2 className="text-4xl font-black leading-[1.1] italic tracking-tighter text-white">{currentItem?.product.name || '---'}</h2>
            </div>
            
            <div className="space-y-4">
              <div className="bg-wms-card p-6 rounded-2xl border border-wms-border relative overflow-hidden group">
                <div className="absolute inset-0 bg-leon-red/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <p className="text-[10px] text-wms-muted font-black uppercase tracking-widest mb-1">SKU Requerido</p>
                <p className="text-3xl font-mono font-black text-leon-red truncate tracking-tighter">
                  {currentItem?.product.sku || '---'}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-wms-card p-6 rounded-2xl border border-wms-border">
                  <p className="text-[10px] text-wms-muted font-black uppercase tracking-widest mb-1">Ítem</p>
                  <p className="text-4xl font-black italic">
                    {currentOrder ? `${currentItemIndex + 1}/${currentOrder.items.length}` : '--'}
                  </p>
                </div>
                <div className="bg-wms-card p-6 rounded-2xl border border-wms-border">
                  <p className="text-[10px] text-wms-muted font-black uppercase tracking-widest mb-1">Cantidad</p>
                  <p className="text-4xl font-black italic">x1</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {isFinishing ? (
              <button
                onClick={completePacking}
                className="w-full bg-green-500 hover:bg-green-400 text-black font-black text-3xl py-10 rounded-3xl shadow-[0_20px_40px_rgba(34,197,94,0.3)] transition-all transform active:scale-95 uppercase italic tracking-tighter"
              >
                CERRAR PAQUETE
              </button>
            ) : (
              <div className="bg-wms-card p-8 rounded-3xl border-2 border-dashed border-wms-border text-center">
                <p className="text-wms-muted font-black uppercase tracking-widest text-xs mb-4">Escanea el producto para validar</p>
                <div className="w-20 h-20 bg-leon-red/10 rounded-full flex items-center justify-center mx-auto animate-bounce">
                   <span className="text-4xl">🔫</span>
                </div>
              </div>
            )}
            
            <button
              className="w-full bg-transparent border-2 border-white/10 hover:bg-white/5 text-wms-muted font-bold text-sm py-4 rounded-xl transition-all uppercase tracking-widest"
              onClick={async () => {
                const confirmResult = await showConfirmModal(
                  '¿Cancelar armado?',
                  '¿Deseas cancelar el armado de esta orden?',
                  'Sí, cancelar'
                );
                if (confirmResult.isConfirmed) {
                   setCurrentOrder(null);
                   setCurrentItemIndex(0);
                   setIsFinishing(false);
                }
              }}
            >
              Cancelar Proceso
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
