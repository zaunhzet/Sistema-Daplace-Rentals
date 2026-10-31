import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../shared/auth.js';

export interface AuditQueryFilters {
  entidad?: string;
  accion?: string;
  actor?: string;
  search?: string;
  desde?: string;
  hasta?: string;
  page?: string | number;
  limit?: string | number;
}

export function registerAuditRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // Consulta centralizada de bitácora y trazabilidad de eventos (HU-20 / TAREA P1-03)
    // Criterio de aceptación estricto: Solo accesible por rol ADMINISTRADOR
    app.get<{
      Querystring: AuditQueryFilters;
    }>(
      '/api/auditoria',
      { preHandler: requireAuth(['ADMIN']) },
      async (request, _reply) => {
        const { entidad, accion, actor, search, desde, hasta } = request.query;

        let page = Number(request.query.page) || 1;
        let limit = Number(request.query.limit) || 20;

        if (page < 1) page = 1;
        if (limit < 1) limit = 1;
        if (limit > 100) limit = 100;

        const where: any = {};

        if (entidad && entidad.trim() !== '' && entidad !== 'TODAS') {
          where.entidad = { equals: entidad.trim(), mode: 'insensitive' };
        }

        if (accion && accion.trim() !== '' && accion !== 'TODAS') {
          where.accion = { equals: accion.trim(), mode: 'insensitive' };
        }

        if (actor && actor.trim() !== '') {
          where.actor = { contains: actor.trim(), mode: 'insensitive' };
        }

        if (search && search.trim() !== '') {
          const q = search.trim();
          where.OR = [
            { entidadId: { contains: q, mode: 'insensitive' } },
            { actor: { contains: q, mode: 'insensitive' } },
            { motivo: { contains: q, mode: 'insensitive' } },
            { accion: { contains: q, mode: 'insensitive' } },
          ];
        }

        if (desde && desde.trim() !== '') {
          const d = new Date(desde.trim());
          if (!Number.isNaN(d.getTime())) {
            where.creadoEn = { ...(where.creadoEn || {}), gte: d };
          }
        }

        if (hasta && hasta.trim() !== '') {
          const h = new Date(hasta.trim());
          if (!Number.isNaN(h.getTime())) {
            // Fin del día hasta 23:59:59.999 si no incluye hora
            h.setUTCHours(23, 59, 59, 999);
            where.creadoEn = { ...(where.creadoEn || {}), lte: h };
          }
        }

        const skip = (page - 1) * limit;

        const [total, items] = await Promise.all([
          prisma.auditoriaEvento.count({ where }),
          prisma.auditoriaEvento.findMany({
            where,
            orderBy: { creadoEn: 'desc' },
            skip,
            take: limit,
          }),
        ]);

        const totalPages = Math.ceil(total / limit) || 1;

        return {
          data: items.map((e) => ({
            id: e.id,
            entidad: e.entidad,
            entidadId: e.entidadId,
            accion: e.accion,
            actor: e.actor,
            motivo: e.motivo,
            detalles: e.detalles,
            requestId: e.requestId,
            creadoEn: e.creadoEn.toISOString(),
          })),
          meta: {
            total,
            page,
            limit,
            totalPages,
          },
        };
      }
    );
  };
}
