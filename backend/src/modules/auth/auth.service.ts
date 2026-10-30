import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as argon2 from '@node-rs/argon2';
import type {
  AccessTokenPayload,
  IAuthRepository,
  LoginResult,
  RefreshResult,
  SafeUser,
} from './auth.types.js';

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Credenciales inválidas.', 401);
  }
}

export class InvalidRefreshTokenError extends AuthError {
  constructor(message = 'Token de renovación inválido o expirado.') {
    super('INVALID_REFRESH_TOKEN', message, 401);
  }
}

export class RefreshTokenReusedError extends AuthError {
  constructor() {
    super(
      'REFRESH_TOKEN_REUSED',
      'Reutilización indebida de sesión detectada. Se revocaron las sesiones asociadas por seguridad.',
      401
    );
  }
}

export class ConcurrentRotationError extends AuthError {
  constructor() {
    super(
      'CONCURRENT_ROTATION',
      'La sesión ya fue renovada en una solicitud paralela dentro del periodo de gracia.',
      409
    );
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message = 'No autorizado: token no proporcionado o inválido.') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AuthError {
  constructor(message = 'Acceso denegado: rol insuficiente.') {
    super('FORBIDDEN', message, 403);
  }
}

export interface AuthServiceConfig {
  refreshTokenTtlDays?: number;
  gracePeriodMs?: number;
  signAccessToken: (payload: AccessTokenPayload) => string;
}

export class AuthService {
  private readonly refreshTokenTtlDays: number;
  private readonly gracePeriodMs: number;
  private readonly signAccessToken: (payload: AccessTokenPayload) => string;

  // Hash Argon2id sintético válido para mitigar ataques de temporización (timing attack mitigation)
  // Permite que usuarios inexistentes consuman el mismo tiempo de CPU que un usuario real
  private static readonly DUMMY_HASH =
    '$argon2id$v=19$m=19456,t=2,p=1$ZGFwbGFjZWR1bW15c2FsdDEy$W1H9m783Qc7oUqX9tB2b9m8xQ9y6E5l3V7w1X4z9A0b';

  constructor(
    private readonly repository: IAuthRepository,
    config: AuthServiceConfig
  ) {
    this.refreshTokenTtlDays = config.refreshTokenTtlDays ?? 7;
    this.gracePeriodMs = config.gracePeriodMs ?? 15000;
    this.signAccessToken = config.signAccessToken;
  }

  static async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1,
    });
  }

  static async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  static generateRawRefreshToken(): string {
    return randomBytes(40).toString('hex');
  }

  static hashRefreshToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async login(params: {
    email: string;
    password: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<LoginResult> {
    const user = await this.repository.findUserByEmail(params.email);

    // Si el usuario no existe o está inactivo, ejecutamos la verificación ficticia
    // de Argon2id para igualar el tiempo de respuesta y prevenir la enumeración de cuentas por temporización
    if (!user || !user.isActive) {
      await AuthService.verifyPassword(AuthService.DUMMY_HASH, params.password);
      throw new InvalidCredentialsError();
    }

    const isValid = await AuthService.verifyPassword(user.passwordHash, params.password);
    if (!isValid) {
      throw new InvalidCredentialsError();
    }

    const rawRefreshToken = AuthService.generateRawRefreshToken();
    const tokenHash = AuthService.hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    const session = await this.repository.createSession({
      userId: user.id,
      tokenHash,
      family: randomUUID(),
      expiresAt,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
    });

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      cargo: user.cargo,
      rol: user.rol,
      usuarioId: user.usuarioId ?? null,
    };

    const accessToken = this.signAccessToken({
      id: user.usuarioId || user.id,
      sub: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      cargo: user.cargo,
      usuarioId: user.usuarioId ?? null,
      sid: session.id,
      family: session.family,
    });

    return {
      accessToken,
      rawRefreshToken,
      user: safeUser,
    };
  }

  async refresh(params: {
    rawRefreshToken: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<RefreshResult> {
    const oldTokenHash = AuthService.hashRefreshToken(params.rawRefreshToken);
    const newRawRefreshToken = AuthService.generateRawRefreshToken();
    const newTokenHash = AuthService.hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + this.refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    // Rotación atómica con soporte de ventana de gracia para solicitudes duplicadas del frontend
    const rotationResult = await this.repository.rotateSessionAtomic({
      oldTokenHash,
      newTokenHash,
      family: '',
      newExpiresAt,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
      gracePeriodMs: this.gracePeriodMs,
    });

    if (rotationResult.status === 'NOT_FOUND' || rotationResult.status === 'REVOKED') {
      throw new InvalidRefreshTokenError();
    }

    if (rotationResult.status === 'EXPIRED') {
      throw new InvalidRefreshTokenError('La sesión ha expirado.');
    }

    if (rotationResult.status === 'REUSE_DETECTED') {
      throw new RefreshTokenReusedError();
    }

    if (rotationResult.status === 'GRACE_PERIOD_REPLAY') {
      throw new ConcurrentRotationError();
    }

    const user = await this.repository.findUserById(rotationResult.userId);
    if (!user || !user.isActive) {
      throw new InvalidRefreshTokenError('Usuario no disponible o desactivado.');
    }

    const safeUser: SafeUser = {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      cargo: user.cargo,
      rol: user.rol,
      usuarioId: user.usuarioId ?? null,
    };

    const accessToken = this.signAccessToken({
      id: user.usuarioId || user.id,
      sub: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      cargo: user.cargo,
      usuarioId: user.usuarioId ?? null,
      sid: rotationResult.sessionId,
      family: rotationResult.family,
    });

    return {
      accessToken,
      rawRefreshToken: newRawRefreshToken,
      user: safeUser,
    };
  }

  async logout(rawRefreshToken: string | undefined, sid?: string): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = AuthService.hashRefreshToken(rawRefreshToken);
      const session = await this.repository.findSessionByTokenHash(tokenHash);

      if (session) {
        await this.repository.revokeFamily(session.family);
      }
    }

    if (sid) {
      const session = await this.repository.findSessionById(sid);
      if (session) {
        await this.repository.revokeFamily(session.family);
      } else {
        await this.repository.revokeSession(sid);
      }
    }
  }

  async getUserProfile(userId: string): Promise<SafeUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('El usuario no existe o se encuentra desactivado.');
    }

    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      cargo: user.cargo,
      rol: user.rol,
    };
  }
}
