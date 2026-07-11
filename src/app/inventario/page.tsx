'use client';

import { useState, useEffect, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, Package, MapPin, ArrowLeft, Search, Truck, Printer, Check, ChevronDown, X, Star, History as HistoryIcon, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { CategoryIcon } from '@/components/CategoryIcon';
import { showToast, showConfirmModal, showModalAlert } from '@/lib/toast';
import { getHighResImageUrl } from '@/lib/image-utils';

interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  country: string | null;
  _count: { products: number };
}

interface ProductSupplierLink {
  id: string;
  costPrice: number;
  currency: string;
  isDefault: boolean;
  supplier: { id: string; name: string };
}

interface Product {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  salePrice: number | null;
  currency: string;
  mlAliases: string[];
  categoryFamily: number | null;
  suppliers: ProductSupplierLink[];
  locations: { id: string; quantity: number; location: { id: string; aisle: string; section: string; level: string } }[];
}

interface Location {
  id: string;
  aisle: string;
  section: string;
  level: string;
  sequenceIndex: number;
}

type Tab = 'products' | 'locations' | 'suppliers';

const getCategoryStyle = (family: number | null) => {
  if (!family) return 'bg-wms-card border-wms-border text-wms-muted';
  const styles: Record<number, string> = {
    1000: 'bg-blue-500/10 border-blue-500/30 text-blue-400',          // Cables
    2000: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',    // Adaptadores
    3000: 'bg-purple-500/10 border-purple-500/30 text-purple-400',    // Soportes
    4000: 'bg-violet-500/10 border-violet-500/30 text-violet-400',    // Pantallas
    5000: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',// Deportes
    6000: 'bg-teal-500/10 border-teal-500/30 text-teal-400',          // Ropa
    7000: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400',          // Calzado
    8000: 'bg-sky-500/10 border-sky-500/30 text-sky-400',            // Pantalones
    10000: 'bg-amber-500/10 border-amber-500/30 text-amber-400',      // Electrónica
    11000: 'bg-orange-500/10 border-orange-500/30 text-orange-400',  // Electrodomésticos
    12000: 'bg-rose-500/10 border-rose-500/30 text-rose-400',        // Hogar
    13000: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',  // Iluminación
    14000: 'bg-red-500/10 border-red-500/30 text-red-400',            // Herramientas
    15000: 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400',// Kits
    16000: 'bg-pink-500/10 border-pink-500/30 text-pink-400',        // Belleza
    17000: 'bg-slate-500/10 border-slate-500/30 text-slate-400',      // Papelería
  };
  return styles[family] || 'bg-wms-card border-wms-border text-wms-text';
};

