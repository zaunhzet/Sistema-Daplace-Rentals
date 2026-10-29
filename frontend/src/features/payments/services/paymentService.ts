import type {
  CreatePaymentDto,
  CreatePaymentEvidenceDto,
  Payment,
  PaymentEvidence,
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
import { apiClient, ApiError } from '../../../shared/api/client';
import { isMockMode } from '../../../shared/api/config';

export function computeTestAccountIdentity(rawRef?: string | null): { mask: string | null; identity: string | null } {
  if (!rawRef || typeof rawRef !== 'string') return { mask: null, identity: null };
  const trimmed = rawRef.trim();
  if (!trimmed) return { mask: null, identity: null };

  // 1. Si contiene asteriscos, validar formato estricto documentado: ****DDDD
  if (trimmed.includes('*')) {
    const STRICT_MASK_REGEX = /^\*{4}\d{4}$/;
    if (!STRICT_MASK_REGEX.test(trimmed)) {
      throw new Error('La referencia de cuenta enmascarada debe tener el formato estricto "****DDDD" (4 asteriscos seguidos de 4 dígitos).');
    }
    return {
      mask: trimmed,
      identity: `MASK:${trimmed}`,
    };
  }

  // 2. Referencia completa: normalización removiendo separadores habituales [\s\-_.]
  const clean = trimmed.replace(/[\s\-_.]/g, '').toUpperCase();
  if (clean.length < 4 || !/^[A-Za-z0-9]{4,34}$/.test(clean)) {
    throw new Error('La referencia de cuenta debe contener entre 4 y 34 caracteres alfanuméricos.');
  }

  // Identidad determinista en frontend basada en la referencia normalizada (sin exponer la cuenta completa ni requerir HMAC backend)
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch << 1), 0x85ebca6b);
  }
  const fp = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');

  return {
    mask: `****${clean.slice(-4)}`,
    identity: `FULL_FP:${fp}`,
  };
}

export function maskRestrictedAccountReference(rawRef?: string | null): string | null {
  const result = computeTestAccountIdentity(rawRef);
  return result.mask;
}

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
  addEvidence(pagoId: string, dto: CreatePaymentEvidenceDto, idempotencyKey?: string): Promise<PaymentEvidence>;
  getEvidences(pagoId: string): Promise<PaymentEvidence[]>;
  reset(): void;
}

export class MockPaymentService implements IPaymentService {
  private payments: Payment[] = [];
  private paymentSnapshots = new Map<string, { canonical: string; paymentId: string }>();
  private evidenceSnapshots = new Map<string, { canonical: string; evidence: PaymentEvidence }>();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.payments = JSON.parse(JSON.stringify(INITIAL_PAYMENTS_MOCK));
    this.paymentSnapshots.clear();
    this.evidenceSnapshots.clear();
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

    // 3. Manejo de idempotencia mock mediante snapshot canónico inmutable (H6)
    const accountInfo = computeTestAccountIdentity(dto.cuentaReferencia);

    const buildCanonical = () =>
      JSON.stringify({
        reservaId: dto.reservaId,
        monto: fromCents(toCents(dto.importe)),
        moneda: dto.moneda,
        concepto: dto.concepto,
        metodoPago: dto.metodoPago,
        referencia: dto.referencia.trim(),
        fechaPago: dto.fechaPago.trim(),
        beneficiarioTipo: dto.beneficiarioTipo || dto.beneficiario || null,
        beneficiarioNombre: dto.beneficiarioNombre?.trim() || null,
        bancoReceptor: dto.bancoReceptor?.trim() || null,
        cuentaReferenciaMask: accountInfo.mask,
        cuentaReferenciaIdentity: accountInfo.identity,
        notas: dto.notas?.trim() || null,
        evidencias: (dto.evidencias || [])
          .map((e) => ({
            tipo: e.tipo && e.tipo.trim() ? e.tipo.trim() : 'VOUCHER',
            nombreArchivo: e.nombreArchivo.trim(),
            referenciaDocumental: e.referenciaDocumental?.trim() || null,
            url: e.url?.trim() || null,
            notas: e.notas?.trim() || null,
          }))
          .sort((a, b) =>
            a.nombreArchivo.localeCompare(b.nombreArchivo) ||
            (a.referenciaDocumental || '').localeCompare(b.referenciaDocumental || '') ||
            (a.tipo || '').localeCompare(b.tipo || '') ||
            (a.url || '').localeCompare(b.url || '') ||
            (a.notas || '').localeCompare(b.notas || '')
          ),
      });

    if (dto.idempotencyKey && dto.idempotencyKey.trim() !== '') {
      const safeKey = dto.idempotencyKey.trim();
      const canonical = buildCanonical();

      const existingSnapshot = this.paymentSnapshots.get(safeKey);
      if (existingSnapshot) {
        if (existingSnapshot.canonical === canonical) {
          const found = this.payments.find((p) => p.id === existingSnapshot.paymentId);
          if (found) {
            return JSON.parse(JSON.stringify(found));
          }
        }
        throw new Error(
          `Conflicto de idempotencia (409): La clave "${safeKey}" ya fue utilizada previamente con datos de pago diferentes.`
        );
      }
    }

