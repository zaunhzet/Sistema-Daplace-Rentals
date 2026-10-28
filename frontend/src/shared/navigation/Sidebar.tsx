import React, { useState } from 'react';
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import type { NavigationGroup, NavigationItem, SidebarProps } from './types';
import { NAVIGATION_ITEMS } from './navItems';

const GROUPS: NavigationGroup[] = [
  'Principal',
  'Gestión Inmobiliaria',
  'Finanzas',
  'Operaciones',
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  items = NAVIGATION_ITEMS,
  collapsed = false,
  onToggleCollapse,
  className = '',
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleItemClick = (item: NavigationItem) => {
    onNavigate?.(item.path, item);
    setMobileOpen(false);
  };

  const renderNavigation = (isCollapsed: boolean, isMobile = false) => (
    <div className="flex h-full min-h-0 flex-col bg-[#162A2C] text-[#FEFCF6]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#5E6C5B] text-sm font-semibold tracking-wide text-[#FEFCF6]">
            D
          </span>
          {!isCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-[-0.02em] text-[#FEFCF6]">
                daplace <span className="font-normal text-[#D6E0E2]/75">rentals</span>
              </p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#D6E0E2]/65">
                Panel operativo
              </p>
            </div>
          )}
        </div>

        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú móvil"
            className="grid size-9 place-items-center rounded-lg text-[#D6E0E2]/80 transition-colors hover:bg-white/10 hover:text-[#FEFCF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6E0E2]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            title={isCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            className="hidden size-8 shrink-0 place-items-center rounded-lg text-[#D6E0E2]/75 transition-colors hover:bg-white/10 hover:text-[#FEFCF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6E0E2] lg:grid"
          >
            {isCollapsed ? (
              <PanelLeftOpen size={17} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={17} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      <nav
        aria-label="Menú del sistema"
        className={`min-h-0 flex-1 overflow-y-auto py-5 ${isCollapsed ? 'px-2.5' : 'px-3'}`}
      >
        <div className="space-y-6">
          {GROUPS.map((groupName) => {
            const groupItems = items.filter((item) => item.group === groupName);
            if (groupItems.length === 0) return null;

            return (
              <section key={groupName} aria-label={isCollapsed ? undefined : groupName}>
                {!isCollapsed && (
                  <h2 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D6E0E2]/55">
                    {groupName}
                  </h2>
                )}
                <ul className="space-y-1">
                  {groupItems.map((item) => {
                    const isActive = currentPath === item.path;
                    const isAvailable = item.status === 'DISPONIBLE';
                    const ItemIcon = item.icon;
                    const statusText = isAvailable ? 'Disponible' : 'Pendiente de desarrollo';

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => handleItemClick(item)}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={`${item.name}, ${statusText}`}
                          title={`${item.name} · ${statusText}`}
                          className={`group flex min-h-10 w-full items-center rounded-xl text-left text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6E0E2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#162A2C] ${
                            isCollapsed ? 'justify-center px-2' : 'gap-3 px-3'
                          } ${
                            isActive
                              ? 'bg-[#5E6C5B] text-[#FEFCF6]'
                              : 'text-[#D6E0E2]/80 hover:bg-white/[0.07] hover:text-[#FEFCF6]'
                          }`}
                        >
                          <ItemIcon
                            size={18}
                            strokeWidth={1.8}
                            aria-hidden="true"
                            className={`shrink-0 ${isActive ? 'text-[#FEFCF6]' : 'text-[#D6E0E2]/75 group-hover:text-[#FEFCF6]'}`}
                          />
                          {!isCollapsed && (
                            <>
                              <span className="min-w-0 flex-1 truncate">{item.name}</span>
                              <span
                                aria-hidden="true"
                                className={`size-1.5 shrink-0 rounded-full ${
                                  isAvailable ? 'bg-[#B9CDB4]' : 'bg-[#D6E0E2]/35'
                                }`}
                              />
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </nav>

      {!isCollapsed && (
        <footer className="border-t border-white/10 px-5 py-4">
          <p className="text-[11px] font-semibold tracking-wide text-[#D6E0E2]/80">
            DAPLACE RENTALS
          </p>
          <p className="mt-1 text-[10px] text-[#D6E0E2]/50">Panel de gestión de propiedades</p>
        </footer>
      )}
    </div>
  );

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
          aria-expanded={mobileOpen}
          aria-controls="daplace-mobile-navigation"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-[#162A2C] px-4 text-sm font-semibold text-[#FEFCF6] shadow-lg transition-colors hover:bg-[#243f42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5E6C5B]"
        >
          <Menu size={17} aria-hidden="true" />
          <span>Menú</span>
        </button>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            id="daplace-mobile-navigation"
            aria-label="Navegación principal móvil"
            className="h-full w-[min(19rem,calc(100vw-2.5rem))] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {renderNavigation(false, true)}
          </aside>
        </div>
      )}

      <aside
        aria-label="Navegación principal"
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-white/10 transition-[width] duration-200 lg:flex ${
          collapsed ? 'w-20' : 'w-64'
        } ${className}`}
      >
        {renderNavigation(collapsed)}
      </aside>
    </>
  );
};
