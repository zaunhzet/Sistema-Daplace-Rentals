import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';
import { requireAuth, resolveDomainActorFromDb } from '../shared/auth.js';

const ALLOWED_DOC_TYPES = ['DNI', 'PASAPORTE', 'CARNET_EXTRANJERIA', 'OTRO'] as const;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;

export function registerGuestsRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // 1. Listar huéspedes con filtro de búsqueda
    app.get<{
      Querystring: { search?: string };
    }>(
      '/api/huespedes',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request) => {
        const { search } = request.query;

        const where: any = {};

        if (search && search.trim() !== '') {
          const q = search.trim();
          where.OR = [
            { nombreCompleto: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { telefono: { contains: q, mode: 'insensitive' } },
            { numeroDocumento: { contains: q, mode: 'insensitive' } },
            { id: { contains: q, mode: 'insensitive' } },
          ];
        }

        const huespedes = await prisma.huesped.findMany({
          where,
          orderBy: { creadoEn: 'desc' },
        });

        return huespedes.map((g) => ({
          id: g.id,
          nombreCompleto: g.nombreCompleto,
          telefono: g.telefono || '',
          email: g.email || '',
          tipoDocumento: g.tipoDocumento || undefined,
          numeroDocumento: g.numeroDocumento || undefined,
          nacionalidad: g.nacionalidad || undefined,
          notas: g.notas || undefined,
          creadoEn: g.creadoEn.toISOString(),
          actualizadoEn: g.actualizadoEn.toISOString(),
        }));
      }
    );

    // 2. Consultar detalle de huésped con reservas relacionadas
    app.get<{ Params: { id: string } }>(
      '/api/huespedes/:id',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const { id } = request.params;

        const guest = await prisma.huesped.findUnique({
          where: { id },
          include: {
            reservas: {
              include: {
                propiedad: {
                  select: { id: true, nombre: true },
                },
              },
              orderBy: { ingreso: 'desc' },
            },
          },
        });

        if (!guest) {
          return reply.status(404).send({
            error: {
              code: 'GUEST_NOT_FOUND',
              message: `Huésped no encontrado con ID "${id}".`,
              requestId: request.id,
            },
          });
        }

        return {
          id: guest.id,
          nombreCompleto: guest.nombreCompleto,
          telefono: guest.telefono || '',
          email: guest.email || '',
          tipoDocumento: guest.tipoDocumento || undefined,
          numeroDocumento: guest.numeroDocumento || undefined,
          nacionalidad: guest.nacionalidad || undefined,
          notas: guest.notas || undefined,
          creadoEn: guest.creadoEn.toISOString(),
          actualizadoEn: guest.actualizadoEn.toISOString(),
          reservasRelacionadas: guest.reservas.map((r) => ({
            id: r.id,
            propiedadId: r.propiedadId,
            propiedadNombre: r.propiedad.nombre,
            ingreso: r.ingreso.toISOString().slice(0, 10),
            salida: r.salida.toISOString().slice(0, 10),
            estado: r.estado,
            montoTotal: Number(r.montoAcordado).toFixed(2),
            moneda: r.moneda,
          })),
        };
      }
    );

    // 3. Crear huésped con validación de contacto (RF04) y transacción atómica
    app.post<{
      Body: {
        id?: string;
        nombreCompleto: string;
        telefono?: string;
        email?: string;
        tipoDocumento?: 'DNI' | 'PASAPORTE' | 'CARNET_EXTRANJERIA' | 'OTRO';
        numeroDocumento?: string;
        nacionalidad?: string;
        notas?: string;
      };
    }>(
      '/api/huespedes',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const {
          id,
          nombreCompleto,
          telefono,
          email,
          tipoDocumento,
          numeroDocumento,
          nacionalidad,
          notas,
        } = request.body || {};

        if (id && (!SAFE_ID_REGEX.test(id) || id.length > 64)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El identificador id contiene caracteres no permitidos o longitud excedida.',
              requestId: request.id,
            },
          });
        }

        const trimmedNombre = nombreCompleto ? nombreCompleto.trim() : '';
        if (trimmedNombre.length < 3 || trimmedNombre.length > 150) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El nombre completo es obligatorio (entre 3 y 150 caracteres).',
              requestId: request.id,
            },
          });
        }

        const trimmedTel = telefono?.trim() || null;
        const trimmedEmail = email?.trim() || null;

        // Regla RF04: Al menos un medio de contacto obligatorio
        if (!trimmedTel && !trimmedEmail) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Debe registrar al menos un medio de contacto (teléfono o correo electrónico).',
              requestId: request.id,
            },
          });
        }

        if (trimmedEmail) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(trimmedEmail)) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'El formato del correo electrónico no es válido.',
                requestId: request.id,
              },
            });
          }
        }

        if (trimmedTel && trimmedTel.length < 6) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El teléfono debe contener al menos 6 dígitos o caracteres.',
              requestId: request.id,
            },
          });
        }

        if (tipoDocumento && !ALLOWED_DOC_TYPES.includes(tipoDocumento)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `El tipo de documento debe ser uno de: ${ALLOWED_DOC_TYPES.join(', ')}.`,
              requestId: request.id,
            },
          });
        }

        // Verificar identidad de dominio activa antes de la escritura transaccional
        const actorDomainId = await resolveDomainActorFromDb(prisma, request, reply);
        if (actorDomainId === null) return;
        const actorLabel = request.user!.email;

        const created = await prisma.$transaction(async (tx) => {
          const guest = await tx.huesped.create({
            data: {
              ...(id ? { id } : {}),
              nombreCompleto: trimmedNombre,
              telefono: trimmedTel,
              email: trimmedEmail,
              tipoDocumento: tipoDocumento || null,
              numeroDocumento: numeroDocumento?.trim() || null,
              nacionalidad: nacionalidad?.trim() || null,
              notas: notas?.trim() || null,
            },
          });

          await recordAuditEvent(tx, {
            entidad: 'Huesped',
            entidadId: guest.id,
            accion: 'CREAR_HUESPED',
            actor: actorLabel,
            motivo: 'Alta de nuevo huésped en directorio',
            detalles: {
              nombreCompleto: guest.nombreCompleto,
              hasEmail: Boolean(guest.email),
              hasTelefono: Boolean(guest.telefono),
            },
            requestId: request.id,
          });

          return guest;
        });

        return reply.status(201).send({
          id: created.id,
          nombreCompleto: created.nombreCompleto,
          telefono: created.telefono || '',
          email: created.email || '',
          tipoDocumento: created.tipoDocumento || undefined,
          numeroDocumento: created.numeroDocumento || undefined,
          nacionalidad: created.nacionalidad || undefined,
          notas: created.notas || undefined,
          creadoEn: created.creadoEn.toISOString(),
          actualizadoEn: created.actualizadoEn.toISOString(),
        });
      }
    );

    // 4. Actualizar huésped (Transaccional y Auditable)
    app.patch<{
      Params: { id: string };
      Body: {
        nombreCompleto?: string;
        telefono?: string;
        email?: string;
        tipoDocumento?: 'DNI' | 'PASAPORTE' | 'CARNET_EXTRANJERIA' | 'OTRO';
        numeroDocumento?: string;
        nacionalidad?: string;
        notas?: string;
      };
    }>(
      '/api/huespedes/:id',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const { id } = request.params;
        const body = request.body || {};

        const existing = await prisma.huesped.findUnique({
          where: { id },
        });

        if (!existing) {
          return reply.status(404).send({
            error: {
              code: 'GUEST_NOT_FOUND',
              message: `Huésped no encontrado con ID "${id}".`,
              requestId: request.id,
            },
          });
        }

        if (body.nombreCompleto !== undefined && (typeof body.nombreCompleto !== 'string' || body.nombreCompleto.trim().length < 3)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El nombre completo debe tener al menos 3 caracteres.',
              requestId: request.id,
            },
          });
        }

        if (body.email !== undefined && body.email.trim() !== '') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(body.email.trim())) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'El formato del correo electrónico no es válido.',
                requestId: request.id,
              },
            });
          }
        }

        if (body.telefono !== undefined && body.telefono.trim() !== '' && body.telefono.trim().length < 6) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El teléfono debe contener al menos 6 dígitos o caracteres.',
              requestId: request.id,
            },
          });
        }

        if (body.tipoDocumento !== undefined && !ALLOWED_DOC_TYPES.includes(body.tipoDocumento)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `El tipo de documento debe ser uno de: ${ALLOWED_DOC_TYPES.join(', ')}.`,
              requestId: request.id,
            },
          });
        }

        // Verificar identidad de dominio activa antes de la escritura transaccional
        const actorDomainId = await resolveDomainActorFromDb(prisma, request, reply);
        if (actorDomainId === null) return;
        const actorLabel = request.user!.email;

        const updated = await prisma.$transaction(async (tx) => {
          const guest = await tx.huesped.update({
            where: { id },
            data: {
              ...(body.nombreCompleto !== undefined ? { nombreCompleto: body.nombreCompleto.trim() } : {}),
              ...(body.telefono !== undefined ? { telefono: body.telefono.trim() || null } : {}),
              ...(body.email !== undefined ? { email: body.email.trim() || null } : {}),
              ...(body.tipoDocumento !== undefined ? { tipoDocumento: body.tipoDocumento } : {}),
              ...(body.numeroDocumento !== undefined ? { numeroDocumento: body.numeroDocumento.trim() || null } : {}),
              ...(body.nacionalidad !== undefined ? { nacionalidad: body.nacionalidad.trim() || null } : {}),
              ...(body.notas !== undefined ? { notas: body.notas.trim() || null } : {}),
            },
          });

          await recordAuditEvent(tx, {
            entidad: 'Huesped',
            entidadId: guest.id,
            accion: 'ACTUALIZAR_HUESPED',
            actor: actorLabel,
            motivo: 'Actualización de datos de huésped',
            detalles: {
              actualizado: Object.keys(body),
            },
            requestId: request.id,
          });

          return guest;
        });

        return {
          id: updated.id,
          nombreCompleto: updated.nombreCompleto,
          telefono: updated.telefono || '',
          email: updated.email || '',
          tipoDocumento: updated.tipoDocumento || undefined,
          numeroDocumento: updated.numeroDocumento || undefined,
          nacionalidad: updated.nacionalidad || undefined,
          notas: updated.notas || undefined,
          creadoEn: updated.creadoEn.toISOString(),
          actualizadoEn: updated.actualizadoEn.toISOString(),
        };
      }
    );
  };
}
