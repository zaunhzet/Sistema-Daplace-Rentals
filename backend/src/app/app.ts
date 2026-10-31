import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';

import type { PrismaClient } from '../generated/prisma/client.js';
import { registerPropertiesRoutes } from '../routes/properties.js';
import { registerGuestsRoutes } from '../routes/guests.js';
import { registerReservationsRoutes } from '../routes/reservations.js';
import { registerCalendarRoutes } from '../routes/calendar.js';
import { registerPaymentsRoutes } from '../routes/payments.js';
import { registerGuaranteesRoutes } from '../routes/guarantees.js';
import { registerExpensesRoutes } from '../routes/expenses.js';
import { registerPaymentEvidencesRoutes } from '../routes/payment-evidences.js';
import { registerContractsRoutes } from '../routes/contracts.js';
import { registerReportsRoutes } from '../routes/reports.js';
import { registerAuditRoutes } from '../routes/audit.js';
import { registerAlertsRoutes } from '../routes/alerts.js';
import { registerStaffRoutes } from '../routes/staff.js';
import { authenticateRequestHook } from '../shared/auth.js';

import type { PoliticaAdelantoProvider } from '../modules/reservations/confirmationRequirements.js';
import type { ExpirationPolicyProvider } from '../modules/reservations/expirationPolicy.js';
import type { ExpirationClock } from '../modules/reservations/expirationClock.js';

import { authRoutes } from '../modules/auth/auth.routes.js';
import { AuthError } from '../modules/auth/auth.service.js';
import type { AccessTokenPayload, IAuthRepository } from '../modules/auth/auth.types.js';

type ReadinessCheck = () => Promise<void>;

export interface BuildAppOptions {
  prisma?: PrismaClient;
  checkDatabase?: ReadinessCheck;
  politicaAdelantoProvider?: PoliticaAdelantoProvider;
  expirationPolicyProvider?: ExpirationPolicyProvider;
  expirationClock?: ExpirationClock;
  authRepository?: IAuthRepository;
  jwtSecret?: string;
  allowedOrigins?: string[];
  secureCookies?: boolean;
  enableRateLimit?: boolean;
}

