import { Routes, Route, Navigate } from 'react-router';
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

// Feature flag: el portal público de reservas (HU-01 / HU-02) queda pospuesto por decisión
// de alcance y enfocado exclusivamente en gestión administrativa. Se activa con VITE_ENABLE_PUBLIC_BOOKING=true.
const ENABLE_PUBLIC_BOOKING = import.meta.env.VITE_ENABLE_PUBLIC_BOOKING === 'true';

export default function App() {
  return (
    <Routes>
      {/* 1. Ruta de Login reservada fuera del shell administrativo para Diego */}
      <Route path="/login" element={<PendingModuleView path="/login" />} />

      {/* 2. Portal Público de Reservas (Pospuesto en esta etapa - activo solo con feature flag) */}
      {ENABLE_PUBLIC_BOOKING && (
        <Route element={<PublicLayout />}>
          <Route path="/catalogo" element={<PublicCatalogPage />} />
          <Route path="/solicitar-reserva" element={<PublicBookingRequestPage />} />
        </Route>
      )}

      {/* 3. Panel Administrativo Transaccional (Shell Operativo Principal) */}
      <Route element={<AdminLayout />}>
        {/* Ruta raíz redirige a /propiedades */}
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
