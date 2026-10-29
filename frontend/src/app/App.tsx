import { NavLink, Route, Routes, Navigate } from 'react-router';
import { AuthProvider, useAuth } from '../features/auth/AuthContext';
import { LoginForm } from '../features/auth/LoginForm';
import { AdminAreaPreview } from '../features/auth/AdminAreaPreview';
import daplaceIcon from '../assets/daplace-icon.png';

function Home() {
  const { session } = useAuth();

  // Si el usuario ya inició sesión demo, mostramos el área administrativa simulada
  if (session.isAuthenticated) {
    return <AdminAreaPreview />;
  }

  // Si no está autenticado, mostramos la base inicial con acceso directo a login
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <div className="mb-10 flex items-center gap-2 text-sm font-medium text-stone-500">
        <span>Proyecto</span><span aria-hidden="true">/</span><span className="text-stone-800">Base inicial</span>
      </div>
      <section className="rounded-3xl bg-[#183b32] px-8 py-10 text-white shadow-sm sm:px-12 sm:py-14">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Daplace Rentals</p>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">Una base clara para el trabajo diario.</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-emerald-50/80">
          La interfaz y la API están listas para incorporar las tareas aprobadas del MVP.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <NavLink
            to="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#183b32] shadow-sm transition hover:bg-emerald-50"
          >
            <span>Acceder al Login Demo (HU-08)</span>
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </NavLink>
        </div>
      </section>
      <section className="mt-10" aria-labelledby="base-title">
        <h2 id="base-title" className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">Base técnica</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['Interfaz web', 'React, TypeScript, Vite y Tailwind CSS.'],
            ['Servicio API', 'Fastify, TypeScript y comprobación de salud.'],
          ].map(([title, description]) => (
            <article key={title} className="rounded-2xl border border-stone-200 bg-white p-6">
              <h3 className="font-semibold text-stone-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-500">{description}</p>
            </article>
          ))}
        </div>
      </section>
      <p className="mt-8 text-xs text-stone-400">HU-08 Login Simulado integrado en modo desarrollo.</p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Página no encontrada</h1>
      <NavLink className="mt-4 inline-block text-emerald-800 underline" to="/">
        Volver al inicio
      </NavLink>
    </main>
  );
}

function AppContent() {
  const { session, logoutDemo } = useAuth();

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
          <NavLink className="flex items-center gap-3" to="/" aria-label="Daplace Rentals, inicio">
            <img
              src={daplaceIcon}
              alt="Logo Daplace"
              className="size-9 rounded-xl border border-stone-200/80 bg-white p-1 object-contain shadow-2xs"
            />
            <span className="font-semibold tracking-tight text-stone-900">
              daplace <span className="font-normal text-stone-500">rentals</span>
            </span>
          </NavLink>

          <div className="flex items-center gap-3">
            {session.isAuthenticated ? (
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 border border-emerald-200">
                  <span className="size-1.5 rounded-full bg-emerald-600" />
                  {session.user?.nombre} ({session.user?.rol})
                </span>
                <button
                  type="button"
                  onClick={logoutDemo}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 hover:text-stone-900"
                >
                  Cerrar sesión demo
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600">
                  Base técnica
                </span>
                <NavLink
                  to="/login"
                  className="rounded-lg bg-[#183b32] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#122e27]"
                >
                  Iniciar sesión
                </NavLink>
              </div>
            )}
          </div>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/login"
          element={session.isAuthenticated ? <Navigate to="/" replace /> : <LoginForm />}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
