import { Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from '../features/auth';
import { LoginForm } from '../features/auth';
import { AdminAreaPreview } from '../features/auth';
import { AdminLayout } from './AdminLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { PropertiesPage } from '../features/properties';
import { GuestsPage } from '../features/guests';
import { ReservationsPage } from '../features/reservations';
import { CalendarPage } from '../features/calendar';
import { PaymentsPage } from '../features/payments';
import { GuaranteesPage } from '../features/guarantees';
import { ExpensesPage } from '../features/expenses';
import { PendingModuleView } from './PendingModuleView';
import { NotFoundPage } from './NotFoundPage';
import { ClientPortalPage } from './ClientPortalPage';
import { ForbiddenPage } from './ForbiddenPage';
import { PublicLayout, PublicCatalogPage, PublicBookingRequestPage } from '../features/public-booking';
import { getDefaultAuthorizedPath } from '../shared/auth/permissions';
import daplaceIcon from '../assets/daplace-icon.png';

// Feature flag: el portal público de reservas (HU-01 / HU-02) queda pospuesto por decisión
// de alcance y enfocado exclusivamente en gestión administrativa. Se activa con VITE_ENABLE_PUBLIC_BOOKING=true.
const ENABLE_PUBLIC_BOOKING = import.meta.env.VITE_ENABLE_PUBLIC_BOOKING === 'true';

function AppRoutes() {
  const { session, isRestoringSession } = useAuth();

  // Mientras se restaura la sesión con el refresh token, evitamos parpadeos y redirecciones espurias
  if (isRestoringSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5]">
        <div className="flex flex-col items-center gap-3">
          <img
            src={daplaceIcon}
            alt="Cargando Daplace"
            className="size-12 animate-pulse rounded-2xl border border-stone-200/80 bg-white p-2 shadow-xs"
          />
          <p className="text-xs font-medium text-stone-500">Restaurando sesión segura...</p>
        </div>
      </div>
    );
  }

  const defaultPath = getDefaultAuthorizedPath(session.user?.rol);

  return (
    <Routes>
      {/* 1. Ruta de Login */}
      <Route
        path="/login"
        element={session.isAuthenticated ? <Navigate to={defaultPath} replace /> : <LoginForm />}
      />

      {/* 2. Portal Informativo Seguro para CLIENTE (fuera del AdminLayout) */}
      <Route
        path="/cliente"
        element={
          session.isAuthenticated ? (
            session.user?.rol === 'CLIENTE' ? (
              <ClientPortalPage />
            ) : (
              <Navigate to={defaultPath} replace />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* 3. Vista de diagnóstico de sesión de Diego */}
      <Route path="/auth-preview" element={<AdminAreaPreview />} />

      {/* 4. Portal Público de Reservas (activo solo con feature flag) */}
      {ENABLE_PUBLIC_BOOKING && (
        <Route element={<PublicLayout />}>
          <Route path="/catalogo" element={<PublicCatalogPage />} />
          <Route path="/solicitar-reserva" element={<PublicBookingRequestPage />} />
        </Route>
      )}

      {/* 4. Panel Administrativo Transaccional (Shell Operativo Principal) */}
      {/* CLIENTE nunca monta el AdminLayout: recibe 403 standalone antes de que el shell se renderice */}
      <Route
        element={
          !session.isAuthenticated ? (
            <Navigate to="/login" replace />
          ) : session.user?.rol === 'CLIENTE' ? (
            // CLIENTE autenticado intentando acceder a rutas administrativas → 403 sin shell
            <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] p-6">
              <ForbiddenPage
                onBackPath="/cliente"
                message="El portal administrativo no está disponible para cuentas de cliente. Usa el portal de cliente para ver tu información."
              />
            </div>
          ) : (
            <AdminLayout />
          )
        }
      >
        {/* Ruta raíz redirige al primer módulo autorizado según el rol */}
        <Route index element={<Navigate to={defaultPath} replace />} />

        {/* Módulos Operativos */}
        <Route
          path="/propiedades"
          element={
            <ProtectedRoute path="/propiedades">
              <PropertiesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/huespedes"
          element={
            <ProtectedRoute path="/huespedes">
              <GuestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reservas"
          element={
            <ProtectedRoute path="/reservas">
              <ReservationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendario"
          element={
            <ProtectedRoute path="/calendario">
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pagos"
          element={
            <ProtectedRoute path="/pagos">
              <PaymentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/garantias"
          element={
            <ProtectedRoute path="/garantias">
              <GuaranteesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/gastos"
          element={
            <ProtectedRoute path="/gastos">
              <ExpensesPage />
            </ProtectedRoute>
          }
        />

        {/* Módulos Reservados / Pendientes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute path="/dashboard">
              <PendingModuleView path="/dashboard" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reportes"
          element={
            <ProtectedRoute path="/reportes">
              <PendingModuleView path="/reportes" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/personal"
          element={
            <ProtectedRoute path="/personal">
              <PendingModuleView path="/personal" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mantenimiento"
          element={
            <ProtectedRoute path="/mantenimiento">
              <PendingModuleView path="/mantenimiento" />
            </ProtectedRoute>
          }
        />

        {/* Fallback 404 para rutas desconocidas */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
