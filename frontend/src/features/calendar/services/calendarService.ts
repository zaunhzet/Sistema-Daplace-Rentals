import type { CalendarDay, DayOccupancyStatus, MonthOccupancySummary } from '../types';
import type { Reservation } from '../../reservations/types';
import { reservationService } from '../../reservations/services/reservationService';
import { propertyService } from '../../properties/services/propertyService';
import { apiClient } from '../../../shared/api/client';
import { isMockMode } from '../../../shared/api/config';

export function formatDateKey(year: number, month: number, day: number): string {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface CalendarDatePreferenceInput {
  year?: unknown;
  month?: unknown;
  selectedDate?: unknown;
}

export interface ResolvedCalendarDateState {
  year: number;
  month: number;
  selectedDate: string;
}

const CALENDAR_MIN_YEAR = 2000;
const CALENDAR_MAX_YEAR = 2100;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarYear(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= CALENDAR_MIN_YEAR &&
    value <= CALENDAR_MAX_YEAR
  );
}

function isValidCalendarMonth(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 12
  );
}

function isValidCalendarDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) {
    return false;
  }
  const [yStr, mStr, dStr] = value.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!isValidCalendarYear(y) || !isValidCalendarMonth(m) || d < 1 || d > 31) {
    return false;
  }
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * Resuelve la fecha civil local actual para inicializar el calendario sin conversión a UTC.
 */
export function getLocalCalendarDateState(now: Date = new Date()): ResolvedCalendarDateState {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return {
    year,
    month,
    selectedDate: formatDateKey(year, month, day),
  };
}

/**
 * Conserva preferencias de fecha válidas y usa la fecha civil actual si faltan o son inválidas.
 */
export function resolveInitialCalendarDateState(
  prefs?: CalendarDatePreferenceInput | null,
  now: Date = new Date()
): ResolvedCalendarDateState {
  if (
    prefs &&
    isValidCalendarYear(prefs.year) &&
    isValidCalendarMonth(prefs.month) &&
    isValidCalendarDateKey(prefs.selectedDate)
  ) {
    return {
      year: prefs.year,
      month: prefs.month,
      selectedDate: prefs.selectedDate,
    };
  }
  return getLocalCalendarDateState(now);
}

export function getMonthName(month: number): string {
  const names = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return names[month - 1] || '';
}

export interface ICalendarService {
  getMonthDays(propiedadId: string, year: number, month: number): Promise<CalendarDay[]>;
  getMonthSummary(days: CalendarDay[]): MonthOccupancySummary;
}

class CalendarService implements ICalendarService {
  public async getMonthDays(
    propiedadId: string,
    year: number,
    month: number
  ): Promise<CalendarDay[]> {
    const [property, allReservations] = await Promise.all([
      propertyService.getPropertyById(propiedadId),
      reservationService.getReservationsByPropertyId(propiedadId),
    ]);

    // Reservas activas bloqueantes (SOLICITADA, CONFIRMADA, COMPLETADA). CANCELADA y EXPIRADA no bloquean.
    const activeReservations = allReservations.filter((r) =>
      ['SOLICITADA', 'CONFIRMADA', 'COMPLETADA'].includes(r.estado)
    );

    const isPropertyInactive = !property || !property.activa || property.estadoOperativo === 'INACTIVA';
    const isPropertyMaintenance = property?.estadoOperativo === 'EN_MANTENIMIENTO';

    const todayStr = new Date().toISOString().slice(0, 10);

    // Días en el mes
    const daysInMonth = new Date(year, month, 0).getDate();

    // Primer día de la semana (1 = Lunes, 7 = Domingo)
    const firstDayIndex = new Date(year, month - 1, 1).getDay();
    const leadingPadding = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Ajuste lunes = 0

    // Días del mes anterior para rellenar
    const prevMonthDays = new Date(year, month - 1, 0).getDate();

    const calendarDays: CalendarDay[] = [];

    // 1. Días previos de padding
    for (let i = leadingPadding - 1; i >= 0; i--) {
      const pDay = prevMonthDays - i;
      const pMonth = month === 1 ? 12 : month - 1;
      const pYear = month === 1 ? year - 1 : year;
      const pDateStr = formatDateKey(pYear, pMonth, pDay);

      calendarDays.push({
        date: pDateStr,
        dayNumber: pDay,
        isCurrentMonth: false,
        isToday: pDateStr === todayStr,
        status: 'DISPONIBLE',
      });
    }

    // 2. Días del mes actual
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateKey(year, month, day);

      if (isPropertyInactive) {
        calendarDays.push({
          date: dateStr,
          dayNumber: day,
          isCurrentMonth: true,
          isToday: dateStr === todayStr,
          status: 'INACTIVA',
        });
        continue;
      }

      if (isPropertyMaintenance) {
        calendarDays.push({
          date: dateStr,
          dayNumber: day,
          isCurrentMonth: true,
          isToday: dateStr === todayStr,
          status: 'MANTENIMIENTO',
        });
        continue;
      }

      // Buscar si este día cubre la noche de alguna reserva: [ingreso, salida)
      const occupyingRes = activeReservations.find(
        (r) => r.ingreso <= dateStr && dateStr < r.salida
      );

      // Buscar si hay check-in y/o check-out en esta fecha
      const checkinRes = activeReservations.find((r) => r.ingreso === dateStr);
      const checkoutRes = activeReservations.find((r) => r.salida === dateStr);

      let status: DayOccupancyStatus = 'DISPONIBLE';
      let mainRes: Reservation | undefined = occupyingRes;

      if (checkoutRes && checkinRes) {
        // Día de transición: sale una reserva y entra otra (consecutivas)
        status = 'TRANSICION';
      } else if (occupyingRes) {
        status = occupyingRes.estado === 'SOLICITADA' ? 'SOLICITADA' : 'CONFIRMADA';
      }

      calendarDays.push({
        date: dateStr,
        dayNumber: day,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        status,
        reservation: mainRes,
        checkinReservation: checkinRes,
        checkoutReservation: checkoutRes,
      });
    }

