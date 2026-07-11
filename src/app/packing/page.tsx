'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Box, CheckCircle, Search, Printer, Scan, ChevronRight, Camera, AlertTriangle, Grid3X3 } from 'lucide-react';
import { getHighResImageUrl } from '@/lib/image-utils';
import { showToast, showConfirmModal, showModalAlert } from '@/lib/toast';
import BarcodeScanner from '@/components/BarcodeScanner';
import { usePhysicalScanner } from '@/hooks/usePhysicalScanner';

interface Product {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  mlAliases: string[];
}

interface OrderItem {
  id: string;
  quantityTotal: number;
  quantityPicked: number;
  mlImageUrl: string | null;
  product: Product;
}

interface Order {
  id: string;
  mlId: string;
  shippingId: string | null;
  status: string;
  lockedBy?: string | null;
  isFlex: boolean;
  priorityMessage: string | null;
  buyerName: string | null;
  cubicle: { id: string; number: number } | null;
  cubicleNumber: number | null;
  items: OrderItem[];
}

export default function PackingPage() {
  const queryClient = useQueryClient();
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [lastScannedItem, setLastScannedItem] = useState<OrderItem | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Estado local para llevar la cuenta de lo que el Packer ya metió en la caja
  const [packedQuantities, setPackedQuantities] = useState<Record<string, number>>({});
  const [packingMethods, setPackingMethods] = useState<string[]>([]);
  const [isPrinting, setIsPrinting] = useState(false);

  // React Query: fetching de estaciones
  const { data: stationData, isLoading: stationLoading } = useQuery({
    queryKey: ['packing', 'station'],
    queryFn: () => fetch('/api/packing/station').then(r => r.json()),
    staleTime: 15 * 1000,
  });

  // React Query: fetching de órdenes
  const { data: orders = [], isLoading: loading } = useQuery({
    queryKey: ['orders', 'packing'],
    queryFn: () => fetch('/api/packing').then(r => r.json()),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  // Agrupar órdenes por shippingId (si no es nulo) para mostrarlas y procesarlas juntas
  const groupedOrdersList = useMemo(() => {
    const map = new Map<string, Order[]>();
    const singles: Order[] = [];

    for (const o of orders) {
      if (o.shippingId) {
        const existing = map.get(o.shippingId);
        if (existing) {
          existing.push(o);
        } else {
          map.set(o.shippingId, [o]);
        }
      } else {
        singles.push(o);
      }
    }

    const groups: Order[] = [];

    for (const [shippingId, groupOrders] of map.entries()) {
      if (groupOrders.length === 1) {
        groups.push(groupOrders[0]);
      } else {
        const sortedGroup = [...groupOrders].sort((a, b) => a.mlId.localeCompare(b.mlId));
        const primary = sortedGroup[0];

        // Combinar items
        const mergedItems: OrderItem[] = [];
        const itemMap = new Map<string, OrderItem>();

        for (const o of sortedGroup) {
          for (const item of o.items) {
            const existing = itemMap.get(item.product.id);
            if (existing) {
              existing.quantityTotal += item.quantityTotal;
              existing.quantityPicked += item.quantityPicked;
            } else {
              const clone = { ...item };
              itemMap.set(item.product.id, clone);
              mergedItems.push(clone);
            }
          }
        }

        const mergedOrder: Order = {
          id: primary.id,
          mlId: sortedGroup.map(o => o.mlId).join(' + '),
          shippingId: shippingId,
          status: 'PACKING',
          lockedBy: primary.lockedBy,
          isFlex: sortedGroup.some(o => o.isFlex),
          priorityMessage: sortedGroup.find(o => o.priorityMessage)?.priorityMessage || primary.priorityMessage,
          buyerName: sortedGroup.map(o => o.buyerName).filter(Boolean).join(' / ') || primary.buyerName,
          cubicle: primary.cubicle,
          cubicleNumber: primary.cubicleNumber,
          items: mergedItems,
        };
        groups.push(mergedOrder);
      }
    }

    return [...groups, ...singles];
  }, [orders]);

  // Sincronizar estación activa desde los datos cacheados
  useEffect(() => {
    if (stationData?.activeStation && !selectedStation) {
      setSelectedStation(stationData.activeStation);
    }
  }, [stationData, selectedStation]);

  const stations = stationData?.details ?? [];

  const fetchStations = () => {
    queryClient.invalidateQueries({ queryKey: ['packing', 'station'] });
  };

  const selectStation = async (stationName: string) => {
    try {
      const res = await fetch('/api/packing/station', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LOCK', stationName })
      });
      const data = await res.json();
      if (res.ok) {
        setSelectedStation(stationName);
        fetchStations();
        fetchOrders();
        showToast(`Mesa ${stationName} seleccionada.`, 'success');
      } else {
        showToast(data.error || 'Error al bloquear la mesa', 'error');
        fetchStations();
      }
    } catch (error) {
      showToast('Error de conexión al seleccionar mesa', 'error');
    }
  };

  const releaseStation = async () => {
    const confirmResult = await showConfirmModal(
      '¿Deseas liberar esta mesa de trabajo?',
      'La mesa quedará disponible para otros operarios.',
      'Sí, liberar'
    );
    if (!confirmResult.isConfirmed) return;

    try {
      const res = await fetch('/api/packing/station', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UNLOCK' })
      });
      if (res.ok) {
        setSelectedStation('');
        fetchStations();
        showToast('Mesa liberada con éxito.', 'info');
      }
    } catch (error) {
      showToast('Error al liberar la mesa', 'error');
    }
  };



  const packItem = useCallback((itemId: string, method: 'SCANNER' | 'CAMERA' | 'MANUAL' = 'MANUAL') => {
    setPackingMethods(prev => prev.includes(method) ? prev : [...prev, method]);
    setPackedQuantities(prev => {
      const current = prev[itemId] || 0;
      const item = activeOrder?.items.find(i => i.id === itemId);
      if (item && current < item.quantityPicked) {
        return { ...prev, [itemId]: current + 1 };
      }
      return prev;
    });
  }, [activeOrder]);

  const handleScan = useCallback((sku: string, method: 'SCANNER' | 'CAMERA' = 'SCANNER') => {
    if (!activeOrder) return;
    const normalizedCode = sku.toLowerCase();
    const item = activeOrder.items.find(i =>
      i.product.sku.toLowerCase() === normalizedCode ||
      (i.product.mlAliases || []).some(alias => alias.toLowerCase() === normalizedCode)
    );
    if (item) {
      setLastScannedItem(item);
      packItem(item.id, method);
    } else {
      setScanError(`SKU no encontrado: ${sku}`);
      
      try {
        const audio = new Audio('/error-beep.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } catch (e) {}

      setTimeout(() => setScanError(null), 3000);
    }
  }, [activeOrder, packItem]);

  // Lector Global de Pistola de Barcodes / Escáner Físico
  usePhysicalScanner(useCallback((code) => handleScan(code, 'SCANNER'), [handleScan]), !!activeOrder);

  const fetchOrders = () => {
    queryClient.invalidateQueries({ queryKey: ['orders', 'packing'] });
  };

  const startPacking = async (orderId: string) => {
    if (!selectedStation) {
      showToast('Por favor, selecciona una mesa de empaque primero.', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/packing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'START_PACKING', orderId })
      });
      if (res.ok) {
        const fullOrder = groupedOrdersList.find(o => o.id === orderId);
        if (fullOrder) {
          setActiveOrder(fullOrder);
          const initialCounts: Record<string, number> = {};
          fullOrder.items.forEach(i => initialCounts[i.id] = 0);
          setPackedQuantities(initialCounts);
          setPackingMethods([]);
          queryClient.invalidateQueries({ queryKey: ['cubicles'] });
        }
      } else {
        showToast('La orden ya fue tomada por otro usuario.', 'error');
        fetchOrders();
      }
    } catch (err) {
      console.error('Error al iniciar packing:', err);
      showToast('Error de conexión. Verifica bloqueos en tu red o navegador.', 'error');
    }
  };

  const completePacking = async () => {
    if (!activeOrder || !selectedStation) return;
    const primaryMlId = activeOrder.mlId.split(' + ')[0];
    const labelUrl = `/api/packing/label/${primaryMlId}`;

    // Debe abrirse durante el clic del usuario. Si esperamos la respuesta del
    // servidor, Chrome considera la pestaña un popup y puede bloquearla.
    const printTab = window.open('about:blank', '_blank');
    if (printTab) {
      printTab.document.title = 'Preparando etiqueta...';
      printTab.document.body.innerHTML = '<p style="font-family:sans-serif;padding:24px">Preparando etiqueta de MercadoLibre...</p>';
    }

    let res;
    try {
      res = await fetch('/api/packing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'COMPLETE_PACKING', 
          orderId: activeOrder.id,
          station: selectedStation,
          methods: packingMethods
        })
      });
    } catch (err) {
      printTab?.close();
      console.error('Error al completar packing:', err);
      showToast('Error de conexión al despachar la orden.', 'error');
      return;
    }
    if (!res.ok) {
      printTab?.close();
      const error = await res.json().catch(() => ({}));
      showToast(error.error || 'No se pudo completar el despacho.', 'error');
      return;
    }

    if (res.ok) {
      // 1. Cerrar packing y mostrar loader de impresión
      setIsPrinting(true);

      // Cargar el PDF en la pestaña que ya fue autorizada por el navegador.
      if (printTab && !printTab.closed) {
        printTab.location.href = labelUrl;
      }

      const finalize = () => {
        setIsPrinting(false);
        showToast('¡Orden despachada exitosamente!', 'success');
        setActiveOrder(null);
        setPackedQuantities({});
        fetchOrders();
      };

      try {
        const printRes = await fetch('/api/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mlId: primaryMlId })
        });

        if (printRes.ok) {
          // Impresión directa exitosa — cerrar la pestaña temporal de fallback
          if (printTab && !printTab.closed) {
            printTab.close();
          }
          finalize();
        } else {
          const printError = await printRes.json().catch(() => ({}));
          console.warn('[Packing] Impresión directa falló:', printError.error || printRes.statusText);
          if (!printTab) {
            showModalAlert('Impresión manual requerida', 'El navegador bloqueó la pestaña. Habilita ventanas emergentes para wms.leonexpress.cl y usa Reimprimir desde el historial.', 'warning');
          } else {
            showToast('Etiqueta abierta para impresión manual.', 'info');
          }
          finalize();
        }
      } catch (err) {
        console.error('Error en impresión automática:', err);
        if (!printTab) {
          showModalAlert('Impresión manual requerida', 'Habilita ventanas emergentes para wms.leonexpress.cl y usa Reimprimir desde el historial.', 'warning');
        }
        finalize();
      }
    }
  };

  const cancelPacking = async () => {
    if (!activeOrder) return;
    
    const confirmResult = await showConfirmModal(
      '¿Deseas cancelar la auditoría?',
      'La orden volverá a la lista de empaque.',
      'Sí, cancelar'
    );
    if (!confirmResult.isConfirmed) return;

    try {
      const res = await fetch('/api/packing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CANCEL_PACKING', orderId: activeOrder.id })
      });
      if (res.ok) {
        setActiveOrder(null);
        setPackedQuantities({});
        fetchOrders();
        showToast('Auditoría cancelada.', 'info');
      }
    } catch (err) {
      console.error('Error al cancelar packing:', err);
      showToast('Error de conexión al cancelar la orden.', 'error');
    }
  };

  // VISTAS
  if (loading && !activeOrder) {
    return <div className="min-h-screen bg-wms-bg flex items-center justify-center text-wms-muted">Cargando órdenes...</div>;
  }

  // Si no se ha seleccionado mesa, obligar a seleccionar una de las 6 mesas
  if (!selectedStation) {
    return (
      <div className="flex min-h-screen min-h-[100svh] flex-col justify-between bg-wms-bg font-sans text-wms-text">
        <div className="leon-brand-bar" />
        <div className="mx-auto my-auto w-full max-w-4xl space-y-7 p-4 sm:p-6 md:space-y-10 md:p-12">
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-black uppercase tracking-tight text-white sm:text-4xl md:text-5xl">
              SELECCIÓN DE <span className="text-leon-red">MESA DE TRABAJO</span>
            </h1>
            <p className="text-wms-muted max-w-xl mx-auto text-sm md:text-base leading-relaxed">
              Selecciona tu mesa de empaque para comenzar. Tu mesa quedará <span className="text-leon-red-light font-bold">bloqueada y asignada</span> a tu usuario para evitar duplicidades en el armado.
            </p>
          </div>

          {stationLoading ? (
            <div className="text-center py-12 text-wms-muted text-lg animate-pulse">
              Consultando estado de las mesas en tiempo real...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {stations.map((st: any) => {
                const isLockedByOthers = st.isLocked && !st.isMine;
                return (
                  <button
                    key={st.name}
                    disabled={isLockedByOthers}
                    onClick={() => selectStation(st.name)}
                    className={`relative h-40 overflow-hidden rounded-2xl border p-5 text-left transition-all group flex flex-col justify-between active:scale-95 sm:h-48 sm:rounded-3xl sm:p-6 ${
                      isLockedByOthers
                        ? 'bg-wms-surface/30 border-wms-border opacity-50 cursor-not-allowed'
                        : 'bg-wms-surface border-wms-border hover:border-leon-red/50 shadow-lg hover:shadow-[0_0_30px_rgba(155,27,48,0.15)] cursor-pointer'
                    }`}
                  >
                    {/* Background glows */}
                    {!isLockedByOthers && (
                      <div className="absolute inset-0 bg-gradient-to-br from-leon-red/0 via-leon-red/0 to-leon-red/5 group-hover:to-leon-red/10 transition-all duration-300" />
                    )}

                    <div className="flex justify-between items-start w-full relative z-10">
                      <span className="text-3xl font-black text-white font-mono">{st.name}</span>
                      {isLockedByOthers ? (
                        <span className="bg-leon-red/10 border border-leon-red/20 text-leon-red text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
                          Ocupada
                        </span>
                      ) : (
                        <span className="bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-black uppercase px-2.5 py-1 rounded-full animate-pulse">
                          Disponible
                        </span>
                      )}
                    </div>

                    <div className="mt-auto relative z-10">
                      {isLockedByOthers ? (
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase font-black text-wms-muted">Asignada a:</p>
                          <p className="text-sm font-bold text-white truncate">{st.lockedByUserName}</p>
                        </div>
                      ) : (
                        <span className="text-xs font-black uppercase tracking-wider text-leon-red-light group-hover:text-red-300 transition-colors flex items-center gap-1.5">
                          Asignarse a esta mesa <ChevronRight size={14} />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-center pt-4">
            <Link
              href="/"
              className="text-wms-muted hover:text-white font-bold text-sm uppercase tracking-wider transition-colors flex items-center gap-2"
            >
              <ArrowLeft size={16} /> Volver al Inicio
            </Link>
          </div>
        </div>
        <p className="text-center text-wms-muted/20 text-xs py-6">León Import WMS • Control de Estaciones</p>
      </div>
    );
  }

  // VISTA 1: Lista de Órdenes a Empacar
  if (!activeOrder) {
    return (
      <div className="min-h-screen bg-wms-bg text-wms-text font-sans">
        <div className="leon-brand-bar" />
        <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0">
            <div className="flex items-center gap-4">
              <Link href="/" className="p-2.5 bg-wms-surface border border-wms-border hover:border-leon-red/50 text-wms-muted hover:text-white rounded-full hover:bg-leon-red/10 transition-all shadow-sm shrink-0">
                <ArrowLeft size={20} strokeWidth={3} />
              </Link>
              <h1 className="text-2xl md:text-3xl font-black text-white truncate">
                ZONA DE <span className="text-leon-red">PACKING</span>
              </h1>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex-1 sm:flex-none bg-leon-red/10 border border-leon-red/20 px-4 py-2.5 rounded-xl flex items-center justify-between sm:justify-start gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-2 bg-leon-red h-2 rounded-full animate-ping" />
                  <span className="text-xs font-black text-leon-red-light uppercase tracking-tight">{selectedStation}</span>
                </div>
                <button 
                  onClick={releaseStation}
                  className="text-wms-muted hover:text-leon-red text-xs font-bold transition-colors uppercase tracking-wide border-l border-leon-red/20 pl-3"
                >
                  Liberar
                </button>
              </div>

              <button onClick={fetchOrders} className="flex-1 sm:flex-none bg-wms-surface hover:bg-white/5 border border-wms-border text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all">
                <Search size={16} /> Actualizar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groupedOrdersList
              .sort((a, b) => {
                if (a.isFlex && !b.isFlex) return -1;
                if (!a.isFlex && b.isFlex) return 1;
                return 0;
              })
              .length === 0 ? (
              <div className="col-span-full py-12 text-center text-wms-muted bg-wms-surface rounded-2xl border border-wms-border border-dashed">
                <Box size={48} className="mx-auto mb-4 opacity-20" />
                No hay órdenes listas para empaque.
              </div>
            ) : groupedOrdersList
              .sort((a, b) => {
                if (a.isFlex && !b.isFlex) return -1;
                if (!a.isFlex && b.isFlex) return 1;
                return 0;
              })
              .map(o => (
              <div key={o.id} className={`bg-wms-surface border p-4 sm:p-6 rounded-2xl flex flex-col justify-between gap-5 sm:gap-6 hover:border-leon-red/50 transition-colors relative overflow-hidden ${o.isFlex ? 'border-leon-red/50 bg-leon-red/5' : 'border-wms-border'}`}>
                {o.isFlex && (
                   <div className="absolute top-0 right-0">
                    <div className="bg-leon-red text-white text-[8px] font-black px-3 py-0.5 uppercase tracking-widest rounded-bl-lg shadow-lg">
                      FLEX
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-black text-white">ML-{o.mlId}</h3>
                    {o.shippingId && o.shippingId !== o.mlId && (
                      <span className="block text-[10px] text-wms-muted font-mono font-normal mt-0.5">Envío: {o.shippingId}</span>
                    )}
                    <div className="mt-1">
                       <p className="text-wms-muted text-sm">Esperando validación</p>
                       {o.priorityMessage && (
                         <p className="text-leon-red-light text-[10px] font-black uppercase mt-1 flex items-center gap-1">
                           <AlertTriangle size={10} /> {o.priorityMessage}
                         </p>
                       )}
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-leon-red/20 text-leon-red-light">
                    {o.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <Grid3X3 size={20} className="shrink-0 text-amber-400" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/70">Retirar desde</p>
                    <p className="font-black text-white">Cubículo {o.cubicleNumber ?? o.cubicle?.number ?? 'sin asignar'}</p>
                  </div>
                </div>
                <button onClick={() => startPacking(o.id)} className="w-full bg-leon-red hover:bg-leon-red-light text-white py-4 rounded-xl font-black text-lg transition-transform active:scale-95 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(155,27,48,0.2)]">
                  <Box size={20} /> COMENZAR EMPAQUE
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // VISTA 2: Empaque en Progreso
  const currentItem = activeOrder.items.find(i => (packedQuantities[i.id] || 0) < i.quantityPicked);
  const isOrderFullyPacked = activeOrder.items.every(i => packedQuantities[i.id] === i.quantityPicked);

  return (
    <div className="flex min-h-screen min-h-[100svh] flex-col bg-wms-bg font-sans text-wms-text">
      <div className="leon-brand-bar" />
      
      {/* Header Packing */}
      <div className="bg-wms-surface border-b border-wms-border p-3 md:p-4 flex items-center justify-between sticky top-0 z-10 shadow-2xl">
        <div className="min-w-0">
          <h2 className="text-xs md:text-lg font-black text-wms-muted uppercase tracking-widest leading-none mb-1">Auditoría de Orden</h2>
          <p className="text-leon-red font-black text-lg md:text-xl italic tracking-tighter truncate">ML-{activeOrder.mlId}</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-400"><Grid3X3 size={11} /> Retirada del cubículo {activeOrder.cubicleNumber ?? activeOrder.cubicle?.number ?? '—'}</p>
        </div>
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <button 
            onClick={cancelPacking}
            className="text-wms-muted hover:text-leon-red text-[9px] md:text-xs font-black uppercase transition-colors px-3 py-2 border border-wms-border hover:border-leon-red/30 rounded-lg md:rounded-xl">
            Cancelar
          </button>
          {isOrderFullyPacked && (
            <button onClick={completePacking} className="bg-green-600 hover:bg-green-500 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-black text-xs md:text-sm flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-green-600/20 uppercase tracking-widest">
              <Printer size={16} /> <span className="hidden md:inline">Despachar</span><span className="md:hidden">Fin</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Layout de dos columnas para Imagen Grande e Ítems */}
      <div className="relative flex flex-1 flex-col overflow-visible p-3 lg:overflow-hidden md:p-8">


        {/* Toast de Error de Escaneo */}
        {scanError && (
          <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-red-600 text-white px-5 py-3 rounded-full font-black text-sm md:text-base shadow-[0_0_20px_rgba(220,38,38,0.5)] animate-in slide-in-from-top-4 fade-in flex items-center gap-2 max-w-[90vw] text-center">
            <AlertTriangle size={20} />
            {scanError}
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-visible rounded-[1.5rem] border border-wms-border bg-wms-surface shadow-2xl lg:flex-row lg:overflow-hidden md:rounded-[2.5rem]">

        
        {/* PANEL IZQUIERDO: Imagen Grande (Confirmación Visual) */}
        <div className="w-full lg:w-1/2 bg-black/20 border-b lg:border-b-0 lg:border-r border-wms-border p-4 md:p-6 flex flex-col items-center justify-center space-y-4 md:space-y-6 shrink-0 lg:shrink">
          {(currentItem || lastScannedItem) ? (
            <div className="w-full animate-in fade-in zoom-in duration-300">
              <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-2xl border-2 border-leon-red/30 bg-wms-surface shadow-[0_0_50px_rgba(155,27,48,0.2)] sm:max-w-[280px] md:max-w-[500px] md:rounded-3xl md:border-4">
                {(currentItem?.mlImageUrl || currentItem?.product.imageUrl || lastScannedItem?.mlImageUrl || lastScannedItem?.product.imageUrl) ? (
                  <Image src={getHighResImageUrl(currentItem?.mlImageUrl || currentItem?.product.imageUrl || lastScannedItem?.mlImageUrl || lastScannedItem?.product.imageUrl)!} alt="Producto" fill className="object-contain p-2 md:p-4" sizes="(max-width: 768px) 280px, 500px" />
                ) : (
                  <Box size={80} className="text-wms-muted opacity-20 md:w-[120px] md:h-[120px]" />
                )}
                {/* Badge de cantidad si es mayor a 1 */}
                {currentItem && currentItem.quantityPicked > 1 && (
                  <div className="absolute top-4 right-4 md:top-6 md:right-6 bg-leon-red text-white w-12 h-12 md:w-16 md:h-16 rounded-full flex flex-col items-center justify-center shadow-xl border-2 md:border-4 border-wms-bg">
                    <span className="text-[8px] md:text-xs font-black uppercase leading-none">Faltan</span>
                    <span className="text-lg md:text-2xl font-black">{currentItem.quantityPicked - (packedQuantities[currentItem.id] || 0)}</span>
                  </div>
                )}
              </div>
              <div className="mt-4 md:mt-8 text-center px-2">
                <p className="text-lg md:text-2xl font-black text-leon-red-light font-mono tracking-tighter mb-1">{currentItem?.product.sku || lastScannedItem?.product.sku}</p>
                <h3 className="text-xl md:text-4xl font-black text-white leading-none uppercase max-w-lg mx-auto line-clamp-2 md:line-clamp-none">{currentItem?.product.name || lastScannedItem?.product.name}</h3>
                <div className="mt-3 md:mt-6 flex items-center justify-center gap-3 md:gap-4">
                  {currentItem ? (
                    <>
                      <span className="text-wms-muted text-sm md:text-lg font-bold uppercase tracking-widest">Item Actual</span>
                      <div className="bg-leon-red text-white px-4 py-1 md:px-6 md:py-2 rounded-full font-black text-xl md:text-2xl">
                        {currentItem.quantityPicked > 1 ? `${(packedQuantities[currentItem.id] || 0)} / ${currentItem.quantityPicked}` : 'ESPERANDO...'}
                      </div>
                    </>
                  ) : (
                    <div className="bg-green-500 text-black px-6 py-2 md:px-8 md:py-3 rounded-lg md:rounded-xl font-black text-xl md:text-3xl flex items-center gap-2">
                      <CheckCircle size={24} className="md:w-8 md:h-8" /> <span className="uppercase italic tracking-tighter">LISTA</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-3 md:space-y-4 opacity-30">
              <Scan size={60} className="mx-auto text-wms-muted md:w-20 md:h-20" />
              <p className="text-sm md:text-xl font-bold uppercase tracking-widest">Esperando Escaneo...</p>
            </div>
          )}
        </div>

        {/* PANEL DERECHO: Lista de ítems a auditar */}
        <div className="w-full lg:w-1/2 p-4 md:p-8 overflow-y-auto bg-wms-bg">
          <div className="mx-auto max-w-2xl space-y-5 pb-8 md:space-y-6 md:pb-20">
            
            <div className="mb-6 space-y-4 rounded-2xl border border-wms-border bg-wms-surface p-4 sm:p-6 md:mb-8">
              <div className="flex items-center gap-4">
                <div className="bg-leon-red/10 text-leon-red p-3 rounded-xl">
                  <Scan size={32} />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">Mesa de Armado</h3>
                  <p className="text-wms-muted text-sm">Escanea con pistola o usa la cámara del teléfono.</p>
                </div>
              </div>
              {/* Botón de escáner de cámara — solo si hay ítems pendientes */}
              {currentItem && (
                <BarcodeScanner
                  onScan={(code) => handleScan(code, 'CAMERA')}
                  buttonLabel="ABRIR CÁMARA"
                />
              )}
            </div>

            {/* ÍTEM ACTUAL (MÁS GRANDE) */}
            {currentItem && (
              <div className="space-y-2">
                <p className="text-[10px] md:text-xs font-black text-wms-muted uppercase tracking-widest ml-1">Ítem actual a procesar</p>
                <div className="bg-wms-surface border-2 md:border-4 border-leon-red rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-[0_0_30px_rgba(155,27,48,0.15)]">
                  <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
                    <div className="w-24 h-24 md:w-32 md:h-32 bg-wms-bg rounded-xl md:rounded-2xl border border-wms-border overflow-hidden flex-shrink-0 p-1 relative">
                      {currentItem.mlImageUrl || currentItem.product.imageUrl ? (
                        <Image src={getHighResImageUrl(currentItem.mlImageUrl || currentItem.product.imageUrl)!} alt={currentItem.product.name} fill className="object-contain" sizes="128px" />
                      ) : (
                        <Box size={32} className="text-wms-muted opacity-20 md:w-10 md:h-10" />
                      )}
                    </div>
                    <div className="flex-1 text-center md:text-left min-w-0 w-full">
                      <p className="text-leon-red font-black text-lg md:text-xl font-mono truncate">{currentItem.product.sku}</p>
                      <h4 className="text-lg md:text-2xl font-black text-white leading-tight uppercase mb-3 md:mb-4 line-clamp-2">{currentItem.product.name}</h4>
                      <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6">
                        <div className="bg-wms-bg border border-wms-border px-4 py-2 md:px-6 md:py-3 rounded-xl md:rounded-2xl w-full md:w-auto">
                          <span className="text-wms-muted text-[9px] md:text-xs font-bold block uppercase mb-0.5 md:mb-1">Progreso</span>
                          <span className="text-2xl md:text-4xl font-black text-white">{(packedQuantities[currentItem.id] || 0)} / {currentItem.quantityPicked}</span>
                        </div>
                        <button 
                          onClick={() => packItem(currentItem.id, 'MANUAL')}
                          className="group bg-wms-surface border border-wms-border hover:bg-white/10 text-wms-muted hover:text-white px-5 py-3 rounded-2xl font-black text-xs md:text-sm transition-all active:scale-95 flex items-center justify-center gap-2.5 uppercase tracking-wider w-full md:w-auto mt-2 md:mt-0">
                          <Scan size={18} className="group-active:scale-110 transition-transform" /> Validar manual (+1)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* LISTA RESTANTE (RESUMIDA) */}
            <div className="space-y-3 opacity-60">
              <p className="text-xs font-black text-wms-muted uppercase tracking-widest ml-1">Resto de la orden</p>
              {activeOrder.items.map(item => {
                const packed = packedQuantities[item.id] || 0;
                const isComplete = packed === item.quantityPicked;
                const isCurrent = currentItem?.id === item.id;

                if (isCurrent) return null; // No mostrar el actual en la lista secundaria

                return (
                  <div key={item.id} className={`bg-wms-surface border rounded-2xl p-3 flex items-center gap-4 transition-all ${isComplete ? 'border-green-500/30 opacity-40' : 'border-wms-border'}`}>
                    <div className="w-12 h-12 bg-wms-bg rounded-lg border border-wms-border/50 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                      {item.mlImageUrl || item.product.imageUrl ? (
                        <Image src={getHighResImageUrl(item.mlImageUrl || item.product.imageUrl)!} alt={item.product.name} fill className="object-cover" sizes="48px" />
                      ) : (
                        <Box size={16} className="text-wms-muted opacity-20" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-wms-muted font-mono font-bold text-[10px] truncate">{item.product.sku}</p>
                      <h4 className="text-sm font-bold text-white leading-tight truncate uppercase">{item.product.name}</h4>
                    </div>
                    <div className="flex items-center gap-3 pr-2">
                      <span className="text-xl font-black text-white">{packed} / {item.quantityPicked}</span>
                      {isComplete && <CheckCircle size={20} className="text-green-500" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* Loader de Impresión */}
      {isPrinting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 border border-white/20 animate-in zoom-in duration-300">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-leon-red/20 border-t-leon-red rounded-full animate-spin"></div>
              <Printer className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-leon-red animate-pulse" size={32} />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-black text-leon-black uppercase tracking-tight">Procesando Etiqueta</h3>
              <p className="text-leon-muted text-sm font-medium">Enviando a la SoonMark...</p>
            </div>
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-leon-red rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-leon-red rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-leon-red rounded-full animate-bounce"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
);
}
