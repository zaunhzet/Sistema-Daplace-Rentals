/**
 * DAPLACE RENTALS — Servicio de Orquestación para Catálogo y Solicitud Pública (HU-01 / HU-02)
 *
 * ARQUITECTURA Y GOBERNANZA:
 * 1. Fuente única de verdad: Reutiliza directamente propertyService, guestService y reservationService.
 *    No crea catálogos paralelos ni almacenes duplicados de reservas.
 * 2. Privacidad de datos: Filtra y expone únicamente propiedades activas, operativas y publicadas,
 *    eliminando campos sensibles de propietarios (propietarioId, propietarioNombre) e información contable.
 * 3. Semántica de solicitud: Registra la reserva en estado SOLICITADA. No confirma automáticamente.
 * 4. Manejo de fallas parciales (Preparación para Backend Fastify/PostgreSQL):
 *    En el backend definitivo, la búsqueda/creación del huésped y el registro de la solicitud de reserva
 *    se ejecutarán dentro de una transacción PostgreSQL única (BEGIN ... COMMIT) con bloqueo de filas
 *    sobre la disponibilidad del inmueble, garantizando atomicidad y rollback total ante cualquier falla.
 */

import { propertyService } from '../../properties/services/propertyService';
import { guestService } from '../../guests/services/guestService';
import { reservationService, calculateNights, validateReservationDates } from '../../reservations/services/reservationService';
import type { Property } from '../../properties/types';
import type {
  PublicAvailabilityCheck,
  PublicBookingRequestDto,
  PublicBookingResult,
  PublicBookingValidationResult,
  PublicProperty,
} from '../types';

export function validatePublicBookingDto(dto: Partial<PublicBookingRequestDto>): PublicBookingValidationResult {
  const errors: Record<string, string> = {};

  if (!dto.propiedadId || dto.propiedadId.trim() === '') {
    errors.propiedadId = 'Debe seleccionar un inmueble del catálogo.';
  }

  if (!dto.ingreso) {
    errors.ingreso = 'La fecha de llegada (check-in) es obligatoria.';
  }

  if (!dto.salida) {
    errors.salida = 'La fecha de salida (check-out) es obligatoria.';
  }

  if (dto.ingreso && dto.salida) {
    const dateCheck = validateReservationDates(dto.ingreso, dto.salida);
    if (!dateCheck.isValid && dateCheck.error) {
      errors.fechas = dateCheck.error;
    }
  }

  const nombre = dto.huespedNombre?.trim() || '';
  if (nombre.length < 3) {
    errors.huespedNombre = 'Por favor ingrese su nombre y apellido completo (mínimo 3 caracteres).';
  }

  const email = dto.huespedEmail?.trim() || '';
  const telefono = dto.huespedTelefono?.trim() || '';

  if (!email && !telefono) {
    errors.contacto = 'Debe ingresar al menos un medio de contacto (correo electrónico o teléfono WhatsApp).';
  }

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.email = 'El formato del correo electrónico ingresado no es válido.';
    }
  }

  if (telefono && telefono.length < 6) {
    errors.telefono = 'El teléfono de contacto debe contener al menos 6 dígitos.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface IPublicBookingService {
  getPublicCatalog(search?: string): Promise<PublicProperty[]>;
  getPublicPropertyById(id: string): Promise<PublicProperty | null>;
  checkPublicAvailability(
    propiedadId: string,
    ingreso: string,
    salida: string
  ): Promise<PublicAvailabilityCheck>;
  submitPublicBookingRequest(dto: PublicBookingRequestDto): Promise<PublicBookingResult>;
}

class PublicBookingService implements IPublicBookingService {
  /**
   * Transforma una entidad interna de Propiedad en su proyección pública protegida.
   * Elimina cualquier dato sensible del propietario o finanzas internas.
   */
  private toPublicProperty(p: Property): PublicProperty {
    return {
      id: p.id,
      nombre: p.nombre,
      direccion: p.direccion,
      capacidadHuespedes: p.capacidadHuespedes || 2,
      precioBaseNoche: p.precioBaseNoche || 150,
      moneda: p.moneda || 'PEN',
      activa: p.activa,
    };
  }

  /**
   * Catálogo público: retorna exclusivamente propiedades activas, operativas y publicadas.
   */
  public async getPublicCatalog(search?: string): Promise<PublicProperty[]> {
    const properties = await propertyService.getProperties({
      estadoOperativo: 'OPERATIVA',
      estadoPublicacion: 'PUBLICADA',
      soloActivas: true,
    });

    // Filtro adicional de seguridad: verificar que cumpla estrictamente los 3 criterios
    const filtered = properties.filter(
      (p) => p.activa && p.estadoOperativo === 'OPERATIVA' && p.estadoPublicacion === 'PUBLICADA'
    );

    const publicProperties = filtered.map((p) => this.toPublicProperty(p));

    if (!search || search.trim() === '') {
      return publicProperties;
    }

    const query = search.trim().toLowerCase();
    return publicProperties.filter(
      (p) =>
        p.nombre.toLowerCase().includes(query) ||
        p.direccion.toLowerCase().includes(query)
    );
  }

