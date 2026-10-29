import { useNavigate } from 'react-router';
import { useAuth } from './AuthContext';

export function AdminAreaPreview() {
  const navigate = useNavigate();
  const { session, logoutDemo } = useAuth();

  const handleLogout = () => {
    logoutDemo();
    navigate('/login');
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Banner de confirmación de sesión simulada */}
      <div className="rounded-3xl border border-emerald-800/20 bg-gradient-to-r from-[#183b32] to-[#122e27] p-8 text-white shadow-sm sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-900/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-200">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              Sesión Simutada Activa (HU-08)
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Bienvenido, {session.user?.nombre}
            </h1>
            <p className="mt-1 text-sm text-emerald-100/80">
              {session.user?.cargo} &bull; <span className="font-mono text-emerald-200">{session.user?.correo}</span>
            </p>
          </div>

          {/* Botón de Cierre de Sesión Demo */}
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Cerrar sesión demo</span>
          </button>
        </div>

        {/* Detalles de la sesión en memoria */}
        <div className="mt-8 grid grid-cols-1 gap-3 rounded-2xl bg-black/20 p-4 text-xs sm:grid-cols-3">
          <div>
            <span className="block text-emerald-300/70">Rol Asignado</span>
            <span className="font-semibold text-white">{session.user?.rol}</span>
          </div>
          <div>
            <span className="block text-emerald-300/70">Hora de Ingreso Simulado</span>
            <span className="font-semibold text-white">{session.ingresoEn}</span>
          </div>
          <div>
            <span className="block text-emerald-300/70">Tipo de Persistencia</span>
            <span className="font-semibold text-white">Estado local en memoria (React)</span>
          </div>
        </div>
      </div>

      {/* Tarjeta de Gobernanza y Alcance Técnico */}
      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-stone-900">
          Estado del Frente Técnico (HU-08 completada)
        </h2>
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          Has completado satisfactoriamente el flujo de login simulado. La sesión activa reside en el estado de React sin tokens ficticios ni conexión a servicios inexistentes.
        </p>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
          <p className="font-semibold">Próximo paso según la distribución acordada:</p>
          <p className="mt-1 text-amber-800">
            En la siguiente fase se implementará el Shell de navegación (Sidebar, Header y Dashboard con métricas de gobernanza), manteniendo la separación de responsabilidades acordada con André (quien desarrolla properties, guests, reservations, calendar, payments y guarantees).
          </p>
        </div>
      </section>
    </main>
  );
}
