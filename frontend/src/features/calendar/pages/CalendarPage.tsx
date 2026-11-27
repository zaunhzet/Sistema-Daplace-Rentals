import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import type { CalendarAgendaData, CalendarDay, MonthOccupancySummary } from '../types';
import type { Property } from '../../properties/types';
import type { Reservation } from '../../reservations/types';
import { calendarService, getMonthName, resolveInitialCalendarDateState } from '../services/calendarService';
import { propertyService } from '../../properties/services/propertyService';
import { reservationService } from '../../reservations/services/reservationService';
import { CalendarGrid } from '../components/CalendarGrid';
import { CalendarWeekView } from '../components/CalendarWeekView';
import { CalendarDayView } from '../components/CalendarDayView';
import { CalendarAgendaView } from '../components/CalendarAgendaView';
import { CalendarLegend } from '../components/CalendarLegend';
import { ReservationDetailModal } from '../../reservations/components/ReservationDetailModal';
import { ReservationDateEditModal } from '../../reservations/components/ReservationDateEditModal';
import { createCalendarPageCoordinator } from '../../reservations/services/reservationPageCoordinator';
import { useAuth } from '../../auth/AuthContext';
import type { UserRole } from '../../auth/types';
import { canAccessPath } from '../../../shared/auth/permissions';
import { loadPersistentState, savePersistentState } from '../../../shared/utils/persistence';

export type CalendarViewMode = 'mes' | 'semana' | 'dia' | 'agenda';

interface PersistentCalendarState {
  propertyId?: string;
  year?: number;
  month?: number;
  viewMode?: CalendarViewMode;
  selectedDate?: string;
}

