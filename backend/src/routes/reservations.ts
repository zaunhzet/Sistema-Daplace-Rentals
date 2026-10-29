import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';

export function calculateNights(ingreso: string, salida: string): number {
  const d1 = new Date(`${ingreso}T00:00:00Z`).getTime();
  const d2 = new Date(`${salida}T00:00:00Z`).getTime();
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
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
      error: 'La fecha de salida debe ser estrictamente posterior a la fecha de ingreso (mínimo 1 noche).',
    };
  }

  return { isValid: true };
}

export function registerReservationsRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // 1. Consultar disponibilidad de una propiedad en un intervalo [ingreso, salida)
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
          motivo: `La propiedad "${propiedad.nombre}" se encuentra inactiva y no admite reservas.`,
          intervalo: { ingreso, salida },
        };
      }

      if (propiedad.estadoOperativo === 'EN_MANTENIMIENTO') {
        return {
          propiedadId,
          disponible: false,
          motivo: `La propiedad "${propiedad.nombre}" se encuentra en mantenimiento operativo.`,
          intervalo: { ingreso, salida },
        };
      }

      const ingresoDate = new Date(`${ingreso}T00:00:00Z`);
      const salidaDate = new Date(`${salida}T00:00:00Z`);

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
        return {
          propiedadId,
          disponible: false,
          motivo: `Conflicto de solape con la reserva existente ${conflicto.id} (${conflicto.ingreso.toISOString().slice(0, 10)} a ${conflicto.salida.toISOString().slice(0, 10)}, estado: ${conflicto.estado}).`,
          intervalo: { ingreso, salida },
        };
      }

      return {
        propiedadId,
        disponible: true,
        intervalo: { ingreso, salida },
      };
    });

    // 2. Listar reservas con filtros
    app.get<{
      Querystring: {
        propiedadId?: string;
        huespedId?: string;
        estado?: string;
        desde?: string;
        hasta?: string;
        search?: string;
      };
    }>('/api/reservas', async (request) => {
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
        where.salida = { gte: new Date(`${desde}T00:00:00Z`) };
      }

      if (hasta) {
        where.ingreso = { lte: new Date(`${hasta}T00:00:00Z`) };
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
          propiedad: { select: { id: true, nombre: true, moneda: true } },
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
        creadaEn: r.creadaEn.toISOString(),
        actualizadaEn: r.actualizadaEn.toISOString(),
      }));
    });

    // 3. Consultar detalle de reserva
    app.get<{ Params: { id: string } }>('/api/reservas/:id', async (request, reply) => {
      const { id } = request.params;

      const reserva = await prisma.reserva.findUnique({
        where: { id },
        include: {
          propiedad: { select: { id: true, nombre: true, moneda: true } },
          huesped: { select: { id: true, nombreCompleto: true, email: true, telefono: true } },
        },
      });

      if (!reserva) {
        return reply.status(404).send({
          error: {
            code: 'RESERVATION_NOT_FOUND',
            message: `Reserva no encontrada con ID "${id}".`,
            requestId: request.id,
          },
        });
      }

      return {
        id: reserva.id,
        propiedadId: reserva.propiedadId,
        propiedadNombre: reserva.propiedad.nombre,
        huespedId: reserva.huespedId,
        huespedNombre: reserva.huesped.nombreCompleto,
        huespedContacto: reserva.huesped.telefono || reserva.huesped.email || undefined,
        ingreso: reserva.ingreso.toISOString().slice(0, 10),
        salida: reserva.salida.toISOString().slice(0, 10),
        noches: reserva.noches,
        estado: reserva.estado,
        montoAcordado: Number(reserva.montoAcordado),
        moneda: reserva.moneda,
        origen: reserva.origen,
        referenciaCanal: reserva.referenciaCanal || undefined,
        notas: reserva.notas || undefined,
        motivoCancelacion: reserva.motivoCancelacion || undefined,
        creadaEn: reserva.creadaEn.toISOString(),
        actualizadaEn: reserva.actualizadaEn.toISOString(),
      };
    });

    // 4. Crear reserva (con protección transaccional y constraint de exclusión PostgreSQL)
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
    }>('/api/reservas', async (request, reply) => {
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

      if (montoAcordado === undefined || Number(montoAcordado) <= 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El monto acordado debe ser un número positivo mayor a 0.',
            requestId: request.id,
          },
        });
      }

      const ingresoDate = new Date(`${ingreso}T00:00:00Z`);
      const salidaDate = new Date(`${salida}T00:00:00Z`);
      const noches = calculateNights(ingreso, salida);

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

          // C. Verificación de solape previa (para mensaje descriptivo)
          const conflictoPrevio = await tx.reserva.findFirst({
            where: {
              propiedadId,
              estado: { in: ['SOLICITADA', 'CONFIRMADA', 'COMPLETADA'] },
              ingreso: { lt: salidaDate },
              salida: { gt: ingresoDate },
            },
          });

          if (conflictoPrevio) {
            const err = new Error(
              `Conflicto de solape con la reserva existente ${conflictoPrevio.id} (${conflictoPrevio.ingreso.toISOString().slice(0, 10)} a ${conflictoPrevio.salida.toISOString().slice(0, 10)}, estado: ${conflictoPrevio.estado}).`
            );
            (err as any).statusCode = 409;
            (err as any).code = 'RESERVATION_CONFLICT';
            throw err;
          }

          // D. Creación de la reserva en PostgreSQL (protegida además por exclusion constraint)
          const created = await tx.reserva.create({
            data: {
              ...(id ? { id } : {}),
              propiedadId,
              huespedId,
              ingreso: ingresoDate,
              salida: salidaDate,
              noches,
              estado: 'SOLICITADA',
              montoAcordado,
              moneda,
              origen,
              referenciaCanal: referenciaCanal?.trim() || null,
              notas: notas?.trim() || null,
            },
            include: {
              propiedad: { select: { nombre: true } },
              huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
            },
          });

          // E. Auditoría atómica en la misma transacción
          await tx.auditoriaEvento.create({
            data: {
              entidad: 'Reserva',
              entidadId: created.id,
              accion: 'CREAR_SOLICITUD_RESERVA',
              actor: 'SYSTEM_DEV',
              motivo: 'Registro de solicitud de reserva',
              detalles: {
                propiedadId,
                huespedId,
                ingreso,
                salida,
                noches,
                montoAcordado,
              },
              requestId: request.id,
            },
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
          creadaEn: result.creadaEn.toISOString(),
          actualizadaEn: result.actualizadaEn.toISOString(),
        });
      } catch (err: any) {
        // Capturar conflicto de exclusión de PostgreSQL (23P01) o de negocio
        const isOverlap =
          err.code === 'RESERVATION_CONFLICT' ||
          err.code === '23P01' ||
          err.message?.includes('reservas_no_overlapping_excl') ||
          err.message?.includes('exclusion') ||
          err.message?.includes('solape');

        if (isOverlap) {
          return reply.status(409).send({
            error: {
              code: 'RESERVATION_CONFLICT',
              message: err.message || 'El intervalo seleccionado ya no está disponible para esta propiedad.',
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
    });

    // 5. Confirmar reserva (POST /api/reservas/:id/confirmar)
    app.post<{ Params: { id: string } }>('/api/reservas/:id/confirmar', async (request, reply) => {
      const { id } = request.params;

      const reserva = await prisma.reserva.findUnique({
        where: { id },
        include: {
          propiedad: { select: { nombre: true, activa: true, estadoOperativo: true } },
          huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
        },
      });

      if (!reserva) {
        return reply.status(404).send({
          error: {
            code: 'RESERVATION_NOT_FOUND',
            message: `Reserva no encontrada con ID "${id}".`,
            requestId: request.id,
          },
        });
      }

      if (reserva.estado === 'CONFIRMADA') {
        // Idempotente: ya confirmada
        return {
          id: reserva.id,
          propiedadId: reserva.propiedadId,
          propiedadNombre: reserva.propiedad.nombre,
          huespedId: reserva.huespedId,
          huespedNombre: reserva.huesped.nombreCompleto,
          huespedContacto: reserva.huesped.telefono || reserva.huesped.email || undefined,
          ingreso: reserva.ingreso.toISOString().slice(0, 10),
          salida: reserva.salida.toISOString().slice(0, 10),
          noches: reserva.noches,
          estado: reserva.estado,
          montoAcordado: Number(reserva.montoAcordado),
          moneda: reserva.moneda,
          origen: reserva.origen,
          creadaEn: reserva.creadaEn.toISOString(),
          actualizadaEn: reserva.actualizadaEn.toISOString(),
        };
      }

      if (reserva.estado === 'CANCELADA') {
        return reply.status(409).send({
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: 'No es posible confirmar una reserva que ha sido cancelada.',
            requestId: request.id,
          },
        });
      }

      // Revalidar disponibilidad antes de confirmar
      const conflicto = await prisma.reserva.findFirst({
        where: {
          propiedadId: reserva.propiedadId,
          id: { not: reserva.id },
          estado: { in: ['CONFIRMADA', 'SOLICITADA', 'COMPLETADA'] },
          ingreso: { lt: reserva.salida },
          salida: { gt: reserva.ingreso },
        },
      });

      if (conflicto) {
        return reply.status(409).send({
          error: {
            code: 'RESERVATION_CONFLICT',
            message: `No se puede confirmar: conflicto de solape con la reserva existente ${conflicto.id}.`,
            requestId: request.id,
          },
        });
      }

      const updated = await prisma.reserva.update({
        where: { id },
        data: { estado: 'CONFIRMADA' },
        include: {
          propiedad: { select: { nombre: true } },
          huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
        },
      });

      await recordAuditEvent(prisma, {
        entidad: 'Reserva',
        entidadId: updated.id,
        accion: 'CONFIRMAR_RESERVA',
        actor: 'SYSTEM_DEV',
        motivo: 'Confirmación operativa de reserva',
        requestId: request.id,
      });

      return {
        id: updated.id,
        propiedadId: updated.propiedadId,
        propiedadNombre: updated.propiedad.nombre,
        huespedId: updated.huespedId,
        huespedNombre: updated.huesped.nombreCompleto,
        huespedContacto: updated.huesped.telefono || updated.huesped.email || undefined,
        ingreso: updated.ingreso.toISOString().slice(0, 10),
        salida: updated.salida.toISOString().slice(0, 10),
        noches: updated.noches,
        estado: updated.estado,
        montoAcordado: Number(updated.montoAcordado),
        moneda: updated.moneda,
        origen: updated.origen,
        creadaEn: updated.creadaEn.toISOString(),
        actualizadaEn: updated.actualizadaEn.toISOString(),
      };
    });

    // 6. Reprogramar fechas de reserva (PATCH /api/reservas/:id/fechas)
    app.patch<{
      Params: { id: string };
      Body: {
        ingreso: string;
        salida: string;
        montoAcordado?: number;
        notas?: string;
      };
    }>('/api/reservas/:id/fechas', async (request, reply) => {
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

      const reserva = await prisma.reserva.findUnique({
        where: { id },
      });

      if (!reserva) {
        return reply.status(404).send({
          error: {
            code: 'RESERVATION_NOT_FOUND',
            message: `Reserva no encontrada con ID "${id}".`,
            requestId: request.id,
          },
        });
      }

      if (reserva.estado === 'CANCELADA') {
        return reply.status(409).send({
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: 'No se pueden modificar las fechas de una reserva cancelada.',
            requestId: request.id,
          },
        });
      }

      const ingresoDate = new Date(`${ingreso}T00:00:00Z`);
      const salidaDate = new Date(`${salida}T00:00:00Z`);
      const noches = calculateNights(ingreso, salida);

      // Comprobar conflicto excluyendo la propia reserva
      const conflicto = await prisma.reserva.findFirst({
        where: {
          propiedadId: reserva.propiedadId,
          id: { not: reserva.id },
          estado: { in: ['SOLICITADA', 'CONFIRMADA', 'COMPLETADA'] },
          ingreso: { lt: salidaDate },
          salida: { gt: ingresoDate },
        },
      });

      if (conflicto) {
        return reply.status(409).send({
          error: {
            code: 'RESERVATION_CONFLICT',
            message: `Las nuevas fechas generan conflicto de solape con la reserva ${conflicto.id} (${conflicto.ingreso.toISOString().slice(0, 10)} a ${conflicto.salida.toISOString().slice(0, 10)}).`,
            details: [{ field: 'ingreso', code: 'OVERLAPPING_RESERVATION' }],
            requestId: request.id,
          },
        });
      }

      try {
        const updated = await prisma.reserva.update({
          where: { id },
          data: {
            ingreso: ingresoDate,
            salida: salidaDate,
            noches,
            ...(montoAcordado !== undefined ? { montoAcordado } : {}),
            ...(notas !== undefined ? { notas: notas.trim() || null } : {}),
          },
          include: {
            propiedad: { select: { nombre: true } },
            huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
          },
        });

        await recordAuditEvent(prisma, {
          entidad: 'Reserva',
          entidadId: updated.id,
          accion: 'REPROGRAMAR_RESERVA',
          actor: 'SYSTEM_DEV',
          motivo: 'Cambio de fechas de estancia',
          detalles: {
            ingresoAnterior: reserva.ingreso.toISOString().slice(0, 10),
            salidaAnterior: reserva.salida.toISOString().slice(0, 10),
            ingresoNuevo: ingreso,
            salidaNueva: salida,
          },
          requestId: request.id,
        });

        return {
          id: updated.id,
          propiedadId: updated.propiedadId,
          propiedadNombre: updated.propiedad.nombre,
          huespedId: updated.huespedId,
          huespedNombre: updated.huesped.nombreCompleto,
          huespedContacto: updated.huesped.telefono || updated.huesped.email || undefined,
          ingreso: updated.ingreso.toISOString().slice(0, 10),
          salida: updated.salida.toISOString().slice(0, 10),
          noches: updated.noches,
          estado: updated.estado,
          montoAcordado: Number(updated.montoAcordado),
          moneda: updated.moneda,
          origen: updated.origen,
          notas: updated.notas || undefined,
          creadaEn: updated.creadaEn.toISOString(),
          actualizadaEn: updated.actualizadaEn.toISOString(),
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
        throw err;
      }
    });

    // 7. Cancelar reserva (POST /api/reservas/:id/cancelar)
    // Libera disponibilidad inmediatamente sin eliminar el registro histórico
    app.post<{
      Params: { id: string };
      Body: { motivo?: string };
    }>('/api/reservas/:id/cancelar', async (request, reply) => {
      const { id } = request.params;
      const { motivo } = request.body || {};

      const reserva = await prisma.reserva.findUnique({
        where: { id },
        include: {
          propiedad: { select: { nombre: true } },
          huesped: { select: { nombreCompleto: true, email: true, telefono: true } },
        },
      });

      if (!reserva) {
        return reply.status(404).send({
          error: {
            code: 'RESERVATION_NOT_FOUND',
            message: `Reserva no encontrada con ID "${id}".`,
            requestId: request.id,
          },
        });
      }

      if (reserva.estado === 'CANCELADA') {
        // Idempotente
        return {
          id: reserva.id,
          propiedadId: reserva.propiedadId,
          propiedadNombre: reserva.propiedad.nombre,
          huespedId: reserva.huespedId,
          huespedNombre: reserva.huesped.nombreCompleto,
          huespedContacto: reserva.huesped.telefono || reserva.huesped.email || undefined,
          ingreso: reserva.ingreso.toISOString().slice(0, 10),
          salida: reserva.salida.toISOString().slice(0, 10),
          noches: reserva.noches,
          estado: reserva.estado,
          montoAcordado: Number(reserva.montoAcordado),
          moneda: reserva.moneda,
          origen: reserva.origen,
          motivoCancelacion: reserva.motivoCancelacion || undefined,
          creadaEn: reserva.creadaEn.toISOString(),
          actualizadaEn: reserva.actualizadaEn.toISOString(),
        };
      }

      const updated = await prisma.reserva.update({
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

      await recordAuditEvent(prisma, {
        entidad: 'Reserva',
        entidadId: updated.id,
        accion: 'CANCELAR_RESERVA',
        actor: 'SYSTEM_DEV',
        motivo: updated.motivoCancelacion || 'Cancelación de reserva',
        requestId: request.id,
      });

      return {
        id: updated.id,
        propiedadId: updated.propiedadId,
        propiedadNombre: updated.propiedad.nombre,
        huespedId: updated.huespedId,
        huespedNombre: updated.huesped.nombreCompleto,
        huespedContacto: updated.huesped.telefono || updated.huesped.email || undefined,
        ingreso: updated.ingreso.toISOString().slice(0, 10),
        salida: updated.salida.toISOString().slice(0, 10),
        noches: updated.noches,
        estado: updated.estado,
        montoAcordado: Number(updated.montoAcordado),
        moneda: updated.moneda,
        origen: updated.origen,
        motivoCancelacion: updated.motivoCancelacion || undefined,
        creadaEn: updated.creadaEn.toISOString(),
        actualizadaEn: updated.actualizadaEn.toISOString(),
      };
    });
  };
}
