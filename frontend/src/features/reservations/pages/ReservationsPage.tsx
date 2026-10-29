import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [resData, propsData, guestsData] = await Promise.all([
        reservationService.getReservations(filters),
        propertyService.getProperties(),
        guestService.getGuests(),
      ]);
      setReservations(resData);
      setProperties(propsData);
      setGuests(guestsData);
    } catch (err: unknown) {
      if (err instanceof Error) {
        showError(err.message);
      } else {
        showError('Error al consultar reservas.');
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create
  const handleCreateReservation = async (dto: CreateReservationDto) => {
    const created = await reservationService.createReservation(dto);
    showSuccess(`Solicitud de reserva ${created.id} registrada con éxito.`);
    await loadData();
  };

  // Confirm
  const handleConfirmReservation = async (id: string) => {
    const confirmed = await reservationService.confirmReservation(id);
    showSuccess(`Reserva ${confirmed.id} confirmada. Inventario bloqueado.`);
    if (selectedReservation && selectedReservation.id === id) {
      setSelectedReservation(confirmed);
    }
    await loadData();
  };

  // Cancel
  const handleCancelReservation = async (id: string, motivo: string) => {
    const cancelled = await reservationService.cancelReservation(id, motivo);
    showSuccess(`Reserva ${cancelled.id} cancelada. Disponibilidad liberada.`);
    if (selectedReservation && selectedReservation.id === id) {
      setSelectedReservation(cancelled);
    }
    await loadData();
  };

  // Update Dates
  const handleUpdateDates = async (id: string, dto: UpdateReservationDatesDto) => {
    const updated = await reservationService.updateReservationDates(id, dto);
    showSuccess(`Fechas de reserva ${updated.id} actualizadas a [${updated.ingreso}, ${updated.salida}).`);
    if (selectedReservation && selectedReservation.id === id) {
      setSelectedReservation(updated);
    }
    await loadData();
  };

  // Metrics
  const totalCount = reservations.length;
  const solicitadasCount = reservations.filter((r) => r.estado === 'SOLICITADA').length;
  const confirmadasCount = reservations.filter((r) => r.estado === 'CONFIRMADA').length;
  const completadasCount = reservations.filter((r) => r.estado === 'COMPLETADA').length;
  const canceladasCount = reservations.filter((r) => r.estado === 'CANCELADA').length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
            <span>Gestión Inmobiliaria</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#183b32]">Módulo HU-02 & HU-03</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Gestión de Reservas
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Solicitudes, confirmación y reprogramación de estancias con intervalos [ingreso, salida) y prevención de solape.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#183b32] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#122e27] cursor-pointer"
          >
            <span>+</span> Registrar Solicitud
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="shrink-0 text-emerald-700" aria-hidden="true" />
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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="shrink-0 text-red-700" aria-hidden="true" />
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Total Reservas</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">{totalCount}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Solicitadas</p>
          <p className="mt-1 text-2xl font-bold text-amber-800">{solicitadasCount}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Confirmadas</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{confirmadasCount}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Completadas</p>
          <p className="mt-1 text-2xl font-bold text-blue-800">{completadasCount}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Canceladas</p>
          <p className="mt-1 text-2xl font-bold text-stone-600">{canceladasCount}</p>
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
