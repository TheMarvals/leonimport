'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Package, CheckCircle, AlertTriangle, Scan, Search, ChevronRight, Camera, RefreshCw } from 'lucide-react';
import { getHighResImageUrl } from '@/lib/image-utils';
import { showToast, showConfirmModal } from '@/lib/toast';
import BarcodeScanner from '@/components/BarcodeScanner';
import { usePhysicalScanner } from '@/hooks/usePhysicalScanner';
import Image from 'next/image';
import { CategoryIcon } from '@/components/CategoryIcon';

interface Location {
  id: string;
  aisle: string;
  section: string;
  level: string;
  sequenceIndex: number;
}

interface ProductLocation {
  id: string;
  quantity: number;
  location: Location;
}

const FAMILY_LABELS: Record<number, string> = {
  1000: 'Cables', 2000: 'Adaptadores', 3000: 'Soportes',
  4000: 'Pantallas', 5000: 'Deportes', 6000: 'Ropa',
  7000: 'Calzado', 8000: 'Pantalones', 10000: 'Electrónica',
  11000: 'Electrodomésticos', 12000: 'Hogar', 13000: 'Iluminación',
  14000: 'Herramientas', 15000: 'Kits', 16000: 'Belleza',
  17000: 'Papelería',
};

function FamilyBadge({ family }: { family: number | null }) {
  if (!family) return null;
  return (
    <span className="inline-flex items-center gap-1 bg-wms-card border border-wms-border px-2 py-0.5 rounded text-[10px] font-bold tracking-tight">
      <CategoryIcon family={family} size={12} />
      {FAMILY_LABELS[family] || `Fam. ${family}`}
    </span>
  );
}

interface Product {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  categoryFamily: number | null;
  locations: ProductLocation[];
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
  createdAt: string;
  isFlex: boolean;
  priorityMessage: string | null;
  buyerName?: string;
  items: OrderItem[];
}

