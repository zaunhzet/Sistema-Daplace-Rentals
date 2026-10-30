export type TipoDocumento = 'DNI' | 'PASAPORTE' | 'CARNET_EXTRANJERIA' | 'OTRO';

export type EstadoReserva = 'SOLICITADA' | 'CONFIRMADA' | 'COMPLETADA' | 'CANCELADA' | 'EXPIRADA';

export interface ReservaRelacionada {
  id: string;
  propiedadId: string;
  propiedadNombre: string;
  ingreso: string;
  salida: string;
  estado: EstadoReserva;
  montoTotal: string;
  moneda: string;
}

export interface Guest {
  id: string;
  nombreCompleto: string;
  telefono: string;
  email: string;
  tipoDocumento?: TipoDocumento;
  numeroDocumento?: string;
  nacionalidad?: string;
  notas?: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface GuestWithReservations extends Guest {
  reservasRelacionadas: ReservaRelacionada[];
}

export interface CreateGuestDto {
  nombreCompleto: string;
  telefono?: string;
  email?: string;
  tipoDocumento?: TipoDocumento;
  numeroDocumento?: string;
  nacionalidad?: string;
  notas?: string;
}

export interface UpdateGuestDto {
  nombreCompleto?: string;
  telefono?: string;
  email?: string;
  tipoDocumento?: TipoDocumento;
  numeroDocumento?: string;
  nacionalidad?: string;
  notas?: string;
}

export interface GuestFilterParams {
  search?: string;
}

export type GuestFilters = GuestFilterParams;

export interface GuestValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}
