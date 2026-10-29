/**
 * DAPLACE RENTALS — Contratos Públicos de Consulta y Solicitud de Reserva (HU-01 / HU-02)
 *
 * REGLA DE PRIVACIDAD Y GOBERNANZA:
 * Los tipos públicos excluyen explícitamente cualquier dato privado del propietario
 * (propietarioId, propietarioNombre, email/teléfono de propietarios), información
 * financiera contable privada o notas administrativas internas.
 */

export interface PublicProperty {
  id: string;
  nombre: string;
  direccion: string;
  capacidadHuespedes: number;
  precioBaseNoche: number;
  moneda: string;
  activa: boolean;
}

export interface PublicBookingRequestDto {
  propiedadId: string;
  ingreso: string; // 'YYYY-MM-DD'
  salida: string;  // 'YYYY-MM-DD'
  huespedNombre: string;
  huespedEmail?: string;
  huespedTelefono?: string;
  huespedDocumento?: string;
  observaciones?: string;
}

export interface PublicAvailabilityCheck {
  disponible: boolean;
  noches?: number;
  precioEstimado?: number;
  moneda?: string;
  motivo?: string;
}

export interface PublicBookingResult {
  success: boolean;
  reservaId?: string;
  estado?: 'SOLICITADA';
  propiedadId?: string;
  propiedadNombre?: string;
  ingreso?: string;
  salida?: string;
  noches?: number;
  montoEstimado?: number;
  moneda?: string;
  huespedNombre?: string;
  mensaje: string;
  avisoConfirmacion: string;
}

export interface PublicBookingValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}
