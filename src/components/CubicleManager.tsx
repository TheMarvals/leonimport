'use client';

import { useCallback, useEffect, useState } from 'react';
import { Grid3X3, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { showConfirmModal, showToast } from '@/lib/toast';

type Cubicle = {
  id: string;
  number: number;
  isActive: boolean;
  occupied: boolean;
  order: { id: string; mlId: string; shippingId: string | null } | null;
};

export default function CubicleManager() {
  const [cubicles, setCubicles] = useState<Cubicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newNumber, setNewNumber] = useState('');
  const [editing, setEditing] = useState<{ id: string; number: string } | null>(null);

  const loadCubicles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cubicles');
      if (!response.ok) throw new Error('No se pudieron cargar los cubículos');
      setCubicles(await response.json());
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCubicles();
  }, [loadCubicles]);

  const saveCubicle = async (method: 'POST' | 'PUT') => {
    const payload = method === 'POST'
      ? { number: newNumber }
      : { id: editing?.id, number: editing?.number };

    setSaving(true);
    try {
      const response = await fetch('/api/cubicles', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el cubículo');

      setNewNumber('');
      setEditing(null);
      await loadCubicles();
      showToast(method === 'POST' ? 'Cubículo agregado.' : 'Cubículo actualizado.', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setSaving(false);
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
      await loadCubicles();
      showToast('Cubículo eliminado.', 'info');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-wider text-white md:text-xl">Gestión de Cubículos</h2>
          <p className="mt-1 max-w-2xl text-sm text-wms-muted">
            Se ocupan al terminar el picking y se liberan cuando una mesa comienza a empacar la orden.
          </p>
        </div>

        <div className="flex w-full gap-2 md:w-auto">
          <div className="relative min-w-0 flex-1 md:w-48">
            <Grid3X3 className="absolute left-3 top-1/2 -translate-y-1/2 text-wms-muted" size={18} />
            <input
              type="number"
              min="1"
              inputMode="numeric"
              value={newNumber}
              onChange={event => setNewNumber(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && newNumber && !saving) saveCubicle('POST'); }}
              placeholder="Número"
              className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-surface pl-10 pr-3 font-mono text-white outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => saveCubicle('POST')}
            disabled={!newNumber || saving}
            className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
          >
            <Plus size={18} /> <span className="hidden sm:inline">AGREGAR</span>
          </button>
        </div>
      </div>

      {loading ? (
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
              {editing?.id === cubicle.id ? (
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-wms-muted">Nuevo número</label>
                  <input
                    type="number"
                    min="1"
                    autoFocus
                    value={editing.number}
                    onChange={event => setEditing({ ...editing, number: event.target.value })}
                    className="min-h-14 w-full rounded-xl border border-blue-500 bg-wms-bg px-4 text-center font-mono text-2xl font-black text-white outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setEditing(null)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-wms-border text-xs font-bold text-wms-muted"><X size={15} /> CANCELAR</button>
                    <button onClick={() => saveCubicle('PUT')} disabled={!editing.number || saving} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 text-xs font-black text-white disabled:opacity-40"><Save size={15} /> GUARDAR</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-wms-muted">Cubículo</p>
                      <p className="mt-1 font-mono text-4xl font-black text-white">{cubicle.number}</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${cubicle.occupied ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-green-500/30 bg-green-500/10 text-green-400'}`}>
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
                    <button onClick={() => setEditing({ id: cubicle.id, number: String(cubicle.number) })} disabled={cubicle.occupied} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-wms-border text-xs font-bold text-white transition-colors hover:border-blue-500 disabled:cursor-not-allowed disabled:opacity-30"><Pencil size={15} /> EDITAR</button>
                    <button onClick={() => deleteCubicle(cubicle)} disabled={cubicle.occupied} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-bold text-red-400 transition-colors hover:border-red-500/50 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={15} /> ELIMINAR</button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
