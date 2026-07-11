'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), pin }),
      });

      const data = await res.json();
      if (res.ok) {
        router.push('/');
      } else {
        setError(data.error || 'Error de autenticación');
        setPin('');
        pinRef.current?.focus();
      }
    } catch {
      setError('Sin conexión al servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-shell relative flex min-h-screen min-h-[100svh] flex-col overflow-x-hidden bg-wms-bg" data-scanner-ignore>
      <div className="leon-brand-bar" />

      <div className="relative z-10 flex flex-1 items-start justify-center px-4 pb-5 pt-10 sm:items-center sm:p-8">
        <form onSubmit={handleLogin} className="w-full max-w-[26rem]">
          {/* Logo */}
          <header className="mb-8 text-center sm:mb-10">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-leon-red-light shadow-[0_0_10px_rgba(198,40,57,0.8)]" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Acceso de operarios
              </span>
            </div>
            <h1 className="whitespace-nowrap text-[2.5rem] font-black leading-none tracking-[-0.055em] text-white sm:text-5xl">
              LEÓN <span className="text-leon-red-light">IMPORT</span>
            </h1>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500 sm:text-xs">
              Warehouse Management System
            </p>
          </header>

          {/* Card */}
          <div className="rounded-[1.5rem] border border-wms-border bg-wms-surface/95 p-5 shadow-2xl shadow-black/30 backdrop-blur sm:rounded-3xl sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-extrabold tracking-tight text-white">Iniciar turno</h2>
              <p className="mt-1 text-sm leading-5 text-slate-400">
                Ingresa tus credenciales para continuar.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="operator-name" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Nombre de Operario
                </label>
                <input
                  id="operator-name"
                  name="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="min-h-14 w-full rounded-xl border border-wms-border bg-wms-card px-4 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-leon-red-light focus:ring-4 focus:ring-leon-red/10"
                  placeholder="Ej: Juan Pérez"
                  autoComplete="username"
                  autoCapitalize="words"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="operator-pin" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">
                  PIN de Acceso
                </label>
                <input
                  id="operator-pin"
                  name="pin"
                  ref={pinRef}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="min-h-14 w-full rounded-xl border border-wms-border bg-wms-card px-4 text-center font-mono text-2xl tracking-[0.45em] text-white outline-none transition placeholder:tracking-[0.45em] placeholder:text-slate-500 focus:border-leon-red-light focus:ring-4 focus:ring-leon-red/10"
                  placeholder="••••"
                  autoComplete="current-password"
                  enterKeyHint="go"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-center" role="alert" aria-live="polite">
                  <p className="text-sm font-bold text-red-300">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!name.trim() || pin.length < 4 || loading}
                className="mt-1 min-h-16 w-full rounded-xl bg-leon-red text-base font-black tracking-wide text-white shadow-lg shadow-leon-red/15 transition hover:bg-leon-red-light focus:outline-none focus:ring-4 focus:ring-leon-red/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#54202b] disabled:text-slate-400 disabled:shadow-none"
              >
                {loading ? 'VERIFICANDO...' : 'INGRESAR'}
              </button>
            </div>
          </div>

          <p className="mt-6 text-center text-xs leading-5 text-slate-500">
            Contacte al supervisor si no tiene PIN asignado
          </p>
        </form>
      </div>
    </main>
  );
}
