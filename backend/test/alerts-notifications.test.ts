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
  let passwordHash: string;

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
    passwordHash = await AuthService.hashPassword('PassSecure2026!');

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

    it('idempotencia: la inserción de la alerta utiliza idempotencyKey y reintentar no duplica el registro', async () => {
      const reservaId = 'res-alerts-hu11-idempotent';
      const key = `notif-reserva-creada-${reservaId}`;

      // 1. Crear reserva
      await app.inject({
        method: 'POST',
        url: '/api/reservas',
        headers: { authorization: `Bearer ${operador1Token}` },
        payload: {
          id: reservaId,
          propiedadId,
          huespedId,
          ingreso: '2026-11-25',
          salida: '2026-11-28',
          montoAcordado: 900,
          moneda: 'PEN',
          origen: 'DIRECTO',
        },
      });

      const count1 = await db.prisma.notificacionInterna.count({
        where: { idempotencyKey: key },
      });
      assert.equal(count1, 1);

      // 2. Simular reintento de creación con la misma clave de idempotencia
      await db.prisma.notificacionInterna.upsert({
        where: { idempotencyKey: key },
        create: {
          idempotencyKey: key,
          tipo: 'NUEVA_RESERVA',
          estado: 'PENDIENTE',
          titulo: 'Alerta duplicada',
          mensaje: 'No debe duplicar',
          reservaId,
          propiedadId,
        },
        update: {},
      });

      const count2 = await db.prisma.notificacionInterna.count({
        where: { idempotencyKey: key },
      });
      assert.equal(count2, 1, 'La clave de idempotencia garantiza un único registro persistente');
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

    it('flujo completo HU-17: ADMIN asigna orden -> se persiste aviso -> OPERADOR consulta aviso -> accede a detalle de su trabajo -> no ve avisos ajenos -> marca leída', async () => {
      // 1. ADMIN asigna una orden a un OPERADOR vinculado a Usuario
      const resOrder = await app.inject({
        method: 'POST',
        url: '/api/mantenimiento/ordenes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          propiedadId,
          titulo: 'Mantenimiento integral de aire acondicionado',
          descripcion: 'Limpieza de filtros y recarga de gas refrigerante',
          tipo: 'REPARACION',
          prioridad: 'ALTA',
          asignadoAId: op1UsuarioId,
        },
      });
      assert.equal(resOrder.statusCode, 201);
      const createdOrder = JSON.parse(resOrder.body).data;

      // Crear también una orden para OPERADOR 2 para comprobar aislamiento
      const resOrderOp2 = await app.inject({
        method: 'POST',
        url: '/api/mantenimiento/ordenes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          propiedadId,
          titulo: 'Inspección de tubería en lavandería',
          descripcion: 'Revisión técnica exclusiva de Operador 2',
          tipo: 'INSPECCION',
          prioridad: 'BAJA',
          asignadoAId: op2UsuarioId,
        },
      });
      assert.equal(resOrderOp2.statusCode, 201);
      const orderOp2 = JSON.parse(resOrderOp2.body).data;

      // 2. Se persiste la notificación
      const notifOp1 = await db.prisma.notificacionInterna.findFirst({
        where: {
          ordenTrabajoId: createdOrder.id,
          usuarioId: op1UsuarioId,
        },
      });
      assert.ok(notifOp1, 'La notificación para Operador 1 debe estar persistida en PostgreSQL');
      assert.equal(notifOp1.estado, 'PENDIENTE');

      // 3. El OPERADOR inicia sesión
      const resLogin = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'op1@daplace.pe', password: 'PassSecure2026!' },
      });
      assert.equal(resLogin.statusCode, 200);
      const freshOp1Token = JSON.parse(resLogin.body).accessToken;

      // 4. Puede consultar su notificación
      const resAlertas = await app.inject({
        method: 'GET',
        url: '/api/alertas',
        headers: { authorization: `Bearer ${freshOp1Token}` },
      });
      assert.equal(resAlertas.statusCode, 200);
      const alerts = JSON.parse(resAlertas.body).data;
      const myAlert = alerts.find((a: any) => a.ordenTrabajoId === createdOrder.id);
      assert.ok(myAlert, 'Operador 1 debe encontrar su notificación de trabajo');
      assert.equal(myAlert.tipoAviso, 'ORDEN_TRABAJO_ASIGNADA');
      assert.ok(myAlert.titulo.includes('aire acondicionado'));

      // 5. Puede acceder al detalle autorizado de su trabajo
      const resOrderDetail = await app.inject({
        method: 'GET',
        url: `/api/mantenimiento/ordenes/${createdOrder.id}`,
        headers: { authorization: `Bearer ${freshOp1Token}` },
      });
      assert.equal(resOrderDetail.statusCode, 200);
      const detail = JSON.parse(resOrderDetail.body).data;
      assert.equal(detail.id, createdOrder.id);
      assert.equal(detail.propiedadId, propiedadId);
      assert.equal(detail.tipo, 'REPARACION');
      assert.equal(detail.prioridad, 'ALTA');
      assert.equal(detail.asignadoA?.id, op1UsuarioId);

      // También puede listar sus órdenes
      const resOrdersList = await app.inject({
        method: 'GET',
        url: `/api/mantenimiento/ordenes?asignadoAId=${op1UsuarioId}`,
        headers: { authorization: `Bearer ${freshOp1Token}` },
      });
      assert.equal(resOrdersList.statusCode, 200);
      const list = JSON.parse(resOrdersList.body).data;
      assert.ok(list.some((o: any) => o.id === createdOrder.id));

      // 6. No puede consultar notificaciones privadas de otros trabajadores
      assert.equal(
        alerts.some((a: any) => a.ordenTrabajoId === orderOp2.id),
        false,
        'Operador 1 NO debe ver la notificación de trabajo privado de Operador 2',
      );

      // 7. Puede marcar la notificación propia como leída
      const resMarcarLeida = await app.inject({
        method: 'POST',
        url: `/api/alertas/${myAlert.id}/leer`,
        headers: { authorization: `Bearer ${freshOp1Token}` },
      });
      assert.equal(resMarcarLeida.statusCode, 200);
      const updatedNotif = JSON.parse(resMarcarLeida.body);
      assert.equal(updatedNotif.estado, 'LEIDA');

      const notifEnDb = await db.prisma.notificacionInterna.findUnique({
        where: { id: myAlert.id },
      });
      assert.equal(notifEnDb?.estado, 'LEIDA');
      assert.ok(notifEnDb?.leidaEn instanceof Date);
    });

    describe('Seguridad y Validación Estricta de Identidad de Dominio (HU-11 y HU-17)', () => {
      it('operador sin vínculo de dominio recibe 403 DOMAIN_IDENTITY_REQUIRED en GET, atender y leer', async () => {
        await repository.createUser({
          email: 'op-unlinked@daplace.pe',
          passwordHash,
          nombre: 'Operador Sin Vínculo',
          rol: 'OPERADOR',
          usuarioId: null,
        });

        const resLog = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'op-unlinked@daplace.pe', password: 'PassSecure2026!' },
        });
        const unlinkedToken = JSON.parse(resLog.body).accessToken;

        // GET /api/alertas
        const resGet = await app.inject({
          method: 'GET',
          url: '/api/alertas',
          headers: { authorization: `Bearer ${unlinkedToken}` },
        });
        assert.equal(resGet.statusCode, 403);
        const errGet = JSON.parse(resGet.body);
        assert.equal(errGet.error.code, 'DOMAIN_IDENTITY_REQUIRED');

        // POST /api/alertas/:id/atender
        const resAtender = await app.inject({
          method: 'POST',
          url: '/api/alertas/dummy-notif-id/atender',
          headers: { authorization: `Bearer ${unlinkedToken}` },
        });
        assert.equal(resAtender.statusCode, 403);
        const errAtender = JSON.parse(resAtender.body);
        assert.equal(errAtender.error.code, 'DOMAIN_IDENTITY_REQUIRED');

        // POST /api/alertas/:id/leer
        const resLeer = await app.inject({
          method: 'POST',
          url: '/api/alertas/dummy-notif-id/leer',
          headers: { authorization: `Bearer ${unlinkedToken}` },
        });
        assert.equal(resLeer.statusCode, 403);
        const errLeer = JSON.parse(resLeer.body);
        assert.equal(errLeer.error.code, 'DOMAIN_IDENTITY_REQUIRED');
      });

      it('operador con actor de dominio inactivo recibe 403 DOMAIN_IDENTITY_REQUIRED en GET, atender y leer', async () => {
        const usrInactivo = await db.prisma.usuario.create({
          data: {
            id: 'usr-op-inactive-alerts',
            nombre: 'Operador Inactivo',
            email: 'op-inactive@daplace.pe',
            rol: 'OPERADOR',
            activo: false,
          },
        });

        await repository.createUser({
          email: 'op-inactive@daplace.pe',
          passwordHash,
          nombre: 'Operador Inactivo',
          rol: 'OPERADOR',
          usuarioId: usrInactivo.id,
        });

        const resLog = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'op-inactive@daplace.pe', password: 'PassSecure2026!' },
        });
        const inactiveToken = JSON.parse(resLog.body).accessToken;

        // GET /api/alertas
        const resGet = await app.inject({
          method: 'GET',
          url: '/api/alertas',
          headers: { authorization: `Bearer ${inactiveToken}` },
        });
        assert.equal(resGet.statusCode, 403);
        assert.equal(JSON.parse(resGet.body).error.code, 'DOMAIN_IDENTITY_REQUIRED');

        // POST /api/alertas/:id/atender
        const resAtender = await app.inject({
          method: 'POST',
          url: '/api/alertas/dummy-notif-id/atender',
          headers: { authorization: `Bearer ${inactiveToken}` },
        });
        assert.equal(resAtender.statusCode, 403);
        assert.equal(JSON.parse(resAtender.body).error.code, 'DOMAIN_IDENTITY_REQUIRED');

        // POST /api/alertas/:id/leer
        const resLeer = await app.inject({
          method: 'POST',
          url: '/api/alertas/dummy-notif-id/leer',
          headers: { authorization: `Bearer ${inactiveToken}` },
        });
        assert.equal(resLeer.statusCode, 403);
        assert.equal(JSON.parse(resLeer.body).error.code, 'DOMAIN_IDENTITY_REQUIRED');
      });

      it('operador con email diferente entre User y Usuario pero vínculo válido accede a sus propias notificaciones y atiende globales', async () => {
        // Usuario de dominio con email institucional
        const usrDiff = await db.prisma.usuario.create({
          data: {
            id: 'usr-op-diff-alerts',
            nombre: 'Operador Cuenta Diferente',
            email: 'dominio.institucional@daplace.pe',
            rol: 'OPERADOR',
            activo: true,
          },
        });

        // User de autenticación con email externo/personal
        await repository.createUser({
          email: 'login.externo@proveedor.com',
          passwordHash,
          nombre: 'Operador Cuenta Diferente',
          rol: 'OPERADOR',
          usuarioId: usrDiff.id,
        });

        const resLog = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'login.externo@proveedor.com', password: 'PassSecure2026!' },
        });
        const diffToken = JSON.parse(resLog.body).accessToken;

        // Crear notificación privada para este operador
        const notifPropia = await db.prisma.notificacionInterna.create({
          data: {
            id: 'notif-diff-own-01',
            tipo: 'ORDEN_TRABAJO_ASIGNADA',
            estado: 'PENDIENTE',
            titulo: 'Revisión privada operador diff',
            mensaje: 'Mantenimiento preventivo',
            usuarioId: usrDiff.id,
            propiedadId,
          },
        });

        // Crear notificación privada para otro operador (op2UsuarioId)
        const notifAjena = await db.prisma.notificacionInterna.create({
          data: {
            id: 'notif-diff-alien-01',
            tipo: 'ORDEN_TRABAJO_ASIGNADA',
            estado: 'PENDIENTE',
            titulo: 'Revisión ajena op2',
            mensaje: 'Mantenimiento ajeno',
            usuarioId: op2UsuarioId,
            propiedadId,
          },
        });

        // Crear notificación global (sin usuario asignado, HU-11)
        const notifGlobal = await db.prisma.notificacionInterna.create({
          data: {
            id: 'notif-diff-global-01',
            tipo: 'NUEVA_RESERVA',
            estado: 'PENDIENTE',
            titulo: 'Nueva Reserva Inmueble',
            mensaje: 'Alerta operativa global',
            usuarioId: null,
            propiedadId,
          },
        });

        // GET /api/alertas debe resolver por usuarioId sin fallar por email dispar
        const resGet = await app.inject({
          method: 'GET',
          url: '/api/alertas',
          headers: { authorization: `Bearer ${diffToken}` },
        });
        assert.equal(resGet.statusCode, 200);
        const alerts = JSON.parse(resGet.body).data;

        // Debe ver su propia notificación y la notificación global
        assert.ok(alerts.some((a: any) => a.id === notifPropia.id));
        assert.ok(alerts.some((a: any) => a.id === notifGlobal.id));

        // NO debe ver la notificación ajena
        assert.equal(alerts.some((a: any) => a.id === notifAjena.id), false);

        // Puede leer su propia notificación
        const resLeer = await app.inject({
          method: 'POST',
          url: `/api/alertas/${notifPropia.id}/leer`,
          headers: { authorization: `Bearer ${diffToken}` },
        });
        assert.equal(resLeer.statusCode, 200);
        assert.equal(JSON.parse(resLeer.body).estado, 'LEIDA');

        // Puede atender la notificación global legítimamente
        const resAtenderGlobal = await app.inject({
          method: 'POST',
          url: `/api/alertas/${notifGlobal.id}/atender`,
          headers: { authorization: `Bearer ${diffToken}` },
        });
        assert.equal(resAtenderGlobal.statusCode, 200);
        assert.equal(JSON.parse(resAtenderGlobal.body).estado, 'ATENDIDA');
      });

      it('acceso cruzado a notificación ajena devuelve 403 FORBIDDEN en atender y leer', async () => {
        // Crear notificación asignada exclusivamente a Operador 2
        const notifOp2Exclusiva = await db.prisma.notificacionInterna.create({
          data: {
            id: 'notif-op2-strict-forbidden',
            tipo: 'ORDEN_TRABAJO_ASIGNADA',
            estado: 'PENDIENTE',
            titulo: 'Trabajo confidencial de gasfitería',
            mensaje: 'Revisión técnica asignada a op2',
            usuarioId: op2UsuarioId,
            propiedadId,
          },
        });

        // Operador 1 intenta marcar como leída la notificación de Operador 2
        const resIntentoLeer = await app.inject({
          method: 'POST',
          url: `/api/alertas/${notifOp2Exclusiva.id}/leer`,
          headers: { authorization: `Bearer ${operador1Token}` },
        });
        assert.equal(resIntentoLeer.statusCode, 403);
        const errLeer = JSON.parse(resIntentoLeer.body);
        assert.equal(errLeer.error.code, 'FORBIDDEN');
        assert.equal(
          errLeer.error.message,
          'No está autorizado para leer notificaciones asignadas a otros colaboradores.',
        );

        // Operador 1 intenta marcar como atendida la notificación de Operador 2
        const resIntentoAtender = await app.inject({
          method: 'POST',
          url: `/api/alertas/${notifOp2Exclusiva.id}/atender`,
          headers: { authorization: `Bearer ${operador1Token}` },
        });
        assert.equal(resIntentoAtender.statusCode, 403);
        const errAtender = JSON.parse(resIntentoAtender.body);
        assert.equal(errAtender.error.code, 'FORBIDDEN');
        assert.equal(
          errAtender.error.message,
          'No está autorizado para atender notificaciones asignadas a otros colaboradores.',
        );

        // Administrador sí puede atenderla administrativamente
        const resAdminAtender = await app.inject({
          method: 'POST',
          url: `/api/alertas/${notifOp2Exclusiva.id}/atender`,
          headers: { authorization: `Bearer ${adminToken}` },
        });
        assert.equal(resAdminAtender.statusCode, 200);
        assert.equal(JSON.parse(resAdminAtender.body).estado, 'ATENDIDA');
      });
    });
  });
});
