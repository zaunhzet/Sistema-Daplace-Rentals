import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/client.js';
import type {
  PrismaClient,
  EstadoOrdenTrabajo,
  PrioridadTrabajo,
  TipoTrabajoMantenimiento,
} from '../generated/prisma/client.js';
import { requireAuth, resolveDomainActorFromDb } from '../shared/auth.js';
import { recordAuditEvent } from '../shared/audit.js';

interface QueryMaintenanceOrders {
  propiedadId?: string;
  estado?: EstadoOrdenTrabajo | 'TODAS';
  tipo?: TipoTrabajoMantenimiento | 'TODOS';
  prioridad?: PrioridadTrabajo | 'TODAS';
  asignadoAId?: string;
}

interface CreateMaintenanceOrderBody {
  propiedadId: string;
  reservaId?: string;
  titulo: string;
  descripcion: string;
  tipo?: TipoTrabajoMantenimiento;
  prioridad?: PrioridadTrabajo;
  asignadoAId?: string;
  costoEstimado?: number;
  cambiarEstadoPropiedad?: boolean;
}

interface CheckoutBody {
  reservaId: string;
  conforme: boolean;
  observaciones?: string;
  generarOrdenMantenimiento?: boolean;
  tipoTrabajo?: TipoTrabajoMantenimiento;
  prioridad?: PrioridadTrabajo;
  asignadoAId?: string;
  descripcionTrabajo?: string;
}

interface UpdateOrderStatusBody {
  estado: EstadoOrdenTrabajo;
  costoReal?: number;
  notasResolucion?: string;
  restablecerPropiedadOperativa?: boolean;
}

interface AssignOrderBody {
  asignadoAId: string;
}

