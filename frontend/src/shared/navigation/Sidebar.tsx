import React, { useState } from 'react';
import type { NavigationGroup, NavigationItem, SidebarProps } from './types';
import { NAVIGATION_ITEMS } from './navItems';

export const Sidebar: React.FC<SidebarProps> = ({
  currentPath,
  onNavigate,
  items = NAVIGATION_ITEMS,
  collapsed = false,
  onToggleCollapse,
  className = '',
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Group items by group
  const groups: NavigationGroup[] = [
    'Principal',
    'Gestión Inmobiliaria',
    'Finanzas',
    'Operaciones',
  ];

  const handleItemClick = (item: NavigationItem) => {
    if (onNavigate) {
      onNavigate(item.path, item);
    }
    setMobileOpen(false);
  };

  const navContent = (
    <div className="flex h-full flex-col justify-between">
      {/* Brand & Header */}
      <div>
        <div className="flex items-center justify-between px-5 py-5 border-b border-[#243f42]">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[#5E6C5B] text-sm font-bold text-[#FEFCF6] shadow-xs">
              D
            </span>
            {!collapsed && (
              <div>
                <span className="text-base font-bold tracking-tight text-[#FEFCF6]">
                  daplace <span className="font-normal text-[#D6E0E2]/70">rentals</span>
                </span>
                <span className="block text-[10px] tracking-wider uppercase text-[#D6E0E2]/60">
                  Panel Operativo
                </span>
              </div>
            )}
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
              className="hidden lg:flex size-7 items-center justify-center rounded-lg bg-[#243f42] text-[#D6E0E2] hover:bg-[#5E6C5B] hover:text-[#FEFCF6] transition-colors cursor-pointer text-xs"
            >
              {collapsed ? '→' : '←'}
            </button>
          )}

          {/* Mobile close button */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú móvil"
            className="lg:hidden text-[#D6E0E2] hover:text-[#FEFCF6] text-lg p-1"
          >
            ✕
          </button>
        </div>

        {/* Navigation Groups */}
        <nav aria-label="Menú del sistema" className="px-3 py-4 space-y-6 overflow-y-auto max-h-[calc(100vh-140px)]">
          {groups.map((groupName) => {
            const groupItems = items.filter((item) => item.group === groupName);
            if (groupItems.length === 0) return null;

            return (
              <div key={groupName} className="space-y-1">
                {!collapsed && (
                  <h3 className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[#D6E0E2]/50">
                    {groupName}
                  </h3>
                )}
                <ul role="list" className="space-y-1 mt-1.5">
                  {groupItems.map((item) => {
                    const isActive = currentPath === item.path;
                    const isAvailable = item.status === 'DISPONIBLE';

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => handleItemClick(item)}
                          aria-current={isActive ? 'page' : undefined}
                          title={`${item.name} (${item.status === 'DISPONIBLE' ? 'Módulo Activo' : `Pendiente — ${item.responsible}`})`}
                          className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-[#5E6C5B] text-[#FEFCF6] shadow-xs'
                              : isAvailable
                              ? 'text-[#FEFCF6]/90 hover:bg-[#243f42] hover:text-[#FEFCF6]'
                              : 'text-[#D6E0E2]/60 hover:bg-[#1f3739] hover:text-[#D6E0E2]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <span className="text-sm shrink-0" aria-hidden="true">
                              {item.icon}
                            </span>
                            {!collapsed && (
                              <span className="truncate">{item.name}</span>
                            )}
                          </div>

                          {!collapsed && (
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {isAvailable ? (
                                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                                  {item.badge || 'Listo'}
                                </span>
                              ) : (
                                <span className="rounded-full bg-[#243f42] px-1.5 py-0.5 text-[9px] text-[#D6E0E2]/70 font-mono">
                                  {item.responsible}
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer / Dev info */}
      {!collapsed && (
        <div className="px-4 py-3.5 border-t border-[#243f42] bg-[#122224] text-[11px] text-[#D6E0E2]/60">
          <p className="font-medium text-[#D6E0E2]/90 flex items-center justify-between">
            <span>DAPLACE MVP</span>
            <span className="text-[10px] text-emerald-300 font-mono">v0.1.0</span>
          </p>
          <p className="mt-0.5 text-[10px]">André (Gestión) · Diego (Layout)</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Toggle Trigger */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Abrir menú de navegación"
          className="flex items-center gap-2 rounded-2xl bg-[#162A2C] px-4 py-3 text-sm font-semibold text-[#FEFCF6] shadow-lg border border-[#243f42] cursor-pointer"
        >
          <span>☰</span>
          <span>Menú</span>
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-xs"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            aria-label="Navegación principal móvil"
            className="w-72 h-full bg-[#162A2C] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </aside>
        </div>
      )}

      {/* Desktop Persistent Sidebar */}
      <aside
        aria-label="Navegación principal"
        className={`hidden lg:flex flex-col shrink-0 bg-[#162A2C] border-r border-[#243f42] transition-all duration-200 ${
          collapsed ? 'w-20' : 'w-64'
        } ${className}`}
      >
        {navContent}
      </aside>
    </>
  );
};
