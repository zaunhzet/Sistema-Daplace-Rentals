import type {
  AvailabilityCheckResult,
  ConfirmationRequirementsResult,
  CreateContractDto,
  CreateReservationDto,
  Reservation,
  ReservationContract,
  ReservationFilterParams,
  ReservationValidationResult,
  UpdateReservationDatesDto,
} from '../types';
import { INITIAL_RESERVATIONS_MOCK } from './mockReservations';
import { propertyService } from '../../properties/services/propertyService';
import { guestService } from '../../guests/services/guestService';
import { apiClient, ApiError } from '../../../shared/api/client';
import { isMockMode } from '../../../shared/api/config';

/**
 * Calcula la cantidad de noches para el intervalo semiabierto [ingreso, salida).
 */
export function calculateNights(ingreso: string, salida: string): number {
  if (!ingreso || !salida) return 0;
  const d1 = new Date(`${ingreso}T00:00:00Z`).getTime();
  const d2 = new Date(`${salida}T00:00:00Z`).getTime();
  if (isNaN(d1) || isNaN(d2)) return 0;
  const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Comprueba si dos intervalos semiabiertos [in1, out1) y [in2, out2) se solapan.
 * Regla: Dos intervalos consecutivos [10, 15) y [15, 20) NO se solapan.
 */
export function checkDatesOverlap(
  in1: string,
  out1: string,
  in2: string,
  out2: string
): boolean {
  return in1 < out2 && in2 < out1;
}

export function validateReservationDates(
  ingreso: string,
  salida: string
): { isValid: boolean; error?: string } {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(ingreso) || !dateRegex.test(salida)) {
    return { isValid: false, error: 'Las fechas deben tener formato YYYY-MM-DD.' };
  }

  const d1 = new Date(`${ingreso}T00:00:00Z`);
  const d2 = new Date(`${salida}T00:00:00Z`);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    return { isValid: false, error: 'Las fechas proporcionadas no son válidas.' };
  }

  const noches = calculateNights(ingreso, salida);
  if (noches <= 0) {
    return {
      isValid: false,
      error: 'La fecha de salida debe ser posterior a la fecha de ingreso (mínimo 1 noche).',
    };
  }

  return { isValid: true };
}

