import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router';
import { Menu, ChevronRight, ShieldAlert, Sparkles } from 'lucide-react';
import { Sidebar, NAVIGATION_ITEMS } from '../shared/navigation';

export const AdminLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  // Match current route in navigation catalog
  const currentItem = NAVIGATION_ITEMS.find((it) => it.path === location.pathname);

  // Group and name resolution for breadcrumbs
  const breadcrumbGroup = currentItem ? currentItem.group : 'Sistema';
  const breadcrumbName = currentItem
    ? currentItem.name
    : location.pathname === '/'
    ? 'Inicio'
    : 'Página no encontrada';

  return (
    <div className="min-h-screen bg-[#f7f7f5] flex flex-col lg:flex-row text-stone-900 antialiased overflow-x-hidden">
      {/* 1. Reusable Sidebar (Desktop Sticky + Mobile Drawer) */}
      <Sidebar
        currentPath={location.pathname}
        onNavigate={(path) => {
          navigate(path);
          setMobileOpen(false);
        }}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onToggleMobile={(open) => setMobileOpen(open)}
      />

      {/* 2. Main Administrative Content Area */}
      <div className="flex-1 flex flex-col min-w-0 max-w-full">
        {/* Sticky Header with Breadcrumb & Mobile Drawer Trigger */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur-xs sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile Hamburger Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú de navegación"
              className="grid size-10 place-items-center rounded-xl text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6C5B] lg:hidden cursor-pointer"
            >
              <Menu size={20} aria-hidden="true" />
            </button>

            {/* Breadcrumbs */}
            <nav aria-label="Ruta de navegación" className="flex items-center text-xs text-stone-500 truncate">
              <NavLink
                to="/propiedades"
                className="font-semibold text-stone-800 hover:text-[#183b32] transition-colors"
              >
                Daplace Rentals
              </NavLink>
              <ChevronRight size={14} className="mx-1.5 shrink-0 text-stone-400" aria-hidden="true" />
              <span className="hidden sm:inline text-stone-500 truncate">{breadcrumbGroup}</span>
              <ChevronRight size={14} className="mx-1.5 hidden sm:inline shrink-0 text-stone-400" aria-hidden="true" />
              <span className="font-semibold text-stone-900 truncate">{breadcrumbName}</span>
            </nav>
          </div>

          {/* Right Header: Demo Status & Quick Info */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Demo Badge */}
            <div
              className="flex items-center gap-1.5 rounded-full bg-[#162A2C]/5 px-2.5 py-1 text-[11px] font-semibold text-[#162A2C] border border-[#162A2C]/10"
              title="Panel transaccional de demostración del MVP. Rutas abiertas para revisión sin autenticación previa."
            >
              <Sparkles size={12} className="text-[#5E6C5B]" aria-hidden="true" />
              <span className="hidden md:inline">Modo Demo MVP</span>
              <span className="md:hidden">Demo</span>
            </div>

            {/* Operator Identifier */}
            <div className="flex items-center gap-2 pl-2 border-l border-stone-200">
              <span className="grid size-8 place-items-center rounded-lg bg-[#5E6C5B] text-xs font-bold text-white">
                OP
              </span>
              <div className="hidden xl:block text-left">
                <p className="text-xs font-semibold leading-tight text-stone-800">Operador Demo</p>
                <p className="text-[10px] text-stone-400">Acceso libre</p>
              </div>
            </div>
          </div>
        </header>

        {/* Informative Banner regarding Open MVP Demo (No real auth yet) */}
        <div className="bg-[#162A2C] px-4 py-1.5 text-center text-[11px] font-medium text-[#FEFCF6] sm:px-6">
          <p className="flex items-center justify-center gap-1.5 truncate">
            <ShieldAlert size={13} className="shrink-0 text-[#B9CDB4]" aria-hidden="true" />
            <span>
              Entorno MVP: Módulos transaccionales de André en demostración operativa activa. Autenticación en desarrollo por Diego.
            </span>
          </p>
        </div>

        {/* 3. Dynamic Page View via React Router Outlet */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
