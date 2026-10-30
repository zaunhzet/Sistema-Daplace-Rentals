import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  AuthService,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  RefreshTokenReusedError,
} from './auth.service.js';
import { createAuthMiddleware } from './auth.middleware.js';
import type { AccessTokenPayload, IAuthRepository } from './auth.types.js';

export interface AuthRoutesOptions {
  repository: IAuthRepository;
  secureCookies?: boolean;
  allowedOrigins?: string[];
  enableRateLimit?: boolean;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  app: FastifyInstance,
  opts: AuthRoutesOptions
) => {
  const isSecureCookie = opts.secureCookies ?? (process.env.NODE_ENV === 'production');

  const authService = new AuthService(opts.repository, {
    refreshTokenTtlDays: 7,
    signAccessToken: (payload) =>
      app.jwt.sign(payload, {
        algorithm: 'HS256',
        expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
        iss: 'daplace-rentals',
        aud: 'daplace-rentals-app',
      }),
  });

  const { authenticate, verifyCsrf } = createAuthMiddleware(app, {
    allowedIss: 'daplace-rentals',
    allowedAud: 'daplace-rentals-app',
    allowedOrigins: opts.allowedOrigins,
    repository: opts.repository,
  });

  // POST /auth/login
  app.post<{
    Body: { email: string; password: string };
  }>(
    '/auth/login',
    {
      config: opts.enableRateLimit !== false
        ? {
            rateLimit: {
              max: 10,
              timeWindow: '1 minute',
            },
          }
        : {},
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 255 },
            password: { type: 'string', minLength: 1, maxLength: 255 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      try {
        const result = await authService.login({
          email,
          password,
          userAgent: request.headers['user-agent'] ?? null,
          ipAddress: request.ip,
        });

        request.log.info(
          {
            event: 'auth.login.success',
            userId: result.user.id,
            email: result.user.email,
            rol: result.user.rol,
            ip: request.ip,
          },
          'Inicio de sesión exitoso'
        );

        reply.setCookie('refreshToken', result.rawRefreshToken, {
          path: '/auth',
          httpOnly: true,
          secure: isSecureCookie,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60,
        });

        return reply.status(200).send({
          accessToken: result.accessToken,
          user: result.user,
        });
      } catch (err) {
        if (err instanceof InvalidCredentialsError) {
          request.log.warn(
            {
              event: 'auth.login.failure',
              email,
              reason: 'invalid_credentials',
              ip: request.ip,
            },
            'Intento fallido de inicio de sesión con credenciales inválidas'
          );
        }
        throw err;
      }
    }
  );

  // POST /auth/refresh
  app.post(
    '/auth/refresh',
    {
      preHandler: [verifyCsrf],
    },
    async (request, reply) => {
      const rawRefreshToken = request.cookies.refreshToken;
      if (!rawRefreshToken) {
        request.log.warn(
          { event: 'auth.refresh.missing_cookie', ip: request.ip },
          'Petición de renovación sin cookie refreshToken'
        );
        throw new InvalidRefreshTokenError('Cookie de renovación no proporcionada.');
      }

      try {
        const result = await authService.refresh({
          rawRefreshToken,
          userAgent: request.headers['user-agent'] ?? null,
          ipAddress: request.ip,
        });

        request.log.info(
          {
            event: 'auth.refresh.success',
            userId: result.user.id,
            ip: request.ip,
          },
          'Renovación y rotación de token exitosa'
        );

        reply.setCookie('refreshToken', result.rawRefreshToken, {
          path: '/auth',
          httpOnly: true,
          secure: isSecureCookie,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60,
        });

        return reply.status(200).send({
          accessToken: result.accessToken,
          user: result.user,
        });
      } catch (err) {
        if (err instanceof RefreshTokenReusedError) {
          request.log.error(
            {
              event: 'auth.refresh.reuse_detected',
              ip: request.ip,
            },
            'Alerta de seguridad: intento de reutilización de refresh token revocado'
          );
        }
        throw err;
      }
    }
  );

  // POST /auth/logout
  app.post(
    '/auth/logout',
    {
      preHandler: [verifyCsrf],
    },
    async (request, reply) => {
      const rawRefreshToken = request.cookies.refreshToken;
      const authHeader = request.headers.authorization;
      let sidFromToken: string | undefined;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const decoded = app.jwt.decode<AccessTokenPayload>(authHeader.slice(7).trim());
          if (decoded?.sid) {
            sidFromToken = decoded.sid;
          }
        } catch {
          // ignore decode errors on logout
        }
      }

      await authService.logout(rawRefreshToken, sidFromToken);

      reply.clearCookie('refreshToken', {
        path: '/auth',
        httpOnly: true,
        secure: isSecureCookie,
        sameSite: 'lax',
      });

      request.log.info(
        { event: 'auth.logout', ip: request.ip },
        'Sesión revocada y cookie eliminada'
      );

      return reply.status(200).send({
        success: true,
        message: 'Sesión finalizada exitosamente.',
      });
    }
  );

  // GET /auth/me
  app.get(
    '/auth/me',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const user = await authService.getUserProfile(request.user.sub);
      return reply.status(200).send({ user });
    }
  );
};
