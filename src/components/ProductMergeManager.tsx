'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check, GitMerge, PackageSearch, Search, Warehouse, X } from 'lucide-react';
import { showConfirmModal, showToast } from '@/lib/toast';

type MergeProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  color: string | null;
  size: string | null;
  totalStock: number;
  listingCount: number;
  orderCount: number;
  score?: number;
  locations: Array<{ id: string; quantity: number; location: { aisle: string; section: string; level: string } }>;
  suppliers: Array<{ id: string; supplier: { name: string } }>;
  marketplaceListings: Array<{ id: string; listingId: string; variationId: string; sellerSku: string | null; title: string }>;
};

function marketplaceSkus(product: MergeProduct) {
  return [...new Set(product.marketplaceListings.map(listing => listing.sellerSku?.trim()).filter((sku): sku is string => !!sku))];
}

function productMergeLabel(product: MergeProduct) {
  const mlSkus = marketplaceSkus(product);
  return mlSkus.length ? `ML ${mlSkus.join(' / ')} (interno ${product.sku})` : `interno ${product.sku}`;
}

function ProductOption({ product, selected, onClick }: { product: MergeProduct; selected?: boolean; onClick: () => void }) {
  const mlSkus = marketplaceSkus(product);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-all ${selected ? 'border-blue-500 bg-blue-500/10' : 'border-wms-border bg-wms-card hover:border-blue-500/40'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-black text-amber-400">ML: {mlSkus.join(' · ') || 'SIN SKU ML'}</p>
          <p className="mt-0.5 truncate font-mono text-[9px] font-bold text-wms-muted">INTERNO: {product.sku}</p>
          <p className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-white">{product.name}</p>
        </div>
        {product.score !== undefined && (
          <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${product.score >= 80 ? 'bg-green-500/10 text-green-400' : product.score >= 55 ? 'bg-amber-500/10 text-amber-400' : 'bg-wms-bg text-wms-muted'}`}>
            {product.score}%
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-bold uppercase text-wms-muted">
        <span>{product.totalStock} stock</span>
        <span>•</span>
        <span>{product.listingCount} publicaciones</span>
        <span>•</span>
        <span>{product.orderCount} órdenes</span>
      </div>
    </button>
  );
}

function ProductSummary({ product, role }: { product: MergeProduct; role: 'source' | 'target' }) {
  const isTarget = role === 'target';
  const mlSkus = marketplaceSkus(product);
  return (
    <div className={`h-full rounded-2xl border p-5 ${isTarget ? 'border-green-500/35 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${isTarget ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
          {isTarget ? 'Producto principal' : 'Se fusionará'}
        </span>
        {isTarget && <Check size={18} className="text-green-400" />}
      </div>
      <p className="font-mono text-sm font-black text-amber-400">ML: {mlSkus.join(' · ') || 'SIN SKU ML'}</p>
      <p className="mt-1 font-mono text-[10px] font-bold text-wms-muted">SKU INTERNO: {product.sku}</p>
      <h3 className="mt-2 text-lg font-black leading-tight text-white">{product.name}</h3>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-black/20 p-2"><p className="text-[8px] uppercase text-wms-muted">Stock</p><p className="mt-1 font-black">{product.totalStock}</p></div>
        <div className="rounded-xl bg-black/20 p-2"><p className="text-[8px] uppercase text-wms-muted">Public.</p><p className="mt-1 font-black">{product.listingCount}</p></div>
        <div className="rounded-xl bg-black/20 p-2"><p className="text-[8px] uppercase text-wms-muted">Órdenes</p><p className="mt-1 font-black">{product.orderCount}</p></div>
      </div>
      <div className="mt-4 space-y-2 text-xs text-wms-muted">
        <p><span className="font-bold text-white/70">Variación:</span> {[product.brand, product.color, product.size].filter(Boolean).join(' · ') || 'Sin atributos'}</p>
        <p><span className="font-bold text-white/70">Proveedores:</span> {product.suppliers.map(item => item.supplier.name).join(', ') || 'Ninguno'}</p>
        <div>
          <span className="font-bold text-white/70">Publicaciones ML:</span>
          <div className="mt-2 space-y-1">
            {product.marketplaceListings.length ? product.marketplaceListings.map(listing => (
              <p key={listing.id} className="rounded-lg bg-black/20 px-2.5 py-2">
                <span className="font-mono font-black text-amber-300">{listing.sellerSku || 'Sin seller SKU'}</span>
                <span className="ml-2">{listing.title}</span>
              </p>
            )) : <p className="text-wms-muted">Sin publicaciones vinculadas</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProductMergeManager() {
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [sourceResults, setSourceResults] = useState<MergeProduct[]>([]);
  const [targetResults, setTargetResults] = useState<MergeProduct[]>([]);
  const [source, setSource] = useState<MergeProduct | null>(null);
  const [target, setTarget] = useState<MergeProduct | null>(null);
  const [suggestions, setSuggestions] = useState<MergeProduct[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (sourceSearch.trim().length < 2 || source) { setSourceResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/admin/products/merge?q=${encodeURIComponent(sourceSearch)}`, { signal: controller.signal });
      if (response.ok) setSourceResults(await response.json());
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [sourceSearch, source]);

  useEffect(() => {
    if (targetSearch.trim().length < 2 || target) { setTargetResults([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/admin/products/merge?q=${encodeURIComponent(targetSearch)}`, { signal: controller.signal });
      if (response.ok) {
        const products: MergeProduct[] = await response.json();
        setTargetResults(products.filter(product => product.id !== source?.id));
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [targetSearch, target, source]);

  useEffect(() => {
    if (!source) { setSuggestions([]); return; }
    setLoadingSuggestions(true);
    fetch(`/api/admin/products/merge?sourceId=${source.id}`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(data => setSuggestions(data.suggestions || []))
      .catch(() => showToast('No se pudieron calcular las sugerencias.', 'error'))
      .finally(() => setLoadingSuggestions(false));
  }, [source]);

  const reset = () => {
    setSource(null); setTarget(null); setSourceSearch(''); setTargetSearch(''); setSuggestions([]);
  };

  const merge = async () => {
    if (!source || !target) return;
    const confirmation = await showConfirmModal(
      `¿Fusionar ${productMergeLabel(source)} dentro de ${productMergeLabel(target)}?`,
      `Se moverán ${source.totalStock} unidades, ${source.listingCount} publicaciones y ${source.orderCount} órdenes. El producto principal conservará su SKU y nombre.`,
      'Sí, fusionar'
    );
    if (!confirmation.isConfirmed) return;

    setMerging(true);
    try {
      const response = await fetch('/api/admin/products/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceProductId: source.id, targetProductId: target.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo completar el merge');
      showToast(`${productMergeLabel(source)} fue fusionado correctamente dentro de ${productMergeLabel(target)}.`, 'success');
      reset();
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setMerging(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="flex items-center gap-3 text-xl font-black uppercase tracking-tight text-white md:text-2xl"><GitMerge className="text-blue-400" /> Fusionar productos duplicados</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-wms-muted">Elige el producto duplicado y luego el principal. Las sugerencias priorizan los seller SKU de MercadoLibre —incluidas variantes con ceros iniciales— y siempre requieren confirmación.</p>
      </div>

      {!source ? (
        <div className="mx-auto max-w-2xl rounded-2xl border border-wms-border bg-wms-surface p-4 sm:p-6">
          <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-wms-muted">1. Buscar producto duplicado</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-wms-muted" size={19} />
            <input value={sourceSearch} onChange={event => setSourceSearch(event.target.value)} placeholder="SKU, nombre o SKU de publicación ML..." className="min-h-14 w-full rounded-xl border border-wms-border bg-wms-bg pl-12 pr-4 text-white outline-none focus:border-blue-500" />
          </div>
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto custom-scrollbar">
            {sourceResults.map(product => <ProductOption key={product.id} product={product} onClick={() => { setSource(product); setSourceSearch(product.sku); }} />)}
            {sourceSearch.length >= 2 && sourceResults.length === 0 && <p className="py-8 text-center text-sm text-wms-muted">Escribe para buscar productos activos.</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-widest text-red-400">Producto a fusionar</p><p className="truncate text-sm font-bold text-white">{productMergeLabel(source)} · {source.name}</p></div>
            <button onClick={reset} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-wms-border text-wms-muted hover:text-white"><X size={17} /></button>
          </div>

          {!target && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-wms-border bg-wms-surface p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-white"><PackageSearch size={18} className="text-amber-400" /> Sugerencias</h3>
                <div className="max-h-[30rem] space-y-2 overflow-y-auto custom-scrollbar">
                  {loadingSuggestions ? <p className="py-10 text-center text-sm text-wms-muted">Calculando coincidencias...</p> : suggestions.map(product => <ProductOption key={product.id} product={product} onClick={() => setTarget(product)} />)}
                  {!loadingSuggestions && suggestions.length === 0 && <p className="py-10 text-center text-sm text-wms-muted">No encontramos coincidencias suficientemente cercanas.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-wms-border bg-wms-surface p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase text-white"><Search size={18} className="text-blue-400" /> Buscar manualmente</h3>
                <input value={targetSearch} onChange={event => setTargetSearch(event.target.value)} placeholder="Buscar producto principal..." className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-4 text-white outline-none focus:border-blue-500" />
                <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto custom-scrollbar">
                  {targetResults.map(product => <ProductOption key={product.id} product={product} onClick={() => setTarget(product)} />)}
                </div>
              </div>
            </div>
          )}

          {target && (
            <div className="space-y-5">
              <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
                <ProductSummary product={source} role="source" />
                <div className="flex items-center justify-center"><ArrowRight className="rotate-90 text-blue-400 lg:rotate-0" size={32} /></div>
                <ProductSummary product={target} role="target" />
              </div>

              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm leading-6 text-amber-200">
                <div className="flex gap-3"><Warehouse className="mt-1 shrink-0" size={18} /><p>El stock y las ubicaciones del duplicado se sumarán al producto principal. Si ambos registros representan el mismo conteo físico y no stock separado, corrige las cantidades antes de fusionar.</p></div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button onClick={() => setTarget(null)} className="min-h-12 rounded-xl border border-wms-border px-6 text-sm font-bold text-wms-muted hover:text-white">CAMBIAR PRINCIPAL</button>
                <button onClick={merge} disabled={merging} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 disabled:opacity-50"><GitMerge size={18} /> {merging ? 'FUSIONANDO...' : 'CONFIRMAR MERGE'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
