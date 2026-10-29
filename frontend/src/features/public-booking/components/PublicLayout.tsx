import React from 'react';
import { Outlet, NavLink, Link } from 'react-router';
import { Building, CalendarCheck, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../../../shared/components/BrandLogo';

export const PublicLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#f7f7f5] flex flex-col text-stone-900 antialiased selection:bg-[#5E6C5B] selection:text-white">
      {/* 1. Public Sticky Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand Logo */}
          <Link
            to="/catalogo"
            className="transition-opacity hover:opacity-90"
            aria-label="DAPLACE Rentals — Catálogo Público"
          >
            <BrandLogo
              showText={true}
              subtitle="Alquileres Temporales"
              theme="light"
              size="md"
            />
          </Link>

          {/* Navigation Links */}
          <nav aria-label="Navegación pública" className="flex items-center gap-1">
            <NavLink
              to="/catalogo"
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#183b32] text-[#FEFCF6]'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`
              }
            >
              <Building size={14} aria-hidden="true" />
              <span>Catálogo de Inmuebles</span>
            </NavLink>

            <NavLink
              to="/solicitar-reserva"
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#183b32] text-[#FEFCF6]'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`
              }
            >
              <CalendarCheck size={14} aria-hidden="true" />
              <span>Solicitar Reserva</span>
            </NavLink>
          </nav>
        </div>
      </header>

      {/* 2. Top Banner: MVP Demo Notice */}
      <div className="border-b border-stone-200 bg-[#FEFCF6] px-4 py-2 text-center text-xs text-stone-600 sm:px-6">
        <p className="flex items-center justify-center gap-1.5 font-medium text-[11px] sm:text-xs">
          <ShieldCheck size={14} className="shrink-0 text-[#183b32]" aria-hidden="true" />
          <span>
            Portal público de reservas de DAPLACE. Las solicitudes quedan registradas en estado preliminar pendiente de confirmación.
          </span>
        </p>
      </div>

      {/* 3. Main Body */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* 4. Public Footer */}
      <footer className="border-t border-stone-200 bg-white py-10 mt-16 text-xs text-stone-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-[#162A2C] text-xs font-bold text-[#FEFCF6]">
                D
              </span>
              <div>
                <p className="font-semibold text-stone-800">DAPLACE RENTALS — MVP Transaccional</p>
                <p className="text-[11px] text-stone-500">Gobernanza y Estandarización de Datos de Alquileres Temporales</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-xs">
              <Link to="/catalogo" className="hover:text-stone-900 transition-colors">
                Catálogo de Inmuebles
              </Link>
              <Link to="/solicitar-reserva" className="hover:text-stone-900 transition-colors">
                Solicitud de Reserva
              </Link>
              <Link to="/propiedades" className="hover:text-stone-900 transition-colors">
                Administración
              </Link>
            </div>
          </div>

          <div className="mt-8 border-t border-stone-100 pt-6 text-center text-[11px] text-stone-400">
            © 2026 DAPLACE RENTALS. Entorno de demostración y pruebas con datos mock centralizados.
          </div>
        </div>
      </footer>
    </div>
  );
};
