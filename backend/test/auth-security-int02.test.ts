import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { buildApp } from '../src/app/app.js';
import { PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const testDbUrl = getRequiredTestDatabaseUrl();
const TEST_JWT_SECRET = 'secreto_super_seguro_para_pruebas_de_integracion_auth_2026!';

describe('Gate INT-02 — Autenticación Real, Rotación Concurrente y Pruebas Negativas', () => {
  let db: ReturnType<typeof createDatabase>;
  let repository: PrismaAuthRepository;
  let app: ReturnType<typeof buildApp>;

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
  });

  beforeEach(async () => {
    await safeResetTestDatabase(testDbUrl);
  });

  after(async () => {
    await app.close();
    await db.close();
  });

  it('1. Login real con Argon2id contra PostgreSQL genera sesión y cookies HttpOnly', async () => {
    const passwordHash = await AuthService.hashPassword('AdminClave2026!');
    await repository.createUser({
      email: 'valeria.real@daplace.pe',
      passwordHash,
      nombre: 'Valeria Administradora Real',
      rol: 'ADMINISTRADOR',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'valeria.real@daplace.pe',
        password: 'AdminClave2026!',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.accessToken);
    assert.equal(body.user.email, 'valeria.real@daplace.pe');
    assert.equal(body.user.rol, 'ADMINISTRADOR');

    // Verificar que el payload del access token JWT contiene sid y family
    const decodedPayload = app.jwt.decode<any>(body.accessToken);
    assert.ok(decodedPayload.sid, 'El JWT debe contener el sid de sesión');
    assert.ok(decodedPayload.family, 'El JWT debe contener family');

    // Verificar cookie de refresh token
    const cookies = res.cookies;
    const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
    assert.ok(refreshCookie, 'Debe establecerse la cookie refreshToken');
    assert.equal(refreshCookie.httpOnly, true);
    assert.equal(refreshCookie.sameSite?.toLowerCase(), 'lax');
  });

  it('2. Logout revoca la sesión en PostgreSQL e invalida inmediatamente el access token anterior', async () => {
    const passwordHash = await AuthService.hashPassword('AdminClave2026!');
    await repository.createUser({
      email: 'valeria.logout@daplace.pe',
      passwordHash,
      nombre: 'Valeria Logout',
      rol: 'ADMINISTRADOR',
    });

    // Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'valeria.logout@daplace.pe', password: 'AdminClave2026!' },
    });
    const { accessToken } = JSON.parse(loginRes.payload);
    const rtCookie = loginRes.cookies.find((c) => c.name === 'refreshToken')!;

    // Verificar que el access token funciona antes del logout
    const preLogoutRes = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(preLogoutRes.statusCode, 200);

    // Logout con autorización Bearer y cookie
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        authorization: `Bearer ${accessToken}`,
        cookie: `refreshToken=${rtCookie.value}`,
        'x-requested-with': 'XMLHttpRequest',
        origin: 'http://localhost:5173',
      },
    });
    assert.equal(logoutRes.statusCode, 200);

    // 1. Verificar revocación persistente en PostgreSQL (la fila no se borra, se marca revokedAt)
    const decoded = app.jwt.decode<any>(accessToken);
    const dbSession = await db.prisma.authSession.findUnique({
      where: { id: decoded.sid },
    });
    assert.ok(dbSession, 'La sesión debe conservarse en auth_sessions para auditoría');
    assert.ok(dbSession.revokedAt, 'revokedAt debe estar establecido tras el logout');

    // 2. El access token previo debe ser inmediatamente rechazado con 401
    const postLogoutAccess = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assert.equal(postLogoutAccess.statusCode, 401, 'El access token anterior debe ser inválido');

    // 3. Intento de refresh con el refresh token revocado debe fallar con 401
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: `refreshToken=${rtCookie.value}`,
        'x-requested-with': 'XMLHttpRequest',
        origin: 'http://localhost:5173',
      },
    });
    assert.equal(refreshRes.statusCode, 401);
  });

  it('3. Protección CSRF: rechaza peticiones a endpoints de cookies sin header personalizado o con origen espurio', async () => {
    // Falta encabezado x-requested-with
    const resNoHeader = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        origin: 'http://localhost:5173',
        cookie: 'refreshToken=dummy_token',
      },
    });
    assert.equal(resNoHeader.statusCode, 403);
    const bodyNoHeader = JSON.parse(resNoHeader.payload);
    assert.equal(bodyNoHeader.error.code, 'CSRF_VIOLATION');

    // Origen atacante malicioso
    const resBadOrigin = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        origin: 'http://sitio-malicioso-atacante.com',
        'x-requested-with': 'XMLHttpRequest',
        cookie: 'refreshToken=dummy_token',
      },
    });
    assert.equal(resBadOrigin.statusCode, 403);
  });

  it('4. Detección inmediata de usuario inactivo/desactivado en base de datos real', async () => {
    const passwordHash = await AuthService.hashPassword('AdminClave2026!');
    const user = await repository.createUser({
      email: 'valeria.desactivada@daplace.pe',
      passwordHash,
      nombre: 'Valeria Activa Inicialmente',
      rol: 'ADMINISTRADOR',
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'valeria.desactivada@daplace.pe', password: 'AdminClave2026!' },
    });
    const { accessToken } = JSON.parse(loginRes.payload);

    // Desactivar al usuario en PostgreSQL
    await repository.updateUser(user.id, { isActive: false });

    // Intento de acceso a recurso protegido con token vigente pero usuario desactivado en PostgreSQL
    const accessRes = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(accessRes.statusCode, 401);
  });

  it('5. Rotación concurrente sin bifurcaciones en PostgreSQL real', async () => {
    const passwordHash = await AuthService.hashPassword('AdminClave2026!');
    const user = await repository.createUser({
      email: 'valeria.concurrente@daplace.pe',
      passwordHash,
      nombre: 'Valeria Concurrente',
      rol: 'ADMINISTRADOR',
    });

    const rawToken = AuthService.generateRawRefreshToken();
    const tokenHash = AuthService.hashRefreshToken(rawToken);
    const family = 'family-concurrente-test-1';

    await repository.createSession({
      userId: user.id,
      tokenHash,
      family,
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Dos rotaciones casi simultáneas en PostgreSQL con conexiones transaccionales independientes
    const rotacion1Promise = repository.rotateSessionAtomic({
      oldTokenHash: tokenHash,
      newTokenHash: AuthService.hashRefreshToken(AuthService.generateRawRefreshToken()),
      family,
      newExpiresAt: new Date(Date.now() + 86400000),
      gracePeriodMs: 5000,
    });

    const rotacion2Promise = repository.rotateSessionAtomic({
      oldTokenHash: tokenHash,
      newTokenHash: AuthService.hashRefreshToken(AuthService.generateRawRefreshToken()),
      family,
      newExpiresAt: new Date(Date.now() + 86400000),
      gracePeriodMs: 5000,
    });

    const [res1, res2] = await Promise.all([rotacion1Promise, rotacion2Promise]);

    // Exactamente una debe ganar y retornar SUCCESS, y la otra debe entrar a GRACE_PERIOD_REPLAY
    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(
      statuses,
      ['GRACE_PERIOD_REPLAY', 'SUCCESS'],
      'No debe haber bifurcación de sesiones activas'
    );

    // Verificar en PostgreSQL que sólo existe una sesión activa no revocada para la familia
    const activeSessions = await db.prisma.authSession.findMany({
      where: { family, revokedAt: null },
    });
    assert.equal(activeSessions.length, 1, 'Sólo debe existir una sesión no revocada');
  });

  it('6. Sesiones independientes del mismo usuario en dispositivos distintos', async () => {
    const passwordHash = await AuthService.hashPassword('AdminClave2026!');
    await repository.createUser({
      email: 'valeria.multisesion@daplace.pe',
      passwordHash,
      nombre: 'Valeria Multisesión',
      rol: 'ADMINISTRADOR',
    });

    // Dispositivo A: login
    const loginDevA = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'valeria.multisesion@daplace.pe', password: 'AdminClave2026!' },
    });
    const tokenA = JSON.parse(loginDevA.payload).accessToken;
    const cookieA = loginDevA.cookies.find((c) => c.name === 'refreshToken')!;

    // Dispositivo B: login
    const loginDevB = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'valeria.multisesion@daplace.pe', password: 'AdminClave2026!' },
    });
    const tokenB = JSON.parse(loginDevB.payload).accessToken;

    // Ambos tokens son válidos
    const resA1 = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(resA1.statusCode, 200);

    const resB1 = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(resB1.statusCode, 200);

    // Logout en dispositivo A
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        authorization: `Bearer ${tokenA}`,
        cookie: `refreshToken=${cookieA.value}`,
        'x-requested-with': 'XMLHttpRequest',
        origin: 'http://localhost:5173',
      },
    });
    assert.equal(logoutRes.statusCode, 200);

    // Dispositivo A queda revocado (401)
    const resA2 = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(resA2.statusCode, 401, 'Sesión A debe quedar revocada');

    // Dispositivo B permanece plenamente activo (200)
    const resB2 = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(resB2.statusCode, 200, 'Sesión B debe permanecer activa e independiente');
  });

  it('7. Concurrencia real (Orden 1): Logout y Refresh ejecutados en paralelo -> ningún token de la familia queda autorizado y sesión B se preserva', async () => {
    const passwordHash = await AuthService.hashPassword('AdminClave2026!');
    await repository.createUser({
      email: 'valeria.concurrente.orden1@daplace.pe',
      passwordHash,
      nombre: 'Valeria Concurrente Orden 1',
      rol: 'ADMINISTRADOR',
    });

    // Dispositivo A: login
    const loginA = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'valeria.concurrente.orden1@daplace.pe', password: 'AdminClave2026!' },
    });
    const tokenA = JSON.parse(loginA.payload).accessToken;
    const cookieA = loginA.cookies.find((c) => c.name === 'refreshToken')!;
    const decodedA = app.jwt.decode<any>(tokenA);

    // Dispositivo B (independiente): login
    const loginB = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'valeria.concurrente.orden1@daplace.pe', password: 'AdminClave2026!' },
    });
    const tokenB = JSON.parse(loginB.payload).accessToken;

    // Disparar Logout y Refresh concurrentemente sobre la sesión del Dispositivo A
    const logoutPromise = app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        authorization: `Bearer ${tokenA}`,
        cookie: `refreshToken=${cookieA.value}`,
        'x-requested-with': 'XMLHttpRequest',
        origin: 'http://localhost:5173',
      },
    });

    const refreshPromise = app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: `refreshToken=${cookieA.value}`,
        'x-requested-with': 'XMLHttpRequest',
        origin: 'http://localhost:5173',
      },
    });

    const [logoutRes, refreshRes] = await Promise.all([logoutPromise, refreshPromise]);
    assert.equal(logoutRes.statusCode, 200, 'Logout debe completarse con éxito');

    // Si el refresh logró devolver un nuevo token antes de la revocación, ese nuevo token
    // debe ser inválido de inmediato porque la familia completa fue revocada
    if (refreshRes.statusCode === 200) {
      const { accessToken: newTokenFromRefresh } = JSON.parse(refreshRes.payload);
      const testNewToken = await app.inject({
        method: 'GET',
        url: '/api/propiedades',
        headers: { authorization: `Bearer ${newTokenFromRefresh}` },
      });
      assert.equal(testNewToken.statusCode, 401, 'El token derivado del refresh concurrente debe estar revocado');
    } else {
      assert.equal(refreshRes.statusCode, 401, 'Si el logout procesó primero, el refresh debe ser rechazado con 401');
    }

    // El token original de A está revocado
    const resAOriginal = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(resAOriginal.statusCode, 401, 'El token original de A debe quedar revocado');

    // Verificar en PostgreSQL: todas las sesiones de la familia de A tienen revokedAt NOT NULL
    const familySessionsA = await db.prisma.authSession.findMany({
      where: { family: decodedA.family },
    });
    assert.ok(familySessionsA.length >= 1, 'Debe conservarse el registro de sesiones para auditoría');
    for (const s of familySessionsA) {
      assert.ok(s.revokedAt !== null, 'Todas las sesiones de la familia deben estar marcadas como revocadas');
    }

    // Dispositivo B permanece 100% activo y autorizado
    const resB = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(resB.statusCode, 200, 'La sesión independiente del Dispositivo B debe permanecer autorizada');
  });

  it('7b. Concurrencia real (Orden 2): Refresh completa rotación y Logout posterior revoca la familia completa invalidando el nuevo token', async () => {
    const passwordHash = await AuthService.hashPassword('AdminClave2026!');
    await repository.createUser({
      email: 'valeria.concurrente.orden2@daplace.pe',
      passwordHash,
      nombre: 'Valeria Concurrente Orden 2',
      rol: 'ADMINISTRADOR',
    });

    // Dispositivo A: login
    const loginA = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'valeria.concurrente.orden2@daplace.pe', password: 'AdminClave2026!' },
    });
    const tokenA = JSON.parse(loginA.payload).accessToken;
    const cookieA = loginA.cookies.find((c) => c.name === 'refreshToken')!;
    const decodedA = app.jwt.decode<any>(tokenA);

    // Dispositivo B: login independiente
    const loginB = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'valeria.concurrente.orden2@daplace.pe', password: 'AdminClave2026!' },
    });
    const tokenB = JSON.parse(loginB.payload).accessToken;

    // Dispositivo A: Refresh completa primero su rotación
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: `refreshToken=${cookieA.value}`,
        'x-requested-with': 'XMLHttpRequest',
        origin: 'http://localhost:5173',
      },
    });
    assert.equal(refreshRes.statusCode, 200);
    const { accessToken: newRotatedTokenA } = JSON.parse(refreshRes.payload);

    // Inmediatamente después, se procesa Logout de A con el token original o cookie previa
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        authorization: `Bearer ${tokenA}`,
        cookie: `refreshToken=${cookieA.value}`,
        'x-requested-with': 'XMLHttpRequest',
        origin: 'http://localhost:5173',
      },
    });
    assert.equal(logoutRes.statusCode, 200);

    // Ni el token original ni el nuevo token emitido por el refresh deben ser aceptados
    const resAOriginal = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(resAOriginal.statusCode, 401, 'Token original debe estar revocado');

    const resARotated = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${newRotatedTokenA}` },
    });
    assert.equal(resARotated.statusCode, 401, 'El nuevo token rotado debe quedar revocado por pertenecer a la misma familia');

    // Verificar en PostgreSQL: todas las sesiones de la familia quedan con revokedAt NOT NULL (auditoría intacta)
    const sessionsInFamilyA = await db.prisma.authSession.findMany({
      where: { family: decodedA.family },
    });
    assert.ok(sessionsInFamilyA.length >= 2, 'Deben existir tanto la sesión original como la rotada');
    for (const s of sessionsInFamilyA) {
      assert.ok(s.revokedAt !== null, 'Todas las sesiones de la familia deben tener revokedAt');
    }

    // Dispositivo B no sufre ninguna afectación
    const resB = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(resB.statusCode, 200, 'Sesión independiente en Dispositivo B debe permanecer activa');
  });
});
