import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { buildApp } from '../src/app/app.js';
import { PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const testDbUrl = getRequiredTestDatabaseUrl();
const TEST_JWT_SECRET = 'secreto_jwt_super_seguro_para_pruebas_staff_management_test!';

describe('HU-19 — Administración de Personal y Cuentas Internas', () => {
  let db: ReturnType<typeof createDatabase>;
  let repository: PrismaAuthRepository;
  let app: ReturnType<typeof buildApp>;

  let adminToken: string;
  let operadorToken: string;
  let adminUserId: string;

  before(async () => {
    db = createDatabase(testDbUrl);
    repository = new PrismaAuthRepository(db.prisma);
    app = buildApp({
      prisma: db.prisma,
      authRepository: repository,
      jwtSecret: TEST_JWT_SECRET,
      allowedOrigins: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      secureCookies: false,
      enableRateLimit: false,
    });
    await app.ready();
  });

  after(async () => {
    await app.close();
    await db.prisma.$disconnect();
  });

  beforeEach(async () => {
    await safeResetTestDatabase(testDbUrl);
    const passwordHash = await AuthService.hashPassword('PassSecure2026!');

    // Admin con vínculo explícito a Usuario
    const usrAdmin = await db.prisma.usuario.create({
      data: { id: 'usr-admin-staff', nombre: 'Admin Staff Master', email: 'admin@daplace.pe', rol: 'ADMIN', activo: true },
    });
    const createdAdmin = await repository.createUser({
      email: 'admin@daplace.pe',
      passwordHash,
      nombre: 'Admin Staff Master',
      rol: 'ADMINISTRADOR',
      usuarioId: usrAdmin.id,
    });
    adminUserId = createdAdmin.id;

    // Operador con vínculo explícito a Usuario
    const usrOp = await db.prisma.usuario.create({
      data: { id: 'usr-op-staff', nombre: 'Operador Turno Staff', email: 'operador@daplace.pe', rol: 'OPERADOR', activo: true },
    });
    await repository.createUser({
      email: 'operador@daplace.pe',
      passwordHash,
      nombre: 'Operador Turno Staff',
      rol: 'OPERADOR',
      usuarioId: usrOp.id,
    });

    const login = async (email: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'PassSecure2026!' },
      });
      return JSON.parse(res.body).accessToken as string;
    };

    adminToken = await login('admin@daplace.pe');
    operadorToken = await login('operador@daplace.pe');
  });

  it('1. Solo ADMINISTRADOR puede listar cuentas internas; OPERADOR recibe 403', async () => {
    // Admin consulta
    const resAdmin = await app.inject({
      method: 'GET',
      url: '/api/usuarios/internos',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(resAdmin.statusCode, 200);
    const bodyAdmin = resAdmin.json();
    assert.ok(Array.isArray(bodyAdmin.data));
    assert.equal(bodyAdmin.data.length, 2);

    // Operador consulta (prohibido)
    const resOp = await app.inject({
      method: 'GET',
      url: '/api/usuarios/internos',
      headers: { authorization: `Bearer ${operadorToken}` },
    });
    assert.equal(resOp.statusCode, 403);
  });

  it('2. Administrador crea nuevo OPERADOR con vínculo explícito User/Usuario de dominio', async () => {
    const payload = {
      nombre: 'Sofía Valdivia',
      email: 'sofia.operaciones@daplace.pe',
      password: 'ClaveSegura2026!',
      rol: 'OPERADOR',
      cargo: 'Coordinadora de Turno',
      telefono: '+51 987654321',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/internos',
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });

    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.ok(body.data.id);
    assert.equal(body.data.email, 'sofia.operaciones@daplace.pe');
    assert.equal(body.data.nombre, 'Sofía Valdivia');
    assert.equal(body.data.rol, 'OPERADOR');
    assert.equal(body.data.isActive, true);
    assert.ok(body.data.usuarioId, 'Debe tener usuarioId de dominio vinculado');

    // Verificar en base de datos la persistencia dual y atómica
    const persistedUser = await db.prisma.user.findUnique({
      where: { email: 'sofia.operaciones@daplace.pe' },
      include: { usuario: true },
    });
    assert.ok(persistedUser);
    assert.equal(persistedUser.isActive, true);
    assert.equal(persistedUser.rol, 'OPERADOR');
    assert.ok(persistedUser.usuario);
    assert.equal(persistedUser.usuario.rol, 'OPERADOR');
    assert.equal(persistedUser.usuario.activo, true);

    // Verificar que la nueva usuaria puede iniciar sesión
    const loginNewUser = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'sofia.operaciones@daplace.pe', password: 'ClaveSegura2026!' },
    });
    assert.equal(loginNewUser.statusCode, 200);
  });

  it('3. Rechaza roles no autorizados comercialmente (ej. GERENTE)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/usuarios/internos',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        nombre: 'Gerente Comercial',
        email: 'gerente@daplace.pe',
        password: 'ClaveSegura2026!',
        rol: 'GERENTE',
      },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'INVALID_STAFF_ROLE');
  });

  it('4. Protege contra auto-desactivación del propio administrador activo', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/internos/${adminUserId}/estado`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { activo: false },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error.code, 'CANNOT_DEACTIVATE_OWN_ACCOUNT');
  });

  it('5. Desactivar cuenta de operador apaga User, Usuario y revoca sesiones de inmediato', async () => {
    // Obtener ID del operador
    const opUser = await db.prisma.user.findUnique({
      where: { email: 'operador@daplace.pe' },
    });
    assert.ok(opUser);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/internos/${opUser.id}/estado`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { activo: false },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.data.isActive, false);

    // Comprobar persistencia en User y Usuario
    const checkUser = await db.prisma.user.findUnique({
      where: { id: opUser.id },
      include: { usuario: true },
    });
    assert.equal(checkUser?.isActive, false);
    assert.equal(checkUser?.usuario?.activo, false);

    // Intento de login del operador desactivado debe ser rechazado
    const loginAttempt = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'operador@daplace.pe', password: 'PassSecure2026!' },
    });
    assert.equal(loginAttempt.statusCode, 401);
  });

  it('6. Modificar rol de cuenta interna sincroniza User y Usuario', async () => {
    const opUser = await db.prisma.user.findUnique({
      where: { email: 'operador@daplace.pe' },
    });
    assert.ok(opUser);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/internos/${opUser.id}/rol`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { rol: 'ADMINISTRADOR' },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.data.rol, 'ADMINISTRADOR');

    const checkUser = await db.prisma.user.findUnique({
      where: { id: opUser.id },
      include: { usuario: true },
    });
    assert.equal(checkUser?.rol, 'ADMINISTRADOR');
    assert.equal(checkUser?.usuario?.rol, 'ADMIN');
  });
});
