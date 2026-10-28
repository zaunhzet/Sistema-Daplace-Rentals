export type EstadoReserva = 'SOLICITADA' | 'CONFIRMADA' | 'COMPLETADA' | 'CANCELADA';

export type OrigenReserva = 'WEB' | 'DIRECTO' | 'AIRBNB';

export interface Reservation {
  id: string;
  propiedadId: string;
  propiedadNombre: string;
  huespedId: string;
  huespedNombre: string;
  huespedContacto?: string;
  ingreso: string; // 'YYYY-MM-DD'
  salida: string;  // 'YYYY-MM-DD'
  noches: number;
  estado: EstadoReserva;
  montoAcordado: number;
  moneda: string;  // 'PEN' | 'USD'
  origen: OrigenReserva;
  referenciaCanal?: string;
  notas?: string;
  motivoCancelacion?: string;
  creadaEn: string;
  actualizadaEn: string;
}

export interface CreateReservationDto {
  propiedadId: string;
  huespedId: string;
  ingreso: string;
  salida: string;
  montoAcordado: number;
  moneda?: string;
  origen?: OrigenReserva;
  referenciaCanal?: string;
  notas?: string;
}

export interface UpdateReservationDatesDto {
  ingreso: string;
  salida: string;
  montoAcordado?: number;
  notas?: string;
}

export interface ReservationFilterParams {
  propiedadId?: string;
  huespedId?: string;
  estado?: EstadoReserva | 'TODOS';
  desde?: string;
  hasta?: string;
  search?: string;
}

export interface AvailabilityCheckResult {
  disponible: boolean;
  motivo?: string;
  reservasConflicto?: Reservation[];
}

export interface ReservationValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}