export function buildApp(
  optionsOrCheckDatabase: BuildAppOptions | ReadinessCheck = async () => undefined
): FastifyInstance {
  const options: BuildAppOptions =
    typeof optionsOrCheckDatabase === 'function'
      ? { checkDatabase: optionsOrCheckDatabase }
      : optionsOrCheckDatabase;

  const checkDatabase = options.checkDatabase ?? (async () => undefined);
  const prisma = options.prisma;

  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const demoBypassEnabled = process.env.ENABLE_DEMO_AUTH_BYPASS === 'true';

  // Validación de seguridad crítica: jamás permitir bypass en producción
  if (nodeEnv === 'production' && demoBypassEnabled) {
    throw new Error('CONFIGURACIÓN INSEGURA CRÍTICA: ENABLE_DEMO_AUTH_BYPASS no puede estar activo en entorno de producción.');
  }

  // Validación de seguridad: el bypass solo se permite si el host configurado es exclusivamente loopback
  const apiHost = (process.env.API_HOST || '127.0.0.1').toLowerCase();
  const ALLOWED_LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];
  if (demoBypassEnabled && !ALLOWED_LOOPBACK_HOSTS.includes(apiHost)) {
    throw new Error(
      `CONFIGURACIÓN INSEGURA CRÍTICA: ENABLE_DEMO_AUTH_BYPASS solo está permitido cuando el servidor escucha exclusivamente en loopback (${ALLOWED_LOOPBACK_HOSTS.join(', ')}). Se configuró API_HOST "${apiHost}".`
    );
  }

  // CORS: Rechazar comodín '*' cuando se usan credenciales. Orígenes explícitos obligatorios.
  const rawOrigins =
    options.allowedOrigins ??
    (process.env.CORS_ORIGIN || process.env.CORS_ALLOWED_ORIGINS
      ? (process.env.CORS_ORIGIN || process.env.CORS_ALLOWED_ORIGINS)!.split(',').map((o) => o.trim())
      : ['http://127.0.0.1:5173', 'http://localhost:5173']);

  if (rawOrigins.includes('*')) {
    throw new Error(
      'Configuración CORS insegura: No se permite el origen comodín "*" cuando las credenciales están habilitadas.'
    );
  }
  const allowedOrigins = rawOrigins.filter((o) => o.length > 0);

  // JWT Secret obligatorio cuando la autenticación está activa (>= 32 caracteres)
  let jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET;
  if (options.authRepository) {
    if (!jwtSecret || typeof jwtSecret !== 'string' || jwtSecret.trim().length < 32) {
      throw new Error(
        'JWT_SECRET es obligatorio y debe tener al menos 32 caracteres cuando la autenticación está habilitada.'
      );
    }
  } else {
    jwtSecret = jwtSecret || 'ephemeral_dummy_secret_for_tests_at_least_32_chars!';
  }

  const app = Fastify({
    logger: true,
    ajv: { customOptions: { removeAdditional: false } },
  });

  // CORS con orígenes estrictamente explícitos
  app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      if (nodeEnv !== 'production') {
        try {
          const originUrl = new URL(origin);
          if (['localhost', '127.0.0.1', '::1'].includes(originUrl.hostname)) {
            return cb(null, true);
          }
        } catch {
          // ignore
        }
      }
      return cb(new Error('No autorizado por política CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token', 'x-request-id', 'Idempotency-Key'],
  });

  // Cookies
  app.register(fastifyCookie);

  // JWT
  app.register(fastifyJwt, {
    secret: jwtSecret,
    sign: {
      algorithm: 'HS256',
      iss: 'daplace-rentals',
      aud: 'daplace-rentals-app',
    },
    verify: {
      algorithms: ['HS256'],
      allowedIss: 'daplace-rentals',
      allowedAud: 'daplace-rentals-app',
    },
  });

  // Rate Limiting
  app.register(fastifyRateLimit, {
    global: false,
  });

  // Auth routes
  if (options.authRepository) {
    app.register(authRoutes, {
      repository: options.authRepository,
      secureCookies: options.secureCookies,
      allowedOrigins,
      enableRateLimit: options.enableRateLimit,
    });
  }

  // Hook centralizado de resolución de autenticación e identidad
  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        try {
          const decoded = app.jwt.verify<AccessTokenPayload>(token, {
            algorithms: ['HS256'],
            allowedIss: 'daplace-rentals',
            allowedAud: 'daplace-rentals-app',
          });

          if (options.authRepository) {
            const liveUser = await options.authRepository.findUserById(decoded.sub);
            if (!liveUser || !liveUser.isActive) {
              // Usuario inactivo o inexistente en base de datos: denegación estricta
              (request as any).user = undefined;
              return;
            }

            // Comprobación de revocación persistente de sesión y familia (INT-02)
            if (decoded.sid) {
              const liveSession = await options.authRepository.findSessionById(decoded.sid);
              if (!liveSession || liveSession.revokedAt !== null || liveSession.expiresAt.getTime() <= Date.now()) {
                (request as any).user = undefined;
                return;
              }
            }

            const mappedRole = (liveUser.rol === 'ADMINISTRADOR' ? 'ADMIN' : liveUser.rol) as any;
            // IDENTIDAD SEPARADA:
            // - id / sub  = liveUser.id  → identificador del User de autenticación (NUNCA usado como FK de dominio)
            // - usuarioId = liveUser.usuarioId → FK a Usuario de dominio (puede ser null si no está vinculado)
            (request as any).user = {
              id: liveUser.id,
              sub: liveUser.id,
              usuarioId: liveUser.usuarioId ?? null,
              email: liveUser.email,
              nombre: liveUser.nombre,
              rol: mappedRole,
              cargo: liveUser.cargo,
              sid: decoded.sid,
            };
            return;
          } else {
            const mappedRole = (decoded.rol === 'ADMINISTRADOR' ? 'ADMIN' : decoded.rol) as any;
            (request as any).user = {
              id: decoded.sub,
              sub: decoded.sub,
              email: decoded.email,
              nombre: decoded.nombre,
              rol: mappedRole,
              cargo: decoded.cargo,
            };
            return;
          }
        } catch {
          // Token con firma inválida o expirado: denegación estricta, jamás recurrir a bypass
          (request as any).user = undefined;
          return;
        }
      } else {
        // Encabezado de autorización con esquema no soportado
        (request as any).user = undefined;
        return;
      }
    }

    // Si NO vino ningún encabezado de autorización:
    // Si la autenticación real está activa (authRepository configurado), la denegación anónima es estricta (sin bypass)
    if (!options.authRepository) {
      await authenticateRequestHook(request);
    }
  });

  // Manejador estandarizado de errores
  app.setErrorHandler((error: FastifyError | AuthError | any, request, reply) => {
    if (error.message === 'No autorizado por política CORS') {
      return reply.status(403).send({
        error: {
          code: 'CORS_VIOLATION',
          message: 'Origen no autorizado por política CORS.',
          requestId: request.id,
        },
      });
    }

    if (error instanceof AuthError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
        },
      });
    }

    if (error.statusCode === 429 || error.code === 'FST_ERR_RATE_LIMIT') {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Demasiadas solicitudes. Por favor, intente nuevamente más tarde.',
          requestId: request.id,
        },
      });
    }

    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'La solicitud no cumple el formato esperado.',
          details: error.validation.map((issue: any) => ({
            field: issue.instancePath || issue.schemaPath,
            code: issue.keyword,
          })),
          requestId: request.id,
        },
      });
    }

    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code || 'BAD_REQUEST',
          message: error.message,
          requestId: request.id,
        },
      });
    }

    request.log.error({ err: error }, 'Unhandled request error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error interno.',
        requestId: request.id,
      },
    });
  });

  // Not found
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'La ruta solicitada no existe.',
        requestId: request.id,
      },
    })
  );

  // Health checks
  app.get(
    '/health',
    {
      schema: {
        querystring: { type: 'object', additionalProperties: false },
        response: {
          200: {
            type: 'object',
            required: ['status'],
            properties: { status: { type: 'string' } },
          },
        },
      },
    },
    async () => ({ status: 'ok' })
  );

  app.get('/health/ready', async (request, reply) => {
    try {
      await checkDatabase();
      return { status: 'ready', dependencies: { database: 'available' } };
    } catch {
      return reply.status(503).send({
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'La base de datos no está disponible.',
          requestId: request.id,
        },
      });
    }
  });

  if (prisma) {
    const politicaProvider = options.politicaAdelantoProvider;
    const expirationPolicyProvider = options.expirationPolicyProvider;
    const expirationClock = options.expirationClock;

    app.register(registerPropertiesRoutes(prisma));
    app.register(registerGuestsRoutes(prisma));
    app.register(registerReservationsRoutes(prisma, politicaProvider, expirationPolicyProvider, expirationClock));
    app.register(registerCalendarRoutes(prisma));
    app.register(registerPaymentsRoutes(prisma));
    app.register(registerGuaranteesRoutes(prisma));
    app.register(registerExpensesRoutes(prisma));
    app.register(registerPaymentEvidencesRoutes(prisma));
    app.register(registerContractsRoutes(prisma, politicaProvider, expirationClock));
    app.register(registerReportsRoutes(prisma));
    app.register(registerAuditRoutes(prisma));
    app.register(registerAlertsRoutes(prisma));
    app.register(registerStaffRoutes(prisma));
  }

  return app;
}
