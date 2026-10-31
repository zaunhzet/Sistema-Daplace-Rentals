import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { recordAuditEvent } from '../shared/audit.js';
import { requireAuth } from '../shared/auth.js';

const ALLOWED_OPERATING_STATUS = ['OPERATIVA', 'EN_MANTENIMIENTO', 'INACTIVA'] as const;
const ALLOWED_PUBLISHING_STATUS = ['PUBLICADA', 'BORRADOR', 'PAUSADA'] as const;
const ALLOWED_CURRENCIES = ['PEN', 'USD'] as const;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;

export function registerPropertiesRoutes(prisma: PrismaClient): FastifyPluginAsync {
  return async (app) => {
    // 1. Listar propietarios disponibles
    app.get(
      '/api/propietarios',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async () => {
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
      }
    );

    // 1b. Registrar nuevo propietario (Actor de Dominio Usuario con rol PROPIETARIO)
    app.post<{
      Body: {
        id?: string;
        nombre: string;
        email: string;
        telefono?: string;
      };
    }>(
      '/api/propietarios',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
        const { id, nombre, email, telefono } = request.body || {};

        if (id && (!SAFE_ID_REGEX.test(id) || id.length > 64)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El identificador id contiene caracteres no válidos o longitud excedida.',
              requestId: request.id,
            },
          });
        }

        const trimmedNombre = nombre ? nombre.trim() : '';
        if (trimmedNombre.length < 3 || trimmedNombre.length > 150) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El nombre del propietario es obligatorio (entre 3 y 150 caracteres).',
              requestId: request.id,
            },
          });
        }

        const trimmedEmail = email ? email.trim().toLowerCase() : '';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Debe ingresar un correo electrónico válido para el propietario.',
              requestId: request.id,
            },
          });
        }

        const trimmedTelefono = telefono?.trim() || null;
        if (trimmedTelefono && trimmedTelefono.length < 6) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El teléfono debe contener al menos 6 dígitos o caracteres si se especifica.',
              requestId: request.id,
            },
          });
        }

        // Comprobación de unicidad de email en Usuario
        const existingUsuario = await prisma.usuario.findUnique({
          where: { email: trimmedEmail },
        });

        if (existingUsuario) {
          return reply.status(409).send({
            error: {
              code: 'DUPLICATE_OWNER_EMAIL',
              message: `Ya existe un usuario o propietario registrado con el correo "${trimmedEmail}".`,
              requestId: request.id,
            },
          });
        }

        // Exigir actor transaccional válido antes de registrar auditoría de dominio
        const actorUsuarioId = request.user?.usuarioId;
        if (!actorUsuarioId) {
          return reply.status(403).send({
            error: {
              code: 'DOMAIN_IDENTITY_REQUIRED',
              message: 'La cuenta no tiene una identidad de dominio vinculada para realizar acciones auditables de propietarios.',
              requestId: request.id,
            },
          });
        }

        // Verificar que el actor exista efectivamente como Usuario en la base de datos de dominio
        const actorDomain = await prisma.usuario.findUnique({
          where: { id: actorUsuarioId },
        });

        if (!actorDomain || !actorDomain.activo) {
          return reply.status(403).send({
            error: {
              code: 'DOMAIN_IDENTITY_REQUIRED',
              message: 'El actor transaccional no existe o no se encuentra activo en el dominio.',
              requestId: request.id,
            },
          });
        }

        const createdPropietario = await prisma.$transaction(async (tx) => {
          const usuario = await tx.usuario.create({
            data: {
              ...(id ? { id } : {}),
              nombre: trimmedNombre,
              email: trimmedEmail,
              telefono: trimmedTelefono,
              rol: 'PROPIETARIO',
              activo: true,
            },
            select: {
              id: true,
              nombre: true,
              email: true,
              telefono: true,
              rol: true,
              activo: true,
              creadoEn: true,
            },
          });

          await recordAuditEvent(tx, {
            entidad: 'Usuario',
            entidadId: usuario.id,
            accion: 'CREAR_PROPIETARIO',
            actor: actorUsuarioId,
            motivo: 'Registro de nuevo propietario de dominio',
            detalles: {
              nombre: usuario.nombre,
              email: usuario.email,
              hasTelefono: Boolean(usuario.telefono),
              rol: usuario.rol,
            },
            requestId: request.id,
          });

          return usuario;
        });

        return reply.status(201).send({
          id: createdPropietario.id,
          nombre: createdPropietario.nombre,
          email: createdPropietario.email,
          telefono: createdPropietario.telefono,
        });
      }
    );

    // 2. Listar propiedades con filtros
    app.get<{
      Querystring: {
        search?: string;
        estadoOperativo?: string;
        estadoPublicacion?: string;
        soloActivas?: string | boolean;
      };
    }>(
      '/api/propiedades',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR', 'PROPIETARIO']) },
      async (request, reply) => {
        const { search, estadoOperativo, estadoPublicacion, soloActivas } = request.query;

        const where: any = {};

        // Si el usuario es propietario, restringir estrictamente a sus propiedades por su identidad transaccional
        if (request.user?.rol === 'PROPIETARIO') {
          if (!request.user.usuarioId) {
            return reply.status(403).send({
              error: {
                code: 'DOMAIN_IDENTITY_REQUIRED',
                message: 'Se requiere una identidad transaccional (usuarioId) vinculada para acceder a recursos de propietario.',
                requestId: request.id,
              },
            });
          }
          where.propietarioId = request.user.usuarioId;
        }

        if (soloActivas === 'true' || soloActivas === true) {
          where.activa = true;
        }

        if (estadoOperativo && estadoOperativo !== 'TODOS') {
          if (ALLOWED_OPERATING_STATUS.includes(estadoOperativo as any)) {
            where.estadoOperativo = estadoOperativo;
          }
        }

        if (estadoPublicacion && estadoPublicacion !== 'TODOS') {
          if (ALLOWED_PUBLISHING_STATUS.includes(estadoPublicacion as any)) {
            where.estadoPublicacion = estadoPublicacion;
          }
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
      }
    );

    // 3. Consultar detalle de propiedad
    app.get<{ Params: { id: string } }>(
      '/api/propiedades/:id',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR', 'PROPIETARIO']) },
      async (request, reply) => {
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

        // Restricción para rol PROPIETARIO: exige usuarioId y pertenencia estricta
        if (request.user?.rol === 'PROPIETARIO') {
          if (!request.user.usuarioId) {
            return reply.status(403).send({
              error: {
                code: 'DOMAIN_IDENTITY_REQUIRED',
                message: 'Se requiere una identidad transaccional (usuarioId) vinculada para acceder a recursos de propietario.',
                requestId: request.id,
              },
            });
          }
          if (propiedad.propietarioId !== request.user.usuarioId) {
            return reply.status(403).send({
              error: {
                code: 'FORBIDDEN',
                message: 'No tiene autorización para visualizar los datos de esta propiedad.',
                requestId: request.id,
              },
            });
          }
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
      }
    );

    // 4. Crear propiedad (Transaccional y Auditable)
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
    }>(
      '/api/propiedades',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
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

        if (id && (!SAFE_ID_REGEX.test(id) || id.length > 64)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El identificador id contiene caracteres no válidos o longitud excedida.',
              requestId: request.id,
            },
          });
        }

        if (!nombre || typeof nombre !== 'string' || nombre.trim().length < 3 || nombre.trim().length > 150) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El nombre de la propiedad es obligatorio (entre 3 y 150 caracteres).',
              requestId: request.id,
            },
          });
        }

        if (!propietarioId || typeof propietarioId !== 'string' || propietarioId.trim() === '') {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Debe seleccionar un propietario responsable.',
              requestId: request.id,
            },
          });
        }

        if (!direccion || typeof direccion !== 'string' || direccion.trim().length < 5 || direccion.trim().length > 255) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'La dirección operativa es obligatoria (entre 5 y 255 caracteres).',
              requestId: request.id,
            },
          });
        }

        if (!ALLOWED_OPERATING_STATUS.includes(estadoOperativo)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `El estado operativo debe ser uno de: ${ALLOWED_OPERATING_STATUS.join(', ')}.`,
              requestId: request.id,
            },
          });
        }

        if (!ALLOWED_PUBLISHING_STATUS.includes(estadoPublicacion)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `El estado de publicación debe ser uno de: ${ALLOWED_PUBLISHING_STATUS.join(', ')}.`,
              requestId: request.id,
            },
          });
        }

        const numCapacidad = Number(capacidadHuespedes);
        if (!Number.isInteger(numCapacidad) || numCapacidad <= 0 || numCapacidad > 100) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'La capacidad de huéspedes debe ser un entero entre 1 y 100.',
              requestId: request.id,
            },
          });
        }

        const numPrecio = Number(precioBaseNoche);
        if (!Number.isFinite(numPrecio) || numPrecio <= 0) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El precio base por noche debe ser un número finito mayor a 0.',
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

        const actorId = request.user!.id;

        // Mutación y auditoría dentro de la misma transacción atómica
        const created = await prisma.$transaction(async (tx) => {
          const prop = await tx.propiedad.create({
            data: {
              ...(id ? { id } : {}),
              nombre: nombre.trim(),
              propietarioId,
              direccion: direccion.trim(),
              estadoOperativo,
              estadoPublicacion,
              activa: true,
              capacidadHuespedes: numCapacidad,
              precioBaseNoche: numPrecio,
              moneda,
            },
            include: {
              propietario: {
                select: { id: true, nombre: true },
              },
            },
          });

          await recordAuditEvent(tx, {
            entidad: 'Propiedad',
            entidadId: prop.id,
            accion: 'CREAR_PROPIEDAD',
            actor: actorId,
            motivo: 'Alta de propiedad en inventario',
            detalles: { nombre: prop.nombre, propietarioId: prop.propietarioId },
            requestId: request.id,
          });

          return prop;
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
      }
    );

    // 5. Actualizar propiedad (Transaccional y Auditable)
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
    }>(
      '/api/propiedades/:id',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
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

        if (body.nombre !== undefined && (typeof body.nombre !== 'string' || body.nombre.trim().length < 3)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El nombre de la propiedad debe tener al menos 3 caracteres.',
              requestId: request.id,
            },
          });
        }

        if (body.direccion !== undefined && (typeof body.direccion !== 'string' || body.direccion.trim().length < 5)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'La dirección operativa debe tener al menos 5 caracteres.',
              requestId: request.id,
            },
          });
        }

        if (body.estadoOperativo !== undefined && !ALLOWED_OPERATING_STATUS.includes(body.estadoOperativo)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `El estado operativo debe ser uno de: ${ALLOWED_OPERATING_STATUS.join(', ')}.`,
              requestId: request.id,
            },
          });
        }

        if (body.estadoPublicacion !== undefined && !ALLOWED_PUBLISHING_STATUS.includes(body.estadoPublicacion)) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: `El estado de publicación debe ser uno de: ${ALLOWED_PUBLISHING_STATUS.join(', ')}.`,
              requestId: request.id,
            },
          });
        }

        if (body.precioBaseNoche !== undefined) {
          const numPrecio = Number(body.precioBaseNoche);
          if (!Number.isFinite(numPrecio) || numPrecio <= 0) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'El precio base por noche debe ser un número finito mayor a 0.',
                requestId: request.id,
              },
            });
          }
        }

        if (body.capacidadHuespedes !== undefined) {
          const numCap = Number(body.capacidadHuespedes);
          if (!Number.isInteger(numCap) || numCap <= 0 || numCap > 100) {
            return reply.status(400).send({
              error: {
                code: 'VALIDATION_ERROR',
                message: 'La capacidad de huéspedes debe ser un entero entre 1 y 100.',
                requestId: request.id,
              },
            });
          }
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

        const actorId = request.user!.id;

        const updated = await prisma.$transaction(async (tx) => {
          const prop = await tx.propiedad.update({
            where: { id },
            data: {
              ...(body.nombre !== undefined ? { nombre: body.nombre.trim() } : {}),
              ...(body.propietarioId !== undefined ? { propietarioId: body.propietarioId } : {}),
              ...(body.direccion !== undefined ? { direccion: body.direccion.trim() } : {}),
              ...(body.estadoOperativo !== undefined ? { estadoOperativo: body.estadoOperativo } : {}),
              ...(body.estadoPublicacion !== undefined ? { estadoPublicacion: body.estadoPublicacion } : {}),
              ...(body.activa !== undefined ? { activa: body.activa } : {}),
              ...(body.capacidadHuespedes !== undefined ? { capacidadHuespedes: Number(body.capacidadHuespedes) } : {}),
              ...(body.precioBaseNoche !== undefined ? { precioBaseNoche: Number(body.precioBaseNoche) } : {}),
              ...(body.moneda !== undefined ? { moneda: body.moneda } : {}),
            },
            include: {
              propietario: {
                select: { id: true, nombre: true },
              },
            },
          });

          await recordAuditEvent(tx, {
            entidad: 'Propiedad',
            entidadId: prop.id,
            accion: 'ACTUALIZAR_PROPIEDAD',
            actor: actorId,
            motivo: 'Actualización de ficha de propiedad',
            detalles: body as Record<string, unknown>,
            requestId: request.id,
          });

          return prop;
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
      }
    );

    // 6. Activar o desactivar propiedad lógicamente (Inmunidad financiera y transaccional)
    app.patch<{
      Params: { id: string };
      Body: { activa: boolean };
    }>(
      '/api/propiedades/:id/activa',
      { preHandler: requireAuth(['ADMIN', 'OPERADOR']) },
      async (request, reply) => {
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

        const actorId = request.user!.id;

        const updated = await prisma.$transaction(async (tx) => {
          const prop = await tx.propiedad.update({
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

          await recordAuditEvent(tx, {
            entidad: 'Propiedad',
            entidadId: prop.id,
            accion: activa ? 'ACTIVAR_PROPIEDAD' : 'DESACTIVAR_PROPIEDAD',
            actor: actorId,
            motivo: activa ? 'Reactivación operativa' : 'Desactivación lógica para preservar historial',
            requestId: request.id,
          });

          return prop;
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
      }
    );
  };
}

