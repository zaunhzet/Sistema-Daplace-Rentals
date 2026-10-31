import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth, resolveDomainActorFromDb } from '../shared/auth.js';
import { recordAuditEvent } from '../shared/audit.js';
import { AuthService } from '../modules/auth/auth.service.js';

interface CreateStaffBody {
  nombre: string;
  email: string;
  password: string;
  rol: 'ADMINISTRADOR' | 'OPERADOR';
  cargo?: string;
  telefono?: string;
}

interface UpdateStaffStatusBody {
  activo: boolean;
}

interface UpdateStaffRoleBody {
  rol: 'ADMINISTRADOR' | 'OPERADOR';
}

export function registerStaffRoutes(prisma: PrismaClient) {
  return async (app: FastifyInstance) => {
    // 1. Listar cuentas de personal interno (Solo ADMINISTRADOR)
    app.get(
      '/api/usuarios/internos',
      { preHandler: requireAuth(['ADMIN']) },
      async (_request, _reply) => {
        const staffUsers = await prisma.user.findMany({
          where: {
            rol: { in: ['ADMINISTRADOR', 'OPERADOR'] },
          },
          include: {
            usuario: {
              select: {
                id: true,
                nombre: true,
                email: true,
                telefono: true,
                rol: true,
                activo: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        return {
          data: staffUsers.map((u) => ({
            id: u.id,
            email: u.email,
            nombre: u.nombre,
            cargo: u.cargo,
            rol: u.rol,
            isActive: u.isActive,
            usuarioId: u.usuarioId,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
            usuario: u.usuario
              ? {
                  id: u.usuario.id,
                  nombre: u.usuario.nombre,
                  email: u.usuario.email,
                  telefono: u.usuario.telefono,
                  rol: u.usuario.rol,
                  activo: u.usuario.activo,
                }
              : null,
          })),
        };
      }
    );

    // 2. Crear nueva cuenta interna con vínculo explícito User/Usuario (Solo ADMINISTRADOR)
    app.post<{
      Body: CreateStaffBody;
    }>(
      '/api/usuarios/internos',
      { preHandler: requireAuth(['ADMIN']) },
      async (request, reply) => {
        const adminActorId = await resolveDomainActorFromDb(prisma, request, reply);
        if (!adminActorId) return;

        const { nombre, email, password, rol, cargo, telefono } = request.body || {};

        if (!nombre || nombre.trim().length < 2) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El nombre completo debe tener al menos 2 caracteres.',
              requestId: request.id,
            },
          });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email.trim())) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El correo electrónico proporcionado no tiene un formato válido.',
              requestId: request.id,
            },
          });
        }

        if (!password || password.length < 8) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'La contraseña debe contener al menos 8 caracteres.',
              requestId: request.id,
            },
          });
        }

        // Regla: No añadir GERENTE ni roles no permitidos
        if (rol !== 'ADMINISTRADOR' && rol !== 'OPERADOR') {
          return reply.status(400).send({
            error: {
              code: 'INVALID_STAFF_ROLE',
              message: 'El rol interno especificado no es válido. Solo se admiten ADMINISTRADOR u OPERADOR.',
              requestId: request.id,
            },
          });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Verificar si ya existe cuenta de autenticación con ese email
        const existingAuthUser = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        if (existingAuthUser) {
          return reply.status(409).send({
            error: {
              code: 'EMAIL_ALREADY_EXISTS',
              message: `Ya existe una cuenta de usuario registrada con el correo ${normalizedEmail}.`,
              requestId: request.id,
            },
          });
        }

        // Hash seguro con argon2
        const passwordHash = await AuthService.hashPassword(password);
        const domainRol = rol === 'ADMINISTRADOR' ? 'ADMIN' : 'OPERADOR';

        const result = await prisma.$transaction(async (tx) => {
          // Verificar o vincular actor de dominio Usuario
          let domainUser = await tx.usuario.findUnique({
            where: { email: normalizedEmail },
            include: { user: true },
          });

          if (domainUser) {
            if (domainUser.user) {
              throw new Error(`El usuario de dominio ya se encuentra vinculado a otra cuenta de acceso.`);
            }
            // Actualizar usuario de dominio existente
            domainUser = await tx.usuario.update({
              where: { id: domainUser.id },
              data: {
                nombre: nombre.trim(),
                rol: domainRol,
                activo: true,
                telefono: telefono?.trim() || domainUser.telefono,
              },
              include: { user: true },
            });
          } else {
            // Crear usuario de dominio
            domainUser = await tx.usuario.create({
              data: {
                nombre: nombre.trim(),
                email: normalizedEmail,
                rol: domainRol,
                activo: true,
                telefono: telefono?.trim() || null,
              },
              include: { user: true },
            });
          }

          // Crear credenciales en User vinculadas explícitamente a Usuario
          const newUser = await tx.user.create({
            data: {
              email: normalizedEmail,
              passwordHash,
              nombre: nombre.trim(),
              cargo: cargo?.trim() || null,
              rol,
              isActive: true,
              usuarioId: domainUser.id,
            },
          });

          // Registrar en bitácora de auditoría
          await recordAuditEvent(tx, {
            entidad: 'User',
            entidadId: newUser.id,
            accion: 'CREAR_CUENTA_INTERNA',
            actor: request.user?.email || 'admin@daplace.pe',
            motivo: `Alta de cuenta interna con rol ${rol} y vínculo explícito a Usuario ${domainUser.id}`,
            detalles: {
              email: normalizedEmail,
              rol,
              cargo: cargo?.trim() || null,
              usuarioId: domainUser.id,
            },
            requestId: request.id,
          });

          return {
            user: newUser,
            usuario: domainUser,
          };
        });

        return reply.status(201).send({
          data: {
            id: result.user.id,
            email: result.user.email,
            nombre: result.user.nombre,
            cargo: result.user.cargo,
            rol: result.user.rol,
            isActive: result.user.isActive,
            usuarioId: result.user.usuarioId,
            createdAt: result.user.createdAt.toISOString(),
            usuario: {
              id: result.usuario.id,
              nombre: result.usuario.nombre,
              email: result.usuario.email,
              telefono: result.usuario.telefono,
              rol: result.usuario.rol,
              activo: result.usuario.activo,
            },
          },
        });
      }
    );

    // 3. Activar o desactivar cuenta interna (Solo ADMINISTRADOR)
    app.patch<{
      Params: { id: string };
      Body: UpdateStaffStatusBody;
    }>(
      '/api/usuarios/internos/:id/estado',
      { preHandler: requireAuth(['ADMIN']) },
      async (request, reply) => {
        const adminActorId = await resolveDomainActorFromDb(prisma, request, reply);
        if (!adminActorId) return;

        const { id } = request.params;
        const { activo } = request.body || {};

        if (typeof activo !== 'boolean') {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'El campo "activo" debe ser un booleano (true o false).',
              requestId: request.id,
            },
          });
        }

        // Prevenir auto-desactivación del propio administrador
        if (
          id === request.user?.id ||
          (request.user?.usuarioId && id === request.user.usuarioId)
        ) {
          return reply.status(400).send({
            error: {
              code: 'CANNOT_DEACTIVATE_OWN_ACCOUNT',
              message: 'Por seguridad, un administrador no puede desactivar su propia cuenta activa.',
              requestId: request.id,
            },
          });
        }

        const targetUser = await prisma.user.findUnique({
          where: { id },
          include: { usuario: true },
        });

        if (!targetUser) {
          return reply.status(404).send({
            error: {
              code: 'USER_NOT_FOUND',
              message: 'No se encontró la cuenta de usuario especificada.',
              requestId: request.id,
            },
          });
        }

        const result = await prisma.$transaction(async (tx) => {
          const updatedUser = await tx.user.update({
            where: { id },
            data: { isActive: activo },
          });

          let updatedUsuario = null;
          if (targetUser.usuarioId) {
            updatedUsuario = await tx.usuario.update({
              where: { id: targetUser.usuarioId },
              data: { activo },
            });
          }

          // Si se desactiva, revocar todas las sesiones activas en auth_sessions
          if (!activo) {
            await tx.authSession.updateMany({
              where: {
                userId: id,
                revokedAt: null,
              },
              data: {
                revokedAt: new Date(),
              },
            });
          }

          const accion = activo ? 'ACTIVAR_CUENTA_INTERNA' : 'DESACTIVAR_CUENTA_INTERNA';
          await recordAuditEvent(tx, {
            entidad: 'User',
            entidadId: id,
            accion,
            actor: request.user?.email || 'admin@daplace.pe',
            motivo: `Cambio de estado administrativo a ${activo ? 'ACTIVO' : 'INACTIVO'}`,
            detalles: {
              email: targetUser.email,
              nuevoEstado: activo,
              usuarioId: targetUser.usuarioId,
            },
            requestId: request.id,
          });

          return { user: updatedUser, usuario: updatedUsuario };
        });

        return {
          data: {
            id: result.user.id,
            email: result.user.email,
            nombre: result.user.nombre,
            cargo: result.user.cargo,
            rol: result.user.rol,
            isActive: result.user.isActive,
            usuarioId: result.user.usuarioId,
            usuario: result.usuario
              ? {
                  id: result.usuario.id,
                  activo: result.usuario.activo,
                }
              : null,
          },
        };
      }
    );

    // 4. Modificar rol de cuenta interna (Solo ADMINISTRADOR)
    app.patch<{
      Params: { id: string };
      Body: UpdateStaffRoleBody;
    }>(
      '/api/usuarios/internos/:id/rol',
      { preHandler: requireAuth(['ADMIN']) },
      async (request, reply) => {
        const adminActorId = await resolveDomainActorFromDb(prisma, request, reply);
        if (!adminActorId) return;

        const { id } = request.params;
        const { rol } = request.body || {};

        if (rol !== 'ADMINISTRADOR' && rol !== 'OPERADOR') {
          return reply.status(400).send({
            error: {
              code: 'INVALID_STAFF_ROLE',
              message: 'El rol interno especificado no es válido. Solo se admiten ADMINISTRADOR u OPERADOR.',
              requestId: request.id,
            },
          });
        }

        const targetUser = await prisma.user.findUnique({
          where: { id },
          include: { usuario: true },
        });

        if (!targetUser) {
          return reply.status(404).send({
            error: {
              code: 'USER_NOT_FOUND',
              message: 'No se encontró la cuenta de usuario especificada.',
              requestId: request.id,
            },
          });
        }

        const domainRol = rol === 'ADMINISTRADOR' ? 'ADMIN' : 'OPERADOR';

        const result = await prisma.$transaction(async (tx) => {
          const updatedUser = await tx.user.update({
            where: { id },
            data: { rol },
          });

          let updatedUsuario = null;
          if (targetUser.usuarioId) {
            updatedUsuario = await tx.usuario.update({
              where: { id: targetUser.usuarioId },
              data: { rol: domainRol },
            });
          }

          await recordAuditEvent(tx, {
            entidad: 'User',
            entidadId: id,
            accion: 'CAMBIAR_ROL_CUENTA_INTERNA',
            actor: request.user?.email || 'admin@daplace.pe',
            motivo: `Modificación de rol interno de ${targetUser.rol} a ${rol}`,
            detalles: {
              email: targetUser.email,
              anteriorRol: targetUser.rol,
              nuevoRol: rol,
              usuarioId: targetUser.usuarioId,
            },
            requestId: request.id,
          });

          return { user: updatedUser, usuario: updatedUsuario };
        });

        return {
          data: {
            id: result.user.id,
            email: result.user.email,
            nombre: result.user.nombre,
            rol: result.user.rol,
            isActive: result.user.isActive,
            usuarioId: result.user.usuarioId,
            usuario: result.usuario
              ? {
                  id: result.usuario.id,
                  rol: result.usuario.rol,
                }
              : null,
          },
        };
      }
    );
  };
}
