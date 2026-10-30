import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildApp } from '../src/app/app.js';
import { InMemoryAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { createAuthMiddleware } from '../src/modules/auth/auth.middleware.js';

describe('Authentication & Authorization Suite', () => {
  let app: ReturnType<typeof buildApp> | undefined;
  let repository: InMemoryAuthRepository;

  const TEST_JWT_SECRET = 'test-secret-key-at-least-32-chars-for-unit-testing-only!';
  const validPassword = 'SecurePassword2026!';
  const testUser = {
    email: 'valeria.admin@daplace.pe',
    nombre: 'Valeria Méndez',
    cargo: 'Administradora General',
    rol: 'ADMINISTRADOR' as const,
  };
  const operatorUser = {
    email: 'diego.operador@daplace.pe',
    nombre: 'Diego Navarro',
    cargo: 'Operador de Turno',
    rol: 'OPERADOR' as const,
  };

  beforeEach(async () => {
    repository = new InMemoryAuthRepository();
    const passwordHash = await AuthService.hashPassword(validPassword);

    await repository.createUser({
      ...testUser,
      passwordHash,
    });

    await repository.createUser({
      ...operatorUser,
      passwordHash,
    });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  // Fix 1: Rechazo de arranque si falta JWT_SECRET o es inferior a 32 caracteres
  it('rechaza el arranque del servidor si falta JWT_SECRET cuando la autenticación está activa', () => {
    assert.throws(
      () =>
        buildApp({
          authRepository: repository,
          jwtSecret: '',
        }),
      (err: any) => err.message.includes('JWT_SECRET es obligatorio')
    );

    assert.throws(
      () =>
        buildApp({
          authRepository: repository,
          jwtSecret: 'clave_corta_menor_32_chars',
        }),
      (err: any) => err.message.includes('al menos 32 caracteres')
    );
  });

  // Fix 9: Rechazo de comodín CORS '*' cuando credentials=true
  it('rechaza el arranque si la configuración CORS incluye el comodín "*"', () => {
    assert.throws(
      () =>
        buildApp({
          authRepository: repository,
          jwtSecret: TEST_JWT_SECRET,
          allowedOrigins: ['*'],
        }),
      (err: any) => err.message.includes('No se permite el origen comodín "*"')
    );
  });

  it('inicia sesión con credenciales válidas y emite access token y cookie HttpOnly', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: validPassword,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.ok(body.accessToken, 'Debe devolver un accessToken');
    assert.equal(body.user.email, testUser.email);
    assert.equal(body.user.rol, 'ADMINISTRADOR');
    assert.equal(body.user.nombre, testUser.nombre);
    assert.equal(body.user.passwordHash, undefined, 'No debe filtrar el passwordHash');

    const setCookie = response.headers['set-cookie'];
    assert.ok(setCookie, 'Debe incluir encabezado set-cookie');
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    assert.ok(cookieStr.includes('refreshToken='), 'Debe contener la cookie refreshToken');
    assert.ok(cookieStr.toLowerCase().includes('httponly'), 'Debe tener HttpOnly');
    assert.ok(cookieStr.toLowerCase().includes('samesite=lax'), 'Debe tener SameSite=lax');
  });

  // Fix 8: Mitigación de timing attack en enumeración de cuentas
  it('rechaza contraseña incorrecta y usuario inexistente con mensaje idéntico y seguro', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    // 1. Contraseña incorrecta para usuario existente
    const resWrongPass = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: 'IncorrectPassword123!',
      },
    });
    assert.equal(resWrongPass.statusCode, 401);
    assert.equal(resWrongPass.json().error.code, 'INVALID_CREDENTIALS');
    assert.equal(resWrongPass.json().error.message, 'Credenciales inválidas.');

    // 2. Correo inexistente (debe devolver el mismo error genérico y ejecutar hash dummy)
    const resNoUser = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'no.existe@daplace.pe',
        password: 'RandomPassword123!',
      },
    });
    assert.equal(resNoUser.statusCode, 401);
    assert.equal(resNoUser.json().error.code, 'INVALID_CREDENTIALS');
    assert.equal(resNoUser.json().error.message, 'Credenciales inválidas.');
  });

  it('rechaza acceso a /auth/me sin token o con token alterado', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const resNoToken = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });
    assert.equal(resNoToken.statusCode, 401);
    assert.equal(resNoToken.json().error.code, 'UNAUTHORIZED');

    const resBadToken = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: 'Bearer token_invalido_totalmente_falso',
      },
    });
    assert.equal(resBadToken.statusCode, 401);
    assert.equal(resBadToken.json().error.code, 'UNAUTHORIZED');
  });

  it('permite acceso a /auth/me con access token válido', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: validPassword,
      },
    });
    const { accessToken } = loginRes.json();

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(meRes.statusCode, 200);
    const body = meRes.json();
    assert.equal(body.user.email, testUser.email);
    assert.equal(body.user.rol, 'ADMINISTRADOR');
  });

  // Fix 7: Comprobación viva en backend: usuario desactivado o rol retirado pierde acceso de inmediato
  it('revoca acceso en vivo inmediatamente si el usuario es desactivado o su rol cambia', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    // 1. Obtener access token para usuario activo con rol ADMINISTRADOR
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: validPassword,
      },
    });
    const { accessToken, user } = loginRes.json();

    // 2. Desactivar usuario en la base de datos
    await repository.updateUser(user.id, { isActive: false });

    // 3. Intento de acceder a /auth/me con el JWT aún vigente en tiempo
    const meResDeactivated = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    assert.equal(meResDeactivated.statusCode, 401);
    assert.equal(meResDeactivated.json().error.code, 'UNAUTHORIZED');

    // 4. Reactivar usuario pero rebajar rol a CLIENTE en la base de datos
    await repository.updateUser(user.id, { isActive: true, rol: 'CLIENTE' });

    // 5. Verificar con requireRoles: el token original decía ADMINISTRADOR,
    // pero la comprobación viva en BD detecta que su rol real actual es CLIENTE
    const { authenticate, requireRoles } = createAuthMiddleware(app, {
      allowedIss: 'daplace-rentals',
      allowedAud: 'daplace-rentals-app',
      repository,
    });

    const fakeReq = {
      headers: { authorization: `Bearer ${accessToken}` },
      log: { warn: () => undefined },
    } as any;

    await authenticate(fakeReq, {} as any);
    assert.equal(fakeReq.user.rol, 'CLIENTE', 'El rol debe sincronizarse en vivo con la BD');

    const adminHook = requireRoles('ADMINISTRADOR');
    await assert.rejects(
      async () => {
        await adminHook(fakeReq, {} as any);
      },
      (err: any) => {
        assert.equal(err.code, 'FORBIDDEN');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });

  // Fix 3: Concurrencia en refresh, atomicidad y periodo de gracia vs ataque de reutilización
  it('coordina solicitudes concurrentes con el mismo token bajo ventana de gracia y detecta reutilización posterior', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: validPassword,
      },
    });
    const rawSetCookie = loginRes.headers['set-cookie'];
    const cookieHeaderStr = Array.isArray(rawSetCookie) ? rawSetCookie[0] : (rawSetCookie as string);
    const firstRawToken = cookieHeaderStr.split(';')[0].replace('refreshToken=', '').trim();
    const firstCookie = `refreshToken=${firstRawToken}`;

    // Solicitud 1: Renovación legítima -> rota el token
    const refresh1Res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: firstCookie,
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(refresh1Res.statusCode, 200);
    const rawSetCookie2 = refresh1Res.headers['set-cookie'];
    const cookieHeaderStr2 = Array.isArray(rawSetCookie2) ? rawSetCookie2[0] : (rawSetCookie2 as string);
    const secondRawToken = cookieHeaderStr2.split(';')[0].replace('refreshToken=', '').trim();
    const secondCookie = `refreshToken=${secondRawToken}`;
    assert.notEqual(firstRawToken, secondRawToken);

    // Solicitud 2: Solicitud duplicada inmediata (dentro de la ventana de gracia de 15s)
    // No debe revocar la familia (evita desconectar al usuario por duplicación legítima)
    const duplicateRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: firstCookie,
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(duplicateRes.statusCode, 409);
    assert.equal(duplicateRes.json().error.code, 'CONCURRENT_ROTATION');

    // La sesión actual activa sigue funcionando perfectamente
    const validCheckRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: secondCookie,
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(validCheckRes.statusCode, 200);
    const rawSetCookie3 = validCheckRes.headers['set-cookie'];
    const cookieHeaderStr3 = Array.isArray(rawSetCookie3) ? rawSetCookie3[0] : (rawSetCookie3 as string);
    const thirdRawToken = cookieHeaderStr3.split(';')[0].replace('refreshToken=', '').trim();
    const thirdCookie = `refreshToken=${thirdRawToken}`;

    // Solicitud 3: Si se intenta reusar un token revocado FUERA del periodo de gracia
    // Simulamos que el token inicial fue revocado hace más de 15 segundos
    const initialTokenHash = AuthService.hashRefreshToken(firstRawToken);
    const sessionRecord = await repository.findSessionByTokenHash(initialTokenHash);
    assert.ok(sessionRecord, 'El registro de sesión debe existir en el repositorio');
    sessionRecord.revokedAt = new Date(Date.now() - 30000); // 30s en el pasado

    const maliciousReplayRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: firstCookie,
        'x-requested-with': 'XMLHttpRequest',
      },
    });

    // Detecta reutilización indebida y anula la familia completa
    assert.equal(maliciousReplayRes.statusCode, 401);
    assert.equal(maliciousReplayRes.json().error.code, 'REFRESH_TOKEN_REUSED');

    // Tras el ataque, los tokens legítimos de la misma familia fueron revocados por seguridad
    const familyCheckRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: thirdCookie,
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(familyCheckRes.statusCode, 401);
  });

  // Fix 5: Cierre de sesión y protección CSRF
  it('cierra sesión limpiando cookie y revocando en servidor, y exige CSRF', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testUser.email,
        password: validPassword,
      },
    });
    const cookie = (loginRes.headers['set-cookie'] as string).split(';')[0];

    // Intento de logout sin encabezado CSRF -> Bloqueado con 403
    const badLogout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie },
    });
    assert.equal(badLogout.statusCode, 403);
    assert.equal(badLogout.json().error.code, 'CSRF_VIOLATION');

    // Logout con encabezado CSRF -> 200 OK
    const goodLogout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        cookie,
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(goodLogout.statusCode, 200);
    assert.equal(goodLogout.json().success, true);

    // Intento posterior de refresco debe fallar con 401
    const refreshPostLogout = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie,
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    assert.equal(refreshPostLogout.statusCode, 401);
  });

  it('aplica limitación de tasa (rate limiting) ante intentos excesivos de login', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: true,
    });

    let hitRateLimit = false;
    for (let i = 0; i < 12; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: testUser.email,
          password: 'WrongPassword!',
        },
      });
      if (res.statusCode === 429) {
        assert.equal(res.json().error.code, 'RATE_LIMIT_EXCEEDED');
        hitRateLimit = true;
        break;
      }
    }

    assert.equal(hitRateLimit, true, 'Debe responder con 429 tras superar el límite');
  });
});
