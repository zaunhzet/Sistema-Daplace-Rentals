import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../shared/auth.js';

export function registerAlertsRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // 1. Obtener alertas internas activas basadas en avisos y vencimientos de reservas (HU-11)
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
        const where: any = {};

        if (estadoFiltro && estadoFiltro !== 'TODOS') {
          where.estado = estadoFiltro;
        } else {
          // Por defecto mostrar las que están pendientes, programadas o fallidas
          where.estado = { in: ['PROGRAMADO', 'PENDIENTE', 'FALLIDO', 'ENVIADO'] };
        }

        const avisos = await prisma.avisoReserva.findMany({
          where,
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
        });

        // Contar cuántas alertas pendientes/programadas requieren atención inmediata
        const pendientesCount = await prisma.avisoReserva.count({
          where: {
            estado: { in: ['PROGRAMADO', 'PENDIENTE'] },
          },
        });

        return {
          data: avisos.map((a) => ({
            id: a.id,
            reservaId: a.reservaId,
            tipoAviso: a.tipoAviso,
            estado: a.estado,
            canal: a.canal,
            plantilla: a.plantilla,
            programadoPara: a.programadoPara.toISOString(),
            venceEnSnapshot: a.venceEnSnapshot.toISOString(),
            enviadoEn: a.enviadoEn ? a.enviadoEn.toISOString() : null,
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
          })),
          meta: {
            totalPendientes: pendientesCount,
          },
        };
      }
    );

    // 2. Marcar alerta como atendida / descartada
    app.post<{
      Params: { id: string };
    }>(
      '/api/alertas/:id/atender',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const { id } = request.params;

        const aviso = await prisma.avisoReserva.findUnique({
          where: { id },
        });

        if (!aviso) {
          return reply.status(404).send({
            error: {
              code: 'NOT_FOUND',
              message: 'La alerta indicada no existe.',
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
  };
}