  /**
   * Obtiene una propiedad específica para vista pública.
   * Retorna null si no existe o si no está en estado de publicación activa y operativa.
   */
  public async getPublicPropertyById(id: string): Promise<PublicProperty | null> {
    const property = await propertyService.getPropertyById(id);
    if (!property) return null;

    if (!property.activa || property.estadoOperativo !== 'OPERATIVA' || property.estadoPublicacion !== 'PUBLICADA') {
      return null;
    }

    return this.toPublicProperty(property);
  }

  /**
   * Consulta disponibilidad pública para un rango [ingreso, salida).
   */
  public async checkPublicAvailability(
    propiedadId: string,
    ingreso: string,
    salida: string
  ): Promise<PublicAvailabilityCheck> {
    const property = await this.getPublicPropertyById(propiedadId);
    if (!property) {
      return {
        disponible: false,
        motivo: 'El inmueble seleccionado no está disponible en el catálogo público.',
      };
    }

    const dateValidation = validateReservationDates(ingreso, salida);
    if (!dateValidation.isValid) {
      return {
        disponible: false,
        motivo: dateValidation.error || 'Fechas de estancia inválidas.',
      };
    }

    const avail = await reservationService.checkAvailability(propiedadId, ingreso, salida);
    const noches = calculateNights(ingreso, salida);
    const precioEstimado = noches * property.precioBaseNoche;

    return {
      disponible: avail.disponible,
      motivo: avail.disponible ? undefined : 'Las fechas seleccionadas ya no están disponibles para este inmueble.',
      noches,
      precioEstimado,
      moneda: property.moneda,
    };
  }

  /**
   * Orquestación de la solicitud pública de reserva (HU-02):
   * 1. Valida payload de entrada.
   * 2. Verifica disponibilidad de fechas.
   * 3. Busca o registra el huésped en guestService.
   * 4. Registra la solicitud de reserva en estado SOLICITADA.
   * 5. Retorna acuse de recibo con código identificador y advertencia de confirmación pendiente.
   */
  public async submitPublicBookingRequest(dto: PublicBookingRequestDto): Promise<PublicBookingResult> {
    // 1. Validación de entradas
    const validation = validatePublicBookingDto(dto);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0] || 'Datos de solicitud inválidos.';
      throw new Error(firstError);
    }

    // 2. Verificar que el inmueble exista y sea público
    const property = await this.getPublicPropertyById(dto.propiedadId);
    if (!property) {
      throw new Error('El inmueble seleccionado no está disponible para reserva pública.');
    }

    // 3. Verificar disponibilidad en el rango [ingreso, salida)
    const avail = await reservationService.checkAvailability(dto.propiedadId, dto.ingreso, dto.salida);
    if (!avail.disponible) {
      throw new Error('El inmueble ya no está disponible en las fechas solicitadas. Por favor seleccione otro rango.');
    }

    // 4. Identificar o registrar al huésped (Reutiliza guestService)
    const allGuests = await guestService.getGuests();
    const cleanEmail = dto.huespedEmail?.trim().toLowerCase();
    const cleanPhone = dto.huespedTelefono?.trim();

    let guestId: string | null = null;
    const existingGuest = allGuests.find((g) => {
      if (cleanEmail && g.email && g.email.toLowerCase() === cleanEmail) return true;
      if (cleanPhone && g.telefono && g.telefono === cleanPhone) return true;
      return false;
    });

    if (existingGuest) {
      guestId = existingGuest.id;
    } else {
      const newGuest = await guestService.createGuest({
        nombreCompleto: dto.huespedNombre.trim(),
        email: cleanEmail || undefined,
        telefono: cleanPhone || undefined,
        tipoDocumento: 'OTRO',
        numeroDocumento: dto.huespedDocumento?.trim() || 'REGISTRO-WEB',
        notas: 'Huésped registrado vía portal público de reservas (HU-02).',
      });
      guestId = newGuest.id;
    }

    if (!guestId) {
      throw new Error('No se pudo identificar o registrar al huésped para la solicitud.');
    }

    // 5. Calcular valores de la solicitud
    const noches = calculateNights(dto.ingreso, dto.salida);
    const montoEstimado = noches * property.precioBaseNoche;

    // 6. Registrar la reserva en estado SOLICITADA
    const createdReservation = await reservationService.createReservation({
      propiedadId: property.id,
      huespedId: guestId,
      ingreso: dto.ingreso,
      salida: dto.salida,
      montoAcordado: montoEstimado,
      moneda: property.moneda,
      origen: 'WEB',
      notas: dto.observaciones?.trim()
        ? `[Portal Web]: ${dto.observaciones.trim()}`
        : 'Solicitud ingresada desde el catálogo público de la web.',
    });

    return {
      success: true,
      reservaId: createdReservation.id,
      estado: 'SOLICITADA',
      propiedadId: property.id,
      propiedadNombre: property.nombre,
      ingreso: createdReservation.ingreso,
      salida: createdReservation.salida,
      noches,
      montoEstimado,
      moneda: property.moneda,
      huespedNombre: dto.huespedNombre.trim(),
      mensaje: `¡Solicitud de reserva recibida con éxito! Código de seguimiento: ${createdReservation.id}.`,
      avisoConfirmacion:
        'Tu solicitud está en estado SOLICITADA. Un operador de DAPLACE revisará tu solicitud y se pondrá en contacto contigo para coordinar la confirmación y el adelanto de la estancia.',
    };
  }
}

export const publicBookingService = new PublicBookingService();
