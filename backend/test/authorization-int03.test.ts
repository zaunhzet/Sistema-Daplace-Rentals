import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { buildApp } from '../src/app/app.js';
import { PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const testDbUrl = getRequiredTestDatabaseUrl();
const TEST_JWT_SECRET = 'secreto_jwt_super_seguro_para_pruebas_de_autorizacion_int03!';

describe('Gate INT-03 — Matriz de Autorización, Control de Acceso y Aislamiento por Propiedad', () => {
  let db: ReturnType<typeof createDatabase>;
  let repository: PrismaAuthRepository;
  let app: ReturnType<typeof buildApp>;

  let adminToken: string;
  let operadorToken: string;
  let propietario1Token: string;
  let propietario2Token: string;
  let clienteToken: string;

  let prop1Id: string;
  let prop2Id: string;
  let reservaId: string;

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

    const passwordHash = await AuthService.hashPassword('PassSecure2026!');

    // 1. Crear usuarios transaccionales y de autenticación
    const usuarioAdmin = await db.prisma.usuario.create({
      data: { id: 'usr-admin-trans', nombre: 'Admin Sistema', email: 'admin@daplace.pe', rol: 'ADMIN' },
    });
    const userAdmin = await repository.createUser({
      email: 'admin@daplace.pe',
      passwordHash,
      nombre: 'Admin Sistema',
      rol: 'ADMINISTRADOR',
      usuarioId: usuarioAdmin.id,
    });

    const usuarioOperador = await db.prisma.usuario.create({
      data: { id: 'usr-operador-trans', nombre: 'Operador Turno', email: 'operador@daplace.pe', rol: 'OPERADOR' },
    });
    const userOperador = await repository.createUser({
      email: 'operador@daplace.pe',
      passwordHash,
      nombre: 'Operador Turno',
      rol: 'OPERADOR',
      usuarioId: usuarioOperador.id,
    });

    const usuarioProp1 = await db.prisma.usuario.create({
      data: { id: 'usr-prop1-trans', nombre: 'Propietario Uno', email: 'prop1@daplace.pe', rol: 'PROPIETARIO' },
    });
    const userProp1 = await repository.createUser({
      email: 'prop1@daplace.pe',
      passwordHash,
      nombre: 'Propietario Uno',
      rol: 'PROPIETARIO',
      usuarioId: usuarioProp1.id,
    });

    const usuarioProp2 = await db.prisma.usuario.create({
      data: { id: 'usr-prop2-trans', nombre: 'Propietario Dos', email: 'prop2@daplace.pe', rol: 'PROPIETARIO' },
    });
    const userProp2 = await repository.createUser({
      email: 'prop2@daplace.pe',
      passwordHash,
      nombre: 'Propietario Dos',
      rol: 'PROPIETARIO',
      usuarioId: usuarioProp2.id,
    });

    const userCliente = await repository.createUser({
      email: 'cliente@daplace.pe',
      passwordHash,
      nombre: 'Cliente Web',
      rol: 'CLIENTE',
    });

    // 2. Crear Propiedades
    const p1 = await db.prisma.propiedad.create({
      data: {
        id: 'prop-autorizacion-1',
        nombre: 'Penthouse Miraflores Malecón',
        propietarioId: usuarioProp1.id,
        direccion: 'Malecón de la Reserva 100',
        precioBaseNoche: 350.0,
      },
    });
    prop1Id = p1.id;

    const p2 = await db.prisma.propiedad.create({
      data: {
        id: 'prop-autorizacion-2',
        nombre: 'Loft Barranco Artes',
        propietarioId: usuarioProp2.id,
        direccion: 'Av. Pedro de Osma 200',
        precioBaseNoche: 280.0,
      },
    });
    prop2Id = p2.id;

    // 3. Crear Huésped y Reserva en Propiedad 1
    const huesped = await db.prisma.huesped.create({
      data: {
        id: 'huesped-int03-1',
        nombreCompleto: 'Huésped Internacional',
        email: 'guest@example.com',
      },
    });

    const reserva = await db.prisma.reserva.create({
      data: {
        id: 'res-int03-1',
        propiedadId: prop1Id,
        huespedId: huesped.id,
        ingreso: new Date('2026-11-10T00:00:00.000Z'),
        salida: new Date('2026-11-15T00:00:00.000Z'),
        noches: 5,
        montoAcordado: 1750.0,
        estado: 'SOLICITADA',
      },
    });
    reservaId = reserva.id;

    // 4. Obtener tokens JWT para cada rol
    const authService = new AuthService(repository, {
      signAccessToken: (payload) => app.jwt.sign(payload),
    });

    const resAdmin = await authService.login({ email: 'admin@daplace.pe', password: 'PassSecure2026!' });
    adminToken = resAdmin.accessToken;

    const resOperador = await authService.login({ email: 'operador@daplace.pe', password: 'PassSecure2026!' });
    operadorToken = resOperador.accessToken;

    const resProp1 = await authService.login({ email: 'prop1@daplace.pe', password: 'PassSecure2026!' });
    propietario1Token = resProp1.accessToken;

    const resProp2 = await authService.login({ email: 'prop2@daplace.pe', password: 'PassSecure2026!' });
    propietario2Token = resProp2.accessToken;

    const resCliente = await authService.login({ email: 'cliente@daplace.pe', password: 'PassSecure2026!' });
    clienteToken = resCliente.accessToken;
  });

  after(async () => {
    await app.close();
    await db.close();
  });

  it('1. Usuario no autenticado (sin Authorization): recibe HTTP 401 en endpoints administrativos', async () => {
    const resPagos = await app.inject({ method: 'GET', url: '/api/pagos' });
    assert.equal(resPagos.statusCode, 401);

    const resReservas = await app.inject({ method: 'GET', url: '/api/reservas' });
    assert.equal(resReservas.statusCode, 401);

    const resGarantias = await app.inject({ method: 'GET', url: '/api/garantias' });
    assert.equal(resGarantias.statusCode, 401);
  });

  it('2. Rol CLIENTE no tiene privilegios operativos: recibe HTTP 403 en pagos, reservas y propiedades', async () => {
    const resPagos = await app.inject({
      method: 'GET',
      url: '/api/pagos',
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    assert.equal(resPagos.statusCode, 403);

    const resReservas = await app.inject({
      method: 'GET',
      url: '/api/reservas',
      headers: { authorization: `Bearer ${clienteToken}` },
    });
    assert.equal(resReservas.statusCode, 403);
  });

  it('3. Aislamiento estricto de Propietario: solo accede a su propia propiedad y recibe 403 en propiedad ajena', async () => {
    // Propietario 1 consulta su propiedad (prop1Id) -> 200 OK
    const resPropia = await app.inject({
      method: 'GET',
      url: `/api/propiedades/${prop1Id}`,
      headers: { authorization: `Bearer ${propietario1Token}` },
    });
    assert.equal(resPropia.statusCode, 200);

    // Propietario 1 intenta consultar la propiedad de Propietario 2 (prop2Id) -> 403 FORBIDDEN
    const resAjena = await app.inject({
      method: 'GET',
      url: `/api/propiedades/${prop2Id}`,
      headers: { authorization: `Bearer ${propietario1Token}` },
    });
    assert.equal(resAjena.statusCode, 403);
    const bodyAjena = JSON.parse(resAjena.payload);
    assert.equal(bodyAjena.error.code, 'FORBIDDEN');
  });

  it('4. Propietario listando propiedades solo recibe las que le pertenecen', async () => {
    const resLista = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${propietario1Token}` },
    });
    assert.equal(resLista.statusCode, 200);
    const bodyLista = JSON.parse(resLista.payload);
    assert.ok(Array.isArray(bodyLista));
    assert.equal(bodyLista.length, 1);
    assert.equal(bodyLista[0].id, prop1Id);
  });

  it('5. Administrador y Operador tienen acceso a la gestión de reservas y pagos', async () => {
    const resAdmin = await app.inject({
      method: 'GET',
      url: '/api/reservas',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(resAdmin.statusCode, 200);

    const resOperador = await app.inject({
      method: 'GET',
      url: '/api/reservas',
      headers: { authorization: `Bearer ${operadorToken}` },
    });
    assert.equal(resOperador.statusCode, 200);
  });

  it('6. Propietario NO tiene autorización para listar ni operar pagos globales (HTTP 403)', async () => {
    const resPagosProp = await app.inject({
      method: 'GET',
      url: '/api/pagos',
      headers: { authorization: `Bearer ${propietario1Token}` },
    });
    assert.equal(resPagosProp.statusCode, 403);
  });

  it('7. Cuenta PROPIETARIO activa sin usuarioId transaccional: denegada con 403 DOMAIN_IDENTITY_REQUIRED en dominio', async () => {
    const passwordHash = await AuthService.hashPassword('PassSecure2026!');
    // Usuario de autenticación activo con rol PROPIETARIO pero sin vínculo transaccional (usuarioId: null)
    await repository.createUser({
      email: 'propietario.huerfano@daplace.pe',
      passwordHash,
      nombre: 'Propietario Sin Entidad',
      rol: 'PROPIETARIO',
      usuarioId: null,
    });

    const authService = new AuthService(repository, {
      signAccessToken: (payload) => app.jwt.sign(payload),
    });
    const loginResult = await authService.login({
      email: 'propietario.huerfano@daplace.pe',
      password: 'PassSecure2026!',
    });
    const huerfanoToken = loginResult.accessToken;

    // 1. Intento de listar propiedades
    const resList = await app.inject({
      method: 'GET',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${huerfanoToken}` },
    });
    assert.equal(resList.statusCode, 403);
    const bodyList = JSON.parse(resList.payload);
    assert.equal(bodyList.error.code, 'DOMAIN_IDENTITY_REQUIRED');

    // 2. Intento de consultar propiedad por ID
    const resDetail = await app.inject({
      method: 'GET',
      url: `/api/propiedades/${prop1Id}`,
      headers: { authorization: `Bearer ${huerfanoToken}` },
    });
    assert.equal(resDetail.statusCode, 403);
    const bodyDetail = JSON.parse(resDetail.payload);
    assert.equal(bodyDetail.error.code, 'DOMAIN_IDENTITY_REQUIRED');

    // 3. Intento de consultar calendario
    const resCal = await app.inject({
      method: 'GET',
      url: `/api/calendario?propiedadId=${prop1Id}&month=11&year=2026`,
      headers: { authorization: `Bearer ${huerfanoToken}` },
    });
    assert.equal(resCal.statusCode, 403);
    const bodyCal = JSON.parse(resCal.payload);
    assert.equal(bodyCal.error.code, 'DOMAIN_IDENTITY_REQUIRED');
  });

  it('8. Propietario no puede registrar, editar ni desactivar propiedades (HTTP 403)', async () => {
    // Intentar crear propiedad
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${propietario1Token}` },
      payload: {
        nombre: 'Intento Propietario',
        direccion: 'Av. Ilegal 123',
        propietarioId: 'usr-prop1-trans',
      },
    });
    assert.equal(resCreate.statusCode, 403);

    // Intentar editar propiedad
    const resUpdate = await app.inject({
      method: 'PATCH',
      url: `/api/propiedades/${prop1Id}`,
      headers: { authorization: `Bearer ${propietario1Token}` },
      payload: { nombre: 'Nombre Hackeado' },
    });
    assert.equal(resUpdate.statusCode, 403);

    // Intentar cambiar estado activo
    const resToggle = await app.inject({
      method: 'PATCH',
      url: `/api/propiedades/${prop1Id}/activa`,
      headers: { authorization: `Bearer ${propietario1Token}` },
      payload: { activa: false },
    });
    assert.equal(resToggle.statusCode, 403);
  });

  it('9. Propietario no puede consultar ni registrar en el catálogo /api/propietarios (HTTP 403)', async () => {
    const resGet = await app.inject({
      method: 'GET',
      url: '/api/propietarios',
      headers: { authorization: `Bearer ${propietario1Token}` },
    });
    assert.equal(resGet.statusCode, 403);

    const resPost = await app.inject({
      method: 'POST',
      url: '/api/propietarios',
      headers: { authorization: `Bearer ${propietario1Token}` },
      payload: { nombre: 'Otro', email: 'otro@daplace.pe' },
    });
    assert.equal(resPost.statusCode, 403);
  });

  it('10. Usuario con rol ADMINISTRADOR u OPERADOR pero sin identidad de dominio recibe HTTP 403 DOMAIN_IDENTITY_REQUIRED en POST /api/propietarios', async () => {
    // Crear usuario admin de autenticación huérfano (sin usuarioId en dominio)
    const passwordHash = await AuthService.hashPassword('AdminHuerfano2026!');
    await repository.createUser({
      email: 'admin.huerfano@daplace.pe',
      passwordHash,
      nombre: 'Admin Sin Dominio',
      rol: 'ADMINISTRADOR',
      usuarioId: undefined,
    });

    const authService = new AuthService(repository, {
      signAccessToken: (payload) => app.jwt.sign(payload),
    });
    const loginRes = await authService.login({
      email: 'admin.huerfano@daplace.pe',
      password: 'AdminHuerfano2026!',
    });
    const accessToken = loginRes.accessToken;

    // Intento de registrar nuevo propietario de dominio sin actor transaccional válido
    const resPost = await app.inject({
      method: 'POST',
      url: '/api/propietarios',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        nombre: 'Nuevo Propietario Rechazado',
        email: 'rechazado@daplace.pe',
      },
    });

    assert.equal(resPost.statusCode, 403);
    const bodyPost = JSON.parse(resPost.payload);
    assert.equal(bodyPost.error.code, 'DOMAIN_IDENTITY_REQUIRED');
  });

  it('11. Usuario sin identidad de dominio no puede registrar contratos de reserva (HTTP 403 DOMAIN_IDENTITY_REQUIRED)', async () => {
    const passwordHash = await AuthService.hashPassword('OpHuerfano2026!');
    await repository.createUser({
      email: 'operador.huerfano@daplace.pe',
      passwordHash,
      nombre: 'Operador Sin Dominio',
      rol: 'OPERADOR',
      usuarioId: undefined,
    });

    const authService = new AuthService(repository, {
      signAccessToken: (payload) => app.jwt.sign(payload),
    });
    const loginRes = await authService.login({
      email: 'operador.huerfano@daplace.pe',
      password: 'OpHuerfano2026!',
    });
    const accessToken = loginRes.accessToken;

    const resContract = await app.inject({
      method: 'POST',
      url: `/api/reservas/${reservaId}/contratos`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        nombreOriginal: 'contrato_arrendamiento_v1.pdf',
        urlReferencia: 'https://docs.daplace.pe/contrato-v1.pdf',
      },
    });

    assert.equal(resContract.statusCode, 403);
    const bodyContract = JSON.parse(resContract.payload);
    assert.equal(bodyContract.error.code, 'DOMAIN_IDENTITY_REQUIRED');
  });

  it('12. ADMIN sin identidad de dominio recibe 403 DOMAIN_IDENTITY_REQUIRED al registrar pago o garantía (módulos financieros)', async () => {
    const passwordHash = await AuthService.hashPassword('AdminFinHuerfano2026!');
    await repository.createUser({
      email: 'admin.fin.huerfano@daplace.pe',
      passwordHash,
      nombre: 'Admin Financiero Sin Dominio',
      rol: 'ADMINISTRADOR',
      usuarioId: undefined,
    });

    const authService = new AuthService(repository, {
      signAccessToken: (payload) => app.jwt.sign(payload),
    });
    const loginRes = await authService.login({
      email: 'admin.fin.huerfano@daplace.pe',
      password: 'AdminFinHuerfano2026!',
    });
    const accessToken = loginRes.accessToken;

    // Intento de registrar pago: debe fallar con DOMAIN_IDENTITY_REQUIRED
    const resPago = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        reservaId,
        importe: '500.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'REF-TEST-DOMAIN-12',
        fechaPago: '2026-11-01',
      },
    });
    assert.equal(resPago.statusCode, 403, `POST /api/pagos debería devolver 403, obtuvo ${resPago.statusCode}: ${resPago.payload}`);
    const bodyPago = JSON.parse(resPago.payload);
    assert.equal(bodyPago.error.code, 'DOMAIN_IDENTITY_REQUIRED');

    // Intento de registrar garantía: debe fallar con DOMAIN_IDENTITY_REQUIRED
    const resGarantia = await app.inject({
      method: 'POST',
      url: '/api/garantias',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        reservaId,
        importe: '300.00',
        moneda: 'PEN',
        metodoCustodia: 'DEPOSITO_BANCARIO',
      },
    });
    assert.equal(resGarantia.statusCode, 403, `POST /api/garantias debería devolver 403, obtuvo ${resGarantia.statusCode}: ${resGarantia.payload}`);
    const bodyGarantia = JSON.parse(resGarantia.payload);
    assert.equal(bodyGarantia.error.code, 'DOMAIN_IDENTITY_REQUIRED');
  });

  it('13. OPERADOR sin identidad de dominio recibe 403 DOMAIN_IDENTITY_REQUIRED al registrar gasto (módulo operativo)', async () => {
    const passwordHash = await AuthService.hashPassword('OpGastoHuerfano2026!');
    await repository.createUser({
      email: 'operador.gasto.huerfano@daplace.pe',
      passwordHash,
      nombre: 'Operador Gastos Sin Dominio',
      rol: 'OPERADOR',
      usuarioId: undefined,
    });

    const authService = new AuthService(repository, {
      signAccessToken: (payload) => app.jwt.sign(payload),
    });
    const loginRes = await authService.login({
      email: 'operador.gasto.huerfano@daplace.pe',
      password: 'OpGastoHuerfano2026!',
    });
    const accessToken = loginRes.accessToken;

    // Registrar propiedad para poder asociar el gasto
    const resGasto = await app.inject({
      method: 'POST',
      url: '/api/gastos',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        propiedadId: prop1Id,
        fechaGasto: '2026-11-01',
        periodoMes: 11,
        periodoAnio: 2026,
        titulo: 'Limpieza mensual',
        categoria: 'MANTENIMIENTO',
        monto: '150.00',
        moneda: 'PEN',
        pagadoPor: 'DAPLACE',
      },
    });
    assert.equal(resGasto.statusCode, 403, `POST /api/gastos debería devolver 403, obtuvo ${resGasto.statusCode}: ${resGasto.payload}`);
    const bodyGasto = JSON.parse(resGasto.payload);
    assert.equal(bodyGasto.error.code, 'DOMAIN_IDENTITY_REQUIRED');
  });

  it('14. RED: ADMIN con Usuario vinculado pero activo=false recibe 403 DOMAIN_IDENTITY_REQUIRED en escrituras transaccionales', async () => {
    // Crear usuario de dominio INACTIVO
    const usuarioInactivo = await db.prisma.usuario.create({
      data: {
        id: 'usr-inactivo-dom',
        nombre: 'Admin Dominio Inactivo',
        email: 'admin.inactivo@daplace.pe',
        rol: 'ADMIN',
        activo: false,
      },
    });

    const passwordHash = await AuthService.hashPassword('AdminInactivo2026!');
    await repository.createUser({
      email: 'admin.inactivo@daplace.pe',
      passwordHash,
      nombre: 'Admin Dominio Inactivo',
      rol: 'ADMINISTRADOR',
      usuarioId: usuarioInactivo.id, // vinculado, pero activo=false
    });

    const authService = new AuthService(repository, {
      signAccessToken: (payload) => app.jwt.sign(payload),
    });
    const loginRes = await authService.login({
      email: 'admin.inactivo@daplace.pe',
      password: 'AdminInactivo2026!',
    });
    const accessToken = loginRes.accessToken;

    // Intento de registrar pago → debe rechazar por activo=false
    const resPago = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        reservaId,
        importe: '500.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'REF-INACTIVO-14',
        fechaPago: '2026-11-01',
      },
    });
    assert.equal(resPago.statusCode, 403, `Usuario inactivo en pago: esperado 403, obtuvo ${resPago.statusCode}: ${resPago.payload}`);
    const bodyPago = JSON.parse(resPago.payload);
    assert.equal(bodyPago.error.code, 'DOMAIN_IDENTITY_REQUIRED');

    // Intento de crear reserva → debe rechazar por activo=false
    const resReserva = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        propiedadId: prop1Id,
        huespedId: 'huesped-int03-1',
        ingreso: '2026-12-01',
        salida: '2026-12-05',
        montoAcordado: '1000',
        moneda: 'PEN',
        origen: 'DIRECTO',
      },
    });
    assert.equal(resReserva.statusCode, 403, `Usuario inactivo en reserva: esperado 403, obtuvo ${resReserva.statusCode}: ${resReserva.payload}`);
    const bodyReserva = JSON.parse(resReserva.payload);
    assert.equal(bodyReserva.error.code, 'DOMAIN_IDENTITY_REQUIRED');

    // Intento de crear propiedad → debe rechazar por activo=false
    const resProp = await app.inject({
      method: 'POST',
      url: '/api/propiedades',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        nombre: 'Propiedad Rechazada',
        propietarioId: 'usr-prop1-trans',
        direccion: 'Av. Inactiva 123',
      },
    });
    assert.equal(resProp.statusCode, 403, `Usuario inactivo en propiedad: esperado 403, obtuvo ${resProp.statusCode}: ${resProp.payload}`);
    const bodyProp = JSON.parse(resProp.payload);
    assert.equal(bodyProp.error.code, 'DOMAIN_IDENTITY_REQUIRED');
  });

  it('15. GREEN: ADMIN con Usuario vinculado y activo=true puede registrar pago y el actorId persiste correctamente', async () => {
    // Verificar que el admin estándar (vinculado y activo) puede registrar sin problema
    const resPago = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        reservaId,
        importe: '500.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'REF-GREEN-15',
        fechaPago: '2026-11-01',
      },
    });
    assert.equal(resPago.statusCode, 201, `Admin vinculado en pago: esperado 201, obtuvo ${resPago.statusCode}: ${resPago.payload}`);
    const bodyPago = JSON.parse(resPago.payload);
    assert.ok(bodyPago.data, 'La respuesta debe incluir data del pago');
    assert.equal(bodyPago.data.estado, 'PENDIENTE_CONCILIACION');

    // Verificar que registradoPorId apunta al Usuario de dominio, no al User de autenticación
    const pagoPersistido = await db.prisma.pago.findUnique({
      where: { id: bodyPago.data.id },
      include: { registradoPor: true },
    });
    assert.ok(pagoPersistido, 'El pago debe existir en BD');
    assert.equal(pagoPersistido!.registradoPorId, 'usr-admin-trans', 'registradoPorId debe ser el ID del Usuario de dominio');
    assert.ok(pagoPersistido!.registradoPor, 'La relación registradoPor debe resolverse');
    assert.equal(pagoPersistido!.registradoPor!.email, 'admin@daplace.pe');
  });

  it('16. GREEN: OPERADOR con Usuario vinculado y activo=true puede crear huésped y el audit usa email como actor', async () => {
    const resHuesped = await app.inject({
      method: 'POST',
      url: '/api/huespedes',
      headers: { authorization: `Bearer ${operadorToken}` },
      payload: {
        nombreCompleto: 'Huésped Verificación Green',
        telefono: '+51999000001',
        email: 'green-guest@example.com',
      },
    });
    assert.equal(resHuesped.statusCode, 201, `Operador vinculado en huésped: esperado 201, obtuvo ${resHuesped.statusCode}: ${resHuesped.payload}`);
    const bodyHuesped = JSON.parse(resHuesped.payload);
    assert.ok(bodyHuesped.id, 'La respuesta debe incluir ID del huésped creado');

    // Verificar que la auditoría registró el email del operador, no su User.id
    const auditEvent = await db.prisma.auditoriaEvento.findFirst({
      where: {
        entidad: 'Huesped',
        entidadId: bodyHuesped.id,
        accion: 'CREAR_HUESPED',
      },
    });
    assert.ok(auditEvent, 'Debe existir un evento de auditoría para la creación del huésped');
    assert.equal(auditEvent!.actor, 'operador@daplace.pe', 'El actor en auditoría debe ser el email del operador');
  });
});
