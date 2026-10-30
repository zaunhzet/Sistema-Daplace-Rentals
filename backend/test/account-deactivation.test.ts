import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { buildApp } from '../src/app/app.js';
import { InMemoryAuthRepository, PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService, isUserAccountActive } from '../src/modules/auth/auth.service.js';
import type { UserEntity } from '../src/modules/auth/auth.types.js';
import { seedDevUsers } from '../src/scripts/seed-dev.js';

const testDbUrl = getRequiredTestDatabaseUrl();
const TEST_JWT_SECRET = 'secreto_jwt_super_seguro_minimo_32_caracteres_para_pruebas_paso1!';
const TEST_PASSWORD = 'DaplaceDevPass2026!';

function extractCookie(rawSetCookie: string | string[] | undefined): string {
  if (!rawSetCookie) return '';
  const first = Array.isArray(rawSetCookie) ? rawSetCookie[0] : rawSetCookie;
  return first.split(';')[0].trim();
}

/**
 * Repositorio en memoria simulado para verificar la denegación cuando un User
 * tiene usuarioId configurado pero no resuelve a un registro Usuario (usuario: null),
 * sin requerir manipular ni alterar las restricciones de clave foránea en PostgreSQL.
 */
class SimulatedBrokenAuthRepository extends InMemoryAuthRepository {
  constructor(private readonly simulatedUser: UserEntity) {
    super();
  }

  override async findUserByEmail(email: string): Promise<UserEntity | null> {
    if (email.toLowerCase().trim() === this.simulatedUser.email.toLowerCase().trim()) {
      return this.simulatedUser;
    }
    return null;
  }

  override async findUserById(id: string): Promise<UserEntity | null> {
    if (id === this.simulatedUser.id) {
      return this.simulatedUser;
    }
    return null;
  }
}