export function validateReservationPayload(
  dto: Partial<CreateReservationDto>
): ReservationValidationResult {
  const errors: Record<string, string> = {};

  if (!dto.propiedadId || dto.propiedadId.trim() === '') {
    errors.propiedadId = 'Debe seleccionar una propiedad.';
  }

  if (!dto.huespedId || dto.huespedId.trim() === '') {
    errors.huespedId = 'Debe seleccionar un huésped.';
  }

  if (!dto.ingreso) {
    errors.ingreso = 'La fecha de ingreso es obligatoria.';
  }

  if (!dto.salida) {
    errors.salida = 'La fecha de salida es obligatoria.';
  }

  if (dto.ingreso && dto.salida) {
    const dateCheck = validateReservationDates(dto.ingreso, dto.salida);
    if (!dateCheck.isValid && dateCheck.error) {
      errors.fechas = dateCheck.error;
    }
  }

  if (dto.montoAcordado === undefined || dto.montoAcordado <= 0) {
    errors.montoAcordado = 'El precio acordado debe ser un monto mayor a 0.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface IReservationService {
  getReservations(filters?: ReservationFilterParams): Promise<Reservation[]>;
  getReservationById(id: string): Promise<Reservation | null>;
  getReservationsByGuestId(guestId: string): Promise<Reservation[]>;
  getReservationsByPropertyId(propiedadId: string): Promise<Reservation[]>;
  createReservation(dto: CreateReservationDto): Promise<Reservation>;
  updateReservationDates(id: string, dto: UpdateReservationDatesDto): Promise<Reservation>;
  confirmReservation(id: string): Promise<Reservation>;
  cancelReservation(id: string, motivo?: string): Promise<Reservation>;
  checkAvailability(
    propiedadId: string,
    ingreso: string,
    salida: string,
    excludeReservationId?: string
  ): Promise<AvailabilityCheckResult>;
  getContracts(reservaId: string): Promise<ReservationContract[]>;
  createContract(reservaId: string, dto: CreateContractDto): Promise<ReservationContract>;
  getConfirmationRequirements(
    reservaId: string
  ): Promise<ConfirmationRequirementsResult>;
  reset(): void;
}

export interface MockPaymentFixture {
  id: string;
  reservaId: string;
  monto: number;
  moneda: string;
  estado: 'PENDIENTE_CONCILIACION' | 'CONCILIADO' | 'RECHAZADO';
  esGarantia?: boolean;
  evidencias: Array<{
    id: string;
    estadoDoc: 'REFERENCIADA' | 'VALIDADA' | 'RECHAZADA';
  }>;
}

interface ContractIdempotencySnapshot {
  contract: ReservationContract;
  nombreOriginal: string;
  urlReferencia?: string;
  reemplazaContratoId?: string;
}

class MockReservationService implements IReservationService {
  private reservations: Reservation[] = [];
  private contracts: Map<string, ReservationContract[]> = new Map();
  private mockPayments: Map<string, MockPaymentFixture[]> = new Map();
  private idempotencySnapshots: Map<string, ContractIdempotencySnapshot> = new Map();

  constructor() {
    this.reset();
  }

  public setMockPayments(reservaId: string, payments: MockPaymentFixture[]): void {
    this.mockPayments.set(reservaId, payments);
  }

  public reset(): void {
    this.reservations = JSON.parse(JSON.stringify(INITIAL_RESERVATIONS_MOCK));
    this.contracts.clear();
    this.mockPayments.clear();
    this.idempotencySnapshots.clear();
    // Sembrar contrato histórico para res-03 (reserva DIRECTO COMPLETADA)
    this.contracts.set('res-03', [
      {
        id: 'ct-mock-01',
        reservaId: 'res-03',
        version: 1,
        nombreOriginal: 'contrato_res03_firmado.pdf',
        urlReferencia: 'https://docs.daplace.internal/contracts/res-03/c1.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
        registradoPorNombre: 'Administrador Sistema',
        registradoEn: new Date('2026-10-10').toISOString(),
        validadoPorId: 'usr-admin',
        validadoPorNombre: 'Administrador Sistema',
        validadoEn: new Date('2026-10-11').toISOString(),
      },
    ]);
  }

  public async getReservations(filters?: ReservationFilterParams): Promise<Reservation[]> {
    let result = [...this.reservations];

    if (!filters) {
      return result;
    }

    if (filters.propiedadId && filters.propiedadId !== 'TODAS') {
      result = result.filter((r) => r.propiedadId === filters.propiedadId);
    }

    if (filters.huespedId && filters.huespedId !== 'TODOS') {
      result = result.filter((r) => r.huespedId === filters.huespedId);
    }

    if (filters.estado && filters.estado !== 'TODOS') {
      result = result.filter((r) => r.estado === filters.estado);
    }

    if (filters.desde) {
      // Reservas cuya salida sea posterior a 'desde'
      result = result.filter((r) => r.salida >= filters.desde!);
    }

    if (filters.hasta) {
      // Reservas cuyo ingreso sea anterior a 'hasta'
      result = result.filter((r) => r.ingreso <= filters.hasta!);
    }

    if (filters.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.propiedadNombre.toLowerCase().includes(q) ||
          r.huespedNombre.toLowerCase().includes(q) ||
          (r.referenciaCanal && r.referenciaCanal.toLowerCase().includes(q))
      );
    }

    return result;
  }

  public async getReservationById(id: string): Promise<Reservation | null> {
    const res = this.reservations.find((r) => r.id === id);
    return res ? JSON.parse(JSON.stringify(res)) : null;
  }

  public async getReservationsByGuestId(guestId: string): Promise<Reservation[]> {
    return this.reservations
      .filter((r) => r.huespedId === guestId)
      .map((r) => JSON.parse(JSON.stringify(r)));
  }

  public async getReservationsByPropertyId(propiedadId: string): Promise<Reservation[]> {
    return this.reservations
      .filter((r) => r.propiedadId === propiedadId)
      .map((r) => JSON.parse(JSON.stringify(r)));
  }

  /**
   * Comprueba disponibilidad de un inmueble para [ingreso, salida).
   * Considera bloqueantes las reservas en estado CONFIRMADA, SOLICITADA o COMPLETADA.
   * La reserva cancelada LIBERA disponibilidad.
   */
  public async checkAvailability(
    propiedadId: string,
    ingreso: string,
    salida: string,
    excludeReservationId?: string
  ): Promise<AvailabilityCheckResult> {
    const dateCheck = validateReservationDates(ingreso, salida);
    if (!dateCheck.isValid) {
      return { disponible: false, motivo: dateCheck.error };
    }

    // Verificar si la propiedad existe y si está operativa
    const property = await propertyService.getPropertyById(propiedadId);
    if (!property) {
      return { disponible: false, motivo: `La propiedad con ID "${propiedadId}" no existe.` };
    }

    if (!property.activa || property.estadoOperativo === 'INACTIVA') {
      return {
        disponible: false,
        motivo: `La propiedad "${property.nombre}" se encuentra inactiva y no admite reservas.`,
      };
    }

    if (property.estadoOperativo === 'EN_MANTENIMIENTO') {
      return {
        disponible: false,
        motivo: `La propiedad "${property.nombre}" se encuentra en mantenimiento operativo y no admite solicitudes de ocupación.`,
      };
    }

    // Comprobar solapes contra reservas bloqueantes
    const conflictos = this.reservations.filter((r) => {
      if (r.propiedadId !== propiedadId) return false;
      if (excludeReservationId && r.id === excludeReservationId) return false;
      // Solo estados bloqueantes
      if (r.estado === 'CANCELADA') return false;

      return checkDatesOverlap(ingreso, salida, r.ingreso, r.salida);
    });

    if (conflictos.length > 0) {
      const conf = conflictos[0];
      return {
        disponible: false,
        motivo: `Conflicto de solape con la reserva existente ${conf.id} (${conf.ingreso} a ${conf.salida}, estado: ${conf.estado}).`,
        reservasConflicto: conflictos,
      };
    }

    return { disponible: true };
  }

  public async createReservation(dto: CreateReservationDto): Promise<Reservation> {
    const validation = validateReservationPayload(dto);
    if (!validation.isValid) {
      const errorMsg = Object.values(validation.errors).join(' ');
      throw new Error(`Error de validación: ${errorMsg}`);
    }

    // Comprobar disponibilidad e integridad
    const availability = await this.checkAvailability(dto.propiedadId, dto.ingreso, dto.salida);
    if (!availability.disponible) {
      throw new Error(availability.motivo || 'El inmueble no está disponible en las fechas solicitadas.');
    }

    const [propiedad, guest] = await Promise.all([
      propertyService.getPropertyById(dto.propiedadId),
      guestService.getGuestById(dto.huespedId),
    ]);

    if (!propiedad) {
      throw new Error(`Propiedad no encontrada con ID: ${dto.propiedadId}`);
    }
    if (!guest) {
      throw new Error(`Huésped no encontrado con ID: ${dto.huespedId}`);
    }

    const noches = calculateNights(dto.ingreso, dto.salida);
    const newId = `res-${String(this.reservations.length + 1).padStart(2, '0')}`;
    const now = new Date().toISOString();

    const newReservation: Reservation = {
      id: newId,
      propiedadId: propiedad.id,
      propiedadNombre: propiedad.nombre,
      huespedId: guest.id,
      huespedNombre: guest.nombreCompleto,
      huespedContacto: guest.telefono || guest.email || undefined,
      ingreso: dto.ingreso,
      salida: dto.salida,
      noches,
      estado: 'SOLICITADA',
      montoAcordado: Number(dto.montoAcordado.toFixed(2)),
      moneda: dto.moneda || propiedad.moneda || 'PEN',
      origen: dto.origen || 'WEB',
      referenciaCanal: dto.referenciaCanal?.trim() || undefined,
      notas: dto.notas?.trim() || undefined,
      creadaEn: now,
      actualizadaEn: now,
    };

    this.reservations.unshift(newReservation);
    return JSON.parse(JSON.stringify(newReservation));
  }

  public async updateReservationDates(
    id: string,
    dto: UpdateReservationDatesDto
  ): Promise<Reservation> {
    const index = this.reservations.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Reserva no encontrada con ID: ${id}`);
    }

    const current = this.reservations[index];

    if (current.estado === 'CANCELADA') {
      throw new Error('No se pueden modificar las fechas de una reserva cancelada.');
    }

    const dateCheck = validateReservationDates(dto.ingreso, dto.salida);
    if (!dateCheck.isValid) {
      throw new Error(dateCheck.error || 'Fechas inválidas.');
    }

    // Comprobar disponibilidad excluyendo la propia reserva
    const availability = await this.checkAvailability(
      current.propiedadId,
      dto.ingreso,
      dto.salida,
      current.id
    );

    if (!availability.disponible) {
      throw new Error(
        availability.motivo || 'Las nuevas fechas generan conflicto de solape con otra reserva existente.'
      );
    }

    const noches = calculateNights(dto.ingreso, dto.salida);
    const updated: Reservation = {
      ...current,
      ingreso: dto.ingreso,
      salida: dto.salida,
      noches,
      montoAcordado: dto.montoAcordado !== undefined ? Number(dto.montoAcordado.toFixed(2)) : current.montoAcordado,
      notas: dto.notas !== undefined ? dto.notas.trim() || undefined : current.notas,
      actualizadaEn: new Date().toISOString(),
    };

    this.reservations[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }

  public async confirmReservation(id: string): Promise<Reservation> {
    const index = this.reservations.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Reserva no encontrada con ID: ${id}`);
    }

    const current = this.reservations[index];

    if (current.estado === 'CONFIRMADA') {
      return JSON.parse(JSON.stringify(current));
    }

    if (current.estado === 'CANCELADA') {
      throw new Error('No es posible confirmar una reserva que ha sido cancelada.');
    }

    // Regla DR-02: Para reservas DIRECTO, evaluar requisitos obligatorios
    if (current.origen === 'DIRECTO') {
      const evaluation = await this.getConfirmationRequirements(id);
      if (!evaluation.puedeConfirmar) {
        const err = new ApiError(
          'La reserva directa no cumple con los requisitos obligatorios para confirmación.',
          409,
          'REQUIREMENTS_NOT_MET',
          { motivosPendientes: evaluation.motivosPendientes, requisitos: evaluation.requisitos }
        );
        throw err;
      }
    }

    // Revalidar disponibilidad antes de confirmar
    const availability = await this.checkAvailability(
      current.propiedadId,
      current.ingreso,
      current.salida,
      current.id
    );

    if (!availability.disponible) {
      throw new Error(
        `No se puede confirmar: ${availability.motivo || 'Existe un conflicto de solape con otra reserva.'}`
      );
    }

    const updated: Reservation = {
      ...current,
      estado: 'CONFIRMADA',
      actualizadaEn: new Date().toISOString(),
    };

    this.reservations[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }

  public async getContracts(reservaId: string): Promise<ReservationContract[]> {
    const list = this.contracts.get(reservaId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  public async createContract(reservaId: string, dto: CreateContractDto): Promise<ReservationContract> {
    const res = this.reservations.find((r) => r.id === reservaId);
    if (!res) {
      throw new Error(`Reserva no encontrada con ID: ${reservaId}`);
    }

    if (!dto.nombreOriginal || dto.nombreOriginal.trim().length < 3) {
      throw new Error('El nombre original del contrato debe tener al menos 3 caracteres.');
    }

    if ((dto as any).estadoFirma && (dto as any).estadoFirma !== 'REFERENCIADA') {
      throw new Error('No se permite establecer el estado de validación desde el cliente.');
    }

    const normalizedNombre = dto.nombreOriginal.trim();
    const normalizedUrl = dto.urlReferencia?.trim() || undefined;
    const normalizedReemplaza = dto.reemplazaContratoId?.trim() || undefined;
    const idempotencyKey = dto.idempotencyKey?.trim() || undefined;

    const existing = this.contracts.get(reservaId) || [];

    // DR02-06 FIX: Idempotencia coherente con snapshot canónico inmutable
    if (idempotencyKey) {
      const snapKey = `${reservaId}:${idempotencyKey}`;
      const snapshot = this.idempotencySnapshots.get(snapKey);
      if (snapshot) {
        const sameNombre = snapshot.nombreOriginal === normalizedNombre;
        const sameUrl = snapshot.urlReferencia === normalizedUrl;
        const sameReemplaza = snapshot.reemplazaContratoId === normalizedReemplaza;

        if (sameNombre && sameUrl && sameReemplaza) {
          // Replay del mismo contrato sin efectos secundarios
          return JSON.parse(JSON.stringify(snapshot.contract));
        }

        // Misma clave pero contenido diferente: conflicto 409
        throw new ApiError(
          'Conflicto de idempotencia: ya existe un contrato registrado con la misma clave pero diferente contenido.',
          409,
          'IDEMPOTENCY_CONFLICT',
          { idempotencyKey, reservaId }
        );
      }
    }

    const nextVersion = existing.length > 0 ? Math.max(...existing.map((c) => c.version)) + 1 : 1;

    const newContract: ReservationContract = {
      id: `ct-mock-${Date.now()}-${nextVersion}`,
      reservaId,
      version: nextVersion,
      nombreOriginal: normalizedNombre,
      urlReferencia: normalizedUrl,
      estadoFirma: 'REFERENCIADA',
      registradoPorId: 'usr-admin',
      registradoPorNombre: 'Usuario Actual',
      registradoEn: new Date().toISOString(),
      reemplazaContratoId: normalizedReemplaza,
      idempotencyKey,
    };

    existing.push(newContract);
    this.contracts.set(reservaId, existing);

    if (idempotencyKey) {
      const snapKey = `${reservaId}:${idempotencyKey}`;
      this.idempotencySnapshots.set(snapKey, {
        contract: JSON.parse(JSON.stringify(newContract)),
        nombreOriginal: normalizedNombre,
        urlReferencia: normalizedUrl,
        reemplazaContratoId: normalizedReemplaza,
      });
    }

    return JSON.parse(JSON.stringify(newContract));
  }

  public async getConfirmationRequirements(
    reservaId: string
  ): Promise<ConfirmationRequirementsResult> {
    const res = this.reservations.find((r) => r.id === reservaId);
    if (!res) {
      return {
        reservaId,
        puedeConfirmar: false,
        requisitos: {
          reservaApta: false,
          contratoFirmado: false,
          pagoRegistrado: false,
          evidenciaAdelanto: false,
          evidenciaRevisada: false,
          adelantoCubierto: false,
          adelantoConciliado: false,
          politicaAdelantoDefinida: false,
          disponibilidadValida: false,
        },
        motivosPendientes: ['RESERVA_NO_ENCONTRADA'],
      };
    }

    const motivosPendientes: string[] = [];
    const reservaApta = res.estado === 'SOLICITADA';
    if (!reservaApta) motivosPendientes.push('RESERVA_NO_APTA');

    // DR02-03 y DR02-05: Resolución estricta de contratos sustituidos
    const allContracts = this.contracts.get(reservaId) || [];
    const replacedIds = new Set(
      allContracts
        .map((c) => c.reemplazaContratoId)
        .filter((id): id is string => Boolean(id))
    );
    const activeContracts = allContracts.filter((c) => !replacedIds.has(c.id));

    let contratoFirmado = false;
    if (activeContracts.length === 0) {
      motivosPendientes.push('CONTRATO_NO_VALIDADO');
    } else if (activeContracts.length > 1) {
      motivosPendientes.push('CONTRATO_VIGENCIA_PENDIENTE');
    } else {
      const [unicoVigente] = activeContracts;
      if (unicoVigente.estadoFirma === 'VALIDADA') {
        contratoFirmado = true;
      } else {
        motivosPendientes.push('CONTRATO_NO_VALIDADO');
      }
    }

    // DR02-02 y DR02-05: Exclusivamente fixtures sintéticos explícitos sin inferencia ni inventar totales
    const payments = this.mockPayments.get(reservaId) || [];
    const eligiblePayments = payments.filter((p) => {
      if (p.reservaId !== reservaId) return false;
      if (p.moneda !== res.moneda) return false;
      if (p.esGarantia) return false;
      if (p.estado === 'RECHAZADO') return false;
      return true;
    });

    const pagoRegistrado = res.origen !== 'DIRECTO' || res.estado === 'CONFIRMADA' || eligiblePayments.length > 0;
    if (!pagoRegistrado) motivosPendientes.push('PAGO_ADELANTO_FALTANTE');

    const hasAnyEvidence = eligiblePayments.some((p) => p.evidencias.length > 0);
    const evidenciaAdelanto = res.origen !== 'DIRECTO' || res.estado === 'CONFIRMADA' || hasAnyEvidence;
    if (!evidenciaAdelanto && pagoRegistrado) motivosPendientes.push('EVIDENCIA_ADELANTO_FALTANTE');

    const paymentsWithValidEvidence = eligiblePayments.filter((p) =>
      p.evidencias.some((e) => e.estadoDoc === 'VALIDADA')
    );
    const evidenciaRevisada = res.origen !== 'DIRECTO' || res.estado === 'CONFIRMADA' || paymentsWithValidEvidence.length > 0;
    if (!evidenciaRevisada && evidenciaAdelanto) motivosPendientes.push('EVIDENCIA_NO_REVISADA');

    // DR02-01 y DR02-05: El cliente no define políticas; el mock conserva PENDIENTE_APROBACION por defecto
    const politicaAdelantoDefinida = false;
    const permitePendienteConVoucher = false;
    const porcentajeExigible = 50;
    motivosPendientes.push('POLITICA_ADELANTO_PENDIENTE');

    let totalPagadoNum = 0;
    let totalConciliadoNum = 0;
    // Cada pago se suma una sola vez
    for (const p of eligiblePayments) {
      const tieneVoucherValidado = p.evidencias.some((e) => e.estadoDoc === 'VALIDADA');
      if (p.estado === 'CONCILIADO') {
        totalPagadoNum += p.monto;
        totalConciliadoNum += p.monto;
      } else if (p.estado === 'PENDIENTE_CONCILIACION') {
        if (permitePendienteConVoucher && tieneVoucherValidado) {
          totalPagadoNum += p.monto;
        }
      }
    }

    const adelantoRequeridoNum = Number(((res.montoAcordado * porcentajeExigible) / 100).toFixed(2));
    const adelantoCubierto =
      res.origen !== 'DIRECTO' ||
      (politicaAdelantoDefinida && totalPagadoNum >= adelantoRequeridoNum && adelantoRequeridoNum > 0);
    if (politicaAdelantoDefinida && !adelantoCubierto) {
      motivosPendientes.push('ADELANTO_INSUFICIENTE');
    }

    const adelantoConciliado = totalConciliadoNum >= adelantoRequeridoNum && adelantoRequeridoNum > 0;

    const availability = await this.checkAvailability(res.propiedadId, res.ingreso, res.salida, res.id);
    const disponibilidadValida = availability.disponible;
    if (!disponibilidadValida) motivosPendientes.push('DISPONIBILIDAD_NO_VALIDA');

    const puedeConfirmar =
      reservaApta &&
      contratoFirmado &&
      pagoRegistrado &&
      evidenciaAdelanto &&
      evidenciaRevisada &&
      politicaAdelantoDefinida &&
      adelantoCubierto &&
      disponibilidadValida;

    return {
      reservaId,
      puedeConfirmar,
      requisitos: {
        reservaApta,
        contratoFirmado,
        pagoRegistrado,
        evidenciaAdelanto,
        evidenciaRevisada,
        adelantoCubierto,
        adelantoConciliado,
        politicaAdelantoDefinida,
        disponibilidadValida,
      },
      motivosPendientes,
      detalles: {
        montoAcordado: res.montoAcordado.toFixed(2),
        totalPagado: totalPagadoNum.toFixed(2),
        totalConciliado: totalConciliadoNum.toFixed(2),
        moneda: res.moneda,
        adelantoRequerido: adelantoRequeridoNum.toFixed(2),
        porcentajeAplicado: porcentajeExigible,
        versionPolitica:
          politicaAdelantoDefinida ? 'HABITUAL_50_V1' : 'PENDIENTE_APROBACION',
        contratosCount: activeContracts.length,
        pagosCount: eligiblePayments.length,
        evidenciasCount: eligiblePayments.reduce((acc, p) => acc + p.evidencias.length, 0),
        evidenciasRevisadasCount: paymentsWithValidEvidence.length,
      },
    };
  }

  public async cancelReservation(id: string, motivo?: string): Promise<Reservation> {
    const index = this.reservations.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Reserva no encontrada con ID: ${id}`);
    }

    const current = this.reservations[index];

    if (current.estado === 'CANCELADA') {
      return JSON.parse(JSON.stringify(current));
    }

    // Cancelar la reserva cambia estado y libera disponibilidad inmediatamente
    const updated: Reservation = {
      ...current,
      estado: 'CANCELADA',
      motivoCancelacion: motivo?.trim() || 'Cancelación solicitada por el usuario.',
      actualizadaEn: new Date().toISOString(),
    };

    this.reservations[index] = updated;
    return JSON.parse(JSON.stringify(updated));
  }
}

export { MockReservationService };

export class ApiReservationService implements IReservationService {
  public async getReservations(filters?: ReservationFilterParams): Promise<Reservation[]> {
    const params = new URLSearchParams();
    if (filters?.propiedadId && filters.propiedadId !== 'TODAS') {
      params.set('propiedadId', filters.propiedadId);
    }
    if (filters?.huespedId && filters.huespedId !== 'TODOS') {
      params.set('huespedId', filters.huespedId);
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
    if (filters?.search) {
      params.set('search', filters.search);
    }

    const qs = params.toString();
    return apiClient<Reservation[]>(`/api/reservas${qs ? `?${qs}` : ''}`);
  }

  public async getReservationById(id: string): Promise<Reservation | null> {
    try {
      return await apiClient<Reservation>(`/api/reservas/${encodeURIComponent(id)}`);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  public async getReservationsByGuestId(guestId: string): Promise<Reservation[]> {
    return apiClient<Reservation[]>(`/api/reservas?huespedId=${encodeURIComponent(guestId)}`);
  }

  public async getReservationsByPropertyId(propiedadId: string): Promise<Reservation[]> {
    return apiClient<Reservation[]>(`/api/reservas?propiedadId=${encodeURIComponent(propiedadId)}`);
  }

  public async checkAvailability(
    propiedadId: string,
    ingreso: string,
    salida: string,
    excludeReservationId?: string
  ): Promise<AvailabilityCheckResult> {
    const params = new URLSearchParams({ ingreso, salida });
    if (excludeReservationId) {
      params.set('excludeReservationId', excludeReservationId);
    }
    return apiClient<AvailabilityCheckResult>(
      `/api/propiedades/${encodeURIComponent(propiedadId)}/disponibilidad?${params.toString()}`
    );
  }

  public async createReservation(dto: CreateReservationDto): Promise<Reservation> {
    const validation = validateReservationPayload(dto);
    if (!validation.isValid) {
      const errorMsg = Object.values(validation.errors).join(' ');
      throw new Error(`Error de validación: ${errorMsg}`);
    }

    return apiClient<Reservation>('/api/reservas', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  public async updateReservationDates(
    id: string,
    dto: UpdateReservationDatesDto
  ): Promise<Reservation> {
    const dateCheck = validateReservationDates(dto.ingreso, dto.salida);
    if (!dateCheck.isValid) {
      throw new Error(dateCheck.error || 'Fechas inválidas.');
    }

    return apiClient<Reservation>(`/api/reservas/${encodeURIComponent(id)}/fechas`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  // DR02-01: El cliente no envía autoridad comercial en body ni query
  public async confirmReservation(id: string): Promise<Reservation> {
    return apiClient<Reservation>(`/api/reservas/${encodeURIComponent(id)}/confirmar`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  public async getContracts(reservaId: string): Promise<ReservationContract[]> {
    const res = await apiClient<{ data: ReservationContract[] }>(
      `/api/reservas/${encodeURIComponent(reservaId)}/contratos`
    );
    return res.data;
  }

  public async createContract(reservaId: string, dto: CreateContractDto): Promise<ReservationContract> {
    const res = await apiClient<{ data: ReservationContract }>(
      `/api/reservas/${encodeURIComponent(reservaId)}/contratos`,
      {
        method: 'POST',
        body: JSON.stringify(dto),
      }
    );
    return res.data;
  }

  // DR02-01: El cliente no envía política comercial en query params
  public async getConfirmationRequirements(
    reservaId: string
  ): Promise<ConfirmationRequirementsResult> {
    const res = await apiClient<{ data: ConfirmationRequirementsResult }>(
      `/api/reservas/${encodeURIComponent(reservaId)}/requisitos-confirmacion`
    );
    return res.data;
  }

  public async cancelReservation(id: string, motivo?: string): Promise<Reservation> {
    return apiClient<Reservation>(`/api/reservas/${encodeURIComponent(id)}/cancelar`, {
      method: 'POST',
      body: JSON.stringify({ motivo }),
    });
  }

  public reset(): void {
    // No-op en API mode
  }
}

export const reservationService: IReservationService = isMockMode()
  ? new MockReservationService()
  : new ApiReservationService();

// Conectar fuente única de datos: el detalle del huésped consulta dinámicamente este almacén
guestService.setReservationProvider(async (guestId: string) => {
  const reservations = await reservationService.getReservationsByGuestId(guestId);
  return reservations.map((r) => ({
    id: r.id,
    propiedadId: r.propiedadId,
    propiedadNombre: r.propiedadNombre,
    ingreso: r.ingreso,
    salida: r.salida,
    estado: r.estado,
    montoTotal: r.montoAcordado.toFixed(2),
    moneda: r.moneda,
  }));
});
