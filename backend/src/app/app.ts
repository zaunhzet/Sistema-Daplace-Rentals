import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import { registerPropertiesRoutes } from '../routes/properties.js';
import { registerGuestsRoutes } from '../routes/guests.js';

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

  const app = Fastify({
    logger: true,
    ajv: { customOptions: { removeAdditional: false } },
  });

  // CORS local development support
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-request-id');
    if (request.method === 'OPTIONS') {
      return reply.status(204).send();
    }
  });

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
  }

  return app;
}
