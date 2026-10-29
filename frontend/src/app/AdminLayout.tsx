import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router';
import { Menu, ChevronRight, Globe } from 'lucide-react';
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
    <div className="h-dvh w-full overflow-hidden bg-[#f7f7f5] flex text-stone-900 antialiased selection:bg-[#5E6C5B] selection:text-white">
      {/* 1. Anchored Sidebar (Desktop flex column + Mobile overlay drawer) */}
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

      {/* 2. Right Column: Fixed Header + Scrollable Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Fixed Header */}
        <header className="h-14 shrink-0 border-b border-stone-200/90 bg-white/95 px-4 sm:px-6 backdrop-blur-xs flex items-center justify-between z-20">
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile Hamburger Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú de navegación"
              className="grid size-9 place-items-center rounded-xl text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6C5B] lg:hidden cursor-pointer"
            >
              <Menu size={19} aria-hidden="true" />
            </button>

            {/* Breadcrumbs */}
            <nav aria-label="Ruta de navegación" className="flex items-center text-xs text-stone-500 truncate">
              <NavLink
                to="/propiedades"
                className="font-semibold text-stone-800 hover:text-[#183b32] transition-colors shrink-0"
              >
                Daplace
              </NavLink>
              <ChevronRight size={13} className="mx-1.5 shrink-0 text-stone-400" aria-hidden="true" />
              <span className="hidden sm:inline text-stone-500 truncate">{breadcrumbGroup}</span>
              <ChevronRight size={13} className="mx-1.5 hidden sm:inline shrink-0 text-stone-400" aria-hidden="true" />
              <span className="font-semibold text-stone-900 truncate">{breadcrumbName}</span>
            </nav>
          </div>

          {/* Right Header: Link to Public Portal & Discrete Demo Indicator */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Link to Public Portal */}
            <NavLink
              to="/catalogo"
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:border-stone-400 hover:bg-stone-50 transition-colors shadow-2xs"
              title="Abrir el catálogo público de cara al huésped"
            >
              <Globe size={13} className="text-[#5E6C5B]" aria-hidden="true" />
              <span className="hidden sm:inline">Web Pública</span>
              <span className="sm:hidden">Web</span>
            </NavLink>

            {/* Discrete Demo Environment Badge */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-600/20 px-2.5 py-1 text-[11px] font-medium text-amber-900"
              title="Entorno MVP: datos en memoria para demostración funcional, sin autenticación operativa."
            >
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
              <span className="hidden md:inline">Demo funcional · Sin auth</span>
              <span className="md:hidden">Demo</span>
            </div>
          </div>
        </header>

        {/* 3. Main Scrollable Container (Only this area scrolls vertically) */}
        <main className="flex-1 min-h-0 overflow-y-auto w-full p-4 sm:p-5 lg:p-6 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

