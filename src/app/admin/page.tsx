'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Users, UserPlus, Shield, Key, Power, ArrowLeft, Save, Activity,
  AlertCircle, Package, Search, Check, Grid3X3, Plus, Pencil, Trash2, X, GitMerge
} from 'lucide-react';
import Link from 'next/link';
import { showToast, showConfirmModal, showModalAlert } from '@/lib/toast';
import ProductMergeManager from '@/components/ProductMergeManager';

type Tab = 'users' | 'cubicles' | 'duplicates' | 'ml-missing';

type Cubicle = {
  id: string;
  number: number;
  isActive: boolean;
  occupied: boolean;
  order: { id: string; mlId: string; shippingId: string | null } | null;
};

type GhostGroup = {
  name: string;
  ghostProductId: string;
  sku: string;
  imageUrl: string | null;
  createdAt: string;
  orderCount: number;
  totalQuantity: number;
  orders: { id: string; mlId: string; status: string; buyerName: string | null }[];
};

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('users');
  
  // ─── User state ───
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isNew, setIsNew] = useState(false);

  // ─── ML-MISSING state ───
  const [searchTerm, setSearchTerm] = useState('');

  // ─── Cubicle state ───
  const [newCubicleNumber, setNewCubicleNumber] = useState('');
  const [editingCubicle, setEditingCubicle] = useState<{ id: string; number: string } | null>(null);

  // React Query: fetching de usuarios
  const { data: users = [], isLoading: loading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => fetch('/api/admin/users').then(r => r.json()),
    staleTime: 30 * 1000,
    enabled: tab === 'users',
  });

  // React Query: fetching de ML-MISSING
  const { data: ghostData, isLoading: ghostLoading } = useQuery({
    queryKey: ['admin', 'ml-missing'],
    queryFn: () => fetch('/api/admin/ml-missing').then(r => r.json()),
    staleTime: 30 * 1000,
    enabled: tab === 'ml-missing',
  });

  const { data: cubicles = [], isLoading: cubiclesLoading } = useQuery<Cubicle[]>({
    queryKey: ['cubicles'],
    queryFn: async () => {
      const response = await fetch('/api/cubicles');
      if (!response.ok) throw new Error('No se pudieron cargar los cubículos');
      return response.json();
    },
    staleTime: 10 * 1000,
    enabled: tab === 'cubicles',
  });

  const ghostGroups: GhostGroup[] = ghostData?.items ?? [];

  // ─── Resolution modal state ───
  const [resolvingItem, setResolvingItem] = useState<GhostGroup | null>(null);
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [modalSearchResults, setModalSearchResults] = useState<any[]>([]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newProductSku, setNewProductSku] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');
  const [isSkuEditable, setIsSkuEditable] = useState(false);

  // ─── User functions (React Query refreshes) ───
  const fetchUsers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  }, [queryClient]);

  const fetchGhosts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'ml-missing'] });
  }, [queryClient]);

  const fetchCubicles = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['cubicles'] });
  }, [queryClient]);

  // ─── Effects ───
  useEffect(() => {
    if (tab === 'users') fetchUsers();
    if (tab === 'ml-missing') fetchGhosts();
    if (tab === 'cubicles') fetchCubicles();
  }, [tab, fetchUsers, fetchGhosts, fetchCubicles]);

  const saveCubicle = async (method: 'POST' | 'PUT') => {
    const payload = method === 'POST'
      ? { number: newCubicleNumber }
      : { id: editingCubicle?.id, number: editingCubicle?.number };

    try {
      const response = await fetch('/api/cubicles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el cubículo');

      setNewCubicleNumber('');
      setEditingCubicle(null);
      fetchCubicles();
      showToast(method === 'POST' ? 'Cubículo agregado.' : 'Cubículo actualizado.', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const deleteCubicle = async (cubicle: Cubicle) => {
    const confirmation = await showConfirmModal(
      `¿Eliminar el cubículo ${cubicle.number}?`,
      'Dejará de aparecer como opción para nuevas recolecciones.',
      'Sí, eliminar'
    );
    if (!confirmation.isConfirmed) return;

    try {
      const response = await fetch('/api/cubicles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cubicle.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo eliminar el cubículo');
      fetchCubicles();
      showToast('Cubículo eliminado.', 'info');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  // Auto-generate SKU when creating new product
  useEffect(() => {
    if (resolvingItem && isCreatingNew && !isSkuEditable) {
      let url = `/api/sku/generate?name=${encodeURIComponent(resolvingItem.name)}`;
      if (newBrand) url += `&brand=${encodeURIComponent(newBrand)}`;
      if (newColor) url += `&color=${encodeURIComponent(newColor)}`;
      if (newSize) url += `&size=${encodeURIComponent(newSize)}`;
      fetch(url).then(r => r.json()).then(d => { if (d.sku) setNewProductSku(d.sku); }).catch(() => {});
    }
  }, [resolvingItem, isCreatingNew, newBrand, newColor, newSize, isSkuEditable]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = isNew ? 'POST' : 'PUT';
    try {
      const res = await fetch('/api/admin/users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingUser)
      });
      if (res.ok) {
        setEditingUser(null);
        setIsNew(false);
        fetchUsers();
        showToast('Usuario guardado con éxito.', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        await showModalAlert('Error', data.error || 'Error al guardar usuario', 'error');
      }
    } catch (err) {
      console.error('Error al guardar usuario:', err);
      await showModalAlert('Error', 'Error de conexión al guardar usuario.', 'error');
    }
  };

  const startNew = () => {
    setEditingUser({ name: '', pin: '', role: 'PICKER', isActive: true });
    setIsNew(true);
  };

  const deleteUser = async (user: any) => {
    const confirmation = await showConfirmModal(
      `¿Eliminar permanentemente a ${user.name}?`,
      'Esta acción no se puede deshacer y podría afectar el historial si el usuario realizó tareas registradas.',
      'Sí, eliminar de todos modos'
    );
    if (!confirmation.isConfirmed) return;

    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id })
      });
      
      if (res.ok) {
        fetchUsers();
        showToast('Usuario eliminado correctamente.', 'info');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Error al eliminar usuario', 'error');
      }
    } catch (err) {
      console.error('Error al eliminar usuario:', err);
      showToast('Error de conexión al eliminar usuario.', 'error');
    }
  };

  // ─── Resolution functions ───
  const handleModalSearch = async (term: string) => {
    setModalSearchTerm(term);
    if (term.length < 2) { setModalSearchResults([]); return; }
    try {
      const res = await fetch(`/api/products?q=${term}`);
      if (res.ok) {
        const data = await res.json();
        setModalSearchResults(data.filter((p: any) => !p.sku.startsWith('ML-MISSING')));
      }
    } catch (err) {
      console.error('Error en búsqueda:', err);
    }
  };

  const resolveItem = async (realProductId: string) => {
    if (!resolvingItem) return;
    try {
      const res = await fetch('/api/supervisor/resolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: resolvingItem.orders[0]?.id,
          orderItemId: '',
          ghostProductId: resolvingItem.ghostProductId,
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
        fetchGhosts();
        await showModalAlert(
          'Vinculación exitosa',
          `Vínculo creado correctamente.${bulkCount > 0 ? ` (${bulkCount} vinculaciones masivas adicionales).` : ''} ${unblocked} orden(es) desbloqueada(s).`,
          'success'
        );
      } else {
        const data = await res.json().catch(() => ({}));
        await showModalAlert('Error', data.error || 'No se pudo vincular', 'error');
      }
    } catch (err) {
      console.error('Error al resolver item:', err);
      await showModalAlert('Error', 'Error de conexión al resolver el producto.', 'error');
    }
  };

  const createNewProduct = async () => {
    if (!resolvingItem || !newProductSku.trim()) return;
    try {
      const res = await fetch('/api/supervisor/resolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_AND_RESOLVE',
          orderId: resolvingItem.orders[0]?.id,
          orderItemId: '',
          ghostProductId: resolvingItem.ghostProductId,
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
        setNewBrand(''); setNewColor(''); setNewSize('');
        setIsSkuEditable(false);
        setModalSearchTerm('');
        setModalSearchResults([]);
        fetchGhosts();
        await showModalAlert(
          'Producto Creado',
          `Producto creado y vinculado correctamente.${bulkCount > 0 ? ` Vinculación masiva: ${bulkCount} adicional(es).` : ''} ${unblocked} orden(es) desbloqueada(s).`,
          'success'
        );
      } else {
        const data = await res.json().catch(() => ({}));
        await showModalAlert('Error', data.error || 'No se pudo crear', 'error');
      }
    } catch (err) {
      console.error('Error al crear producto:', err);
      await showModalAlert('Error', 'Error de conexión al crear el producto.', 'error');
    }
  };

  // ─── Filtered ghosts ───
  const filteredGhosts = ghostGroups.filter(g =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    g.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ─── Render ───
  if (loading && tab === 'users') {
    return <div className="min-h-screen bg-wms-bg flex items-center justify-center text-white">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-wms-bg text-white p-4 md:p-8">
      <div className="leon-brand-bar mb-6 md:mb-8 -mx-4 -mt-4 md:-mx-8 md:-mt-8" />

      {/* RESOLUTION MODAL */}
      {resolvingItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 p-3 backdrop-blur-md sm:items-center sm:p-4">
          <div className="my-3 w-full max-w-lg overflow-hidden rounded-2xl border-2 border-leon-red bg-wms-surface shadow-[0_0_50px_rgba(255,0,0,0.2)] sm:my-0">
            <div className="bg-leon-red p-5 text-white sm:p-6">
              <h3 className="text-xl font-black italic uppercase tracking-tighter">Resolver Producto</h3>
              <p className="text-sm opacity-90 uppercase font-black truncate mt-1">{resolvingItem.name}</p>
              <p className="text-[10px] opacity-70 mt-1 font-mono">{resolvingItem.orders.length} orden(es) • {resolvingItem.totalQuantity} unidad(es)</p>
            </div>
            <div className="space-y-5 bg-wms-bg p-4 sm:p-6">
              <div className="flex bg-black rounded-xl p-1 shadow-inner">
                <button onClick={() => setIsCreatingNew(false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                    !isCreatingNew ? 'bg-leon-red text-white shadow-md' : 'text-wms-muted hover:text-white'
                  }`}>Vincular Existente</button>
                <button onClick={() => setIsCreatingNew(true)}
                  className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                    isCreatingNew ? 'bg-amber-500 text-black shadow-md' : 'text-wms-muted hover:text-white'
                  }`}>Crear Nuevo</button>
              </div>

              {!isCreatingNew ? (
                <>
                  <div>
                    <label className="text-xs font-black text-white uppercase mb-2 block tracking-widest">Buscar en Inventario</label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-leon-red" size={20} />
                      <input type="text" autoFocus value={modalSearchTerm}
                        onChange={(e) => handleModalSearch(e.target.value)}
                        placeholder="SKU o Nombre del producto..."
                        className="w-full bg-black border-2 border-wms-border pl-12 pr-4 py-4 rounded-xl text-white font-bold outline-none focus:border-leon-red transition-all" />
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
                    {modalSearchResults.map(p => (
                      <button key={p.id} onClick={() => resolveItem(p.id)}
                        className="w-full bg-black hover:bg-leon-red/20 border-2 border-wms-border p-4 rounded-xl flex justify-between items-center transition-all group active:scale-[0.98]">
                        <div className="text-left min-w-0">
                          <p className="font-black text-sm text-white group-hover:text-leon-red truncate">{p.name}</p>
                          <p className="text-xs text-wms-muted font-mono font-bold mt-1 uppercase">{p.sku}</p>
                        </div>
                        <span className="bg-leon-red text-white font-black text-[10px] px-3 py-1 rounded-full shadow-lg group-hover:scale-110 transition-transform">VINCULAR</span>
                      </button>
                    ))}
                    {modalSearchTerm.length >= 2 && modalSearchResults.length === 0 && (
                      <p className="text-center text-wms-muted text-xs py-8 font-bold">Sin resultados. Prueba &quot;Crear Nuevo&quot;</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-black text-amber-500 uppercase tracking-widest">SKU {isSkuEditable ? '(MANUAL)' : '(AUTOMÁTICO)'}</label>
                      <button onClick={() => setIsSkuEditable(!isSkuEditable)}
                        className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded transition-colors ${isSkuEditable ? 'bg-leon-red/20 text-leon-red' : 'bg-wms-border text-wms-muted hover:text-white'}`}>
                        {isSkuEditable ? 'Auto' : 'Manual'}
                      </button>
                    </div>
                    <input type="text" readOnly={!isSkuEditable} value={newProductSku}
                      onChange={(e) => isSkuEditable && setNewProductSku(e.target.value.toUpperCase())}
                      className={`w-full bg-black/50 border pl-4 pr-4 py-3 rounded-lg font-mono font-black text-lg outline-none uppercase transition-all ${
                        isSkuEditable ? 'border-amber-500 text-white focus:border-amber-400' : 'border-amber-500/30 text-amber-500 opacity-80 cursor-not-allowed'
                      }`} />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-bold text-wms-muted uppercase mb-1 block">Marca</label>
                      <input type="text" value={newBrand} onChange={(e) => setNewBrand(e.target.value)}
                        placeholder="Ej: Oster"
                        className="w-full bg-black border border-wms-border px-3 py-2 rounded-lg text-white font-bold outline-none focus:border-amber-500 transition-colors uppercase" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-wms-muted uppercase mb-1 block">Color</label>
                      <input type="text" value={newColor} onChange={(e) => setNewColor(e.target.value)}
                        placeholder="Ej: Negro"
                        className="w-full bg-black border border-wms-border px-3 py-2 rounded-lg text-white font-bold outline-none focus:border-amber-500 transition-colors uppercase" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-bold text-wms-muted uppercase mb-1 block">Talla / Tamaño</label>
                      <input type="text" value={newSize} onChange={(e) => setNewSize(e.target.value)}
                        placeholder="Ej: 7.5L"
                        className="w-full bg-black border border-wms-border px-3 py-2 rounded-lg text-white font-bold outline-none focus:border-amber-500 transition-colors uppercase" />
                    </div>
                  </div>
                  <button onClick={createNewProduct} disabled={!newProductSku.trim()}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black uppercase tracking-widest py-4 mt-2 rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)] active:scale-[0.98]">
                    CONFIRMAR Y CREAR PRODUCTO
                  </button>
                </div>
              )}
              <button onClick={() => { setResolvingItem(null); setIsCreatingNew(false); }}
                className="w-full text-wms-muted py-2 text-xs font-black hover:text-white transition-colors uppercase tracking-widest">← Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── HEADER ─── */}
      <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6 md:mb-8">
        <div className="flex items-center gap-3 md:gap-4">
          <Link href="/" className="text-wms-muted hover:text-white transition-colors shrink-0">
            <ArrowLeft size={24} className="md:w-8 md:h-8" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tighter">
              ADMIN <span className="text-leon-red">PANEL</span>
            </h1>
            <p className="text-wms-muted uppercase tracking-widest text-xs md:text-sm">Gestión Centralizada</p>
          </div>
        </div>
      </header>

      {/* ─── TABS ─── */}
      <div className="hide-scrollbar mb-6 flex w-full gap-2 overflow-x-auto pb-1 md:mb-8 md:gap-4">
        <button onClick={() => setTab('users')}
          className={`shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 transition-all ${
            tab === 'users' ? 'bg-leon-red text-white shadow-lg shadow-leon-red/20' : 'bg-wms-surface text-wms-muted border border-wms-border hover:border-wms-muted/30'
          }`}>
          <Users size={16} className="md:w-[18px] md:h-[18px]" /> USUARIOS ({users.length})
        </button>
        <button onClick={() => setTab('ml-missing')}
          className={`shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 transition-all ${
            tab === 'ml-missing' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'bg-wms-surface text-wms-muted border border-wms-border hover:border-wms-muted/30'
          }`}>
          <AlertCircle size={16} className="md:w-[18px] md:h-[18px]" /> ML-MISSING ({ghostGroups.length})
        </button>
        <button onClick={() => setTab('cubicles')}
          className={`shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 transition-all ${
            tab === 'cubicles' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-wms-surface text-wms-muted border border-wms-border hover:border-wms-muted/30'
          }`}>
          <Grid3X3 size={16} className="md:w-[18px] md:h-[18px]" /> CUBÍCULOS ({cubicles.length})
        </button>
        <button onClick={() => setTab('duplicates')}
          className={`shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 transition-all ${
            tab === 'duplicates' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-wms-surface text-wms-muted border border-wms-border hover:border-wms-muted/30'
          }`}>
          <GitMerge size={16} className="md:w-[18px] md:h-[18px]" /> DUPLICADOS
        </button>
        <Link href="/admin/sync"
          className="shrink-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 bg-wms-surface text-wms-muted border border-wms-border hover:border-wms-muted/30 transition-all">
          <Activity size={16} className="md:w-[18px] md:h-[18px]" /> SYNC
        </Link>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: USUARIOS */}
      {/* ═══════════════════════════════════════════ */}
      {tab === 'users' && (
        <>
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
            <h2 className="text-lg md:text-xl font-black uppercase tracking-wider">Gestión de Cuentas</h2>
            <button onClick={startNew}
              className="bg-leon-red text-white px-4 md:px-6 py-2.5 md:py-3 rounded-2xl font-black flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-lg shadow-leon-red/20 text-sm w-full md:w-auto">
              <UserPlus size={18} /> NUEVO USUARIO
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {users.map((user: any) => (
              <div key={user.id} className={`bg-wms-surface border ${user.isActive ? 'border-wms-border' : 'border-red-900/50 grayscale'} p-5 md:p-6 rounded-2xl md:rounded-3xl relative overflow-hidden group`}>
                <div className="flex justify-between items-start mb-6">
                  <div className="bg-wms-bg p-3 rounded-2xl">
                    <Shield size={24} className={user.role === 'ADMIN' ? 'text-leon-red' : 'text-wms-muted'} />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setEditingUser(user); setIsNew(false); }}
                      className="text-xs font-black uppercase text-amber-500 hover:text-amber-400 transition-colors">
                      Editar
                    </button>
                    <button onClick={() => deleteUser(user)}
                      className="text-xs font-black uppercase text-leon-red-light hover:text-leon-red transition-colors flex items-center gap-0.5">
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-1">{user.name}</h3>
                <p className="text-leon-red text-xs font-black uppercase tracking-widest mb-4">{user.role}</p>
                <div className="flex items-center gap-4 text-sm text-wms-muted">
                  <div className="flex items-center gap-1"><Key size={14} /> PIN: {user.plainPin || 'Sin PIN'}</div>
                  <div className="flex items-center gap-1">
                    <Power size={14} className={user.isActive ? 'text-green-500' : 'text-red-500'} /> 
                    {user.isActive ? 'ACTIVO' : 'INACTIVO'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: CUBÍCULOS */}
      {/* ═══════════════════════════════════════════ */}
      {tab === 'cubicles' && (
        <section className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider md:text-xl">Gestión de Cubículos</h2>
              <p className="mt-1 max-w-2xl text-sm text-wms-muted">
                El cubículo se ocupa al finalizar picking y se libera cuando una mesa comienza a empacar la orden.
              </p>
            </div>

            <div className="flex w-full gap-2 md:w-auto">
              <div className="relative min-w-0 flex-1 md:w-48">
                <Grid3X3 className="absolute left-3 top-1/2 -translate-y-1/2 text-wms-muted" size={18} />
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={newCubicleNumber}
                  onChange={event => setNewCubicleNumber(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter' && newCubicleNumber) saveCubicle('POST'); }}
                  placeholder="Número"
                  className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-surface pl-10 pr-3 font-mono text-white outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={() => saveCubicle('POST')}
                disabled={!newCubicleNumber}
                className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
              >
                <Plus size={18} /> <span className="hidden sm:inline">AGREGAR</span>
              </button>
            </div>
          </div>

          {cubiclesLoading ? (
            <div className="py-20 text-center font-bold text-wms-muted">Cargando cubículos...</div>
          ) : cubicles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-wms-border bg-wms-surface py-16 text-center">
              <Grid3X3 size={48} className="mx-auto mb-4 text-wms-muted/30" />
              <p className="font-bold text-white">No hay cubículos configurados</p>
              <p className="mt-1 text-sm text-wms-muted">Agrega el primer número para habilitar el cierre de picking.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cubicles.map(cubicle => (
                <article key={cubicle.id} className={`rounded-2xl border p-5 transition-colors ${cubicle.occupied ? 'border-amber-500/40 bg-amber-500/5' : 'border-wms-border bg-wms-surface'}`}>
                  {editingCubicle?.id === cubicle.id ? (
                    <div className="space-y-4">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-wms-muted">Nuevo número</label>
                      <input
                        type="number"
                        min="1"
                        autoFocus
                        value={editingCubicle.number}
                        onChange={event => setEditingCubicle({ ...editingCubicle, number: event.target.value })}
                        className="min-h-14 w-full rounded-xl border border-blue-500 bg-wms-bg px-4 text-center font-mono text-2xl font-black text-white outline-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setEditingCubicle(null)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-wms-border text-xs font-bold text-wms-muted"><X size={15} /> CANCELAR</button>
                        <button onClick={() => saveCubicle('PUT')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white"><Save size={15} /> GUARDAR</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-wms-muted">Cubículo</p>
                          <p className="mt-1 font-mono text-4xl font-black text-white">{cubicle.number}</p>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${
                          cubicle.occupied
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                            : 'border-green-500/30 bg-green-500/10 text-green-400'
                        }`}>
                          {cubicle.occupied ? 'Ocupado' : 'Disponible'}
                        </span>
                      </div>

                      {cubicle.occupied && cubicle.order && (
                        <div className="mt-4 rounded-xl border border-amber-500/20 bg-black/20 p-3">
                          <p className="text-[9px] font-black uppercase tracking-widest text-wms-muted">Esperando packing</p>
                          <p className="mt-1 truncate font-mono text-xs font-bold text-amber-300">ML-{cubicle.order.mlId}</p>
                        </div>
                      )}

                      <div className="mt-5 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setEditingCubicle({ id: cubicle.id, number: String(cubicle.number) })}
                          disabled={cubicle.occupied}
                          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-wms-border text-xs font-bold text-white transition-colors hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Pencil size={15} /> EDITAR
                        </button>
                        <button
                          onClick={() => deleteCubicle(cubicle)}
                          disabled={cubicle.occupied}
                          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-bold text-red-400 transition-colors hover:border-red-500/50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Trash2 size={15} /> ELIMINAR
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'duplicates' && <ProductMergeManager />}

      {/* ═══════════════════════════════════════════ */}
      {/* TAB: ML-MISSING */}
      {/* ═══════════════════════════════════════════ */}
      {tab === 'ml-missing' && (
        <>
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-6 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-wms-muted" size={20} />
              <input type="text" placeholder="Buscar por nombre o SKU..." value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-wms-surface border border-wms-border rounded-xl pl-12 pr-4 py-3 text-white outline-none focus:border-amber-500 transition-all" />
            </div>
            <button onClick={fetchGhosts} disabled={ghostLoading}
              className="bg-wms-surface border border-wms-border hover:border-amber-500 text-white px-5 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 w-full md:w-auto">
              <Activity size={16} className={ghostLoading ? 'animate-spin' : ''} />
              <span className="md:hidden text-xs font-black uppercase tracking-widest">Refrescar</span>
            </button>
          </div>

          {ghostLoading ? (
            <div className="text-center py-20 text-wms-muted font-bold">Cargando productos pendientes...</div>
          ) : filteredGhosts.length === 0 ? (
            <div className="text-center py-20">
              <Check size={64} className="mx-auto text-green-500 mb-4" strokeWidth={2} />
              <p className="text-xl font-black text-green-500 uppercase tracking-wider">Sistema Limpio</p>
              <p className="text-wms-muted text-sm mt-2">No hay productos ML-MISSING pendientes de resolución</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredGhosts.map(g => (
                <div key={g.ghostProductId} className="bg-wms-surface border-2 border-amber-500/20 hover:border-amber-500/50 rounded-2xl p-5 transition-all group">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-14 h-14 bg-amber-500/10 rounded-xl flex items-center justify-center shrink-0 border border-amber-500/20">
                      <Package size={24} className="text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-white leading-tight truncate">{g.name}</p>
                      <p className="text-[10px] font-mono text-amber-500/70 mt-1">{g.sku}</p>
                    </div>
                    <button onClick={() => setResolvingItem(g)}
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
          )}
        </>
      )}

      {/* ─── USER EDIT MODAL ─── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:items-center sm:p-4">
          <form onSubmit={handleSave} className="my-3 w-full max-w-md overflow-hidden rounded-2xl border border-wms-border bg-wms-surface shadow-2xl sm:my-0 sm:rounded-3xl">
            <div className="bg-leon-red p-5 sm:p-6">
              <h2 className="text-xl font-black italic">{isNew ? 'CREAR NUEVO USUARIO' : 'EDITAR USUARIO'}</h2>
            </div>
            <div className="space-y-5 p-5 sm:space-y-6 sm:p-8">
              <div className="space-y-2">
                <label className="text-xs font-bold text-wms-muted uppercase">Nombre Completo</label>
                <input type="text" required value={editingUser.name}
                  onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                  className="w-full bg-wms-bg border border-wms-border p-4 rounded-xl text-white outline-none focus:border-leon-red" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-wms-muted uppercase">PIN de Acceso</label>
                  <input type="text" required maxLength={6}
                    placeholder="NUEVO PIN"
                    value={isNew ? editingUser.pin : (editingUser.plainPin || '')}
                    onChange={e => {
                      const val = e.target.value;
                      if (isNew) setEditingUser({...editingUser, pin: val});
                      else setEditingUser({...editingUser, pin: val, plainPin: val});
                    }}
                    className="w-full bg-wms-bg border border-wms-border p-4 rounded-xl text-white font-mono text-center text-xl outline-none focus:border-leon-red" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-wms-muted uppercase">Rol / Permisos</label>
                  <select value={editingUser.role}
                    onChange={e => setEditingUser({...editingUser, role: e.target.value})}
                    className="w-full bg-wms-bg border border-wms-border p-4 rounded-xl text-white outline-none focus:border-leon-red">
                    <option value="PICKER">PICKER</option>
                    <option value="PACKER">PACKER</option>
                    <option value="SUPERVISOR">SUPERVISOR</option>
                    <option value="ADMIN">ADMINISTRADOR</option>
                  </select>
                </div>
              </div>
              {!isNew && (
                <div className="flex items-center gap-3 bg-wms-bg p-4 rounded-xl">
                  <input type="checkbox" id="isActive"
                    checked={editingUser.isActive}
                    onChange={e => setEditingUser({...editingUser, isActive: e.target.checked})}
                    className="w-5 h-5 accent-leon-red" />
                  <label htmlFor="isActive" className="text-sm font-bold uppercase cursor-pointer">Cuenta Activa</label>
                </div>
              )}
              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:gap-4 sm:pt-4">
                <button type="button" onClick={() => setEditingUser(null)}
                  className="flex-1 bg-wms-bg text-wms-muted py-4 rounded-xl font-bold hover:text-white transition-colors">CANCELAR</button>
                {!isNew && (
                  <button type="button" 
                    onClick={() => {
                      const userToDel = {...editingUser};
                      setEditingUser(null);
                      deleteUser(userToDel);
                    }}
                    className="flex-1 bg-leon-red/10 border border-leon-red/30 text-leon-red hover:bg-leon-red hover:text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2">
                    <Trash2 size={16} /> ELIMINAR
                  </button>
                )}
                <button type="submit"
                  className="flex-1 bg-leon-red text-white py-4 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-red-600 transition-colors">
                  <Save size={18} /> GUARDAR
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
