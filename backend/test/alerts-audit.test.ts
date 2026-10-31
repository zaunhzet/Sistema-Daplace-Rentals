import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { buildApp } from '../src/app/app.js';
import { PrismaAuthRepository } from '../src/modules/auth/auth.repository.js';
import { AuthService } from '../src/modules/auth/auth.service.js';

const testDbUrl = getRequiredTestDatabaseUrl();
const TEST_JWT_SECRET = 'secreto_jwt_super_seguro_para_pruebas_alerts_audit_test!';

describe('HU-11 & HU-20 — Alertas Internas de Reserva y Consola de Auditoría', () => {
  let db: ReturnType<typeof createDatabase>;
  let repository: PrismaAuthRepository;
  let app: ReturnType<typeof buildApp>;

  let adminToken: string;
  let operadorToken: string;
  let propietarioToken: string;

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

    // Usuarios
    const usrAdmin = await db.prisma.usuario.create({
      data: { id: 'usr-admin-aa', nombre: 'Admin Master', email: 'admin@daplace.pe', rol: 'ADMIN' },
    });
    await repository.createUser({
      email: 'admin@daplace.pe',
      passwordHash,
      nombre: 'Admin Master',
      rol: 'ADMINISTRADOR',
      usuarioId: usrAdmin.id,
    });

    const usrOp = await db.prisma.usuario.create({
      data: { id: 'usr-op-aa', nombre: 'Operador Turno', email: 'operador@daplace.pe', rol: 'OPERADOR' },
    });
    await repository.createUser({
      email: 'operador@daplace.pe',
      passwordHash,
      nombre: 'Operador Turno',
      rol: 'OPERADOR',
      usuarioId: usrOp.id,
    });

    const usrProp = await db.prisma.usuario.create({
      data: { id: 'usr-prop-aa', nombre: 'Propietario Inmueble', email: 'propietario@daplace.pe', rol: 'PROPIETARIO' },
    });
    await repository.createUser({
      email: 'propietario@daplace.pe',
      passwordHash,
      nombre: 'Propietario Inmueble',
      rol: 'PROPIETARIO',
      usuarioId: usrProp.id,
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
    propietarioToken = await login('propietario@daplace.pe');
  });

  describe('HU-20: Consola de Trazabilidad y Auditoría', () => {
    it('1. Solo ADMINISTRADOR puede acceder a la bitácora de auditoría; OPERADOR y PROPIETARIO reciben 403', async () => {
      // Registrar algunos eventos de prueba
      await db.prisma.auditoriaEvento.createMany({
        data: [
          {
            entidad: 'Reserva',
            entidadId: 'res-audit-1',
            accion: 'CREAR_RESERVA',
            actor: 'admin@daplace.pe',
            motivo: 'Reserva creada vía API',
            detalles: { noches: 3 },
          },
          {
            entidad: 'Pago',
            entidadId: 'pago-audit-1',
            accion: 'CONCILIAR_PAGO',
            actor: 'admin@daplace.pe',
            motivo: 'Comprobante bancario validado',
            detalles: { monto: 1200 },
          },
        ],
      });

      // Admin -> 200 OK con datos
      const resAdmin = await app.inject({
        method: 'GET',
        url: '/api/auditoria',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(resAdmin.statusCode, 200);
      const bodyAdmin = JSON.parse(resAdmin.body);
      assert.equal(bodyAdmin.data.length, 2);
      assert.equal(bodyAdmin.meta.total, 2);

      // Operador -> 403 Forbidden
      const resOp = await app.inject({
        method: 'GET',
        url: '/api/auditoria',
        headers: { authorization: `Bearer ${operadorToken}` },
      });
      assert.equal(resOp.statusCode, 403);

      // Propietario -> 403 Forbidden
      const resProp = await app.inject({
        method: 'GET',
        url: '/api/auditoria',
        headers: { authorization: `Bearer ${propietarioToken}` },
      });
      assert.equal(resProp.statusCode, 403);
    });

    it('2. Filtra la bitácora por entidad, búsqueda y aplica paginación exacta', async () => {
      await db.prisma.auditoriaEvento.createMany({
        data: [
          { entidad: 'Reserva', entidadId: 'res-1', accion: 'CREAR_RESERVA', actor: 'operador@daplace.pe', motivo: 'Alta manual' },
          { entidad: 'Reserva', entidadId: 'res-2', accion: 'CONFIRMAR_RESERVA', actor: 'admin@daplace.pe', motivo: 'Confirmación' },
          { entidad: 'Gasto', entidadId: 'gasto-1', accion: 'REGISTRAR_GASTO', actor: 'operador@daplace.pe', motivo: 'Reparación baño' },
        ],
      });

      // Filtrar por entidad = Gasto
      const resGasto = await app.inject({
        method: 'GET',
        url: '/api/auditoria?entidad=Gasto',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(resGasto.statusCode, 200);
      const bodyGasto = JSON.parse(resGasto.body);
      assert.equal(bodyGasto.data.length, 1);
      assert.equal(bodyGasto.data[0].entidadId, 'gasto-1');

      // Paginación limit 1, page 1
      const resPage1 = await app.inject({
        method: 'GET',
        url: '/api/auditoria?limit=1&page=1',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(resPage1.statusCode, 200);
      const bodyPage1 = JSON.parse(resPage1.body);
      assert.equal(bodyPage1.data.length, 1);
      assert.equal(bodyPage1.meta.total, 3);
      assert.equal(bodyPage1.meta.totalPages, 3);
    });
  });

  describe('HU-11: Alertas y Avisos Internos de Reserva', () => {
    it('3. ADMIN y OPERADOR pueden consultar alertas internas; PROPIETARIO recibe 403', async () => {
      // Crear propiedad, huésped y reserva para asociar aviso
      const prop = await db.prisma.propiedad.create({
        data: {
          id: 'prop-alert-1',
          nombre: 'Apartamento Larco',
          propietarioId: 'usr-prop-aa',
          direccion: 'Av. Larco 456',
        },
      });

      const huesped = await db.prisma.huesped.create({
        data: { nombreCompleto: 'Juan Huésped', email: 'juan@test.com' },
      });

      const reserva = await db.prisma.reserva.create({
        data: {
          id: 'res-alert-1',
          propiedadId: prop.id,
          huespedId: huesped.id,
          ingreso: new Date('2026-11-01'),
          salida: new Date('2026-11-05'),
          noches: 4,
          montoAcordado: 800,
          estado: 'SOLICITADA',
          plazoIniciadoEn: new Date('2026-11-01T10:00:00Z'),
          venceEn: new Date('2026-11-01T15:00:00Z'),
          politicaPlazoVersion: 'v1.0',
          politicaPlazoSnapshot: { duracionMs: 18000000 },
          avisoProgramadoEn: new Date('2026-11-01T13:00:00Z'),
        },
      });

      // Crear aviso de expiración próxima
      const aviso = await db.prisma.avisoReserva.create({
        data: {
          reservaId: reserva.id,
          tipoAviso: 'EXPIRACION_PROXIMA',
          politicaVersion: 'v1.0',
          venceEnSnapshot: new Date('2026-11-01T15:00:00Z'),
          programadoPara: new Date('2026-11-01T13:00:00Z'),
          canal: 'SISTEMA',
          plantilla: 'alerta-expiracion-interna',
          estado: 'PROGRAMADO',
        },
      });

      // ADMIN accede
      const resAdmin = await app.inject({
        method: 'GET',
        url: '/api/alertas',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(resAdmin.statusCode, 200);
      const bodyAdmin = JSON.parse(resAdmin.body);
      assert.equal(bodyAdmin.data.length, 1);
      assert.equal(bodyAdmin.data[0].reservaId, 'res-alert-1');
      assert.equal(bodyAdmin.data[0].reserva.propiedadNombre, 'Apartamento Larco');
      assert.equal(bodyAdmin.meta.totalPendientes, 1);

      // OPERADOR accede
      const resOp = await app.inject({
        method: 'GET',
        url: '/api/alertas',
        headers: { authorization: `Bearer ${operadorToken}` },
      });
      assert.equal(resOp.statusCode, 200);

      // PROPIETARIO recibe 403
      const resProp = await app.inject({
        method: 'GET',
        url: '/api/alertas',
        headers: { authorization: `Bearer ${propietarioToken}` },
      });
      assert.equal(resProp.statusCode, 403);

      // Marcar como atendida
      const resAtender = await app.inject({
        method: 'POST',
        url: `/api/alertas/${aviso.id}/atender`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(resAtender.statusCode, 200);
      const bodyAtender = JSON.parse(resAtender.body);
      assert.equal(bodyAtender.estado, 'ENVIADO');
    });
  });
});
