import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router';
import { Menu, ChevronRight } from 'lucide-react';
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

          {/* Right Header: Discrete Neutral Environment Indicator */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-[11px] text-stone-400 font-normal tracking-tight select-none"
              title="Entorno de demostración con datos mock en memoria. Autenticación de operadores en desarrollo."
            >
              Entorno de prueba <span className="hidden sm:inline">· Sin autenticación</span>
            </span>
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

