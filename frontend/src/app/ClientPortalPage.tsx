import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../features/auth/AuthContext';
import { UserCheck, LogOut, Loader2, AlertCircle } from 'lucide-react';
import daplaceIcon from '../assets/daplace-icon.png';

export const ClientPortalPage: React.FC = () => {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (err: any) {
      setLogoutError(err?.message || 'No fue posible cerrar la sesión. Intente nuevamente.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f7f7f5] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-3xl border border-stone-200/80 bg-white p-7 shadow-sm sm:p-9 text-center">
          {/* Isotipo */}
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-stone-200/80 bg-white p-2.5 shadow-xs">
            <img
              src={daplaceIcon}
              alt="Isotipo Daplace Rentals"
              className="size-full object-contain"
            />
          </div>

          <div className="mx-auto mt-5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
            <UserCheck size={14} className="text-emerald-700" aria-hidden="true" />
            <span>Cuenta de Cliente Autenticada</span>
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900">
            Bienvenido, {session.user?.nombre || 'Huésped'}
          </h1>

          <p className="mt-2 text-xs leading-relaxed text-stone-500">
            Su cuenta <span className="font-medium text-stone-700">({session.user?.email})</span> está registrada como <span className="font-semibold text-stone-800">CLIENTE</span>. Las consolas operativas y financieras están reservadas para administradores, operadores y propietarios de Daplace Rentals.
          </p>

          <div className="mt-6 rounded-2xl border border-stone-100 bg-stone-50/70 p-4 text-left text-xs text-stone-600">
            <p className="font-semibold text-stone-800">Portal de Reservas en Preparación</p>
            <p className="mt-1 text-stone-500">
              Próximamente podrá consultar el estado de sus reservas, contratos firmados y vouchers de pago directamente desde este portal.
            </p>
          </div>

          {logoutError && (
            <div
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 text-left"
            >
              <AlertCircle size={15} className="shrink-0 text-rose-600" />
              <span>{logoutError}</span>
            </div>
          )}

          <div className="mt-7">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-xs font-semibold text-white shadow-xs transition hover:bg-stone-800 focus:outline-hidden focus:ring-2 focus:ring-stone-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 cursor-pointer"
            >
              {isLoggingOut ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  <span>Cerrando sesión segura...</span>
                </>
              ) : (
                <>
                  <LogOut size={16} aria-hidden="true" />
                  <span>Cerrar Sesión</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
