import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
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
    <div className="w-full space-y-4">
      {/* Header & Property Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            Calendario de Disponibilidad
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            Ocupación en tiempo real por inmueble con intervalos [ingreso, salida) y trazabilidad de reservas.
          </p>
        </div>

        {/* Property Selector */}
        <div className="w-full sm:w-64">
          <label htmlFor="calendar-property-select" className="sr-only">
            Seleccionar Propiedad
          </label>
          <select
            id="calendar-property-select"
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-stone-900 focus:border-[#183b32] focus:outline-hidden shadow-2xs cursor-pointer"
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="shrink-0 text-emerald-700" aria-hidden="true" />
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
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 flex items-center gap-2.5">
          <AlertCircle size={18} className="shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <span className="font-bold">Aviso de condición operativa: </span>
            <span className="text-amber-900">
              Inmueble <strong>{selectedProperty.estadoOperativo}</strong>{' '}
              {!selectedProperty.activa ? '(Desactivado)' : ''}. Los días reflejan su no disponibilidad.
            </span>
          </div>
        </div>
      )}

      {/* Month Navigator Toolbar & Summary Metrics */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
        {/* Navigation Controls with Lucide Icons */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50/50 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Mes anterior"
              title="Mes anterior"
              className="grid size-8 place-items-center rounded-md text-stone-600 hover:bg-white hover:text-stone-900 transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleGoToday}
              className="px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-white rounded-md transition-colors cursor-pointer"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Mes siguiente"
              title="Mes siguiente"
              className="grid size-8 place-items-center rounded-md text-stone-600 hover:bg-white hover:text-stone-900 transition-colors cursor-pointer"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-2 pl-2">
            <CalendarIcon size={16} className="text-[#5E6C5B]" aria-hidden="true" />
            <span className="text-base sm:text-lg font-bold tracking-tight text-stone-900">
              {getMonthName(currentMonth)} {currentYear}
            </span>
          </div>
        </div>

        {/* Compact Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-3 text-xs">
          <div className="rounded-lg bg-stone-50 border border-stone-200/60 px-3 py-1.5 flex items-center justify-between sm:flex-col sm:items-start sm:justify-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Días Mes</span>
            <span className="font-bold text-sm sm:text-base text-stone-900">{summary.totalDays}</span>
          </div>
          <div className="rounded-lg bg-blue-50/60 border border-blue-200/60 px-3 py-1.5 flex items-center justify-between sm:flex-col sm:items-start sm:justify-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Ocupados</span>
            <span className="font-bold text-sm sm:text-base text-blue-900">{summary.occupiedDays}</span>
          </div>
          <div className="rounded-lg bg-emerald-50/60 border border-emerald-200/60 px-3 py-1.5 flex items-center justify-between sm:flex-col sm:items-start sm:justify-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Disponibles</span>
            <span className="font-bold text-sm sm:text-base text-emerald-900">{summary.availableDays}</span>
          </div>
          <div className="rounded-lg bg-stone-50 border border-stone-200/60 px-3 py-1.5 flex items-center justify-between sm:flex-col sm:items-start sm:justify-center">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-600">Ocupación</span>
            <span className="font-bold text-sm sm:text-base text-stone-900">{summary.occupancyRate}%</span>
          </div>
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
