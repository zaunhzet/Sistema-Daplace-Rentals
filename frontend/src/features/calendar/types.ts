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

export interface CalendarAgendaItem {
  reservaId: string;
  codigo?: string;
  propiedadId: string;
  propiedadNombre: string;
  huespedNombre: string;
  estado: 'SOLICITADA' | 'CONFIRMADA' | 'COMPLETADA';
  hora: string | null; // 'HH:mm' o null
}

export interface CalendarAgendaMaintenanceProperty {
  propiedadId: string;
  propiedadNombre: string;
}

export interface CalendarAgendaOpenOrder {
  ordenId: string;
  propiedadId: string;
  propiedadNombre: string;
  titulo: string;
  estado: 'PENDIENTE' | 'EN_PROGRESO';
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';
}

export interface CalendarAgendaMaintenanceSummary {
  propiedadesEnMantenimiento: CalendarAgendaMaintenanceProperty[];
  ordenesAbiertas: CalendarAgendaOpenOrder[];
}

export interface CalendarAgendaData {
  fecha: string; // 'YYYY-MM-DD'
  llegadas: CalendarAgendaItem[];
  salidas: CalendarAgendaItem[];
  mantenimiento: CalendarAgendaMaintenanceSummary | null;
}
