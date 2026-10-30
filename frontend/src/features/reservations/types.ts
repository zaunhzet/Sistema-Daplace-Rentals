export type EstadoReserva = 'SOLICITADA' | 'CONFIRMADA' | 'COMPLETADA' | 'CANCELADA' | 'EXPIRADA';

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
  plazoIniciadoEn?: string;
  venceEn?: string;
  politicaPlazoVersion?: string;
  politicaPlazoSnapshot?: Record<string, unknown>;
  avisoProgramadoEn?: string;
  expiradaEn?: string;
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

// ============================================================================
// Tipos DR-02: Contratos de Reserva y Requisitos de Confirmación
// ============================================================================

export type EstadoFirmaContrato = 'REFERENCIADA' | 'VALIDADA' | 'RECHAZADA';

export interface ReservationContract {
  id: string;
  reservaId: string;
  version: number;
  nombreOriginal: string;
  urlReferencia?: string;
  estadoFirma: EstadoFirmaContrato;
  registradoPorId: string;
  registradoPorNombre?: string;
  registradoEn: string;
  validadoPorId?: string;
  validadoPorNombre?: string;
  validadoEn?: string;
  motivoValidacion?: string;
  reemplazaContratoId?: string;
  idempotencyKey?: string;
}

export interface CreateContractDto {
  nombreOriginal: string;
  urlReferencia?: string;
  reemplazaContratoId?: string;
  idempotencyKey?: string;
}

export interface ConfirmationRequirementsResult {
  reservaId: string;
  puedeConfirmar: boolean;
  requisitos: {
    reservaApta: boolean;
    contratoFirmado: boolean;
    pagoRegistrado: boolean;
    evidenciaAdelanto: boolean;
    evidenciaRevisada: boolean;
    adelantoCubierto: boolean;
    adelantoConciliado: boolean; // Informativo para tesorería (no bloqueante comercialmente según Adenda DR-02)
    politicaAdelantoDefinida: boolean;
    disponibilidadValida: boolean;
  };
  motivosPendientes: string[];
  detalles?: {
    montoAcordado?: string;
    totalPagado?: string;
    totalConciliado?: string;
    moneda?: string;
    adelantoRequerido?: string;
    porcentajeAplicado?: number;
    versionPolitica?: string;
    contratosCount?: number;
    pagosCount?: number;
    evidenciasCount?: number;
    evidenciasRevisadasCount?: number;
  };
}
