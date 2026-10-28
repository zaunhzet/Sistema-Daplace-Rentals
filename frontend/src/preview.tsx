import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Home, TriangleAlert, Users } from 'lucide-react';
import './styles.css';
import { PropertiesPage } from './features/properties';
import { GuestsPage } from './features/guests';
import { Sidebar, NAVIGATION_ITEMS } from './shared/navigation';
import type { NavigationItem } from './shared/navigation';

function PendingModuleView({ item }: { item: NavigationItem }) {
  const ModuleIcon = item.icon;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="rounded-3xl border border-stone-200 bg-white p-8 sm:p-12 shadow-xs">
        <div className="flex items-center gap-3 mb-4">
          <ModuleIcon className="size-7 text-[#5E6C5B]" strokeWidth={1.7} aria-hidden="true" />
          <div>
            <span className="rounded-md bg-stone-100 px-2 py-0.5 font-mono text-xs font-semibold text-stone-600">
              Ruta: {item.path}
            </span>
            <span className="ml-2 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              Pendiente de desarrollo
            </span>
          </div>
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          Módulo {item.name}
        </h2>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed max-w-2xl">
          {item.description}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 max-w-xl">
          <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Responsable asignado
            </span>
            <span className="mt-1 block text-base font-bold text-stone-800">
              {item.responsible}
            </span>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Grupo de arquitectura
            </span>
            <span className="mt-1 block text-base font-bold text-stone-800">
              {item.group}
            </span>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900 leading-5">
          <p className="mb-0.5 flex items-center gap-1.5 font-semibold text-amber-950">
            <TriangleAlert size={14} aria-hidden="true" />
            Integración pendiente
          </p>
          Esta pantalla no simula funcionalidades inexistentes. Se habilitará cuando el responsable correspondiente complete su implementación según el backlog técnico del MVP.
        </div>
      </div>
    </div>
  );
}

function PreviewApp() {
  const [currentPath, setCurrentPath] = useState<string>('/propiedades');
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const currentItem = NAVIGATION_ITEMS.find((it) => it.path === currentPath) || {
    id: 'unknown',
    name: 'Desconocido',
    path: currentPath,
    icon: Home,
    description: 'Ruta no registrada en el catálogo.',
    status: 'PENDIENTE',
    responsible: 'Compartido',
    group: 'Principal',
  } as NavigationItem;

  return (
    <div className="min-h-screen bg-[#f7f7f5] flex">
      {/* Reusable Sidebar Component */}
      <Sidebar
        currentPath={currentPath}
        onNavigate={(path) => setCurrentPath(path)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />

      {/* Main Administrative Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto min-h-screen">
        {/* Top bar with breadcrumb and quick preview toggles */}
        <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur-xs px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <span className="font-semibold text-stone-700">Daplace Admin</span>
            <span aria-hidden="true">/</span>
            <span className="text-stone-500">{currentItem.group}</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-stone-900">{currentItem.name}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">
              Vista previa aislada (UI-NAV-001)
            </span>
            <button
              type="button"
              onClick={() => setCurrentPath('/propiedades')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                currentPath === '/propiedades'
                  ? 'bg-[#162A2C] text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              <Home size={14} aria-hidden="true" />
              Propiedades
            </button>
            <button
              type="button"
              onClick={() => setCurrentPath('/huespedes')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                currentPath === '/huespedes'
                  ? 'bg-[#162A2C] text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              <Users size={14} aria-hidden="true" />
              Huéspedes
            </button>
          </div>
        </header>

        {/* View Switcher based on current path */}
        <main className="flex-1 pb-12">
          {currentPath === '/propiedades' && <PropertiesPage />}
          {currentPath === '/huespedes' && <GuestsPage />}
          {currentPath !== '/propiedades' && currentPath !== '/huespedes' && (
            <PendingModuleView item={currentItem} />
          )}
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PreviewApp />
    </BrowserRouter>
  </React.StrictMode>
);
