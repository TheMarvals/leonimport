'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Link2, Pencil, Plus, RefreshCw, Save, Store, Unlink, X } from 'lucide-react';
import { showConfirmModal, showToast } from '@/lib/toast';

type MlAccount = {
  id: string;
  gatewayAccountId: string;
  sellerId: string;
  nickname: string;
  alias: string | null;
  siteId: string | null;
};
type GatewayAccount = Omit<MlAccount, 'id' | 'alias'>;

export default function MlAccountManager() {
  const queryClient = useQueryClient();
  const [gatewayAccountId, setGatewayAccountId] = useState('');
  const [linkingAccount, setLinkingAccount] = useState(false);
  const [authorization, setAuthorization] = useState<{ clientId: string; url: string; expiresAt: string } | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<GatewayAccount[]>([]);
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);

  const { data: accounts = [], isLoading } = useQuery<MlAccount[]>({
    queryKey: ['admin', 'ml-accounts'],
    queryFn: async () => {
      const response = await fetch('/api/admin/ml-accounts');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las cuentas de Mercado Libre');
      return data;
    },
    staleTime: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'ml-accounts'] });

  const linkGatewayAccount = async (accountId: string) => {
    if (!accountId.trim() || linkingAccount) return;
    setLinkingAccount(true);
    try {
      const response = await fetch('/api/admin/ml-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gatewayAccountId: accountId.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo vincular la cuenta');
      setGatewayAccountId('');
      setAvailableAccounts(current => current.filter(account => account.gatewayAccountId !== accountId));
      await refresh();
      showToast(`Cuenta ${data.nickname} vinculada.`, 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLinkingAccount(false);
    }
  };

  const loadAvailableAccounts = async () => {
    if (linkingAccount) return;
    setLinkingAccount(true);
    try {
      const response = await fetch('/api/admin/ml-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_gateway_accounts' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudieron consultar las cuentas');
      const linkedIds = new Set(accounts.map(account => account.gatewayAccountId));
      setAvailableAccounts((data.accounts || []).filter((account: MlAccount) => !linkedIds.has(account.gatewayAccountId)));
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLinkingAccount(false);
    }
  };

  const generateAuthorization = async () => {
    if (linkingAccount) return false;
    setLinkingAccount(true);
    try {
      const response = await fetch('/api/admin/ml-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_link' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo generar el enlace');
      setAuthorization(data);
      showToast('Enlace generado. Ábrelo para autorizar la cuenta.', 'success');
      return true;
    } catch (error: any) {
      showToast(error.message, 'error');
      return false;
    } finally {
      setLinkingAccount(false);
    }
  };

  const reauthorizeAccount = async (account: MlAccount) => {
    const label = account.alias || account.nickname;
    const confirmation = await showConfirmModal(
      `¿Reautorizar ${label}?`,
      `Abre el enlace iniciando sesión en la cuenta ML ${account.nickname}. Esto renueva sus tokens sin borrar órdenes ni desvincularla de ninguna aplicación.`,
      'Generar enlace',
    );
    if (!confirmation.isConfirmed) return;

    const generated = await generateAuthorization();
    if (generated) {
      document.getElementById('ml-authorization-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const completeAuthorization = async () => {
    if (!authorization || linkingAccount) return;
    setLinkingAccount(true);
    try {
      const response = await fetch('/api/admin/ml-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete_link', clientId: authorization.clientId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'La autorización aún no está completa');
      setAuthorization(null);
      await refresh();
      showToast(`Cuenta ${data.nickname} vinculada al WMS.`, 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLinkingAccount(false);
    }
  };

  const unlinkAccount = async (account: MlAccount) => {
    const confirmation = await showConfirmModal(
      `¿Quitar la cuenta ${account.nickname}?`,
      'Dejará de importar órdenes nuevas. Las órdenes y publicaciones ya guardadas se conservarán.',
      'Sí, quitar cuenta',
    );
    if (!confirmation.isConfirmed) return;

    try {
      const response = await fetch('/api/admin/ml-accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo quitar la cuenta');
      await refresh();
      showToast('Cuenta de Mercado Libre quitada.', 'info');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const startEditingAlias = (account: MlAccount) => {
    setEditingAliasId(account.id);
    setAliasDraft(account.alias || '');
  };

  const saveAlias = async (account: MlAccount) => {
    if (savingAlias) return;
    setSavingAlias(true);
    try {
      const response = await fetch('/api/admin/ml-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, alias: aliasDraft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el alias');
      setEditingAliasId(null);
      await refresh();
      showToast(aliasDraft.trim() ? 'Alias actualizado correctamente.' : 'Alias eliminado.', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setSavingAlias(false);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-black uppercase tracking-wider md:text-xl">Cuentas vinculadas de Mercado Libre</h2>
        <p className="mt-1 max-w-3xl text-sm text-wms-muted">
          El WMS guarda solo la asociación con cada cuenta. Los tokens y la autorización continúan centralizados en el gateway compartido.
        </p>
      </div>

      <div id="ml-authorization-panel" className="rounded-2xl border border-sky-500/20 bg-wms-surface p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-wider text-white">Vincular o reautorizar una cuenta</p>
            <p className="mt-1 text-xs text-wms-muted">La autorización ocurre en Mercado Libre mediante un enlace temporal y no elimina órdenes existentes.</p>
            <p className="mt-2 text-xs text-amber-400">Si ya está conectada a Leon Express, selecciónala entre las cuentas disponibles.</p>
          </div>
          {!authorization ? (
            <button type="button" onClick={generateAuthorization} disabled={linkingAccount}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-600 px-6 text-xs font-black uppercase tracking-wider text-white hover:bg-sky-500 disabled:opacity-50">
              <Link2 size={17} /> {linkingAccount ? 'Generando…' : 'Generar enlace'}
            </button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <a href={authorization.url} target="_blank" rel="noreferrer"
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-yellow-400 px-5 text-xs font-black uppercase tracking-wider text-black hover:bg-yellow-300">
                <Store size={17} /> Abrir autorización
              </a>
              <button type="button" onClick={completeAuthorization} disabled={linkingAccount}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-5 text-xs font-black uppercase tracking-wider text-green-400 disabled:opacity-50">
                <Check size={17} /> {linkingAccount ? 'Comprobando…' : 'Ya autoricé'}
              </button>
            </div>
          )}
        </div>

        {authorization && (
          <p className="mt-4 rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-3 text-xs text-yellow-200">
            Autoriza la cuenta en la ventana de Mercado Libre y luego vuelve aquí para confirmar.
          </p>
        )}

        <details className="mt-5 border-t border-white/5 pt-4">
          <summary className="cursor-pointer text-xs font-bold text-wms-muted hover:text-white">La cuenta ya existe en el gateway</summary>
          <button type="button" onClick={loadAvailableAccounts} disabled={linkingAccount}
            className="mt-4 rounded-lg border border-sky-500/30 px-4 py-2 text-[10px] font-black uppercase text-sky-400 disabled:opacity-50">
            {linkingAccount ? 'Consultando…' : 'Ver cuentas disponibles'}
          </button>

          {availableAccounts.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {availableAccounts.map(account => (
                <div key={account.gatewayAccountId} className="flex items-center justify-between gap-3 rounded-xl border border-wms-border bg-wms-bg p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-white">{account.nickname}</p>
                    <p className="mt-1 font-mono text-[9px] text-wms-muted">Seller {account.sellerId}</p>
                  </div>
                  <button type="button" onClick={() => linkGatewayAccount(account.gatewayAccountId)}
                    className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-[9px] font-black uppercase text-white">Agregar</button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={event => { event.preventDefault(); void linkGatewayAccount(gatewayAccountId); }} className="mt-4">
            <label htmlFor="gateway-account-id" className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-sky-400">ID de cuenta en el gateway</label>
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative min-w-0 flex-1">
                <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 text-wms-muted" size={18} />
                <input id="gateway-account-id" value={gatewayAccountId} onChange={event => setGatewayAccountId(event.target.value)}
                  placeholder="Ej: a7c9cdcf-4fbb-4e39-be78-a69bfea76d70" autoComplete="off"
                  className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg pl-11 pr-4 font-mono text-sm text-white outline-none focus:border-sky-500" />
              </div>
              <button type="submit" disabled={!gatewayAccountId.trim() || linkingAccount}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-sky-500/30 px-6 text-xs font-black uppercase text-sky-400 disabled:opacity-50">
                <Plus size={17} /> Vincular ID
              </button>
            </div>
          </form>
        </details>
      </div>

      {isLoading ? (
        <div className="py-16 text-center font-bold text-wms-muted">Cargando cuentas vinculadas...</div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-wms-border bg-wms-surface py-16 text-center">
          <Store size={48} className="mx-auto mb-4 text-wms-muted/30" />
          <p className="font-bold text-white">No hay cuentas de Mercado Libre vinculadas</p>
          <p className="mt-1 text-sm text-wms-muted">La sincronización no importará órdenes hasta que agregues una.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map(account => (
            <article key={account.id} className="rounded-2xl border border-sky-500/20 bg-wms-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-xl bg-sky-500/10 p-3 text-sky-400"><Store size={22} /></div>
                  <div className="min-w-0">
                    <h3 className="truncate font-black text-white">{account.alias || account.nickname}</h3>
                    {account.alias && <p className="mt-0.5 truncate text-[10px] text-wms-muted">ML: {account.nickname}</p>}
                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-green-400">Vinculada</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => startEditingAlias(account)} aria-label={`Editar alias de ${account.alias || account.nickname}`}
                    className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-2 text-sky-400 hover:border-sky-500/50"><Pencil size={14} /></button>
                  <button onClick={() => unlinkAccount(account)}
                    className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase text-red-400 hover:border-red-500/50">
                    <Unlink size={13} /> Quitar
                  </button>
                </div>
              </div>
              {editingAliasId === account.id && (
                <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/[0.05] p-3">
                  <label htmlFor={`alias-${account.id}`} className="text-[9px] font-black uppercase tracking-widest text-sky-300">Alias interno</label>
                  <p className="mt-1 text-[10px] text-wms-muted">Solo se usa dentro del WMS. Deja el campo vacío para volver al nickname de ML.</p>
                  <div className="mt-3 flex gap-2">
                    <input id={`alias-${account.id}`} value={aliasDraft} onChange={event => setAliasDraft(event.target.value)} maxLength={60} autoFocus
                      onKeyDown={event => { if (event.key === 'Enter') void saveAlias(account); if (event.key === 'Escape') setEditingAliasId(null); }}
                      placeholder="Ej: Tienda Principal" className="min-h-10 min-w-0 flex-1 rounded-lg border border-wms-border bg-wms-bg px-3 text-sm font-bold text-white outline-none focus:border-sky-500" />
                    <button type="button" onClick={() => saveAlias(account)} disabled={savingAlias} aria-label="Guardar alias" className="rounded-lg bg-sky-600 p-2.5 text-white disabled:opacity-50"><Save size={16} /></button>
                    <button type="button" onClick={() => setEditingAliasId(null)} aria-label="Cancelar edición" className="rounded-lg border border-wms-border p-2.5 text-wms-muted hover:text-white"><X size={16} /></button>
                  </div>
                </div>
              )}
              <dl className="mt-5 space-y-3 border-t border-white/5 pt-4 text-xs">
                <div className="flex items-center justify-between gap-3"><dt className="font-bold text-wms-muted">Nickname ML</dt><dd className="truncate font-bold text-white">{account.nickname}</dd></div>
                <div className="flex items-center justify-between gap-3"><dt className="font-bold text-wms-muted">Seller ID</dt><dd className="font-mono text-white">{account.sellerId}</dd></div>
                <div><dt className="mb-1 font-bold text-wms-muted">ID gateway</dt><dd className="break-all font-mono text-[10px] text-white/70">{account.gatewayAccountId}</dd></div>
                {account.siteId && <div className="flex items-center justify-between gap-3"><dt className="font-bold text-wms-muted">Sitio</dt><dd className="font-mono text-white">{account.siteId}</dd></div>}
              </dl>
              <button type="button" onClick={() => reauthorizeAccount(account)} disabled={linkingAccount}
                className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-4 text-[10px] font-black uppercase tracking-wider text-amber-300 transition-colors hover:bg-amber-400/[0.14] disabled:opacity-50">
                <RefreshCw size={14} /> Reautorizar acceso
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
