'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Printer, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { showConfirmModal, showToast } from '@/lib/toast';

type PrinterConfig = {
  id: string;
  name: string;
  printNodeId: number;
  purpose: 'PACKING' | 'SKU';
  stationName: string | null;
  labelSize: string | null;
};

type RemotePrinter = {
  id: number;
  name: string;
  description?: string | null;
  state?: string | null;
  computer?: { id: number; name: string; state?: string | null } | null;
};

type PrinterData = {
  configured: boolean;
  configs: PrinterConfig[];
  printers: RemotePrinter[];
  warning?: string;
};

const STATIONS = ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6'];

export default function PrinterManager() {
  const queryClient = useQueryClient();
  const [purpose, setPurpose] = useState<'PACKING' | 'SKU'>('PACKING');
  const [stationName, setStationName] = useState('Mesa 1');
  const [printerId, setPrinterId] = useState('');
  const [labelSize, setLabelSize] = useState('medium');
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isFetching } = useQuery<PrinterData>({
    queryKey: ['admin', 'printers'],
    queryFn: async () => {
      const response = await fetch('/api/admin/printers');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar las impresoras');
      return result;
    },
    staleTime: 15_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'printers'] });

  const saveAssignment = async () => {
    const remotePrinter = data?.printers.find(printer => printer.id === Number(printerId));
    if (!remotePrinter || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/printers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printNodeId: remotePrinter.id,
          name: remotePrinter.name,
          purpose,
          stationName: purpose === 'PACKING' ? stationName : null,
          labelSize: purpose === 'SKU' ? labelSize : null,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No se pudo asignar la impresora');
      setPrinterId('');
      await refresh();
      showToast('Impresora asignada correctamente.', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (config: PrinterConfig) => {
    const confirmation = await showConfirmModal(
      `¿Quitar ${config.name}?`,
      'La estación volverá automáticamente a la impresión manual.',
      'Sí, quitar',
    );
    if (!confirmation.isConfirmed) return;
    const response = await fetch('/api/admin/printers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: config.id }),
    });
    if (response.ok) {
      await refresh();
      showToast('Asignación eliminada. El fallback manual sigue disponible.', 'info');
    } else {
      const result = await response.json().catch(() => ({}));
      showToast(result.error || 'No se pudo quitar la impresora', 'error');
    }
  };

  if (isLoading) return <div className="py-20 text-center font-bold text-wms-muted">Consultando impresoras...</div>;

  const remoteById = new Map((data?.printers || []).map(printer => [printer.id, printer]));

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-wider text-white md:text-xl">Impresoras por estación</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-wms-muted">
            Asigna una impresora PrintNode a cada mesa de packing y otra al puesto de bodega. Si una asignación falla, el WMS abre la etiqueta para impresión manual.
          </p>
        </div>
        <button onClick={refresh} disabled={isFetching}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-wms-border px-4 text-[10px] font-black uppercase tracking-wider text-wms-muted hover:text-white disabled:opacity-50">
          <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {!data?.configured && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={20} />
            <div>
              <p className="font-black uppercase tracking-wider text-amber-300">Modo de pruebas: impresión manual</p>
              <p className="mt-2 text-sm leading-6 text-white/55">
                PrintNode aún no está configurado. Packing y Bodega abrirán automáticamente el PDF o las etiquetas en una pestaña lista para imprimir.
              </p>
              <p className="mt-2 font-mono text-xs text-white/35">Para activarlo después: configura PRINTNODE_API_KEY e instala el cliente en cada estación.</p>
            </div>
          </div>
        </div>
      )}

      {data?.warning && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">{data.warning}</div>
      )}

      {data?.configured && (
        <div className="rounded-2xl border border-sky-500/20 bg-wms-surface p-5 md:p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-wms-muted">Uso</span>
              <select value={purpose} onChange={event => setPurpose(event.target.value as 'PACKING' | 'SKU')}
                className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-3 text-sm font-bold text-white outline-none focus:border-sky-500">
                <option value="PACKING">Etiqueta de despacho</option>
                <option value="SKU">Etiqueta SKU de bodega</option>
              </select>
            </label>

            {purpose === 'PACKING' ? (
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-wms-muted">Mesa</span>
                <select value={stationName} onChange={event => setStationName(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-3 text-sm font-bold text-white outline-none focus:border-sky-500">
                  {STATIONS.map(station => <option key={station}>{station}</option>)}
                </select>
              </label>
            ) : (
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-wms-muted">Tamaño SKU</span>
                <select value={labelSize} onChange={event => setLabelSize(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-3 text-sm font-bold text-white outline-none focus:border-sky-500">
                  <option value="small">50 × 25 mm</option>
                  <option value="medium">70 × 35 mm</option>
                  <option value="large">100 × 50 mm</option>
                </select>
              </label>
            )}

            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-wms-muted">Impresora detectada</span>
              <select value={printerId} onChange={event => setPrinterId(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-3 text-sm font-bold text-white outline-none focus:border-sky-500">
                <option value="">Seleccionar...</option>
                {(data.printers || []).map(printer => (
                  <option key={printer.id} value={printer.id}>{printer.name} · {printer.computer?.name || 'PC'} · {printer.state || 'sin estado'}</option>
                ))}
              </select>
            </label>

            <button onClick={saveAssignment} disabled={!printerId || saving}
              className="min-h-12 self-end rounded-xl bg-sky-600 px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-sky-500 disabled:opacity-40">
              {saving ? 'Guardando…' : 'Asignar impresora'}
            </button>
          </div>

          {data.printers.length === 0 && (
            <p className="mt-4 flex items-center gap-2 text-xs text-amber-300"><WifiOff size={14} /> No hay impresoras detectadas. Instala e inicia PrintNode Client en las estaciones.</p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data?.configs || []).map(config => {
          const remote = remoteById.get(config.printNodeId);
          const online = remote?.state === 'online';
          return (
            <article key={config.id} className="rounded-2xl border border-wms-border bg-wms-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 text-sky-400"><Printer size={21} /></div>
                  <div className="min-w-0"><h3 className="truncate font-black text-white">{config.name}</h3><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-wms-muted">{config.purpose === 'PACKING' ? config.stationName : 'Bodega SKU'}</p></div>
                </div>
                <button onClick={() => removeAssignment(config)} className="rounded-lg p-2 text-wms-muted hover:bg-red-500/10 hover:text-red-400" aria-label={`Quitar ${config.name}`}><Trash2 size={16} /></button>
              </div>
              <div className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${online ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-amber-500/20 bg-amber-500/5 text-amber-300'}`}>
                {online ? <CheckCircle2 size={14} /> : <WifiOff size={14} />}
                {online ? 'Disponible en PrintNode' : data?.configured ? 'No disponible · fallback manual' : 'PrintNode pendiente · fallback manual'}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
