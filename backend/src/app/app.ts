import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';

type ReadinessCheck = () => Promise<void>;

export function buildApp(checkDatabase: ReadinessCheck = async () => undefined): FastifyInstance {
  const app = Fastify({
    logger: true,
    ajv: { customOptions: { removeAdditional: false } },
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

  return app;
}
