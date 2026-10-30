import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';
import { requireAuth } from '../shared/auth.js';
import {
  evaluateConfirmationRequirements,
  defaultPoliticaAdelantoProvider,
  type PoliticaAdelantoProvider,
} from '../modules/reservations/confirmationRequirements.js';
import {
  defaultExpirationPolicyProvider,
  resolveExpirationForReservation,
  type ExpirationPolicyProvider,
} from '../modules/reservations/expirationPolicy.js';
import {
  productionExpirationClock,
  type ExpirationClock,
} from '../modules/reservations/expirationClock.js';
import { expireLockedReservation } from '../modules/reservations/expirationService.js';
import { scheduleExpirationNotice } from '../modules/reservations/expirationNoticeService.js';

const ALLOWED_RESERVATION_ORIGINS = ['WEB', 'DIRECTO', 'AIRBNB'] as const;
const ALLOWED_CURRENCIES = ['PEN', 'USD'] as const;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;

const FORBIDDEN_POLICY_PARAMS = [
  'politicaAdelanto',
  'politicaTipo',
  'porcentajeExigible',
  'versionPolitica',
  'esExcepcion',
  'autorizadoPorId',
  'plazoIniciadoEn',
  'venceEn',
  'politicaPlazoVersion',
  'politicaPlazoSnapshot',
  'avisoProgramadoEn',
  'expiradaEn',
  'duracionMs',
];

export function hasClientCommercialAuthority(req: { body?: any; query?: any }): boolean {
  const checkObj = (obj: any): boolean => {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of FORBIDDEN_POLICY_PARAMS) {
      if (key in obj && obj[key] !== undefined && obj[key] !== null) return true;
    }
    return false;
  };
  return checkObj(req.body) || checkObj(req.query);
}

export function calculateNights(ingreso: string, salida: string): number {
  const [y1, m1, d1] = ingreso.split('-').map(Number);
  const [y2, m2, d2] = salida.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

/**
 * Valida minuciosamente que las fechas de ingreso y salida cumplan con:
 * 1. Formato estricto YYYY-MM-DD.
 * 2. Existencia real en el calendario (rechaza días inexistentes como 2026-02-30 o 2026-04-31).
 * 3. Intervalo semiabierto [ingreso, salida) con salida estrictamente posterior al ingreso (mínimo 1 noche).
 */
export function validateReservationDates(
  ingreso: string,
  salida: string
): { isValid: boolean; error?: string } {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(ingreso) || !dateRegex.test(salida)) {
    return { isValid: false, error: 'Las fechas deben tener formato YYYY-MM-DD.' };
  }

  const [y1, m1, d1] = ingreso.split('-').map(Number);
  const [y2, m2, d2] = salida.split('-').map(Number);

  if (m1 < 1 || m1 > 12 || d1 < 1 || d1 > 31) {
    return { isValid: false, error: `La fecha de ingreso "${ingreso}" contiene valores de mes o día fuera de rango.` };
  }

  if (m2 < 1 || m2 > 12 || d2 < 1 || d2 > 31) {
    return { isValid: false, error: `La fecha de salida "${salida}" contiene valores de mes o día fuera de rango.` };
  }

  // Validación de día real en calendario UTC (comprueba que Date no haya hecho rollover)
  const date1 = new Date(Date.UTC(y1, m1 - 1, d1));
  if (date1.getUTCFullYear() !== y1 || date1.getUTCMonth() !== m1 - 1 || date1.getUTCDate() !== d1) {
    return { isValid: false, error: `La fecha de ingreso "${ingreso}" no corresponde a un día real en el calendario.` };
  }

  const date2 = new Date(Date.UTC(y2, m2 - 1, d2));
  if (date2.getUTCFullYear() !== y2 || date2.getUTCMonth() !== m2 - 1 || date2.getUTCDate() !== d2) {
    return { isValid: false, error: `La fecha de salida "${salida}" no corresponde a un día real en el calendario.` };
  }

  const noches = calculateNights(ingreso, salida);
  if (noches <= 0) {
    return {
      isValid: false,
      error: 'La fecha de salida debe ser estrictamente posterior a la fecha de ingreso (mínimo 1 noche).',
    };
  }

  return { isValid: true };
}

