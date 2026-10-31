import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../shared/auth.js';

export function registerAlertsRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // 1. Obtener alertas internas y notificaciones operativas (HU-11 y HU-17)
    app.get<{
      Querystring: {
        limite?: string | number;
        estado?: string;
      };
    }>(
      '/api/alertas',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, _reply) => {
        let limit = Number(request.query.limite) || 30;
        if (limit < 1) limit = 1;
        if (limit > 100) limit = 100;

        const estadoFiltro = request.query.estado;
        const userEmail = request.user?.email;
        const userRole = request.user?.rol;

        // Resolver identidad de dominio del operador si aplica
        let domainUserId: string | null = null;
        if (userEmail) {
          const domainUser = await prisma.usuario.findFirst({
            where: { email: userEmail, activo: true },
            select: { id: true, rol: true },
          });
          domainUserId = domainUser?.id || null;
        }

        // Filtro para notificaciones internas (HU-11 y HU-17)
        // Regla HU-17 (Req 5): OPERADOR solo ve avisos globales (usuarioId = null) o asignados a su propia identidad
        const notifWhere: any = {};
        if (userRole === 'OPERADOR') {
          notifWhere.OR = [
            { usuarioId: null },
            ...(domainUserId ? [{ usuarioId: domainUserId }] : []),
          ];
        }

        if (estadoFiltro && estadoFiltro !== 'TODOS') {
          if (estadoFiltro === 'PENDIENTE') {
            notifWhere.estado = 'PENDIENTE';
          } else if (estadoFiltro === 'LEIDA') {
            notifWhere.estado = 'LEIDA';
          } else if (estadoFiltro === 'ATENDIDA' || estadoFiltro === 'ENVIADO') {
            notifWhere.estado = 'ATENDIDA';
          }
        }

        // Filtro para avisos de reserva (Outbox / Expiraciones)
        const avisosWhere: any = {};
        if (estadoFiltro && estadoFiltro !== 'TODOS') {
          avisosWhere.estado = estadoFiltro;
        } else {
          avisosWhere.estado = { in: ['PROGRAMADO', 'PENDIENTE', 'FALLIDO', 'ENVIADO'] };
        }

        const [notificaciones, avisos, notifPendientesCount, avisosPendientesCount] =
          await Promise.all([
            prisma.notificacionInterna.findMany({
              where: notifWhere,
              include: {
                reserva: {
                  select: {
                    id: true,
                    estado: true,
                    ingreso: true,
                    salida: true,
                    venceEn: true,
                    montoAcordado: true,
                    moneda: true,
                    propiedad: { select: { id: true, nombre: true } },
                    huesped: {
                      select: { id: true, nombreCompleto: true, email: true, telefono: true },
                    },
                  },
                },
                ordenTrabajo: {
                  select: {
                    id: true,
                    titulo: true,
                    tipo: true,
                    prioridad: true,
                    estado: true,
                    propiedad: { select: { id: true, nombre: true } },
                  },
                },
                propiedad: { select: { id: true, nombre: true } },
              },
              orderBy: { creadoEn: 'desc' },
              take: limit,
            }),
            prisma.avisoReserva.findMany({
              where: avisosWhere,
              include: {
                reserva: {
                  select: {
                    id: true,
                    estado: true,
                    ingreso: true,
                    salida: true,
                    venceEn: true,
                    montoAcordado: true,
                    moneda: true,
                    propiedad: {
                      select: { id: true, nombre: true },
                    },
                    huesped: {
                      select: { id: true, nombreCompleto: true, email: true, telefono: true },
                    },
                  },
                },
              },
              orderBy: { programadoPara: 'desc' },
              take: limit,
            }),
            prisma.notificacionInterna.count({
              where: {
                ...notifWhere,
                estado: 'PENDIENTE',
              },
            }),
            prisma.avisoReserva.count({
              where: {
                estado: { in: ['PROGRAMADO', 'PENDIENTE'] },
              },
            }),
          ]);

        // Mapear notificaciones internas a formato InternalAlert
        const mappedNotificaciones = notificaciones.map((n) => ({
          id: n.id,
          fuente: 'NOTIFICACION_INTERNA',
          tipoAviso: n.tipo,
          estado: n.estado,
          titulo: n.titulo,
          mensaje: n.mensaje,
          usuarioId: n.usuarioId,
          reservaId: n.reservaId || n.reserva?.id || undefined,
          ordenTrabajoId: n.ordenTrabajoId || n.ordenTrabajo?.id || undefined,
          propiedadId: n.propiedadId || n.propiedad?.id || undefined,
          canal: 'SISTEMA',
          plantilla:
            n.tipo === 'NUEVA_RESERVA'
              ? 'alerta-nueva-reserva'
              : 'alerta-orden-asignada',
          programadoPara: n.creadoEn.toISOString(),
          venceEnSnapshot: n.reserva?.venceEn
            ? n.reserva.venceEn.toISOString()
            : n.creadoEn.toISOString(),
          enviadoEn: n.atendidaEn ? n.atendidaEn.toISOString() : null,
          leidaEn: n.leidaEn ? n.leidaEn.toISOString() : null,
          atendidaEn: n.atendidaEn ? n.atendidaEn.toISOString() : null,
          creadoEn: n.creadoEn.toISOString(),
          reserva: n.reserva
            ? {
                id: n.reserva.id,
                estado: n.reserva.estado,
                propiedadNombre: n.reserva.propiedad.nombre,
                huespedNombre: n.reserva.huesped.nombreCompleto,
                venceEn: n.reserva.venceEn ? n.reserva.venceEn.toISOString() : null,
                montoAcordado: Number(n.reserva.montoAcordado),
                moneda: n.reserva.moneda,
              }
            : undefined,
          ordenTrabajo: n.ordenTrabajo
            ? {
                id: n.ordenTrabajo.id,
                titulo: n.ordenTrabajo.titulo,
                tipo: n.ordenTrabajo.tipo,
                prioridad: n.ordenTrabajo.prioridad,
                estado: n.ordenTrabajo.estado,
                propiedadNombre: n.ordenTrabajo.propiedad.nombre,
              }
            : undefined,
        }));

        // Mapear avisos de reserva
        const mappedAvisos = avisos.map((a) => ({
          id: a.id,
          fuente: 'AVISO_RESERVA',
          reservaId: a.reservaId,
          ordenTrabajoId: undefined,
          propiedadId: undefined,
          tipoAviso: a.tipoAviso,
          estado: a.estado,
          titulo:
            a.tipoAviso === 'EXPIRACION_PROXIMA'
              ? 'Vencimiento Próximo de Reserva'
              : 'Solicitud de Reserva Expirada',
          mensaje: `Reserva ${a.reservaId.slice(0, 8)} para ${a.reserva.propiedad.nombre}`,
          usuarioId: null,
          canal: a.canal,
          plantilla: a.plantilla,
          programadoPara: a.programadoPara.toISOString(),
          venceEnSnapshot: a.venceEnSnapshot.toISOString(),
          enviadoEn: a.enviadoEn ? a.enviadoEn.toISOString() : null,
          leidaEn: null,
          atendidaEn: a.enviadoEn ? a.enviadoEn.toISOString() : null,
          creadoEn: a.creadoEn.toISOString(),
          reserva: {
            id: a.reserva.id,
            estado: a.reserva.estado,
            propiedadNombre: a.reserva.propiedad.nombre,
            huespedNombre: a.reserva.huesped.nombreCompleto,
            venceEn: a.reserva.venceEn ? a.reserva.venceEn.toISOString() : null,
            montoAcordado: Number(a.reserva.montoAcordado),
            moneda: a.reserva.moneda,
          },
          ordenTrabajo: undefined,
        }));

        // Unificar y ordenar cronológicamente descendente
        const unified = [...mappedNotificaciones, ...mappedAvisos]
          .sort((x, y) => new Date(y.creadoEn).getTime() - new Date(x.creadoEn).getTime())
          .slice(0, limit);

        return {
          data: unified,
          meta: {
            totalPendientes: notifPendientesCount + avisosPendientesCount,
          },
        };
      }
    );

    // 2. Marcar alerta o notificación como atendida (HU-11 y HU-17)
    app.post<{
      Params: { id: string };
    }>(
      '/api/alertas/:id/atender',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const { id } = request.params;
        const userRole = request.user?.rol;
        const userEmail = request.user?.email;

        // Comprobar primero en notificaciones internas
        const notif = await prisma.notificacionInterna.findUnique({
          where: { id },
        });

        if (notif) {
          if (userRole === 'OPERADOR' && notif.usuarioId) {
            const domainUser = await prisma.usuario.findFirst({
              where: { email: userEmail, activo: true },
              select: { id: true },
            });
            if (domainUser && notif.usuarioId !== domainUser.id) {
              return reply.status(403).send({
                error: {
                  code: 'FORBIDDEN',
                  message: 'No está autorizado para atender notificaciones asignadas a otros colaboradores.',
                  requestId: request.id,
                },
              });
            }
          }

          const actualizada = await prisma.notificacionInterna.update({
            where: { id },
            data: {
              estado: 'ATENDIDA',
              atendidaEn: new Date(),
            },
          });

          return {
            id: actualizada.id,
            estado: actualizada.estado,
            mensaje: 'Notificación marcada como atendida exitosamente.',
          };
        }

        // Si no es notificación interna, buscar en avisos de reserva
        const aviso = await prisma.avisoReserva.findUnique({
          where: { id },
        });

        if (!aviso) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'La alerta o notificación indicada no existe.',
              requestId: request.id,
            },
          });
        }

        const actualizado = await prisma.avisoReserva.update({
          where: { id },
          data: {
            estado: 'ENVIADO',
            enviadoEn: new Date(),
          },
        });

        return {
          id: actualizado.id,
          estado: actualizado.estado,
          mensaje: 'Alerta marcada como atendida exitosamente.',
        };
      }
    );

    // 3. Marcar notificación como leída (HU-17)
    app.post<{
      Params: { id: string };
    }>(
      '/api/alertas/:id/leer',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const { id } = request.params;
        const userRole = request.user?.rol;
        const userEmail = request.user?.email;

        const notif = await prisma.notificacionInterna.findUnique({
          where: { id },
        });

        if (!notif) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'La notificación indicada no existe.',
              requestId: request.id,
            },
          });
        }

        if (userRole === 'OPERADOR' && notif.usuarioId) {
          const domainUser = await prisma.usuario.findFirst({
            where: { email: userEmail, activo: true },
            select: { id: true },
          });
          if (domainUser && notif.usuarioId !== domainUser.id) {
            return reply.status(403).send({
              error: {
                code: 'FORBIDDEN',
                message: 'No está autorizado para leer notificaciones asignadas a otros colaboradores.',
                requestId: request.id,
              },
            });
          }
        }

        const actualizada = await prisma.notificacionInterna.update({
          where: { id },
          data: {
            estado: notif.estado === 'PENDIENTE' ? 'LEIDA' : notif.estado,
            leidaEn: notif.leidaEn || new Date(),
          },
        });

        return {
          id: actualizada.id,
          estado: actualizada.estado,
          mensaje: 'Notificación marcada como leída exitosamente.',
        };
      }
    );
  };
}
