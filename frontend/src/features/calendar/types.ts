import type { Reservation } from '../reservations/types';

export type DayOccupancyStatus =
  | 'DISPONIBLE'
  | 'CONFIRMADA'
  | 'SOLICITADA'
  | 'TRANSICION' // Día en que una reserva sale y otra entra (consecutivas)
  | 'MANTENIMIENTO'
  | 'INACTIVA';

export interface CalendarDay {
  date: string; // 'YYYY-MM-DD'
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  status: DayOccupancyStatus;
  reservation?: Reservation;
  checkinReservation?: Reservation;
  checkoutReservation?: Reservation;
}

export interface MonthOccupancySummary {
  totalDays: number;
  occupiedDays: number;
  availableDays: number;
  occupancyRate: number; // Porcentaje 0 - 100
}
