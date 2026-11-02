import type { FastifyPluginAsync } from 'fastify';
import { AuthService } from '../modules/auth/auth.service.js';
import { createAuthMiddleware } from '../modules/auth/auth.middleware.js';
import type { IAuthRepository } from '../modules/auth/auth.types.js';

export interface AccountRoutesOptions {
  repository: IAuthRepository;
  allowedOrigins?: string[];
  secureCookies?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerAccountRoutes(options: AccountRoutesOptions): FastifyPluginAsync {
  return async (app) => {
    const isSecureCookie = options.secureCookies ?? (process.env.NODE_ENV === 'production');
    const { authenticate, verifyCsrf } = createAuthMiddleware(app, {
      repository: options.repository,
      allowedOrigins: options.allowedOrigins,
    });

    // 1. GET /api/cuenta/perfil — Consultar datos y correo de la cuenta propia autenticada
    app.get(
      '/api/cuenta/perfil',
      {
        preHandler: [authenticate],
      },
      async (request, reply) => {
        const userId = request.user.sub;
        const user = await options.repository.findUserById(userId);

        if (!user || !user.isActive) {
          return reply.status(404).send({
            error: {
              code: 'USER_NOT_FOUND',
              message: 'La cuenta de usuario no existe o se encuentra inactiva.',
              requestId: request.id,
            },
          });
        }

        return reply.status(200).send({
          user: {
            id: user.id,
            email: user.email,
            nombre: user.nombre,
            cargo: user.cargo ?? null,
            rol: user.rol,
            usuarioId: user.usuarioId ?? null,
          },
        });
      }
    );

    // 2. PATCH /api/cuenta/email — Actualizar correo con confirmación de contraseña actual
    app.patch<{
      Body: {
        nuevoEmail?: string;
        passwordActual?: string;
      };
    }>(
      '/api/cuenta/email',
      {
        preHandler: [authenticate, verifyCsrf],
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
          },
        },
      },
      async (request, reply) => {
        const { nuevoEmail, passwordActual } = request.body || {};

        if (!nuevoEmail || !passwordActual) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los campos nuevoEmail y passwordActual son obligatorios.',
              requestId: request.id,
            },
          });
        }

        const emailNorm = nuevoEmail.trim().toLowerCase();
        if (!EMAIL_REGEX.test(emailNorm)) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_EMAIL_FORMAT',
              message: 'El formato del nuevo correo electrónico no es válido.',
              requestId: request.id,
            },
          });
        }

        // El backend identifica la cuenta por el JWT autenticado, nunca por un id del body
        const userId = request.user.sub;
        const user = await options.repository.findUserById(userId);

        if (!user || !user.isActive) {
          return reply.status(404).send({
            error: {
              code: 'USER_NOT_FOUND',
              message: 'La cuenta de usuario no existe o se encuentra inactiva.',
              requestId: request.id,
            },
          });
        }

        // Verificar contraseña actual con Argon2id
        const isPasswordValid = await AuthService.verifyPassword(user.passwordHash, passwordActual);
        if (!isPasswordValid) {
          return reply.status(401).send({
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'La contraseña actual proporcionada es incorrecta.',
              requestId: request.id,
            },
          });
        }

        if (emailNorm === user.email.toLowerCase()) {
          return reply.status(400).send({
            error: {
              code: 'SAME_EMAIL',
              message: 'El nuevo correo electrónico debe ser diferente al actual.',
              requestId: request.id,
            },
          });
        }

        // Control estricto de duplicados
        const existingWithEmail = await options.repository.findUserByEmail(emailNorm);
        if (existingWithEmail && existingWithEmail.id !== user.id) {
          return reply.status(409).send({
            error: {
              code: 'EMAIL_ALREADY_EXISTS',
              message: 'El correo electrónico ya está registrado por otra cuenta en el sistema.',
              requestId: request.id,
            },
          });
        }

        // Preservar id, rol, usuarioId y demás vínculos
        const updatedUser = await options.repository.updateUser(user.id, {
          email: emailNorm,
        });

        request.log.info(
          {
            event: 'account.email_updated',
            userId: user.id,
            oldEmail: user.email,
            newEmail: emailNorm,
          },
          'Correo de acceso actualizado exitosamente'
        );

        return reply.status(200).send({
          success: true,
          message: 'Correo electrónico de acceso actualizado exitosamente.',
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            nombre: updatedUser.nombre,
            cargo: updatedUser.cargo ?? null,
            rol: updatedUser.rol,
            usuarioId: updatedUser.usuarioId ?? null,
          },
        });
      }
    );

    // 3. PATCH /api/cuenta/password — Cambiar contraseña con confirmación actual y revocación de sesiones
    app.patch<{
      Body: {
        passwordActual?: string;
        nuevoPassword?: string;
      };
    }>(
      '/api/cuenta/password',
      {
        preHandler: [authenticate, verifyCsrf],
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
          },
        },
      },
      async (request, reply) => {
        const { passwordActual, nuevoPassword } = request.body || {};

        if (!passwordActual || !nuevoPassword) {
          return reply.status(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Los campos passwordActual y nuevoPassword son obligatorios.',
              requestId: request.id,
            },
          });
        }

        const userId = request.user.sub;
        const user = await options.repository.findUserById(userId);

        if (!user || !user.isActive) {
          return reply.status(404).send({
            error: {
              code: 'USER_NOT_FOUND',
              message: 'La cuenta de usuario no existe o se encuentra inactiva.',
              requestId: request.id,
            },
          });
        }

        // Verificar contraseña actual
        const isPasswordValid = await AuthService.verifyPassword(user.passwordHash, passwordActual);
        if (!isPasswordValid) {
          return reply.status(401).send({
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'La contraseña actual proporcionada es incorrecta.',
              requestId: request.id,
            },
          });
        }

        // Validación de robustez de contraseña
        const isLengthValid = nuevoPassword.length >= 8;
        const hasUpperCase = /[A-Z]/.test(nuevoPassword);
        const hasNumber = /[0-9]/.test(nuevoPassword);
        const hasSpecial = /[^A-Za-z0-9]/.test(nuevoPassword);

        if (!isLengthValid || !hasUpperCase || !hasNumber || !hasSpecial) {
          return reply.status(400).send({
            error: {
              code: 'WEAK_PASSWORD',
              message: 'La nueva contraseña debe tener al menos 8 caracteres e incluir mayúsculas, números y símbolos.',
              requestId: request.id,
            },
          });
        }

        if (passwordActual === nuevoPassword) {
          return reply.status(400).send({
            error: {
              code: 'SAME_PASSWORD',
              message: 'La nueva contraseña no puede ser idéntica a la contraseña actual.',
              requestId: request.id,
            },
          });
        }

        // Calcular nuevo hash con Argon2id
        const newPasswordHash = await AuthService.hashPassword(nuevoPassword);

        // Actualizar contraseña conservando id, rol, usuarioId y propiedades
        await options.repository.updateUser(user.id, {
          passwordHash: newPasswordHash,
        });

        // Revocar TODAS las sesiones activas del usuario (requiere re-login seguro)
        await options.repository.revokeAllUserSessions(user.id);

        reply.clearCookie('refreshToken', {
          path: '/auth',
          httpOnly: true,
          secure: isSecureCookie,
          sameSite: 'lax',
        });

        request.log.info(
          { event: 'account.password_updated', userId: user.id },
          'Contraseña actualizada y sesiones previas revocadas'
        );

        return reply.status(200).send({
          success: true,
          message: 'Contraseña actualizada exitosamente. Sus sesiones previas han sido revocadas; por favor inicie sesión nuevamente.',
        });
      }
    );
  };
}
