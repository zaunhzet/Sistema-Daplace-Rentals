import type {
  CreateGuaranteeDto,
  Guarantee,
  GuaranteeFilterParams,
  GuaranteeValidationResult,
  MovimientoGarantia,
  RegisterGuaranteeMovementDto,
} from '../types';
import { INITIAL_GUARANTEES_MOCK } from './mockGuarantees';
import { reservationService } from '../../reservations';
import {
  fromCents,
  toCents,
  validateMoneyInput,
} from '../../../shared/money';

export function validateGuaranteePayload(dto: Partial<CreateGuaranteeDto>): GuaranteeValidationResult {
  const errors: Record<string, string> = {};

  if (!dto.reservaId || dto.reservaId.trim() === '') {
    errors.reservaId = 'Debe seleccionar una reserva válida.';
  }

  const moneyValidation = validateMoneyInput(dto.importe || '');
  if (!moneyValidation.isValid) {
    errors.importe = moneyValidation.error || 'Importe inválido.';
  }

  if (!dto.moneda || (dto.moneda !== 'PEN' && dto.moneda !== 'USD')) {
    errors.moneda = 'La moneda debe ser PEN o USD.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface IGuaranteeService {
  getGuarantees(filters?: GuaranteeFilterParams): Promise<Guarantee[]>;
  getGuaranteeById(id: string): Promise<Guarantee | null>;
  getGuaranteeByReservationId(reservaId: string): Promise<Guarantee | null>;
  createGuarantee(dto: CreateGuaranteeDto): Promise<Guarantee>;
  registerMovement(garantiaId: string, dto: RegisterGuaranteeMovementDto): Promise<Guarantee>;
  reset(): void;
}

class MockGuaranteeService implements IGuaranteeService {
  private guarantees: Guarantee[] = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.guarantees = JSON.parse(JSON.stringify(INITIAL_GUARANTEES_MOCK));
  }

  public async getGuarantees(filters?: GuaranteeFilterParams): Promise<Guarantee[]> {
    let result = [...this.guarantees];

    if (filters?.propiedadId && filters.propiedadId !== 'TODAS') {
      result = result.filter((g) => g.propiedadId === filters.propiedadId);
    }

    if (filters?.reservaId && filters.reservaId !== 'TODAS') {
      result = result.filter((g) => g.reservaId === filters.reservaId);
    }

    if (filters?.estado && filters.estado !== 'TODOS') {
      result = result.filter((g) => g.estado === filters.estado);
    }

    if (filters?.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        (g) =>
          g.id.toLowerCase().includes(q) ||
          g.reservaId.toLowerCase().includes(q) ||
          g.propiedadNombre.toLowerCase().includes(q) ||
          g.huespedNombre.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  }

  public async getGuaranteeById(id: string): Promise<Guarantee | null> {
    const guarantee = this.guarantees.find((g) => g.id === id);
    return guarantee ? JSON.parse(JSON.stringify(guarantee)) : null;
  }

  public async getGuaranteeByReservationId(reservaId: string): Promise<Guarantee | null> {
    const guarantee = this.guarantees.find((g) => g.reservaId === reservaId);
    return guarantee ? JSON.parse(JSON.stringify(guarantee)) : null;
  }

  /**
   * Registra una nueva garantía asociada a una reserva.
   * Reglas de negocio obligatorias:
   * 1. Máximo una garantía por reserva (política de referencia del modelo mock).
   * 2. No se mezclan garantías con ingresos de alquiler.
   * 3. Se genera de inmediato el movimiento inmutable de RECEPCION.
   */
  public async createGuarantee(dto: CreateGuaranteeDto): Promise<Guarantee> {
    const validation = validateGuaranteePayload(dto);
    if (!validation.isValid) {
      const errorMsg = Object.values(validation.errors).join(' ');
      throw new Error(`Validación de garantía fallida: ${errorMsg}`);
    }

    // 1. Verificar reserva
    const reservation = await reservationService.getReservationById(dto.reservaId);
    if (!reservation) {
      throw new Error(`La reserva con ID "${dto.reservaId}" no existe.`);
    }

    // 2. Modelo de referencia: máximo una garantía por reserva
    const existing = this.guarantees.find((g) => g.reservaId === dto.reservaId);
    if (existing) {
      throw new Error(
        `Política mock: Ya existe una garantía registrada para la reserva "${dto.reservaId}" (${existing.id}). No se admite segunda garantía bajo el modelo actual.`
      );
    }

    const importeRecibidoStr = fromCents(toCents(dto.importe));
    const nowIso = new Date().toISOString();
    const garantiaId = `gar-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

    const initialMovement: MovimientoGarantia = {
      id: `mov-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      garantiaId,
      tipo: 'RECEPCION',
      importe: importeRecibidoStr,
      motivo: dto.motivo?.trim() || 'Depósito de garantía recibido en custodia previo o al inicio de la estancia.',
      documentoSoporte: dto.metodoRecepcion ? `Recepción vía ${dto.metodoRecepcion}` : undefined,
      registradoEn: nowIso,
      registradoPor: 'Operador / Administrador',
    };

    const newGuarantee: Guarantee = {
      id: garantiaId,
      reservaId: reservation.id,
      propiedadId: reservation.propiedadId,
      propiedadNombre: reservation.propiedadNombre,
      huespedId: reservation.huespedId,
      huespedNombre: reservation.huespedNombre,
      moneda: dto.moneda,
      importeRecibido: importeRecibidoStr,
      totalRetenido: '0.00',
      totalDevuelto: '0.00',
      saldoDisponible: importeRecibidoStr,
      estado: 'EN_CUSTODIA',
      movimientos: [initialMovement],
      creadaEn: nowIso,
      actualizadaEn: nowIso,
    };

    this.guarantees.unshift(newGuarantee);
    return JSON.parse(JSON.stringify(newGuarantee));
  }

  /**
   * Registra un nuevo movimiento en la garantía (RETENCION, DEVOLUCION_PARCIAL, DEVOLUCION_TOTAL).
   * Reglas de negocio obligatorias:
   * 1. Las devoluciones y retenciones NO pueden superar el saldo disponible.
   * 2. Todos los movimientos se registran con valores positivos; el tipo dicta el efecto.
   * 3. No se editan movimientos anteriores (inmutabilidad y trazabilidad estricta).
   * 4. No se ejecutan devoluciones automáticas por cancelación de reserva (política pendiente).
   */
  public async registerMovement(
    garantiaId: string,
    dto: RegisterGuaranteeMovementDto
  ): Promise<Guarantee> {
    const index = this.guarantees.findIndex((g) => g.id === garantiaId);
    if (index === -1) {
      throw new Error(`La garantía con ID "${garantiaId}" no fue encontrada.`);
    }

    const current = this.guarantees[index];
    const moneyValidation = validateMoneyInput(dto.importe);
    if (!moneyValidation.isValid) {
      throw new Error(`Importe de movimiento inválido: ${moneyValidation.error}`);
    }

    const motivo = dto.motivo?.trim();
    if (!motivo || motivo.length < 3) {
      throw new Error('Debe especificar un motivo detallado para el movimiento (mínimo 3 caracteres).');
    }

    const importeMovimientoCents = moneyValidation.cents;
    const saldoDisponibleCents = toCents(current.saldoDisponible);

    // Validación estricta: No exceder saldo disponible
    if (importeMovimientoCents > saldoDisponibleCents) {
      throw new Error(
        `Operación rechazada: El importe solicitado (${fromCents(importeMovimientoCents)} ${current.moneda}) excede el saldo disponible en custodia (${fromCents(saldoDisponibleCents)} ${current.moneda}).`
      );
    }

    const nowIso = new Date().toISOString();
    const newMovement: MovimientoGarantia = {
      id: `mov-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      garantiaId: current.id,
      tipo: dto.tipo,
      importe: fromCents(importeMovimientoCents),
      motivo,
      documentoSoporte: dto.documentoSoporte?.trim(),
      registradoEn: nowIso,
      registradoPor: 'Operador / Auditor',
    };

    // Historial inmutable append-only
    const updatedMovimientos = [...current.movimientos, newMovement];

    // Recalcular saldos derivados exclusivamente a partir de movimientos
    let totalRetenidoCents = 0;
    let totalDevueltoCents = 0;

    for (const mov of updatedMovimientos) {
      if (mov.tipo === 'RETENCION') {
        totalRetenidoCents += toCents(mov.importe);
      } else if (mov.tipo === 'DEVOLUCION_PARCIAL' || mov.tipo === 'DEVOLUCION_TOTAL') {
        totalDevueltoCents += toCents(mov.importe);
      }
    }

    const importeRecibidoCents = toCents(current.importeRecibido);
    const nuevoSaldoDisponibleCents = Math.max(
      0,
      importeRecibidoCents - totalRetenidoCents - totalDevueltoCents
    );

    // Determinación de estado operativo
    let nuevoEstado: Guarantee['estado'] = 'EN_CUSTODIA';
    if (nuevoSaldoDisponibleCents === 0) {
      if (totalRetenidoCents > 0 && totalDevueltoCents === 0) {
        nuevoEstado = 'RETENIDA_TOTAL';
      } else if (totalDevueltoCents > 0 && totalRetenidoCents === 0) {
        nuevoEstado = 'DEVUELTA_TOTAL';
      } else {
        nuevoEstado = 'RETENIDA_TOTAL'; // Caso mixto cerrado
      }
    } else {
      if (totalRetenidoCents > 0) {
        nuevoEstado = 'PARCIALMENTE_RETENIDA';
      } else {
        nuevoEstado = 'EN_CUSTODIA';
      }
    }

    const updated: Guarantee = {
      ...current,
      totalRetenido: fromCents(totalRetenidoCents),
      totalDevuelto: fromCents(totalDevueltoCents),
      saldoDisponible: fromCents(Math.max(0, nuevoSaldoDisponibleCents)),
      estado: nuevoEstado,
      movimientos: updatedMovimientos,
      actualizadaEn: nowIso,
    };

    this.guarantees[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }
}

export const guaranteeService: IGuaranteeService = new MockGuaranteeService();
