import { Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from '../features/auth';
import { LoginForm } from '../features/auth';
import { AdminAreaPreview } from '../features/auth';
import { AdminLayout } from './AdminLayout';
import { PropertiesPage } from '../features/properties';
import { GuestsPage } from '../features/guests';
import { ReservationsPage } from '../features/reservations';
import { CalendarPage } from '../features/calendar';
import { PaymentsPage } from '../features/payments';
import { GuaranteesPage } from '../features/guarantees';
import { ExpensesPage } from '../features/expenses';
import { PendingModuleView } from './PendingModuleView';
import { NotFoundPage } from './NotFoundPage';
import { PublicLayout, PublicCatalogPage, PublicBookingRequestPage } from '../features/public-booking';
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

  return (
    <Routes>
      {/* 1. Ruta de Login */}
      <Route
        path="/login"
        element={session.isAuthenticated ? <Navigate to="/propiedades" replace /> : <LoginForm />}
      />

      {/* 2. Vista de diagnóstico de sesión de Diego */}
      <Route path="/auth-preview" element={<AdminAreaPreview />} />

      {/* 3. Portal Público de Reservas (activo solo con feature flag) */}
      {ENABLE_PUBLIC_BOOKING && (
        <Route element={<PublicLayout />}>
          <Route path="/catalogo" element={<PublicCatalogPage />} />
          <Route path="/solicitar-reserva" element={<PublicBookingRequestPage />} />
        </Route>
      )}

      {/* 4. Panel Administrativo Transaccional (Shell Operativo Principal de André) */}
      <Route element={<AdminLayout />}>
        {/* Ruta raíz redirige al módulo operativo disponible */}
        <Route index element={<Navigate to="/propiedades" replace />} />

        {/* Módulos Operativos (André) */}
        <Route path="/propiedades" element={<PropertiesPage />} />
        <Route path="/huespedes" element={<GuestsPage />} />
        <Route path="/reservas" element={<ReservationsPage />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="/pagos" element={<PaymentsPage />} />
        <Route path="/garantias" element={<GuaranteesPage />} />
        <Route path="/gastos" element={<ExpensesPage />} />

        {/* Módulos Reservados / Pendientes (Diego y Compartidos) */}
        <Route path="/dashboard" element={<PendingModuleView path="/dashboard" />} />
        <Route path="/reportes" element={<PendingModuleView path="/reportes" />} />
        <Route path="/personal" element={<PendingModuleView path="/personal" />} />
        <Route path="/mantenimiento" element={<PendingModuleView path="/mantenimiento" />} />

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
