'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ShieldAlert, 
  AlertCircle, 
  History as HistoryIcon, 
  Activity, 
  ArrowLeft, 
  Shield,
  Search,
  Package,
  Printer,
  Check,
  Clock,
  Radio,
  Percent,
  Scan,
  Camera,
  Hand,
  Shuffle
} from 'lucide-react';
import { getHighResImageUrl } from '@/lib/image-utils';
import { showToast, showConfirmModal, showModalAlert } from '@/lib/toast';

type Tab = 'ml-missing' | 'conflicts' | 'history' | 'audit';

interface ConflictItem {
  id: string;
  orderId: string;
  userId: string;
  timestamp: string;
  status: string;
}

interface GhostGroup {
  name: string;
  ghostProductId: string;
  sku: string;
  imageUrl: string | null;
  createdAt: string;
  orderCount: number;
  totalQuantity: number;
  orders: { id: string; mlId: string; status: string; buyerName: string | null }[];
}

export const SupervisorDashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>('ml-missing');

  // ─── Existing state ───
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [shippedHistory, setShippedHistory] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  
  const [resolvingItem, setResolvingItem] = useState<{orderId: string, item: any} | null>(null);
  
  // ─── Search states ───
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [conflictsSearchTerm, setConflictsSearchTerm] = useState('');
  
  // ─── Pagination states ───
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const historyItemsPerPage = 10;

  // Reset page when filtering
  useEffect(() => {
    setHistoryCurrentPage(1);
  }, [historySearchTerm]);
  
  // ─── Modal state ───
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalSearchResults, setModalSearchResults] = useState<any[]>([]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newProductSku, setNewProductSku] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');
  const [isSkuEditable, setIsSkuEditable] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // ─── ML-MISSING state (like admin) ───
  const [ghostGroups, setGhostGroups] = useState<GhostGroup[]>([]);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [ghostSearchTerm, setGhostSearchTerm] = useState('');

  // ─── Effects ───
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [confRes, histRes, auditRes] = await Promise.all([
          fetch('/api/conflicts'),
          fetch('/api/supervisor/history'),
          fetch('/api/audit')
        ]);
        if (confRes.ok) setConflicts(await confRes.json());
        if (histRes.ok) setShippedHistory(await histRes.json());
        if (auditRes.ok) setAuditLogs(await auditRes.json());
      } catch { /* offline */ }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch ML-MISSING when tab changes
  useEffect(() => {
    if (activeTab === 'ml-missing') fetchGhosts();
  }, [activeTab]);

  const fetchGhosts = async () => {
    setGhostLoading(true);
    const res = await fetch('/api/admin/ml-missing');
    if (res.ok) {
      const data = await res.json();
      setGhostGroups(data.items || []);
    }
    setGhostLoading(false);
  };

  // Sugerir SKU al abrir la creación o cambiar atributos
  useEffect(() => {
    if (resolvingItem && isCreatingNew && !isSkuEditable) {
      let url = `/api/sku/generate?name=${encodeURIComponent(resolvingItem.item.product.name)}`;
      if (newBrand) url += `&brand=${encodeURIComponent(newBrand)}`;
      if (newColor) url += `&color=${encodeURIComponent(newColor)}`;
      if (newSize) url += `&size=${encodeURIComponent(newSize)}`;

      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data.sku) setNewProductSku(data.sku);
        })
        .catch(() => {});
    }
  }, [resolvingItem, isCreatingNew, newBrand, newColor, newSize, isSkuEditable]);



  const handleModalSearch = async (term: string) => {
    setModalSearchTerm(term);
    if (term.length < 2) {
      setModalSearchResults([]);
      return;
    }
    const res = await fetch(`/api/products?q=${term}`);
    if (res.ok) {
      const data = await res.json();
      setModalSearchResults(data.filter((p: any) => !p.sku.startsWith('ML-MISSING')));
    }
  };

  const resolveItem = async (realProductId: string) => {
    if (!resolvingItem) return;
    const res = await fetch('/api/supervisor/resolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: resolvingItem.orderId,
        orderItemId: resolvingItem.item.id,
        ghostProductId: resolvingItem.item.product.id,
        realProductId
      })
    });

    if (res.ok) {
      const data = await res.json();
      const bulkCount = data.bulkResolved || 0;
      const unblocked = data.ordersUnblocked || 0;
      setResolvingItem(null);
      setModalSearchTerm('');
      setModalSearchResults([]);
      fetchGhosts(); // Refresh ML-MISSING list
      if (bulkCount > 0) {
        await showModalAlert(
          'Vinculación masiva',
          `✅ Vinculación masiva: ${bulkCount} producto(s) adicional(es) vinculados automáticamente. ${unblocked} orden(es) desbloqueada(s).`,
          'success'
        );
      } else {
        showToast('Producto vinculado con éxito.', 'success');
      }
    } else {
      const data = await res.json().catch(() => ({}));
      await showModalAlert('Error', data.error || 'No se pudo vincular', 'error');
    }
  };

  const createNewProduct = async () => {
    if (!resolvingItem || !newProductSku.trim()) return;
    const res = await fetch('/api/supervisor/resolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_AND_RESOLVE',
        orderId: resolvingItem.orderId,
        orderItemId: resolvingItem.item.id,
        ghostProductId: resolvingItem.item.product.id,
        customSku: newProductSku.trim(),
        brand: newBrand.trim(),
        color: newColor.trim(),
        size: newSize.trim()
      })
    });

    if (res.ok) {
      const data = await res.json();
      const bulkCount = data.bulkResolved || 0;
      const unblocked = data.ordersUnblocked || 0;
      setResolvingItem(null);
      setIsCreatingNew(false);
      setNewProductSku('');
      setNewBrand('');
      setNewColor('');
      setNewSize('');
      setIsSkuEditable(false);
      setModalSearchTerm('');
      setModalSearchResults([]);
      fetchGhosts(); // Refresh ML-MISSING list
      await showModalAlert(
        'Producto Creado',
        `✅ Nuevo producto creado y vinculado.\n\nVinculación masiva: ${bulkCount} producto(s) adicional(es) vinculados. ${unblocked} orden(es) desbloqueada(s).`,
        'success'
      );
    } else {
      const data = await res.json().catch(() => ({}));
      await showModalAlert('Error', data.error || 'No se pudo completar la operación', 'error');
    }
  };

  // ─── Filtered ghosts for ML-MISSING tab ───
  const filteredGhosts = ghostGroups.filter(g =>
    g.name.toLowerCase().includes(ghostSearchTerm.toLowerCase()) ||
    g.sku.toLowerCase().includes(ghostSearchTerm.toLowerCase())
  );

  // Abrir modal de resolución desde un GhostGroup
  const openResolutionModal = (g: GhostGroup) => {
    const orderId = g.orders[0]?.id || '';
    setResolvingItem({
      orderId,
      item: {
        id: '',
        product: {
          id: g.ghostProductId,
          name: g.name
        }
      }
    });
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'CREATE_PRODUCT': 'Creación de Producto',
      'DELETE_PRODUCT': 'Eliminación de Producto',
      'STOCK_ADJUST': 'Ajuste de Inventario',
      'INVALID_SCAN': 'Lectura Inválida',
      'START_PICKING': 'Inicio de Picking',
      'COMPLETE_PICKING': 'Picking Completado',
      'CANCEL_PICKING': 'Picking Cancelado',
      'START_PACKING': 'Inicio de Packing',
      'COMPLETE_PACKING': 'Packing Completado',
      'CANCEL_PACKING': 'Packing Cancelado',
    };
    return labels[action] || action;
  };

  const getActionStyle = (action: string) => {
    if (action.includes('CREATE')) return 'bg-green-500/10 border-green-500/35 text-green-400 border border-green-500/20';
    if (action.includes('DELETE')) return 'bg-red-500/10 border-red-500/35 text-red-400 border border-red-500/20';
    if (action.includes('STOCK_ADJUST')) return 'bg-amber-500/10 border-amber-500/35 text-amber-400 border border-amber-500/20';
    if (action.includes('INVALID_SCAN')) return 'bg-rose-500/10 border-rose-500/35 text-rose-400 border border-rose-500/20';
    return 'bg-blue-500/10 border-blue-500/35 text-blue-400 border border-blue-500/20';
  };

  const formatMetadata = (log: any) => {
    if (!log.metadata) return '—';
    const m = log.metadata;
    if (log.action === 'STOCK_ADJUST') {
      return `SKU: ${m.sku || '—'} | Ubicación: ${m.location || '—'} | Stock: ${m.quantityBefore} → ${m.quantityAfter} (${m.note || 'Ajuste'})`;
    }
    if (log.action === 'CREATE_PRODUCT' || log.action === 'DELETE_PRODUCT') {
      return `SKU: ${m.sku || '—'} | Nombre: ${m.name || '—'}`;
    }
    if (log.action === 'INVALID_SCAN') {
      return `Ráfaga: ${m.burst || '—'} | DeltaT: ${m.deltaT}ms | Mesa: ${m.station}`;
    }
    return typeof m === 'object' ? JSON.stringify(m) : String(m);
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 lg:p-6 font-sans md:overflow-hidden md:h-screen flex flex-col">
      <div className="leon-brand-bar mb-4 -mx-4 -mt-4 lg:-mx-6 lg:-mt-6" />

      {/* MODAL DE RESOLUCIÓN */}
      {resolvingItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 p-3 backdrop-blur-md sm:items-center sm:p-4">
          <div className="my-3 w-full max-w-lg overflow-hidden rounded-2xl border-2 border-leon-red bg-wms-surface shadow-[0_0_50px_rgba(255,0,0,0.2)] sm:my-0">
            <div className="bg-leon-red p-5 text-white shadow-xl sm:p-6">
              <h3 className="text-xl font-black italic uppercase tracking-tighter">Vincular Producto WMS</h3>
              <p className="text-sm opacity-90 uppercase font-black truncate mt-1">{resolvingItem.item.product.name}</p>
            </div>
            <div className="space-y-5 bg-wms-bg p-4 sm:p-6">
              {/* TABS */}
              <div className="flex bg-black rounded-xl p-1 shadow-inner mb-6">
                <button
                  onClick={() => setIsCreatingNew(false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                    !isCreatingNew ? 'bg-leon-red text-white shadow-md' : 'text-wms-muted hover:text-white'
                  }`}
                >
                  Vincular Existente
                </button>
                <button
                  onClick={() => setIsCreatingNew(true)}
                  className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                    isCreatingNew ? 'bg-amber-500 text-black shadow-md' : 'text-wms-muted hover:text-white'
                  }`}
                >
                  Crear Nuevo
                </button>
              </div>

              {!isCreatingNew ? (
                <>
                  <div>
                    <label className="text-xs font-black text-white uppercase mb-2 block tracking-widest">Buscar en Inventario Real</label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-leon-red" size={20} />
                      <input 
                        type="text"
                        autoFocus
                        value={modalSearchTerm}
                        onChange={(e) => handleModalSearch(e.target.value)}
                        placeholder="SKU o Nombre del producto..."
                        className="w-full bg-black border-2 border-wms-border pl-12 pr-4 py-4 rounded-xl text-white font-bold outline-none focus:border-leon-red transition-all shadow-inner"
                      />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
                    {modalSearchResults.map(p => (
                      <button 
                        key={p.id}
                        onClick={() => resolveItem(p.id)}
                        className="w-full bg-black hover:bg-leon-red/20 border-2 border-wms-border p-4 rounded-xl flex justify-between items-center transition-all group active:scale-[0.98]"
                      >
                        <div className="text-left min-w-0">
                          <p className="font-black text-sm text-white group-hover:text-leon-red truncate">{p.name}</p>
                          <p className="text-xs text-wms-muted font-mono font-bold mt-1 uppercase tracking-tighter">{p.sku}</p>
                        </div>
                        <span className="bg-leon-red text-white font-black text-[10px] px-3 py-1 rounded-full ml-4 shadow-lg group-hover:scale-110 transition-transform">SELECCIONAR</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-black text-amber-500 uppercase tracking-widest">SKU GENERADO {isSkuEditable ? '(MANUAL)' : '(AUTOMÁTICO)'}</label>
                      <button 
                        onClick={() => setIsSkuEditable(!isSkuEditable)}
                        className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded transition-colors ${isSkuEditable ? 'bg-leon-red/20 text-leon-red' : 'bg-wms-border text-wms-muted hover:text-white'}`}
                      >
                        {isSkuEditable ? 'Bloquear Auto' : 'Editar Manual'}
                      </button>
                    </div>
                    <input 
                      type="text"
                      readOnly={!isSkuEditable}
                      value={newProductSku}
                      onChange={(e) => isSkuEditable && setNewProductSku(e.target.value.toUpperCase())}
                      className={`w-full bg-black/50 border pl-4 pr-4 py-3 rounded-lg font-mono font-black text-lg outline-none uppercase transition-all ${isSkuEditable ? 'border-amber-500 text-white shadow-inner focus:border-amber-400 opacity-100' : 'border-amber-500/30 text-amber-500 opacity-80 cursor-not-allowed'}`}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-bold text-wms-muted uppercase mb-1 block">Marca</label>
                      <input 
                        type="text"
                        value={newBrand}
                        onChange={(e) => setNewBrand(e.target.value)}
                        placeholder="Ej: Oster"
                        className="w-full bg-black border border-wms-border px-3 py-2 rounded-lg text-white font-bold outline-none focus:border-amber-500 transition-colors uppercase"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-wms-muted uppercase mb-1 block">Color</label>
                      <input 
                        type="text"
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        placeholder="Ej: Negro"
                        className="w-full bg-black border border-wms-border px-3 py-2 rounded-lg text-white font-bold outline-none focus:border-amber-500 transition-colors uppercase"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-wms-muted uppercase mb-1 block">Talla / Tamaño</label>
                      <input 
                        type="text"
                        value={newSize}
                        onChange={(e) => setNewSize(e.target.value)}
                        placeholder="Ej: 7.5L"
                        className="w-full bg-black border border-wms-border px-3 py-2 rounded-lg text-white font-bold outline-none focus:border-amber-500 transition-colors uppercase"
                      />
                    </div>
                  </div>

                  <button 
                    onClick={createNewProduct}
                    disabled={!newProductSku.trim()}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black uppercase tracking-widest py-4 mt-2 rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)] active:scale-[0.98]"
                  >
                    CONFIRMAR Y CREAR PRODUCTO
                  </button>
                </div>
              )}

              <button 
                onClick={() => {
                  setResolvingItem(null);
                  setIsCreatingNew(false);
                }} 
                className="w-full text-wms-muted py-2 text-xs font-black hover:text-white transition-colors uppercase tracking-widest"
              >
                ← Cancelar Operación
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-4 md:gap-0 mb-6 flex-shrink-0 w-full">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2.5 bg-wms-card border border-wms-border hover:border-leon-red/50 text-wms-muted hover:text-white rounded-full hover:bg-leon-red/10 transition-all shadow-sm">
            <ArrowLeft size={20} strokeWidth={3} />
          </Link>
          <div>
            <h1 className="text-xl md:text-3xl font-black tracking-tighter text-white uppercase italic">
              CONSOLA <span className="text-leon-red drop-shadow-[0_0_12px_rgba(155,27,48,0.3)]">SUPERVISIÓN</span>
            </h1>
            <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-black">Warehouse Management System</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3 md:w-auto">
          <Link 
            href="/admin" 
            className="flex items-center justify-center gap-2 rounded-xl border border-wms-border bg-wms-card px-3 py-2.5 text-xs font-bold tracking-wide text-white/90 shadow-sm transition-all hover:border-leon-red/50 hover:bg-leon-red/10 sm:rounded-2xl sm:px-5"
          >
            <Shield size={13} strokeWidth={3} className="text-leon-red-light" /> PERSONAL
          </Link>

          <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/5 px-3 py-2.5 shadow-sm sm:rounded-2xl sm:px-4">
            <Activity size={13} className="text-emerald-500 animate-pulse" strokeWidth={3} />
            <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">Live OK</span>
          </div>
        </div>
      </header>

      {/* ─── TABS ─── */}
      <div className="flex gap-2 p-1.5 bg-wms-card border border-wms-border/60 rounded-2xl mb-6 flex-shrink-0 w-full overflow-x-auto shadow-lg hide-scrollbar">
        <button onClick={() => setActiveTab('ml-missing')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'ml-missing'
              ? 'bg-amber-500/10 border border-amber-500/35 text-amber-400 font-black shadow-inner'
              : 'text-wms-muted hover:text-white hover:bg-white/5 border border-transparent'
          }`}>
          <AlertCircle size={15} /> ML-MISSING ({ghostGroups.length})
        </button>
        <button onClick={() => setActiveTab('conflicts')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'conflicts'
              ? 'bg-leon-red/10 border border-leon-red/35 text-leon-red-light font-black shadow-inner'
              : 'text-wms-muted hover:text-white hover:bg-white/5 border border-transparent'
          }`}>
          <ShieldAlert size={15} /> CONFLICTOS ({conflicts.length})
        </button>
        <button onClick={() => setActiveTab('history')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'history'
              ? 'bg-blue-500/10 border border-blue-500/35 text-blue-400 font-black shadow-inner'
              : 'text-wms-muted hover:text-white hover:bg-white/5 border border-transparent'
          }`}>
          <HistoryIcon size={15} /> HISTORIAL ({shippedHistory.length})
        </button>
        <button onClick={() => setActiveTab('audit')}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            activeTab === 'audit'
              ? 'bg-purple-500/10 border border-purple-500/35 text-purple-400 font-black shadow-inner'
              : 'text-wms-muted hover:text-white hover:bg-white/5 border border-transparent'
          }`}>
          <Activity size={15} /> AUDITORÍA ({auditLogs.length})
        </button>
      </div>

      {/* ═══════════════════════════════════ */}
      {/* TAB: ML-MISSING */}
      {/* ═══════════════════════════════════ */}
      {activeTab === 'ml-missing' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Search + Refresh */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 mb-5 flex-shrink-0">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-wms-muted" size={20} />
              <input
                type="text"
                placeholder="Buscar producto fantasma por nombre o SKU..."
                value={ghostSearchTerm}
                onChange={(e) => setGhostSearchTerm(e.target.value)}
                className="w-full bg-wms-surface/50 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white outline-none focus:border-amber-500 transition-all placeholder:text-white/20 font-bold"
              />
            </div>
            <button onClick={fetchGhosts} disabled={ghostLoading}
              className="bg-wms-surface/50 border border-white/10 hover:border-amber-500 text-white px-5 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center md:justify-start gap-2 w-full md:w-auto shrink-0">
              <Activity size={16} className={ghostLoading ? 'animate-spin' : ''} />
              <span className="text-[10px] font-black uppercase tracking-widest">Refrescar</span>
            </button>
          </div>

          {/* Content */}
          {ghostLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Activity size={48} className="mx-auto text-amber-500 animate-spin mb-4" />
                <p className="text-wms-muted font-bold">Cargando productos pendientes...</p>
              </div>
            </div>
          ) : filteredGhosts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Check size={64} className="mx-auto text-green-500 mb-4" strokeWidth={2} />
                <p className="text-2xl font-black text-green-500 uppercase tracking-wider">Sistema Limpio</p>
                <p className="text-wms-muted text-sm mt-2">No hay productos ML-MISSING pendientes de resolución</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredGhosts.map(g => (
                  <div key={g.ghostProductId} className="bg-wms-surface/50 border-2 border-amber-500/20 hover:border-amber-500/50 rounded-2xl p-5 transition-all group">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-14 h-14 bg-amber-500/10 rounded-xl flex items-center justify-center shrink-0 border border-amber-500/20 overflow-hidden relative">
                        {g.imageUrl ? (
                          <Image
                            src={getHighResImageUrl(g.imageUrl) || ''}
                            alt={g.name}
                            fill
                            className="object-cover rounded-xl"
                            sizes="56px"
                          />
                        ) : (
                          <Package size={24} className="text-amber-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-white leading-tight truncate">{g.name}</p>
                        <p className="text-[10px] font-mono text-amber-500/70 mt-1">{g.sku}</p>
                      </div>
                      <button onClick={() => openResolutionModal(g)}
                        className="bg-amber-500 hover:bg-amber-400 text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-lg md:opacity-0 md:group-hover:opacity-100 shrink-0">
                        Resolver
                      </button>
                    </div>
                    <div className="flex gap-4 text-xs text-wms-muted">
                      <span className="font-bold">{g.orders.length} {g.orders.length === 1 ? 'orden' : 'órdenes'}</span>
                      <span className="font-bold">{g.totalQuantity} {g.totalQuantity === 1 ? 'unidad' : 'unidades'}</span>
                    </div>
                    {/* Mini lista de órdenes */}
                    {g.orders.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                        {g.orders.slice(0, 3).map(o => (
                          <div key={o.id} className="flex justify-between text-[10px]">
                            <span className="font-mono text-wms-muted">#{o.mlId}</span>
                            <span className={`font-bold uppercase ${
                              o.status === 'RESOLUTION_REQUIRED' ? 'text-amber-500' : 'text-green-500'
                            }`}>{o.status}</span>
                          </div>
                        ))}
                        {g.orders.length > 3 && (
                          <p className="text-[10px] text-wms-muted text-center pt-1">...y {g.orders.length - 3} más</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════ */}
      {/* TAB: CONFLICTOS */}
      {/* ═══════════════════════════════════ */}
      {activeTab === 'conflicts' && (
        <section className="bg-leon-red/5 border-2 border-leon-red/40 p-4 md:p-6 rounded-2xl md:rounded-[2rem] flex flex-col flex-1 min-h-0 shadow-2xl overflow-hidden">
          <div className="flex flex-col gap-4 mb-4 flex-shrink-0">
            <div className="flex items-center gap-3 text-leon-red">
              <ShieldAlert size={28} strokeWidth={3} />
              <h2 className="text-2xl font-black uppercase italic tracking-tighter">Conflictos</h2>
            </div>
            <input 
              type="text"
              placeholder="FILTRAR INCIDENCIAS..."
              className="w-full bg-black border-2 border-leon-red/30 p-3 rounded-xl text-sm text-white font-black outline-none focus:border-leon-red placeholder:text-leon-red/30"
              onChange={(e) => setConflictsSearchTerm(e.target.value.toLowerCase())}
            />
          </div>
          <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1 min-h-0">
            {conflicts
              .filter(c => c.orderId.toLowerCase().includes(conflictsSearchTerm) || c.userId.toLowerCase().includes(conflictsSearchTerm))
              .map(c => (
                <div key={c.id} className="bg-black p-4 rounded-xl border-2 border-leon-red/20 hover:border-leon-red/50 transition-all">
                  <p className="font-black text-base text-white">ORDEN: {c.orderId}</p>
                  <p className="text-xs text-leon-red mt-1 font-black uppercase">OPERARIO: {c.userId}</p>
                </div>
              ))}
            {conflicts.length === 0 && (
              <p className="text-center py-10 text-white/10 text-xs font-black uppercase tracking-[0.5em]">Sin Alertas</p>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════ */}
      {/* TAB: HISTORIAL */}
      {/* ═══════════════════════════════════ */}
      {activeTab === 'history' && (
        <div className="flex-1 flex flex-col min-h-0 gap-6">
          {/* MÉTRICAS */}
          <div className="grid flex-shrink-0 grid-cols-1 gap-3 sm:grid-cols-3 md:gap-6">
            <div className="bg-wms-card border border-wms-border/60 p-4 md:p-6 rounded-xl md:rounded-[2rem] shadow-xl hover:border-wms-border transition-all flex items-center justify-between group">
              <div>
                <p className="text-wms-muted text-[10px] font-black uppercase tracking-widest">Órdenes Hoy</p>
                <p className="text-4xl font-black text-white tracking-tight mt-1 group-hover:text-leon-red-light transition-colors">{shippedHistory.length}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-leon-red/10 border border-leon-red/35 flex items-center justify-center text-leon-red-light group-hover:scale-110 transition-transform">
                <Package size={20} />
              </div>
            </div>
            <div className="bg-wms-card border border-wms-border/60 p-4 md:p-6 rounded-xl md:rounded-[2rem] shadow-xl hover:border-wms-border transition-all flex items-center justify-between group">
              <div>
                <p className="text-wms-muted text-[10px] font-black uppercase tracking-widest">Misfill Ratio</p>
                <p className="text-4xl font-black text-emerald-400 tracking-tight mt-1">0.2%</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                <Percent size={20} />
              </div>
            </div>
            <div className="bg-wms-card border border-wms-border/60 p-4 md:p-6 rounded-xl md:rounded-[2rem] shadow-xl hover:border-wms-border transition-all flex items-center justify-between group">
              <div>
                <p className="text-wms-muted text-[10px] font-black uppercase tracking-widest">Sync</p>
                <p className="text-4xl font-black text-blue-400 uppercase tracking-tight mt-1">Live</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/35 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                <Radio size={20} className="animate-pulse" />
              </div>
            </div>
          </div>

          {/* HISTORIAL DETALLADO */}
          <section className="bg-wms-surface border-2 border-white/10 p-4 md:p-6 rounded-2xl md:rounded-[2.5rem] flex flex-col flex-1 min-h-[500px] md:min-h-0 shadow-2xl overflow-hidden">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-3 md:gap-4 flex-shrink-0">
              <div className="flex items-center gap-4">
                <HistoryIcon size={32} className="text-leon-red" strokeWidth={3} />
                <h2 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter">Historial de Despachos</h2>
              </div>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-wms-muted" size={20} />
                <input 
                  type="text"
                  placeholder="FILTRAR HISTORIAL..."
                  className="w-full bg-black border-2 border-white/10 pl-12 pr-4 py-3 rounded-xl text-sm text-white font-black outline-none focus:border-leon-red transition-all"
                  onChange={(e) => setHistorySearchTerm(e.target.value.toLowerCase())}
                />
              </div>
            </div>
            
            <div className="overflow-hidden border-2 border-white/10 rounded-xl md:rounded-2xl flex-1 flex flex-col min-h-[300px] md:min-h-0 bg-black">
              <div className="overflow-auto custom-scrollbar flex-1 min-h-0">
                {/* VISTA MÓVIL: LISTA COMPACTA */}
                <div className="md:hidden flex flex-col divide-y-2 divide-white/5">
                  {(() => {
                    const filteredHistory = shippedHistory
                      .filter(order => {
                        const term = historySearchTerm;
                        return order.mlId.toString().toLowerCase().includes(term) || 
                               order.items.some((item: any) => item.product.name.toLowerCase().includes(term));
                      })
                      .sort((a, b) => new Date(b.shippedAt || 0).getTime() - new Date(a.shippedAt || 0).getTime());

                    const totalPages = Math.ceil(filteredHistory.length / historyItemsPerPage);
                    const paginatedHistory = filteredHistory.slice(
                      (historyCurrentPage - 1) * historyItemsPerPage,
                      historyCurrentPage * historyItemsPerPage
                    );

                    return paginatedHistory.map((o: any) => (
                      <div key={`mob-${o.id}`} className="flex flex-col p-4 gap-3 hover:bg-white/5 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-lg bg-wms-card border border-wms-border/70 text-white shadow-sm">
                              #{o.mlId}
                            </span>
                            {o.isFlex && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-leon-red/10 border border-leon-red/35 text-leon-red-light">
                                FLEX
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-wms-muted">
                            <Clock size={10} />
                            {new Date(o.shippedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          {o.items.map((item: any) => {
                            const isMultiple = item.quantityTotal > 1;
                            const imgUrl = getHighResImageUrl(item.product.imageUrl);
                            return (
                              <div key={`mob-item-${item.id}`} className="flex items-center gap-3 bg-wms-surface border border-wms-border/50 rounded-xl p-2.5">
                                {imgUrl ? (
                                  <div className="w-8 h-8 rounded-lg bg-wms-bg border border-wms-border/60 overflow-hidden shrink-0 relative">
                                    <Image src={imgUrl} alt={item.product.name} fill className="object-contain p-0.5" sizes="32px" />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-wms-bg border border-wms-border/60 flex items-center justify-center text-wms-muted shrink-0">
                                    <Package size={12} />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                  <span className={`text-xs font-black shrink-0 ${isMultiple ? 'text-leon-red-light' : 'text-wms-muted'}`}>
                                    {item.quantityTotal}x
                                  </span>
                                  <p className="text-[11px] font-bold text-white/90 uppercase truncate">{item.product.name}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between mt-1">
                          <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-wms-card border border-wms-border/60 text-white/80">
                            {o.packingStation || 'Sincronizado ML'}
                          </span>
                          <button 
                            onClick={async (e) => {
                              e.stopPropagation();
                              setIsPrinting(true);
                              try {
                                const printRes = await fetch('/api/print', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ mlId: o.mlId })
                                });
                                if (printRes.ok) {
                                  setIsPrinting(false);
                                } else {
                                  const tab = window.open(`/api/packing/label/${o.mlId}`, '_blank');
                                  if (!tab || tab.closed) {
                                    await showModalAlert('Impresión manual', 'Permite ventanas emergentes para ver la etiqueta.', 'warning');
                                  }
                                  setIsPrinting(false);
                                }
                              } catch (err) {
                                console.error('Error en reimpresión:', err);
                                const tab = window.open(`/api/packing/label/${o.mlId}`, '_blank');
                                if (!tab || tab.closed) {
                                  await showModalAlert('Impresión manual', 'Permite ventanas emergentes para ver la etiqueta.', 'warning');
                                }
                                setIsPrinting(false);
                              }
                            }}
                            className="bg-leon-red/10 border border-leon-red/30 text-leon-red-light px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-[9px] font-black uppercase active:scale-95 transition-transform"
                          >
                            <Printer size={10} /> Imprimir
                          </button>
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                {/* VISTA ESCRITORIO: TABLA */}
                <table className="hidden md:table w-full text-left border-collapse table-auto min-w-[800px]">
                  <thead className="bg-wms-bg sticky top-0 z-10 shadow-2xl border-b-2 border-white/10">
                  </thead>
                      <tbody className="divide-y-2 divide-white/5">
                    {(() => {
                      const filteredHistory = shippedHistory
                        .filter(order => {
                          const term = historySearchTerm;
                          return order.mlId.toString().toLowerCase().includes(term) || 
                                 order.items.some((item: any) => item.product.name.toLowerCase().includes(term));
                        })
                        .sort((a, b) => new Date(b.shippedAt || 0).getTime() - new Date(a.shippedAt || 0).getTime());

                      const totalPages = Math.ceil(filteredHistory.length / historyItemsPerPage);
                      const paginatedHistory = filteredHistory.slice(
                        (historyCurrentPage - 1) * historyItemsPerPage,
                        historyCurrentPage * historyItemsPerPage
                      );

                      return paginatedHistory.map((o: any) => (
                        <tr key={o.id} className="hover:bg-leon-red/5 transition-all duration-150 group cursor-default border-b border-white/5 last:border-0">
                          <td className="p-5 whitespace-nowrap">
                            <div className="flex items-center gap-2 text-xs font-semibold text-wms-muted font-mono group-hover:text-white transition-colors">
                              <Clock size={12} className="text-wms-muted group-hover:text-leon-red-light transition-colors" />
                              {new Date(o.shippedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="p-5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-wms-card border border-wms-border/70 text-white tracking-tight shadow-sm">
                                #{o.mlId}
                              </span>
                              {o.isFlex && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-leon-red/10 border border-leon-red/35 text-leon-red-light">
                                  FLEX
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-5">
                            <div className="space-y-2.5">
                              {o.items.map((item: any) => {
                                const isMultiple = item.quantityTotal > 1;
                                const imgUrl = getHighResImageUrl(item.product.imageUrl);
                                return (
                                  <div key={item.id} className="flex items-center gap-3">
                                    {imgUrl ? (
                                      <div className="w-9 h-9 rounded-lg bg-wms-bg border border-wms-border/60 overflow-hidden shrink-0 relative">
                                        <Image 
                                          src={imgUrl} 
                                          alt={item.product.name} 
                                          fill
                                          className="object-contain p-1" 
                                          sizes="36px"
                                        />
                                      </div>
                                    ) : (
                                      <div className="w-9 h-9 rounded-lg bg-wms-bg border border-wms-border/60 flex items-center justify-center text-wms-muted shrink-0">
                                        <Package size={14} />
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-xs font-bold text-white/90 group-hover:text-white transition-colors uppercase truncate max-w-[320px] md:max-w-[420px]">
                                        {item.product.name}
                                      </span>
                                      <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-black leading-none ${
                                        isMultiple 
                                          ? 'bg-leon-red border border-leon-red text-white scale-105 shadow-sm shadow-leon-red/25'
                                          : 'bg-wms-card border border-wms-border/75 text-wms-muted'
                                      }`}>
                                        x{item.quantityTotal}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="p-5 text-center">
                            <div className="flex flex-col items-center gap-2">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide bg-wms-card border border-wms-border/60 text-white/90 shadow-sm group-hover:border-leon-red/40 group-hover:text-leon-red-light transition-all">
                                {o.packingStation || 'Sincronizado ML'}
                              </span>
                              
                              {/* Icons for Picking and Packing methods */}
                              {(o.pickingMethod || o.packingMethod) && (
                                <div className="flex items-center gap-3 mt-1 opacity-70 group-hover:opacity-100 transition-opacity">
                                  <div className="flex flex-col items-center gap-0.5" title={`Picking: ${o.pickingMethod}`}>
                                    <span className="text-[8px] text-wms-muted font-bold tracking-wider">PICK</span>
                                    {o.pickingMethod === 'SCANNER' && <Scan size={14} className="text-white" />}
                                    {o.pickingMethod === 'CAMERA' && <Camera size={14} className="text-white" />}
                                    {o.pickingMethod === 'MANUAL' && <Hand size={14} className="text-white" />}
                                    {o.pickingMethod === 'MIXED' && <Shuffle size={14} className="text-white" />}
                                    {!o.pickingMethod && <span className="text-[10px] text-wms-muted">-</span>}
                                  </div>
                                  <div className="w-px h-6 bg-white/10 rounded-full" />
                                  <div className="flex flex-col items-center gap-0.5" title={`Packing: ${o.packingMethod}`}>
                                    <span className="text-[8px] text-wms-muted font-bold tracking-wider">PACK</span>
                                    {o.packingMethod === 'SCANNER' && <Scan size={14} className="text-white" />}
                                    {o.packingMethod === 'CAMERA' && <Camera size={14} className="text-white" />}
                                    {o.packingMethod === 'MANUAL' && <Hand size={14} className="text-white" />}
                                    {o.packingMethod === 'MIXED' && <Shuffle size={14} className="text-white" />}
                                    {!o.packingMethod && <span className="text-[10px] text-wms-muted">-</span>}
                                  </div>
                                </div>
                              )}

                              <button 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setIsPrinting(true);
                                  try {
                                    const printRes = await fetch('/api/print', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ mlId: o.mlId })
                                    });
                                    if (printRes.ok) {
                                      setIsPrinting(false);
                                    } else {
                                      // Fallback: abrir PDF en nueva pestaña
                                      const tab = window.open(`/api/packing/label/${o.mlId}`, '_blank');
                                      if (!tab || tab.closed) {
                                        await showModalAlert('Impresión manual', 'Permite ventanas emergentes para ver la etiqueta.', 'warning');
                                      }
                                      setIsPrinting(false);
                                    }
                                  } catch (err) {
                                    console.error('Error en reimpresión:', err);
                                    const tab = window.open(`/api/packing/label/${o.mlId}`, '_blank');
                                    if (!tab || tab.closed) {
                                      await showModalAlert('Impresión manual', 'Permite ventanas emergentes para ver la etiqueta.', 'warning');
                                    }
                                    setIsPrinting(false);
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 bg-leon-red/10 hover:bg-leon-red/25 border border-leon-red/25 hover:border-leon-red/50 text-leon-red-light hover:text-white px-2.5 py-1 rounded-lg transition-all duration-200 flex items-center gap-1 text-[9px] font-black uppercase tracking-wider"
                              >
                                <Printer size={11} /> Reimprimir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>

              {/* PAGINACIÓN */}
              {(() => {
                const filteredHistory = shippedHistory.filter(order => {
                  const term = historySearchTerm;
                  return order.mlId.toString().toLowerCase().includes(term) || 
                         order.items.some((item: any) => item.product.name.toLowerCase().includes(term));
                });
                const totalPages = Math.ceil(filteredHistory.length / historyItemsPerPage);
                if (totalPages <= 1) return null;
                
                return (
                  <div className="flex flex-col sm:flex-row justify-between items-center px-4 md:px-6 py-3 md:py-4 bg-wms-card border-t border-white/10 gap-3 md:gap-4">
                    <span className="text-[10px] font-black text-wms-muted uppercase tracking-widest">
                      Página {historyCurrentPage} de {totalPages} ({filteredHistory.length} órdenes)
                    </span>
                    <div className="flex flex-wrap justify-center items-center gap-2">
                      <button
                        onClick={() => setHistoryCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={historyCurrentPage === 1}
                        className="px-4 py-2 bg-black border border-wms-border text-white text-xs font-black uppercase tracking-wider rounded-xl hover:border-leon-red/50 hover:bg-leon-red/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        Anterior
                      </button>
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                          <button
                            key={page}
                            onClick={() => setHistoryCurrentPage(page)}
                            className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${
                              historyCurrentPage === page
                                ? 'bg-leon-red text-white font-black shadow-lg shadow-leon-red/25 border border-leon-red'
                                : 'bg-black border border-wms-border text-wms-muted hover:text-white hover:border-white/20'
                            }`}
                          >
                            {page}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setHistoryCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={historyCurrentPage === totalPages}
                        className="px-4 py-2 bg-black border border-wms-border text-white text-xs font-black uppercase tracking-wider rounded-xl hover:border-leon-red/50 hover:bg-leon-red/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>
        </div>
      )}

      {/* ═══════════════════════════════════ */}
      {/* TAB: AUDITORÍA */}
      {/* ═══════════════════════════════════ */}
      {activeTab === 'audit' && (
        <section className="bg-wms-surface border-2 border-white/10 p-4 md:p-6 rounded-2xl md:rounded-[2.5rem] flex flex-col flex-1 min-h-0 shadow-2xl overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-3 md:gap-6 flex-shrink-0">
            <div className="flex items-center gap-3 md:gap-4">
              <Activity size={24} className="text-purple-500 md:w-8 md:h-8" strokeWidth={3} />
              <h2 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter">Bitácora de Auditoría</h2>
            </div>
          </div>
          
          <div className="overflow-hidden border-2 border-white/10 rounded-xl md:rounded-2xl flex-1 flex flex-col min-h-0 bg-black">
            <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0">
              {/* VISTA MÓVIL: CARDS */}
              <div className="md:hidden flex flex-col divide-y-2 divide-white/5">
                {auditLogs.map((log: any) => (
                  <div key={`mob-audit-${log.id}`} className="flex flex-col p-4 gap-2 hover:bg-purple-500/5 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center font-mono font-bold text-xs px-2 py-0.5 rounded-lg bg-wms-card border border-wms-border/70 text-white shadow-sm">
                        {log.userId}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-wms-muted">
                        <Clock size={10} />
                        {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </div>
                    <span className={`inline-flex items-center self-start px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${getActionStyle(log.action)}`}>
                      {getActionLabel(log.action)}
                    </span>
                    <p className="text-xs text-white/70 leading-relaxed font-medium">
                      {formatMetadata(log)}
                    </p>
                  </div>
                ))}
                {auditLogs.length === 0 && (
                  <p className="text-center py-10 text-white/10 text-xs font-black uppercase tracking-[0.5em]">Sin logs registrados</p>
                )}
              </div>

              {/* VISTA ESCRITORIO: TABLA */}
              <table className="hidden md:table w-full text-left border-collapse table-fixed">
                <thead className="bg-wms-bg sticky top-0 z-10 shadow-2xl border-b-2 border-white/10">
                  <tr>
                    <th className="p-5 text-xs font-black text-white uppercase tracking-widest w-48">Hora</th>
                    <th className="p-5 text-xs font-black text-white uppercase tracking-widest w-48">Operario</th>
                    <th className="p-5 text-xs font-black text-white uppercase tracking-widest w-56">Acción</th>
                    <th className="p-5 text-xs font-black text-white uppercase tracking-widest">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-white/5">
                  {auditLogs.map((log: any) => (
                    <tr key={log.id} className="hover:bg-purple-500/5 transition-all duration-150 group cursor-default border-b border-white/5 last:border-0">
                      <td className="p-5 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-xs font-semibold text-wms-muted font-mono group-hover:text-white transition-colors">
                          <Clock size={12} className="text-wms-muted group-hover:text-purple-400 transition-colors" />
                          {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                        </div>
                      </td>
                      <td className="p-5 whitespace-nowrap">
                        <span className="inline-flex items-center font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-wms-card border border-wms-border/70 text-white tracking-tight shadow-sm">
                          {log.userId}
                        </span>
                      </td>
                      <td className="p-5 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${getActionStyle(log.action)}`}>
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="p-5 text-xs text-white/90 group-hover:text-white transition-colors leading-relaxed font-medium">
                        {formatMetadata(log)}
                      </td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-10 text-white/10 text-xs font-black uppercase tracking-[0.5em]">
                        Sin logs registrados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Loader de Impresión */}
      {isPrinting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 border border-white/20 animate-in zoom-in duration-300">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-leon-red/20 border-t-leon-red rounded-full animate-spin"></div>
              <Printer className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-leon-red animate-pulse" size={32} />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-black text-leon-black uppercase tracking-tight">Procesando Reimpresión</h3>
              <p className="text-leon-muted text-sm font-medium">Enviando a la SoonMark...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
