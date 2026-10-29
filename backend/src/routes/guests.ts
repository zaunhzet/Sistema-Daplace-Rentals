import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';

export function registerGuestsRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // 1. Listar huéspedes con filtro de búsqueda
    app.get<{
      Querystring: { search?: string };
    }>('/api/huespedes', async (request) => {
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
    });

    // 2. Consultar detalle de huésped con reservas relacionadas
    app.get<{ Params: { id: string } }>('/api/huespedes/:id', async (request, reply) => {
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
    });

    // 3. Crear huésped con validación de contacto (RF04)
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
    }>('/api/huespedes', async (request, reply) => {
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

      const trimmedNombre = nombreCompleto?.trim() || '';
      if (trimmedNombre.length < 3) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El nombre completo es obligatorio (mínimo 3 caracteres).',
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

      const created = await prisma.huesped.create({
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

      await recordAuditEvent(prisma, {
        entidad: 'Huesped',
        entidadId: created.id,
        accion: 'CREAR_HUESPED',
        actor: 'SYSTEM_DEV',
        motivo: 'Alta de nuevo huésped en directorio',
        detalles: { nombreCompleto: created.nombreCompleto, email: created.email, telefono: created.telefono },
        requestId: request.id,
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
    });

    // 4. Actualizar huésped
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
    }>('/api/huespedes/:id', async (request, reply) => {
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

      if (body.nombreCompleto !== undefined && body.nombreCompleto.trim().length < 3) {
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

      const updated = await prisma.huesped.update({
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

      await recordAuditEvent(prisma, {
        entidad: 'Huesped',
        entidadId: updated.id,
        accion: 'ACTUALIZAR_HUESPED',
        actor: 'SYSTEM_DEV',
        motivo: 'Actualización de datos de huésped',
        detalles: body as Record<string, unknown>,
        requestId: request.id,
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
    });
  };
}
