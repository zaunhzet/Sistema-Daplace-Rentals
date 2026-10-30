import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Plus } from 'lucide-react';
import type {
  CreateReservationDto,
  Reservation,
  ReservationFilterParams,
  UpdateReservationDatesDto,
} from '../types';
import type { Property } from '../../properties/types';
import type { Guest } from '../../guests/types';
import { reservationService } from '../services/reservationService';
import { propertyService } from '../../properties/services/propertyService';
import { guestService } from '../../guests/services/guestService';
import { ReservationFilters } from '../components/ReservationFilters';
import { ReservationList } from '../components/ReservationList';
import { ReservationFormModal } from '../components/ReservationFormModal';
import { ReservationDetailModal } from '../components/ReservationDetailModal';
import { ReservationDateEditModal } from '../components/ReservationDateEditModal';
import { createReservationsPageCoordinator } from '../services/reservationPageCoordinator';

export const ReservationsPage: React.FC = () => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filters, setFilters] = useState<ReservationFilterParams>({
    propiedadId: 'TODAS',
    huespedId: 'TODOS',
    estado: 'TODOS',
    search: '',
  });

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditDatesOpen, setIsEditDatesOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);

  // Notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 7000);
  };

  const selectedReservationRef = React.useRef<Reservation | null>(null);

  useEffect(() => {
    selectedReservationRef.current = selectedReservation;
  }, [selectedReservation]);

  const coordinatorRef = React.useRef(
    createReservationsPageCoordinator(
      {
        getReservations: (f) => reservationService.getReservations(f),
        getProperties: () => propertyService.getProperties(),
        getGuests: () => guestService.getGuests(),
        getReservationById: (id) => reservationService.getReservationById(id),
      },
      {
        setReservations,
        setProperties,
        setGuests,
        setSelectedReservation,
        setLoading,
        showError,
        getSelectedReservation: () => selectedReservationRef.current,
      }
    )
  );

  const loadData = useCallback(async (silent = false) => {
    await coordinatorRef.current.loadData(filters, silent);
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresco al recuperar foco y polling técnico configurable (45s) sin solapes ni consumo en segundo plano
  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState !== 'hidden') {
        void loadData(true);
      }
    };

    window.addEventListener('focus', handleFocus);

    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void loadData(true);
      }
    }, 45000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [loadData]);

  // Create
  const handleCreateReservation = async (dto: CreateReservationDto) => {
    try {
      const created = await reservationService.createReservation(dto);
      showSuccess(`Solicitud de reserva ${created.id} registrada con éxito.`);
      await loadData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        showError(err.message);
      } else {
        showError('Error al registrar la solicitud.');
      }
      try {
        await loadData(true);
      } catch {
        // Preservar el error original sin sustituirlo por fallos secundarios de recarga
      }
      throw err;
    }
  };

  // Confirm
  const handleConfirmReservation = async (id: string) => {
    try {
      const confirmed = await reservationService.confirmReservation(id);
      showSuccess(`Reserva ${confirmed.id} confirmada. Inventario bloqueado.`);
      if (selectedReservation && selectedReservation.id === id) {
        setSelectedReservation(confirmed);
      }
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al confirmar la reserva.';
      showError(msg);
      // Tras 409 temporal o rechazo, recargar información y conservar el error visible
      try {
        await loadData(true);
      } catch {
        // Preservar el error original
      }
      throw err;
    }
  };

  // Cancel
  const handleCancelReservation = async (id: string, motivo: string) => {
    try {
      const cancelled = await reservationService.cancelReservation(id, motivo);
      showSuccess(`Reserva ${cancelled.id} cancelada. Disponibilidad liberada.`);
      if (selectedReservation && selectedReservation.id === id) {
        setSelectedReservation(cancelled);
      }
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar la reserva.';
      showError(msg);
      try {
        await loadData(true);
      } catch {
        // Preservar el error original
      }
      throw err;
    }
  };

  // Update Dates
  const handleUpdateDates = async (id: string, dto: UpdateReservationDatesDto) => {
    try {
      const updated = await reservationService.updateReservationDates(id, dto);
      showSuccess(`Fechas de reserva ${updated.id} actualizadas a [${updated.ingreso}, ${updated.salida}).`);
      if (selectedReservation && selectedReservation.id === id) {
        setSelectedReservation(updated);
      }
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar fechas.';
      showError(msg);
      try {
        await loadData(true);
      } catch {
        // Preservar el error original
      }
      throw err;
    }
  };

  // Metrics
  const totalCount = reservations.length;
  const solicitadasCount = reservations.filter((r) => r.estado === 'SOLICITADA').length;
  const confirmadasCount = reservations.filter((r) => r.estado === 'CONFIRMADA').length;
  const completadasCount = reservations.filter((r) => r.estado === 'COMPLETADA').length;
  const canceladasCount = reservations.filter((r) => r.estado === 'CANCELADA').length;
  const expiradasCount = reservations.filter((r) => r.estado === 'EXPIRADA').length;

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            Gestión de Reservas
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            Solicitudes, confirmación y reprogramación de estancias con intervalos [ingreso, salida) y prevención de solape.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#183b32] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-2xs hover:bg-[#122e27] transition-colors cursor-pointer"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Registrar Solicitud</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-red-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-700" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-bold text-red-800 hover:text-red-950 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Total Reservas</p>
          <p className="mt-0.5 text-xl font-bold text-stone-900">{totalCount}</p>
        </div>
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Solicitadas</p>
          <p className="mt-0.5 text-xl font-bold text-amber-800">{solicitadasCount}</p>
        </div>
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Confirmadas</p>
          <p className="mt-0.5 text-xl font-bold text-emerald-800">{confirmadasCount}</p>
        </div>
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Completadas</p>
          <p className="mt-0.5 text-xl font-bold text-blue-800">{completadasCount}</p>
        </div>
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Canceladas</p>
          <p className="mt-0.5 text-xl font-bold text-stone-700">{canceladasCount}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">Expiradas</p>
          <p className="mt-0.5 text-xl font-bold text-rose-800">{expiradasCount}</p>
        </div>
      </div>

      {/* Filter Component */}
      <ReservationFilters
        filters={filters}
        properties={properties}
        guests={guests}
        onFilterChange={setFilters}
        onReset={() =>
          setFilters({
            propiedadId: 'TODAS',
            huespedId: 'TODOS',
            estado: 'TODOS',
            search: '',
          })
        }
      />

      {/* List Component */}
      {loading ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center text-sm text-stone-500">
          Cargando reservas...
        </div>
      ) : (
        <ReservationList
          reservations={reservations}
          onViewDetail={(r) => {
            setSelectedReservation(r);
            setIsDetailOpen(true);
          }}
          onOpenEditDates={(r) => {
            setSelectedReservation(r);
            setIsEditDatesOpen(true);
          }}
          onConfirm={handleConfirmReservation}
          onCreateNew={() => setIsFormOpen(true)}
        />
      )}

      {/* Modals */}
      <ReservationFormModal
        isOpen={isFormOpen}
        properties={properties}
        guests={guests}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreateReservation}
      />

      <ReservationDetailModal
        reservation={selectedReservation}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedReservation(null);
        }}
        onConfirm={handleConfirmReservation}
        onCancel={handleCancelReservation}
        onOpenEditDates={(r) => {
          setSelectedReservation(r);
          setIsEditDatesOpen(true);
        }}
      />

      <ReservationDateEditModal
        reservation={selectedReservation}
        isOpen={isEditDatesOpen}
        onClose={() => {
          setIsEditDatesOpen(false);
        }}
        onSubmit={handleUpdateDates}
      />
    </div>
  );
};
