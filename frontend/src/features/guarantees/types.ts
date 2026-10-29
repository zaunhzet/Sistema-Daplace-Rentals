/**
 * Daplace Rentals — Módulo de Control de Garantías
 * Tipos de datos, DTOs y movimientos contables (HU-06 / RF06)
 */

export type EstadoGarantia =
  | 'EN_CUSTODIA'
  | 'PARCIALMENTE_RETENIDA'
  | 'DEVUELTA_TOTAL'
  | 'RETENIDA_TOTAL'
  | 'LIQUIDADA_MIXTA';

export type TipoMovimientoGarantia =
  | 'RECEPCION'
  | 'RETENCION'
  | 'DEVOLUCION_PARCIAL'
  | 'DEVOLUCION_TOTAL';

export interface MovimientoGarantia {
  id: string;
  garantiaId: string;
  tipo: TipoMovimientoGarantia;
  importe: string; // Exact decimal string, siempre valor positivo
  motivo: string;
  documentoSoporte?: string; // Acta de daños, informe de inspección o recibo
  registradoEn: string; // ISO 8601
  registradoPor?: string;
}

export interface Guarantee {
  id: string;
  reservaId: string;
  propiedadId: string;
  propiedadNombre: string;
  huespedId: string;
  huespedNombre: string;
  moneda: string;
  importeRecibido: string; // Monto inicial recibido en custodia
  totalRetenido: string; // Acumulado de retenciones aplicadas
  totalDevuelto: string; // Acumulado de reembolsos efectuados al huésped
  saldoDisponible: string; // importeRecibido - totalRetenido - totalDevuelto
  estado: EstadoGarantia;
  movimientos: MovimientoGarantia[];
  creadaEn: string;
  actualizadaEn: string;
}

export interface CreateGuaranteeDto {
  reservaId: string;
  importe: string;
  moneda: string;
  metodoRecepcion?: string;
  motivo?: string;
}

export interface RegisterGuaranteeMovementDto {
  tipo: 'RETENCION' | 'DEVOLUCION_PARCIAL' | 'DEVOLUCION_TOTAL';
  importe: string;
  motivo: string;
  documentoSoporte?: string;
}

export interface GuaranteeFilterParams {
  search?: string;
  propiedadId?: string;
  reservaId?: string;
  estado?: EstadoGarantia | 'TODOS';
}

export interface GuaranteeValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}
