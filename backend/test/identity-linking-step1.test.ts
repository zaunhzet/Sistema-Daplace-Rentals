import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { buildApp } from '../src/app/app.js';
import { PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { seedDevUsers } from '../src/scripts/seed-dev.js';
import { seedDatabase } from '../src/scripts/seed.js';

const testDbUrl = getRequiredTestDatabaseUrl();
const TEST_JWT_SECRET = 'secreto_jwt_super_seguro_minimo_32_caracteres_para_pruebas_paso1!';
const TEST_PASSWORD = 'DaplaceDevPass2026!';

describe('Paso 1 — Vinculación de Identidades: Pruebas Obligatorias de Auditoría', () => {
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
  // PRUEBA OBLIGATORIA 1: Conservar usuarios deshabilitados
  // --------------------------------------------------------------------------
  it('1. Un usuario deshabilitado permanece deshabilitado después del seed', async () => {
    // Escenario A: Usuario preexistente con activo = false para una cuenta de los dev fixtures
    const existingDisabledUsuario = await db.prisma.usuario.create({
      data: {
        email: 'operador.dev@daplace.pe',
        nombre: 'Diego Navarro Deshabilitado',
        rol: 'OPERADOR',
        activo: false, // Deshabilitado administrativamente
      },
    });

    // Escenario B: Cuenta User preexistente deshabilitada en la tabla users
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);
    const existingDisabledUser = await db.prisma.user.create({
      data: {
        email: 'inactivo.historico@daplace.pe',
        nombre: 'Antiguo Operador Inactivo',
        cargo: 'Operador Retirado',
        rol: 'OPERADOR',
        isActive: false, // Inactivo
        passwordHash,
        usuarioId: null,
      },
    });

    // Ejecutar seed
    const result = await seedDevUsers(db.prisma, {
      defaultPassword: TEST_PASSWORD,
      allowDevSeed: true,
    });

    // Verificación A: El registro Usuario existente NO fue reactivado
    const usuarioA = await db.prisma.usuario.findUnique({
      where: { id: existingDisabledUsuario.id },
    });
    assert.ok(usuarioA);
    assert.equal(
      usuarioA.activo,
      false,
      'El seed NO debe cambiar activo a true en registros Usuario deshabilitados'
    );

    // Verificación B: La reconciliación de User inactivo conserva activo = false al crear/vincular Usuario
    const usuarioB = await db.prisma.usuario.findUnique({
      where: { email: 'inactivo.historico@daplace.pe' },
    });
    assert.ok(usuarioB, 'Debe crearse registro Usuario para cuenta existente en users');
    assert.equal(
      usuarioB.activo,
      false,
      'El registro Usuario reconciliado debe conservar activo = false de la cuenta User'
    );

    const userB = await db.prisma.user.findUnique({
      where: { id: existingDisabledUser.id },
    });
    assert.equal(userB?.usuarioId, usuarioB.id);
    assert.equal(userB?.isActive, false);
  });

  // --------------------------------------------------------------------------
  // PRUEBA OBLIGATORIA 2: Evitar reemplazo de vínculos existentes conflictivos
  // --------------------------------------------------------------------------
  it('2. Un vínculo usuarioId existente y conflictivo no se reemplaza', async () => {
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);

    // 1. Crear un registro Usuario legítimo existente asignado a otro ID
    const usuarioOriginal = await db.prisma.usuario.create({
      data: {
        id: 'usr-operador-original-legacy',
        email: 'operador.legitimo@daplace.pe',
        nombre: 'Diego Navarro Original',
        rol: 'OPERADOR',
        activo: true,
      },
    });

    // 2. Crear una cuenta User que ya posee un vínculo explícito hacia usuarioOriginal
    const existingUser = await db.prisma.user.create({
      data: {
        email: 'operador.dev@daplace.pe',
        nombre: 'Diego Navarro',
        cargo: 'Operador de Turno',
        rol: 'OPERADOR',
        isActive: true,
        passwordHash,
        usuarioId: usuarioOriginal.id, // Vínculo preexistente
      },
    });

    // 3. Crear también el Usuario del dev fixture con email operador.dev@daplace.pe (ID diferente)
    const nuevoUsuarioDev = await db.prisma.usuario.create({
      data: {
        id: 'usr-operador-dev-nuevo',
        email: 'operador.dev@daplace.pe',
        nombre: 'Diego Navarro Dev',
        rol: 'OPERADOR',
        activo: true,
      },
    });

    // 4. Ejecutar seedDevUsers
    const result = await seedDevUsers(db.prisma, {
      defaultPassword: TEST_PASSWORD,
      allowDevSeed: true,
    });

    // Verificaciones:
    // El seed debe detectar el conflicto y no sobreescribir el vínculo existente
    assert.equal(result.success, false, 'El resultado debe indicar conflicto (success: false)');
    const conflict = result.conflicts.find((c) => c.code === 'CONFLICT_EXISTING_LINK');
    assert.ok(conflict, 'Debe registrarse un conflicto de tipo CONFLICT_EXISTING_LINK');
    assert.equal(conflict?.email, 'operador.dev@daplace.pe');
    assert.equal(conflict?.existingUsuarioId, usuarioOriginal.id);
    assert.equal(conflict?.targetUsuarioId, nuevoUsuarioDev.id);

    // Verificar que la base de datos conserva intacto el vínculo previo
    const userInDb = await db.prisma.user.findUnique({
      where: { id: existingUser.id },
    });
    assert.equal(
      userInDb?.usuarioId,
      usuarioOriginal.id,
      'El usuarioId del registro User NO debe ser sobreescrito'
    );
  });

  // --------------------------------------------------------------------------
  // PRUEBA OBLIGATORIA 3: Evitar corrección silenciosa de roles conflictivos
  // y GARANTIZAR que no se crean registros parciales ni usuarios huérfanos
  // --------------------------------------------------------------------------
  it('3. Un conflicto de roles no se corrige silenciosamente ni crea registros parciales u huérfanos', async () => {
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);

    // --- Caso 3.1: Usuario existe previamente con rol incompatible; User NO existe ---
    // El seed debe reportar conflicto y NO debe crear ningún User activo sin vincular
    const usuarioPropietario = await db.prisma.usuario.create({
      data: {
        email: 'operador.dev@daplace.pe',
        nombre: 'Diego Navarro Conflicto',
        rol: 'PROPIETARIO', // Incompatible con devUser OPERADOR
        activo: true,
      },
    });

    const result1 = await seedDevUsers(db.prisma, {
      defaultPassword: TEST_PASSWORD,
      allowDevSeed: true,
    });

    assert.equal(result1.success, false, 'Debe reportar conflicto');
    const conflict1 = result1.conflicts.find((c) => c.code === 'CONFLICT_ROLE_MISMATCH' && c.email === 'operador.dev@daplace.pe');
    assert.ok(conflict1, 'Debe registrar CONFLICT_ROLE_MISMATCH');

    // Comprobación crítica: NO se creó ningún registro User activo sin vincular
    const userNoCreado = await db.prisma.user.findUnique({
      where: { email: 'operador.dev@daplace.pe' },
    });
    assert.equal(
      userNoCreado,
      null,
      'Bajo conflicto de roles, NO se debe crear un registro User activo sin vincular'
    );

    // Usuario original permanece intacto
    const usuarioIntacto = await db.prisma.usuario.findUnique({
      where: { id: usuarioPropietario.id },
    });
    assert.equal(usuarioIntacto?.rol, 'PROPIETARIO');

    // --- Caso 3.2: User existe previamente con rol incompatible; Usuario NO existe ---
    // Limpiamos y preparamos el segundo caso
    await safeResetTestDatabase(testDbUrl);

    const userOperador = await db.prisma.user.create({
      data: {
        email: 'propietario.dev@daplace.pe',
        nombre: 'Carlos Echevarría Incompatible',
        cargo: 'Operador Erróneo',
        rol: 'OPERADOR', // Incompatible con devUser PROPIETARIO
        isActive: true,
        passwordHash,
        usuarioId: null,
      },
    });

    const result2 = await seedDevUsers(db.prisma, {
      defaultPassword: TEST_PASSWORD,
      allowDevSeed: true,
    });

    assert.equal(result2.success, false, 'Debe reportar conflicto');
    const conflict2 = result2.conflicts.find((c) => c.code === 'CONFLICT_ROLE_MISMATCH' && c.email === 'propietario.dev@daplace.pe');
    assert.ok(conflict2, 'Debe registrar CONFLICT_ROLE_MISMATCH');

    // Comprobación crítica: NO se creó ningún Usuario huérfano en base de datos
    const usuarioHuerfano = await db.prisma.usuario.findUnique({
      where: { email: 'propietario.dev@daplace.pe' },
    });
    assert.equal(
      usuarioHuerfano,
      null,
      'Bajo conflicto de roles, NO se debe crear un registro Usuario huérfano'
    );

    // El User original no fue modificado silenciosamente
    const userOriginal = await db.prisma.user.findUnique({
      where: { id: userOperador.id },
    });
    assert.equal(userOriginal?.rol, 'OPERADOR');
    assert.equal(userOriginal?.usuarioId, null);

    // --- Caso 3.3: Conflicto de unicidad 1:1 ---
    await safeResetTestDatabase(testDbUrl);

    // Usuario del dev fixture admin.dev@daplace.pe ya está asignado a otra cuenta
    const adminUsuario = await db.prisma.usuario.create({
      data: {
        email: 'admin.dev@daplace.pe',
        nombre: 'Valeria Méndez',
        rol: 'ADMIN',
        activo: true,
      },
    });
    await db.prisma.user.create({
      data: {
        email: 'otro.admin@daplace.pe',
        nombre: 'Otro Admin',
        cargo: 'Admin Secundario',
        rol: 'ADMINISTRADOR',
        isActive: true,
        passwordHash,
        usuarioId: adminUsuario.id, // Ya acapara el usuarioId
      },
    });

    const result3 = await seedDevUsers(db.prisma, {
      defaultPassword: TEST_PASSWORD,
      allowDevSeed: true,
    });

    assert.equal(result3.success, false);
    const conflict3 = result3.conflicts.find((c) => c.code === 'CONFLICT_USER_ALREADY_LINKED' && c.email === 'admin.dev@daplace.pe');
    assert.ok(conflict3);

    // No se debe crear admin.dev@daplace.pe como User activo sin vínculo
    const userUnlinked = await db.prisma.user.findUnique({
      where: { email: 'admin.dev@daplace.pe' },
    });
    assert.equal(userUnlinked, null, 'No debe crearse User huérfano ante conflicto de unicidad');
  });

  // --------------------------------------------------------------------------
  // PRUEBA OBLIGATORIA 4: Exigir usuarioId en operaciones financieras de pagos
  // --------------------------------------------------------------------------
  it('4. Una operación financiera de pagos sin usuarioId se rechaza correctamente', async () => {
    await seedDatabase(db.prisma);
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);

    // Crear cuenta OPERADOR activa sin vínculo
    await db.prisma.user.create({
      data: {
        email: 'operador.sinvinculo@daplace.pe',
        nombre: 'Operador Sin Vinculo',
        cargo: 'Operador Temporal',
        rol: 'OPERADOR',
        isActive: true,
        passwordHash,
        usuarioId: null,
      },
    });

    // Iniciar sesión
    const loginOpRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'operador.sinvinculo@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(loginOpRes.statusCode, 200);
    const opToken = loginOpRes.json().accessToken;

    // POST /api/pagos sin usuarioId
    const pagoRes = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      headers: { authorization: `Bearer ${opToken}` },
      payload: {
        reservaId: 'res-01',
        importe: '300.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'OP-RECHAZO-SIN-VINCULO-01',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-key-rechazo-sin-vinculo-01',
      },
    });

    assert.equal(pagoRes.statusCode, 403);
    assert.equal(pagoRes.json().error.code, 'DOMAIN_IDENTITY_REQUIRED');
  });

  // --------------------------------------------------------------------------
  // PRUEBA OBLIGATORIA 5: Invocación directa a seedDevUsers() respeta restricciones
  // --------------------------------------------------------------------------
  it('5. Una invocación directa a seedDevUsers() respeta las restricciones de seguridad', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalAllowDev = process.env.ALLOW_DEV_SEED;

    try {
      // 5.1 Bloqueo en producción
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_DEV_SEED;

      await assert.rejects(
        async () => {
          await seedDevUsers(db.prisma, { defaultPassword: TEST_PASSWORD, allowDevSeed: true });
        },
        /producción/i,
        'seedDevUsers debe lanzar excepción inmediata si NODE_ENV es production'
      );

      // 5.2 Bloqueo si ALLOW_DEV_SEED no está habilitado
      process.env.NODE_ENV = 'test';
      delete process.env.ALLOW_DEV_SEED;

      await assert.rejects(
        async () => {
          await seedDevUsers(db.prisma, { defaultPassword: TEST_PASSWORD });
        },
        /ALLOW_DEV_SEED/i,
        'seedDevUsers debe rechazar invocación sin autorización explícita de desarrollo'
      );

      // 5.3 Éxito con allowDevSeed explícito
      const okResult = await seedDevUsers(db.prisma, {
        defaultPassword: TEST_PASSWORD,
        allowDevSeed: true,
      });
      assert.equal(typeof okResult.success, 'boolean');
      assert.ok(Array.isArray(okResult.linked));
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalAllowDev !== undefined) {
        process.env.ALLOW_DEV_SEED = originalAllowDev;
      } else {
        delete process.env.ALLOW_DEV_SEED;
      }
    }
  });

  // --------------------------------------------------------------------------
  // PRUEBA OBLIGATORIA 6: Ejecución con conflictos no informa éxito total
  // --------------------------------------------------------------------------
  it('6. Una ejecución con conflictos no informa éxito total', async () => {
    await db.prisma.usuario.create({
      data: {
        email: 'propietario.dev@daplace.pe',
        nombre: 'Carlos Echevarría Incompatible',
        rol: 'ADMIN', // Conflicto: fixture espera PROPIETARIO
        activo: true,
      },
    });

    const result = await seedDevUsers(db.prisma, {
      defaultPassword: TEST_PASSWORD,
      allowDevSeed: true,
    });

    assert.equal(result.success, false, 'result.success debe ser false cuando se detectan conflictos');
    assert.ok(result.conflicts.length > 0, 'result.conflicts debe contener los detalles');
    const conflict = result.conflicts[0];
    assert.ok(conflict.email);
    assert.ok(conflict.code);
    assert.ok(conflict.message);
  });

  // --------------------------------------------------------------------------
  // PRUEBA OBLIGATORIA 7: Flujo de pagos login -> registrar pago -> conciliar pago
  // --------------------------------------------------------------------------
  it('7. El flujo que ya funciona, login → registrar pago → conciliar pago, no presenta regresiones', async () => {
    await seedDatabase(db.prisma);
    const seedResult = await seedDevUsers(db.prisma, {
      defaultPassword: TEST_PASSWORD,
      allowDevSeed: true,
    });
    assert.equal(seedResult.success, true);

    // Login Operador
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'operador.dev@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(loginRes.statusCode, 200);
    const opToken = loginRes.json().accessToken;

    const operadorUsuario = await db.prisma.usuario.findUnique({
      where: { email: 'operador.dev@daplace.pe' },
    });
    assert.ok(operadorUsuario);

    // Registrar pago
    const pagoRes = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      headers: { authorization: `Bearer ${opToken}` },
      payload: {
        reservaId: 'res-01',
        importe: '450.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'OP-DEV-TEST-9901',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-key-dev-login-pago-01',
      },
    });
    assert.equal(pagoRes.statusCode, 201);
    const pagoId = pagoRes.json().data.id;

    // Verificar FK registradoPorId en DB
    const pagoDb = await db.prisma.pago.findUnique({
      where: { id: pagoId },
      include: { registradoPor: true },
    });
    assert.equal(pagoDb?.registradoPorId, operadorUsuario.id);
    assert.equal(pagoDb?.registradoPor?.email, 'operador.dev@daplace.pe');

    // Login Admin y conciliar
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin.dev@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(adminLoginRes.statusCode, 200);
    const adminToken = adminLoginRes.json().accessToken;

    const adminUsuario = await db.prisma.usuario.findUnique({
      where: { email: 'admin.dev@daplace.pe' },
    });
    assert.ok(adminUsuario);

    const conciliarRes = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/conciliar`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { referencia: 'OP-DEV-TEST-9901-CONCILIADA' },
    });
    assert.equal(conciliarRes.statusCode, 200);

    const pagoConciliado = await db.prisma.pago.findUnique({
      where: { id: pagoId },
    });
    assert.equal(pagoConciliado?.estado, 'CONCILIADO');
    assert.equal(pagoConciliado?.conciliadoPorId, adminUsuario.id);
  });

  // --------------------------------------------------------------------------
  // NUEVA PRUEBA 8: Módulo de Gastos (expenses.ts)
  // Vinculados, sin vínculo y operaciones no autorizadas
  // --------------------------------------------------------------------------
  it('8. Módulo de Gastos: operaciones de escritura exigen usuarioId y rechazan usuarios no vinculados', async () => {
    await seedDatabase(db.prisma);
    await seedDevUsers(db.prisma, { defaultPassword: TEST_PASSWORD, allowDevSeed: true });
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);

    // 8.1 Login de Operador VINCULADO (tiene usuarioId válido)
    const opLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'operador.dev@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(opLoginRes.statusCode, 200);
    const opToken = opLoginRes.json().accessToken;
    const opUsuarioId = opLoginRes.json().user.usuarioId;
    assert.ok(opUsuarioId, 'El operador vinculado debe tener usuarioId');

    // 8.2 Registrar Gasto con usuario vinculado
    const gastoPayload = {
      propiedadId: 'prop-01',
      fechaGasto: '2026-10-30',
      periodoMes: 10,
      periodoAnio: 2026,
      titulo: 'Mantenimiento Preventivo A/C',
      categoria: 'MANTENIMIENTO',
      monto: '180.50',
      moneda: 'PEN',
      pagadoPor: 'OPERADOR',
      idempotencyKey: 'idem-gasto-vinculado-01',
      sustentos: [
        {
          nombreArchivo: 'recibo_ac.pdf',
          url: 'https://storage.daplace.pe/recibo_ac.pdf',
          tipo: 'COMPROBANTE',
        },
      ],
    };

    const gastoRes = await app.inject({
      method: 'POST',
      url: '/api/gastos',
      headers: { authorization: `Bearer ${opToken}` },
      payload: gastoPayload,
    });
    assert.equal(gastoRes.statusCode, 201, `Error al registrar gasto: ${gastoRes.payload}`);
    const gastoCreado = gastoRes.json().data;

    // Verificar en PostgreSQL: registradoPorId en Gasto y en SustentoGasto apuntan a Usuario.id
    const gastoDb = await db.prisma.gasto.findUnique({
      where: { id: gastoCreado.id },
      include: { registradoPor: true, sustentos: { include: { registradoPor: true } } },
    });
    assert.ok(gastoDb);
    assert.equal(gastoDb.registradoPorId, opUsuarioId, 'registradoPorId del gasto debe ser el usuarioId del operador');
    assert.equal(gastoDb.sustentos[0].registradoPorId, opUsuarioId, 'registradoPorId del sustento debe ser el usuarioId');

    // 8.3 Adjuntar nuevo sustento posterior con usuario vinculado
    const sustentoRes = await app.inject({
      method: 'POST',
      url: `/api/gastos/${gastoCreado.id}/sustentos`,
      headers: { authorization: `Bearer ${opToken}` },
      payload: {
        nombreArchivo: 'adicional_voucher.pdf',
        url: 'https://storage.daplace.pe/adicional_voucher.pdf',
        tipo: 'VOUCHER',
      },
    });
    assert.equal(sustentoRes.statusCode, 201);
    const sustentoDb = await db.prisma.sustentoGasto.findUnique({
      where: { id: sustentoRes.json().data.id },
    });
    assert.equal(sustentoDb?.registradoPorId, opUsuarioId);

    // 8.4 Anular gasto con usuario vinculado
    const anularRes = await app.inject({
      method: 'POST',
      url: `/api/gastos/${gastoCreado.id}/anular`,
      headers: { authorization: `Bearer ${opToken}` },
      payload: { motivo: 'Error en la cotización inicial' },
    });
    assert.equal(anularRes.statusCode, 200);
    const gastoAnuladoDb = await db.prisma.gasto.findUnique({ where: { id: gastoCreado.id } });
    assert.equal(gastoAnuladoDb?.estado, 'ANULADO');
    assert.equal(gastoAnuladoDb?.anuladoPorId, opUsuarioId, 'anuladoPorId debe ser el usuarioId del operador');

    // 8.5 Crear usuario OPERADOR SIN VÍNCULO (usuarioId = null)
    await db.prisma.user.create({
      data: {
        email: 'operador.desvinculado@daplace.pe',
        nombre: 'Operador Desvinculado',
        cargo: 'Operador',
        rol: 'OPERADOR',
        isActive: true,
        passwordHash,
        usuarioId: null,
      },
    });
    const unlinkedLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'operador.desvinculado@daplace.pe', password: TEST_PASSWORD },
    });
    const unlinkedToken = unlinkedLoginRes.json().accessToken;

    // Rechazo en POST /api/gastos sin usuarioId
    const gastoRechazado = await app.inject({
      method: 'POST',
      url: '/api/gastos',
      headers: { authorization: `Bearer ${unlinkedToken}` },
      payload: {
        propiedadId: 'prop-01',
        fechaGasto: '2026-10-30',
        periodoMes: 10,
        periodoAnio: 2026,
        titulo: 'Gasto Sin Vinculo',
        categoria: 'SERVICIOS',
        monto: '50.00',
        moneda: 'PEN',
        pagadoPor: 'OPERADOR',
        idempotencyKey: 'idem-gasto-sin-vinculo',
      },
    });
    assert.equal(gastoRechazado.statusCode, 403);
    assert.equal(gastoRechazado.json().error.code, 'DOMAIN_IDENTITY_REQUIRED');

    // Rechazo en POST /api/gastos/:id/sustentos sin usuarioId
    const sustentoRechazado = await app.inject({
      method: 'POST',
      url: `/api/gastos/${gastoCreado.id}/sustentos`,
      headers: { authorization: `Bearer ${unlinkedToken}` },
      payload: { nombreArchivo: 'x.pdf', url: 'https://storage.daplace.pe/x.pdf' },
    });
    assert.equal(sustentoRechazado.statusCode, 403);
    assert.equal(sustentoRechazado.json().error.code, 'DOMAIN_IDENTITY_REQUIRED');

    // Rechazo en POST /api/gastos/:id/anular sin usuarioId
    const anularRechazado = await app.inject({
      method: 'POST',
      url: `/api/gastos/${gastoCreado.id}/anular`,
      headers: { authorization: `Bearer ${unlinkedToken}` },
      payload: { motivo: 'Intento sin vinculo' },
    });
    assert.equal(anularRechazado.statusCode, 403);
    assert.equal(anularRechazado.json().error.code, 'DOMAIN_IDENTITY_REQUIRED');

    // 8.6 Operaciones no autorizadas
    // Sin token: HTTP 401
    const unauthRes = await app.inject({
      method: 'POST',
      url: '/api/gastos',
      payload: gastoPayload,
    });
    assert.equal(unauthRes.statusCode, 401);

    // Con rol CLIENTE: HTTP 403 FORBIDDEN
    const clienteLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'cliente.dev@daplace.pe', password: TEST_PASSWORD },
    });
    const clienteToken = clienteLoginRes.json().accessToken;
    const clienteForbidden = await app.inject({
      method: 'POST',
      url: '/api/gastos',
      headers: { authorization: `Bearer ${clienteToken}` },
      payload: gastoPayload,
    });
    assert.equal(clienteForbidden.statusCode, 403);
    assert.equal(clienteForbidden.json().error.code, 'FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // NUEVA PRUEBA 9: Módulo de Garantías (guarantees.ts)
  // Vinculados, sin vínculo y operaciones no autorizadas
  // --------------------------------------------------------------------------
  it('9. Módulo de Garantías: operaciones de escritura exigen usuarioId y rechazan usuarios no vinculados', async () => {
    await seedDatabase(db.prisma);
    await seedDevUsers(db.prisma, { defaultPassword: TEST_PASSWORD, allowDevSeed: true });
    const passwordHash = await AuthService.hashPassword(TEST_PASSWORD);

    // 9.1 Login de Operador VINCULADO
    const opLoginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'operador.dev@daplace.pe', password: TEST_PASSWORD },
    });
    assert.equal(opLoginRes.statusCode, 200);
    const opToken = opLoginRes.json().accessToken;
    const opUsuarioId = opLoginRes.json().user.usuarioId;
    assert.ok(opUsuarioId);

    // Usar reserva fresca sin garantía (res-03 en el seed sintético no tiene garantía)
    const reservaSinGarantia = await db.prisma.reserva.findFirst({
      where: { garantia: null },
    });
    assert.ok(reservaSinGarantia, 'Debe existir una reserva sin garantía');

    // 9.2 Registrar Garantía inicial con usuario vinculado
    const garantiaRes = await app.inject({
      method: 'POST',
      url: '/api/garantias',
      headers: { authorization: `Bearer ${opToken}` },
      payload: {
        reservaId: reservaSinGarantia.id,
        importe: '600.00',
        moneda: 'PEN',
        motivo: 'Depósito de garantía verificado por operador',
        idempotencyKey: 'idem-garantia-vinculada-01',
      },
    });
    assert.equal(garantiaRes.statusCode, 201, `Error al crear garantía: ${garantiaRes.payload}`);
    const garantiaCreada = garantiaRes.json().data;

    // Verificar en PostgreSQL que actorId en MovimientoGarantia apunta exactamente a Usuario.id
    const movDb = await db.prisma.movimientoGarantia.findFirst({
      where: { garantiaId: garantiaCreada.id, tipo: 'RECEPCION' },
      include: { actor: true },
    });
    assert.ok(movDb);
    assert.equal(movDb.actorId, opUsuarioId, 'actorId en MovimientoGarantia debe ser el usuarioId del operador');
    assert.equal(movDb.actor?.email, 'operador.dev@daplace.pe');

    // 9.3 Registrar movimiento de garantía (RETENCION) con usuario vinculado
    const movRes = await app.inject({
      method: 'POST',
      url: `/api/garantias/${garantiaCreada.id}/movimientos`,
      headers: { authorization: `Bearer ${opToken}` },
      payload: {
        tipo: 'RETENCION',
        importe: '150.00',
        motivo: 'Retención por daño menor en inventario',
        idempotencyKey: 'idem-mov-garantia-vinculada-02',
      },
    });
    assert.equal(movRes.statusCode, 201, `Error al registrar movimiento: ${movRes.payload}`);
    const retencionDb = await db.prisma.movimientoGarantia.findUnique({
      where: { idempotencyKey: 'idem-mov-garantia-vinculada-02' },
    });
    assert.equal(retencionDb?.actorId, opUsuarioId);

    // 9.4 Operador SIN VÍNCULO
    await db.prisma.user.create({
      data: {
        email: 'operador.nogarantiaink@daplace.pe',
        nombre: 'Operador Sin Garantia Link',
        cargo: 'Operador',
        rol: 'OPERADOR',
        isActive: true,
        passwordHash,
        usuarioId: null,
      },
    });
    const unlinkedLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'operador.nogarantiaink@daplace.pe', password: TEST_PASSWORD },
    });
    const unlinkedToken = unlinkedLogin.json().accessToken;

    // Rechazo en POST /api/reservas/:id/garantia sin usuarioId
    const reserva2 = await db.prisma.reserva.findFirst({
      where: { id: { not: reservaSinGarantia.id }, garantia: null },
    });
    assert.ok(reserva2);

    const garantiaRechazada = await app.inject({
      method: 'POST',
      url: '/api/garantias',
      headers: { authorization: `Bearer ${unlinkedToken}` },
      payload: {
        reservaId: reserva2.id,
        importe: '400.00',
        moneda: 'PEN',
      },
    });
    assert.equal(garantiaRechazada.statusCode, 403);
    assert.equal(garantiaRechazada.json().error.code, 'DOMAIN_IDENTITY_REQUIRED');

    // Rechazo en POST /api/garantias/:id/movimientos sin usuarioId
    const movRechazado = await app.inject({
      method: 'POST',
      url: `/api/garantias/${garantiaCreada.id}/movimientos`,
      headers: { authorization: `Bearer ${unlinkedToken}` },
      payload: {
        tipo: 'RETENCION',
        importe: '50.00',
        motivo: 'Intento sin vinculo',
      },
    });
    assert.equal(movRechazado.statusCode, 403);
    assert.equal(movRechazado.json().error.code, 'DOMAIN_IDENTITY_REQUIRED');

    // 9.5 Operaciones no autorizadas
    // Sin autenticación: HTTP 401
    const unauthGarantia = await app.inject({
      method: 'POST',
      url: '/api/garantias',
      payload: { reservaId: reserva2.id, importe: '500.00', moneda: 'PEN' },
    });
    assert.equal(unauthGarantia.statusCode, 401);

    // Con rol CLIENTE: HTTP 403 FORBIDDEN
    const clienteLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'cliente.dev@daplace.pe', password: TEST_PASSWORD },
    });
    const clienteToken = clienteLogin.json().accessToken;
    const clienteForbidden = await app.inject({
      method: 'POST',
      url: '/api/garantias',
      headers: { authorization: `Bearer ${clienteToken}` },
      payload: { reservaId: reserva2.id, importe: '500.00', moneda: 'PEN' },
    });
    assert.equal(clienteForbidden.statusCode, 403);
    assert.equal(clienteForbidden.json().error.code, 'FORBIDDEN');
  });

  // --------------------------------------------------------------------------
  // PRUEBA COMPLEMENTARIA: Idempotencia en ejecuciones repetidas
  // --------------------------------------------------------------------------
  it('10. Idempotencia: ejecuciones repetidas no generan duplicados ni inconsistencias', async () => {
    const res1 = await seedDevUsers(db.prisma, { defaultPassword: TEST_PASSWORD, allowDevSeed: true });
    assert.equal(res1.success, true);
    const countUsers1 = await db.prisma.user.count();
    const countUsuarios1 = await db.prisma.usuario.count();

    const res2 = await seedDevUsers(db.prisma, { defaultPassword: TEST_PASSWORD, allowDevSeed: true });
    assert.equal(res2.success, true);
    const countUsers2 = await db.prisma.user.count();
    const countUsuarios2 = await db.prisma.usuario.count();

    assert.equal(countUsers1, countUsers2, 'No deben crearse usuarios User duplicados');
    assert.equal(countUsuarios1, countUsuarios2, 'No deben crearse usuarios Usuario duplicados');

    const admin = await db.prisma.user.findUnique({ where: { email: 'admin.dev@daplace.pe' } });
    assert.ok(admin?.usuarioId);
  });
});