export function registerMaintenanceRoutes(prisma: PrismaClient) {
  return async (app: FastifyInstance) => {
    // 1. Listar órdenes de trabajo y mantenimiento (ADMIN y OPERADOR)
    app.get<{
      Querystring: QueryMaintenanceOrders;
    }>(
      '/api/mantenimiento/ordenes',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, _reply) => {
        const { propiedadId, estado, tipo, prioridad, asignadoAId } = request.query || {};

        const where: Prisma.OrdenTrabajoWhereInput = {};

        if (propiedadId && propiedadId.trim() !== '') {
          where.propiedadId = propiedadId.trim();
        }

        if (estado && estado !== 'TODAS') {
          where.estado = estado;
        }

        if (tipo && tipo !== 'TODOS') {
          where.tipo = tipo;
        }

        if (prioridad && prioridad !== 'TODAS') {
          where.prioridad = prioridad;
        }

        if (asignadoAId && asignadoAId.trim() !== '') {
          where.asignadoAId = asignadoAId.trim();
        }

        const orders = await prisma.ordenTrabajo.findMany({
          where,
          include: {
            propiedad: {
              select: { id: true, nombre: true, direccion: true, estadoOperativo: true },
            },
            reserva: {
              select: { id: true, ingreso: true, salida: true, estado: true },
            },
            asignadoA: {
              select: { id: true, nombre: true, email: true, rol: true },
            },
            creadoPor: {
              select: { id: true, nombre: true, email: true },
            },
          },
          orderBy: { creadoEn: 'desc' },
        });

        return {
          data: orders.map((o) => ({
            id: o.id,
            propiedadId: o.propiedadId,
            propiedadNombre: o.propiedad.nombre,
            propiedadEstadoOperativo: o.propiedad.estadoOperativo,
            reservaId: o.reservaId,
            titulo: o.titulo,
            descripcion: o.descripcion,
            tipo: o.tipo,
            prioridad: o.prioridad,
            estado: o.estado,
            asignadoA: o.asignadoA
              ? {
                  id: o.asignadoA.id,
                  nombre: o.asignadoA.nombre,
                  email: o.asignadoA.email,
                  rol: o.asignadoA.rol,
                }
              : null,
            creadoPor: {
              id: o.creadoPor.id,
              nombre: o.creadoPor.nombre,
              email: o.creadoPor.email,
            },
            costoEstimado: o.costoEstimado ? Number(o.costoEstimado) : null,
            costoReal: o.costoReal ? Number(o.costoReal) : null,
            notasResolucion: o.notasResolucion,
            completadoEn: o.completadoEn?.toISOString() || null,
            creadoEn: o.creadoEn.toISOString(),
            actualizadoEn: o.actualizadoEn.toISOString(),
          })),
        };
      }
    );

    // 2. Crear nueva orden de trabajo (ADMIN y OPERADOR)
    app.post<{
      Body: CreateMaintenanceOrderBody;
    }>(
      '/api/mantenimiento/ordenes',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const actorId = await resolveDomainActorFromDb(prisma, request, reply);
        if (!actorId) return;

        const {
          propiedadId,
          reservaId,
          titulo,
          descripcion,
          tipo = 'INSPECCION',
          prioridad = 'MEDIA',
          asignadoAId,
          costoEstimado,
          cambiarEstadoPropiedad = false,
        } = request.body || {};

        if (!propiedadId || propiedadId.trim() === '') {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El identificador de la propiedad es obligatorio.',
              requestId: request.id,
            },
          });
        }

        if (!titulo || titulo.trim().length < 3) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El título de la orden debe tener al menos 3 caracteres.',
              requestId: request.id,
            },
          });
        }

        if (!descripcion || descripcion.trim().length < 5) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'La descripción de los trabajos debe tener al menos 5 caracteres.',
              requestId: request.id,
            },
          });
        }

        // Verificar que la propiedad exista
        const propiedad = await prisma.propiedad.findUnique({
          where: { id: propiedadId },
        });

        if (!propiedad) {
          return reply.status(404).send({
            error: {
              code: 'PROPERTY_NOT_FOUND',
              message: 'No se encontró la propiedad indicada.',
              requestId: request.id,
            },
          });
        }

        // Si se asigna operario, verificar existencia
        if (asignadoAId) {
          const operario = await prisma.usuario.findUnique({
            where: { id: asignadoAId },
          });
          if (!operario || !operario.activo) {
            return reply.status(400).send({
              error: {
                code: 'INVALID_ASSIGNED_STAFF',
                message: 'El colaborador asignado no existe o no está activo.',
                requestId: request.id,
              },
            });
          }
        }

        const result = await prisma.$transaction(async (tx) => {
          if (cambiarEstadoPropiedad) {
            await tx.propiedad.update({
              where: { id: propiedadId },
              data: { estadoOperativo: 'EN_MANTENIMIENTO' },
            });
          }

          const order = await tx.ordenTrabajo.create({
            data: {
              propiedadId,
              reservaId: reservaId || null,
              titulo: titulo.trim(),
              descripcion: descripcion.trim(),
              tipo,
              prioridad,
              estado: 'PENDIENTE',
              asignadoAId: asignadoAId || null,
              costoEstimado: costoEstimado !== undefined ? new Prisma.Decimal(costoEstimado) : null,
              creadoPorId: actorId,
            },
            include: {
              propiedad: { select: { id: true, nombre: true, estadoOperativo: true } },
              asignadoA: { select: { id: true, nombre: true, email: true } },
            },
          });

          await recordAuditEvent(tx, {
            entidad: 'OrdenTrabajo',
            entidadId: order.id,
            accion: 'CREAR_ORDEN_TRABAJO',
            actor: request.user?.email || 'sistema@daplace.pe',
            motivo: `Alta de orden de trabajo para ${propiedad.nombre}: ${titulo.trim()}`,
            detalles: {
              propiedadId,
              reservaId: reservaId || null,
              tipo,
              prioridad,
              asignadoAId: asignadoAId || null,
              estadoPropiedad: cambiarEstadoPropiedad ? 'EN_MANTENIMIENTO' : propiedad.estadoOperativo,
            },
            requestId: request.id,
          });

          return order;
        });

        return reply.status(201).send({
          data: {
            id: result.id,
            propiedadId: result.propiedadId,
            propiedadNombre: result.propiedad.nombre,
            reservaId: result.reservaId,
            titulo: result.titulo,
            descripcion: result.descripcion,
            tipo: result.tipo,
            prioridad: result.prioridad,
            estado: result.estado,
            asignadoA: result.asignadoA,
            costoEstimado: result.costoEstimado ? Number(result.costoEstimado) : null,
            creadoEn: result.creadoEn.toISOString(),
          },
        });
      }
    );

    // 3. Registrar Check-out e inspección de salida (HU-10)
    app.post<{
      Body: CheckoutBody;
    }>(
      '/api/mantenimiento/check-out',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const actorId = await resolveDomainActorFromDb(prisma, request, reply);
        if (!actorId) return;

        const {
          reservaId,
          conforme,
          observaciones,
          generarOrdenMantenimiento = false,
          tipoTrabajo = 'LIMPIEZA',
          prioridad = 'MEDIA',
          asignadoAId,
          descripcionTrabajo,
        } = request.body || {};

        if (!reservaId) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El identificador de la reserva es obligatorio para registrar la salida.',
              requestId: request.id,
            },
          });
        }

        const reserva = await prisma.reserva.findUnique({
          where: { id: reservaId },
          include: { propiedad: true, huesped: true },
        });

        if (!reserva) {
          return reply.status(404).send({
            error: {
              code: 'RESERVATION_NOT_FOUND',
              message: 'No se encontró la reserva indicada.',
              requestId: request.id,
            },
          });
        }

        if (reserva.estado !== 'CONFIRMADA' && reserva.estado !== 'COMPLETADA') {
          return reply.status(400).send({
            error: {
              code: 'INVALID_RESERVATION_STATE',
              message: `Solo se puede registrar check-out sobre reservas CONFIRMADAS o COMPLETADAS (estado actual: ${reserva.estado}).`,
              requestId: request.id,
            },
          });
        }

        const resultado = await prisma.$transaction(async (tx) => {
          // Si estaba en CONFIRMADA, marcarla como COMPLETADA
          const reservaActualizada = await tx.reserva.update({
            where: { id: reservaId },
            data: { estado: 'COMPLETADA' },
          });

          let ordenCreada = null;
          const requiereOrden = !conforme || generarOrdenMantenimiento;

          if (requiereOrden) {
            const tituloOrden = !conforme
              ? `Incidencia Check-out Reserva ${reservaId.slice(0, 8)}`
              : `Acondicionamiento / Limpieza Post-Salida ${reservaId.slice(0, 8)}`;

            const detalleOrden =
              descripcionTrabajo?.trim() ||
              observaciones?.trim() ||
              (conforme ? 'Limpieza regular tras check-out' : 'Reparación por incidencias reportadas en salida');

            ordenCreada = await tx.ordenTrabajo.create({
              data: {
                propiedadId: reserva.propiedadId,
                reservaId: reserva.id,
                titulo: tituloOrden,
                descripcion: detalleOrden,
                tipo: !conforme ? 'REPARACION' : tipoTrabajo,
                prioridad: !conforme ? 'ALTA' : prioridad,
                estado: 'PENDIENTE',
                asignadoAId: asignadoAId || null,
                creadoPorId: actorId,
              },
            });

            // Si hay daños o no es conforme, pasar propiedad a EN_MANTENIMIENTO
            if (!conforme) {
              await tx.propiedad.update({
                where: { id: reserva.propiedadId },
                data: { estadoOperativo: 'EN_MANTENIMIENTO' },
              });
            }
          }

          // Auditoría de check-out
          await recordAuditEvent(tx, {
            entidad: 'Reserva',
            entidadId: reserva.id,
            accion: 'REGISTRAR_CHECKOUT_SALIDA',
            actor: request.user?.email || 'sistema@daplace.pe',
            motivo: `Check-out registrado. Inspección: ${conforme ? 'CONFORME' : 'CON_INCIDENCIAS'}. ${observaciones || ''}`,
            detalles: {
              reservaId: reserva.id,
              propiedadId: reserva.propiedadId,
              huespedId: reserva.huespedId,
              conforme,
              ordenTrabajoId: ordenCreada?.id || null,
            },
            requestId: request.id,
          });

          return {
            reserva: reservaActualizada,
            ordenTrabajo: ordenCreada,
          };
        });

        return reply.status(200).send({
          data: {
            reservaId: resultado.reserva.id,
            estadoReserva: resultado.reserva.estado,
            conforme,
            ordenTrabajo: resultado.ordenTrabajo
              ? {
                  id: resultado.ordenTrabajo.id,
                  titulo: resultado.ordenTrabajo.titulo,
                  tipo: resultado.ordenTrabajo.tipo,
                  prioridad: resultado.ordenTrabajo.prioridad,
                  estado: resultado.ordenTrabajo.estado,
                }
              : null,
          },
        });
      }
    );

    // 4. Actualizar estado y costos de una orden de trabajo (HU-16)
    app.patch<{
      Params: { id: string };
      Body: UpdateOrderStatusBody;
    }>(
      '/api/mantenimiento/ordenes/:id/estado',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const actorId = await resolveDomainActorFromDb(prisma, request, reply);
        if (!actorId) return;

        const { id } = request.params;
        const { estado, costoReal, notasResolucion, restablecerPropiedadOperativa } =
          request.body || {};

        if (!['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA'].includes(estado)) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_ORDER_STATE',
              message: 'El estado especificado para la orden de trabajo no es válido.',
              requestId: request.id,
            },
          });
        }

        const orden = await prisma.ordenTrabajo.findUnique({
          where: { id },
          include: { propiedad: true },
        });

        if (!orden) {
          return reply.status(404).send({
            error: {
              code: 'ORDER_NOT_FOUND',
              message: 'No se encontró la orden de trabajo indicada.',
              requestId: request.id,
            },
          });
        }

        // HU-16: Impedir restauración prematura de la propiedad a OPERATIVA
        // No se puede restablecer la propiedad si la orden actual sigue PENDIENTE o EN_PROGRESO
        if (restablecerPropiedadOperativa && ['PENDIENTE', 'EN_PROGRESO'].includes(estado)) {
          return reply.status(400).send({
            error: {
              code: 'PREMATURE_PROPERTY_RESTORATION',
              message: 'No se puede restablecer la propiedad a OPERATIVA mientras la orden de trabajo continúe PENDIENTE o EN_PROGRESO.',
              requestId: request.id,
            },
          });
        }

        // Si se solicita restablecer explícitamente, validar que no existan otros trabajos activos en la propiedad
        if (restablecerPropiedadOperativa) {
          const otherActiveOrders = await prisma.ordenTrabajo.count({
            where: {
              propiedadId: orden.propiedadId,
              id: { not: id },
              estado: { in: ['PENDIENTE', 'EN_PROGRESO'] },
            },
          });

          if (otherActiveOrders > 0) {
            return reply.status(400).send({
              error: {
                code: 'ACTIVE_WORK_ORDERS_EXIST',
                message: `No se puede restablecer la propiedad a OPERATIVA porque aún existen ${otherActiveOrders} orden(es) de trabajo activa(s) en la misma propiedad.`,
                requestId: request.id,
              },
            });
          }
        }

        const updated = await prisma.$transaction(async (tx) => {
          const isCompleting = estado === 'COMPLETADA';
          const updatedOrder = await tx.ordenTrabajo.update({
            where: { id },
            data: {
              estado,
              costoReal: costoReal !== undefined ? new Prisma.Decimal(costoReal) : orden.costoReal,
              notasResolucion: notasResolucion?.trim() || orden.notasResolucion,
              completadoEn: isCompleting ? new Date() : orden.completadoEn,
            },
            include: {
              propiedad: { select: { id: true, nombre: true, estadoOperativo: true } },
              asignadoA: { select: { id: true, nombre: true, email: true } },
            },
          });

          // Si se completó y se solicita restablecer o la propiedad está en mantenimiento:
          // Verificar si quedan otras órdenes pendientes o en progreso en la misma propiedad
          if (isCompleting || restablecerPropiedadOperativa) {
            const pendingOrders = await tx.ordenTrabajo.count({
              where: {
                propiedadId: orden.propiedadId,
                id: { not: id },
                estado: { in: ['PENDIENTE', 'EN_PROGRESO'] },
              },
            });

            if (pendingOrders === 0 && orden.propiedad.estadoOperativo === 'EN_MANTENIMIENTO') {
              await tx.propiedad.update({
                where: { id: orden.propiedadId },
                data: { estadoOperativo: 'OPERATIVA' },
              });
            }
          }

          await recordAuditEvent(tx, {
            entidad: 'OrdenTrabajo',
            entidadId: id,
            accion: 'ACTUALIZAR_ESTADO_ORDEN_TRABAJO',
            actor: request.user?.email || 'sistema@daplace.pe',
            motivo: `Orden ${orden.titulo} cambió a ${estado}. ${notasResolucion || ''}`,
            detalles: {
              estadoAnterior: orden.estado,
              nuevoEstado: estado,
              costoReal: costoReal || null,
            },
            requestId: request.id,
          });

          return updatedOrder;
        });

        return {
          data: {
            id: updated.id,
            propiedadId: updated.propiedadId,
            titulo: updated.titulo,
            estado: updated.estado,
            costoReal: updated.costoReal ? Number(updated.costoReal) : null,
            notasResolucion: updated.notasResolucion,
            completadoEn: updated.completadoEn?.toISOString() || null,
            actualizadoEn: updated.actualizadoEn.toISOString(),
          },
        };
      }
    );

    // 5. Asignar personal de campo a la orden de trabajo (HU-14 y HU-17)
    app.patch<{
      Params: { id: string };
      Body: AssignOrderBody;
    }>(
      '/api/mantenimiento/ordenes/:id/asignar',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const actorId = await resolveDomainActorFromDb(prisma, request, reply);
        if (!actorId) return;

        const { id } = request.params;
        const { asignadoAId } = request.body || {};

        if (!asignadoAId || asignadoAId.trim() === '') {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El identificador del colaborador a asignar es obligatorio.',
              requestId: request.id,
            },
          });
        }

        const [orden, operario] = await Promise.all([
          prisma.ordenTrabajo.findUnique({ where: { id } }),
          prisma.usuario.findUnique({ where: { id: asignadoAId } }),
        ]);

        if (!orden) {
          return reply.status(404).send({
            error: {
              code: 'ORDER_NOT_FOUND',
              message: 'No se encontró la orden de trabajo especificada.',
              requestId: request.id,
            },
          });
        }

        if (!operario || !operario.activo) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_ASSIGNED_STAFF',
              message: 'El colaborador asignado no existe o no se encuentra activo.',
              requestId: request.id,
            },
          });
        }

        const updated = await prisma.$transaction(async (tx) => {
          const res = await tx.ordenTrabajo.update({
            where: { id },
            data: {
              asignadoAId,
              // Si estaba pendiente, pasa a en progreso si ya fue asignado
              estado: orden.estado === 'PENDIENTE' ? 'EN_PROGRESO' : orden.estado,
            },
            include: {
              asignadoA: { select: { id: true, nombre: true, email: true } },
            },
          });

          // HU-17: Aviso interno de asignación registrado en auditoría y outbox del sistema
          await recordAuditEvent(tx, {
            entidad: 'OrdenTrabajo',
            entidadId: id,
            accion: 'ASIGNAR_OPERARIO_TRABAJO',
            actor: request.user?.email || 'sistema@daplace.pe',
            motivo: `Asignación de orden a ${operario.nombre} (${operario.email})`,
            detalles: {
              ordenId: id,
              asignadoAId,
              operarioNombre: operario.nombre,
            },
            requestId: request.id,
          });

          return res;
        });

        return {
          data: {
            id: updated.id,
            asignadoA: updated.asignadoA,
            estado: updated.estado,
            actualizadoEn: updated.actualizadoEn.toISOString(),
          },
        };
      }
    );
  };
}
