import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from './AuthContext';

export function AdminAreaPreview() {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      await logout();
      navigate('/login');
    } catch (err: any) {
      setLogoutError(
        'No se pudo revocar la sesión en el servidor. La sesión remota podría seguir activa debido a una falla de red o error del servicio.'
      );
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Alerta de Error en Cierre de Sesión (Fix 5) */}
      {logoutError && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 flex flex-col gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 size-5 shrink-0 text-rose-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="text-xs leading-5">
              <p className="font-semibold text-rose-900">Fallo de revocación remota de sesión</p>
              <p className="text-rose-800">{logoutError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-700 disabled:opacity-50"
          >
            {isLoggingOut ? 'Reintentando...' : 'Reintentar cierre'}
          </button>
        </div>
      )}

      {/* Banner de confirmación de sesión real activa */}
      <div className="rounded-3xl border border-emerald-800/20 bg-gradient-to-r from-[#183b32] to-[#122e27] p-8 text-white shadow-sm sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-900/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-200">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              Sesión Autenticada Activa
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Bienvenido, {session.user?.nombre}
            </h1>
            <p className="mt-1 text-sm text-emerald-100/80">
              {session.user?.cargo ? `${session.user.cargo} • ` : ''}
              <span className="font-mono text-emerald-200">{session.user?.email}</span>
            </p>
          </div>

          {/* Botón de Cierre de Sesión Real */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span>{isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}</span>
          </button>
        </div>

        {/* Detalles técnicos de la sesión activa */}
        <div className="mt-8 grid grid-cols-1 gap-3 rounded-2xl bg-black/20 p-4 text-xs sm:grid-cols-3">
          <div>
            <span className="block text-emerald-300/70">Rol Verificado (PostgreSQL)</span>
            <span className="font-semibold text-white">{session.user?.rol}</span>
          </div>
          <div>
            <span className="block text-emerald-300/70">Hora de Conexión</span>
            <span className="font-semibold text-white">{session.ingresoEn}</span>
          </div>
          <div>
            <span className="block text-emerald-300/70">Seguridad de Tokens</span>
            <span className="font-semibold text-white">Access token en memoria • Refresh HttpOnly</span>
          </div>
        </div>
      </div>

      {/* Tarjeta de Gobernanza y Alcance Técnico */}
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">
          Infraestructura de Gobernanza y Autenticación Transaccional
        </h2>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          Has iniciado sesión con credenciales reales validadas en el backend Fastify contra PostgreSQL mediante hashing seguro Argon2id. La sesión está protegida con JWT de corta duración, rotación criptográfica de refresh token y mitigación contra CSRF.
        </p>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
          <p className="font-semibold">Decisión de producto pendiente:</p>
          <p className="mt-1 text-amber-800">
            La matriz granular de permisos para propiedades, reservas, calendarios, pagos y garantías se encuentra pendiente de definición de producto. La infraestructura de roles actual (ADMINISTRADOR, OPERADOR, PROPIETARIO, CLIENTE) y los middleware de verificación en el backend están listos para asociarse a las políticas que se aprueben.
          </p>
        </div>
      </section>
    </main>
  );
}
