'use client';

import Link from 'next/link';
import { ArrowLeft, LogOut } from 'lucide-react';
import React from 'react';

interface NavbarProps {
  /** Título principal de la sección */
  title: string;
  /** Subtítulo opcional de la sección (ej: Producto 1 de 3) */
  subtitle?: string;
  /** Ruta a la que vuelve el botón de retroceso. Si no se define ni backHref ni onBackClick, no se muestra el botón. */
  backHref?: string;
  /** Callback para cuando se hace click en el botón de volver (útil para confirmaciones como en picking/packing) */
  onBackClick?: () => void;
  /** Si es true, muestra la información del operario y el botón de cerrar sesión */
  showSession?: boolean;
  /** Datos del operario a mostrar si showSession es true */
  session?: {
    name: string;
    role: string;
  } | null;
  /** Botones o elementos adicionales a inyectar al extremo derecho */
  rightContent?: React.ReactNode;
}

export default function Navbar({
  title,
  subtitle,
  backHref,
  onBackClick,
  showSession = false,
  session,
  rightContent,
}: NavbarProps) {
  // Manejo del click de retroceso
  const handleBackClick = (e: React.MouseEvent) => {
    if (onBackClick) {
      e.preventDefault();
      onBackClick();
    }
  };

  const renderBackButton = () => {
    const buttonClass =
      'p-2 bg-wms-bg border border-wms-border hover:border-leon-red/50 text-wms-muted hover:text-white rounded-xl hover:bg-leon-red/10 transition-all shadow-sm shrink-0 flex items-center justify-center';

    if (onBackClick) {
      return (
        <button onClick={handleBackClick} className={buttonClass} type="button">
          <ArrowLeft size={16} strokeWidth={3} />
        </button>
      );
    }

    if (backHref) {
      return (
        <Link href={backHref} className={buttonClass}>
          <ArrowLeft size={16} strokeWidth={3} />
        </Link>
      );
    }

    return null;
  };

  return (
    <div className="sticky top-0 z-40 flex flex-col w-full bg-wms-surface" data-scanner-ignore="true">
      {/* Línea de marca superior */}
      <div className="leon-brand-bar" />

      {/* Contenedor principal del navbar */}
      <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 border-b border-wms-border gap-2">
        
        {/* Lado izquierdo: Botón de volver + Título */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {renderBackButton()}
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm md:text-lg font-black text-white uppercase tracking-tight truncate leading-none">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[9px] sm:text-[10px] md:text-xs font-bold text-wms-muted uppercase tracking-widest mt-1 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Lado derecho: Sesión u otros componentes */}
        <div className="flex items-center gap-2 shrink-0">
          {showSession && session && (
            <div className="hidden xs:flex flex-col items-end text-right leading-none select-none">
              <span className="text-[10px] sm:text-xs font-bold text-white max-w-[100px] truncate">
                {session.name.split(' ')[0]}
              </span>
              <span className="text-[8px] sm:text-[9px] font-black text-leon-red-light uppercase tracking-widest mt-0.5">
                {session.role}
              </span>
            </div>
          )}

          {rightContent}

          {showSession && (
            <form action="/api/auth/logout" method="POST" className="flex items-center shrink-0">
              <button
                type="submit"
                className="flex items-center justify-center p-2 rounded-lg text-wms-muted hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all"
                title="Cerrar sesión"
              >
                <LogOut size={16} />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
