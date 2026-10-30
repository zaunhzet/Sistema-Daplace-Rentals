import '@fastify/jwt';

export type UserRole = 'ADMINISTRADOR' | 'OPERADOR' | 'PROPIETARIO' | 'CLIENTE';

export interface UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  nombre: string;
  cargo: string | null;
  rol: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSessionEntity {
  id: string;
  userId: string;
  tokenHash: string;
  family: string;
  revokedAt: Date | null;
  replacedByTokenHash?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  nombre: string;
  rol: UserRole;
  cargo?: string | null;
}

export interface SafeUser {
  id: string;
  email: string;
  nombre: string;
  cargo: string | null;
  rol: UserRole;
}

export interface LoginResult {
  accessToken: string;
  rawRefreshToken: string;
  user: SafeUser;
}

export interface RefreshResult {
  accessToken: string;
  rawRefreshToken: string;
  user: SafeUser;
}

export interface RotateSessionParams {
  oldTokenHash: string;
  newTokenHash: string;
  family: string;
  newExpiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
  gracePeriodMs?: number;
}

export type RotateSessionResult =
  | { status: 'SUCCESS'; userId: string; family: string }
  | { status: 'NOT_FOUND' }
  | { status: 'EXPIRED' }
  | { status: 'REVOKED' }
  | { status: 'GRACE_PERIOD_REPLAY'; session: AuthSessionEntity }
  | { status: 'REUSE_DETECTED'; family: string };

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<UserEntity | null>;
  findUserById(id: string): Promise<UserEntity | null>;
  updateUser(id: string, data: Partial<Pick<UserEntity, 'nombre' | 'cargo' | 'rol' | 'isActive' | 'passwordHash'>>): Promise<UserEntity>;
  createUser(data: {
    email: string;
    passwordHash: string;
    nombre: string;
    cargo?: string | null;
    rol?: UserRole;
  }): Promise<UserEntity>;
  createSession(data: {
    userId: string;
    tokenHash: string;
    family: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<AuthSessionEntity>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSessionEntity | null>;
  revokeSession(id: string): Promise<void>;
  revokeFamily(family: string): Promise<void>;
  rotateSessionAtomic(params: RotateSessionParams): Promise<RotateSessionResult>;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}
