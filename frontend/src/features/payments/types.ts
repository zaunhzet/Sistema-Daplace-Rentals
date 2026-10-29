/**
 * Daplace Rentals — Módulo de Pagos y Conciliación
 * Tipos de datos, DTOs y filtros (HU-05 / RF05)
 */

export type EstadoPago = 'PENDIENTE_CONCILIACION' | 'CONCILIADO' | 'RECHAZADO';

export type ConceptoPago = 'ADELANTO' | 'SALDO' | 'PAGO_TOTAL' | 'PENALIDAD' | 'OTRO';

export type MetodoPago =
  | 'TRANSFERENCIA'
  | 'TARJETA'
  | 'EFECTIVO'
  | 'BILLETERA_DIGITAL'
  | 'DEPOSITO'
  | 'OTRO';

export interface Payment {
  id: string;
  reservaId: string;
  propiedadId: string;
  propiedadNombre: string;
  huespedId: string;
  huespedNombre: string;
  importe: string; // Exact decimal string, e.g. "500.00"
  moneda: string; // "PEN" | "USD"
  concepto: ConceptoPago;
  metodoPago: MetodoPago;
  referencia: string; // Código de operación / comprobante
  estado: EstadoPago;
  idempotencyKey?: string;
  fechaPago: string; // YYYY-MM-DD
  registradoEn: string; // ISO 8601
  conciliadoEn?: string; // ISO 8601
  conciliadoPor?: string;
  motivoRechazo?: string;
  rechazadoEn?: string; // ISO 8601
  notas?: string;
}

export interface CreatePaymentDto {
  reservaId: string;
  importe: string;
  moneda: string;
  concepto: ConceptoPago;
  metodoPago: MetodoPago;
  referencia: string;
  fechaPago: string;
  idempotencyKey?: string;
  notas?: string;
}

export interface ReconcilePaymentDto {
  referencia?: string;
  notas?: string;
}

export interface RejectPaymentDto {
  motivo: string;
}

export interface ReservationFinancialSummary {
  reservaId: string;
  moneda: string;
  montoAcordado: string;
  totalPagosConciliados: string;
  totalPagosPendientes: string;
  saldoPendiente: string;
  tieneSobrepago: boolean;
  montoSobrepago?: string;
  alertaSobrepago?: string;
}

export interface PaymentFilterParams {
  search?: string;
  propiedadId?: string;
  reservaId?: string;
  estado?: EstadoPago | 'TODOS';
  desde?: string;
  hasta?: string;
}

export interface PaymentValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}
