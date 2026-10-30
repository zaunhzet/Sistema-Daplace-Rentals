import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type {
  AuthSessionEntity,
  IAuthRepository,
  RotateSessionParams,
  RotateSessionResult,
  UserEntity,
  UserRole,
} from './auth.types.js';

export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user) return null;
    return {
      ...user,
      rol: user.rol as UserRole,
    };
  }

  async findUserById(id: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) return null;
    return {
      ...user,
      rol: user.rol as UserRole,
    };
  }

  async updateUser(
    id: string,
    data: Partial<Pick<UserEntity, 'nombre' | 'cargo' | 'rol' | 'isActive' | 'passwordHash' | 'usuarioId'>>
  ): Promise<UserEntity> {
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        rol: data.rol ? (data.rol as any) : undefined,
      },
    });
    return {
      ...updated,
      rol: updated.rol as UserRole,
    };
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    nombre: string;
    cargo?: string | null;
    rol?: UserRole;
    usuarioId?: string | null;
  }): Promise<UserEntity> {
    const user = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        passwordHash: data.passwordHash,
        nombre: data.nombre,
        cargo: data.cargo ?? null,
        rol: (data.rol ?? 'CLIENTE') as any,
        usuarioId: data.usuarioId ?? null,
      },
    });
    return {
      ...user,
      rol: user.rol as UserRole,
    };
  }

  async createSession(data: {
    userId: string;
    tokenHash: string;
    family: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<AuthSessionEntity> {
    const session = await this.prisma.authSession.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        family: data.family,
        expiresAt: data.expiresAt,
        userAgent: data.userAgent ?? null,
        ipAddress: data.ipAddress ?? null,
      },
    });
    return {
      ...session,
      replacedByTokenHash: session.replacedByTokenHash ?? null,
    };
  }

  async findSessionById(id: string): Promise<AuthSessionEntity | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { id },
    });
    if (!session) return null;
    return {
      ...session,
      replacedByTokenHash: session.replacedByTokenHash ?? null,
    };
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionEntity | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
    });
    if (!session) return null;
    return {
      ...session,
      replacedByTokenHash: session.replacedByTokenHash ?? null,
    };
  }

  async revokeSession(id: string): Promise<void> {
    await this.prisma.authSession.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(family: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { family, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async rotateSessionAtomic(params: RotateSessionParams): Promise<RotateSessionResult> {
    const gracePeriodMs = params.gracePeriodMs ?? 15000;

    return await this.prisma.$transaction(async (tx) => {
      const session = await tx.authSession.findUnique({
        where: { tokenHash: params.oldTokenHash },
      });

      if (!session) {
        return { status: 'NOT_FOUND' };
      }

      if (session.revokedAt !== null) {
        const elapsed = Date.now() - session.revokedAt.getTime();
        // El periodo de gracia solo aplica a tokens rotados (con replacedByTokenHash).
        // Si fue revocado por logout manual (sin reemplazo), es inmediatamente inválido.
        if (session.replacedByTokenHash && elapsed <= gracePeriodMs) {
          return {
            status: 'GRACE_PERIOD_REPLAY',
            session: {
              ...session,
              replacedByTokenHash: session.replacedByTokenHash ?? null,
            },
          };
        }

        // Si tenía reemplazo y superó la gracia, es reutilización indebida de token rotado
        if (session.replacedByTokenHash) {
          await tx.authSession.updateMany({
            where: { family: session.family, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return { status: 'REUSE_DETECTED', family: session.family };
        }

        // Revocado por logout
        return { status: 'REVOKED' };
      }

      // Comprobación de revocación en la familia por logout concurrente (INT-VERIFY-01)
      const familyLoggedOut = await tx.authSession.findFirst({
        where: {
          family: session.family,
          revokedAt: { not: null },
          replacedByTokenHash: null,
        },
      });
      if (familyLoggedOut) {
        return { status: 'REVOKED' };
      }

      if (session.expiresAt.getTime() <= Date.now()) {
        await tx.authSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        return { status: 'EXPIRED' };
      }

      const now = new Date();
      await tx.authSession.update({
        where: { id: session.id },
        data: {
          revokedAt: now,
          replacedByTokenHash: params.newTokenHash,
        },
      });

      const newSession = await tx.authSession.create({
        data: {
          userId: session.userId,
          tokenHash: params.newTokenHash,
          family: session.family,
          expiresAt: params.newExpiresAt,
          userAgent: params.userAgent ?? null,
          ipAddress: params.ipAddress ?? null,
        },
      });

      return {
        status: 'SUCCESS',
        userId: session.userId,
        family: session.family,
        sessionId: newSession.id,
      };
    });
  }
}

export class InMemoryAuthRepository implements IAuthRepository {
  private users = new Map<string, UserEntity>();
  private sessions = new Map<string, AuthSessionEntity>();

  async findUserByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  async findUserById(id: string): Promise<UserEntity | null> {
    return this.users.get(id) ?? null;
  }

  async updateUser(
    id: string,
    data: Partial<Pick<UserEntity, 'nombre' | 'cargo' | 'rol' | 'isActive' | 'passwordHash' | 'usuarioId'>>
  ): Promise<UserEntity> {
    const existing = this.users.get(id);
    if (!existing) {
      throw new Error(`User with id ${id} not found`);
    }
    const updated: UserEntity = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.users.set(id, updated);
    return updated;
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    nombre: string;
    cargo?: string | null;
    rol?: UserRole;
    usuarioId?: string | null;
  }): Promise<UserEntity> {
    const now = new Date();
    const user: UserEntity = {
      id: randomUUID(),
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
      nombre: data.nombre,
      cargo: data.cargo ?? null,
      rol: data.rol ?? 'CLIENTE',
      isActive: true,
      usuarioId: data.usuarioId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  async createSession(data: {
    userId: string;
    tokenHash: string;
    family: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<AuthSessionEntity> {
    const now = new Date();
    const session: AuthSessionEntity = {
      id: randomUUID(),
      userId: data.userId,
      tokenHash: data.tokenHash,
      family: data.family,
      revokedAt: null,
      replacedByTokenHash: null,
      expiresAt: data.expiresAt,
      createdAt: now,
      updatedAt: now,
      userAgent: data.userAgent ?? null,
      ipAddress: data.ipAddress ?? null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findSessionById(id: string): Promise<AuthSessionEntity | null> {
    const session = this.sessions.get(id);
    return session ? { ...session } : null;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionEntity | null> {
    for (const session of this.sessions.values()) {
      if (session.tokenHash === tokenHash) {
        return session;
      }
    }
    return null;
  }

  async revokeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.revokedAt = new Date();
      session.updatedAt = new Date();
    }
  }

  async revokeFamily(family: string): Promise<void> {
    const now = new Date();
    for (const session of this.sessions.values()) {
      if (session.family === family && !session.revokedAt) {
        session.revokedAt = now;
        session.updatedAt = now;
      }
    }
  }

  async rotateSessionAtomic(params: RotateSessionParams): Promise<RotateSessionResult> {
    const gracePeriodMs = params.gracePeriodMs ?? 15000;
    let targetSession: AuthSessionEntity | null = null;
    for (const session of this.sessions.values()) {
      if (session.tokenHash === params.oldTokenHash) {
        targetSession = session;
        break;
      }
    }

    if (!targetSession) {
      return { status: 'NOT_FOUND' };
    }

    if (targetSession.revokedAt !== null) {
      const elapsed = Date.now() - targetSession.revokedAt.getTime();
      // El periodo de gracia solo aplica si la sesión fue rotada (posee replacedByTokenHash)
      if (targetSession.replacedByTokenHash && elapsed <= gracePeriodMs) {
        return { status: 'GRACE_PERIOD_REPLAY', session: targetSession };
      }

      // Si fue rotada y superó la gracia -> ataque de reutilización
      if (targetSession.replacedByTokenHash) {
        await this.revokeFamily(targetSession.family);
        return { status: 'REUSE_DETECTED', family: targetSession.family };
      }

      // Revocado por logout
      return { status: 'REVOKED' };
    }

    const familyLoggedOut = Array.from(this.sessions.values()).find(
      (s) => s.family === targetSession!.family && s.revokedAt !== null && !s.replacedByTokenHash
    );
    if (familyLoggedOut) {
      return { status: 'REVOKED' };
    }

    if (targetSession.expiresAt.getTime() <= Date.now()) {
      targetSession.revokedAt = new Date();
      return { status: 'EXPIRED' };
    }

    const now = new Date();
    targetSession.revokedAt = now;
    targetSession.replacedByTokenHash = params.newTokenHash;
    targetSession.updatedAt = now;

    const newSession: AuthSessionEntity = {
      id: randomUUID(),
      userId: targetSession.userId,
      tokenHash: params.newTokenHash,
      family: targetSession.family,
      revokedAt: null,
      replacedByTokenHash: null,
      expiresAt: params.newExpiresAt,
      createdAt: now,
      updatedAt: now,
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
    };
    this.sessions.set(newSession.id, newSession);

    return {
      status: 'SUCCESS',
      userId: targetSession.userId,
      family: targetSession.family,
      sessionId: newSession.id,
    };
  }
}
