'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, Power, Save, Shield, Trash2, UserPlus, X } from 'lucide-react';
import { showConfirmModal, showToast } from '@/lib/toast';

type UserRole = 'SUPERVISOR' | 'PICKER' | 'PACKER';

type ManagedUser = {
  id: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
};

type UserForm = {
  id?: string;
  name: string;
  pin: string;
  role: UserRole;
  isActive: boolean;
};

const emptyUser: UserForm = { name: '', pin: '', role: 'PICKER', isActive: true };

const roleStyles: Record<UserRole, string> = {
  SUPERVISOR: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  PICKER: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  PACKER: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
};

export default function UserManager() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UserForm | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los usuarios');
      setUsers(data);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    if (!form.id && !/^\d{4,6}$/.test(form.pin)) {
      showToast('El PIN debe tener entre 4 y 6 números.', 'error');
      return;
    }
    if (form.id && form.pin && !/^\d{4,6}$/.test(form.pin)) {
      showToast('El nuevo PIN debe tener entre 4 y 6 números.', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el usuario');
      setForm(null);
      await loadUsers();
      showToast(form.id ? 'Usuario actualizado.' : 'Usuario creado.', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user: ManagedUser) => {
    const confirmation = await showConfirmModal(
      `¿Eliminar a ${user.name}?`,
      'Esta acción es permanente. Si tiene actividad histórica, puedes desactivar su cuenta en su lugar.',
      'Sí, eliminar'
    );
    if (!confirmation.isConfirmed) return;

    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo eliminar el usuario');
      await loadUsers();
      showToast('Usuario eliminado.', 'info');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-wider text-white md:text-xl">Usuarios y permisos</h2>
          <p className="mt-1 text-sm text-wms-muted">Crea cuentas, asigna roles y restablece sus PIN de acceso.</p>
        </div>
        <button onClick={() => setForm({ ...emptyUser })} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-leon-red px-5 text-sm font-black text-white transition-colors hover:bg-red-600">
          <UserPlus size={18} /> NUEVO USUARIO
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center font-bold text-wms-muted">Cargando usuarios...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {users.map(user => (
            <article key={user.id} className={`rounded-2xl border bg-wms-surface p-5 ${user.isActive ? 'border-wms-border' : 'border-red-900/50 opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="rounded-xl bg-wms-bg p-3"><Shield size={21} className="text-wms-muted" /></div>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-white">{user.name}</h3>
                    <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black tracking-wider ${roleStyles[user.role]}`}>{user.role}</span>
                  </div>
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-black ${user.isActive ? 'text-green-400' : 'text-red-400'}`}><Power size={13} /> {user.isActive ? 'ACTIVO' : 'INACTIVO'}</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button onClick={() => setForm({ id: user.id, name: user.name, pin: '', role: user.role, isActive: user.isActive })} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-wms-border text-xs font-bold text-white hover:border-amber-500"><Pencil size={15} /> EDITAR</button>
                <button onClick={() => deleteUser(user)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 text-xs font-bold text-red-400 hover:border-red-500/50"><Trash2 size={15} /> ELIMINAR</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:items-center">
          <form onSubmit={saveUser} className="my-4 w-full max-w-md overflow-hidden rounded-2xl border border-wms-border bg-wms-surface shadow-2xl">
            <div className="flex items-center justify-between bg-leon-red p-5">
              <h3 className="text-lg font-black uppercase text-white">{form.id ? 'Editar usuario' : 'Crear usuario'}</h3>
              <button type="button" onClick={() => setForm(null)} className="rounded-lg p-1 text-white/70 hover:bg-black/20 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-5 p-5 sm:p-7">
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase text-wms-muted">Nombre completo</span>
                <input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-4 text-white outline-none focus:border-leon-red" />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase text-wms-muted">{form.id ? 'Nuevo PIN (opcional)' : 'PIN de acceso'}</span>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-wms-muted" size={18} />
                  <input type="password" inputMode="numeric" autoComplete="new-password" required={!form.id} minLength={4} maxLength={6} value={form.pin} onChange={event => setForm({ ...form, pin: event.target.value.replace(/\D/g, '') })} placeholder={form.id ? 'Dejar vacío para mantenerlo' : '4 a 6 números'} className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg pl-12 pr-4 font-mono text-white outline-none focus:border-leon-red" />
                </div>
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase text-wms-muted">Rol / permisos</span>
                <select value={form.role} onChange={event => setForm({ ...form, role: event.target.value as UserRole })} className="min-h-12 w-full rounded-xl border border-wms-border bg-wms-bg px-4 text-white outline-none focus:border-leon-red">
                  <option value="PICKER">PICKER</option>
                  <option value="PACKER">PACKER</option>
                  <option value="SUPERVISOR">SUPERVISOR</option>
                </select>
              </label>
              {form.id && (
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-wms-bg px-4 text-sm font-bold uppercase text-white">
                  <input type="checkbox" checked={form.isActive} onChange={event => setForm({ ...form, isActive: event.target.checked })} className="h-5 w-5 accent-leon-red" /> Cuenta activa
                </label>
              )}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={() => setForm(null)} className="min-h-12 rounded-xl border border-wms-border font-bold text-wms-muted">CANCELAR</button>
                <button type="submit" disabled={saving} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-leon-red font-black text-white disabled:opacity-40"><Save size={17} /> GUARDAR</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