export function registerReservationsRoutes(
  prisma: PrismaClient,
  politicaAdelantoProvider?: PoliticaAdelantoProvider,
  expirationPolicyProvider?: ExpirationPolicyProvider,
  expirationClock?: ExpirationClock
): FastifyPluginAsync {
  const effectiveExpirationProvider = expirationPolicyProvider || defaultExpirationPolicyProvider;
  const effectiveClock = expirationClock || productionExpirationClock;

  return async (app) => {
    // 1. Consultar disponibilidad de una propiedad en un intervalo [ingreso, salida)
    // Endpoint público (no requiere sesión para cotizar), con PRIVACIDAD ESTRICTA (no revela datos internos)
    app.get<{
      Params: { id: string };
      Querystring: { ingreso: string; salida: string; excludeReservationId?: string };
    }>('/api/propiedades/:id/disponibilidad', async (request, reply) => {
      const { id: propiedadId } = request.params;
      const { ingreso, salida, excludeReservationId } = request.query;

      if (!ingreso || !salida) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Los parámetros "ingreso" y "salida" son obligatorios (formato YYYY-MM-DD).',
            requestId: request.id,
          },
        });
      }

      const dateValidation = validateReservationDates(ingreso, salida);
      if (!dateValidation.isValid) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: dateValidation.error,
            requestId: request.id,
          },
        });
      }

      const propiedad = await prisma.propiedad.findUnique({
        where: { id: propiedadId },
      });

      if (!propiedad) {
        return reply.status(404).send({
          error: {
            code: 'PROPERTY_NOT_FOUND',
            message: `Propiedad no encontrada con ID "${propiedadId}".`,
            requestId: request.id,
          },
        });
      }

      if (!propiedad.activa || propiedad.estadoOperativo === 'INACTIVA') {
        return {
          propiedadId,
          disponible: false,
          motivo: 'La propiedad se encuentra inactiva y no admite reservas.',
          intervalo: { ingreso, salida },
        };
      }

      if (propiedad.estadoOperativo === 'EN_MANTENIMIENTO') {
        return {
          propiedadId,
          disponible: false,
          motivo: 'La propiedad se encuentra en mantenimiento operativo.',
          intervalo: { ingreso, salida },
        };
      }

      const [y1, m1, d1] = ingreso.split('-').map(Number);
      const [y2, m2, d2] = salida.split('-').map(Number);
      const ingresoDate = new Date(Date.UTC(y1, m1 - 1, d1));
      const salidaDate = new Date(Date.UTC(y2, m2 - 1, d2));

      // Comprobar solapes contra reservas bloqueantes
      const conflicto = await prisma.reserva.findFirst({
        where: {
          propiedadId,
          estado: { in: ['SOLICITADA', 'CONFIRMADA', 'COMPLETADA'] },
          id: excludeReservationId ? { not: excludeReservationId } : undefined,
          ingreso: { lt: salidaDate },
          salida: { gt: ingresoDate },
        },
      });

      if (conflicto) {
        // Regla de privacidad: Jamás exponer identificadores, nombres ni detalles de otras reservas
        return {
          propiedadId,
          disponible: false,
          motivo: 'Las fechas seleccionadas no están disponibles para esta propiedad.',
          intervalo: { ingreso, salida },
        };
      }

      return {
        propiedadId,
        disponible: true,
        intervalo: { ingreso, salida },
      };
    });

    // 2. Listar reservas con filtros (Staff administrativo)
    app.get<{
      Querystring: {
        propiedadId?: string;
        huespedId?: string;
        estado?: string;
        desde?: string;
        hasta?: string;
        search?: string;
      };
    }>(
      '/api/reservas',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request) => {
        const { propiedadId, huespedId, estado, desde, hasta, search } = request.query;

        const where: any = {};

        if (propiedadId && propiedadId !== 'TODAS') {
          where.propiedadId = propiedadId;
        }

        if (huespedId && huespedId !== 'TODOS') {
          where.huespedId = huespedId;
        }

        if (estado && estado !== 'TODOS') {
          where.estado = estado;
        }

        if (desde) {
          where.ingreso = { ...(where.ingreso || {}), gte: new Date(`${desde}T00:00:00Z`) };
        }

        if (hasta) {
          where.salida = { ...(where.salida || {}), lte: new Date(`${hasta}T00:00:00Z`) };
        }

        if (search && search.trim() !== '') {
          const q = search.trim();
          where.OR = [
            { id: { contains: q, mode: 'insensitive' } },
            { propiedad: { nombre: { contains: q, mode: 'insensitive' } } },
            { huesped: { nombreCompleto: { contains: q, mode: 'insensitive' } } },
            { referenciaCanal: { contains: q, mode: 'insensitive' } },
          ];
        }

        const reservas = await prisma.reserva.findMany({
          where,
          include: {
            propiedad: { select: { id: true, nombre: true } },
            huesped: { select: { id: true, nombreCompleto: true, email: true, telefono: true } },
          },
          orderBy: { ingreso: 'desc' },
        });

        return reservas.map((r) => ({
          id: r.id,
          propiedadId: r.propiedadId,
          propiedadNombre: r.propiedad.nombre,
          huespedId: r.huespedId,
          huespedNombre: r.huesped.nombreCompleto,
          huespedContacto: r.huesped.telefono || r.huesped.email || undefined,
          ingreso: r.ingreso.toISOString().slice(0, 10),
          salida: r.salida.toISOString().slice(0, 10),
          noches: r.noches,
          estado: r.estado,
          montoAcordado: Number(r.montoAcordado),
          moneda: r.moneda,
          origen: r.origen,
          referenciaCanal: r.referenciaCanal || undefined,
          notas: r.notas || undefined,
          motivoCancelacion: r.motivoCancelacion || undefined,
          plazoIniciadoEn: r.plazoIniciadoEn ? r.plazoIniciadoEn.toISOString() : undefined,
          venceEn: r.venceEn ? r.venceEn.toISOString() : undefined,
          politicaPlazoVersion: r.politicaPlazoVersion || undefined,
          politicaPlazoSnapshot: r.politicaPlazoSnapshot || undefined,
          avisoProgramadoEn: r.avisoProgramadoEn ? r.avisoProgramadoEn.toISOString() : undefined,
          expiradaEn: r.expiradaEn ? r.expiradaEn.toISOString() : undefined,
          creadaEn: r.creadaEn.toISOString(),
          actualizadaEn: r.actualizadaEn.toISOString(),
        }));
      }
    );

    // 3. Consultar detalle de reserva
    app.get<{ Params: { id: string } }>(
      '/api/reservas/:id',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const { id } = request.params;

        const r = await prisma.reserva.findUnique({
          where: { id },
          include: {
            propiedad: { select: { id: true, nombre: true, direccion: true } },
            huesped: { select: { id: true, nombreCompleto: true, email: true, telefono: true, tipoDocumento: true, numeroDocumento: true } },
          },
        });

        if (!r) {
          return reply.status(404).send({
            error: {
              code: 'RESERVATION_NOT_FOUND',
              message: `Reserva no encontrada con ID "${id}".`,
              requestId: request.id,
            },
          });
        }

        return {
          id: r.id,
          propiedadId: r.propiedadId,
          propiedadNombre: r.propiedad.nombre,
          huespedId: r.huespedId,
          huespedNombre: r.huesped.nombreCompleto,
          huespedContacto: r.huesped.telefono || r.huesped.email || undefined,
          ingreso: r.ingreso.toISOString().slice(0, 10),
          salida: r.salida.toISOString().slice(0, 10),
          noches: r.noches,
          estado: r.estado,
          montoAcordado: Number(r.montoAcordado),
          moneda: r.moneda,
          origen: r.origen,
          referenciaCanal: r.referenciaCanal || undefined,
          notas: r.notas || undefined,
          motivoCancelacion: r.motivoCancelacion || undefined,
          plazoIniciadoEn: r.plazoIniciadoEn ? r.plazoIniciadoEn.toISOString() : undefined,
          venceEn: r.venceEn ? r.venceEn.toISOString() : undefined,
          politicaPlazoVersion: r.politicaPlazoVersion || undefined,
          politicaPlazoSnapshot: r.politicaPlazoSnapshot || undefined,
          avisoProgramadoEn: r.avisoProgramadoEn ? r.avisoProgramadoEn.toISOString() : undefined,
          expiradaEn: r.expiradaEn ? r.expiradaEn.toISOString() : undefined,
          creadaEn: r.creadaEn.toISOString(),
          actualizadaEn: r.actualizadaEn.toISOString(),
        };
      }
    );

    // 4. Crear reserva (con protección transaccional, auditoría y exclusion constraint)
    app.post<{
      Body: {
        id?: string;
        propiedadId: string;
        huespedId: string;
        ingreso: string;
        salida: string;
        montoAcordado: number;
        moneda?: string;
        origen?: 'WEB' | 'DIRECTO' | 'AIRBNB';
        referenciaCanal?: string;
        notas?: string;
      };
    }>(
      '/api/reservas',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const {
          id,
          propiedadId,
          huespedId,
          ingreso,
          salida,
          montoAcordado,
          moneda = 'PEN',
          origen = 'WEB',
          referenciaCanal,
          notas,
        } = request.body || {};

        if (id && (!SAFE_ID_REGEX.test(id) || id.length > 64)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El identificador id contiene caracteres no válidos o longitud excedida.',
              requestId: request.id,
            },
          });
        }

        if (!propiedadId || !huespedId || !ingreso || !salida) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los campos propiedadId, huespedId, ingreso y salida son obligatorios.',
              requestId: request.id,
            },
          });
        }

        const dateValidation = validateReservationDates(ingreso, salida);
        if (!dateValidation.isValid) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: dateValidation.error,
              requestId: request.id,
            },
          });
        }

        const numMonto = Number(montoAcordado);
        if (!Number.isFinite(numMonto) || numMonto <= 0) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El monto acordado debe ser un número finito mayor a 0.',
              requestId: request.id,
            },
          });
        }

        if (!ALLOWED_CURRENCIES.includes(moneda as any)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `La moneda debe ser una de: ${ALLOWED_CURRENCIES.join(', ')}.`,
              requestId: request.id,
            },
          });
        }

        if (!ALLOWED_RESERVATION_ORIGINS.includes(origen as any)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `El origen debe ser uno de: ${ALLOWED_RESERVATION_ORIGINS.join(', ')}.`,
              requestId: request.id,
            },
          });
        }

        const [y1, m1, d1] = ingreso.split('-').map(Number);
        const [y2, m2, d2] = salida.split('-').map(Number);
        const ingresoDate = new Date(Date.UTC(y1, m1 - 1, d1));
        const salidaDate = new Date(Date.UTC(y2, m2 - 1, d2));
        const noches = calculateNights(ingreso, salida);
        const actorId = request.user!.id;

        try {
          const result = await prisma.$transaction(async (tx) => {
            // A. Verificar propiedad
            const propiedad = await tx.propiedad.findUnique({ where: { id: propiedadId } });
            if (!propiedad) {
              const err = new Error(`Propiedad no encontrada con ID "${propiedadId}".`);
              (err as any).statusCode = 404;
              (err as any).code = 'PROPERTY_NOT_FOUND';
              throw err;
            }

            if (!propiedad.activa || propiedad.estadoOperativo === 'INACTIVA') {
              const err = new Error(`La propiedad "${propiedad.nombre}" está inactiva y no admite reservas.`);
              (err as any).statusCode = 409;
              (err as any).code = 'PROPERTY_INACTIVE';
              throw err;
            }

            if (propiedad.estadoOperativo === 'EN_MANTENIMIENTO') {
              const err = new Error(`La propiedad "${propiedad.nombre}" está en mantenimiento operativo.`);
              (err as any).statusCode = 409;
              (err as any).code = 'PROPERTY_IN_MAINTENANCE';
              throw err;
            }

            // B. Verificar huésped
            const huesped = await tx.huesped.findUnique({ where: { id: huespedId } });
            if (!huesped) {
              const err = new Error(`Huésped no encontrado con ID "${huespedId}".`);
              (err as any).statusCode = 404;
              (err as any).code = 'GUEST_NOT_FOUND';
              throw err;
            }

            // C. Verificación de solape previa
            const conflictoPrevio = await tx.reserva.findFirst({
              where: {
                propiedadId,
                estado: { in: ['SOLICITADA', 'CONFIRMADA', 'COMPLETADA'] },
                ingreso: { lt: salidaDate },
                salida: { gt: ingresoDate },
              },
            });

            if (conflictoPrevio) {
              const err = new Error('Las fechas solicitadas ya no están disponibles en la base de datos (solapamiento detectado).');
              (err as any).statusCode = 409;
              (err as any).code = 'RESERVATION_CONFLICT';
              throw err;
            }

            // D. Resolver política de expiración backend (inmune a parámetros del cliente)
            const policy = await effectiveExpirationProvider({ origen, propiedadId });
            const now = await effectiveClock.now(tx);
            const expirationCalc = resolveExpirationForReservation(policy, {
              origen,
              now,
              clientPayload: request.body as any,
            });

            // E. Creación de la reserva en PostgreSQL
            const created = await tx.reserva.create({
              data: {
                ...(id ? { id } : {}),
                propiedadId,
                huespedId,
                ingreso: ingresoDate,
                salida: salidaDate,
                noches,
                estado: 'SOLICITADA',
                montoAcordado: numMonto,
                moneda,
                origen,
                referenciaCanal: referenciaCanal?.trim() || null,
                notas: notas?.trim() || null,
                plazoIniciadoEn: expirationCalc.aplica ? expirationCalc.plazoIniciadoEn : null,
                venceEn: expirationCalc.aplica ? expirationCalc.venceEn : null,
                politicaPlazoVersion: expirationCalc.aplica ? expirationCalc.politicaPlazoVersion : null,
                politicaPlazoSnapshot: expirationCalc.aplica ? (expirationCalc.politicaPlazoSnapshot as any) : undefined,
                avisoProgramadoEn: expirationCalc.aplica ? expirationCalc.avisoProgramadoEn : null,
              },
              include: {
                propiedad: { select: { nombre: true } },
                huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
              },
            });

            // F. Planificar aviso durable si la política configuró aviso previo con canal y plantilla explícitos
            if (
              expirationCalc.aplica &&
              expirationCalc.avisoProgramadoEn &&
              expirationCalc.venceEn &&
              expirationCalc.canalAviso &&
              expirationCalc.plantillaAviso
            ) {
              await scheduleExpirationNotice(tx, {
                reservaId: created.id,
                tipoAviso: 'EXPIRACION_PROXIMA',
                politicaVersion: expirationCalc.politicaPlazoVersion!,
                venceEnSnapshot: expirationCalc.venceEn,
                programadoPara: expirationCalc.avisoProgramadoEn,
                canal: expirationCalc.canalAviso,
                plantilla: expirationCalc.plantillaAviso,
              });
            }

            // G. Auditoría atómica en la misma transacción
            await recordAuditEvent(tx, {
              entidad: 'Reserva',
              entidadId: created.id,
              accion: 'CREAR_SOLICITUD_RESERVA',
              actor: actorId,
              motivo: 'Registro de solicitud de reserva',
              detalles: {
                propiedadId,
                huespedId,
                ingreso,
                salida,
                noches,
                montoAcordado: numMonto,
                plazoIniciadoEn: created.plazoIniciadoEn ? created.plazoIniciadoEn.toISOString() : null,
                venceEn: created.venceEn ? created.venceEn.toISOString() : null,
                politicaPlazoVersion: created.politicaPlazoVersion || null,
              },
              requestId: request.id,
            });

            return created;
          });

          return reply.status(201).send({
            id: result.id,
            propiedadId: result.propiedadId,
            propiedadNombre: result.propiedad.nombre,
            huespedId: result.huespedId,
            huespedNombre: result.huesped.nombreCompleto,
            huespedContacto: result.huesped.telefono || result.huesped.email || undefined,
            ingreso: result.ingreso.toISOString().slice(0, 10),
            salida: result.salida.toISOString().slice(0, 10),
            noches: result.noches,
            estado: result.estado,
            montoAcordado: Number(result.montoAcordado),
            moneda: result.moneda,
            origen: result.origen,
            referenciaCanal: result.referenciaCanal || undefined,
            notas: result.notas || undefined,
            plazoIniciadoEn: result.plazoIniciadoEn ? result.plazoIniciadoEn.toISOString() : undefined,
            venceEn: result.venceEn ? result.venceEn.toISOString() : undefined,
            politicaPlazoVersion: result.politicaPlazoVersion || undefined,
            politicaPlazoSnapshot: result.politicaPlazoSnapshot || undefined,
            avisoProgramadoEn: result.avisoProgramadoEn ? result.avisoProgramadoEn.toISOString() : undefined,
            expiradaEn: result.expiradaEn ? result.expiradaEn.toISOString() : undefined,
            creadaEn: result.creadaEn.toISOString(),
            actualizadaEn: result.actualizadaEn.toISOString(),
          });
        } catch (err: any) {
          if (
            err.code === '23P01' ||
            err.message?.includes('reservas_no_overlapping_excl') ||
            err.message?.includes('exclusion')
          ) {
            return reply.status(409).send({
              error: {
                code: 'RESERVATION_CONFLICT',
                message: 'Las fechas seleccionadas entran en conflicto con otra reserva existente sobre la propiedad.',
                details: [{ field: 'ingreso', code: 'OVERLAPPING_RESERVATION' }],
                requestId: request.id,
              },
            });
          }

          if (err.statusCode) {
            return reply.status(err.statusCode).send({
              error: {
                code: err.code || 'BAD_REQUEST',
                message: err.message,
                requestId: request.id,
              },
            });
          }

          throw err;
        }
      }
    );

    // 5. Confirmar reserva (POST /api/reservas/:id/confirmar)
    app.post<{
      Params: { id: string };
      Body?: Record<string, unknown>;
    }>(
      '/api/reservas/:id/confirmar',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const { id } = request.params;
        const actorId = request.user!.id;

        // DR02-01: Rechazo terminante de autoridad comercial del cliente
        if (hasClientCommercialAuthority(request)) {
          return reply.status(400).send({
            error: {
              code: 'CLIENT_POLICY_FORBIDDEN',
              message: 'No está permitido establecer políticas comerciales, porcentajes o excepciones desde el cliente.',
              requestId: request.id,
            },
          });
        }

        const effectiveProvider = politicaAdelantoProvider || defaultPoliticaAdelantoProvider;

        try {
          const updated = await prisma.$transaction(async (tx) => {
            // DR02-02: Bloqueo pesimista estricto en orden jerárquico estable para evitar carreras e interbloqueos:
            // 1. Bloquear primero la reserva
            await tx.$queryRaw`SELECT id FROM "reservas" WHERE id = ${id} FOR UPDATE;`;
            // 2. Bloquear después los pagos relevantes en orden determinístico ascendente por ID
            await tx.$queryRaw`SELECT id FROM "pagos" WHERE "reservaId" = ${id} ORDER BY id ASC FOR UPDATE;`;

            const reserva = await tx.reserva.findUnique({
              where: { id },
              include: {
                propiedad: { select: { nombre: true, activa: true, estadoOperativo: true } },
                huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
              },
            });

            if (!reserva) {
              const err = new Error(`Reserva no encontrada con ID "${id}".`);
              (err as any).statusCode = 404;
              (err as any).code = 'RESERVATION_NOT_FOUND';
              throw err;
            }

            if (reserva.estado === 'CONFIRMADA') {
              return { action: 'CONFIRMED' as const, reserva };
            }

            if (reserva.estado === 'CANCELADA') {
              const err = new Error('No es posible confirmar una reserva que ha sido cancelada.');
              (err as any).statusCode = 409;
              (err as any).code = 'INVALID_STATE_TRANSITION';
              throw err;
            }

            if (reserva.estado === 'COMPLETADA') {
              const err = new Error('No es posible confirmar una reserva que ya ha sido completada.');
              (err as any).statusCode = 409;
              (err as any).code = 'INVALID_STATE_TRANSITION';
              throw err;
            }

            if (reserva.estado === 'EXPIRADA') {
              const err = new Error('No es posible confirmar una solicitud de reserva que ya ha expirado.');
              (err as any).statusCode = 409;
              (err as any).code = 'RESERVATION_ALREADY_EXPIRED';
              throw err;
            }

            // Obtener instante exacto del reloj DESPUÉS de haber adquirido los bloqueos
            const now = await effectiveClock.now(tx);

            // Si la solicitud tiene plazo y ya ha vencido: expirar atómicamente y confirmar transacción
            if (reserva.venceEn && now.getTime() >= new Date(reserva.venceEn).getTime()) {
              await expireLockedReservation(tx, id, now, {
                actor: actorId,
                motivo: 'Solicitud expirada automáticamente por vencimiento de plazo al intentar confirmar.',
                requestId: request.id,
              });

              return {
                action: 'EXPIRED' as const,
                id,
                expiradaEn: now,
              };
            }

            // Para reservas de origen DIRECTO: evaluación estricta de requisitos verificables (DR-02)
            if (reserva.origen === 'DIRECTO') {
              // Obtener política del lado del servidor (proveedor compartido seguro)
              const serverPolitica = await effectiveProvider(id, tx);
              const evaluation = await evaluateConfirmationRequirements(
                tx,
                id,
                serverPolitica,
                { now }
              );

              if (!evaluation.puedeConfirmar) {
                const reqErr = new Error(
                  'La reserva directa no cumple con los requisitos obligatorios para confirmación.'
                );
                (reqErr as any).statusCode = 409;
                (reqErr as any).code = 'REQUIREMENTS_NOT_MET';
                (reqErr as any).motivosPendientes = evaluation.motivosPendientes;
                (reqErr as any).requisitos = evaluation.requisitos;
                throw reqErr;
              }
            }

            // Revalidar disponibilidad antes de confirmar
            const conflicto = await tx.reserva.findFirst({
              where: {
                propiedadId: reserva.propiedadId,
                id: { not: reserva.id },
                estado: { in: ['CONFIRMADA', 'SOLICITADA', 'COMPLETADA'] },
                ingreso: { lt: reserva.salida },
                salida: { gt: reserva.ingreso },
              },
            });

            if (conflicto) {
              const err = new Error('No se puede confirmar: las fechas entran en conflicto con otra reserva existente.');
              (err as any).statusCode = 409;
              (err as any).code = 'RESERVATION_CONFLICT';
              throw err;
            }

            const resUpdated = await tx.reserva.update({
              where: { id },
              data: { estado: 'CONFIRMADA' },
              include: {
                propiedad: { select: { nombre: true } },
                huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
              },
            });

            // Invalidar todos los avisos no entregados al confirmar
            await tx.$executeRawUnsafe(
              `UPDATE "avisos_reserva"
               SET "estado" = 'CANCELADO'::"EstadoAvisoReserva",
                   "canceladoEn" = $2::timestamptz,
                   "motivoCancelacion" = 'RESERVA_CONFIRMADA',
                   "leaseToken" = NULL,
                   "leaseVenceEn" = NULL,
                   "actualizadoEn" = $2::timestamptz
               WHERE "reservaId" = $1
                 AND "estado" IN ('PROGRAMADO'::"EstadoAvisoReserva", 'PENDIENTE'::"EstadoAvisoReserva", 'FALLIDO'::"EstadoAvisoReserva", 'EN_ENVIO'::"EstadoAvisoReserva")`,
              id,
              now
            );

            await recordAuditEvent(tx, {
              entidad: 'Reserva',
              entidadId: resUpdated.id,
              accion: 'CONFIRMAR_RESERVA',
              actor: actorId,
              motivo: 'Confirmación operativa de reserva',
              requestId: request.id,
            });

            return { action: 'CONFIRMED' as const, reserva: resUpdated };
          });

          // Si expiró durante la transacción comprometida, devolver HTTP 409 POST-COMMIT
          if (updated.action === 'EXPIRED') {
            return reply.status(409).send({
              error: {
                code: 'RESERVATION_EXPIRED',
                message: 'La solicitud de reserva ha superado el plazo límite establecido y ha sido expirada automáticamente.',
                reservaId: updated.id,
                expiradaEn: updated.expiradaEn.toISOString(),
                requestId: request.id,
              },
            });
          }

          const confirmedRes = updated.reserva;
          return {
            id: confirmedRes.id,
            propiedadId: confirmedRes.propiedadId,
            propiedadNombre: confirmedRes.propiedad.nombre,
            huespedId: confirmedRes.huespedId,
            huespedNombre: confirmedRes.huesped.nombreCompleto,
            huespedContacto: confirmedRes.huesped.telefono || confirmedRes.huesped.email || undefined,
            ingreso: confirmedRes.ingreso.toISOString().slice(0, 10),
            salida: confirmedRes.salida.toISOString().slice(0, 10),
            noches: confirmedRes.noches,
            estado: confirmedRes.estado,
            montoAcordado: Number(confirmedRes.montoAcordado),
            moneda: confirmedRes.moneda,
            origen: confirmedRes.origen,
            creadaEn: confirmedRes.creadaEn.toISOString(),
            actualizadaEn: confirmedRes.actualizadaEn.toISOString(),
          };
        } catch (err: any) {
          if (err.statusCode) {
            return reply.status(err.statusCode).send({
              error: {
                code: err.code || 'BAD_REQUEST',
                message: err.message,
                details:
                  err.motivosPendientes || err.requisitos
                    ? {
                        motivosPendientes: err.motivosPendientes,
                        requisitos: err.requisitos,
                      }
                    : undefined,
                motivosPendientes: err.motivosPendientes,
                requisitos: err.requisitos,
                requestId: request.id,
              },
            });
          }
          throw err;
        }
      }
    );

    // 6. Reprogramar fechas de reserva (PATCH /api/reservas/:id/fechas)
    app.patch<{
      Params: { id: string };
      Body: {
        ingreso: string;
        salida: string;
        montoAcordado?: number;
        notas?: string;
      };
    }>(
      '/api/reservas/:id/fechas',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const { id } = request.params;
        const { ingreso, salida, montoAcordado, notas } = request.body || {};

        if (!ingreso || !salida) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Las fechas "ingreso" y "salida" son obligatorias.',
              requestId: request.id,
            },
          });
        }

        const dateValidation = validateReservationDates(ingreso, salida);
        if (!dateValidation.isValid) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: dateValidation.error,
              requestId: request.id,
            },
          });
        }

        if (montoAcordado !== undefined) {
          const numMonto = Number(montoAcordado);
          if (!Number.isFinite(numMonto) || numMonto <= 0) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'El monto acordado debe ser un número positivo mayor a 0.',
                requestId: request.id,
              },
            });
          }
        }

        const [y1, m1, d1] = ingreso.split('-').map(Number);
        const [y2, m2, d2] = salida.split('-').map(Number);
        const ingresoDate = new Date(Date.UTC(y1, m1 - 1, d1));
        const salidaDate = new Date(Date.UTC(y2, m2 - 1, d2));
        const noches = calculateNights(ingreso, salida);
        const actorId = request.user!.id;

        try {
          const updated = await prisma.$transaction(async (tx) => {
            // Bloquear la reserva pesimistamente antes de leer
            await tx.$queryRaw`SELECT id FROM "reservas" WHERE id = ${id} FOR UPDATE;`;

            const reserva = await tx.reserva.findUnique({ where: { id } });

            if (!reserva) {
              const err = new Error(`Reserva no encontrada con ID "${id}".`);
              (err as any).statusCode = 404;
              (err as any).code = 'RESERVATION_NOT_FOUND';
              throw err;
            }

            if (reserva.estado === 'EXPIRADA') {
              const err = new Error('No es posible reprogramar una reserva que ya ha expirado.');
              (err as any).statusCode = 409;
              (err as any).code = 'RESERVATION_ALREADY_EXPIRED';
              throw err;
            }

            if (reserva.estado === 'CANCELADA') {
              const err = new Error('No se pueden modificar las fechas de una reserva cancelada.');
              (err as any).statusCode = 409;
              (err as any).code = 'INVALID_STATE_TRANSITION';
              throw err;
            }

            // Comprobar si la solicitud venció en el reloj del servidor
            const now = await effectiveClock.now(tx);
            if (reserva.estado === 'SOLICITADA' && reserva.venceEn && now.getTime() >= new Date(reserva.venceEn).getTime()) {
              await expireLockedReservation(tx, id, now, {
                actor: actorId,
                motivo: 'Solicitud expirada automáticamente al intentar reprogramar.',
                requestId: request.id,
              });
              return { action: 'EXPIRED' as const, id, expiradaEn: now };
            }

            // Comprobar conflicto excluyendo la propia reserva
            const conflicto = await tx.reserva.findFirst({
              where: {
                propiedadId: reserva.propiedadId,
                id: { not: reserva.id },
                estado: { in: ['SOLICITADA', 'CONFIRMADA', 'COMPLETADA'] },
                ingreso: { lt: salidaDate },
                salida: { gt: ingresoDate },
              },
            });

            if (conflicto) {
              const err = new Error('Las nuevas fechas generan conflicto de solape con otra reserva existente.');
              (err as any).statusCode = 409;
              (err as any).code = 'RESERVATION_CONFLICT';
              throw err;
            }

            const resUpdated = await tx.reserva.update({
              where: { id },
              data: {
                ingreso: ingresoDate,
                salida: salidaDate,
                noches,
                ...(montoAcordado !== undefined ? { montoAcordado: Number(montoAcordado) } : {}),
                ...(notas !== undefined ? { notas: notas.trim() || null } : {}),
              },
              include: {
                propiedad: { select: { nombre: true } },
                huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
              },
            });

            await recordAuditEvent(tx, {
              entidad: 'Reserva',
              entidadId: resUpdated.id,
              accion: 'REPROGRAMAR_RESERVA',
              actor: actorId,
              motivo: 'Cambio de fechas de estancia',
              detalles: {
                ingresoAnterior: reserva.ingreso.toISOString().slice(0, 10),
                salidaAnterior: reserva.salida.toISOString().slice(0, 10),
                ingresoNuevo: ingreso,
                salidaNueva: salida,
              },
              requestId: request.id,
            });

            return { action: 'REPROGRAMMED' as const, reserva: resUpdated };
          });

          if (updated.action === 'EXPIRED') {
            return reply.status(409).send({
              error: {
                code: 'RESERVATION_EXPIRED',
                message: 'La solicitud de reserva ha superado el plazo límite establecido y ha sido expirada automáticamente.',
                reservaId: updated.id,
                expiradaEn: updated.expiradaEn.toISOString(),
                requestId: request.id,
              },
            });
          }

          const repRes = updated.reserva;
          return {
            id: repRes.id,
            propiedadId: repRes.propiedadId,
            propiedadNombre: repRes.propiedad.nombre,
            huespedId: repRes.huespedId,
            huespedNombre: repRes.huesped.nombreCompleto,
            huespedContacto: repRes.huesped.telefono || repRes.huesped.email || undefined,
            ingreso: repRes.ingreso.toISOString().slice(0, 10),
            salida: repRes.salida.toISOString().slice(0, 10),
            noches: repRes.noches,
            estado: repRes.estado,
            montoAcordado: Number(repRes.montoAcordado),
            moneda: repRes.moneda,
            origen: repRes.origen,
            notas: repRes.notas || undefined,
            creadaEn: repRes.creadaEn.toISOString(),
            actualizadaEn: repRes.actualizadaEn.toISOString(),
          };
        } catch (err: any) {
          if (
            err.code === '23P01' ||
            err.message?.includes('reservas_no_overlapping_excl') ||
            err.message?.includes('exclusion')
          ) {
            return reply.status(409).send({
              error: {
                code: 'RESERVATION_CONFLICT',
                message: 'Las fechas solicitadas ya no están disponibles en la base de datos.',
                requestId: request.id,
              },
            });
          }

          if (err.statusCode) {
            return reply.status(err.statusCode).send({
              error: {
                code: err.code || 'BAD_REQUEST',
                message: err.message,
                requestId: request.id,
              },
            });
          }

          throw err;
        }
      }
    );

    // 7. Cancelar reserva (POST /api/reservas/:id/cancelar)
    // Libera disponibilidad inmediatamente sin eliminar el registro histórico
    app.post<{
      Params: { id: string };
      Body: { motivo?: string };
    }>(
      '/api/reservas/:id/cancelar',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const { id } = request.params;
        const { motivo } = request.body || {};
        const actorId = request.user!.id;

        try {
          const updated = await prisma.$transaction(async (tx) => {
            // Bloquear la reserva pesimistamente
            await tx.$queryRaw`SELECT id FROM "reservas" WHERE id = ${id} FOR UPDATE;`;

            const reserva = await tx.reserva.findUnique({
              where: { id },
              include: {
                propiedad: { select: { nombre: true } },
                huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
              },
            });

            if (!reserva) {
              const err = new Error(`Reserva no encontrada con ID "${id}".`);
              (err as any).statusCode = 404;
              (err as any).code = 'RESERVATION_NOT_FOUND';
              throw err;
            }

            if (reserva.estado === 'CANCELADA') {
              return { action: 'CANCELLED' as const, reserva };
            }

            if (reserva.estado === 'EXPIRADA') {
              const err = new Error('No es posible cancelar una solicitud de reserva que ya ha expirado.');
              (err as any).statusCode = 409;
              (err as any).code = 'RESERVATION_ALREADY_EXPIRED';
              throw err;
            }

            // Comprobar si la solicitud venció
            const now = await effectiveClock.now(tx);
            if (reserva.estado === 'SOLICITADA' && reserva.venceEn && now.getTime() >= new Date(reserva.venceEn).getTime()) {
              await expireLockedReservation(tx, id, now, {
                actor: actorId,
                motivo: 'Solicitud expirada automáticamente al intentar cancelar.',
                requestId: request.id,
              });
              return { action: 'EXPIRED' as const, id, expiradaEn: now };
            }

            // Cancelar todos los avisos no entregados al cancelar reserva
            await tx.$executeRawUnsafe(
              `UPDATE "avisos_reserva"
               SET "estado" = 'CANCELADO'::"EstadoAvisoReserva",
                   "canceladoEn" = $2::timestamptz,
                   "motivoCancelacion" = 'RESERVA_CANCELADA_MANUALMENTE',
                   "leaseToken" = NULL,
                   "leaseVenceEn" = NULL,
                   "actualizadoEn" = $2::timestamptz
               WHERE "reservaId" = $1
                 AND "estado" IN ('PROGRAMADO'::"EstadoAvisoReserva", 'PENDIENTE'::"EstadoAvisoReserva", 'FALLIDO'::"EstadoAvisoReserva", 'EN_ENVIO'::"EstadoAvisoReserva")`,
              id,
              now
            );

            const resUpdated = await tx.reserva.update({
              where: { id },
              data: {
                estado: 'CANCELADA',
                motivoCancelacion: motivo?.trim() || 'Cancelación solicitada por el usuario.',
              },
              include: {
                propiedad: { select: { nombre: true } },
                huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
              },
            });

            await recordAuditEvent(tx, {
              entidad: 'Reserva',
              entidadId: resUpdated.id,
              accion: 'CANCELAR_RESERVA',
              actor: actorId,
              motivo: resUpdated.motivoCancelacion || 'Cancelación de reserva',
              requestId: request.id,
            });

            return { action: 'CANCELLED' as const, reserva: resUpdated };
          });

          if (updated.action === 'EXPIRED') {
            return reply.status(409).send({
              error: {
                code: 'RESERVATION_EXPIRED',
                message: 'La solicitud de reserva ha superado el plazo límite establecido y ha sido expirada automáticamente.',
                reservaId: updated.id,
                expiradaEn: updated.expiradaEn.toISOString(),
                requestId: request.id,
              },
            });
          }

          const canRes = updated.reserva;
          return {
            id: canRes.id,
            propiedadId: canRes.propiedadId,
            propiedadNombre: canRes.propiedad.nombre,
            huespedId: canRes.huespedId,
            huespedNombre: canRes.huesped.nombreCompleto,
            huespedContacto: canRes.huesped.telefono || canRes.huesped.email || undefined,
            ingreso: canRes.ingreso.toISOString().slice(0, 10),
            salida: canRes.salida.toISOString().slice(0, 10),
            noches: canRes.noches,
            estado: canRes.estado,
            montoAcordado: Number(canRes.montoAcordado),
            moneda: canRes.moneda,
            origen: canRes.origen,
            motivoCancelacion: canRes.motivoCancelacion || undefined,
            creadaEn: canRes.creadaEn.toISOString(),
            actualizadaEn: canRes.actualizadaEn.toISOString(),
          };
        } catch (err: any) {
          if (err.statusCode) {
            return reply.status(err.statusCode).send({
              error: {
                code: err.code || 'BAD_REQUEST',
                message: err.message,
                requestId: request.id,
              },
            });
          }
          throw err;
        }
      }
    );
  };
}