export const CalendarPage: React.FC = () => {
  let user: { id?: string; email?: string; rol?: string } | null = null;
  try {
    const auth = useAuth();
    user = auth?.session?.user || null;
  } catch {
    user = null;
  }

  const initialPrefs = loadPersistentState<PersistentCalendarState>('calendar_prefs', {}, user);

  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(initialPrefs.propertyId || '');

  const initialDateState = resolveInitialCalendarDateState(initialPrefs);

  const [currentYear, setCurrentYear] = useState<number>(initialDateState.year);
  const [currentMonth, setCurrentMonth] = useState<number>(initialDateState.month);
  const [viewMode, setViewMode] = useState<CalendarViewMode>(initialPrefs.viewMode || 'mes');
  const [selectedDateStr, setSelectedDateStr] = useState<string>(initialDateState.selectedDate);

  const [days, setDays] = useState<CalendarDay[]>([]);
  const [summary, setSummary] = useState<MonthOccupancySummary>({
    totalDays: 0,
    occupiedDays: 0,
    availableDays: 0,
    occupancyRate: 0,
  });
  const [loading, setLoading] = useState(true);

  // Agenda diaria state
  const [agendaPropertyId, setAgendaPropertyId] = useState<string>('TODAS');
  const [agendaData, setAgendaData] = useState<CalendarAgendaData | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [loadingReservationId, setLoadingReservationId] = useState<string | null>(null);
  const agendaSeqRef = useRef(0);
  const agendaDetailSeqRef = useRef(0);

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
      if (props.length > 0) {
        if (!selectedPropertyId || !props.some((p) => p.id === selectedPropertyId)) {
          setSelectedPropertyId(props[0].id);
        }
      }
    } catch {
      // Error handling
    }
  }, [selectedPropertyId]);

  // Persistir selecciones de calendario por usuario/rol
  useEffect(() => {
    savePersistentState(
      'calendar_prefs',
      {
        propertyId: selectedPropertyId,
        year: currentYear,
        month: currentMonth,
        viewMode,
        selectedDate: selectedDateStr,
      },
      user
    );
  }, [selectedPropertyId, currentYear, currentMonth, viewMode, selectedDateStr, user]);

  const selectedReservationRef = React.useRef<Reservation | null>(null);

  useEffect(() => {
    selectedReservationRef.current = selectedReservation;
  }, [selectedReservation]);

  // Invalidate late responses on property or month change and sync detail by ID
  const coordinatorRef = React.useRef(
    createCalendarPageCoordinator(
      {
        getMonthDays: (pid, y, m) => calendarService.getMonthDays(pid, y, m),
        getMonthSummary: (days) => calendarService.getMonthSummary(days),
        getReservationById: (id) => reservationService.getReservationById(id),
      },
      {
        setDays,
        setSummary,
        setLoading,
        getSelectedReservation: () => selectedReservationRef.current,
        setSelectedReservation,
      }
    )
  );

  const loadCalendar = useCallback(async (silent = false) => {
    if (!selectedPropertyId) return;
    await coordinatorRef.current.loadCalendar(selectedPropertyId, currentYear, currentMonth, silent);
  }, [selectedPropertyId, currentYear, currentMonth]);

  const loadAgenda = useCallback(
    async (silent = false) => {
      if (viewMode !== 'agenda') return;
      const seq = ++agendaSeqRef.current;
      if (!silent) {
        setAgendaLoading(true);
      }
      setAgendaError(null);
      try {
        const propFilter = agendaPropertyId === 'TODAS' ? undefined : agendaPropertyId;
        const data = await calendarService.getDailyAgenda(selectedDateStr, propFilter);
        if (seq !== agendaSeqRef.current) return;
        setAgendaData(data);
      } catch (err: unknown) {
        if (seq !== agendaSeqRef.current) return;
        const msg = err instanceof Error ? err.message : 'Error al cargar la agenda diaria.';
        setAgendaError(msg);
      } finally {
        if (seq === agendaSeqRef.current) {
          setAgendaLoading(false);
        }
      }
    },
    [viewMode, selectedDateStr, agendaPropertyId]
  );

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    agendaDetailSeqRef.current += 1;
    setLoadingReservationId(null);

    if (viewMode !== 'agenda') {
      agendaSeqRef.current += 1;
      setAgendaLoading(false);
      setAgendaError(null);
      return;
    }

    let active = true;
    const seq = ++agendaSeqRef.current;
    setAgendaLoading(true);
    setAgendaError(null);

    const propFilter = agendaPropertyId === 'TODAS' ? undefined : agendaPropertyId;
    calendarService
      .getDailyAgenda(selectedDateStr, propFilter)
      .then((data) => {
        if (!active || seq !== agendaSeqRef.current) return;
        setAgendaData(data);
      })
      .catch((err: unknown) => {
        if (!active || seq !== agendaSeqRef.current) return;
        const msg = err instanceof Error ? err.message : 'Error al cargar la agenda diaria.';
        setAgendaError(msg);
      })
      .finally(() => {
        if (active && seq === agendaSeqRef.current) {
          setAgendaLoading(false);
        }
      });

    return () => {
      active = false;
      agendaDetailSeqRef.current += 1;
    };
  }, [viewMode, selectedDateStr, agendaPropertyId]);

  // Refresco al recuperar foco y polling técnico configurable (45s) sin solapes ni consumo en segundo plano
  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState !== 'hidden') {
        if (viewMode === 'agenda') {
          void loadAgenda(true);
        } else {
          void loadCalendar(true);
        }
      }
    };

    window.addEventListener('focus', handleFocus);

    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        if (viewMode === 'agenda') {
          void loadAgenda(true);
        } else {
          void loadCalendar(true);
        }
      }
    }, 45000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [viewMode, loadCalendar, loadAgenda]);

  const shiftDate = (dateStr: string, daysOffset: number): string => {
    const parts = dateStr.split('-');
    const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    dt.setDate(dt.getDate() + daysOffset);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const handlePrev = () => {
    if (viewMode === 'mes') {
      if (currentMonth === 1) {
        setCurrentMonth(12);
        setCurrentYear(currentYear - 1);
        setSelectedDateStr(`${currentYear - 1}-12-01`);
      } else {
        const prevM = currentMonth - 1;
        setCurrentMonth(prevM);
        setSelectedDateStr(`${currentYear}-${String(prevM).padStart(2, '0')}-01`);
      }
    } else if (viewMode === 'semana') {
      const nextDate = shiftDate(selectedDateStr, -7);
      setSelectedDateStr(nextDate);
      const [y, m] = nextDate.split('-').map(Number);
      if (y !== currentYear || m !== currentMonth) {
        setCurrentYear(y);
        setCurrentMonth(m);
      }
    } else {
      const nextDate = shiftDate(selectedDateStr, -1);
      setSelectedDateStr(nextDate);
      const [y, m] = nextDate.split('-').map(Number);
      if (y !== currentYear || m !== currentMonth) {
        setCurrentYear(y);
        setCurrentMonth(m);
      }
    }
  };

  const handleNext = () => {
    if (viewMode === 'mes') {
      if (currentMonth === 12) {
        setCurrentMonth(1);
        setCurrentYear(currentYear + 1);
        setSelectedDateStr(`${currentYear + 1}-01-01`);
      } else {
        const nextM = currentMonth + 1;
        setCurrentMonth(nextM);
        setSelectedDateStr(`${currentYear}-${String(nextM).padStart(2, '0')}-01`);
      }
    } else if (viewMode === 'semana') {
      const nextDate = shiftDate(selectedDateStr, 7);
      setSelectedDateStr(nextDate);
      const [y, m] = nextDate.split('-').map(Number);
      if (y !== currentYear || m !== currentMonth) {
        setCurrentYear(y);
        setCurrentMonth(m);
      }
    } else {
      const nextDate = shiftDate(selectedDateStr, 1);
      setSelectedDateStr(nextDate);
      const [y, m] = nextDate.split('-').map(Number);
      if (y !== currentYear || m !== currentMonth) {
        setCurrentYear(y);
        setCurrentMonth(m);
      }
    }
  };

  const handleGoToday = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = String(now.getDate()).padStart(2, '0');
    setCurrentYear(y);
    setCurrentMonth(m);
    setSelectedDateStr(`${y}-${String(m).padStart(2, '0')}-${d}`);
  };

  const handleAgendaDateChange = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    setSelectedDateStr(value);
    const [y, m] = value.split('-').map(Number);
    if (y !== currentYear || m !== currentMonth) {
      setCurrentYear(y);
      setCurrentMonth(m);
    }
  };

  const handleSelectAgendaReservation = async (reservaId: string) => {
    const seq = ++agendaDetailSeqRef.current;
    setLoadingReservationId(reservaId);
    try {
      const res = await reservationService.getReservationById(reservaId);
      if (seq !== agendaDetailSeqRef.current) return;
      if (!res) {
        setNotification('Error: No se encontró el detalle de la reserva seleccionada.');
        setTimeout(() => setNotification(null), 5000);
        return;
      }
      setSelectedReservation(res);
      setIsDetailOpen(true);
    } catch (err: unknown) {
      if (seq !== agendaDetailSeqRef.current) return;
      const msg = err instanceof Error ? err.message : 'No se pudo cargar el detalle de la reserva.';
      setNotification(`Error: ${msg}`);
      setTimeout(() => setNotification(null), 5000);
    } finally {
      if (seq === agendaDetailSeqRef.current) {
        setLoadingReservationId(null);
      }
    }
  };

  // Actions from modal con manejo estricto de errores y recarga sin falso éxito
  const handleConfirmReservation = async (id: string) => {
    try {
      const confirmed = await reservationService.confirmReservation(id);
      setSelectedReservation(confirmed);
      setNotification(`Reserva ${confirmed.id} confirmada exitosamente.`);
      setTimeout(() => setNotification(null), 4000);
      await loadCalendar();
      if (viewMode === 'agenda') {
        await loadAgenda(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al confirmar la reserva.';
      setNotification(`Error: ${msg}`);
      setTimeout(() => setNotification(null), 6000);
      try {
        await loadCalendar();
        if (viewMode === 'agenda') {
          await loadAgenda(true);
        }
      } catch {
        // Preservar el error original
      }
      throw err;
    }
  };

  const handleCancelReservation = async (id: string, motivo: string) => {
    try {
      const cancelled = await reservationService.cancelReservation(id, motivo);
      setSelectedReservation(cancelled);
      setNotification(`Reserva ${cancelled.id} cancelada. Disponibilidad liberada en calendario.`);
      setTimeout(() => setNotification(null), 4000);
      await loadCalendar();
      if (viewMode === 'agenda') {
        await loadAgenda(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar la reserva.';
      setNotification(`Error: ${msg}`);
      setTimeout(() => setNotification(null), 6000);
      try {
        await loadCalendar();
        if (viewMode === 'agenda') {
          await loadAgenda(true);
        }
      } catch {
        // Preservar el error original
      }
      throw err;
    }
  };

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);
  const inspectedProperty =
    viewMode === 'agenda'
      ? agendaPropertyId === 'TODAS'
        ? undefined
        : properties.find((p) => p.id === agendaPropertyId)
      : selectedProperty;

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
            value={viewMode === 'agenda' ? agendaPropertyId : selectedPropertyId}
            onChange={(e) => {
              if (viewMode === 'agenda') {
                setAgendaPropertyId(e.target.value);
              } else {
                setSelectedPropertyId(e.target.value);
              }
            }}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-stone-900 focus:border-[#183b32] focus:outline-hidden shadow-2xs cursor-pointer"
          >
            {viewMode === 'agenda' && (
              <option value="TODAS">Todas las propiedades</option>
            )}
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
      {inspectedProperty && (!inspectedProperty.activa || inspectedProperty.estadoOperativo !== 'OPERATIVA') && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 flex items-center gap-2.5">
          <AlertCircle size={18} className="shrink-0 text-amber-700" aria-hidden="true" />
          <div>
            <span className="font-bold">Aviso de condición operativa: </span>
            <span className="text-amber-900">
              Inmueble <strong>{inspectedProperty.estadoOperativo}</strong>{' '}
              {!inspectedProperty.activa ? '(Desactivado)' : ''}. Los días reflejan su no disponibilidad.
            </span>
          </div>
        </div>
      )}

      {/* Month/Week/Day Navigator Toolbar & Summary Metrics */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
        {/* Navigation Controls with Lucide Icons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View mode switcher */}
          <div className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-100 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('mes')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'mes'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Mes
            </button>
            <button
              type="button"
              onClick={() => setViewMode('semana')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'semana'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Semana
            </button>
            <button
              type="button"
              onClick={() => setViewMode('dia')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'dia'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Día
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'agenda'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Agenda diaria
            </button>
          </div>

          <div className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50/50 p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Período anterior"
              title="Período anterior"
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
              onClick={handleNext}
              aria-label="Período siguiente"
              title="Período siguiente"
              className="grid size-8 place-items-center rounded-md text-stone-600 hover:bg-white hover:text-stone-900 transition-colors cursor-pointer"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-center gap-2 pl-2">
            <CalendarIcon size={16} className="text-[#5E6C5B]" aria-hidden="true" />
            <span className="text-base sm:text-lg font-bold tracking-tight text-stone-900">
              {viewMode === 'mes' && `${getMonthName(currentMonth)} ${currentYear}`}
              {viewMode === 'semana' && `Semana (${selectedDateStr})`}
              {viewMode === 'dia' && `Día: ${selectedDateStr}`}
              {viewMode === 'agenda' && `Agenda: ${selectedDateStr}`}
            </span>
            {viewMode === 'agenda' && (
              <input
                type="date"
                aria-label="Seleccionar fecha de agenda"
                value={selectedDateStr}
                onChange={(e) => handleAgendaDateChange(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-900 focus:border-[#183b32] focus:outline-hidden cursor-pointer"
              />
            )}
          </div>
        </div>

        {/* Compact Metrics Bar */}
        {viewMode !== 'agenda' && (
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
        )}
      </div>

      {/* Calendar Views */}
      {viewMode === 'agenda' ? (
        <CalendarAgendaView
          fecha={selectedDateStr}
          data={agendaData}
          loading={agendaLoading}
          error={agendaError}
          loadingReservationId={loadingReservationId}
          canInspectCheckout={canAccessPath(user?.rol as UserRole | undefined, '/mantenimiento')}
          onRetry={() => void loadAgenda(false)}
          onSelectReservationId={(reservaId) => void handleSelectAgendaReservation(reservaId)}
        />
      ) : loading ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-16 text-center text-sm text-stone-500">
          Cargando disponibilidad...
        </div>
      ) : (
        <>
          {viewMode === 'mes' && (
            <CalendarGrid
              days={days}
              onSelectReservation={(res) => {
                setSelectedReservation(res);
                setIsDetailOpen(true);
              }}
            />
          )}

          {viewMode === 'semana' && (
            <CalendarWeekView
              days={days}
              selectedDate={selectedDateStr}
              onSelectDate={(d) => setSelectedDateStr(d)}
              onSelectReservation={(res) => {
                setSelectedReservation(res);
                setIsDetailOpen(true);
              }}
            />
          )}

          {viewMode === 'dia' && (
            <CalendarDayView
              days={days}
              selectedDate={selectedDateStr}
              onSelectReservation={(res) => {
                setSelectedReservation(res);
                setIsDetailOpen(true);
              }}
            />
          )}
        </>
      )}

      {/* Legend */}
      {viewMode !== 'agenda' && <CalendarLegend />}

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
          if (viewMode === 'agenda') {
            await loadAgenda(true);
          }
        }}
      />
    </div>
  );
};
