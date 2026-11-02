import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { buildApp } from '../src/app/app.js';
import { InMemoryAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

describe('Account & Security Module Suite (FEEDBACK-DIEGO-03-A4)', () => {
  let app: ReturnType<typeof buildApp> | undefined;
  let repository: InMemoryAuthRepository;

  const TEST_JWT_SECRET = 'test-secret-key-at-least-32-chars-for-unit-testing-only!';
  const initialPassword = 'MiPasswordSeguro2026!';

  const adminAccount = {
    email: 'admin.seguridad@daplace.pe',
    nombre: 'Valeria Administradora',
    cargo: 'Gerente General',
    rol: 'ADMINISTRADOR' as const,
  };

  const clientAccount = {
    email: 'cliente.viajero@daplace.pe',
    nombre: 'Carlos Huésped',
    cargo: 'Cliente Final',
    rol: 'CLIENTE' as const,
  };

  const otherAccount = {
    email: 'otro.usuario@daplace.pe',
    nombre: 'Usuario Existente',
    cargo: 'Operador',
    rol: 'OPERADOR' as const,
  };

  beforeEach(async () => {
    repository = new InMemoryAuthRepository();
    const passwordHash = await AuthService.hashPassword(initialPassword);

    await repository.createUser({
      ...adminAccount,
      passwordHash,
    });

    await repository.createUser({
      ...clientAccount,
      passwordHash,
    });

    await repository.createUser({
      ...otherAccount,
      passwordHash,
    });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function getLoginTokens(email: string, password = initialPassword) {
    const res = await app!.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });
    const body = res.json();
    const cookie = (res.headers['set-cookie'] as string | undefined)?.split(';')[0];
    return { accessToken: body.accessToken as string, cookie, user: body.user };
  }

  it('1. GET /api/cuenta/perfil devuelve los datos de la cuenta autenticada y rechaza sin token', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    // Sin token -> 401
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/cuenta/perfil',
    });
    assert.equal(unauthRes.statusCode, 401);

    // Con token válido de ADMINISTRADOR
    const { accessToken } = await getLoginTokens(adminAccount.email);
    const authRes = await app.inject({
      method: 'GET',
      url: '/api/cuenta/perfil',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(authRes.statusCode, 200);
    const data = authRes.json();
    assert.equal(data.user.email, adminAccount.email);
    assert.equal(data.user.rol, 'ADMINISTRADOR');
    assert.equal(data.user.nombre, adminAccount.nombre);
  });

  it('2. GET /api/cuenta/perfil funciona igualmente para cuentas con rol CLIENTE', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const { accessToken } = await getLoginTokens(clientAccount.email);
    const authRes = await app.inject({
      method: 'GET',
      url: '/api/cuenta/perfil',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(authRes.statusCode, 200);
    const data = authRes.json();
    assert.equal(data.user.email, clientAccount.email);
    assert.equal(data.user.rol, 'CLIENTE');
  });

  it('3. PATCH /api/cuenta/email actualiza exitosamente el correo con contraseña actual válida', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const { accessToken } = await getLoginTokens(adminAccount.email);
    const nuevoEmail = 'valeria.nuevo@daplace.pe';

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/cuenta/email',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-requested-with': 'XMLHttpRequest',
      },
      payload: {
        nuevoEmail,
        passwordActual: initialPassword,
      },
    });

    assert.equal(patchRes.statusCode, 200);
    const body = patchRes.json();
    assert.equal(body.success, true);
    assert.equal(body.user.email, nuevoEmail);

    // Comprobar persistencia en repositorio
    const updated = await repository.findUserByEmail(nuevoEmail);
    assert.ok(updated);
    assert.equal(updated.email, nuevoEmail);
  });

  it('4. PATCH /api/cuenta/email rechaza con 401 si la contraseña actual es incorrecta', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const { accessToken } = await getLoginTokens(adminAccount.email);
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/cuenta/email',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-requested-with': 'XMLHttpRequest',
      },
      payload: {
        nuevoEmail: 'otro@daplace.pe',
        passwordActual: 'PasswordEquivocada123!',
      },
    });

    assert.equal(patchRes.statusCode, 401);
    assert.equal(patchRes.json().error.code, 'INVALID_CREDENTIALS');
  });

  it('5. PATCH /api/cuenta/email rechaza con 409 si el correo ya pertenece a otra cuenta', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const { accessToken } = await getLoginTokens(adminAccount.email);
    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/cuenta/email',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-requested-with': 'XMLHttpRequest',
      },
      payload: {
        nuevoEmail: otherAccount.email, // Correo ya existente
        passwordActual: initialPassword,
      },
    });

    assert.equal(patchRes.statusCode, 409);
    assert.equal(patchRes.json().error.code, 'EMAIL_ALREADY_EXISTS');
  });

  it('6. PATCH /api/cuenta/email rechaza si el formato es inválido o idéntico al actual', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const { accessToken } = await getLoginTokens(adminAccount.email);

    // Formato inválido
    const invalidRes = await app.inject({
      method: 'PATCH',
      url: '/api/cuenta/email',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-requested-with': 'XMLHttpRequest',
      },
      payload: {
        nuevoEmail: 'correo_sin_arroba',
        passwordActual: initialPassword,
      },
    });
    assert.equal(invalidRes.statusCode, 400);
    assert.equal(invalidRes.json().error.code, 'INVALID_EMAIL_FORMAT');

    // Mismo correo
    const sameRes = await app.inject({
      method: 'PATCH',
      url: '/api/cuenta/email',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-requested-with': 'XMLHttpRequest',
      },
      payload: {
        nuevoEmail: adminAccount.email,
        passwordActual: initialPassword,
      },
    });
    assert.equal(sameRes.statusCode, 400);
    assert.equal(sameRes.json().error.code, 'SAME_EMAIL');
  });

  it('7. PATCH /api/cuenta/password cambia la contraseña, revoca sesiones previas y limpia la cookie', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const { accessToken } = await getLoginTokens(adminAccount.email);
    const nuevoPassword = 'NuevaClaveSuperSegura2027!';

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/cuenta/password',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-requested-with': 'XMLHttpRequest',
      },
      payload: {
        passwordActual: initialPassword,
        nuevoPassword,
      },
    });

    assert.equal(patchRes.statusCode, 200);
    assert.equal(patchRes.json().success, true);

    // La cookie refreshToken debe haber sido limpiada
    const setCookie = patchRes.headers['set-cookie'] as string | undefined;
    assert.ok(setCookie?.includes('refreshToken=;'), 'Debe limpiar la cookie de sesión');

    // El login con la contraseña antigua ahora debe fallar (401)
    const oldLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: adminAccount.email, password: initialPassword },
    });
    assert.equal(oldLoginRes.statusCode, 401);

    // El login con la nueva contraseña debe tener éxito (200)
    const newLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: adminAccount.email, password: nuevoPassword },
    });
    assert.equal(newLoginRes.statusCode, 200);
  });

  it('8. PATCH /api/cuenta/password rechaza contraseñas débiles o idénticas', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const { accessToken } = await getLoginTokens(adminAccount.email);

    // Demasiado corta o débil
    const weakRes = await app.inject({
      method: 'PATCH',
      url: '/api/cuenta/password',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-requested-with': 'XMLHttpRequest',
      },
      payload: {
        passwordActual: initialPassword,
        nuevoPassword: 'debil',
      },
    });
    assert.equal(weakRes.statusCode, 400);
    assert.equal(weakRes.json().error.code, 'WEAK_PASSWORD');

    // Idéntica a la actual
    const sameRes = await app.inject({
      method: 'PATCH',
      url: '/api/cuenta/password',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-requested-with': 'XMLHttpRequest',
      },
      payload: {
        passwordActual: initialPassword,
        nuevoPassword: initialPassword,
      },
    });
    assert.equal(sameRes.statusCode, 400);
    assert.equal(sameRes.json().error.code, 'SAME_PASSWORD');
  });

  it('9. Rechaza operaciones sensibles sin encabezado CSRF (X-Requested-With)', async () => {
    app = buildApp({
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      enableRateLimit: false,
    });

    const { accessToken } = await getLoginTokens(adminAccount.email);

    // Intento de cambio de email sin header CSRF -> 403
    const noCsrfEmail = await app.inject({
      method: 'PATCH',
      url: '/api/cuenta/email',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        nuevoEmail: 'valeria.hack@daplace.pe',
        passwordActual: initialPassword,
      },
    });
    assert.equal(noCsrfEmail.statusCode, 403);
    assert.equal(noCsrfEmail.json().error.code, 'CSRF_VIOLATION');
  });
});
