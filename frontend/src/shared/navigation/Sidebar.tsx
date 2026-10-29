import React, { useState, useEffect } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import type { NavigationGroup, NavigationItem, SidebarProps } from './types';
import { NAVIGATION_ITEMS } from './navItems';
import { BrandLogo } from '../components/BrandLogo';

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
  mobileOpen: controlledMobileOpen,
  onToggleMobile,
  className = '',
}) => {
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const isControlled = controlledMobileOpen !== undefined;
  const mobileOpen = isControlled ? controlledMobileOpen : internalMobileOpen;

  const setMobileOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof value === 'function' ? value(mobileOpen) : value;
    if (!isControlled) {
      setInternalMobileOpen(nextVal);
    }
    onToggleMobile?.(nextVal);
  };

  const handleItemClick = (item: NavigationItem) => {
    onNavigate?.(item.path, item);
    setMobileOpen(false);
  };

  // Keyboard accessibility: Close mobile drawer on Escape & lock body scroll
  useEffect(() => {
    if (!mobileOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileOpen]);

  const renderNavigation = (isCollapsed: boolean, isMobile = false) => (
    <div className="flex h-full min-h-0 flex-col bg-[#162A2C] text-[#FEFCF6]">
      {/* Sidebar Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3.5">
        <BrandLogo
          showText={!isCollapsed}
          subtitle="Panel Operativo"
          theme="dark"
          size="md"
        />

        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú de navegación"
            className="grid size-8 place-items-center rounded-lg text-[#D6E0E2]/80 transition-colors hover:bg-white/10 hover:text-[#FEFCF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6E0E2] cursor-pointer"
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            title={isCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            className="hidden size-8 shrink-0 place-items-center rounded-lg text-[#D6E0E2]/75 transition-colors hover:bg-white/10 hover:text-[#FEFCF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6E0E2] lg:grid cursor-pointer"
          >
            {isCollapsed ? (
              <PanelLeftOpen size={16} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={16} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      {/* Scrollable Navigation List (only items scroll if menu overflows) */}
      <nav
        aria-label="Menú del sistema"
        className={`min-h-0 flex-1 overflow-y-auto py-4 ${isCollapsed ? 'px-2' : 'px-3'}`}
      >
        <div className="space-y-5">
          {GROUPS.map((groupName) => {
            const groupItems = items.filter((item) => item.group === groupName);
            if (groupItems.length === 0) return null;

            return (
              <section key={groupName} aria-label={isCollapsed ? undefined : groupName}>
                {!isCollapsed && (
                  <h2 className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#D6E0E2]/50">
                    {groupName}
                  </h2>
                )}
                <ul className="space-y-0.5">
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
                          className={`group flex min-h-9 w-full items-center rounded-xl text-left text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6E0E2] cursor-pointer ${
                            isCollapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2'
                          } ${
                            isActive
                              ? 'bg-[#5E6C5B] text-[#FEFCF6] font-semibold shadow-2xs'
                              : 'text-[#D6E0E2]/80 hover:bg-white/[0.08] hover:text-[#FEFCF6]'
                          }`}
                        >
                          <ItemIcon
                            size={16}
                            strokeWidth={isActive ? 2.2 : 1.8}
                            aria-hidden="true"
                            className={`shrink-0 ${
                              isActive ? 'text-[#FEFCF6]' : 'text-[#D6E0E2]/70 group-hover:text-[#FEFCF6]'
                            }`}
                          />
                          {!isCollapsed && (
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
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

      {/* Pinned Sidebar Footer */}
      {!isCollapsed && (
        <footer className="shrink-0 border-t border-white/10 px-4 py-3 bg-[#132426]">
          <p className="text-[11px] font-semibold tracking-wide text-[#D6E0E2]/80">
            DAPLACE RENTALS
          </p>
          <p className="text-[10px] text-[#D6E0E2]/50 truncate">Gestión de alquileres temporales</p>
        </footer>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Drawer Backdrop & Container */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navegación principal móvil"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs lg:hidden flex"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            id="daplace-mobile-navigation"
            className="h-full w-[min(18rem,calc(100vw-2.5rem))] shadow-2xl flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            {renderNavigation(false, true)}
          </aside>
        </div>
      )}

      {/* Desktop Anchored Sidebar */}
      <aside
        aria-label="Navegación principal"
        className={`hidden lg:flex flex-col h-full shrink-0 border-r border-white/10 transition-[width] duration-200 z-30 ${
          collapsed ? 'w-18' : 'w-60'
        } ${className}`}
      >
        {renderNavigation(collapsed)}
      </aside>
    </>
  );
};