    // 3. Días posteriores de padding para completar semanas de 7 días
    const totalRendered = calendarDays.length;
    const trailingPadding = (7 - (totalRendered % 7)) % 7;
    for (let day = 1; day <= trailingPadding; day++) {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const nDateStr = formatDateKey(nextYear, nextMonth, day);

      calendarDays.push({
        date: nDateStr,
        dayNumber: day,
        isCurrentMonth: false,
        isToday: nDateStr === todayStr,
        status: 'DISPONIBLE',
      });
    }

    return calendarDays;
  }

  public getMonthSummary(days: CalendarDay[]): MonthOccupancySummary {
    const currentMonthDays = days.filter((d) => d.isCurrentMonth);
    const totalDays = currentMonthDays.length;
    if (totalDays === 0) {
      return { totalDays: 0, occupiedDays: 0, availableDays: 0, occupancyRate: 0 };
    }

    const occupiedDays = currentMonthDays.filter(
      (d) => d.status === 'CONFIRMADA' || d.status === 'SOLICITADA' || d.status === 'TRANSICION'
    ).length;

    const availableDays = currentMonthDays.filter((d) => d.status === 'DISPONIBLE').length;

    const occupancyRate = Math.round((occupiedDays / totalDays) * 100);

    return {
      totalDays,
      occupiedDays,
      availableDays,
      occupancyRate,
    };
  }
}

export { CalendarService as MockCalendarService };

export class ApiCalendarService implements ICalendarService {
  public async getMonthDays(
    propiedadId: string,
    year: number,
    month: number
  ): Promise<CalendarDay[]> {
    const data = await apiClient<{ days: CalendarDay[] }>(
      `/api/calendario?propiedadId=${encodeURIComponent(propiedadId)}&year=${year}&month=${month}`
    );
    return data.days;
  }

  public getMonthSummary(days: CalendarDay[]): MonthOccupancySummary {
    const currentMonthDays = days.filter((d) => d.isCurrentMonth);
    const totalDays = currentMonthDays.length;
    if (totalDays === 0) {
      return { totalDays: 0, occupiedDays: 0, availableDays: 0, occupancyRate: 0 };
    }

    const occupiedDays = currentMonthDays.filter(
      (d) => d.status === 'CONFIRMADA' || d.status === 'SOLICITADA' || d.status === 'TRANSICION'
    ).length;

    const availableDays = currentMonthDays.filter((d) => d.status === 'DISPONIBLE').length;
    const occupancyRate = Math.round((occupiedDays / totalDays) * 100);

    return {
      totalDays,
      occupiedDays,
      availableDays,
      occupancyRate,
    };
  }
}

export const calendarService: ICalendarService = isMockMode()
  ? new CalendarService()
  : new ApiCalendarService();
