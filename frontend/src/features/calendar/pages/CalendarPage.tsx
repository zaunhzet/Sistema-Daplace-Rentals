import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import type { CalendarDay, MonthOccupancySummary } from '../types';
import type { Property } from '../../properties/types';
import type { Reservation } from '../../reservations/types';
import { calendarService, getMonthName } from '../services/calendarService';
import { propertyService } from '../../properties/services/propertyService';
import { reservationService } from '../../reservations/services/reservationService';
import { CalendarGrid } from '../components/CalendarGrid';
import { CalendarLegend } from '../components/CalendarLegend';
import { ReservationDetailModal } from '../../reservations/components/ReservationDetailModal';
import { ReservationDateEditModal } from '../../reservations/components/ReservationDateEditModal';

export const CalendarPage: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');

  // Default to November 2026 (target MVP demo timeframe)
  const [currentYear, setCurrentYear] = useState<number>(2026);
  const [currentMonth, setCurrentMonth] = useState<number>(11);

  const [days, setDays] = useState<CalendarDay[]>([]);
  const [summary, setSummary] = useState<MonthOccupancySummary>({
    totalDays: 0,
    occupiedDays: 0,
    availableDays: 0,
    occupancyRate: 0,
  });
  const [loading, setLoading] = useState(true);

  // Modal detail
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditDatesOpen, setIsEditDatesOpen] = useState(false);

  // Feedback notifications
  const [notification, setNotification] = useState<string | null>(null);

  const loadProperties = useCallback(async () => {
    try {
      const props = await propertyService.getProperties();
      setProperties(props);
      if (props.length > 0 && !selectedPropertyId) {
        setSelectedPropertyId(props[0].id);
      }
    } catch {
      // Error handling
    }
  }, [selectedPropertyId]);

  const loadCalendar = useCallback(async () => {
    if (!selectedPropertyId) return;
    try {
      setLoading(true);
      const monthDays = await calendarService.getMonthDays(
        selectedPropertyId,
        currentYear,
        currentMonth
      );
      setDays(monthDays);
      setSummary(calendarService.getMonthSummary(monthDays));
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId, currentYear, currentMonth]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleGoToday = () => {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth() + 1);
  };

  // Actions from modal
  const handleConfirmReservation = async (id: string) => {
    const confirmed = await reservationService.confirmReservation(id);
    setSelectedReservation(confirmed);
    setNotification(`Reserva ${confirmed.id} confirmada exitosamente.`);
    setTimeout(() => setNotification(null), 4000);
    await loadCalendar();
  };

  const handleCancelReservation = async (id: string, motivo: string) => {
    const cancelled = await reservationService.cancelReservation(id, motivo);
    setSelectedReservation(cancelled);
    setNotification(`Reserva ${cancelled.id} cancelada. Disponibilidad liberada en calendario.`);
    setTimeout(() => setNotification(null), 4000);
    await loadCalendar();
  };

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
            <span>Gestión Inmobiliaria</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#183b32]">Módulo HU-01 & RF01</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Calendario de Disponibilidad
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Ocupación en tiempo real por inmueble con intervalos [ingreso, salida) y trazabilidad directa de reservas.
          </p>
        </div>

        {/* Property Selector */}
        <div className="w-full sm:w-72">
          <label htmlFor="calendar-property-select" className="block text-xs font-semibold uppercase tracking-wider text-stone-600 mb-1">
            Seleccionar Propiedad
          </label>
          <select
            id="calendar-property-select"
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm text-stone-900 focus:border-[#183b32] focus:outline-hidden shadow-xs"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} {p.estadoOperativo !== 'OPERATIVA' ? `(${p.estadoOperativo})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notification && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Property Condition Notice */}
      {selectedProperty && (!selectedProperty.activa || selectedProperty.estadoOperativo !== 'OPERATIVA') && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 flex items-center gap-3">
          <AlertCircle size={20} className="shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <p className="font-bold">Aviso de condición operativa</p>
            <p className="mt-0.5 text-amber-900">
              La propiedad está catalogada como <strong>{selectedProperty.estadoOperativo}</strong>{' '}
              {!selectedProperty.activa ? '(Desactivada)' : ''}. Todos los días del calendario reflejan su no disponibilidad operativa.
            </p>
          </div>
        </div>
      )}

      {/* Month Navigator & Summary Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-xs">
        {/* Navigation Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            ← Mes Anterior
          </button>
          <button
            type="button"
            onClick={handleGoToday}
            className="rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            Mes Actual
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            Mes Siguiente →
          </button>
        </div>

        <div className="text-center sm:text-right">
          <span className="text-xl font-bold tracking-tight text-stone-900">
            {getMonthName(currentMonth)} {currentYear}
          </span>
        </div>
      </div>

      {/* Month Metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Días del Mes</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">{summary.totalDays}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Días Ocupados</p>
          <p className="mt-1 text-2xl font-bold text-blue-800">{summary.occupiedDays}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Días Disponibles</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{summary.availableDays}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">Tasa de Ocupación</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">{summary.occupancyRate}%</p>
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-16 text-center text-sm text-stone-500">
          Cargando disponibilidad...
        </div>
      ) : (
        <CalendarGrid
          days={days}
          onSelectReservation={(res) => {
            setSelectedReservation(res);
            setIsDetailOpen(true);
          }}
        />
      )}

      {/* Legend */}
      <CalendarLegend />

      {/* Modals for Direct Reservation Inspection */}
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
        onClose={() => setIsEditDatesOpen(false)}
        onSubmit={async (id, dto) => {
          const updated = await reservationService.updateReservationDates(id, dto);
          setSelectedReservation(updated);
          setNotification(`Fechas actualizadas correctamente.`);
          setTimeout(() => setNotification(null), 4000);
          await loadCalendar();
        }}
      />
    </div>
  );
};
