import { Routes, Route, Navigate } from 'react-router';
import { AdminLayout } from './AdminLayout';
import { PropertiesPage } from '../features/properties';
import { GuestsPage } from '../features/guests';
import { ReservationsPage } from '../features/reservations';
import { CalendarPage } from '../features/calendar';
import { PaymentsPage } from '../features/payments';
import { GuaranteesPage } from '../features/guarantees';
import { PendingModuleView } from './PendingModuleView';
import { NotFoundPage } from './NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        {/* Default route redirects to /propiedades while Dashboard is pending */}
        <Route index element={<Navigate to="/propiedades" replace />} />

        {/* Operational Modules (André) */}
        <Route path="/propiedades" element={<PropertiesPage />} />
        <Route path="/huespedes" element={<GuestsPage />} />
        <Route path="/reservas" element={<ReservationsPage />} />
        <Route path="/calendario" element={<CalendarPage />} />
        <Route path="/pagos" element={<PaymentsPage />} />
        <Route path="/garantias" element={<GuaranteesPage />} />

        {/* Reserved / Pending Modules (Diego & Shared) */}
        <Route path="/dashboard" element={<PendingModuleView path="/dashboard" />} />
        <Route path="/reportes" element={<PendingModuleView path="/reportes" />} />
        <Route path="/login" element={<PendingModuleView path="/login" />} />
        <Route path="/personal" element={<PendingModuleView path="/personal" />} />
        <Route path="/mantenimiento" element={<PendingModuleView path="/mantenimiento" />} />

        {/* 404 Fallback for unknown routes */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