export default function InventarioPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('products');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labelSize, setLabelSize] = useState('medium');
  const [skuGenerated, setSkuGenerated] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState({ supplierId: '', costPrice: '', currency: 'CLP' });
  const [stockForm, setStockForm] = useState({ locationId: '', quantity: '' });

  const [prodForm, setProdForm] = useState({ sku: '', name: '', brand: '', color: '', size: '', imageUrl: '', costPrice: '', salePrice: '', currency: 'CLP', supplierId: '' });
  const [locForm, setLocForm] = useState({ aisle: '', section: '', level: '', sequenceIndex: '' });
  const [supForm, setSupForm] = useState({ name: '', contact: '', country: '', notes: '' });
  const [printingProduct, setPrintingProduct] = useState<Product | null>(null);
  const [printQty, setPrintQty] = useState('1');

  // React Query: fetching de productos, ubicaciones y proveedores con caché
  const { data: products = [] as Product[] } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => fetch('/api/products').then(r => r.ok ? r.json() : []),
    staleTime: 30 * 1000,
  });
  const { data: locations = [] as Location[] } = useQuery<Location[]>({
    queryKey: ['locations'],
    queryFn: () => fetch('/api/locations').then(r => r.ok ? r.json() : []),
    staleTime: 60 * 1000,
  });
  const { data: suppliers = [] as Supplier[] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => fetch('/api/suppliers').then(r => r.ok ? r.json() : []),
    staleTime: 60 * 1000,
  });

  const fetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['locations'] });
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
  };

  const submit = async (url: string, body: Record<string, unknown>) => {
    setLoading(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setLoading(false);
      if (res.ok) {
        setShowForm(false);
        setSkuGenerated(false);
        setProdForm({ sku: '', name: '', brand: '', color: '', size: '', imageUrl: '', costPrice: '', salePrice: '', currency: 'CLP', supplierId: '' });
        fetchAll();
        return true;
      }
      const data = await res.json().catch(() => ({}));
      await showModalAlert('Error', data.error || 'Ocurrió un problema', 'error');
      return false;
    } catch (err) {
      setLoading(false);
      console.error('Error en submit:', err);
      await showModalAlert('Error', 'Error de conexión al guardar.', 'error');
      return false;
    }
  };

  const deleteSelectedProducts = async () => {
    if (selected.size === 0) return;
    
    const confirmResult = await showConfirmModal(
      '¿Eliminar productos?',
      `¿Seguro que deseas eliminar ${selected.size} producto(s) permanentemente?`,
      'Sí, eliminar'
    );
    if (!confirmResult.isConfirmed) return;
    
    let deletedCount = 0;
    let errorMsg = '';

    for (const id of Array.from(selected)) {
      try {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        if (res.ok) {
          deletedCount++;
        } else {
          const data = await res.json().catch(() => ({}));
          errorMsg = data.error || 'Ocurrió un problema';
          break; // Detener en el primer error
        }
      } catch (err) {
        console.error('Error al eliminar producto:', err);
        errorMsg = 'Error de conexión';
        break;
      }
    }

    if (deletedCount > 0) {
      setSelected(new Set());
      fetchAll();
    }
    
    if (errorMsg) {
      await showModalAlert('Error al eliminar', `Error al eliminar: ${errorMsg}\n\nSe eliminaron ${deletedCount} producto(s).`, 'error');
    } else {
      showToast(`Se eliminaron ${deletedCount} producto(s).`, 'success');
    }
  };

  const autoGenerateSku = async () => {
    if (!prodForm.name.trim()) return;
    let url = `/api/sku/generate?name=${encodeURIComponent(prodForm.name)}`;
    if (prodForm.brand) url += `&brand=${encodeURIComponent(prodForm.brand)}`;
    if (prodForm.color) url += `&color=${encodeURIComponent(prodForm.color)}`;
    if (prodForm.size) url += `&size=${encodeURIComponent(prodForm.size)}`;
    
    try {
      const res = await fetch(url);
      if (res.ok) {
        const { sku } = await res.json();
        setProdForm(f => ({ ...f, sku }));
        setSkuGenerated(true);
      }
    } catch (err) {
      console.error('Error al generar SKU:', err);
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedProduct(prev => prev === id ? null : id);
    setLinkForm({ supplierId: '', costPrice: '', currency: 'CLP' });
    setStockForm({ locationId: '', quantity: '' });
  };

  const addSupplierLink = async (productId: string) => {
    if (!linkForm.supplierId || !linkForm.costPrice) return;
    setLoading(true);
    try {
      await fetch('/api/product-suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, ...linkForm, costPrice: Number(linkForm.costPrice) }),
      });
    } catch (err) {
      console.error('Error al agregar proveedor:', err);
    }
    setLinkForm({ supplierId: '', costPrice: '', currency: 'CLP' });
    setLoading(false);
    fetchAll();
  };

  const removeSupplierLink = async (linkId: string) => {
    try {
      await fetch('/api/product-suppliers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: linkId }),
      });
    } catch (err) {
      console.error('Error al remover proveedor:', err);
    }
    fetchAll();
  };

  const setDefaultSupplier = async (productId: string, supplierId: string) => {
    try {
      await fetch('/api/product-suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, supplierId, costPrice: 0, isDefault: true }),
      });
    } catch (err) {
      console.error('Error al establecer proveedor default:', err);
    }
    fetchAll();
  };

  const removeAlias = async (productId: string, alias: string) => {
    const confirmResult = await showConfirmModal(
      '¿Eliminar vínculo?',
      `¿Deseas eliminar el vínculo "${alias}"?`,
      'Sí, eliminar'
    );
    if (!confirmResult.isConfirmed) return;
    try {
      const res = await fetch('/api/products/aliases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, alias }),
      });
    } catch (err) {
      console.error('Error al remover alias:', err);
    }
    fetchAll();
  };

  const updateProductStock = async (productId: string) => {
    if (!stockForm.locationId || !stockForm.quantity) return;
    setLoading(true);
    try {
      await fetch('/api/product-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, ...stockForm }),
      });
    } catch (err) {
      console.error('Error al actualizar stock:', err);
    }
    setStockForm({ locationId: '', quantity: '' });
    setLoading(false);
    fetchAll();
  };

  const removeProductStock = async (productId: string, locationId: string) => {
    setLoading(true);
    try {
      await fetch('/api/product-locations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, locationId }),
      });
    } catch (err) {
      console.error('Error al remover stock:', err);
    }
    setLoading(false);
    fetchAll();
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };

  const printLabels = () => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    const counts = ids.map(() => 1).join(',');
    window.open(`/api/labels?ids=${ids.join(',')}&counts=${counts}&size=${labelSize}`, '_blank');
  };

  const printSingleProduct = () => {
    if (!printingProduct) return;
    window.open(`/api/labels?ids=${printingProduct.id}&counts=${printQty}&size=${labelSize}`, '_blank');
    setPrintingProduct(null);
    setPrintQty('1');
  };

  const formatPrice = (val: number | null, currency: string) => {
    if (val === null) return '—';
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(val);
  };

  const getDefaultCost = (p: Product) => {
    const def = p.suppliers.find(s => s.isDefault) || p.suppliers[0];
    return def ? { cost: def.costPrice, currency: def.currency } : null;
  };

  const filtered = products.filter(p =>
    !p.sku.startsWith('ML-MISSING-') && (
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.suppliers.some(s => s.supplier.name.toLowerCase().includes(search.toLowerCase()))
    ) &&
    (!categoryFilter || p.categoryFamily === parseInt(categoryFilter))
  );

  const tabs: { key: Tab; icon: typeof Package; label: string; count: number }[] = [
    { key: 'products', icon: Package, label: 'Productos', count: products.length },
    { key: 'locations', icon: MapPin, label: 'Ubicaciones', count: locations.length },
    { key: 'suppliers', icon: Truck, label: 'Proveedores', count: suppliers.length },
  ];

  return (
    <div className="min-h-screen bg-wms-bg text-wms-text font-sans" data-scanner-ignore>
      <div className="leon-brand-bar" />
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0">
          <div className="flex items-start md:items-center gap-4">
            <Link href="/" className="p-2.5 bg-wms-surface border border-wms-border hover:border-leon-red/50 text-wms-muted hover:text-white rounded-full hover:bg-leon-red/10 transition-all shadow-sm mt-1 md:mt-0 shrink-0">
              <ArrowLeft size={20} strokeWidth={3} />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white leading-tight">INVENTARIO <span className="text-leon-red">& PROVEEDORES</span></h1>
              <p className="text-wms-muted text-xs md:text-sm mt-1">Productos, ubicaciones, costos y etiquetas</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {tab === 'products' && selected.size > 0 && (
              <div className="flex items-center gap-2 w-full md:w-auto">
                <select value={labelSize} onChange={e => setLabelSize(e.target.value)}
                  className="flex-1 md:flex-none bg-wms-card border border-wms-border rounded-xl px-3 py-2.5 text-xs md:text-sm text-white outline-none">
                  <option value="small">Chica (50×25mm)</option>
                  <option value="medium">Mediana (70×35mm)</option>
                  <option value="large">Grande (100×50mm)</option>
                </select>
                <button onClick={printLabels}
                  className="flex-1 md:flex-none justify-center bg-wms-surface border border-wms-border hover:border-leon-red text-white px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 transition-colors">
                  <Printer size={16} /> ETIQUETAS ({selected.size})
                </button>
              </div>
            )}
            <button onClick={() => { setShowForm(!showForm); setSkuGenerated(false); setProdForm({ sku: '', name: '', brand: '', color: '', size: '', imageUrl: '', costPrice: '', salePrice: '', currency: 'CLP', supplierId: '' }); }}
              className="w-full md:w-auto justify-center bg-leon-red hover:bg-leon-red-light text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors">
              <Plus size={18} /> NUEVO
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 w-full overflow-x-auto hide-scrollbar pb-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); setSelected(new Set()); }}
              className={`px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${tab === t.key ? 'bg-leon-red text-white shadow-lg shadow-leon-red/20' : 'bg-wms-surface text-wms-muted border border-wms-border hover:text-white hover:bg-white/5'}`}>
              <t.icon size={16} /> {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* ─── FORM: PRODUCTO ─── */}
        {showForm && tab === 'products' && (
          <div className="space-y-4 rounded-2xl border border-wms-border bg-wms-surface p-4 sm:p-6">
            <h3 className="text-lg font-bold">Nuevo Producto</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              <input placeholder="Nombre del producto *" value={prodForm.name}
                onChange={e => { setProdForm({ ...prodForm, name: e.target.value }); setSkuGenerated(false); }}
                onBlur={autoGenerateSku}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red sm:col-span-2 md:col-span-3" />
              <div className="relative sm:col-span-2 md:col-span-1">
                <input placeholder="SKU (automático)" value={prodForm.sku} readOnly
                  className="w-full bg-wms-card/50 border border-wms-border rounded-xl px-4 py-3 text-leon-red font-mono font-bold cursor-not-allowed" />
                {skuGenerated && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400 text-xs font-bold">AUTO ✓</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              <input placeholder="Marca (opc)" value={prodForm.brand}
                onChange={e => { setProdForm({ ...prodForm, brand: e.target.value }); setSkuGenerated(false); }}
                onBlur={autoGenerateSku}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
              <input placeholder="Color (opc)" value={prodForm.color}
                onChange={e => { setProdForm({ ...prodForm, color: e.target.value }); setSkuGenerated(false); }}
                onBlur={autoGenerateSku}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
              <input placeholder="Talla (opc)" value={prodForm.size}
                onChange={e => { setProdForm({ ...prodForm, size: e.target.value }); setSkuGenerated(false); }}
                onBlur={autoGenerateSku}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
              <input placeholder="URL Imagen (opc)" value={prodForm.imageUrl} onChange={e => setProdForm({ ...prodForm, imageUrl: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              <select value={prodForm.supplierId} onChange={e => setProdForm({ ...prodForm, supplierId: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red">
                <option value="">Sin proveedor</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input type="number" placeholder="Costo proveedor" value={prodForm.costPrice} onChange={e => setProdForm({ ...prodForm, costPrice: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red disabled:opacity-30"
                disabled={!prodForm.supplierId} />
              <input type="number" placeholder="Precio Venta" value={prodForm.salePrice} onChange={e => setProdForm({ ...prodForm, salePrice: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
              <select value={prodForm.currency} onChange={e => setProdForm({ ...prodForm, currency: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red">
                <option value="CLP">CLP</option><option value="USD">USD</option>
              </select>
            </div>
            <button onClick={() => submit('/api/products', prodForm)} disabled={!prodForm.sku || !prodForm.name || loading}
              className="w-full bg-leon-red hover:bg-leon-red-light text-white px-8 py-3 rounded-xl font-bold disabled:opacity-40 transition-colors sm:w-auto">
              {loading ? 'Guardando...' : 'Guardar Producto'}
            </button>
          </div>
        )}

        {/* ─── FORM: UBICACIÓN ─── */}
        {showForm && tab === 'locations' && (
          <div className="space-y-4 rounded-2xl border border-wms-border bg-wms-surface p-4 sm:p-6">
            <h3 className="text-lg font-bold">Nueva Ubicación</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              <input placeholder="Pasillo (A,B,C...)" value={locForm.aisle} onChange={e => setLocForm({ ...locForm, aisle: e.target.value.toUpperCase() })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
              <input placeholder="Sección" value={locForm.section} onChange={e => setLocForm({ ...locForm, section: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
              <input placeholder="Nivel" value={locForm.level} onChange={e => setLocForm({ ...locForm, level: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
              <input type="number" placeholder="Seq. Index" value={locForm.sequenceIndex} onChange={e => setLocForm({ ...locForm, sequenceIndex: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
            </div>
            <button onClick={() => submit('/api/locations', locForm)} disabled={!locForm.aisle || !locForm.section || loading}
              className="w-full bg-leon-red hover:bg-leon-red-light text-white px-8 py-3 rounded-xl font-bold disabled:opacity-40 transition-colors sm:w-auto">
              {loading ? 'Guardando...' : 'Guardar Ubicación'}
            </button>
          </div>
        )}

        {/* ─── FORM: PROVEEDOR ─── */}
        {showForm && tab === 'suppliers' && (
          <div className="space-y-4 rounded-2xl border border-wms-border bg-wms-surface p-4 sm:p-6">
            <h3 className="text-lg font-bold">Nuevo Proveedor</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <input placeholder="Nombre *" value={supForm.name} onChange={e => setSupForm({ ...supForm, name: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
              <input placeholder="Contacto (tel/email)" value={supForm.contact} onChange={e => setSupForm({ ...supForm, contact: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
              <input placeholder="País de origen" value={supForm.country} onChange={e => setSupForm({ ...supForm, country: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
              <input placeholder="Notas" value={supForm.notes} onChange={e => setSupForm({ ...supForm, notes: e.target.value })}
                className="bg-wms-card border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red" />
            </div>
            <button onClick={() => submit('/api/suppliers', supForm)} disabled={!supForm.name || loading}
              className="w-full bg-leon-red hover:bg-leon-red-light text-white px-8 py-3 rounded-xl font-bold disabled:opacity-40 transition-colors sm:w-auto">
              {loading ? 'Guardando...' : 'Guardar Proveedor'}
            </button>
          </div>
        )}

        {/* ─── BÚSQUEDA Y ACCIONES MASIVAS ─── */}
        {tab === 'products' && (
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative flex-[2] w-full">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-wms-muted" />
              <input type="text" placeholder="Buscar por SKU, nombre o proveedor..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-wms-surface border border-wms-border rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-leon-red" />
            </div>
            
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="w-full bg-wms-surface border border-wms-border rounded-xl px-4 py-3 text-white focus:outline-none focus:border-leon-red md:w-auto md:min-w-[200px]">
              <option value="">Todas las categorías</option>
              <option value="1000">Cables y Conexiones</option>
              <option value="2000">Adaptadores y Cargadores</option>
              <option value="3000">Soportes y Bases</option>
              <option value="4000">Pantallas y Video</option>
              <option value="5000">Accesorios y Deportes</option>
              <option value="6000">Ropa y Vestuario</option>
              <option value="7000">Calzado</option>
              <option value="8000">Pantalones y Cintura</option>
              <option value="10000">Electrónica y Tecnología</option>
              <option value="11000">Electrodomésticos y Cocina</option>
              <option value="12000">Hogar y Decoración</option>
              <option value="13000">Iluminación</option>
              <option value="14000">Organización y Herramientas</option>
              <option value="15000">Kits y Combos</option>
              <option value="16000">Cuidado Personal y Belleza</option>
              <option value="17000">Papelería y Oficina</option>
            </select>
            
            {selected.size > 0 && (
              <div className="flex w-full gap-2 md:w-auto">
                <button 
                  onClick={deleteSelectedProducts}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 font-bold text-red-500 transition-all hover:border-red-500 hover:bg-red-500/20 md:w-auto"
                >
                  <Trash2 size={18} />
                  Eliminar Selección ({selected.size})
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── TABLA PRODUCTOS ─── */}
        {tab === 'products' && (
          <div className="bg-wms-surface border border-wms-border rounded-2xl overflow-hidden">
            {/* Vista móvil: información esencial y acciones sin scroll horizontal. */}
            <div className="divide-y divide-wms-border/60 md:hidden">
              {filtered.length > 0 && (
                <div className="flex items-center justify-between bg-wms-card/40 px-4 py-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-wms-muted">
                    {filtered.length} productos
                  </span>
                  <button onClick={selectAll} className="flex min-h-9 items-center gap-2 rounded-lg border border-wms-border px-3 text-xs font-bold text-white">
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected.size === filtered.length && filtered.length > 0 ? 'border-leon-red bg-leon-red' : 'border-wms-muted'}`}>
                      {selected.size === filtered.length && filtered.length > 0 && <Check size={10} />}
                    </span>
                    Seleccionar todo
                  </button>
                </div>
              )}

              {filtered.length > 0 ? filtered.map(p => {
                const defaultCost = getDefaultCost(p);
                const totalStock = p.locations.reduce((sum, location) => sum + location.quantity, 0);
                const isSelected = selected.has(p.id);

                return (
                  <article key={`mobile-${p.id}`} className={isSelected ? 'bg-leon-red/5 p-4' : 'p-4'}>
                    <div className="flex items-start gap-3">
                      <button
                        onClick={e => toggleSelect(p.id, e)}
                        className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${isSelected ? 'border-leon-red bg-leon-red' : 'border-wms-border'}`}
                        aria-label={isSelected ? `Deseleccionar ${p.name}` : `Seleccionar ${p.name}`}
                      >
                        {isSelected && <Check size={14} />}
                      </button>

                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-wms-border bg-wms-bg">
                        {p.imageUrl ? (
                          <Image src={getHighResImageUrl(p.imageUrl) ?? ''} alt={p.name} fill className="object-contain p-1" sizes="56px" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-wms-muted"><Package size={20} /></div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[10px] font-black text-leon-red-light">{p.sku}</p>
                            <h3 className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-white">{p.name}</h3>
                          </div>
                          <button
                            onClick={() => setPrintingProduct(p)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-wms-border bg-wms-card text-wms-muted"
                            aria-label={`Imprimir etiqueta de ${p.name}`}
                          >
                            <Printer size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-wms-border/60 bg-wms-bg/50 p-3 text-center">
                      <div><p className="text-[9px] uppercase text-wms-muted">Costo</p><p className="mt-1 truncate text-xs font-bold">{defaultCost ? formatPrice(defaultCost.cost, defaultCost.currency) : '—'}</p></div>
                      <div><p className="text-[9px] uppercase text-wms-muted">Venta</p><p className="mt-1 truncate text-xs font-bold">{formatPrice(p.salePrice, p.currency)}</p></div>
                      <div><p className="text-[9px] uppercase text-wms-muted">Stock</p><p className={`mt-1 text-xs font-black ${totalStock > 0 ? 'text-emerald-400' : 'text-wms-muted'}`}>{totalStock} un.</p></div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.locations.length > 0 ? p.locations.map(location => (
                        <span key={location.id} className="inline-flex items-center gap-1 rounded-md border border-wms-border bg-wms-card px-2 py-1 font-mono text-[10px] font-bold">
                          <MapPin size={10} className="text-leon-red" />
                          {location.location.aisle}-{location.location.section}-{location.location.level} · {location.quantity}
                        </span>
                      )) : <span className="text-[10px] italic text-wms-muted">Sin ubicación asignada</span>}
                    </div>
                  </article>
                );
              }) : (
                <p className="px-4 py-12 text-center text-sm text-wms-muted">Sin productos</p>
              )}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1120px]">
                <thead>
                  <tr className="border-b border-wms-border">
                    <th className="px-3 py-3 text-left">
                      <button onClick={selectAll} className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${selected.size === filtered.length && filtered.length > 0 ? 'bg-leon-red border-leon-red' : 'border-wms-border hover:border-wms-muted'}`}>
                        {selected.size === filtered.length && filtered.length > 0 && <Check size={12} className="text-white" />}
                      </button>
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-wms-muted uppercase">SKU</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-wms-muted uppercase">Nombre</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-wms-muted uppercase">Categoría</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-wms-muted uppercase">Proveedores</th>
                    <th className="px-3 py-3 text-right text-xs font-bold text-wms-muted uppercase">Costo</th>
                    <th className="px-3 py-3 text-right text-xs font-bold text-wms-muted uppercase">Venta</th>
                    <th className="px-3 py-3 text-right text-xs font-bold text-wms-muted uppercase">Margen</th>
                    <th className="px-3 py-3 text-left text-xs font-bold text-wms-muted uppercase">Ubicación</th>
                    <th className="px-3 py-3 text-right text-xs font-bold text-wms-muted uppercase">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length > 0 ? filtered.map(p => {
                    const defaultCost = getDefaultCost(p);
                    const margin = defaultCost && p.salePrice ? Math.round(((p.salePrice - defaultCost.cost) / p.salePrice) * 100) : null;
                    const isSelected = selected.has(p.id);
                    return (
                      <Fragment key={p.id}>
                      <tr onClick={() => toggleExpand(p.id)}
                        className={`border-b border-wms-border/50 cursor-pointer transition-colors duration-150 ${
                          isSelected 
                            ? 'bg-leon-red/10' 
                            : expandedProduct === p.id 
                              ? 'bg-wms-card/30' 
                              : 'hover:bg-wms-card/50'
                        }`}>
                        <td className="px-3 py-4" onClick={e => toggleSelect(p.id, e)}>
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-150 ${
                            isSelected ? 'bg-leon-red border-leon-red scale-105 shadow-md shadow-leon-red/25' : 'border-wms-border hover:border-wms-muted'
                          }`}>
                            {isSelected && <Check size={12} className="text-white stroke-[3px]" />}
                          </div>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center font-mono font-black text-xs px-2.5 py-1 rounded bg-leon-red/15 border border-leon-red/35 text-leon-red-light tracking-tight shadow-sm whitespace-nowrap">
                              {p.sku}
                            </span>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setPrintingProduct(p); }}
                              className="p-1.5 bg-wms-card hover:bg-leon-red/20 border border-wms-border hover:border-leon-red/45 rounded-lg text-wms-muted hover:text-leon-red transition-all scale-95 hover:scale-100"
                              title="Imprimir etiquetas"
                            >
                              <Printer size={13} />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm">
                          <div className="flex items-center gap-3">
                            {p.imageUrl ? (
                              <div className="w-10 h-10 rounded-lg bg-wms-bg border border-wms-border overflow-hidden shrink-0 relative">
                                <Image src={getHighResImageUrl(p.imageUrl) ?? ''} alt={p.name} fill className="object-contain p-1" sizes="40px" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-wms-bg border border-wms-border flex items-center justify-center text-wms-muted shrink-0">
                                <Package size={16} />
                              </div>
                            )}
                            <span className="font-semibold text-white/90 line-clamp-2">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-4 text-sm">
                          {p.categoryFamily ? (() => {
                            const labels: Record<number, string> = {
                              1000: 'Cables',
                              2000: 'Adaptadores',
                              3000: 'Soportes',
                              4000: 'Pantallas',
                              5000: 'Deportes',
                              6000: 'Ropa',
                              7000: 'Calzado',
                              8000: 'Pantalones',
                              10000: 'Electrónica',
                              11000: 'Electrodomésticos',
                              12000: 'Hogar',
                              13000: 'Iluminación',
                              14000: 'Herramientas',
                              15000: 'Kits',
                              16000: 'Belleza',
                              17000: 'Papelería',
                            };
                            return (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-xs font-bold transition-all shadow-sm ${getCategoryStyle(p.categoryFamily)}`}>
                                <CategoryIcon family={p.categoryFamily} size={12} />
                                {labels[p.categoryFamily] || `Familia ${p.categoryFamily}`}
                              </span>
                            );
                          })() : (
                            <span className="text-wms-muted/40 font-mono italic text-xs">Sin categoría</span>
                          )}
                        </td>
                        <td className="px-3 py-4 text-sm">
                          {p.suppliers.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {p.suppliers.map(s => (
                                <span key={s.id} className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${
                                  s.isDefault 
                                    ? 'bg-leon-red/10 border-leon-red/35 text-leon-red-light font-black' 
                                    : 'bg-wms-card border-wms-border text-wms-muted font-semibold'
                                }`}>
                                  {s.supplier.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-wms-muted/40 font-mono italic text-xs">Sin proveedor</span>
                          )}
                        </td>
                        <td className="px-3 py-4 text-right text-sm font-mono font-semibold text-white/80">
                          {defaultCost ? (
                            formatPrice(defaultCost.cost, defaultCost.currency)
                          ) : (
                            <span className="text-wms-muted/40 font-mono italic text-xs">Sin costo</span>
                          )}
                        </td>
                        <td className="px-3 py-4 text-right text-sm font-mono font-bold text-white">
                          {formatPrice(p.salePrice, p.currency)}
                        </td>
                        <td className="px-3 py-4 text-right text-sm font-mono font-black">
                          {margin !== null ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${
                              margin >= 30 ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' :
                              margin >= 15 ? 'bg-amber-500/10 border-amber-500/25 text-amber-400' :
                              'bg-rose-500/10 border-rose-500/25 text-rose-400'
                            }`}>{margin}%</span>
                          ) : (
                            <span className="text-wms-muted/30 font-mono text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-4 text-sm">
                          {p.locations.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {p.locations.map(l => (
                                <span key={l.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-wms-card border border-wms-border text-white font-mono font-bold">
                                  <MapPin size={10} className="text-leon-red" />
                                  {l.location.aisle}-{l.location.section}-{l.location.level}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-wms-muted/40 font-mono italic text-xs">Sin ubicar</span>
                          )}
                        </td>
                        <td className="px-3 py-4 text-right text-sm">
                          {(() => {
                            const totalStock = p.locations.reduce((s, l) => s + l.quantity, 0);
                            return (
                              <div className="flex items-center justify-end gap-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black border ${
                                  totalStock > 0 
                                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
                                    : 'bg-wms-card border-wms-border text-wms-muted'
                                }`}>
                                  {totalStock} un.
                                </span>
                                <ChevronDown size={14} className={`text-wms-muted transition-transform duration-200 shrink-0 ${expandedProduct === p.id ? 'rotate-180 text-white' : ''}`} />
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                      {/* Panel de proveedores y ubicaciones expandible */}
                      {expandedProduct === p.id && (
                        <tr><td colSpan={10} className="px-6 py-6 bg-wms-card/20 border-t border-b border-wms-border/30">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            
                            {/* COLUMNA PROVEEDORES */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-bold text-wms-muted uppercase flex items-center gap-2"><Truck size={16}/> Proveedores</h4>
                              {p.suppliers.length > 0 ? (
                                <div className="space-y-2">
                                  {p.suppliers.map(s => (
                                    <div key={s.id} className="flex items-center justify-between bg-wms-surface border border-wms-border rounded-xl px-4 py-3">
                                      <div className="flex items-center gap-3">
                                        <button onClick={(e) => { e.stopPropagation(); setDefaultSupplier(p.id, s.supplier.id); }}
                                          className={`transition-colors ${s.isDefault ? 'text-amber-400' : 'text-wms-border hover:text-amber-400'}`}
                                          title={s.isDefault ? 'Proveedor principal' : 'Marcar como principal'}>
                                          <Star size={16} fill={s.isDefault ? 'currentColor' : 'none'} />
                                        </button>
                                        <span className="font-bold text-sm">{s.supplier.name}</span>
                                        {s.isDefault && <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded">PRINCIPAL</span>}
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <span className="font-mono text-sm">{formatPrice(s.costPrice, s.currency)}</span>
                                        <button onClick={(e) => { e.stopPropagation(); removeSupplierLink(s.id); }}
                                          className="text-wms-muted hover:text-red-400 transition-colors" title="Desvincular">
                                          <X size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-wms-muted italic">Sin proveedores vinculados</p>
                              )}
                              {/* Formulario para agregar proveedor */}
                              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
                                <select value={linkForm.supplierId} onChange={e => setLinkForm({ ...linkForm, supplierId: e.target.value })} onClick={e => e.stopPropagation()}
                                  className="flex-1 bg-wms-card border border-wms-border rounded-lg px-3 py-2 text-sm text-white">
                                  <option value="">Seleccionar proveedor...</option>
                                  {suppliers.filter(s => !p.suppliers.some(ps => ps.supplier.id === s.id)).map(s =>
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  )}
                                </select>
                                <input type="number" placeholder="Costo" value={linkForm.costPrice}
                                  onChange={e => setLinkForm({ ...linkForm, costPrice: e.target.value })} onClick={e => e.stopPropagation()}
                                  className="w-full bg-wms-card border border-wms-border rounded-lg px-3 py-2 text-sm text-white sm:w-24" />
                                <select value={linkForm.currency} onChange={e => setLinkForm({ ...linkForm, currency: e.target.value })} onClick={e => e.stopPropagation()}
                                  className="bg-wms-card border border-wms-border rounded-lg px-3 py-2 text-sm text-white">
                                  <option value="CLP">CLP</option><option value="USD">USD</option>
                                </select>
                                <button onClick={(e) => { e.stopPropagation(); addSupplierLink(p.id); }}
                                  disabled={!linkForm.supplierId || !linkForm.costPrice || loading}
                                  className="bg-leon-red hover:bg-leon-red-light text-white px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-40 transition-colors">
                                  <Plus size={16} />
                                </button>
                              </div>
                            </div>

                            {/* COLUMNA UBICACIONES */}
                            <div className="space-y-3">
                              <h4 className="text-sm font-bold text-wms-muted uppercase flex items-center gap-2"><MapPin size={16}/> Stock por Ubicación</h4>
                              {p.locations.length > 0 ? (
                                <div className="space-y-2">
                                  {p.locations.map(l => (
                                    <div key={l.id} className="flex items-center justify-between bg-wms-surface border border-wms-border rounded-xl px-4 py-3">
                                      <div className="flex items-center gap-3">
                                        <span className="font-bold text-sm text-leon-red">Pasillo {l.location.aisle}</span>
                                        <span className="text-sm text-wms-muted">Sec: {l.location.section} | Niv: {l.location.level}</span>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <span className="font-mono font-bold text-sm bg-wms-card px-2 py-1 rounded border border-wms-border">
                                          {l.quantity} un.
                                        </span>
                                        <button onClick={(e) => { e.stopPropagation(); removeProductStock(p.id, l.location.id); }}
                                          className="text-wms-muted hover:text-red-400 transition-colors" title="Limpiar stock">
                                          <X size={16} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-wms-muted italic">Sin stock asignado</p>
                              )}
                              {/* Formulario para agregar stock */}
                              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
                                <select value={stockForm.locationId} onChange={e => setStockForm({ ...stockForm, locationId: e.target.value })} onClick={e => e.stopPropagation()}
                                  className="flex-1 bg-wms-card border border-wms-border rounded-lg px-3 py-2 text-sm text-white">
                                  <option value="">Seleccionar ubicación...</option>
                                  {locations.map(loc =>
                                    <option key={loc.id} value={loc.id}>Pasillo {loc.aisle} - Sec: {loc.section} - Niv: {loc.level}</option>
                                  )}
                                </select>
                                <input type="number" placeholder="Cant." value={stockForm.quantity}
                                  onChange={e => setStockForm({ ...stockForm, quantity: e.target.value })} onClick={e => e.stopPropagation()}
                                  className="w-full bg-wms-card border border-wms-border rounded-lg px-3 py-2 text-sm text-white sm:w-24" />
                                <button onClick={(e) => { e.stopPropagation(); updateProductStock(p.id); }}
                                  disabled={!stockForm.locationId || !stockForm.quantity || loading}
                                  className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-40 transition-colors">
                                  <Check size={16} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* SECCIÓN DE ALIAS (Mercado Libre) */}
                          <div className="mt-8 pt-8 border-t border-wms-border/30">
                            <h4 className="text-sm font-bold text-wms-muted uppercase flex items-center gap-2 mb-4">
                              <HistoryIcon size={16}/> Vínculos de Mercado Libre (Aprendizaje Automático)
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {p.mlAliases && p.mlAliases.length > 0 ? (
                                p.mlAliases.map(alias => (
                                  <div key={alias} className="bg-wms-surface border border-wms-border px-4 py-2 rounded-xl flex items-center gap-3 group hover:border-leon-red/50 transition-colors">
                                    <span className="text-sm font-bold text-white">{alias}</span>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); removeAlias(p.id, alias); }}
                                      className="text-wms-muted hover:text-red-400 transition-colors"
                                      title="Eliminar vínculo"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <p className="text-sm text-wms-muted italic">Este producto no tiene vínculos de Mercado Libre registrados aún.</p>
                              )}
                            </div>
                          </div>
                        </td></tr>
                      )}
                      </Fragment>
                    );
                  }) : (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-wms-muted">Sin productos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── TABLA UBICACIONES ─── */}
        {tab === 'locations' && (
          <div className="overflow-x-auto rounded-2xl border border-wms-border bg-wms-surface">
            <div className="divide-y divide-wms-border/60 md:hidden">
              {locations.length > 0 ? locations.map(location => (
                <article key={`mobile-${location.id}`} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-wms-muted">Ubicación</p>
                    <p className="mt-1 font-mono text-lg font-black text-leon-red-light">{location.aisle}-{location.section}-{location.level}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-wms-muted">Secuencia</p>
                    <p className="mt-1 font-mono font-bold text-white">{location.sequenceIndex}</p>
                  </div>
                </article>
              )) : <p className="p-10 text-center text-sm text-wms-muted">Sin ubicaciones</p>}
            </div>
            <table className="hidden w-full min-w-[560px] md:table">
              <thead><tr className="border-b border-wms-border">
                <th className="px-6 py-4 text-left text-xs font-bold text-wms-muted uppercase">Pasillo</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-wms-muted uppercase">Sección</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-wms-muted uppercase">Nivel</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-wms-muted uppercase">Seq. Index</th>
              </tr></thead>
              <tbody>
                {locations.length > 0 ? locations.map(l => (
                  <tr key={l.id} className="border-b border-wms-border/50 hover:bg-wms-card/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-leon-red">{l.aisle}</td>
                    <td className="px-6 py-4">{l.section}</td>
                    <td className="px-6 py-4">{l.level}</td>
                    <td className="px-6 py-4 font-mono">{l.sequenceIndex}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-wms-muted">Sin ubicaciones</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── TABLA PROVEEDORES ─── */}
        {tab === 'suppliers' && (
          <div className="overflow-x-auto rounded-2xl border border-wms-border bg-wms-surface">
            <div className="divide-y divide-wms-border/60 md:hidden">
              {suppliers.length > 0 ? suppliers.map(supplier => (
                <article key={`mobile-${supplier.id}`} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-bold text-white">{supplier.name}</h3>
                      <p className="mt-1 break-words text-xs text-wms-muted">{supplier.contact || 'Sin contacto'}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-leon-red/10 px-2.5 py-1 text-xs font-black text-leon-red-light">{supplier._count.products} prod.</span>
                  </div>
                  <p className="text-xs"><span className="text-wms-muted">País:</span> {supplier.country || '—'}</p>
                </article>
              )) : <p className="p-10 text-center text-sm text-wms-muted">Sin proveedores</p>}
            </div>
            <table className="hidden w-full min-w-[620px] md:table">
              <thead><tr className="border-b border-wms-border">
                <th className="px-6 py-4 text-left text-xs font-bold text-wms-muted uppercase">Nombre</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-wms-muted uppercase">Contacto</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-wms-muted uppercase">País</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-wms-muted uppercase">Productos</th>
              </tr></thead>
              <tbody>
                {suppliers.length > 0 ? suppliers.map(s => (
                  <tr key={s.id} className="border-b border-wms-border/50 hover:bg-wms-card/50 transition-colors">
                    <td className="px-6 py-4 font-bold">{s.name}</td>
                    <td className="px-6 py-4 text-sm text-wms-muted">{s.contact || '—'}</td>
                    <td className="px-6 py-4 text-sm">{s.country || '—'}</td>
                    <td className="px-6 py-4 text-right font-bold text-leon-red">{s._count.products}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-wms-muted">Sin proveedores</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── MODAL DE IMPRESIÓN ─── */}
      {printingProduct && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="my-3 w-full max-w-md overflow-hidden rounded-2xl border border-wms-border bg-wms-surface shadow-2xl sm:my-0">
            <div className="bg-leon-red p-6 text-white">
              <h3 className="text-xl font-black italic uppercase">Imprimir Etiquetas</h3>
              <p className="text-xs opacity-80 uppercase font-bold truncate mt-1">{printingProduct.name}</p>
            </div>
            <div className="space-y-5 p-5 sm:space-y-6 sm:p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-wms-muted uppercase mb-2 block tracking-widest">Cantidad</label>
                  <input 
                    type="number"
                    min="1"
                    autoFocus
                    value={printQty}
                    onChange={(e) => setPrintQty(e.target.value)}
                    className="w-full bg-wms-bg border border-wms-border px-4 py-3 rounded-xl text-white font-bold outline-none focus:border-leon-red"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-wms-muted uppercase mb-2 block tracking-widest">Tamaño</label>
                  <select 
                    value={labelSize}
                    onChange={(e) => setLabelSize(e.target.value)}
                    className="w-full bg-wms-bg border border-wms-border px-4 py-3 rounded-xl text-white font-bold outline-none focus:border-leon-red"
                  >
                    <option value="small">Pequeño (50x25)</option>
                    <option value="medium">Medio (70x35)</option>
                    <option value="large">Grande (100x50)</option>
                  </select>
                </div>
              </div>
              
              <div className="bg-wms-card border border-wms-border p-4 rounded-xl">
                <p className="text-xs text-wms-muted mb-2 uppercase font-black tracking-tighter">Vista Previa SKU</p>
                <p className="text-2xl font-mono font-black text-leon-red text-center tracking-tighter">{printingProduct.sku}</p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setPrintingProduct(null)}
                  className="flex-1 text-wms-muted py-3 text-sm font-black hover:text-white transition-colors uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button 
                  onClick={printSingleProduct}
                  className="flex-[2] bg-leon-red hover:bg-leon-red-light text-white py-3 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-leon-red/20"
                >
                  Generar Etiquetas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
