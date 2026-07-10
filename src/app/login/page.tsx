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
    <div className="min-h-screen bg-wms-bg flex flex-col" data-scanner-ignore>
      <div className="leon-brand-bar" />

      <div className="flex-1 flex items-center justify-center p-8">
        <form onSubmit={handleLogin} className="w-full max-w-md space-y-8">
          {/* Logo */}
          <div className="text-center space-y-2">
            <h1 className="text-5xl font-black tracking-tighter text-white">
              LEÓN<span className="text-leon-red"> IMPORT</span>
            </h1>
            <p className="text-wms-muted uppercase tracking-[0.2em] text-xs">
              Warehouse Management System
            </p>
          </div>

          {/* Card */}
          <div className="bg-wms-surface border border-wms-border rounded-3xl p-8 space-y-6">
            <div>
              <label className="block text-wms-muted text-xs uppercase tracking-wider mb-2">
                Nombre de Operario
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-wms-card border border-wms-border rounded-xl px-4 py-4 text-lg text-white focus:outline-none focus:border-leon-red transition-colors"
                placeholder="Ej: Juan Pérez"
                autoComplete="off"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-wms-muted text-xs uppercase tracking-wider mb-2">
                PIN de Acceso
              </label>
              <input
                ref={pinRef}
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-wms-card border border-wms-border rounded-xl px-4 py-4 text-3xl text-center tracking-[0.5em] font-mono text-white focus:outline-none focus:border-leon-red transition-colors"
                placeholder="• • • •"
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 text-center">
                <p className="text-red-400 font-bold text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!name.trim() || pin.length < 4 || loading}
              className="w-full bg-leon-red hover:bg-leon-red-light text-white font-black text-xl rounded-2xl btn-industrial disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'VERIFICANDO...' : 'INGRESAR'}
            </button>
          </div>

          <p className="text-center text-wms-muted/30 text-xs">
            Contacte al supervisor si no tiene PIN asignado
          </p>
        </form>
      </div>
    </div>
  );
}
