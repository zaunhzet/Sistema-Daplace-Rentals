import type {
  CreatePaymentDto,
  Payment,
  PaymentFilterParams,
  PaymentValidationResult,
  ReconcilePaymentDto,
  RejectPaymentDto,
  ReservationFinancialSummary,
} from '../types';
import { INITIAL_PAYMENTS_MOCK } from './mockPayments';
import { reservationService } from '../../reservations';
import {
  adaptReservationAmount,
  fromCents,
  toCents,
  validateMoneyInput,
} from '../../../shared/money';

export function validatePaymentPayload(dto: Partial<CreatePaymentDto>): PaymentValidationResult {
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

  if (!dto.concepto) {
    errors.concepto = 'Debe indicar el concepto del abono (ADELANTO, SALDO, etc.).';
  }

  if (!dto.metodoPago) {
    errors.metodoPago = 'Debe especificar el medio o método de pago empleado.';
  }

  if (!dto.referencia || dto.referencia.trim().length < 2) {
    errors.referencia = 'La referencia o código de operación es obligatoria (mínimo 2 caracteres).';
  }

  if (!dto.fechaPago || !/^\d{4}-\d{2}-\d{2}$/.test(dto.fechaPago.trim())) {
    errors.fechaPago = 'La fecha de abono es requerida con formato YYYY-MM-DD.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface IPaymentService {
  getPayments(filters?: PaymentFilterParams): Promise<Payment[]>;
  getPaymentById(id: string): Promise<Payment | null>;
  getPaymentsByReservationId(reservaId: string): Promise<Payment[]>;
  getReservationFinancialSummary(reservaId: string): Promise<ReservationFinancialSummary>;
  createPayment(dto: CreatePaymentDto): Promise<Payment>;
  reconcilePayment(id: string, dto?: ReconcilePaymentDto): Promise<Payment>;
  rejectPayment(id: string, dto: RejectPaymentDto): Promise<Payment>;
  reset(): void;
}

class MockPaymentService implements IPaymentService {
  private payments: Payment[] = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.payments = JSON.parse(JSON.stringify(INITIAL_PAYMENTS_MOCK));
  }

  public async getPayments(filters?: PaymentFilterParams): Promise<Payment[]> {
    let result = [...this.payments];

    if (filters?.propiedadId && filters.propiedadId !== 'TODAS') {
      result = result.filter((p) => p.propiedadId === filters.propiedadId);
    }

    if (filters?.reservaId && filters.reservaId !== 'TODAS') {
      result = result.filter((p) => p.reservaId === filters.reservaId);
    }

    if (filters?.estado && filters.estado !== 'TODOS') {
      result = result.filter((p) => p.estado === filters.estado);
    }

    if (filters?.desde) {
      result = result.filter((p) => p.fechaPago >= filters.desde!);
    }

    if (filters?.hasta) {
      result = result.filter((p) => p.fechaPago <= filters.hasta!);
    }

    if (filters?.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.id.toLowerCase().includes(q) ||
          p.reservaId.toLowerCase().includes(q) ||
          p.propiedadNombre.toLowerCase().includes(q) ||
          p.huespedNombre.toLowerCase().includes(q) ||
          p.referencia.toLowerCase().includes(q) ||
          p.concepto.toLowerCase().includes(q)
      );
    }

    // Orden cronológico descendente (más recientes primero)
    return result.sort((a, b) => b.registradoEn.localeCompare(a.registradoEn));
  }

  public async getPaymentById(id: string): Promise<Payment | null> {
    const payment = this.payments.find((p) => p.id === id);
    return payment ? JSON.parse(JSON.stringify(payment)) : null;
  }

  public async getPaymentsByReservationId(reservaId: string): Promise<Payment[]> {
    return this.payments
      .filter((p) => p.reservaId === reservaId)
      .sort((a, b) => b.registradoEn.localeCompare(a.registradoEn));
  }

  /**
   * Resumen de saldo y conciliación de una reserva.
   * Regla de negocio crítica:
   * Solo los pagos con estado 'CONCILIADO' reducen la deuda pendiente de alquiler.
   * Los pagos 'PENDIENTE_CONCILIACION' y 'RECHAZADO' no generan ingreso validado.
   * No se mezclan fondos de garantías en el cálculo del alquiler.
   */
  public async getReservationFinancialSummary(reservaId: string): Promise<ReservationFinancialSummary> {
    const reservation = await reservationService.getReservationById(reservaId);
    if (!reservation) {
      throw new Error(`La reserva con ID "${reservaId}" no existe.`);
    }

    const reservationPayments = this.payments.filter((p) => p.reservaId === reservaId);

    // Adaptador provisional para montoAcordado numérico
    const montoAcordadoStr = adaptReservationAmount(reservation.montoAcordado);
    const montoAcordadoCents = toCents(montoAcordadoStr);

    let totalConciliadoCents = 0;
    let totalPendienteCents = 0;

    for (const payment of reservationPayments) {
      if (payment.estado === 'CONCILIADO') {
        totalConciliadoCents += toCents(payment.importe);
      } else if (payment.estado === 'PENDIENTE_CONCILIACION') {
        totalPendienteCents += toCents(payment.importe);
      }
    }

    const saldoPendienteCents = Math.max(0, montoAcordadoCents - totalConciliadoCents);
    const tieneSobrepago = totalConciliadoCents > montoAcordadoCents;
    const montoSobrepagoCents = tieneSobrepago ? totalConciliadoCents - montoAcordadoCents : 0;

    return {
      reservaId,
      moneda: reservation.moneda || 'PEN',
      montoAcordado: montoAcordadoStr,
      totalPagosConciliados: fromCents(totalConciliadoCents),
      totalPagosPendientes: fromCents(totalPendienteCents),
      saldoPendiente: fromCents(saldoPendienteCents),
      tieneSobrepago,
      montoSobrepago: tieneSobrepago ? fromCents(montoSobrepagoCents) : undefined,
      alertaSobrepago: tieneSobrepago
        ? `Atención: Los abonos conciliados superan el monto pactado por ${fromCents(montoSobrepagoCents)} ${reservation.moneda}. Política de sobrepagos pendiente de decisión institucional.`
        : undefined,
    };
  }

  /**
   * Registra un nuevo abono o adelanto en estado inicial PENDIENTE_CONCILIACION.
   * Implementa soporte de idempotencia por clave única.
   */
  public async createPayment(dto: CreatePaymentDto): Promise<Payment> {
    const validation = validatePaymentPayload(dto);
    if (!validation.isValid) {
      const errorMsg = Object.values(validation.errors).join(' ');
      throw new Error(`Validación de pago fallida: ${errorMsg}`);
    }

    // 1. Verificar reserva existente
    const reservation = await reservationService.getReservationById(dto.reservaId);
    if (!reservation) {
      throw new Error(`La reserva indicada con ID "${dto.reservaId}" no existe en el sistema.`);
    }

    // 2. Consistencia estricta de moneda
    if (reservation.moneda && reservation.moneda !== dto.moneda) {
      throw new Error(
        `Inconsistencia de moneda: La reserva está pactada en ${reservation.moneda}, pero el abono se intentó registrar en ${dto.moneda}.`
      );
    }

    // 3. Manejo de idempotencia mock
    if (dto.idempotencyKey && dto.idempotencyKey.trim() !== '') {
      const existingWithKey = this.payments.find((p) => p.idempotencyKey === dto.idempotencyKey);
      if (existingWithKey) {
        // Verificar si el payload coincide para devolver respuesta previa (idempotencia pura)
        const samePayload =
          existingWithKey.reservaId === dto.reservaId &&
          existingWithKey.importe === fromCents(toCents(dto.importe)) &&
          existingWithKey.moneda === dto.moneda &&
          existingWithKey.concepto === dto.concepto;

        if (samePayload) {
          return JSON.parse(JSON.stringify(existingWithKey));
        }

        // Si la clave ya fue usada con distinto contenido, generar conflicto 409
        throw new Error(
          `Conflicto de idempotencia (409): La clave "${dto.idempotencyKey}" ya fue utilizada previamente con datos de pago diferentes.`
        );
      }
    }

    // 4. Crear registro en estado inicial PENDIENTE_CONCILIACION
    const newPayment: Payment = {
      id: `pag-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      reservaId: reservation.id,
      propiedadId: reservation.propiedadId,
      propiedadNombre: reservation.propiedadNombre,
      huespedId: reservation.huespedId,
      huespedNombre: reservation.huespedNombre,
      importe: fromCents(toCents(dto.importe)),
      moneda: dto.moneda,
      concepto: dto.concepto,
      metodoPago: dto.metodoPago,
      referencia: dto.referencia.trim(),
      estado: 'PENDIENTE_CONCILIACION',
      idempotencyKey: dto.idempotencyKey?.trim(),
      fechaPago: dto.fechaPago.trim(),
      registradoEn: new Date().toISOString(),
      notas: dto.notas?.trim(),
    };

    this.payments.unshift(newPayment);
    return JSON.parse(JSON.stringify(newPayment));
  }

  /**
   * Conciliación explícita de un pago.
   * Transición permitida: PENDIENTE_CONCILIACION -> CONCILIADO.
   * La operación es idempotente si el pago ya estaba conciliado.
   */
  public async reconcilePayment(id: string, dto?: ReconcilePaymentDto): Promise<Payment> {
    const index = this.payments.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`El pago con ID "${id}" no fue encontrado.`);
    }

    const current = this.payments[index];

    // Idempotencia: si ya está conciliado, devolver sin re-aplicar ni alterar fechas históricas
    if (current.estado === 'CONCILIADO') {
      return JSON.parse(JSON.stringify(current));
    }

    if (current.estado === 'RECHAZADO') {
      throw new Error(`Operación inválida: No se puede conciliar directamente un pago que fue rechazado.`);
    }

    const updated: Payment = {
      ...current,
      estado: 'CONCILIADO',
      conciliadoEn: new Date().toISOString(),
      conciliadoPor: 'Operador / Auditor Contable',
      referencia: dto?.referencia?.trim() || current.referencia,
      notas: dto?.notas?.trim()
        ? `${current.notas ? current.notas + ' | ' : ''}Conciliación: ${dto.notas.trim()}`
        : current.notas,
    };

    this.payments[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }

  /**
   * Rechazo de un pago no verificado o inválido.
   * Transición permitida: PENDIENTE_CONCILIACION -> RECHAZADO.
   */
  public async rejectPayment(id: string, dto: RejectPaymentDto): Promise<Payment> {
    const index = this.payments.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`El pago con ID "${id}" no fue encontrado.`);
    }

    const current = this.payments[index];

    if (current.estado === 'CONCILIADO') {
      throw new Error(
        `Operación protegida: Un pago ya conciliado formalmente no puede ser rechazado silenciosamente. Requiere procedimiento de reversa contable.`
      );
    }

    const motivo = dto.motivo?.trim();
    if (!motivo || motivo.length < 3) {
      throw new Error('Debe especificar un motivo válido de rechazo (mínimo 3 caracteres).');
    }

    const updated: Payment = {
      ...current,
      estado: 'RECHAZADO',
      motivoRechazo: motivo,
      rechazadoEn: new Date().toISOString(),
    };

    this.payments[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }
}

export const paymentService: IPaymentService = new MockPaymentService();
