import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AccessTokenPayload, UserRole } from '../modules/auth/auth.types.js';
import type { PrismaClient } from '../generated/prisma/client.js';

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

  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const demoBypassEnabled = process.env.ENABLE_DEMO_AUTH_BYPASS === 'true';

  if (nodeEnv === 'production' && demoBypassEnabled) {
    throw new Error('CONFIGURACIÓN INSEGURA CRÍTICA: ENABLE_DEMO_AUTH_BYPASS no puede estar activo en producción.');
  }

  if (demoBypassEnabled && (nodeEnv === 'development' || nodeEnv === 'test') && isLoopbackRequest(request)) {
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

  (request as any).user = undefined;
}

/**
 * Verificación superficial (token-level): comprueba que `usuarioId` no sea null.
 * NO verifica existencia ni estado activo en BD.
 *
 * Para escrituras transaccionales que requieran FK a Usuario,
 * usar siempre `resolveDomainActorFromDb`.
 */
export function resolveDomainActor(request: FastifyRequest, reply: FastifyReply): string | null {
  const usuarioId = request.user?.usuarioId ?? null;
  if (!usuarioId) {
    reply.status(403).send({
      error: {
        code: 'DOMAIN_IDENTITY_REQUIRED',
        message:
          'El usuario autenticado no tiene una identidad de dominio (Usuario) vinculada. ' +
          'Se requiere vínculo explícito con un Actor de Dominio para realizar esta operación transaccional.',
        requestId: request.id,
      },
    });
    return null;
  }
  return usuarioId;
}

/**
 * Verificación completa de identidad de dominio con comprobación real en base de datos.
 *
 * Verifica (en orden):
 * 1. `request.user.usuarioId` no es null (vínculo token-level).
 * 2. El `Usuario` con ese ID existe en BD.
 * 3. El `Usuario` tiene `activo = true`.
 *
 * Si cualquier condición falla → 403 `DOMAIN_IDENTITY_REQUIRED` (respuesta ya enviada).
 *
 * @returns El `usuarioId` verificado, o null si la verificación falló.
 */
export async function resolveDomainActorFromDb(
  prisma: PrismaClient,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  // 1. Verificación token-level
  const usuarioId = request.user?.usuarioId ?? null;
  if (!usuarioId) {
    reply.status(403).send({
      error: {
        code: 'DOMAIN_IDENTITY_REQUIRED',
        message:
          'El usuario autenticado no tiene una identidad de dominio (Usuario) vinculada. ' +
          'Se requiere vínculo explícito con un Actor de Dominio para realizar esta operación transaccional.',
        requestId: request.id,
      },
    });
    return null;
  }

  // 2. Cortocircuito para bypass de demostración local (dev/test, loopback estricto)
  //    El bypass ya fue auditado y condicionado en authenticateRequestHook.
  //    No requiere verificación en BD porque no representa un actor de producción.
  if (request.isDemoBypass === true) {
    return usuarioId;
  }

  // 3. Verificación real en BD: existencia y estado activo
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { id: true, activo: true },
  });

  if (!usuario || !usuario.activo) {
    reply.status(403).send({
      error: {
        code: 'DOMAIN_IDENTITY_REQUIRED',
        message:
          'El actor transaccional vinculado a esta cuenta no existe o no está activo en el dominio. ' +
          'Contacte al administrador para verificar el estado del vínculo de identidad.',
        requestId: request.id,
      },
    });
    return null;
  }

  return usuario.id;
}

/**
 * Middleware / PreHandler que exige una identidad autenticada y opcionalmente valida roles requeridos.
 */
export function requireAuth(allowedRoles?: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Se requiere autenticación válida para acceder a este recurso administrativo.',
          requestId: request.id,
        },
      });
    }

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
