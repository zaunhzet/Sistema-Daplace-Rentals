import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';

export function registerPropertiesRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // 1. Listar propietarios disponibles
    app.get('/api/propietarios', async () => {
      const propietarios = await prisma.usuario.findMany({
        where: { rol: 'PROPIETARIO', activo: true },
        select: {
          id: true,
          nombre: true,
          email: true,
          telefono: true,
        },
        orderBy: { nombre: 'asc' },
      });
      return propietarios;
    });

    // 2. Listar propiedades con filtros
    app.get<{
      Querystring: {
        search?: string;
        estadoOperativo?: string;
        estadoPublicacion?: string;
        soloActivas?: string | boolean;
      };
    }>('/api/propiedades', async (request) => {
      const { search, estadoOperativo, estadoPublicacion, soloActivas } = request.query;

      const where: any = {};

      if (soloActivas === 'true' || soloActivas === true) {
        where.activa = true;
      }

      if (estadoOperativo && estadoOperativo !== 'TODOS') {
        where.estadoOperativo = estadoOperativo;
      }

      if (estadoPublicacion && estadoPublicacion !== 'TODOS') {
        where.estadoPublicacion = estadoPublicacion;
      }

      if (search && search.trim() !== '') {
        const q = search.trim();
        where.OR = [
          { nombre: { contains: q, mode: 'insensitive' } },
          { direccion: { contains: q, mode: 'insensitive' } },
          { id: { contains: q, mode: 'insensitive' } },
          { propietario: { nombre: { contains: q, mode: 'insensitive' } } },
        ];
      }

      const propiedades = await prisma.propiedad.findMany({
        where,
        include: {
          propietario: {
            select: { id: true, nombre: true, email: true, telefono: true },
          },
        },
        orderBy: { creadoEn: 'desc' },
      });

      return propiedades.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        propietarioId: p.propietarioId,
        propietarioNombre: p.propietario?.nombre || 'Sin Propietario',
        estadoOperativo: p.estadoOperativo,
        estadoPublicacion: p.estadoPublicacion,
        direccion: p.direccion,
        activa: p.activa,
        capacidadHuespedes: p.capacidadHuespedes,
        precioBaseNoche: Number(p.precioBaseNoche),
        moneda: p.moneda,
        creadoEn: p.creadoEn.toISOString(),
        actualizadoEn: p.actualizadoEn.toISOString(),
      }));
    });

    // 3. Consultar detalle de propiedad
    app.get<{ Params: { id: string } }>('/api/propiedades/:id', async (request, reply) => {
      const { id } = request.params;
      const propiedad = await prisma.propiedad.findUnique({
        where: { id },
        include: {
          propietario: {
            select: { id: true, nombre: true, email: true, telefono: true },
          },
        },
      });

      if (!propiedad) {
        return reply.status(404).send({
          error: {
            code: 'PROPERTY_NOT_FOUND',
            message: `Propiedad no encontrada con ID "${id}".`,
            requestId: request.id,
          },
        });
      }

      return {
        id: propiedad.id,
        nombre: propiedad.nombre,
        propietarioId: propiedad.propietarioId,
        propietarioNombre: propiedad.propietario?.nombre || 'Sin Propietario',
        estadoOperativo: propiedad.estadoOperativo,
        estadoPublicacion: propiedad.estadoPublicacion,
        direccion: propiedad.direccion,
        activa: propiedad.activa,
        capacidadHuespedes: propiedad.capacidadHuespedes,
        precioBaseNoche: Number(propiedad.precioBaseNoche),
        moneda: propiedad.moneda,
        creadoEn: propiedad.creadoEn.toISOString(),
        actualizadoEn: propiedad.actualizadoEn.toISOString(),
      };
    });

    // 4. Crear propiedad
    app.post<{
      Body: {
        id?: string;
        nombre: string;
        propietarioId: string;
        direccion: string;
        estadoOperativo?: 'OPERATIVA' | 'EN_MANTENIMIENTO' | 'INACTIVA';
        estadoPublicacion?: 'PUBLICADA' | 'BORRADOR' | 'PAUSADA';
        capacidadHuespedes?: number;
        precioBaseNoche?: number;
        moneda?: string;
      };
    }>('/api/propiedades', async (request, reply) => {
      const {
        id,
        nombre,
        propietarioId,
        direccion,
        estadoOperativo = 'OPERATIVA',
        estadoPublicacion = 'BORRADOR',
        capacidadHuespedes = 2,
        precioBaseNoche = 200,
        moneda = 'PEN',
      } = request.body || {};

      if (!nombre || nombre.trim().length < 3) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El nombre de la propiedad es obligatorio (mínimo 3 caracteres).',
            requestId: request.id,
          },
        });
      }

      if (!propietarioId || propietarioId.trim() === '') {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Debe seleccionar un propietario responsable.',
            requestId: request.id,
          },
        });
      }

      if (!direccion || direccion.trim().length < 5) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'La dirección operativa es obligatoria (mínimo 5 caracteres).',
            requestId: request.id,
          },
        });
      }

      if (capacidadHuespedes !== undefined && capacidadHuespedes <= 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'La capacidad de huéspedes debe ser mayor a 0.',
            requestId: request.id,
          },
        });
      }

      if (precioBaseNoche !== undefined && precioBaseNoche <= 0) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El precio base por noche debe ser mayor a 0.',
            requestId: request.id,
          },
        });
      }

      // Validar existencia de propietario
      const propietario = await prisma.usuario.findUnique({
        where: { id: propietarioId },
      });

      if (!propietario) {
        return reply.status(400).send({
          error: {
            code: 'OWNER_NOT_FOUND',
            message: `El propietario con ID "${propietarioId}" no existe.`,
            requestId: request.id,
          },
        });
      }

      const created = await prisma.propiedad.create({
        data: {
          ...(id ? { id } : {}),
          nombre: nombre.trim(),
          propietarioId,
          direccion: direccion.trim(),
          estadoOperativo,
          estadoPublicacion,
          activa: true,
          capacidadHuespedes,
          precioBaseNoche,
          moneda,
        },
        include: {
          propietario: {
            select: { id: true, nombre: true },
          },
        },
      });

      await recordAuditEvent(prisma, {
        entidad: 'Propiedad',
        entidadId: created.id,
        accion: 'CREAR_PROPIEDAD',
        actor: 'SYSTEM_DEV',
        motivo: 'Alta de propiedad en inventario',
        detalles: { nombre: created.nombre, propietarioId: created.propietarioId },
        requestId: request.id,
      });

      return reply.status(201).send({
        id: created.id,
        nombre: created.nombre,
        propietarioId: created.propietarioId,
        propietarioNombre: created.propietario?.nombre || 'Sin Propietario',
        estadoOperativo: created.estadoOperativo,
        estadoPublicacion: created.estadoPublicacion,
        direccion: created.direccion,
        activa: created.activa,
        capacidadHuespedes: created.capacidadHuespedes,
        precioBaseNoche: Number(created.precioBaseNoche),
        moneda: created.moneda,
        creadoEn: created.creadoEn.toISOString(),
        actualizadoEn: created.actualizadoEn.toISOString(),
      });
    });

    // 5. Actualizar propiedad
    app.patch<{
      Params: { id: string };
      Body: {
        nombre?: string;
        propietarioId?: string;
        direccion?: string;
        estadoOperativo?: 'OPERATIVA' | 'EN_MANTENIMIENTO' | 'INACTIVA';
        estadoPublicacion?: 'PUBLICADA' | 'BORRADOR' | 'PAUSADA';
        activa?: boolean;
        capacidadHuespedes?: number;
        precioBaseNoche?: number;
        moneda?: string;
      };
    }>('/api/propiedades/:id', async (request, reply) => {
      const { id } = request.params;
      const body = request.body || {};

      const existing = await prisma.propiedad.findUnique({
        where: { id },
      });

      if (!existing) {
        return reply.status(404).send({
          error: {
            code: 'PROPERTY_NOT_FOUND',
            message: `Propiedad no encontrada con ID "${id}".`,
            requestId: request.id,
          },
        });
      }

      if (body.nombre !== undefined && body.nombre.trim().length < 3) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El nombre de la propiedad debe tener al menos 3 caracteres.',
            requestId: request.id,
          },
        });
      }

      if (body.direccion !== undefined && body.direccion.trim().length < 5) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'La dirección operativa debe tener al menos 5 caracteres.',
            requestId: request.id,
          },
        });
      }

      if (body.propietarioId && body.propietarioId !== existing.propietarioId) {
        const ownerExists = await prisma.usuario.findUnique({
          where: { id: body.propietarioId },
        });
        if (!ownerExists) {
          return reply.status(400).send({
            error: {
              code: 'OWNER_NOT_FOUND',
              message: `El propietario con ID "${body.propietarioId}" no existe.`,
              requestId: request.id,
            },
          });
        }
      }

      const updated = await prisma.propiedad.update({
        where: { id },
        data: {
          ...(body.nombre !== undefined ? { nombre: body.nombre.trim() } : {}),
          ...(body.propietarioId !== undefined ? { propietarioId: body.propietarioId } : {}),
          ...(body.direccion !== undefined ? { direccion: body.direccion.trim() } : {}),
          ...(body.estadoOperativo !== undefined ? { estadoOperativo: body.estadoOperativo } : {}),
          ...(body.estadoPublicacion !== undefined ? { estadoPublicacion: body.estadoPublicacion } : {}),
          ...(body.activa !== undefined ? { activa: body.activa } : {}),
          ...(body.capacidadHuespedes !== undefined ? { capacidadHuespedes: body.capacidadHuespedes } : {}),
          ...(body.precioBaseNoche !== undefined ? { precioBaseNoche: body.precioBaseNoche } : {}),
          ...(body.moneda !== undefined ? { moneda: body.moneda } : {}),
        },
        include: {
          propietario: {
            select: { id: true, nombre: true },
          },
        },
      });

      await recordAuditEvent(prisma, {
        entidad: 'Propiedad',
        entidadId: updated.id,
        accion: 'ACTUALIZAR_PROPIEDAD',
        actor: 'SYSTEM_DEV',
        motivo: 'Actualización de ficha de propiedad',
        detalles: body as Record<string, unknown>,
        requestId: request.id,
      });

      return {
        id: updated.id,
        nombre: updated.nombre,
        propietarioId: updated.propietarioId,
        propietarioNombre: updated.propietario?.nombre || 'Sin Propietario',
        estadoOperativo: updated.estadoOperativo,
        estadoPublicacion: updated.estadoPublicacion,
        direccion: updated.direccion,
        activa: updated.activa,
        capacidadHuespedes: updated.capacidadHuespedes,
        precioBaseNoche: Number(updated.precioBaseNoche),
        moneda: updated.moneda,
        creadoEn: updated.creadoEn.toISOString(),
        actualizadoEn: updated.actualizadoEn.toISOString(),
      };
    });

    // 6. Activar o desactivar propiedad lógicamente (Inmunidad financiera / trazabilidad)
    app.patch<{
      Params: { id: string };
      Body: { activa: boolean };
    }>('/api/propiedades/:id/activa', async (request, reply) => {
      const { id } = request.params;
      const { activa } = request.body || {};

      if (typeof activa !== 'boolean') {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'El campo "activa" debe ser un booleano (true o false).',
            requestId: request.id,
          },
        });
      }

      const existing = await prisma.propiedad.findUnique({
        where: { id },
      });

      if (!existing) {
        return reply.status(404).send({
          error: {
            code: 'PROPERTY_NOT_FOUND',
            message: `Propiedad no encontrada con ID "${id}".`,
            requestId: request.id,
          },
        });
      }

      const updated = await prisma.propiedad.update({
        where: { id },
        data: {
          activa,
          estadoOperativo: activa ? 'OPERATIVA' : 'INACTIVA',
          estadoPublicacion: activa ? existing.estadoPublicacion : 'PAUSADA',
        },
        include: {
          propietario: {
            select: { id: true, nombre: true },
          },
        },
      });

      await recordAuditEvent(prisma, {
        entidad: 'Propiedad',
        entidadId: updated.id,
        accion: activa ? 'ACTIVAR_PROPIEDAD' : 'DESACTIVAR_PROPIEDAD',
        actor: 'SYSTEM_DEV',
        motivo: activa ? 'Reactivación operativa' : 'Desactivación lógica para preservar historial',
        requestId: request.id,
      });

      return {
        id: updated.id,
        nombre: updated.nombre,
        propietarioId: updated.propietarioId,
        propietarioNombre: updated.propietario?.nombre || 'Sin Propietario',
        estadoOperativo: updated.estadoOperativo,
        estadoPublicacion: updated.estadoPublicacion,
        direccion: updated.direccion,
        activa: updated.activa,
        capacidadHuespedes: updated.capacidadHuespedes,
        precioBaseNoche: Number(updated.precioBaseNoche),
        moneda: updated.moneda,
        creadoEn: updated.creadoEn.toISOString(),
        actualizadoEn: updated.actualizadoEn.toISOString(),
      };
    });
  };
}
