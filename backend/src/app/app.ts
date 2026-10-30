import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { AuthError } from '../modules/auth/auth.service.js';
import type { IAuthRepository } from '../modules/auth/auth.types.js';

type ReadinessCheck = () => Promise<void>;

export interface BuildAppOptions {
  checkDatabase?: ReadinessCheck;
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

  // Fix 9: Rechazar comodín '*' cuando se usan credenciales. Orígenes explícitos obligatorios.
  const rawOrigins =
    options.allowedOrigins ??
    (process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : ['http://127.0.0.1:5173', 'http://localhost:5173']);

  if (rawOrigins.includes('*')) {
    throw new Error(
      'Configuración CORS insegura: No se permite el origen comodín "*" cuando las credenciales están habilitadas.'
    );
  }
  const allowedOrigins = rawOrigins.filter((o) => o.length > 0);

  // Fix 1: Eliminar clave fija de respaldo. Si la autenticación está habilitada,
  // el servidor rechaza el arranque si falta una clave válida (>= 32 caracteres).
  let jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET;
  if (options.authRepository) {
    if (!jwtSecret || typeof jwtSecret !== 'string' || jwtSecret.trim().length < 32) {
      throw new Error(
        'JWT_SECRET es obligatorio y debe tener al menos 32 caracteres cuando la autenticación está habilitada.'
      );
    }
  } else {
    // Si la autenticación no está habilitada (ej. pruebas de health check aislado)
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
      return cb(new Error('No autorizado por política CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
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

  // Manejador estandarizado de errores
  app.setErrorHandler((error: FastifyError | AuthError | any, request, reply) => {
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

  return app;
}
