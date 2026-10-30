import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';

const testDbUrl = getRequiredTestDatabaseUrl();

describe('Gate INT-01 — Esquema, Identidad y Vinculación User <-> Usuario', () => {
  let db: ReturnType<typeof createDatabase>;
  let authRepo: PrismaAuthRepository;

  before(async () => {
    db = createDatabase(testDbUrl);
    authRepo = new PrismaAuthRepository(db.prisma);
  });

  beforeEach(async () => {
    await safeResetTestDatabase(testDbUrl);
  });

  after(async () => {
    await db.close();
  });

  it('1. Vinculación referencial válida entre User de autenticación y Usuario transaccional', async () => {
    // A. Crear Usuario transaccional
    const usuarioTransaccional = await db.prisma.usuario.create({
      data: {
        id: 'usr-admin-transaccional',
        nombre: 'Valeria Administradora',
        email: 'valeria.mendez@daplace.pe',
        rol: 'ADMIN',
        activo: true,
      },
    });

    // B. Crear User de autenticación con contraseña Argon2id
    const passwordHash = await AuthService.hashPassword('AdminPass2026!');
    const userAuth = await authRepo.createUser({
      email: 'valeria.mendez@daplace.pe',
      passwordHash,
      nombre: 'Valeria Méndez',
      cargo: 'Gerente Operativa',
      rol: 'ADMINISTRADOR',
      usuarioId: usuarioTransaccional.id,
    });

    assert.equal(userAuth.usuarioId, usuarioTransaccional.id);

    // C. Verificar consulta bidireccional
    const userWithUsuario = await db.prisma.user.findUnique({
      where: { id: userAuth.id },
      include: { usuario: true },
    });
    assert.ok(userWithUsuario);
    assert.equal(userWithUsuario.usuario?.id, usuarioTransaccional.id);
    assert.equal(userWithUsuario.usuario?.nombre, 'Valeria Administradora');

    const usuarioWithUser = await db.prisma.usuario.findUnique({
      where: { id: usuarioTransaccional.id },
      include: { user: true },
    });
    assert.ok(usuarioWithUser);
    assert.equal(usuarioWithUser.user?.id, userAuth.id);
    assert.equal(usuarioWithUser.user?.email, 'valeria.mendez@daplace.pe');
  });

  it('2. Unicidad estricta (1:1 opcional): no permite que dos User apunten al mismo Usuario', async () => {
    const usuario = await db.prisma.usuario.create({
      data: {
        id: 'usr-operador-unico',
        nombre: 'Operador Único',
        email: 'operador.unico@daplace.pe',
        rol: 'OPERADOR',
      },
    });

    const passwordHash = await AuthService.hashPassword('Pass12345!');

    // Primer usuario vinculado
    await authRepo.createUser({
      email: 'operador.uno@daplace.pe',
      passwordHash,
      nombre: 'Operador Uno',
      rol: 'OPERADOR',
      usuarioId: usuario.id,
    });

    // Segundo usuario intentando vincularse al mismo Usuario
    await assert.rejects(
      async () => {
        await authRepo.createUser({
          email: 'operador.dos@daplace.pe',
          passwordHash,
          nombre: 'Operador Dos',
          rol: 'OPERADOR',
          usuarioId: usuario.id,
        });
      },
      (err: any) => {
        // Violación de unique constraint users_usuarioId_key
        return err.code === 'P2002' || err.message?.includes('users_usuarioId_key') || err.message?.includes('Unique constraint');
      }
    );
  });

  it('3. Integridad referencial con RESTRICT: impide eliminar Usuario si existe un User vinculado', async () => {
    const usuario = await db.prisma.usuario.create({
      data: {
        id: 'usr-propietario-temp',
        nombre: 'Propietario Temporal',
        email: 'propietario.temp@daplace.pe',
        rol: 'PROPIETARIO',
      },
    });

    const passwordHash = await AuthService.hashPassword('Pass12345!');
    await authRepo.createUser({
      email: 'prop.auth@daplace.pe',
      passwordHash,
      nombre: 'Propietario Auth',
      rol: 'PROPIETARIO',
      usuarioId: usuario.id,
    });

    // Intentar eliminar el usuario transaccional debe fallar con RESTRICT (P2003)
    await assert.rejects(
      async () => {
        await db.prisma.usuario.delete({
          where: { id: usuario.id },
        });
      },
      (err: any) => {
        return err.code === 'P2003' || err.message?.includes('Foreign key constraint failed') || err.message?.includes('violates foreign key constraint');
      }
    );

    // Verificar que tanto Usuario como User siguen existiendo intactos
    const survivingUsuario = await db.prisma.usuario.findUnique({
      where: { id: usuario.id },
    });
    assert.ok(survivingUsuario, 'Usuario debe permanecer intacto tras el rechazo de borrado');
  });

  it('4. Conversión segura de identidad de sesión a identidad transaccional', async () => {
    const usuario = await db.prisma.usuario.create({
      data: {
        id: 'usr-actor-transaccional',
        nombre: 'Actor de Auditoría Real',
        email: 'actor.real@daplace.pe',
        rol: 'ADMIN',
      },
    });

    const passwordHash = await AuthService.hashPassword('PassSecure2026!');
    const user = await authRepo.createUser({
      email: 'actor.real@daplace.pe',
      passwordHash,
      nombre: 'Actor Real',
      rol: 'ADMINISTRADOR',
      usuarioId: usuario.id,
    });

    const authService = new AuthService(authRepo, {
      signAccessToken: (payload) => `fake_token_for_${payload.sub}`,
    });

    const loginResult = await authService.login({
      email: 'actor.real@daplace.pe',
      password: 'PassSecure2026!',
    });

    assert.equal(loginResult.user.id, user.id);
    assert.equal(loginResult.user.usuarioId, usuario.id);

    // Búsqueda y resolución en repositorio
    const liveUser = await authRepo.findUserById(loginResult.user.id);
    assert.ok(liveUser);
    assert.equal(liveUser.usuarioId, usuario.id);
  });
});
