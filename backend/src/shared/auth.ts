import type { FastifyReply, FastifyRequest } from 'fastify';

export type UserRole = 'ADMIN' | 'OPERADOR' | 'PROPIETARIO';

export interface AuthUser {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
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
 * Resuelve la identidad de la petición.
 * 1. Si existe un token o sesión verificada (preparado para el módulo auth de Diego), la asigna.
 * 2. Si no existe identidad, evalúa las condiciones estrictas del bypass de demostración local.
 * 3. En cualquier otro caso, deja request.user como undefined (denegación por defecto).
 */
export async function authenticateRequestHook(request: FastifyRequest): Promise<void> {
  // A. Conexión futura con el módulo de Diego (Bearer token / Session)
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Cuando Diego suministre el verificador de token, se validará aquí criptográficamente.
    // Por el momento, si no es una firma válida comprobada, no se asume identidad.
  }

  // B. Bypass de demostración local temporal (estrictamente condicionado)
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
      nombre: 'Administrador Demo Local',
      email: 'admin@daplace.example.invalid',
      rol: 'ADMIN',
    };
    request.isDemoBypass = true;
    return;
  }

  // C. Sin identidad verificada
  request.user = undefined;
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
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(request.user.rol)) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'El usuario no cuenta con los permisos requeridos para esta operación.',
          requestId: request.id,
        },
      });
    }
  };
}