    const initialEvidencias: PaymentEvidence[] = [];
    if (Array.isArray(dto.evidencias) && dto.evidencias.length > 0) {
      for (const ev of dto.evidencias) {
        if (ev.estado && ev.estado.toUpperCase() === 'VALIDADA') {
          throw new Error('No se permite establecer el estado VALIDADA directamente desde el cliente. Las evidencias documentales se registran exclusivamente en estado REFERENCIADA.');
        }
        initialEvidencias.push({
          id: `ev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
          pagoId: '', // asignado abajo
          tipo: ev.tipo || 'VOUCHER',
          nombreArchivo: ev.nombreArchivo.trim(),
          referenciaDocumental: ev.referenciaDocumental?.trim() || undefined,
          url: ev.url?.trim() || undefined,
          estado: 'REFERENCIADA',
          notas: ev.notas?.trim() || undefined,
          registradoPor: 'Operador / Auditor Contable',
          creadoEn: new Date().toISOString(),
        });
      }
    }

    const safeBeneficiario = dto.beneficiarioTipo || dto.beneficiario || undefined;
    const safeCuentaRef = accountInfo.mask || undefined;
    const pagoId = `pag-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
    for (const ev of initialEvidencias) {
      ev.pagoId = pagoId;
    }

    // 4. Crear registro en estado inicial PENDIENTE_CONCILIACION
    const newPayment: Payment = {
      id: pagoId,
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
      beneficiarioTipo: safeBeneficiario,
      beneficiario: safeBeneficiario,
      beneficiarioNombre: dto.beneficiarioNombre?.trim() || undefined,
      bancoReceptor: dto.bancoReceptor?.trim() || undefined,
      cuentaReferencia: safeCuentaRef,
      evidencias: initialEvidencias,
    };

    this.payments.unshift(newPayment);

    // Guardar snapshot canónico inmutable de creación
    if (dto.idempotencyKey && dto.idempotencyKey.trim() !== '') {
      const safeKey = dto.idempotencyKey.trim();
      const canonical = buildCanonical();
      this.paymentSnapshots.set(safeKey, { canonical, paymentId: newPayment.id });
    }

    return JSON.parse(JSON.stringify(newPayment));
  }

  public async addEvidence(
    pagoId: string,
    dto: CreatePaymentEvidenceDto,
    idempotencyKey?: string
  ): Promise<PaymentEvidence> {
    const payment = this.payments.find((p) => p.id === pagoId);
    if (!payment) {
      throw new Error(`El pago con ID "${pagoId}" no fue encontrado.`);
    }

    if (payment.estado === 'RECHAZADO') {
      throw new Error('No se pueden adjuntar evidencias documentales a un pago en estado RECHAZADO.');
    }

    if (dto.estado && dto.estado.toUpperCase() === 'VALIDADA') {
      throw new Error(
        'No se permite establecer el estado VALIDADA directamente desde el cliente. Las evidencias documentales se registran exclusivamente en estado REFERENCIADA.'
      );
    }

    if (!dto.nombreArchivo || dto.nombreArchivo.trim().length < 2) {
      throw new Error('El nombre de archivo de la evidencia documental es obligatorio (mínimo 2 caracteres).');
    }

    const key = (idempotencyKey || dto.idempotencyKey || '').trim();
    const canonical = JSON.stringify({
      pagoId,
      tipo: dto.tipo || 'VOUCHER',
      nombreArchivo: dto.nombreArchivo.trim(),
      referenciaDocumental: dto.referenciaDocumental?.trim() || null,
      url: dto.url?.trim() || null,
      notas: dto.notas?.trim() || null,
    });

    if (key) {
      const snapshotKey = `${pagoId}:${key}`;
      const existingSnapshot = this.evidenceSnapshots.get(snapshotKey);
      if (existingSnapshot) {
        if (existingSnapshot.canonical === canonical) {
          return JSON.parse(JSON.stringify(existingSnapshot.evidence));
        }
        throw new Error(
          `Conflicto de idempotencia (409): La clave "${key}" ya fue utilizada previamente con datos de evidencia diferentes para este pago.`
        );
      }
    }

    const newEvidence: PaymentEvidence = {
      id: `ev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`,
      pagoId,
      tipo: dto.tipo || 'VOUCHER',
      nombreArchivo: dto.nombreArchivo.trim(),
      referenciaDocumental: dto.referenciaDocumental?.trim() || undefined,
      url: dto.url?.trim() || undefined,
      estado: 'REFERENCIADA',
      notas: dto.notas?.trim() || undefined,
      idempotencyKey: key || undefined,
      registradoPor: 'Operador / Auditor Contable',
      creadoEn: new Date().toISOString(),
    };

    if (!payment.evidencias) {
      payment.evidencias = [];
    }
    payment.evidencias.unshift(newEvidence);

    if (key) {
      this.evidenceSnapshots.set(`${pagoId}:${key}`, {
        canonical,
        evidence: JSON.parse(JSON.stringify(newEvidence)),
      });
    }

    return JSON.parse(JSON.stringify(newEvidence));
  }

  public async getEvidences(pagoId: string): Promise<PaymentEvidence[]> {
    const payment = this.payments.find((p) => p.id === pagoId);
    if (!payment) {
      throw new Error(`El pago con ID "${pagoId}" no fue encontrado.`);
    }
    return JSON.parse(JSON.stringify(payment.evidencias || []));
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

export class ApiPaymentService implements IPaymentService {
  public async getPayments(filters?: PaymentFilterParams): Promise<Payment[]> {
    const params = new URLSearchParams();
    if (filters?.propiedadId && filters.propiedadId !== 'TODAS') {
      params.set('propiedadId', filters.propiedadId);
    }
    if (filters?.reservaId && filters.reservaId !== 'TODAS') {
      params.set('reservaId', filters.reservaId);
    }
    if (filters?.estado && filters.estado !== 'TODOS') {
      params.set('estado', filters.estado);
    }
    if (filters?.desde) {
      params.set('desde', filters.desde);
    }
    if (filters?.hasta) {
      params.set('hasta', filters.hasta);
    }
    if (filters?.search && filters.search.trim()) {
      params.set('search', filters.search.trim());
    }

    const qs = params.toString();
    const res = await apiClient<{ data: Payment[] }>(`/api/pagos${qs ? `?${qs}` : ''}`);
    return res.data;
  }

  public async getPaymentById(id: string): Promise<Payment | null> {
    try {
      const res = await apiClient<{ data: Payment }>(`/api/pagos/${encodeURIComponent(id)}`);
      return res.data;
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  public async getPaymentsByReservationId(reservaId: string): Promise<Payment[]> {
    const res = await apiClient<{ data: Payment[] }>(
      `/api/reservas/${encodeURIComponent(reservaId)}/pagos`
    );
    return res.data;
  }

  public async getReservationFinancialSummary(reservaId: string): Promise<ReservationFinancialSummary> {
    const res = await apiClient<{ data: ReservationFinancialSummary }>(
      `/api/reservas/${encodeURIComponent(reservaId)}/resumen-financiero`
    );
    return res.data;
  }

  public async createPayment(dto: CreatePaymentDto): Promise<Payment> {
    const validation = validatePaymentPayload(dto);
    if (!validation.isValid) {
      const errorMsg = Object.values(validation.errors).join(' ');
      throw new Error(`Error de validación: ${errorMsg}`);
    }

    const res = await apiClient<{ data: Payment }>('/api/pagos', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return res.data;
  }

  public async reconcilePayment(id: string, dto?: ReconcilePaymentDto): Promise<Payment> {
    const res = await apiClient<{ data: Payment }>(
      `/api/pagos/${encodeURIComponent(id)}/conciliar`,
      {
        method: 'POST',
        body: JSON.stringify(dto || {}),
      }
    );
    return res.data;
  }

  public async rejectPayment(id: string, dto: RejectPaymentDto): Promise<Payment> {
    const res = await apiClient<{ data: Payment }>(
      `/api/pagos/${encodeURIComponent(id)}/rechazar`,
      {
        method: 'POST',
        body: JSON.stringify(dto),
      }
    );
    return res.data;
  }

  public async addEvidence(
    pagoId: string,
    dto: CreatePaymentEvidenceDto,
    idempotencyKey?: string
  ): Promise<PaymentEvidence> {
    if (dto.estado && dto.estado.toUpperCase() === 'VALIDADA') {
      throw new Error(
        'No se permite establecer el estado VALIDADA directamente desde el cliente. Las evidencias documentales se registran exclusivamente en estado REFERENCIADA.'
      );
    }
    const key =
      idempotencyKey ||
      dto.idempotencyKey ||
      `idem-ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await apiClient<{ data: PaymentEvidence }>(
      `/api/pagos/${encodeURIComponent(pagoId)}/evidencias`,
      {
        method: 'POST',
        headers: {
          'idempotency-key': key,
        },
        body: JSON.stringify({
          ...dto,
          idempotencyKey: key,
        }),
      }
    );
    return res.data;
  }

  public async getEvidences(pagoId: string): Promise<PaymentEvidence[]> {
    const res = await apiClient<{ data: PaymentEvidence[] }>(
      `/api/pagos/${encodeURIComponent(pagoId)}/evidencias`
    );
    return res.data;
  }

  public reset(): void {
    // No-op en modo API
  }
}

export const paymentService: IPaymentService = isMockMode()
  ? new MockPaymentService()
  : new ApiPaymentService();

