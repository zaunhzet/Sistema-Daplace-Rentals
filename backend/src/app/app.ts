import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { registerPropertiesRoutes } from '../routes/properties.js';
import { registerGuestsRoutes } from '../routes/guests.js';
import { registerReservationsRoutes } from '../routes/reservations.js';
import { registerCalendarRoutes } from '../routes/calendar.js';
import { registerPaymentsRoutes } from '../routes/payments.js';
import { registerGuaranteesRoutes } from '../routes/guarantees.js';
import { authenticateRequestHook } from '../shared/auth.js';

type ReadinessCheck = () => Promise<void>;

export interface AppOptions {
  prisma?: PrismaClient;
  checkDatabase?: ReadinessCheck;
}

export function buildApp(optionsOrCheck?: ReadinessCheck | AppOptions): FastifyInstance {
  let checkDatabase: ReadinessCheck = async () => undefined;
  let prisma: PrismaClient | undefined;

  if (typeof optionsOrCheck === 'function') {
    checkDatabase = optionsOrCheck;
  } else if (optionsOrCheck) {
    if (optionsOrCheck.checkDatabase) checkDatabase = optionsOrCheck.checkDatabase;
    if (optionsOrCheck.prisma) prisma = optionsOrCheck.prisma;
  }

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

  const app = Fastify({
    logger: true,
    ajv: { customOptions: { removeAdditional: false } },
  });

  // Configuración CORS segura
  const rawAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
  const allowedOrigins = rawAllowedOrigins.split(',').map((o) => o.trim()).filter(Boolean);

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin) {
      let isAllowed = allowedOrigins.includes(origin);
      if (!isAllowed && nodeEnv !== 'production') {
        try {
          const originUrl = new URL(origin);
          if (['localhost', '127.0.0.1', '::1'].includes(originUrl.hostname)) {
            isAllowed = true;
          }
        } catch {
          isAllowed = false;
        }
      }

      if (isAllowed) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
        reply.header('Vary', 'Origin');
      }
    }

    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id');

    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }
  });

  // Hook centralizado de resolución de autenticación
  app.addHook('onRequest', authenticateRequestHook);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'La solicitud no cumple el formato esperado.',
          details: error.validation.map((issue) => ({
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

  app.setNotFoundHandler((request, reply) => reply.status(404).send({
    error: {
      code: 'NOT_FOUND',
      message: 'La ruta solicitada no existe.',
      requestId: request.id,
    },
  }));

  app.get('/health', {
    schema: {
      querystring: { type: 'object', additionalProperties: false },
      response: { 200: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } } },
    },
  }, async () => ({ status: 'ok' }));

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
    app.register(registerPropertiesRoutes(prisma));
    app.register(registerGuestsRoutes(prisma));
    app.register(registerReservationsRoutes(prisma));
    app.register(registerCalendarRoutes(prisma));
    app.register(registerPaymentsRoutes(prisma));
    app.register(registerGuaranteesRoutes(prisma));
  }

  return app;
}
