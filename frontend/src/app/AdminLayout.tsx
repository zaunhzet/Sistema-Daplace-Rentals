import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router';
import { Menu, ChevronRight, AlertCircle, Loader2, Shield } from 'lucide-react';
import { Sidebar, NAVIGATION_ITEMS } from '../shared/navigation';
import { useAuth } from '../features/auth';
import { canAccessPath } from '../shared/auth/permissions';
import { NotificationBell } from '../features/alerts';
import { AuditConsoleModal } from '../features/audit';

export const AdminLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);

  // Filtrar ítems de navegación según el rol del usuario autenticado
  const userRole = session.user?.rol;
  const filteredNavItems = NAVIGATION_ITEMS.filter((item) =>
    canAccessPath(userRole, item.path)
  );

  // Match current route in navigation catalog
  const currentItem = NAVIGATION_ITEMS.find((it) => it.path === location.pathname);

  // Group and name resolution for breadcrumbs
  const breadcrumbGroup = currentItem ? currentItem.group : 'Sistema';
  const breadcrumbName = currentItem
    ? currentItem.name
    : location.pathname === '/'
    ? 'Inicio'
    : 'Página no encontrada';

  const handleLogout = async () => {
    if (isLoggingOut) return;
    try {
      setIsLoggingOut(true);
      setLogoutError(null);
      await logout();
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setLogoutError(err.message);
      } else {
        setLogoutError('Error al cerrar la sesión en el servidor. Intente nuevamente.');
      }
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="h-dvh w-full overflow-hidden bg-[#f7f7f5] flex text-stone-900 antialiased selection:bg-[#5E6C5B] selection:text-white">
      {/* 1. Anchored Sidebar (Desktop flex column + Mobile overlay drawer) */}
      <Sidebar
        currentPath={location.pathname}
        items={filteredNavItems}
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
        {/* Banner de error de logout si ocurre */}
        {logoutError && (
          <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs font-medium text-red-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-red-600" />
              <span>{logoutError}</span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs font-bold text-red-900 underline hover:text-red-950 cursor-pointer ml-3"
            >
              Reintentar
            </button>
          </div>
        )}
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

          {/* Right Header: Indicador de sesión real y control de acceso */}
          <div className="flex items-center gap-3 shrink-0">
            {session.isAuthenticated ? (
              <div className="flex items-center gap-2">
                {/* Botón de Auditoría para Administrador (HU-20) */}
                {session.user?.rol === 'ADMINISTRADOR' && (
                  <button
                    type="button"
                    onClick={() => setShowAuditModal(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 hover:text-stone-900 cursor-pointer"
                    title="Abrir bitácora central de auditoría"
                  >
                    <Shield size={14} className="text-indigo-600" />
                    <span className="hidden md:inline">Auditoría</span>
                  </button>
                )}

                {/* Campana de Notificaciones y Alertas (HU-11) */}
                {(session.user?.rol === 'ADMINISTRADOR' || session.user?.rol === 'OPERADOR') && (
                  <NotificationBell />
                )}

                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-200">
                  <span className="size-1.5 rounded-full bg-emerald-600" />
                  {session.user?.nombre} ({session.user?.rol})
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 hover:text-stone-900 disabled:opacity-50 cursor-pointer"
                  title="Cerrar la sesión activa"
                >
                  {isLoggingOut ? (
                    <>
                      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                      <span>Cerrando...</span>
                    </>
                  ) : (
                    <span>Cerrar sesión</span>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span
                  className="hidden md:inline text-[11px] text-stone-400 font-normal tracking-tight select-none"
                  title="Entorno administrativo con autenticación segura."
                >
                  Acceso restringido
                </span>
                <NavLink
                  to="/login"
                  className="rounded-lg bg-[#183b32] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#122e27] cursor-pointer"
                  title="Iniciar sesión en Daplace Rentals"
                >
                  Iniciar sesión
                </NavLink>
              </div>
            )}
          </div>
        </header>

        {/* 3. Main Scrollable Container (Only this area scrolls vertically) */}
        <main className="flex-1 min-h-0 overflow-y-auto w-full p-4 sm:p-5 lg:p-6 min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Modal Bitácora Central de Auditoría (HU-20) */}
      <AuditConsoleModal isOpen={showAuditModal} onClose={() => setShowAuditModal(false)} />
    </div>
  );
};

