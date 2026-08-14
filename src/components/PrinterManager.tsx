'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Printer, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { listLocalQzPrinters } from '@/lib/qz-print';
import { showConfirmModal, showToast } from '@/lib/toast';

type PrinterConfig = { id: string; name: string; printerName: string; purpose: 'PACKING' | 'SKU'; stationName: string | null; labelSize: string | null };
type PrinterData = { configs: PrinterConfig[] };
const STATIONS = ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6'];

export default function PrinterManager() {
  const queryClient = useQueryClient();
  const [purpose, setPurpose] = useState<'PACKING' | 'SKU'>('PACKING');
  const [stationName, setStationName] = useState('Mesa 1');
  const [printerName, setPrinterName] = useState('');
  const [localPrinters, setLocalPrinters] = useState<string[]>([]);
  const [qzAvailable, setQzAvailable] = useState<boolean | null>(null);
  const [detecting, setDetecting] = useState(false);
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

  const refreshAssignments = () => queryClient.invalidateQueries({ queryKey: ['admin', 'printers'] });

  const detectPrinters = async () => {
    setDetecting(true);
    try {
      const printers = await listLocalQzPrinters();
      setLocalPrinters(printers);
      setQzAvailable(true);
      if (printers.length === 1) setPrinterName(printers[0]);
      showToast(printers.length ? `${printers.length} impresora(s) detectada(s) en este PC.` : 'QZ está activo, pero no encontró impresoras.', 'info');
    } catch {
      setLocalPrinters([]);
      setQzAvailable(false);
      showToast('QZ Tray no está disponible. La impresión manual seguirá funcionando.', 'info');
    } finally {
      setDetecting(false);
    }
  };

  const saveAssignment = async () => {
    if (!printerName || saving) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/printers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerName, name: printerName, purpose, stationName: purpose === 'PACKING' ? stationName : null, labelSize: purpose === 'SKU' ? labelSize : null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No se pudo asignar la impresora');
      setPrinterName('');
      await refreshAssignments();
      showToast('Impresora asignada correctamente.', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (config: PrinterConfig) => {
    const confirmation = await showConfirmModal(`¿Quitar ${config.name}?`, 'La estación volverá automáticamente a la impresión manual.', 'Sí, quitar');
    if (!confirmation.isConfirmed) return;
    const response = await fetch('/api/admin/printers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: config.id }) });
    if (response.ok) {
      await refreshAssignments();
      showToast('Asignación eliminada. El fallback manual sigue disponible.', 'info');
    } else {
      const result = await response.json().catch(() => ({}));
      showToast(result.error || 'No se pudo quitar la impresora', 'error');
    }
  };

  if (isLoading) return <div className="py-20 text-center font-bold text-wms-muted">Consultando asignaciones...</div>;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-wider text-white md:text-xl">Impresoras por estación</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-wms-muted">QZ Tray conecta este navegador con las impresoras instaladas en el PC. Sin QZ, el WMS abre la etiqueta lista para imprimir manualmente.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={detectPrinters} disabled={detecting} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-[10px] font-black uppercase tracking-wider text-white hover:bg-sky-500 disabled:opacity-50"><Printer size={15} /> {detecting ? 'Detectando…' : 'Detectar en este PC'}</button>
          <button onClick={refreshAssignments} disabled={isFetching} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-wms-border px-4 text-[10px] font-black uppercase tracking-wider text-wms-muted hover:text-white disabled:opacity-50"><RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Actualizar</button>
        </div>
      </div>

      {qzAvailable !== true && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={20} /><div>
            <p className="font-black uppercase tracking-wider text-amber-300">Modo manual disponible</p>
            <p className="mt-2 text-sm leading-6 text-white/55">{qzAvailable === false ? 'QZ Tray no está iniciado en este PC.' : 'Pulsa “Detectar en este PC” para buscar QZ Tray e impresoras locales.'} Durante las pruebas, Packing y Bodega abrirán el PDF en una pestaña lista para imprimir.</p>
            <p className="mt-2 text-xs text-white/35">La impresión automática se habilita instalando QZ Tray Community en cada estación; no requiere PrintNode ni una suscripción.</p>
          </div></div>
        </div>
      )}

      <div className="rounded-2xl border border-sky-500/20 bg-wms-surface p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2"><span className="text-[10px] font-black uppercase tracking-widest text-wms-muted">Uso</span>
            <select value={purpose} onChange={event => setPurpose(event.target.value as 'PACKING' | 'SKU')} className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-3 text-sm font-bold text-white outline-none focus:border-sky-500"><option value="PACKING">Etiqueta de despacho</option><option value="SKU">Etiqueta SKU de bodega</option></select>
          </label>
          {purpose === 'PACKING' ? (
            <label className="space-y-2"><span className="text-[10px] font-black uppercase tracking-widest text-wms-muted">Mesa</span><select value={stationName} onChange={event => setStationName(event.target.value)} className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-3 text-sm font-bold text-white outline-none focus:border-sky-500">{STATIONS.map(station => <option key={station}>{station}</option>)}</select></label>
          ) : (
            <label className="space-y-2"><span className="text-[10px] font-black uppercase tracking-widest text-wms-muted">Tamaño SKU</span><select value={labelSize} onChange={event => setLabelSize(event.target.value)} className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-3 text-sm font-bold text-white outline-none focus:border-sky-500"><option value="small">50 × 25 mm</option><option value="medium">70 × 35 mm</option><option value="large">100 × 50 mm</option></select></label>
          )}
          <label className="space-y-2"><span className="text-[10px] font-black uppercase tracking-widest text-wms-muted">Impresora de este PC</span><select value={printerName} onChange={event => setPrinterName(event.target.value)} disabled={qzAvailable !== true} className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-3 text-sm font-bold text-white outline-none focus:border-sky-500 disabled:opacity-50"><option value="">Seleccionar...</option>{localPrinters.map(printer => <option key={printer} value={printer}>{printer}</option>)}</select></label>
          <button onClick={saveAssignment} disabled={!printerName || saving} className="min-h-12 self-end rounded-xl bg-sky-600 px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-sky-500 disabled:opacity-40">{saving ? 'Guardando…' : 'Asignar impresora'}</button>
        </div>
        {qzAvailable === true && localPrinters.length === 0 && <p className="mt-4 flex items-center gap-2 text-xs text-amber-300"><WifiOff size={14} /> QZ está activo, pero el sistema operativo no reportó impresoras.</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data?.configs || []).map(config => {
          const detectedHere = localPrinters.includes(config.printerName);
          return <article key={config.id} className="rounded-2xl border border-wms-border bg-wms-surface p-5">
            <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3 text-sky-400"><Printer size={21} /></div><div className="min-w-0"><h3 className="truncate font-black text-white">{config.name}</h3><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-wms-muted">{config.purpose === 'PACKING' ? config.stationName : 'Bodega SKU'}</p></div></div><button onClick={() => removeAssignment(config)} className="rounded-lg p-2 text-wms-muted hover:bg-red-500/10 hover:text-red-400" aria-label={`Quitar ${config.name}`}><Trash2 size={16} /></button></div>
            <div className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${detectedHere ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-amber-500/20 bg-amber-500/5 text-amber-300'}`}>{detectedHere ? <CheckCircle2 size={14} /> : <WifiOff size={14} />}{detectedHere ? 'Detectada en este PC' : 'No detectada aquí · fallback manual'}</div>
          </article>;
        })}
      </div>
    </section>
  );
}
