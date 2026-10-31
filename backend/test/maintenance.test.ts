import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { buildApp } from '../src/app/app.js';
import { PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const testDbUrl = getRequiredTestDatabaseUrl();
const TEST_JWT_SECRET = 'secreto_jwt_super_seguro_para_pruebas_maintenance_test!';

describe('Fase 4 — HU-10, HU-14, HU-16 y HU-17: Mantenimiento, Salidas y Órdenes de Trabajo', () => {
  let db: ReturnType<typeof createDatabase>;
  let repository: PrismaAuthRepository;
  let app: ReturnType<typeof buildApp>;

  let adminToken: string;
  let operadorToken: string;
  let propietarioToken: string;
  let operarioUsuarioId: string;
  let propiedadId: string;
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

    // Admin
    const usrAdmin = await db.prisma.usuario.create({
      data: { id: 'usr-admin-maint', nombre: 'Admin Master', email: 'admin@daplace.pe', rol: 'ADMIN', activo: true },
    });
    await repository.createUser({
      email: 'admin@daplace.pe',
      passwordHash,
      nombre: 'Admin Master',
      rol: 'ADMINISTRADOR',
      usuarioId: usrAdmin.id,
    });

    // Operador
    const usrOp = await db.prisma.usuario.create({
      data: { id: 'usr-op-maint', nombre: 'Carlos Operador', email: 'operador@daplace.pe', rol: 'OPERADOR', activo: true },
    });
    operarioUsuarioId = usrOp.id;
    await repository.createUser({
      email: 'operador@daplace.pe',
      passwordHash,
      nombre: 'Carlos Operador',
      rol: 'OPERADOR',
      usuarioId: usrOp.id,
    });

    // Propietario
    const usrProp = await db.prisma.usuario.create({
      data: { id: 'usr-prop-maint', nombre: 'Propietario Inmueble', email: 'propietario@daplace.pe', rol: 'PROPIETARIO', activo: true },
    });
    await repository.createUser({
      email: 'propietario@daplace.pe',
      passwordHash,
      nombre: 'Propietario Inmueble',
      rol: 'PROPIETARIO',
      usuarioId: usrProp.id,
    });

    // Propiedad
    const prop = await db.prisma.propiedad.create({
      data: {
        id: 'prop-maint-01',
        nombre: 'Penthouse San Isidro Club',
        propietarioId: usrProp.id,
        direccion: 'Av. Pezet 450, San Isidro',
        estadoOperativo: 'OPERATIVA',
        estadoPublicacion: 'PUBLICADA',
        precioBaseNoche: 350.0,
      },
    });
    propiedadId = prop.id;

    // Huésped
    const guest = await db.prisma.huesped.create({
      data: {
        id: 'guest-maint-01',
        nombreCompleto: 'Gonzalo Pardo',
        email: 'gonzalo.pardo@example.com',
      },
    });

    // Reserva CONFIRMADA
    const res = await db.prisma.reserva.create({
      data: {
        id: 'res-maint-01',
        propiedadId: prop.id,
        huespedId: guest.id,
        ingreso: new Date('2026-10-20'),
        salida: new Date('2026-10-25'),
        noches: 5,
        estado: 'CONFIRMADA',
        montoAcordado: 1750.0,
        moneda: 'PEN',
      },
    });
    reservaId = res.id;

    const login = async (email: string) => {
      const resp = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: 'PassSecure2026!' },
      });
      return JSON.parse(resp.body).accessToken as string;
    };

    adminToken = await login('admin@daplace.pe');
    operadorToken = await login('operador@daplace.pe');
    propietarioToken = await login('propietario@daplace.pe');
  });

  it('1. RBAC: ADMIN y OPERADOR acceden a órdenes de trabajo; PROPIETARIO recibe 403', async () => {
    const resAdmin = await app.inject({
      method: 'GET',
      url: '/api/mantenimiento/ordenes',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(resAdmin.statusCode, 200);

    const resOp = await app.inject({
      method: 'GET',
      url: '/api/mantenimiento/ordenes',
      headers: { authorization: `Bearer ${operadorToken}` },
    });
    assert.equal(resOp.statusCode, 200);

    const resProp = await app.inject({
      method: 'GET',
      url: '/api/mantenimiento/ordenes',
      headers: { authorization: `Bearer ${propietarioToken}` },
    });
    assert.equal(resProp.statusCode, 403);
  });

  it('2. HU-10: Check-out con daños marca reserva COMPLETADA, crea orden y pasa propiedad a EN_MANTENIMIENTO', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/mantenimiento/check-out',
      headers: { authorization: `Bearer ${operadorToken}` },
      payload: {
        reservaId,
        conforme: false,
        observaciones: 'Filtro de aire acondicionado roto y mancha en alfombra principal.',
        descripcionTrabajo: 'Reparar A/C y lavado industrial de alfombra.',
        asignadoAId: operarioUsuarioId,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.data.reservaId, reservaId);
    assert.equal(body.data.estadoReserva, 'COMPLETADA');
    assert.equal(body.data.conforme, false);
    assert.ok(body.data.ordenTrabajo);
    assert.equal(body.data.ordenTrabajo.tipo, 'REPARACION');
    assert.equal(body.data.ordenTrabajo.prioridad, 'ALTA');

    // Comprobar que la propiedad pasó a EN_MANTENIMIENTO
    const updatedProp = await db.prisma.propiedad.findUnique({
      where: { id: propiedadId },
    });
    assert.equal(updatedProp?.estadoOperativo, 'EN_MANTENIMIENTO');

    // Comprobar que la reserva quedó COMPLETADA
    const updatedRes = await db.prisma.reserva.findUnique({
      where: { id: reservaId },
    });
    assert.equal(updatedRes?.estado, 'COMPLETADA');
  });

  it('3. HU-14 y HU-17: Crear y asignar orden de trabajo con avisos y trazabilidad', async () => {
    const payload = {
      propiedadId,
      titulo: 'Pintura y resane de pared sala',
      descripcion: 'Resanar pequeños orificios y aplicar pintura blanca mate.',
      tipo: 'PINTURA',
      prioridad: 'MEDIA',
      costoEstimado: 250.0,
      asignadoAId: operarioUsuarioId,
      cambiarEstadoPropiedad: true,
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/mantenimiento/ordenes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });

    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.ok(body.data.id);
    assert.equal(body.data.titulo, 'Pintura y resane de pared sala');
    assert.equal(body.data.costoEstimado, 250);
    assert.equal(body.data.estado, 'PENDIENTE');
    assert.ok(body.data.asignadoA);
    assert.equal(body.data.asignadoA.id, operarioUsuarioId);

    // Auditoría de asignación HU-17
    const auditEvents = await db.prisma.auditoriaEvento.findMany({
      where: { entidadId: body.data.id },
    });
    assert.ok(auditEvents.length > 0);
    assert.equal(auditEvents[0].accion, 'CREAR_ORDEN_TRABAJO');
  });

  it('4. HU-16: Actualizar estado de orden a COMPLETADA y restablecer propiedad a OPERATIVA', async () => {
    // 1. Crear orden
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/mantenimiento/ordenes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        propiedadId,
        titulo: 'Limpieza profunda de salida',
        descripcion: 'Desinfección integral y reposición de toallas.',
        tipo: 'LIMPIEZA',
        prioridad: 'BAJA',
        cambiarEstadoPropiedad: true,
      },
    });
    const orderId = createRes.json().data.id;

    // Verificar propiedad en mantenimiento
    let prop = await db.prisma.propiedad.findUnique({ where: { id: propiedadId } });
    assert.equal(prop?.estadoOperativo, 'EN_MANTENIMIENTO');

    // 2. Completar la orden
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/mantenimiento/ordenes/${orderId}/estado`,
      headers: { authorization: `Bearer ${operadorToken}` },
      payload: {
        estado: 'COMPLETADA',
        costoReal: 120.0,
        notasResolucion: 'Limpieza finalizada con éxito. Inmueble impecable.',
        restablecerPropiedadOperativa: true,
      },
    });

    assert.equal(updateRes.statusCode, 200);
    const body = updateRes.json();
    assert.equal(body.data.estado, 'COMPLETADA');
    assert.equal(body.data.costoReal, 120.0);
    assert.ok(body.data.completadoEn);

    // 3. Verificar que la propiedad regresó automáticamente a OPERATIVA
    prop = await db.prisma.propiedad.findUnique({ where: { id: propiedadId } });
    assert.equal(prop?.estadoOperativo, 'OPERATIVA');
  });

  it('5. HU-16: Rechaza con 400 PREMATURE_PROPERTY_RESTORATION si se solicita restablecer propiedad mientras la orden sigue PENDIENTE o EN_PROGRESO', async () => {
    // 1. Crear orden que coloca la propiedad en mantenimiento
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/mantenimiento/ordenes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        propiedadId,
        titulo: 'Fuga de agua en lavabo',
        descripcion: 'Reparación de cañería con goteo constante.',
        tipo: 'REPARACION',
        prioridad: 'ALTA',
        cambiarEstadoPropiedad: true,
      },
    });
    const orderId = createRes.json().data.id;

    // 2. Intentar avanzar a EN_PROGRESO solicitando restablecerPropiedadOperativa prematuramente
    const prematureRes1 = await app.inject({
      method: 'PATCH',
      url: `/api/mantenimiento/ordenes/${orderId}/estado`,
      headers: { authorization: `Bearer ${operadorToken}` },
      payload: {
        estado: 'EN_PROGRESO',
        restablecerPropiedadOperativa: true,
      },
    });

    assert.equal(prematureRes1.statusCode, 400);
    const body1 = prematureRes1.json();
    assert.equal(body1.error.code, 'PREMATURE_PROPERTY_RESTORATION');

    // 3. Intentar mantener PENDIENTE solicitando restablecerPropiedadOperativa
    const prematureRes2 = await app.inject({
      method: 'PATCH',
      url: `/api/mantenimiento/ordenes/${orderId}/estado`,
      headers: { authorization: `Bearer ${operadorToken}` },
      payload: {
        estado: 'PENDIENTE',
        restablecerPropiedadOperativa: true,
      },
    });

    assert.equal(prematureRes2.statusCode, 400);
    const body2 = prematureRes2.json();
    assert.equal(body2.error.code, 'PREMATURE_PROPERTY_RESTORATION');

    // 4. Confirmar que la propiedad permanece estrictamente en EN_MANTENIMIENTO
    const prop = await db.prisma.propiedad.findUnique({ where: { id: propiedadId } });
    assert.equal(prop?.estadoOperativo, 'EN_MANTENIMIENTO');
  });

  it('6. HU-16: Rechaza restablecimiento a OPERATIVA con 400 ACTIVE_WORK_ORDERS_EXIST si aún existen otros trabajos activos en la propiedad', async () => {
    // 1. Crear Orden A y Orden B en la misma propiedad
    const resA = await app.inject({
      method: 'POST',
      url: '/api/mantenimiento/ordenes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        propiedadId,
        titulo: 'Trabajo A: Reparar cerradura',
        descripcion: 'Reparación de cerradura principal con perno de seguridad',
        tipo: 'REPARACION',
        prioridad: 'ALTA',
        cambiarEstadoPropiedad: true,
      },
    });
    const orderAId = resA.json().data.id;

    const resB = await app.inject({
      method: 'POST',
      url: '/api/mantenimiento/ordenes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        propiedadId,
        titulo: 'Trabajo B: Pintura de cielo raso',
        descripcion: 'Pintura y acabado de cielo raso en sala principal',
        tipo: 'PINTURA',
        prioridad: 'MEDIA',
      },
    });
    const orderBId = resB.json().data.id;

    // 2. Intentar completar la Orden A solicitando restablecer la propiedad, pero Orden B sigue PENDIENTE
    const attemptRes = await app.inject({
      method: 'PATCH',
      url: `/api/mantenimiento/ordenes/${orderAId}/estado`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        estado: 'COMPLETADA',
        costoReal: 100,
        notasResolucion: 'Cerradura cambiada',
        restablecerPropiedadOperativa: true,
      },
    });

    assert.equal(attemptRes.statusCode, 400);
    const body = attemptRes.json();
    assert.equal(body.error.code, 'ACTIVE_WORK_ORDERS_EXIST');

    // 3. Verificar que la propiedad NO fue restaurada a OPERATIVA
    let prop = await db.prisma.propiedad.findUnique({ where: { id: propiedadId } });
    assert.equal(prop?.estadoOperativo, 'EN_MANTENIMIENTO');

    // 4. Completar la Orden B sin restablecer aún
    await app.inject({
      method: 'PATCH',
      url: `/api/mantenimiento/ordenes/${orderBId}/estado`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        estado: 'COMPLETADA',
        costoReal: 80,
      },
    });

    // 5. Ahora que no hay órdenes pendientes, completar la Orden A y restablecer tiene éxito
    const successRes = await app.inject({
      method: 'PATCH',
      url: `/api/mantenimiento/ordenes/${orderAId}/estado`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        estado: 'COMPLETADA',
        costoReal: 100,
        restablecerPropiedadOperativa: true,
      },
    });

    assert.equal(successRes.statusCode, 200);
    prop = await db.prisma.propiedad.findUnique({ where: { id: propiedadId } });
    assert.equal(prop?.estadoOperativo, 'OPERATIVA');
  });
});
