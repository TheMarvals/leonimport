'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, Clock, CheckCircle2, AlertTriangle, ListOrdered, Activity, Filter, X, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

type SyncLog = {
  id: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: 'SUCCESS' | 'ERROR';
  imported: number;
  skipped: number;
  resolutionRequired: number;
  totalProcessed: number;
  error: string | null;
  createdAt: string;
  reusedBySku: number;
  reusedByAlias: number;
  autoCreated: number;
  missingCreated: number;
};

type Metrics = {
  totalSyncs: number;
  avgDurationMs: number;
  totalImported: number;
  totalErrors: number;
  lastSync: SyncLog | null;
  diagnostic?: {
    totalReusedBySku: number;
    totalReusedByAlias: number;
    totalAutoCreated: number;
    totalMissingCreated: number;
  };
};

export default function SyncDashboardPage() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: 'SUCCESS' | 'ERROR'; message: string } | null>(null);

  // Filtros
  const [filterStatus, setFilterStatus] = useState<'all' | 'SUCCESS' | 'ERROR'>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterMinImported, setFilterMinImported] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  // React Query: fetching de logs con auto-refresh cada 30s
  const { data, isLoading: loading } = useQuery({
    queryKey: ['sync', 'logs'],
    queryFn: () => fetch('/api/sync/logs').then(r => r.json()),
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  });

  const logs: SyncLog[] = useMemo(() => data?.logs ?? [], [data]);
  const metrics: Metrics | null = data?.metrics ?? null;

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Filtro por estado
      if (filterStatus !== 'all' && log.status !== filterStatus) return false;

      // Filtro por fecha (basado en createdAt)
      if (filterDateFrom) {
        const fromDate = new Date(filterDateFrom);
        if (new Date(log.createdAt) < fromDate) return false;
      }
      if (filterDateTo) {
        const toDate = new Date(filterDateTo);
        toDate.setHours(23, 59, 59, 999); // Fin del día
        if (new Date(log.createdAt) > toDate) return false;
      }

      // Filtro por cantidad mínima de importadas
      if (filterMinImported > 0 && log.imported < filterMinImported) return false;

      return true;
    });
  }, [logs, filterStatus, filterDateFrom, filterDateTo, filterMinImported]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, currentPage]);

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, filterDateFrom, filterDateTo, filterMinImported]);

  const clearFilters = () => {
    setFilterStatus('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterMinImported(0);
  };

  const showToast = (type: 'SUCCESS' | 'ERROR', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  const handleSyncAndRefresh = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync/ml', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const imported = data.imported ?? 0;
        const skipped = data.skipped ?? 0;
        if (data.status === 'SUCCESS' || data.status === 'ERROR') {
          if (data.status === 'SUCCESS') {
            showToast('SUCCESS', `Sync completado: ${imported} importadas, ${skipped} saltadas`);
          } else {
            showToast('ERROR', data.error || 'Error durante la sincronización');
          }
        } else {
          showToast('SUCCESS', `Sync finalizado: ${imported} importadas, ${skipped} saltadas`);
        }
      } else {
        try {
          const errData = await res.json();
          showToast('ERROR', errData.details || errData.error || `Error del servidor (${res.status})`);
        } catch {
          const text = await res.text();
          showToast('ERROR', text || `Error del servidor (${res.status})`);
        }
      }
    } catch (err) {
      showToast('ERROR', 'Error de conexión al ejecutar sync');
      console.error('Error ejecutando sync:', err);
    }
    queryClient.invalidateQueries({ queryKey: ['sync'] });
    setSyncing(false);
  };



  const formatDuration = (ms: number | null) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('es-CL', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };

  const lastSyncElapsed = () => {
    if (!metrics?.lastSync?.createdAt) return null;
    const diff = Date.now() - new Date(metrics.lastSync.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="min-h-screen bg-wms-bg p-4 text-white md:p-8">
      {/* Toast */}
      {toast && (
        <div className="fixed left-4 right-4 top-4 z-50 animate-slide-in sm:left-auto sm:right-6 sm:top-6 sm:max-w-md">
          <div className={`flex items-start gap-3 px-5 py-4 rounded-2xl shadow-2xl border backdrop-blur-sm ${
            toast.type === 'SUCCESS'
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            {toast.type === 'SUCCESS' ? (
              <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={20} className="mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold uppercase tracking-wider">
                {toast.type === 'SUCCESS' ? 'Sync Exitoso' : 'Error en Sync'}
              </p>
              <p className="text-xs mt-1 opacity-80 break-words">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="shrink-0 hover:opacity-70 transition-opacity"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="leon-brand-bar -mx-4 -mt-4 mb-6 md:-mx-8 md:-mt-8 md:mb-8" />

      <header className="mb-8 flex flex-col gap-5 md:mb-12 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3 md:items-center md:gap-4">
          <Link href="/admin" className="text-wms-muted hover:text-white transition-colors">
            <ArrowLeft size={26} className="md:h-8 md:w-8" />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tighter sm:text-3xl md:text-4xl">
              HISTORIAL DE <span className="text-leon-red">SYNC</span>
            </h1>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-wms-muted sm:text-xs md:text-sm md:tracking-widest">Monitoreo de Sincronización con MercadoLibre</p>
          </div>
        </div>
        <button
          onClick={handleSyncAndRefresh}
          disabled={loading || syncing}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-leon-red px-6 py-3 font-black text-white shadow-lg shadow-leon-red/20 transition-all hover:bg-leon-red-light md:w-auto md:rounded-2xl md:hover:scale-105"
        >
          <RefreshCw size={20} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'SINCRONIZANDO...' : 'SYNC + REFRESH'}
        </button>
      </header>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-2xl border border-wms-border bg-wms-surface p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-2">
            <Activity size={18} className="text-leon-red" />
            <span className="text-xs font-bold text-wms-muted uppercase tracking-widest">Total Syncs</span>
          </div>
          <p className="text-3xl font-black">{metrics?.totalSyncs || 0}</p>
        </div>

        <div className="rounded-2xl border border-wms-border bg-wms-surface p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 size={18} className="text-green-500" />
            <span className="text-xs font-bold text-wms-muted uppercase tracking-widest">Importadas</span>
          </div>
          <p className="text-3xl font-black">{metrics?.totalImported || 0}</p>
        </div>

        <div className="rounded-2xl border border-wms-border bg-wms-surface p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-2">
            <Clock size={18} className="text-blue-400" />
            <span className="text-xs font-bold text-wms-muted uppercase tracking-widest">Promedio</span>
          </div>
          <p className="text-3xl font-black">{formatDuration(metrics?.avgDurationMs || null)}</p>
        </div>

        <div className="rounded-2xl border border-wms-border bg-wms-surface p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle size={18} className={metrics?.totalErrors ? 'text-yellow-500' : 'text-green-500'} />
            <span className="text-xs font-bold text-wms-muted uppercase tracking-widest">Errores</span>
          </div>
          <p className="text-3xl font-black">{metrics?.totalErrors || 0}</p>
        </div>
      </div>

      {/* Diagnóstico de Resolución de Productos */}
      {metrics?.diagnostic && (
        <div className="bg-wms-surface border border-wms-border p-5 rounded-2xl mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Activity size={18} className="text-leon-red" />
            <span className="text-sm font-bold text-wms-muted uppercase tracking-widest">Diagnóstico de Productos</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-wms-bg/50 border border-wms-border/50 p-4 rounded-xl">
              <p className="text-[10px] font-bold text-wms-muted uppercase tracking-widest mb-1">Reusados por SKU</p>
              <p className="text-2xl font-black text-blue-400">{metrics.diagnostic.totalReusedBySku.toLocaleString()}</p>
              <div className="mt-2 h-1.5 bg-wms-border/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (metrics.diagnostic.totalReusedBySku / Math.max(1, metrics.diagnostic.totalReusedBySku + metrics.diagnostic.totalReusedByAlias + metrics.diagnostic.totalAutoCreated + metrics.diagnostic.totalMissingCreated)) * 100)}%`
                  }}
                />
              </div>
            </div>
            <div className="bg-wms-bg/50 border border-wms-border/50 p-4 rounded-xl">
              <p className="text-[10px] font-bold text-wms-muted uppercase tracking-widest mb-1">Reusados por Alias</p>
              <p className="text-2xl font-black text-purple-400">{metrics.diagnostic.totalReusedByAlias.toLocaleString()}</p>
              <div className="mt-2 h-1.5 bg-wms-border/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (metrics.diagnostic.totalReusedByAlias / Math.max(1, metrics.diagnostic.totalReusedBySku + metrics.diagnostic.totalReusedByAlias + metrics.diagnostic.totalAutoCreated + metrics.diagnostic.totalMissingCreated)) * 100)}%`
                  }}
                />
              </div>
            </div>
            <div className="bg-wms-bg/50 border border-wms-border/50 p-4 rounded-xl">
              <p className="text-[10px] font-bold text-wms-muted uppercase tracking-widest mb-1">Creados Automáticamente</p>
              <p className="text-2xl font-black text-green-400">{metrics.diagnostic.totalAutoCreated.toLocaleString()}</p>
              <div className="mt-2 h-1.5 bg-wms-border/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (metrics.diagnostic.totalAutoCreated / Math.max(1, metrics.diagnostic.totalReusedBySku + metrics.diagnostic.totalReusedByAlias + metrics.diagnostic.totalAutoCreated + metrics.diagnostic.totalMissingCreated)) * 100)}%`
                  }}
                />
              </div>
            </div>
            <div className="bg-wms-bg/50 border border-wms-border/50 p-4 rounded-xl">
              <p className="text-[10px] font-bold text-wms-muted uppercase tracking-widest mb-1">ML-MISSING Creados</p>
              <p className="text-2xl font-black text-yellow-400">{metrics.diagnostic.totalMissingCreated.toLocaleString()}</p>
              <div className="mt-2 h-1.5 bg-wms-border/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (metrics.diagnostic.totalMissingCreated / Math.max(1, metrics.diagnostic.totalReusedBySku + metrics.diagnostic.totalReusedByAlias + metrics.diagnostic.totalAutoCreated + metrics.diagnostic.totalMissingCreated)) * 100)}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Último Sync */}
      {metrics?.lastSync && (
        <div className="bg-wms-surface border border-wms-border p-5 rounded-2xl mb-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <ListOrdered size={18} className="text-leon-red" />
              <span className="text-sm font-bold text-wms-muted uppercase tracking-widest">Último Sync</span>
              {/* Estado badge */}
              {metrics.lastSync.status === 'SUCCESS' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-bold uppercase tracking-wider">
                  <CheckCircle2 size={12} />
                  Sync Exitoso
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider">
                  <AlertTriangle size={12} />
                  Error en Sync
                </span>
              )}
              <span className="text-lg font-bold">{formatDate(metrics.lastSync.createdAt)}</span>
              <span className="text-xs text-wms-muted">({lastSyncElapsed()} atrás)</span>
            </div>
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 sm:gap-6">
              <div className="text-center">
                <p className="text-xs text-wms-muted uppercase">Procesadas</p>
                <p className="text-xl font-black">{metrics.lastSync.totalProcessed}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-wms-muted uppercase">Importadas</p>
                <p className="text-xl font-black text-green-500">{metrics.lastSync.imported}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-wms-muted uppercase">Saltadas</p>
                <p className="text-xl font-black text-wms-muted">{metrics.lastSync.skipped}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-wms-muted uppercase">Resolución</p>
                <p className="text-xl font-black text-yellow-500">{metrics.lastSync.resolutionRequired}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-wms-muted uppercase">Duración</p>
                <p className="text-xl font-black">{formatDuration(metrics.lastSync.durationMs)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-wms-surface border border-wms-border rounded-2xl p-5 mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-wms-muted" />
            <span className="text-xs font-black uppercase tracking-widest text-wms-muted">Filtros</span>
          </div>

          {/* Filtro por estado */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-wms-muted uppercase tracking-wider">Estado</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              className="bg-wms-bg border border-wms-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-leon-red"
            >
              <option value="all">Todos</option>
              <option value="SUCCESS">Exitosos</option>
              <option value="ERROR">Con Error</option>
            </select>
          </div>

          {/* Filtro por fecha desde */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-wms-muted uppercase tracking-wider">Desde</label>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="bg-wms-bg border border-wms-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-leon-red [color-scheme:dark]"
            />
          </div>

          {/* Filtro por fecha hasta */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-wms-muted uppercase tracking-wider">Hasta</label>
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="bg-wms-bg border border-wms-border rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-leon-red [color-scheme:dark]"
            />
          </div>

          {/* Filtro por mínimo importadas */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-wms-muted uppercase tracking-wider">Mín. Importadas</label>
            <div className="flex gap-1">
              {[0, 1, 5, 10, 20].map(n => (
                <button
                  key={n}
                  onClick={() => setFilterMinImported(n)}
                  className={`px-2 py-1.5 rounded text-xs font-bold transition-colors ${
                    filterMinImported === n
                      ? 'bg-leon-red text-white'
                      : 'bg-wms-bg border border-wms-border text-wms-muted hover:border-wms-muted/30'
                  }`}
                >
                  {n === 0 ? 'Todo' : `≥${n}`}
                </button>
              ))}
            </div>
          </div>

          {/* Contador y limpiar */}
          <div className="flex items-center justify-between gap-3 sm:col-span-2 lg:ml-auto">
            {(filterStatus !== 'all' || filterDateFrom || filterDateTo || filterMinImported > 0) && (
              <button
                onClick={clearFilters}
                className="text-wms-muted hover:text-white text-xs font-bold uppercase tracking-widest flex items-center gap-1 transition-colors"
              >
                <X size={14} /> Limpiar
              </button>
            )}
            <span className="text-xs text-wms-muted">
              {filteredLogs.length} de {logs.length} registros
            </span>
          </div>
        </div>
      </div>

      {/* Tabla de Historial */}
      <div className="bg-wms-surface border border-wms-border rounded-2xl overflow-hidden">
        {/* En móvil, cada sincronización se presenta como una tarjeta legible. */}
        <div className="divide-y divide-wms-border/60 md:hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-wms-muted">
              <RefreshCw size={20} className="mr-2 inline-block animate-spin" />
              Cargando historial...
            </div>
          ) : paginatedLogs.length === 0 ? (
            <div className="p-8 text-center text-sm leading-6 text-wms-muted">
              {logs.length === 0
                ? 'Aún no hay registros de sincronización.'
                : 'No hay registros que coincidan con los filtros.'}
            </div>
          ) : paginatedLogs.map(log => (
            <article key={`mobile-${log.id}`} className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-bold text-white">{formatDate(log.createdAt)}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-wms-muted">
                    Duración {formatDuration(log.durationMs)}
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black ${
                  log.status === 'SUCCESS'
                    ? 'border-green-500/30 bg-green-500/10 text-green-400'
                    : 'border-red-500/30 bg-red-500/10 text-red-400'
                }`}>
                  {log.status === 'SUCCESS' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                  {log.status === 'SUCCESS' ? 'OK' : 'ERROR'}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 rounded-xl bg-wms-bg/60 p-3 text-center">
                <div><p className="text-[9px] uppercase text-wms-muted">Proc.</p><p className="mt-1 font-black">{log.totalProcessed}</p></div>
                <div><p className="text-[9px] uppercase text-wms-muted">Import.</p><p className="mt-1 font-black text-green-400">{log.imported}</p></div>
                <div><p className="text-[9px] uppercase text-wms-muted">Salt.</p><p className="mt-1 font-black">{log.skipped}</p></div>
                <div><p className="text-[9px] uppercase text-wms-muted">Resol.</p><p className="mt-1 font-black text-yellow-400">{log.resolutionRequired}</p></div>
              </div>

              <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                <span className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-blue-400">SKU {log.reusedBySku}</span>
                <span className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-purple-400">Alias {log.reusedByAlias}</span>
                <span className="rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1 text-green-400">Creados {log.autoCreated}</span>
                <span className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-yellow-400">Missing {log.missingCreated}</span>
              </div>

              {log.error && <p className="break-words rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{log.error}</p>}
            </article>
          ))}
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="hidden min-w-[1100px] w-full text-sm md:table">
            <thead>
              <tr className="border-b border-wms-border text-wms-muted uppercase tracking-widest text-xs">
                <th className="text-left p-4 font-bold">Inicio</th>
                <th className="text-left p-4 font-bold">Duración</th>
                <th className="text-center p-4 font-bold">Estado</th>
                <th className="text-center p-4 font-bold">Procesadas</th>
                <th className="text-center p-4 font-bold">Importadas</th>
                <th className="text-center p-4 font-bold">Saltadas</th>
                <th className="text-center p-4 font-bold">Resolución</th>
                <th className="text-center p-4 font-bold">Reusados</th>
                <th className="text-center p-4 font-bold">Creados</th>
                <th className="text-center p-4 font-bold">ML-MISSING</th>
                <th className="text-left p-4 font-bold">Error</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-wms-muted">
                    <RefreshCw size={20} className="animate-spin inline-block mr-2" />
                    Cargando historial...
                  </td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-wms-muted">
                    {logs.length === 0
                      ? 'Aún no hay registros de sincronización. Ejecuta un sync para ver el historial.'
                      : 'No hay registros que coincidan con los filtros seleccionados.'}
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log, i) => (
                  <tr
                    key={log.id}
                    className={`border-b border-wms-border/50 hover:bg-wms-bg/50 transition-colors ${i === 0 ? 'bg-wms-bg/30' : ''}`}
                  >
                    <td className="p-4 font-mono text-xs">{formatDate(log.createdAt)}</td>
                    <td className="p-4 font-mono">{formatDuration(log.durationMs)}</td>
                    <td className="p-4 text-center">
                      {log.status === 'SUCCESS' ? (
                        <span className="text-green-500 flex items-center justify-center gap-1">
                          <CheckCircle2 size={14} /> OK
                        </span>
                      ) : (
                        <span className="text-red-500 flex items-center justify-center gap-1">
                          <AlertTriangle size={14} /> ERROR
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center font-bold">{log.totalProcessed}</td>
                    <td className="p-4 text-center font-bold text-green-500">{log.imported}</td>
                    <td className="p-4 text-center text-wms-muted">{log.skipped}</td>
                    <td className="p-4 text-center">
                      {log.resolutionRequired > 0 ? (
                        <span className="text-yellow-500 font-bold">{log.resolutionRequired}</span>
                      ) : (
                        <span className="text-wms-muted">0</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2 text-xs">
                        {log.reusedBySku > 0 && <span className="text-blue-400 font-bold" title="Por SKU">SKU {log.reusedBySku}</span>}
                        {log.reusedByAlias > 0 && <span className="text-purple-400 font-bold" title="Por Alias">ALIAS {log.reusedByAlias}</span>}
                        {log.reusedBySku === 0 && log.reusedByAlias === 0 && <span className="text-wms-muted">0</span>}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      {log.autoCreated > 0 ? (
                        <span className="text-green-400 font-bold">{log.autoCreated}</span>
                      ) : (
                        <span className="text-wms-muted">0</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {log.missingCreated > 0 ? (
                        <span className="text-yellow-400 font-bold">{log.missingCreated}</span>
                      ) : (
                        <span className="text-wms-muted">0</span>
                      )}
                    </td>
                    <td className="p-4 text-red-400 text-xs max-w-[200px] truncate">{log.error || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {!loading && filteredLogs.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-wms-border">
            <span className="text-xs text-wms-muted">
              Página {currentPage} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="bg-wms-bg border border-wms-border rounded-lg px-3 py-1.5 text-xs font-bold text-wms-muted hover:text-white hover:border-wms-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="bg-wms-bg border border-wms-border rounded-lg px-3 py-1.5 text-xs font-bold text-wms-muted hover:text-white hover:border-wms-muted/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
