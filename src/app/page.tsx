import Link from 'next/link';
import { 
  Package, 
  ScanLine, 
  LayoutDashboard, 
  Warehouse, 
  LogOut 
} from 'lucide-react';
import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect('/login');

  const modules = [
    {
      href: '/picking',
      icon: Package,
      title: 'PICKING',
      desc: 'Recolección con ruta S-Shape',
      color: 'leon-red',
      roles: ['SUPERVISOR', 'ADMIN', 'PICKER', 'PACKER'],
    },
    {
      href: '/packing',
      icon: ScanLine,
      title: 'PACKING',
      desc: '6 mesas de armado',
      color: 'green-500',
      roles: ['SUPERVISOR', 'ADMIN', 'PICKER', 'PACKER'],
    },
    {
      href: '/inventario',
      icon: Warehouse,
      title: 'INVENTARIO',
      desc: 'Productos, stock y ubicaciones',
      color: 'amber-500',
      roles: ['SUPERVISOR', 'ADMIN'],
    },
    {
      href: '/supervisor',
      icon: LayoutDashboard,
      title: 'SUPERVISOR',
      desc: 'Control y resolución de conflictos',
      color: 'red-500',
      roles: ['SUPERVISOR', 'ADMIN'],
    },
  ];

  const visibleModules = modules.filter((m) => m.roles.includes(session.role));

  return (
    <div className="min-h-screen bg-wms-bg flex flex-col">
      <div className="leon-brand-bar" />

      {/* User Bar */}
      <div className="bg-wms-surface border-b border-wms-border px-4 md:px-8 py-3 flex justify-between items-center">
        <p className="text-sm text-wms-muted">
          Operario: <span className="text-white font-bold">{session.name}</span>
          <span className="ml-3 bg-leon-red/20 text-leon-red px-2 py-0.5 rounded text-xs font-bold">
            {session.role}
          </span>
        </p>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="text-wms-muted hover:text-red-400 text-sm flex items-center gap-1 transition-colors">
            <LogOut size={14} /> Cerrar Sesión
          </button>
        </form>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="max-w-4xl w-full space-y-8 md:space-y-12">
          <div className="text-center space-y-4">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
              LEÓN<span className="text-leon-red"> IMPORT</span>
            </h1>
            <p className="text-wms-muted uppercase tracking-[0.3em] text-sm">
              Sistema de Gestión de Almacén
            </p>
          </div>

          <div className={`grid grid-cols-1 ${visibleModules.length <= 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-4'} gap-6`}>
            {visibleModules.map((mod) => (
              <Link
                key={mod.href}
                href={mod.href}
                className={`group bg-wms-card border border-wms-border hover:border-${mod.color}/50 p-5 md:p-8 rounded-2xl md:rounded-3xl transition-all duration-300 hover:shadow-lg hover:shadow-${mod.color}/10`}
              >
                <mod.icon size={36} className={`text-${mod.color} mb-4 md:mb-6 group-hover:scale-110 transition-transform md:w-12 md:h-12`} />
                <h2 className="text-lg md:text-2xl font-bold mb-2">{mod.title}</h2>
                <p className="text-wms-muted text-sm">{mod.desc}</p>
              </Link>
            ))}
          </div>

          <p className="text-center text-wms-muted/30 text-xs">
            WMS v{process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'} · León Import — Tu Mejor Experiencia
          </p>
        </div>
      </div>
    </div>
  );
}
