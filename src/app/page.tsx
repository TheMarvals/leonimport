import Link from 'next/link';
import { 
  Package, 
  ScanLine, 
  LayoutDashboard, 
  Warehouse,
  ArrowUpRight,
  CircleCheck,
  Sparkles,
} from 'lucide-react';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect('/login');

  const modules = [
    {
      href: '/picking',
      icon: Package,
      title: 'PICKING',
      desc: 'Recolecta productos y prepara los pedidos pendientes.',
      eyebrow: 'Recolección',
      accent: 'text-rose-400',
      iconSurface: 'border-rose-500/20 bg-rose-500/10',
      hover: 'hover:border-rose-500/45 hover:shadow-rose-950/25',
      glow: 'bg-rose-500/10',
      roles: ['SUPERVISOR', 'ADMIN', 'PICKER', 'PACKER'],
    },
    {
      href: '/packing',
      icon: ScanLine,
      title: 'PACKING',
      desc: 'Valida, empaca e imprime las etiquetas de despacho.',
      eyebrow: '6 mesas activas',
      accent: 'text-emerald-400',
      iconSurface: 'border-emerald-500/20 bg-emerald-500/10',
      hover: 'hover:border-emerald-500/45 hover:shadow-emerald-950/25',
      glow: 'bg-emerald-500/10',
      roles: ['SUPERVISOR', 'ADMIN', 'PICKER', 'PACKER'],
    },
    {
      href: '/inventario',
      icon: Warehouse,
      title: 'INVENTARIO',
      desc: 'Gestiona stock, ubicaciones, SKU y proveedores.',
      eyebrow: 'Bodega',
      accent: 'text-amber-400',
      iconSurface: 'border-amber-500/20 bg-amber-500/10',
      hover: 'hover:border-amber-500/45 hover:shadow-amber-950/25',
      glow: 'bg-amber-500/10',
      roles: ['SUPERVISOR', 'ADMIN', 'BODEGUERO'],
    },
    {
      href: '/supervisor',
      icon: LayoutDashboard,
      title: 'SUPERVISOR',
      desc: 'Controla la operación, usuarios, cuentas ML y auditoría.',
      eyebrow: 'Administración',
      accent: 'text-sky-400',
      iconSurface: 'border-sky-500/20 bg-sky-500/10',
      hover: 'hover:border-sky-500/45 hover:shadow-sky-950/25',
      glow: 'bg-sky-500/10',
      roles: ['SUPERVISOR', 'ADMIN'],
    },
  ];

  const visibleModules = modules.filter((m) => m.roles.includes(session.role));
  const firstName = session.name?.trim().split(/\s+/)[0] || 'equipo';

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-wms-bg">
      <Navbar 
        title="LEÓN IMPORT" 
        subtitle="Gestión de Almacén" 
        showSession={true} 
        session={{ name: session.name || '', role: session.role }} 
      />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 top-14">
        <div className="absolute left-1/2 top-0 h-[28rem] w-[58rem] -translate-x-1/2 rounded-full bg-leon-red/10 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />
      </div>

      <main className="relative z-10 flex-1 px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-12">
        <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
          <section className="mb-7 flex flex-col gap-6 border-b border-white/[0.07] pb-7 sm:mb-9 sm:pb-9 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-leon-red-light sm:text-xs">
                <Sparkles size={14} /> Centro de operaciones
              </div>
              <h1 className="text-3xl font-black leading-[1.05] tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
                Hola, {firstName}. <span className="text-white/40">¿Qué vamos a preparar hoy?</span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-wms-muted sm:text-base">
                Selecciona un módulo para comenzar. Cada área conserva tu sesión y mantiene la operación sincronizada.
              </p>
            </div>

            <div className="flex w-fit items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 shadow-lg shadow-black/10">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">Sistema operativo</p>
                <p className="mt-0.5 text-xs text-white/50">Servicios conectados</p>
              </div>
            </div>
          </section>

          <section aria-label="Módulos del WMS" className={`grid flex-1 grid-cols-1 gap-4 sm:grid-cols-2 ${visibleModules.length > 2 ? 'lg:grid-cols-4' : ''}`}>
            {visibleModules.map((mod, index) => (
              <Link
                key={mod.href}
                href={mod.href}
                className={`group relative flex min-h-[230px] overflow-hidden rounded-[1.4rem] border border-white/[0.09] bg-gradient-to-b from-[#1b1f29] to-[#151820] p-5 shadow-xl shadow-black/10 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl sm:min-h-[250px] sm:p-6 ${mod.hover}`}
              >
                <div className={`absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100 ${mod.glow}`} />
                <div className="relative flex w-full flex-col">
                  <div className="flex items-start justify-between">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${mod.iconSurface} ${mod.accent}`}>
                      <mod.icon size={25} strokeWidth={2.3} className="transition-transform duration-300 group-hover:scale-110" />
                    </div>
                    <span className="font-mono text-[10px] font-bold tracking-[0.18em] text-white/20">0{index + 1}</span>
                  </div>

                  <div className="mt-7 flex-1">
                    <p className={`mb-2 text-[10px] font-black uppercase tracking-[0.2em] ${mod.accent}`}>{mod.eyebrow}</p>
                    <h2 className="text-xl font-black tracking-[-0.02em] text-white sm:text-2xl">{mod.title}</h2>
                    <p className="mt-3 text-sm leading-5 text-white/45 transition-colors group-hover:text-white/60">{mod.desc}</p>
                  </div>

                  <div className="mt-7 flex items-center justify-between border-t border-white/[0.07] pt-4">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                      <CircleCheck size={13} className={mod.accent} /> Disponible
                    </span>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:border-white/20 ${mod.accent}`}>
                      <ArrowUpRight size={16} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </section>

          <footer className="mt-7 flex flex-col items-center justify-between gap-2 border-t border-white/[0.05] pt-5 text-[10px] uppercase tracking-[0.16em] text-white/20 sm:flex-row">
            <p>León Import · Warehouse Management System</p>
            <p>Versión {process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'}</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
