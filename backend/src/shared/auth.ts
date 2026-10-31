import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AccessTokenPayload, UserRole } from '../modules/auth/auth.types.js';

export type { UserRole };
export type AuthUser = AccessTokenPayload;

declare module 'fastify' {
  interface FastifyRequest {
    isDemoBypass?: boolean;
  }
}

const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'];

/**
 * Determina si la petición actual proviene de loopback local.
 */
function isLoopbackRequest(request: FastifyRequest): boolean {
  const ip = request.ip || request.socket.remoteAddress || '';
  return LOOPBACK_HOSTS.includes(ip.toLowerCase());
}

/**
 * Resuelve la identidad de la petición si no fue resuelta por token Bearer.
 */
export async function authenticateRequestHook(request: FastifyRequest): Promise<void> {
  if (request.user) {
    return;
  }

  // Bypass de demostración local temporal (estrictamente condicionado)
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const demoBypassEnabled = process.env.ENABLE_DEMO_AUTH_BYPASS === 'true';

  // Regla crítica: En producción, el bypass está terminantemente prohibido
  if (nodeEnv === 'production' && demoBypassEnabled) {
    throw new Error('CONFIGURACIÓN INSEGURA CRÍTICA: ENABLE_DEMO_AUTH_BYPASS no puede estar activo en producción.');
  }

  if (demoBypassEnabled && (nodeEnv === 'development' || nodeEnv === 'test') && isLoopbackRequest(request)) {
    // Actor de demostración local autorizado
    request.user = {
      id: 'usr-admin',
      sub: 'usr-admin',
      usuarioId: 'usr-admin',
      nombre: 'Administrador Demo Local',
      email: 'admin@daplace.example.invalid',
      rol: 'ADMIN',
    };
    request.isDemoBypass = true;
    return;
  }

  // Sin identidad verificada
  (request as any).user = undefined;
}

/**
 * Resuelve el `usuarioId` de dominio desde la solicitud autenticada.
 *
 * Uso: llamar al inicio de cualquier handler que realice escrituras transaccionales
 * que requieran una FK a `Usuario` (registradoPorId, conciliadoPorId, actorId, etc.).
 *
 * Si el User de autenticación no tiene un `Usuario` de dominio vinculado y activo,
 * responde 403 con código `DOMAIN_IDENTITY_REQUIRED` antes de ejecutar cualquier write.
 *
 * @returns string — el usuarioId de dominio verificado (nunca null)
 */
export function resolveDomainActor(request: FastifyRequest, reply: FastifyReply): string | null {
  const usuarioId = request.user?.usuarioId ?? null;
  if (!usuarioId) {
    reply.status(403).send({
      error: {
        code: 'DOMAIN_IDENTITY_REQUIRED',
        message:
          'El usuario autenticado no tiene una identidad de dominio (Usuario) vinculada y activa. ' +
          'Se requiere vínculo explícito con un Actor de Dominio para realizar esta operación transaccional.',
        requestId: request.id,
      },
    });
    return null;
  }
  return usuarioId;
}

/**
 * Middleware / PreHandler que exige una identidad autenticada y opcionalmente valida roles requeridos.
 */
export function requireAuth(allowedRoles?: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Verificar si hay usuario autenticado
    if (!request.user) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Se requiere autenticación válida para acceder a este recurso administrativo.',
          requestId: request.id,
        },
      });
    }

    // 2. Verificar rol si se especificaron roles permitidos
    if (allowedRoles && allowedRoles.length > 0) {
      const userRole = request.user.rol;
      const isAllowed = allowedRoles.some((role) => {
        if (role === userRole) return true;
        if ((role === 'ADMIN' || role === 'ADMINISTRADOR') && (userRole === 'ADMIN' || userRole === 'ADMINISTRADOR')) return true;
        return false;
      });

      if (!isAllowed) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'El usuario no cuenta con los permisos requeridos para esta operación.',
            requestId: request.id,
          },
        });
      }
    }
  };
}
