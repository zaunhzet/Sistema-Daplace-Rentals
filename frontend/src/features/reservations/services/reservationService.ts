import type {
  AvailabilityCheckResult,
  CreateReservationDto,
  Reservation,
  ReservationFilterParams,
  ReservationValidationResult,
  UpdateReservationDatesDto,
} from '../types';
import { INITIAL_RESERVATIONS_MOCK } from './mockReservations';
import { propertyService } from '../../properties/services/propertyService';
import { guestService } from '../../guests/services/guestService';

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
  reset(): void;
}

class MockReservationService implements IReservationService {
  private reservations: Reservation[] = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.reservations = JSON.parse(JSON.stringify(INITIAL_RESERVATIONS_MOCK));
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

export const reservationService: IReservationService = new MockReservationService();

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