export default function PickingPage() {
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  
  // Estado para saber qué ítem de la orden estamos pickeando actualmente
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncCooldown, setSyncCooldown] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [pickingSearchTerm, setPickingSearchTerm] = useState('');
  const [refreshingOrder, setRefreshingOrder] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // React Query: fetching de órdenes con caché de 30s
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', 'picking'],
    queryFn: () => fetch('/api/picking').then(r => r.json()),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000, // Auto-refresh cada 30s
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
          createdAt: primary.createdAt,
          status: sortedGroup.some(o => o.status === 'PICKING') ? 'PICKING' : 'PENDING',
          isFlex: sortedGroup.some(o => o.isFlex),
          priorityMessage: sortedGroup.find(o => o.priorityMessage)?.priorityMessage || primary.priorityMessage,
          buyerName: sortedGroup.map(o => o.buyerName).filter(Boolean).join(' / ') || primary.buyerName,
          items: mergedItems,
        };
        groups.push(mergedOrder);
      }
    }

    return [...groups, ...singles];
  }, [orders]);

  // Al retomar una orden parcial, ubicar el primer producto que aún tenga
  // unidades pendientes respetando el mismo orden S-Shape de la vista.
  const getResumeItemIndex = useCallback((order: Order) => {
    const sorted = [...order.items].sort((a, b) => {
      const locA = a.product.locations.find(l => l.quantity > 0)?.location?.sequenceIndex || 999999;
      const locB = b.product.locations.find(l => l.quantity > 0)?.location?.sequenceIndex || 999999;
      return locA - locB;
    });

    const progressByProduct = new Map<string, { total: number; picked: number }>();
    const productOrder: string[] = [];

    for (const item of sorted) {
      const progress = progressByProduct.get(item.product.id);
      if (progress) {
        progress.total += item.quantityTotal;
        progress.picked += item.quantityPicked;
      } else {
        progressByProduct.set(item.product.id, {
          total: item.quantityTotal,
          picked: item.quantityPicked,
        });
        productOrder.push(item.product.id);
      }
    }

    const pendingIndex = productOrder.findIndex(productId => {
      const progress = progressByProduct.get(productId);
      return progress ? progress.picked < progress.total : false;
    });

    return pendingIndex >= 0 ? pendingIndex : Math.max(0, productOrder.length - 1);
  }, []);

  // Si hay una orden que ya está en PICKING, reanudarla
  useEffect(() => {
    if (!activeOrder) {
      const inProgress = groupedOrdersList.find((o: Order) => o.status === 'PICKING');
      if (inProgress) {
        setCurrentItemIndex(getResumeItemIndex(inProgress));
        setActiveOrder(inProgress);
      }
    }
  }, [groupedOrdersList, activeOrder, getResumeItemIndex]);

  // Timer para el cooldown de sincronización
  // Mutación: sincronización con ML
  const syncMutation = useMutation({
    mutationFn: () => fetch('/api/sync/ml', { method: 'POST' }).then(r => r.json()),
    onSuccess: (data) => {
      showToast(`Sincronización exitosa: ${data.imported} importadas, ${data.resolutionRequired} requieren resolución, ${data.skipped} omitidas`, 'success');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSyncCooldown(30);
    },
    onError: (err) => {
      showToast('Error de conexión con el Gateway.', 'error');
    },
  });

  // Mutación: refrescar orden individual
  const refreshMutation = useMutation({
    mutationFn: (orderId: string) =>
      fetch('/api/sync/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      }).then(r => r.json()),
    onSuccess: (data, orderId) => {
      if (data.order) {
        queryClient.setQueryData(['orders', 'picking'], (old: Order[]) =>
          old.map(o => o.id === orderId ? { ...o, ...data.order } : o)
        );
      }
    },
    onError: () => showToast('Error de conexión al refrescar la orden.', 'error'),
  });

  // Mutación: picking actions (start, cancel, complete, pick)
  const pickingMutation = useMutation({
    mutationFn: (payload: any) =>
      fetch('/api/picking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Error en picking');
        }
        return res.json();
      }),
    onError: (err: Error, payload: any) => {
      if (payload.action === 'START_PICKING') {
        showToast('No se pudo iniciar el picking: ' + err.message, 'error');
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      }
    },
  });

  useEffect(() => {
    if (syncCooldown > 0) {
      const timer = setTimeout(() => setSyncCooldown(syncCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [syncCooldown]);

  // Ordenar órdenes FIFO: más antiguas primero (por createdAt)
  const sortedOrders = useMemo(() => {
    return [...groupedOrdersList].sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [groupedOrdersList]);

  // Filtrar órdenes por categoría (familia de producto) y término de búsqueda
  const filteredOrders = useMemo(() => {
    let result = sortedOrders;
    
    if (pickingSearchTerm.trim()) {
      const term = pickingSearchTerm.toLowerCase().trim();
      const cleanTerm = term.startsWith('ml-') ? term.substring(3) : term;
      
      result = result.filter(o => 
        o.mlId.toLowerCase().includes(cleanTerm) ||
        (o.shippingId && o.shippingId.toLowerCase().includes(term)) ||
        (o.buyerName && o.buyerName.toLowerCase().includes(term)) ||
        o.items.some(i => i.product.sku.toLowerCase().includes(term))
      );
    }
    
    if (!categoryFilter) return result;
    const fam = parseInt(categoryFilter);
    return result.filter(o =>
      o.items.some(i => i.product.categoryFamily === fam)
    );
  }, [sortedOrders, categoryFilter, pickingSearchTerm]);

  const syncML = async () => {
    if (syncCooldown > 0) return;
    setSyncing(true);
    await syncMutation.mutateAsync();
    setSyncing(false);
  };

  const fetchOrders = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  }, [queryClient]);

  const startPicking = async (orderId: string) => {
    try {
      await pickingMutation.mutateAsync({ action: 'START_PICKING', orderId });
      const fullOrder = groupedOrdersList.find(o => o.id === orderId);
      if (fullOrder) {
        setCurrentItemIndex(getResumeItemIndex(fullOrder));
        setActiveOrder({ ...fullOrder, status: 'PICKING' });
      }
    } catch {
      // Error handled in onError callback
    }
  };

  const refreshOrder = async (orderId: string) => {
    setRefreshingOrder(orderId);
    await refreshMutation.mutateAsync(orderId);
    setRefreshingOrder(null);
  };

  const cancelPicking = async () => {
    if (!activeOrder) return;
    
    const confirmResult = await showConfirmModal(
      '¿Reiniciar esta recolección?',
      'Se borrará todo el avance de esta orden y el stock recolectado volverá al inventario.',
      'Sí, reiniciar'
    );
    if (!confirmResult.isConfirmed) return;

    try {
      await pickingMutation.mutateAsync({ action: 'CANCEL_PICKING', orderId: activeOrder.id });
      queryClient.setQueryData<Order[]>(['orders', 'picking'], (cachedOrders = []) =>
        cachedOrders.map(order => {
          const belongsToActiveGroup = activeOrder.shippingId
            ? order.shippingId === activeOrder.shippingId
            : order.id === activeOrder.id;

          return belongsToActiveGroup
            ? {
                ...order,
                status: 'PENDING',
                items: order.items.map(item => ({ ...item, quantityPicked: 0 }))
              }
            : order;
        })
      );
      setActiveOrder(null);
      setCurrentItemIndex(0);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      showToast('Recolección reiniciada. La orden volvió a su estado inicial.', 'info');
    } catch (err: any) {
      showToast('Error al cancelar: ' + err.message, 'error');
    }
  };

  const completePicking = async () => {
    if (!activeOrder) return;
    try {
      await pickingMutation.mutateAsync({ action: 'COMPLETE_PICKING', orderId: activeOrder.id });
      setActiveOrder(null);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch {}
  };

  // Ordenar los ítems de la orden activa por la ubicación S-Shape más cercana
  const sortedItems = useMemo(() => {
    if (!activeOrder) return [];
    return [...activeOrder.items].sort((a, b) => {
      // Tomamos la primera ubicación que tenga stock > 0
      const locA = a.product.locations.find(l => l.quantity > 0)?.location?.sequenceIndex || 999999;
      const locB = b.product.locations.find(l => l.quantity > 0)?.location?.sequenceIndex || 999999;
      return locA - locB;
    });
  }, [activeOrder]);

  // Agrupar ítems por producto (mismo SKU aparece una sola vez con cantidad total)
  interface GroupedItem {
    orderItemIds: string[];
    product: Product;
    quantityTotal: number;
    quantityPicked: number;
    mlImageUrl: string | null;
  }

  const groupedItems = useMemo(() => {
    const map = new Map<string, GroupedItem>();
    for (const item of sortedItems) {
      const existing = map.get(item.product.id);
      if (existing) {
        existing.quantityTotal += item.quantityTotal;
        existing.quantityPicked += item.quantityPicked;
        existing.orderItemIds.push(item.id);
      } else {
        map.set(item.product.id, {
          product: item.product,
          orderItemIds: [item.id],
          quantityTotal: item.quantityTotal,
          quantityPicked: item.quantityPicked,
          mlImageUrl: item.mlImageUrl,
        });
      }
    }
    return Array.from(map.values());
  }, [sortedItems]);

  const currentGroupItem = groupedItems[currentItemIndex];
  
  // Ubicación preferida (la que tiene stock)
  const preferredLoc = currentGroupItem?.product.locations.find(l => l.quantity > 0);
  const currentTotalStock = currentGroupItem?.product.locations?.reduce((acc: number, l: any) => acc + l.quantity, 0) || 0;

  const pickItem = async (quantityToPick: number, method: 'SCANNER' | 'CAMERA' | 'MANUAL' = 'MANUAL') => {
    if (!activeOrder || !currentGroupItem) return;

    // Bloquear recolección si el stock total en sistema es 0
    if (currentTotalStock === 0) {
      // Retornar silenciosamente porque la UI ya muestra advertencias gigantes
      return;
    }
    
    if (currentGroupItem.quantityPicked + quantityToPick > currentGroupItem.quantityTotal) {
      setScanError(`¡No puedes procesar más de ${currentGroupItem.quantityTotal} unidades de este producto!`);
      setTimeout(() => setScanError(null), 3000);
      return;
    }

    // Optimistic UI update: incrementar solo el primer OrderItem no completado
    const firstPendingId = activeOrder.items.find(
      i => currentGroupItem.orderItemIds.includes(i.id) && i.quantityPicked < i.quantityTotal
    )?.id;
    const newItems = activeOrder.items.map(i => {
      if (i.id === firstPendingId) {
        return { ...i, quantityPicked: i.quantityPicked + quantityToPick };
      }
      return i;
    });
    setActiveOrder({ ...activeOrder, items: newItems });

    // Enviar a BD
    try {
      await fetch('/api/picking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'PICK_ITEM',
          orderId: activeOrder.id,
          productId: currentGroupItem.product.id,
          orderItemIds: currentGroupItem.orderItemIds,
          locationId: preferredLoc?.location.id || null,
          quantityToPick,
          method
        })
      });
    } catch (err) {
      console.error('Error al enviar pick a BD:', err);
    }

    // Si ya completamos este producto, avanzar al siguiente
    const totalNow = currentGroupItem.quantityPicked + quantityToPick;
    if (totalNow >= currentGroupItem.quantityTotal) {
      setTimeout(() => {
        if (currentItemIndex < groupedItems.length - 1) {
          setCurrentItemIndex(prev => prev + 1);
        } else {
          console.log('Todos los ítems recolectados');
        }
      }, 600);
    }
  };

  const handleScan = useCallback((code: string, method: 'SCANNER' | 'CAMERA' = 'SCANNER') => {
    if (!activeOrder) return;
    
    // Buscar si el código existe en los items de la orden
    const isBarcodeMatch = (item: typeof activeOrder.items[0]) => {
      const normalizedCode = code.toLowerCase();
      const aliases = Array.isArray((item.product as any)?.mlAliases)
        ? ((item.product as any).mlAliases as string[])
        : [];

      if (item.product.sku.toLowerCase() === normalizedCode) return true;
      if (aliases.some(alias => alias.toLowerCase() === normalizedCode)) return true;
      return false;
    };

    const matchingItems = activeOrder.items.filter(isBarcodeMatch);
    const scannedItem = matchingItems.find(item => item.quantityPicked < item.quantityTotal);

    if (scannedItem) {
      // Asegurar que el ítem escaneado sea el que está activo en la vista
      if (scannedItem.product.id === currentGroupItem?.product.id) {
        pickItem(1, method);
      } else {
        // Si escanea otro producto de la orden, cambiar a ese producto y pickear
        const groupIndex = groupedItems.findIndex(g => g.product.id === scannedItem.product.id);
        if (groupIndex !== -1) {
          setCurrentItemIndex(groupIndex);
          setScanError(`Producto correcto, pero debes ir a su tarjeta. Desliza para encontrar ${scannedItem.product.name}.`);
          setTimeout(() => setScanError(null), 3000);
        }
      }
    } else if (matchingItems.length > 0) {
      setScanError(`¡Ya has recolectado todos los ${matchingItems[0].product.name} necesarios!`);
      setTimeout(() => setScanError(null), 3000);
    } else {
      setScanError(`Código ${code} no pertenece a esta orden.`);
      setTimeout(() => setScanError(null), 3000);
    }
  }, [activeOrder, currentGroupItem, pickItem, groupedItems]);

  // Hook para el escáner de pistola física
  usePhysicalScanner(useCallback((code) => handleScan(code, 'SCANNER'), [handleScan]), !!activeOrder);

  // VISTAS
  if (ordersLoading && !activeOrder) {
    return (
      <div className="min-h-screen bg-wms-bg flex flex-col items-center justify-center text-wms-muted gap-4">
        <div className="w-12 h-12 border-4 border-leon-red border-t-transparent rounded-full animate-spin" />
        <p className="font-bold uppercase tracking-widest text-sm">Cargando zona de picking...</p>
      </div>
    );
  }

  // VISTA 1: Lista de Órdenes a Recolectar
  if (!activeOrder) {
    return (
      <div className="min-h-screen bg-wms-bg text-wms-text font-sans">
        <div className="leon-brand-bar" />
        <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0">
            <div className="flex items-center gap-4">
              <Link href="/" className="p-2.5 bg-wms-card border border-wms-border hover:border-leon-red/50 text-wms-muted hover:text-white rounded-full hover:bg-leon-red/10 transition-all shadow-sm shrink-0">
                <ArrowLeft size={20} strokeWidth={3} />
              </Link>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tighter uppercase italic truncate">
                Picking <span className="text-leon-red drop-shadow-[0_0_12px_rgba(155,27,48,0.3)]">León</span>
              </h1>
            </div>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 md:gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-auto flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-wms-muted" size={14} />
                <input
                  type="text"
                  placeholder="Buscar ML-... / Comprador"
                  value={pickingSearchTerm}
                  onChange={(e) => setPickingSearchTerm(e.target.value)}
                  className="bg-wms-card border border-wms-border/60 hover:border-leon-red/40 text-white text-xs font-bold uppercase tracking-wider pl-8 pr-4 py-3 rounded-xl outline-none transition-colors w-full sm:w-48 md:w-64 shadow-sm"
                />
              </div>
              <div className="relative flex-1 sm:flex-initial">
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="bg-wms-card border border-wms-border/60 hover:border-leon-red/40 text-white text-xs font-bold uppercase tracking-wider pl-4 pr-10 py-3 rounded-xl appearance-none cursor-pointer transition-colors outline-none w-full sm:min-w-[140px] bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%236B7280%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-[right_14px_center] bg-no-repeat shadow-sm"
                >
                  <option value="">Categorías</option>
                  {Object.entries(FAMILY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <button onClick={fetchOrders} className="bg-wms-card hover:bg-white/5 border border-wms-border/60 hover:border-leon-red/45 text-white p-3 rounded-xl transition-all shadow-sm shrink-0">
                <RefreshCw size={16} className={ordersLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredOrders.length === 0 ? (
              <div className="col-span-full py-20 text-center text-wms-muted bg-wms-card border border-wms-border/60 rounded-[2rem] border-dashed">
                {categoryFilter ? (
                  <>
                    <Search size={64} className="mx-auto mb-4 opacity-10 text-leon-red" />
                    <p className="text-xl font-bold text-white/90">Sin resultados</p>
                    <p className="text-sm opacity-50 mt-1">No hay órdenes con la categoría seleccionada.</p>
                    <button onClick={() => setCategoryFilter('')}
                      className="mt-3 text-leon-red hover:text-leon-red-light text-xs font-bold uppercase tracking-wider transition-colors">
                      Limpiar filtro
                    </button>
                  </>
                ) : (
                  <>
                    <CheckCircle size={64} className="mx-auto mb-4 opacity-10 text-emerald-500" />
                    <p className="text-xl font-bold text-white/90">Todo listo por ahora.</p>
                    <p className="text-sm opacity-50 mt-1">No hay órdenes pendientes de recolección.</p>
                    <button onClick={syncML} disabled={syncing}
                      className="mt-4 bg-leon-red hover:bg-leon-red-light text-white px-8 py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-40 shadow-lg">
                      {syncing ? 'Sincronizando...' : 'Sincronizar con ML'}
                    </button>
                  </>
                )}
              </div>
            ) : filteredOrders.map(o => (
              <div key={o.id} className={`bg-wms-card border-wms-border/60 p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] hover:border-leon-red/50 transition-all duration-300 group shadow-xl flex flex-col justify-between gap-5 sm:gap-6 hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)] ${o.isFlex ? 'border-leon-red/40 bg-gradient-to-br from-leon-red/5 via-transparent to-transparent hover:border-leon-red/60' : 'border-wms-border'}`}>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-black text-white group-hover:text-leon-red transition-colors font-mono tracking-tight" title={`Pack: ML-${o.mlId}`}>
                          ML-{o.mlId}
                        </h3>
                        {o.isFlex && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-leon-red/10 border border-leon-red/35 text-leon-red-light">
                            FLEX
                          </span>
                        )}
                      </div>
                      {o.shippingId && o.shippingId !== o.mlId && (
                        <span className="block text-[10px] text-wms-muted font-mono font-normal mt-0.5">Envío: {o.shippingId}</span>
                      )}
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${o.status === 'PENDING' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-leon-red/10 border-leon-red/35 text-leon-red-light'}`}>
                      {o.status}
                    </span>
                  </div>

                  {/* Info general de cantidades y comprador */}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div className="flex items-center gap-1 text-wms-muted">
                      <Package size={13} />
                      <span className="font-semibold text-white/80">
                        {o.items.length} {o.items.length === 1 ? 'SKU' : 'SKUs'} ({o.items.reduce((acc: number, i: any) => acc + i.quantityTotal, 0)} uds)
                      </span>
                    </div>
                    {o.buyerName && (
                      <span className="text-white/80 text-[10px] font-bold uppercase bg-wms-surface border border-wms-border px-2 py-0.5 rounded shadow-sm truncate max-w-[140px]">
                        {o.buyerName}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        const cats = [...new Set(o.items.map((i: any) => i.product.categoryFamily).filter(Boolean))];
                        return <>{
                          cats.slice(0, 2).map((f: any) => <FamilyBadge key={f} family={f} />)
                        }{
                          cats.length > 2 && <span className="text-[9px] text-wms-muted font-bold">+{cats.length - 2}</span>
                        }</>;
                      })()}
                    </div>
                  </div>

                  {/* Mini lista de productos (vista previa) */}
                  <div className="mt-4 pt-4 border-t border-wms-border/50 space-y-2.5">
                    {o.items.slice(0, 3).map((item: any) => {
                      const imgUrl = getHighResImageUrl(item.product.imageUrl || item.mlImageUrl);
                      return (
                        <div key={item.id} className="flex items-center gap-3">
                          {imgUrl ? (
                            <div className="w-9 h-9 rounded-lg bg-black/35 border border-wms-border/60 overflow-hidden shrink-0 shadow-sm relative">
                              <Image src={imgUrl} alt={item.product.name} fill className="object-contain p-1" sizes="36px" />
                            </div>
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-black/35 border border-wms-border/60 flex items-center justify-center text-wms-muted shrink-0 shadow-sm">
                              <Package size={14} className="text-wms-muted/70" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white/95 truncate group-hover:text-white transition-colors uppercase leading-tight">
                              {item.product.name}
                            </p>
                            <p className="text-[10px] font-mono text-wms-muted mt-0.5 tracking-tight font-medium">
                              SKU: {item.product.sku}
                            </p>
                          </div>
                          <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-black leading-none bg-wms-surface border border-wms-border/75 text-wms-muted group-hover:border-wms-border/50 group-hover:text-white transition-colors shrink-0">
                            x{item.quantityTotal}
                          </span>
                        </div>
                      );
                    })}
                    {o.items.length > 3 && (
                      <p className="text-[10px] text-wms-muted text-center pt-1 italic font-semibold">...y {o.items.length - 3} SKU(s) más</p>
                    )}
                  </div>

                  {o.priorityMessage && (
                    <div className="flex items-center gap-1.5 text-leon-red-light bg-leon-red/10 px-3 py-1.5 rounded-xl border border-leon-red/35 w-fit text-[10px] font-bold uppercase tracking-wide">
                      <AlertTriangle size={12} className="animate-pulse" />
                      {o.priorityMessage}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => refreshOrder(o.id)}
                    disabled={refreshingOrder === o.id}
                    className="w-14 h-14 bg-wms-surface border border-wms-border/60 hover:border-wms-border disabled:opacity-30 text-wms-muted hover:text-white rounded-2xl transition-all active:scale-95 flex items-center justify-center shrink-0 shadow-sm"
                    title="Refrescar desde MercadoLibre"
                  >
                    <RefreshCw size={18} className={refreshingOrder === o.id ? 'animate-spin' : ''} />
                  </button>
                  <button onClick={() => startPicking(o.id)} className="flex-1 bg-leon-red hover:bg-leon-red-light text-white py-4 rounded-2xl font-bold text-base transition-all active:scale-95 flex items-center justify-center gap-2.5 shadow-[0_4px_20px_rgba(155,27,48,0.25)] hover:shadow-[0_6px_25px_rgba(155,27,48,0.4)]">
                    INICIAR RECOLECCIÓN
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // VISTA 2: Picking en Progreso
  const isOrderComplete = groupedItems.every(i => i.quantityPicked >= i.quantityTotal);

  return (
    <div className="flex min-h-screen min-h-[100svh] flex-col bg-wms-bg font-sans text-wms-text">
      <div className="leon-brand-bar" />
      
      {/* Grupo Sticky Superior (Header + Banner) */}
      <div className="sticky top-0 z-40 flex flex-col shadow-2xl">
        {/* Header Picking */}
        <div className="bg-wms-surface border-b border-wms-border p-3 md:p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="bg-leon-red text-white w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center font-black text-lg md:text-xl shadow-lg shadow-leon-red/20 rotate-3 shrink-0">
              {currentItemIndex + 1}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm md:text-xl font-black text-white leading-none truncate max-w-[140px] md:max-w-[300px]" title={`Pack: ML-${activeOrder.mlId}`}>
                <span>ML-{activeOrder.mlId}</span>
                {activeOrder.shippingId && <span className="block text-[9px] font-mono font-normal text-wms-muted truncate mt-0.5">{activeOrder.shippingId}</span>}
              </h2>
              <p className="text-wms-muted text-[9px] md:text-[10px] font-bold uppercase mt-1 tracking-widest truncate">Producto {currentItemIndex + 1} de {groupedItems.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            <button 
              onClick={cancelPicking}
              title="Salir y reiniciar la recolección"
              className="text-wms-muted hover:text-leon-red text-[9px] md:text-[10px] font-black uppercase transition-colors px-3 py-2 md:px-4 md:py-2 border border-wms-border hover:border-leon-red/30 rounded-lg md:rounded-xl">
              Salir
            </button>
            {isOrderComplete && (
              <button onClick={completePicking} className="bg-green-600 hover:bg-green-500 text-white px-4 md:px-8 py-2 md:py-3 rounded-lg md:rounded-2xl font-black text-xs md:text-sm flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-green-600/20 uppercase tracking-widest">
                Fin <CheckCircle size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Banner de Instrucción de Despacho (Shipping Note) */}
        {activeOrder.priorityMessage && (
          <div className="bg-wms-bg/95 backdrop-blur-md border-b border-amber-500/30 px-4 py-3 flex items-center justify-center gap-2 text-center flex-shrink-0 animate-in fade-in duration-300 shadow-sm">
            <AlertTriangle size={16} className="text-amber-500 animate-pulse shrink-0" />
            <span className="text-xs md:text-sm font-black text-amber-400 uppercase tracking-wide">
              {activeOrder.priorityMessage}
            </span>
          </div>
        )}

        {/* Banner de Quiebre de Stock */}
        {currentGroupItem && currentTotalStock === 0 && !isOrderComplete && (
          <div className="bg-leon-red/95 backdrop-blur-md border-b border-leon-red-light/30 px-4 py-3 flex items-center justify-center gap-2 text-center flex-shrink-0 animate-in fade-in duration-300 shadow-sm z-20">
            <AlertTriangle size={16} className="text-white animate-pulse shrink-0" />
            <span className="text-xs md:text-sm font-black text-white uppercase tracking-wide">
              ¡BLOQUEADO! STOCK AGOTADO EN SISTEMA. CANCELA LA ORDEN Y REPORTA AL SUPERVISOR.
            </span>
          </div>
        )}
      </div>

      {/* Main Content: Current Item */}
      <div className="relative flex flex-1 flex-col items-center justify-start overflow-visible p-3 md:justify-center md:overflow-hidden md:p-8">


        {/* Toast de Error de Escaneo */}
        {scanError && (
          <div className="fixed left-4 right-4 top-4 z-[100] flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-center text-sm font-black text-white shadow-[0_0_20px_rgba(220,38,38,0.5)] animate-in slide-in-from-top-4 fade-in md:left-1/2 md:right-auto md:top-8 md:-translate-x-1/2 md:rounded-full md:px-6 md:text-base">
            <AlertTriangle size={20} />
            {scanError}
          </div>
        )}

        {isOrderComplete ? (
          <div className="text-center space-y-8 animate-in fade-in zoom-in duration-500 w-full max-w-md px-4">
            <div className="w-32 h-32 md:w-40 md:h-40 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border-2 border-green-500/30">
              <CheckCircle size={64} className="text-green-500 md:w-20 md:h-20" />
            </div>
            <div className="space-y-2">
              <h2 className="text-4xl md:text-5xl font-black text-white italic tracking-tighter">¡COMPLETADO!</h2>
              <p className="text-wms-muted text-sm md:text-lg font-medium">Todos los productos han sido recolectados.</p>
            </div>
            <button onClick={completePicking} className="bg-green-600 hover:bg-green-500 text-white w-full py-5 md:py-6 rounded-2xl md:rounded-3xl font-black text-xl md:text-2xl flex items-center justify-center gap-4 transition-all active:scale-95 shadow-2xl shadow-green-600/30">
              A PACKING <ChevronRight size={28} />
            </button>
          </div>
        ) : (
          currentGroupItem && (
            <div className="relative mx-auto flex h-auto w-full max-w-3xl flex-col justify-center space-y-6 overflow-hidden rounded-[1.5rem] border border-wms-border bg-wms-surface p-4 shadow-2xl sm:p-5 md:space-y-10 md:rounded-[2.5rem] md:p-12">
              <div className="absolute top-0 right-0 p-4 md:p-8 opacity-5">
                <Scan size={80} className="md:w-[120px] md:h-[120px]" />
              </div>

              {/* Info de Ubicación GIGANTE */}
              <div className="text-center space-y-3 md:space-y-4">
                <p className="text-wms-muted font-black tracking-[0.2em] md:tracking-[0.3em] uppercase text-[10px] md:text-xs">Ubicación de Almacén</p>
                {(() => {
                  const totalStock = currentGroupItem.product.locations?.reduce((acc: number, l: any) => acc + l.quantity, 0) || 0;
                  if (totalStock === 0) {
                    return (
                      <div className="text-xl md:text-3xl font-black text-red-500 bg-red-500/10 p-4 md:p-8 rounded-2xl md:rounded-3xl border border-red-500/20 flex flex-col items-center justify-center gap-2 animate-pulse max-w-lg mx-auto">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={32} className="md:w-10 md:h-10 shrink-0 text-red-500" />
                          <span className="text-center leading-tight">¡STOCK CERO EN SISTEMA!</span>
                        </div>
                        <span className="text-xs uppercase text-wms-muted tracking-widest font-black">Este producto no cuenta con existencias registradas en el inventario.</span>
                      </div>
                    );
                  }
                  if (preferredLoc) {
                    return (
                      <div className="inline-flex items-center justify-between w-full md:w-auto gap-2 md:gap-8 bg-black/40 p-4 md:p-10 rounded-[1.5rem] md:rounded-[2rem] border border-wms-border/50">
                        <div className="flex flex-col items-center flex-1">
                          <span className="text-[9px] md:text-xs font-black text-wms-muted mb-1 md:mb-2">PASILLO</span>
                          <span className="text-5xl md:text-9xl font-black text-leon-red leading-none">{preferredLoc.location.aisle}</span>
                        </div>
                        <div className="w-px h-12 md:w-1 md:h-20 bg-wms-border/30 rounded-full" />
                        <div className="flex flex-col items-center flex-1">
                          <span className="text-[9px] md:text-xs font-black text-wms-muted mb-1 md:mb-2">SECCIÓN</span>
                          <span className="text-5xl md:text-9xl font-black text-leon-red leading-none">{preferredLoc.location.section}</span>
                        </div>
                        <div className="w-px h-12 md:w-1 md:h-20 bg-wms-border/30 rounded-full" />
                        <div className="flex flex-col items-center flex-1">
                          <span className="text-[9px] md:text-xs font-black text-wms-muted mb-1 md:mb-2">NIVEL</span>
                          <span className="text-5xl md:text-9xl font-black text-leon-red leading-none">{preferredLoc.location.level}</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="text-xl md:text-3xl font-black text-red-500 flex items-center justify-center gap-3 p-4 md:p-8 bg-red-500/10 rounded-2xl md:rounded-3xl border border-red-500/20 max-w-lg mx-auto">
                      <AlertTriangle size={32} className="md:w-10 md:h-10 shrink-0" /> <span className="text-center leading-tight">SIN UBICACIÓN</span>
                    </div>
                  );
                })()}
              </div>

              {/* Info de Producto */}
              <div className="bg-wms-card border border-wms-border rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-8 flex flex-col md:flex-row items-center gap-4 md:gap-8 relative z-10 shadow-inner">
                <div className="relative h-28 w-28 flex-shrink-0 overflow-hidden rounded-xl border border-wms-border bg-black p-2 shadow-lg sm:h-32 sm:w-32 md:h-48 md:w-48 md:rounded-[1.5rem]">
                  {(currentGroupItem.mlImageUrl || currentGroupItem.product.imageUrl) ? (
                    <Image src={getHighResImageUrl(currentGroupItem.mlImageUrl || currentGroupItem.product.imageUrl)!} alt="Producto" fill className="object-contain mix-blend-lighten" sizes="(max-width: 768px) 128px, 192px" />
                  ) : (
                    <Package size={48} className="text-wms-muted opacity-20 md:w-16 md:h-16" />
                  )}
                </div>
                <div className="flex-1 text-center md:text-left space-y-2 md:space-y-4">
                  {activeOrder.isFlex && (
                    <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
                      <span className="bg-leon-red text-white px-3 py-1 rounded-md text-[10px] font-black animate-pulse">FLEX</span>
                      <span className="text-leon-red-light text-xs font-black uppercase tracking-tighter">{activeOrder.priorityMessage}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-block bg-leon-red/10 text-leon-red px-3 py-1 rounded-full text-[10px] md:text-sm font-black border border-leon-red/20 uppercase tracking-widest max-w-full truncate">
                      SKU: {currentGroupItem.product.sku}
                    </span>
                    <FamilyBadge family={currentGroupItem.product.categoryFamily} />
                  </div>
                  <h3 className="text-lg md:text-4xl font-black text-white leading-tight tracking-tight line-clamp-3 md:line-clamp-none">{currentGroupItem.product.name}</h3>
                </div>
              </div>

              {/* Controles de Picking: Scanner de Cámara + Manual */}
              <div className="space-y-6">
                <div className="flex items-end justify-between px-2">
                  <div className="flex flex-col">
                    <p className="text-wms-muted font-black text-[10px] uppercase tracking-widest mb-1">Unidades Recolectadas</p>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full animate-pulse ${currentGroupItem.quantityPicked >= currentGroupItem.quantityTotal ? 'bg-green-500' : 'bg-leon-red'}`} />
                      <p className="text-5xl font-black text-white italic tracking-tighter">
                        {currentGroupItem.quantityPicked} <span className="text-wms-muted text-2xl not-italic">/ {currentGroupItem.quantityTotal}</span>
                      </p>
                    </div>
                  </div>
                  <div className="hidden md:block">
                     <p className="text-wms-muted text-[10px] font-black uppercase tracking-widest text-right mb-1">Confirmación</p>
                     <p className="text-xs font-bold text-white/50 bg-white/5 px-3 py-1 rounded-lg">ESCANEE O USE LA CÁMARA</p>
                  </div>
                </div>
                
                {/* Barra de progreso Industrial */}
                <div className="h-6 bg-black/40 rounded-full overflow-hidden border-2 border-wms-border p-1">
                  <div 
                    className="h-full bg-gradient-to-r from-leon-red to-leon-red-light transition-all duration-500 rounded-full shadow-[0_0_15px_rgba(155,27,48,0.5)]"
                    style={{ width: `${Math.min(100, (currentGroupItem.quantityPicked / currentGroupItem.quantityTotal) * 100)}%` }}
                  />
                </div>

                {/* Botones: Scanner de Cámara + Picking Manual */}
                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <div className="flex-1">
                    {/* Scanner de Cámara (para cuando no hay pistola lectora) */}
                    {currentTotalStock > 0 && (
                      <BarcodeScanner
                        onScan={(code) => handleScan(code, 'CAMERA')}
                        buttonLabel="ABRIR CÁMARA"
                      />
                    )}
                  </div>

                  <button 
                    onClick={() => pickItem(1, 'MANUAL')}
                    disabled={currentGroupItem.quantityPicked >= currentGroupItem.quantityTotal || currentTotalStock === 0}
                    className="flex-1 group bg-wms-surface border border-wms-border hover:bg-white/10 disabled:opacity-30 text-wms-muted hover:text-white px-5 py-3 rounded-2xl font-black text-xs md:text-sm transition-all active:scale-95 flex items-center justify-center gap-2.5 uppercase tracking-wider w-full"
                  >
                    <Scan size={18} className="group-active:scale-110 transition-transform" />
                    Confirmar manual (+1)
                  </button>
                </div>
              </div>

            </div>
          )
        )}
      </div>
      
      {/* Footer Progress Pills */}
      {!isOrderComplete && (
        <div className="p-6 flex justify-center gap-3">
          {groupedItems.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-2 rounded-full transition-all duration-300 ${
                idx === currentItemIndex 
                  ? 'w-12 bg-leon-red shadow-[0_0_10px_rgba(155,27,48,0.5)]' 
                  : idx < currentItemIndex 
                    ? 'w-8 bg-green-500' 
                    : 'w-4 bg-wms-border'
              }`} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
