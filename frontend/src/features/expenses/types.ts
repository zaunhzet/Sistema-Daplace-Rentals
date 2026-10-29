/**
 * Daplace Rentals — Módulo de Gastos Operativos y Trazabilidad Financiera
 * Tipos de datos, DTOs y filtros (HU-07 / Hito 5)
 */

export type EstadoGasto = 'REGISTRADO' | 'APROBADO' | 'ANULADO';

export interface ExpenseEvidence {
  id: string;
  gastoId: string;
  tipo: string;
  nombreArchivo: string;
  url: string;
  origen?: string;
  registradoPor?: string;
  creadoEn: string;
}

export interface Expense {
  id: string;
  propiedadId: string;
  propiedadNombre?: string;
  fechaGasto: string; // YYYY-MM-DD
  periodoMes: number; // 1-12
  periodoAnio: number; // 2026
  titulo: string;
  categoria: string;
  notas?: string;
  monto: string; // "150.00"
  moneda: string; // "PEN"
  pagadoPor: string;
  repartido?: string;
  usoRucDaplace: boolean | null; // true: Sí, false: No, null: Sin información
  estado: EstadoGasto;
  idempotencyKey?: string;
  registradoPor?: string;
  aprobadoPor?: string;
  aprobadoEn?: string;
  anuladoPor?: string;
  anuladoEn?: string;
  motivoAnulacion?: string;
  sustentos: ExpenseEvidence[];
  creadoEn: string;
  actualizadoEn: string;
}

export interface CreateExpenseDto {
  propiedadId: string;
  fechaGasto: string;
  periodoMes: number;
  periodoAnio: number;
  titulo: string;
  categoria: string;
  monto: string;
  moneda?: string;
  pagadoPor: string;
  repartido?: string;
  usoRucDaplace?: boolean | null;
  notas?: string;
  idempotencyKey?: string;
  sustentos?: Array<{
    tipo?: string;
    nombreArchivo: string;
    url: string;
    origen?: string;
  }>;
}

export interface UpdateExpenseDto {
  propiedadId?: string;
  fechaGasto?: string;
  periodoMes?: number;
  periodoAnio?: number;
  titulo?: string;
  categoria?: string;
  monto?: string;
  moneda?: string;
  pagadoPor?: string;
  repartido?: string | null;
  usoRucDaplace?: boolean | null;
  notas?: string | null;
}

export interface CancelExpenseDto {
  motivo: string;
}

export interface AddEvidenceDto {
  tipo?: string;
  nombreArchivo: string;
  url: string;
  origen?: string;
}

export interface ExpenseFilterParams {
  search?: string;
  propiedadId?: string;
  categoria?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  mes?: string | number;
  anio?: string | number;
  pagadoPor?: string;
  estado?: EstadoGasto | 'TODOS';
}

export interface ExpenseValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}
