import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { buildApp } from '../src/app/app.js';
import { PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const testDbUrl = getRequiredTestDatabaseUrl();
const TEST_JWT_SECRET = 'secreto_jwt_super_seguro_para_pruebas_reportes_liquidation!';

describe('HU-07 & HU-12 — Reportes de Liquidación y Exportación para Propietarios', () => {
  let db: ReturnType<typeof createDatabase>;
  let repository: PrismaAuthRepository;
  let app: ReturnType<typeof buildApp>;

  let adminToken: string;
  let operadorToken: string;
  let propietario1Token: string;
  let propietario2Token: string;

  let prop1Id: string;
  let prop2Id: string;
  let huespedId: string;

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

    // 1. Usuarios ADMIN y OPERADOR
    const usuarioAdmin = await db.prisma.usuario.create({
      data: { id: 'usr-admin-rep', nombre: 'Valeria Admin', email: 'admin@daplace.pe', rol: 'ADMIN' },
    });
    const userAdmin = await repository.createUser({
      email: 'admin@daplace.pe',
      passwordHash,
      nombre: 'Valeria Admin',
      rol: 'ADMINISTRADOR',
      usuarioId: usuarioAdmin.id,
    });

    const usuarioOperador = await db.prisma.usuario.create({
      data: { id: 'usr-operador-rep', nombre: 'Marcos Operador', email: 'operador@daplace.pe', rol: 'OPERADOR' },
    });
    const userOperador = await repository.createUser({
      email: 'operador@daplace.pe',
      passwordHash,
      nombre: 'Marcos Operador',
      rol: 'OPERADOR',
      usuarioId: usuarioOperador.id,
    });

    // 2. Propietarios de dominio y auth
    const usuarioProp1 = await db.prisma.usuario.create({
      data: { id: 'usr-prop-1', nombre: 'Carlos Propietario 1', email: 'carlos@prop1.pe', rol: 'PROPIETARIO' },
    });
    const userProp1 = await repository.createUser({
      email: 'carlos@prop1.pe',
      passwordHash,
      nombre: 'Carlos Propietario 1',
      rol: 'PROPIETARIO',
      usuarioId: usuarioProp1.id,
    });

    const usuarioProp2 = await db.prisma.usuario.create({
      data: { id: 'usr-prop-2', nombre: 'Diana Propietario 2', email: 'diana@prop2.pe', rol: 'PROPIETARIO' },
    });
    const userProp2 = await repository.createUser({
      email: 'diana@prop2.pe',
      passwordHash,
      nombre: 'Diana Propietario 2',
      rol: 'PROPIETARIO',
      usuarioId: usuarioProp2.id,
    });

    // Tokens
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
    propietario1Token = await login('carlos@prop1.pe');
    propietario2Token = await login('diana@prop2.pe');

    // 3. Propiedades
    const prop1 = await db.prisma.propiedad.create({
      data: {
        id: 'prop-mira-1',
        nombre: 'Depa Vista al Mar Miraflores',
        propietarioId: usuarioProp1.id,
        direccion: 'Malecón de la Reserva 100',
        estadoOperativo: 'OPERATIVA',
        estadoPublicacion: 'PUBLICADA',
        precioBaseNoche: 300,
        moneda: 'PEN',
      },
    });
    prop1Id = prop1.id;

    const prop2 = await db.prisma.propiedad.create({
      data: {
        id: 'prop-barr-2',
        nombre: 'Loft Barranco Bohemio',
        propietarioId: usuarioProp2.id,
        direccion: 'Av. Pedro de Osma 200',
        estadoOperativo: 'OPERATIVA',
        estadoPublicacion: 'PUBLICADA',
        precioBaseNoche: 250,
        moneda: 'PEN',
      },
    });
    prop2Id = prop2.id;

    // Huésped
    const huesped = await db.prisma.huesped.create({
      data: {
        nombreCompleto: 'Ana Viajera',
        email: 'ana@viajera.pe',
        telefono: '+51987654321',
      },
    });
    huespedId = huesped.id;
  });

  it('1. Calcula la liquidación contable exacta sumando exclusivamente pagos CONCILIADOS y descontando gastos APROBADOS', async () => {
    // Crear reserva en octubre 2026
    const reserva = await db.prisma.reserva.create({
      data: {
        id: 'res-oct-1',
        propiedadId: prop1Id,
        huespedId,
        ingreso: new Date('2026-10-10'),
        salida: new Date('2026-10-15'),
        noches: 5,
        estado: 'CONFIRMADA',
        montoAcordado: 1500,
        moneda: 'PEN',
      },
    });

    // Pago CONCILIADO en octubre
    await db.prisma.pago.create({
      data: {
        reservaId: reserva.id,
        monto: 1000,
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-CONCILIADO-1',
        fechaPago: new Date('2026-10-11'),
        estado: 'CONCILIADO',
      },
    });

    // Pago PENDIENTE en octubre (NO debe computarse en ingresos)
    await db.prisma.pago.create({
      data: {
        reservaId: reserva.id,
        monto: 500,
        moneda: 'PEN',
        concepto: 'SALDO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-PENDIENTE-1',
        fechaPago: new Date('2026-10-12'),
        estado: 'PENDIENTE_CONCILIACION',
      },
    });

    // Gasto APROBADO en octubre
    await db.prisma.gasto.create({
      data: {
        propiedadId: prop1Id,
        fechaGasto: new Date('2026-10-12'),
        periodoMes: 10,
        periodoAnio: 2026,
        titulo: 'Limpieza profunda de entrada',
        categoria: 'LIMPIEZA',
        monto: 150,
        moneda: 'PEN',
        pagadoPor: 'DAPLACE',
        estado: 'APROBADO',
      },
    });

    // Gasto REGISTRADO en octubre (NO aprobado, NO debe descontarse)
    await db.prisma.gasto.create({
      data: {
        propiedadId: prop1Id,
        fechaGasto: new Date('2026-10-14'),
        periodoMes: 10,
        periodoAnio: 2026,
        titulo: 'Arreglo grifería presupuesto',
        categoria: 'MANTENIMIENTO',
        monto: 80,
        moneda: 'PEN',
        pagadoPor: 'DAPLACE',
        estado: 'REGISTRADO',
      },
    });

    // Garantía en custodia (NO debe sumarse a ingresos)
    await db.prisma.garantia.create({
      data: {
        reservaId: reserva.id,
        moneda: 'PEN',
        montoTotal: 400,
        estado: 'EN_CUSTODIA',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/reportes/propietario?propiedadId=${prop1Id}&mes=10&anio=2026`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);

    assert.equal(body.propiedad.id, prop1Id);
    assert.equal(body.periodo.mes, 10);
    assert.equal(body.periodo.anio, 2026);

    // Verificación financiera exacta:
    // Ingresos conciliados: 1000.00
    // Gastos aprobados: 150.00
    // Balance neto: 1000 - 150 = 850.00
    // Garantías en custodia: 400.00 (aislada)
    assert.equal(body.resumen.totalIngresos, 1000);
    assert.equal(body.resumen.totalGastos, 150);
    assert.equal(body.resumen.balanceNeto, 850);
    assert.equal(body.resumen.garantiasEnCustodia, 400);
    assert.equal(body.resumen.cantidadPagosConciliados, 1);
    assert.equal(body.resumen.cantidadGastosAprobados, 1);

    assert.equal(body.ingresos.length, 1);
    assert.equal(body.ingresos[0].monto, 1000);
    assert.equal(body.gastos.length, 1);
    assert.equal(body.gastos[0].monto, 150);
    assert.equal(body.garantias.length, 1);
    assert.equal(body.garantias[0].monto, 400);
  });

  it('2. Aplica aislamiento RBAC estricto: PROPIETARIO 1 recibe 403 al intentar consultar propiedad de PROPIETARIO 2', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/reportes/propietario?propiedadId=${prop2Id}&mes=10&anio=2026`,
      headers: { authorization: `Bearer ${propietario1Token}` },
    });

    assert.equal(response.statusCode, 403);
    const body = JSON.parse(response.body);
    assert.equal(body.error.code, 'FORBIDDEN');
  });

  it('3. PROPIETARIO 1 puede consultar con éxito el reporte de su propia propiedad', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/reportes/propietario?propiedadId=${prop1Id}&mes=10&anio=2026`,
      headers: { authorization: `Bearer ${propietario1Token}` },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.propiedad.id, prop1Id);
    assert.equal(body.propiedad.propietarioId, 'usr-prop-1');
  });

  it('4. OPERADOR tiene autorización para consultar liquidaciones de cualquier propiedad', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/reportes/propietario?propiedadId=${prop1Id}&mes=10&anio=2026`,
      headers: { authorization: `Bearer ${operadorToken}` },
    });

    assert.equal(response.statusCode, 200);
  });

  it('5. HU-12: Exportación CSV entrega archivo descargable con formato y datos requeridos', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/reportes/propietario?propiedadId=${prop1Id}&mes=10&anio=2026&format=csv`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'] || '', /text\/csv/);
    assert.match(response.headers['content-disposition'] || '', /attachment; filename="liquidacion-.*\.csv"/);

    const csv = response.body;
    assert.ok(csv.includes('LIQUIDACION DE PROPIETARIO - DAPLACE RENTALS'));
    assert.ok(csv.includes('Depa Vista al Mar Miraflores'));
    assert.ok(csv.includes('Total Ingresos Conciliados'));
    assert.ok(csv.includes('Total Gastos Deducibles'));
    assert.ok(csv.includes('Balance Neto a Transferir'));
    assert.ok(csv.includes('Garantias en Custodia (Fondos no computables como ingreso)'));
  });

  it('6. PROPIETARIO 1 puede descargar CSV de su propia propiedad pero recibe 403 al intentar descargar CSV ajeno', async () => {
    // 1. Descarga propia exitosa
    const resPropia = await app.inject({
      method: 'GET',
      url: `/api/reportes/propietario?propiedadId=${prop1Id}&mes=10&anio=2026&format=csv`,
      headers: { authorization: `Bearer ${propietario1Token}` },
    });
    assert.equal(resPropia.statusCode, 200);
    assert.match(resPropia.headers['content-type'] || '', /text\/csv/);

    // 2. Intento de descarga sobre propiedad de PROPIETARIO 2 rechazado con 403
    const resAjena = await app.inject({
      method: 'GET',
      url: `/api/reportes/propietario?propiedadId=${prop2Id}&mes=10&anio=2026&format=csv`,
      headers: { authorization: `Bearer ${propietario1Token}` },
    });
    assert.equal(resAjena.statusCode, 403);
    const bodyAjena = JSON.parse(resAjena.body);
    assert.equal(bodyAjena.error.code, 'FORBIDDEN');
  });

  it('7. HU-07 Integridad monetaria: Calcula correctamente un reporte válido exclusivamente en USD', async () => {
    // Crear propiedad en USD
    const propUsd = await db.prisma.propiedad.create({
      data: {
        id: 'prop-usd-test',
        nombre: 'Luxury Suite San Isidro USD',
        propietarioId: 'usr-prop-1',
        direccion: 'Calle Los Robles 500',
        estadoOperativo: 'OPERATIVA',
        estadoPublicacion: 'PUBLICADA',
        precioBaseNoche: 120,
        moneda: 'USD',
      },
    });

    const resUsd = await db.prisma.reserva.create({
      data: {
        id: 'res-usd-1',
        propiedadId: propUsd.id,
        huespedId,
        ingreso: new Date('2026-10-01'),
        salida: new Date('2026-10-06'),
        noches: 5,
        estado: 'CONFIRMADA',
        montoAcordado: 600,
        moneda: 'USD',
      },
    });

    // Pago en USD
    await db.prisma.pago.create({
      data: {
        reservaId: resUsd.id,
        monto: 600,
        moneda: 'USD',
        concepto: 'PAGO_TOTAL',
        metodoPago: 'TARJETA',
        referenciaOperacion: 'OP-USD-CONC-1',
        fechaPago: new Date('2026-10-02'),
        estado: 'CONCILIADO',
      },
    });

    // Gasto en USD
    await db.prisma.gasto.create({
      data: {
        propiedadId: propUsd.id,
        fechaGasto: new Date('2026-10-03'),
        periodoMes: 10,
        periodoAnio: 2026,
        titulo: 'Mantenimiento filtro aire USD',
        categoria: 'MANTENIMIENTO',
        monto: 75.5,
        moneda: 'USD',
        pagadoPor: 'DAPLACE',
        estado: 'APROBADO',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/reportes/propietario?propiedadId=${propUsd.id}&mes=10&anio=2026`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.moneda, 'USD');
    assert.equal(body.propiedad.moneda, 'USD');
    assert.equal(body.resumen.totalIngresos, 600);
    assert.equal(body.resumen.totalGastos, 75.5);
    assert.equal(body.resumen.balanceNeto, 524.5);
    assert.equal(body.ingresos[0].moneda, 'USD');
    assert.equal(body.gastos[0].moneda, 'USD');
  });

  it('8. HU-07 Integridad monetaria: Rechaza reporte con 409 MIXED_CURRENCY_REPORT si existen transacciones incompatibles (ej. PEN y USD)', async () => {
    // Propiedad en PEN
    const reservaPen = await db.prisma.reserva.create({
      data: {
        id: 'res-mix-1',
        propiedadId: prop1Id,
        huespedId,
        ingreso: new Date('2026-10-20'),
        salida: new Date('2026-10-25'),
        noches: 5,
        estado: 'CONFIRMADA',
        montoAcordado: 1000,
        moneda: 'PEN',
      },
    });

    // Pago conciliado en PEN
    await db.prisma.pago.create({
      data: {
        reservaId: reservaPen.id,
        monto: 1000,
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-PEN-1',
        fechaPago: new Date('2026-10-21'),
        estado: 'CONCILIADO',
      },
    });

    // Gasto aprobado registrado en USD en la misma propiedad (incompatible sin tipo de cambio oficial)
    await db.prisma.gasto.create({
      data: {
        propiedadId: prop1Id,
        fechaGasto: new Date('2026-10-22'),
        periodoMes: 10,
        periodoAnio: 2026,
        titulo: 'Suscripción servicio internacional cerradura',
        categoria: 'SERVICIOS',
        monto: 30,
        moneda: 'USD',
        pagadoPor: 'DAPLACE',
        estado: 'APROBADO',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/reportes/propietario?propiedadId=${prop1Id}&mes=10&anio=2026`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.statusCode, 409);
    const body = JSON.parse(response.body);
    assert.equal(body.error.code, 'MIXED_CURRENCY_REPORT');
    assert.ok(body.error.message.includes('monedas incompatibles'));
    assert.ok(body.error.detalles.monedasDetectadas.includes('PEN'));
    assert.ok(body.error.detalles.monedasDetectadas.includes('USD'));
  });
});