describe('Paso 1 — Desactivación de Cuentas en la Autenticación', () => {
  let db: ReturnType<typeof createDatabase>;
  let repository: PrismaAuthRepository;
  let app: FastifyInstance;

  before(async () => {
    db = createDatabase(testDbUrl);
    repository = new PrismaAuthRepository(db.prisma);

    app = buildApp({
      prisma: db.prisma,
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      secureCookies: false,
    });
    await app.ready();
  });

  beforeEach(async () => {
    await safeResetTestDatabase(testDbUrl);
  });

  after(async () => {
    await app.close();
    await db.close();
  });

  // --------------------------------------------------------------------------
  // PRUEBA 1: User activo + Usuario activo: login, refresh y petición protegida funcionan
  // --------------------------------------------------------------------------
  it('1. User activo + Usuario activo: login, refresh y petición protegida funcionan', async () => {
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);

    const usuario = await db.prisma.usuario.create({
      data: {
        email: 'op.activo@daplace.pe',
        nombre: 'Operador Activo',
        rol: 'OPERADOR',
        activo: true,
      },
    });

    const user = await db.prisma.user.create({
      data: {
        email: 'op.activo@daplace.pe',
        nombre: 'Operador Activo',
        rol: 'OPERADOR',
        isActive: true,
        passwordHash,
        usuarioId: usuario.id,
      },
    });

    // 1.1 Login funciona
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'op.activo@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(loginRes.statusCode, 200);
    const loginBody = loginRes.json();
    assert.ok(loginBody.accessToken);
    assert.equal(loginBody.user.id, user.id);
    assert.equal(loginBody.user.usuarioId, usuario.id);

    const refreshTokenCookie = extractCookie(loginRes.headers['set-cookie']);
    assert.ok(refreshTokenCookie.includes('refreshToken='));

    // 1.2 Refresh funciona
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: refreshTokenCookie,
        origin: 'http://localhost:5173',
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(refreshRes.statusCode, 200);
    const refreshBody = refreshRes.json();
    assert.ok(refreshBody.accessToken);

    // 1.3 Petición protegida funciona
    const protectedRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${refreshBody.accessToken}` },
    });
    assert.equal(protectedRes.statusCode, 200);
    assert.equal(protectedRes.json().user.email, 'op.activo@daplace.pe');
  });

  // --------------------------------------------------------------------------
  // PRUEBA 2: User inactivo + Usuario activo: acceso denegado
  // --------------------------------------------------------------------------
  it('2. User inactivo + Usuario activo: acceso denegado en login, refresh y peticiones protegidas', async () => {
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);

    const usuario = await db.prisma.usuario.create({
      data: {
        email: 'op.user.inactivo@daplace.pe',
        nombre: 'Operador Usuario Activo',
        rol: 'OPERADOR',
        activo: true, // Usuario activo
      },
    });

    const user = await db.prisma.user.create({
      data: {
        email: 'op.user.inactivo@daplace.pe',
        nombre: 'Operador User Inactivo',
        rol: 'OPERADOR',
        isActive: true, // Inicialmente ACTIVO para emitir credenciales legítimas
        passwordHash,
        usuarioId: usuario.id,
      },
    });

    // 2.1 Emitir credenciales legítimas mientras User está activo
    const initialLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'op.user.inactivo@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(initialLogin.statusCode, 200);
    const validAccessToken = initialLogin.json().accessToken;
    const refreshTokenCookie = extractCookie(initialLogin.headers['set-cookie']);

    // Verificar que el token funciona inicialmente
    const checkInitial = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${validAccessToken}` },
    });
    assert.equal(checkInitial.statusCode, 200);

    // 2.2 DESACTIVAR únicamente el registro User en la base de datos (isActive = false)
    await db.prisma.user.update({
      where: { id: user.id },
      data: { isActive: false },
    });

    // 2.3 Intento de nuevo Login: debe denegarse con respuesta genérica de credenciales inválidas
    const loginBlocked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'op.user.inactivo@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(loginBlocked.statusCode, 401);
    assert.equal(
      loginBlocked.json().error.code,
      'INVALID_CREDENTIALS',
      'No debe revelar cuál de los dos registros está inactivo'
    );

    // 2.4 Intento de Refresh con cookie previamente emitida: denegado
    const refreshBlocked = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: refreshTokenCookie,
        origin: 'http://localhost:5173',
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(refreshBlocked.statusCode, 401);

    // 2.5 Petición protegida con el access token PREVIAMENTE EMITIDO:
    // Debe denegarse inmediatamente sin esperar a que el token JWT expire
    const protectedBlocked = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${validAccessToken}` },
    });
    assert.equal(
      protectedBlocked.statusCode,
      401,
      'La desactivación de User debe surtir efecto inmediato sobre tokens activos'
    );
  });

  // --------------------------------------------------------------------------
  // PRUEBA 3: User activo + Usuario inactivo: login, refresh y access token
  // previamente emitido quedan denegados inmediatamente
  // --------------------------------------------------------------------------
  it('3. User activo + Usuario inactivo: login, refresh y access token previamente emitido quedan denegados', async () => {
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);

    // Inicialmente ambos activos
    const usuario = await db.prisma.usuario.create({
      data: {
        email: 'op.usuario.inactivo@daplace.pe',
        nombre: 'Operador Temporalmente Activo',
        rol: 'OPERADOR',
        activo: true,
      },
    });

    const user = await db.prisma.user.create({
      data: {
        email: 'op.usuario.inactivo@daplace.pe',
        nombre: 'Operador User Activo',
        rol: 'OPERADOR',
        isActive: true, // User activo
        passwordHash,
        usuarioId: usuario.id,
      },
    });

    // 3.1 Emitir credenciales legítimas mientras ambos están activos
    const initialLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'op.usuario.inactivo@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(initialLogin.statusCode, 200);
    const validAccessToken = initialLogin.json().accessToken;
    const refreshTokenCookie = extractCookie(initialLogin.headers['set-cookie']);

    // Verificar que el token funciona inicialmente
    const checkInitial = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${validAccessToken}` },
    });
    assert.equal(checkInitial.statusCode, 200);

    // 3.2 DESACTIVAR únicamente el registro Usuario en la base de datos
    await db.prisma.usuario.update({
      where: { id: usuario.id },
      data: { activo: false },
    });

    // 3.3 Intento de nuevo Login: debe denegarse con respuesta genérica de credenciales inválidas
    const loginBlocked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'op.usuario.inactivo@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(loginBlocked.statusCode, 401);
    assert.equal(
      loginBlocked.json().error.code,
      'INVALID_CREDENTIALS',
      'No debe revelar cuál de los dos registros está inactivo'
    );

    // 3.4 Intento de Refresh con cookie previamente emitida: denegado
    const refreshBlocked = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: refreshTokenCookie,
        origin: 'http://localhost:5173',
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(refreshBlocked.statusCode, 401);

    // 3.5 Petición protegida con el access token PREVIAMENTE EMITIDO:
    // Debe denegarse inmediatamente sin esperar a que el token JWT expire
    const protectedBlocked = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${validAccessToken}` },
    });
    assert.equal(
      protectedBlocked.statusCode,
      401,
      'La desactivación de Usuario debe surtir efecto inmediato sobre tokens activos'
    );
  });

  // --------------------------------------------------------------------------
  // PRUEBA 4: User activo + usuarioId que no resuelve a un Usuario: acceso denegado
  // --------------------------------------------------------------------------
  it('4. User activo + usuarioId que no resuelve a un Usuario: acceso denegado', async () => {
    // 4.1 Verificación unitaria de la regla pura
    assert.equal(
      isUserAccountActive({
        isActive: true,
        usuarioId: 'usr-id-que-no-resuelve',
        usuario: null, // No existe en base
      }),
      false,
      'Un usuarioId que no resuelve a un registro Usuario debe ser evaluado como inactivo'
    );

    assert.equal(
      isUserAccountActive({
        isActive: true,
        usuarioId: 'usr-id-que-no-resuelve',
        usuario: undefined,
      }),
      false,
      'usuarioId definido con usuario undefined debe ser evaluado como inactivo'
    );

    // 4.2 Verificación del flujo HTTP usando un repositorio simulado (sin alterar el esquema de PostgreSQL)
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);
    const brokenUserId = 'usr-broken-simulated-id';
    const brokenUserEmail = 'broken.simulated@daplace.pe';

    const simulatedUser: UserEntity = {
      id: brokenUserId,
      email: brokenUserEmail,
      passwordHash,
      nombre: 'User Broken Simulado',
      cargo: 'Operador',
      rol: 'OPERADOR',
      isActive: true,
      usuarioId: 'usr-inexistente-12345',
      usuario: null, // usuarioId presente pero no resuelve a un Usuario
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockRepo = new SimulatedBrokenAuthRepository(simulatedUser);

    // Generamos también una sesión válida para probar que el refresh token tampoco procede
    const rawRefreshToken = AuthService.generateRawRefreshToken();
    const tokenHash = AuthService.hashRefreshToken(rawRefreshToken);
    await mockRepo.createSession({
      userId: brokenUserId,
      tokenHash,
      family: 'simulated_family_broken_1',
      expiresAt: new Date(Date.now() + 86400000),
    });

    const mockApp = buildApp({
      authRepository: mockRepo,
      jwtSecret: TEST_JWT_SECRET,
      allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      secureCookies: false,
      enableRateLimit: false,
    });
    await mockApp.ready();

    try {
      // 4.3 Intento de login: denegado con respuesta genérica
      const loginBroken = await mockApp.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: brokenUserEmail, password: TEST_PASSWORD },
      });
      assert.equal(loginBroken.statusCode, 401);
      assert.equal(loginBroken.json().error.code, 'INVALID_CREDENTIALS');

      // 4.4 Intento de refresh: denegado porque la cuenta no resuelve a un Usuario activo
      const refreshBroken = await mockApp.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: {
          cookie: `refreshToken=${rawRefreshToken}`,
          origin: 'http://localhost:5173',
          'x-requested-with': 'XMLHttpRequest',
        },
      });
      assert.equal(refreshBroken.statusCode, 401);

      // 4.5 Petición protegida con token firmado para este sub: denegada en vivo
      const brokenToken = mockApp.jwt.sign({
        sub: brokenUserId,
        email: brokenUserEmail,
        nombre: 'User Broken Simulado',
        rol: 'OPERADOR',
        usuarioId: 'usr-inexistente-12345',
      });

      const protectedBroken = await mockApp.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${brokenToken}` },
      });
      assert.equal(protectedBroken.statusCode, 401);
      assert.equal(protectedBroken.json().error.code, 'UNAUTHORIZED');
    } finally {
      await mockApp.close();
    }
  });

  // --------------------------------------------------------------------------
  // PRUEBA 5: CLIENTE sin usuarioId y activo: sigue funcionando
  // --------------------------------------------------------------------------
  it('5. CLIENTE sin usuarioId y activo: sigue funcionando normalmente', async () => {
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);

    await db.prisma.user.create({
      data: {
        email: 'cliente.activo@daplace.pe',
        nombre: 'Cliente Activo',
        rol: 'CLIENTE',
        isActive: true,
        passwordHash,
        usuarioId: null, // Sin relación hacia usuarios
      },
    });

    // 5.1 Login funciona
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'cliente.activo@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(loginRes.statusCode, 200);
    const body = loginRes.json();
    assert.ok(body.accessToken);
    assert.equal(body.user.usuarioId, null);

    const refreshTokenCookie = extractCookie(loginRes.headers['set-cookie']);

    // 5.2 Petición protegida con access token emitido en login funciona
    const initialProtectedRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    assert.equal(initialProtectedRes.statusCode, 200);
    assert.equal(initialProtectedRes.json().user.email, 'cliente.activo@daplace.pe');

    // 5.3 Refresh funciona
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: refreshTokenCookie,
        origin: 'http://localhost:5173',
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(refreshRes.statusCode, 200);
    const refreshBody = refreshRes.json();
    assert.ok(refreshBody.accessToken);

    // 5.4 Petición protegida con access token emitido en refresh funciona
    const protectedRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${refreshBody.accessToken}` },
    });
    assert.equal(protectedRes.statusCode, 200);
    assert.equal(protectedRes.json().user.email, 'cliente.activo@daplace.pe');
  });

  // --------------------------------------------------------------------------
  // PRUEBA 6: CLIENTE sin usuarioId e inactivo: acceso denegado
  // --------------------------------------------------------------------------
  it('6. CLIENTE sin usuarioId e inactivo: acceso denegado en login, refresh y peticiones protegidas', async () => {
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);

    // 6.1 Crear cliente inicialmente activo para obtener tokens legítimos
    const cliente = await db.prisma.user.create({
      data: {
        email: 'cliente.temporal@daplace.pe',
        nombre: 'Cliente Temporal',
        rol: 'CLIENTE',
        isActive: true,
        passwordHash,
        usuarioId: null,
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'cliente.temporal@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(loginRes.statusCode, 200);
    const validAccessToken = loginRes.json().accessToken;
    const refreshTokenCookie = extractCookie(loginRes.headers['set-cookie']);

    // 6.2 Desactivar el cliente en la base de datos (User.isActive = false)
    await db.prisma.user.update({
      where: { id: cliente.id },
      data: { isActive: false },
    });

    // 6.3 Login posterior es denegado
    const loginBlocked = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'cliente.temporal@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(loginBlocked.statusCode, 401);
    assert.equal(loginBlocked.json().error.code, 'INVALID_CREDENTIALS');

    // 6.4 Refresh con token previo es denegado
    const refreshBlocked = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: refreshTokenCookie,
        origin: 'http://localhost:5173',
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(refreshBlocked.statusCode, 401);

    // 6.5 Access token previamente emitido queda denegado inmediatamente
    const protectedBlocked = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${validAccessToken}` },
    });
    assert.equal(protectedBlocked.statusCode, 401);
  });

  // --------------------------------------------------------------------------
  // PRUEBA 7: El seed no altera ninguno de los estados existentes
  // --------------------------------------------------------------------------
  it('7. El seed no altera ninguno de los estados existentes', async () => {
    // 7.1 Ejecutar seed inicial
    await seedDevUsers(db.prisma, { defaultPassword: TEST_PASSWORD, allowDevSeed: true });

    // 7.2 Desactivar manualmente un Usuario y un User en la base de datos
    await db.prisma.usuario.update({
      where: { email: 'operador.dev@daplace.pe' },
      data: { activo: false },
    });

    await db.prisma.user.update({
      where: { email: 'admin.dev@daplace.pe' },
      data: { isActive: false },
    });

    // 7.3 Ejecutar seed nuevamente
    const seedResult = await seedDevUsers(db.prisma, { defaultPassword: TEST_PASSWORD, allowDevSeed: true });
    assert.equal(seedResult.success, true);

    // 7.4 Comprobar que los estados permanecieron exactamente inalterados
    const usuarioDespues = await db.prisma.usuario.findUnique({
      where: { email: 'operador.dev@daplace.pe' },
    });
    assert.equal(
      usuarioDespues?.activo,
      false,
      'Usuario.activo=false debe ser preservado por el seed sin reactivación'
    );

    const userDespues = await db.prisma.user.findUnique({
      where: { email: 'admin.dev@daplace.pe' },
    });
    assert.equal(
      userDespues?.isActive,
      false,
      'User.isActive=false debe ser preservado por el seed sin reactivación'
    );
  });
});
