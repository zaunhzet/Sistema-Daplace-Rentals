import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { buildApp } from '../src/app/app.js';
import { PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const testDbUrl = getRequiredTestDatabaseUrl();
const TEST_JWT_SECRET = 'secreto_jwt_super_seguro_para_pruebas_alerts_notifications!';

describe('HU-CLOSE-01: HU-11 y HU-17 — Alertas Internas de Reserva y Asignación de Trabajo', () => {
  let db: ReturnType<typeof createDatabase>;
  let repository: PrismaAuthRepository;
  let app: ReturnType<typeof buildApp>;

  let adminToken: string;
  let operador1Token: string;
  let operador2Token: string;
  let op1UsuarioId: string;
  let op2UsuarioId: string;
  let propiedadId: string;
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

    // 1. Admin Master
    const usrAdmin = await db.prisma.usuario.create({
      data: {
        id: 'usr-admin-alerts',
        nombre: 'Admin Master',
        email: 'admin@daplace.pe',
        rol: 'ADMIN',
        activo: true,
      },
    });
    await repository.createUser({
      email: 'admin@daplace.pe',
      passwordHash,
      nombre: 'Admin Master',
      rol: 'ADMINISTRADOR',
      usuarioId: usrAdmin.id,
    });

    // 2. Operador 1
    const usrOp1 = await db.prisma.usuario.create({
      data: {
        id: 'usr-op1-alerts',
        nombre: 'Juan Operador',
        email: 'op1@daplace.pe',
        rol: 'OPERADOR',
        activo: true,
      },
    });
    op1UsuarioId = usrOp1.id;
    await repository.createUser({
      email: 'op1@daplace.pe',
      passwordHash,
      nombre: 'Juan Operador',
      rol: 'OPERADOR',
      usuarioId: usrOp1.id,
    });

    // 3. Operador 2
    const usrOp2 = await db.prisma.usuario.create({
      data: {
        id: 'usr-op2-alerts',
        nombre: 'Maria Tecnica',
        email: 'op2@daplace.pe',
        rol: 'OPERADOR',
        activo: true,
      },
    });
    op2UsuarioId = usrOp2.id;
    await repository.createUser({
      email: 'op2@daplace.pe',
      passwordHash,
      nombre: 'Maria Tecnica',
      rol: 'OPERADOR',
      usuarioId: usrOp2.id,
    });

    // Inmueble y Huésped
    const prop = await db.prisma.propiedad.create({
      data: {
        id: 'prop-alerts-01',
        nombre: 'Departamento San Isidro Golf',
        direccion: 'Av. Coronel Portillo 200',
        propietarioId: usrAdmin.id,
        estadoOperativo: 'OPERATIVA',
        activa: true,
      },
    });
    propiedadId = prop.id;

    const hue = await db.prisma.huesped.create({
      data: {
        id: 'hue-alerts-01',
        nombreCompleto: 'Gabriel Garcia',
        email: 'gabriel@cliente.com',
        telefono: '+51999888777',
      },
    });
    huespedId = hue.id;

    // Login tokens
    const resLogAdmin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@daplace.pe', password: 'PassSecure2026!' },
    });
    adminToken = JSON.parse(resLogAdmin.body).accessToken;

    const resLogOp1 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'op1@daplace.pe', password: 'PassSecure2026!' },
    });
    operador1Token = JSON.parse(resLogOp1.body).accessToken;

    const resLogOp2 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'op2@daplace.pe', password: 'PassSecure2026!' },
    });
    operador2Token = JSON.parse(resLogOp2.body).accessToken;
  });

  describe('HU-11 — Alerta interna de nueva reserva', () => {
    it('crear una reserva genera un evento interno persistente y consultable en GET /api/alertas', async () => {
      const resCreate = await app.inject({
        method: 'POST',
        url: '/api/reservas',
        headers: { authorization: `Bearer ${operador1Token}` },
        payload: {
          id: 'res-alerts-hu11-01',
          propiedadId,
          huespedId,
          ingreso: '2026-11-10',
          salida: '2026-11-15',
          montoAcordado: 1500,
          moneda: 'PEN',
          origen: 'WEB',
        },
      });

      assert.equal(resCreate.statusCode, 201);
      const createdReserva = JSON.parse(resCreate.body);
      assert.equal(createdReserva.id, 'res-alerts-hu11-01');

      // Verificar persistencia física directa en la tabla notificaciones_internas
      const notifEnDb = await db.prisma.notificacionInterna.findUnique({
        where: { idempotencyKey: `notif-reserva-creada-${createdReserva.id}` },
      });

      assert.ok(notifEnDb, 'Debe existir registro en notificaciones_internas');
      assert.equal(notifEnDb.tipo, 'NUEVA_RESERVA');
      assert.equal(notifEnDb.estado, 'PENDIENTE');
      assert.equal(notifEnDb.usuarioId, null, 'Alerta global sin destinatario restringido');
      assert.equal(notifEnDb.reservaId, 'res-alerts-hu11-01');
      assert.equal(notifEnDb.propiedadId, propiedadId);

      // Verificar consulta por API desde la cuenta de OPERADOR (HU-11 Req 3)
      const resAlertasOp = await app.inject({
        method: 'GET',
        url: '/api/alertas',
        headers: { authorization: `Bearer ${operador1Token}` },
      });

      assert.equal(resAlertasOp.statusCode, 200);
      const bodyAlertas = JSON.parse(resAlertasOp.body);
      assert.ok(Array.isArray(bodyAlertas.data));
      const alerta = bodyAlertas.data.find((a: any) => a.reservaId === 'res-alerts-hu11-01');
      assert.ok(alerta, 'La nueva reserva debe ser visible en el feed de alertas');
      assert.equal(alerta.tipoAviso, 'NUEVA_RESERVA');
      assert.equal(alerta.reserva.propiedadNombre, 'Departamento San Isidro Golf');
      assert.equal(alerta.reserva.huespedNombre, 'Gabriel Garcia');

      // Verificar consulta por API desde ADMIN
      const resAlertasAdmin = await app.inject({
        method: 'GET',
        url: '/api/alertas',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(resAlertasAdmin.statusCode, 200);
      const bodyAdmin = JSON.parse(resAlertasAdmin.body);
      assert.ok(bodyAdmin.data.some((a: any) => a.reservaId === 'res-alerts-hu11-01'));
    });

    it('permite marcar la alerta de nueva reserva como atendida de forma persistente', async () => {
      // Crear reserva
      await app.inject({
        method: 'POST',
        url: '/api/reservas',
        headers: { authorization: `Bearer ${operador1Token}` },
        payload: {
          id: 'res-alerts-hu11-attend',
          propiedadId,
          huespedId,
          ingreso: '2026-11-20',
          salida: '2026-11-22',
          montoAcordado: 800,
          moneda: 'PEN',
          origen: 'DIRECTO',
        },
      });

      const notifPre = await db.prisma.notificacionInterna.findUnique({
        where: { idempotencyKey: 'notif-reserva-creada-res-alerts-hu11-attend' },
      });
      assert.ok(notifPre);

      // Marcar como atendida vía POST /api/alertas/:id/atender
      const resAttend = await app.inject({
        method: 'POST',
        url: `/api/alertas/${notifPre.id}/atender`,
        headers: { authorization: `Bearer ${operador1Token}` },
      });

      assert.equal(resAttend.statusCode, 200);
      const attendBody = JSON.parse(resAttend.body);
      assert.equal(attendBody.estado, 'ATENDIDA');

      // Verificar que el estado se consolidó en la base de datos
      const notifPost = await db.prisma.notificacionInterna.findUnique({
        where: { id: notifPre.id },
      });
      assert.equal(notifPost?.estado, 'ATENDIDA');
      assert.ok(notifPost?.atendidaEn instanceof Date);
    });
  });

  describe('HU-17 — Aviso real al trabajador asignado', () => {
    it('crear una orden asignada genera una notificación interna persistente para el colaborador asignado', async () => {
      const resOrder = await app.inject({
        method: 'POST',
        url: '/api/mantenimiento/ordenes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          propiedadId,
          titulo: 'Pintura y resane de sala',
          descripcion: 'Reparar acabados y detalles de zócalo en sala',
          tipo: 'REPARACION',
          prioridad: 'ALTA',
          asignadoAId: op1UsuarioId,
        },
      });

      assert.equal(resOrder.statusCode, 201);
      const orderData = JSON.parse(resOrder.body).data;

      // Verificar notificación en BD para op1UsuarioId
      const notifDb = await db.prisma.notificacionInterna.findFirst({
        where: {
          ordenTrabajoId: orderData.id,
          usuarioId: op1UsuarioId,
        },
      });

      assert.ok(notifDb, 'Debe existir notificación para el trabajador asignado');
      assert.equal(notifDb.tipo, 'ORDEN_TRABAJO_ASIGNADA');
      assert.equal(notifDb.estado, 'PENDIENTE');
      assert.ok(notifDb.titulo.includes('Pintura y resane de sala'));
    });

    it('aislamiento estricto RBAC: Operador 1 ve sus avisos; Operador 2 NO ve los avisos de Operador 1', async () => {
      // 1. Crear orden asignada a Operador 1
      const resOrder1 = await app.inject({
        method: 'POST',
        url: '/api/mantenimiento/ordenes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          propiedadId,
          titulo: 'Mantenimiento exclusivo para Operador 1',
          descripcion: 'Inspeccionar cerradura principal y manijas',
          tipo: 'INSPECCION',
          prioridad: 'MEDIA',
          asignadoAId: op1UsuarioId,
        },
      });
      const order1Id = JSON.parse(resOrder1.body).data.id;

      // 2. Crear orden asignada a Operador 2
      const resOrder2 = await app.inject({
        method: 'POST',
        url: '/api/mantenimiento/ordenes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          propiedadId,
          titulo: 'Mantenimiento exclusivo para Operador 2',
          descripcion: 'Limpieza profunda de alfombra y cortinas',
          tipo: 'LIMPIEZA',
          prioridad: 'MEDIA',
          asignadoAId: op2UsuarioId,
        },
      });
      const order2Id = JSON.parse(resOrder2.body).data.id;

      // 3. Operador 1 consulta /api/alertas
      const resAlertasOp1 = await app.inject({
        method: 'GET',
        url: '/api/alertas',
        headers: { authorization: `Bearer ${operador1Token}` },
      });
      assert.equal(resAlertasOp1.statusCode, 200);
      const dataOp1 = JSON.parse(resAlertasOp1.body).data;

      // Operador 1 ve su orden
      assert.ok(
        dataOp1.some((n: any) => n.ordenTrabajoId === order1Id),
        'Operador 1 debe ver la orden que tiene asignada',
      );
      // Operador 1 NO debe ver la orden de Operador 2
      assert.equal(
        dataOp1.some((n: any) => n.ordenTrabajoId === order2Id),
        false,
        'Operador 1 NO debe tener visibilidad de la orden asignada a Operador 2',
      );

      // 4. Operador 2 consulta /api/alertas
      const resAlertasOp2 = await app.inject({
        method: 'GET',
        url: '/api/alertas',
        headers: { authorization: `Bearer ${operador2Token}` },
      });
      assert.equal(resAlertasOp2.statusCode, 200);
      const dataOp2 = JSON.parse(resAlertasOp2.body).data;

      // Operador 2 ve su orden
      assert.ok(
        dataOp2.some((n: any) => n.ordenTrabajoId === order2Id),
        'Operador 2 debe ver la orden que tiene asignada',
      );
      // Operador 2 NO debe ver la orden de Operador 1
      assert.equal(
        dataOp2.some((n: any) => n.ordenTrabajoId === order1Id),
        false,
        'Operador 2 NO debe tener visibilidad de la orden asignada a Operador 1',
      );

      // 5. Administrador ve ambas órdenes en /api/alertas
      const resAlertasAdmin = await app.inject({
        method: 'GET',
        url: '/api/alertas',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const dataAdmin = JSON.parse(resAlertasAdmin.body).data;
      assert.ok(dataAdmin.some((n: any) => n.ordenTrabajoId === order1Id));
      assert.ok(dataAdmin.some((n: any) => n.ordenTrabajoId === order2Id));
    });

    it('control negativo: Operador 1 no puede marcar como atendida la notificación de Operador 2 (403 FORBIDDEN)', async () => {
      // Crear orden para Operador 2
      const resOrder = await app.inject({
        method: 'POST',
        url: '/api/mantenimiento/ordenes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          propiedadId,
          titulo: 'Reparación de grifería',
          descripcion: 'Fuga de agua en lavabo secundario',
          tipo: 'REPARACION',
          prioridad: 'ALTA',
          asignadoAId: op2UsuarioId,
        },
      });
      const orderId = JSON.parse(resOrder.body).data.id;

      const notifOp2 = await db.prisma.notificacionInterna.findFirst({
        where: { ordenTrabajoId: orderId, usuarioId: op2UsuarioId },
      });
      assert.ok(notifOp2);

      // Operador 1 intenta atenderla
      const resIntento = await app.inject({
        method: 'POST',
        url: `/api/alertas/${notifOp2.id}/atender`,
        headers: { authorization: `Bearer ${operador1Token}` },
      });

      assert.equal(resIntento.statusCode, 403);
      const errBody = JSON.parse(resIntento.body);
      assert.equal(errBody.error.code, 'FORBIDDEN');
    });

    it('permite al colaborador marcar su notificación como leída vía POST /api/alertas/:id/leer', async () => {
      // Crear orden para Operador 1
      const resOrder = await app.inject({
        method: 'POST',
        url: '/api/mantenimiento/ordenes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          propiedadId,
          titulo: 'Revisión de luminarias',
          descripcion: 'Verificar foco quemado en terraza',
          tipo: 'INSPECCION',
          prioridad: 'BAJA',
          asignadoAId: op1UsuarioId,
        },
      });
      const orderId = JSON.parse(resOrder.body).data.id;

      const notif = await db.prisma.notificacionInterna.findFirst({
        where: { ordenTrabajoId: orderId, usuarioId: op1UsuarioId },
      });
      assert.ok(notif);
      assert.equal(notif.estado, 'PENDIENTE');

      // Operador 1 marca como leída
      const resLeer = await app.inject({
        method: 'POST',
        url: `/api/alertas/${notif.id}/leer`,
        headers: { authorization: `Bearer ${operador1Token}` },
      });

      assert.equal(resLeer.statusCode, 200);
      const leerBody = JSON.parse(resLeer.body);
      assert.equal(leerBody.estado, 'LEIDA');

      // Validar persistencia
      const notifPost = await db.prisma.notificacionInterna.findUnique({
        where: { id: notif.id },
      });
      assert.equal(notifPost?.estado, 'LEIDA');
      assert.ok(notifPost?.leidaEn instanceof Date);
    });

    it('reasignar orden vía PATCH /api/mantenimiento/ordenes/:id/asignar genera aviso persistente al nuevo operario', async () => {
      // Crear orden sin asignar
      const resCreate = await app.inject({
        method: 'POST',
        url: '/api/mantenimiento/ordenes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          propiedadId,
          titulo: 'Instalación de cortinas blackout',
          descripcion: 'Instalar sistema de cortinas en dormitorio principal',
          tipo: 'REPARACION',
          prioridad: 'MEDIA',
        },
      });
      const orderId = JSON.parse(resCreate.body).data.id;

      // Reasignar a Operador 2
      const resAsignar = await app.inject({
        method: 'PATCH',
        url: `/api/mantenimiento/ordenes/${orderId}/asignar`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { asignadoAId: op2UsuarioId },
      });

      assert.equal(resAsignar.statusCode, 200);

      // Comprobar notificación generada
      const notifDb = await db.prisma.notificacionInterna.findUnique({
        where: { idempotencyKey: `notif-orden-reasignada-${orderId}-${op2UsuarioId}` },
      });

      assert.ok(notifDb, 'Debe generarse notificación por reasignación');
      assert.equal(notifDb.usuarioId, op2UsuarioId);
      assert.equal(notifDb.tipo, 'ORDEN_TRABAJO_ASIGNADA');
    });
  });
});
