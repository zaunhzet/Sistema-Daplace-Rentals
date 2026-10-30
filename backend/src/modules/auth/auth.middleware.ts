import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthError,
  ForbiddenError,
  UnauthorizedError,
} from './auth.service.js';
import type { AccessTokenPayload, IAuthRepository, UserRole } from './auth.types.js';

export interface AuthMiddlewareConfig {
  allowedIss?: string;
  allowedAud?: string;
  allowedOrigins?: string[];
  repository?: IAuthRepository;
}

export function createAuthMiddleware(
  app: FastifyInstance,
  config: AuthMiddlewareConfig = {}
) {
  const allowedIss = config.allowedIss ?? 'daplace-rentals';
  const allowedAud = config.allowedAud ?? 'daplace-rentals-app';
  // Excluye explícitamente cualquier comodín '*'
  const allowedOrigins = (config.allowedOrigins ?? [
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ]).filter((o) => o !== '*');

  const authenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedError('Encabezado de autorización ausente.');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedError('Formato de autorización inválido. Debe ser Bearer <token>.');
    }

    let decoded: AccessTokenPayload;
    try {
      decoded = app.jwt.verify<AccessTokenPayload>(token, {
        algorithms: ['HS256'],
        allowedIss,
        allowedAud,
      });
    } catch (err: any) {
      request.log.warn({ err: err?.message }, 'Falló la verificación del access token JWT');
      throw new UnauthorizedError('El token de acceso es inválido, expiró o no cuenta con los reclamos esperados.');
    }

    // Comprobación en vivo contra PostgreSQL / Repositorio (Fix 7)
    // Garantiza que un usuario desactivado o cuyo rol haya cambiado no conserve permisos sensibles
    if (config.repository) {
      const liveUser = await config.repository.findUserById(decoded.sub);
      if (!liveUser || !liveUser.isActive) {
        request.log.warn({ userId: decoded.sub }, 'Acceso revocado: cuenta de usuario desactivada o eliminada');
        throw new UnauthorizedError('La cuenta de usuario ha sido desactivada o no está disponible.');
      }

      request.user = {
        sub: liveUser.id,
        email: liveUser.email,
        nombre: liveUser.nombre,
        rol: liveUser.rol, // Rol en vivo obtenido de la base de datos
        cargo: liveUser.cargo,
      };
    } else {
      request.user = decoded;
    }
  };

  const requireRoles = (...allowedRoles: UserRole[]) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.user) {
        throw new UnauthorizedError('Usuario no autenticado.');
      }

      if (!allowedRoles.includes(request.user.rol)) {
        request.log.warn(
          { userId: request.user.sub, rol: request.user.rol, allowedRoles },
          'Acceso denegado por rol insuficiente'
        );
        throw new ForbiddenError(
          `Acceso denegado: se requiere uno de los siguientes roles: ${allowedRoles.join(', ')}.`
        );
      }
    };
  };

  const verifyCsrf = async (request: FastifyRequest, _reply: FastifyReply) => {
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    const customHeader = request.headers['x-requested-with'] || request.headers['x-csrf-token'];

    // Origen explícito validado sin comodín '*'
    if (origin) {
      const isAllowed = allowedOrigins.includes(origin);
      if (!isAllowed) {
        throw new AuthError('CSRF_VIOLATION', 'Origen no autorizado para operaciones con cookies.', 403);
      }
    } else if (referer) {
      const isAllowed = allowedOrigins.some((allowed) => referer.startsWith(allowed));
      if (!isAllowed) {
        throw new AuthError('CSRF_VIOLATION', 'Referer no autorizado para operaciones con cookies.', 403);
      }
    }

    // Encabezado personalizado obligatorio para evitar CSRF mediante formularios estándar
    if (!customHeader) {
      throw new AuthError(
        'CSRF_VIOLATION',
        'Falta encabezado de protección CSRF (X-Requested-With o X-CSRF-Token).',
        403
      );
    }
  };

  return {
    authenticate,
    requireRoles,
    verifyCsrf,
  };
}
