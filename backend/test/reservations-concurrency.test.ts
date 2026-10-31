import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app/app.js';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { seedDatabase } from '../src/scripts/seed.js';

const testDbUrl = getRequiredTestDatabaseUrl();

describe('Hito 3 — Reservas, Disponibilidad, Calendario y Concurrencia (PostgreSQL)', () => {
  let db: ReturnType<typeof createDatabase>;
  let app: ReturnType<typeof buildApp>;

  before(async () => {
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
    await safeResetTestDatabase(testDbUrl);
    db = createDatabase(testDbUrl);
    await db.check();
    await seedDatabase(db.prisma);
    app = buildApp({ prisma: db.prisma, checkDatabase: db.check });
  });

  after(async () => {
    await app.close();
    await db.close();
  });

  describe('1. Consulta de Disponibilidad e Intervalos Semiabiertos [ingreso, salida)', () => {
    it('detecta solapes en fechas ocupadas por reservas activas con estricta privacidad', async () => {
      // res-01 está en prop-01 del 2026-11-10 al 2026-11-15 (CONFIRMADA)
      const res = await app.inject({
        method: 'GET',
        url: '/api/propiedades/prop-01/disponibilidad?ingreso=2026-11-12&salida=2026-11-14',
      });
      assert.equal(res.statusCode, 200);
      const data = res.json();
      assert.equal(data.disponible, false);

      // Verificación de privacidad: Jamás filtrar identificadores de reserva ni datos personales de otros huéspedes
      assert.ok(!JSON.stringify(data).includes('res-01'), 'No debe revelar el ID de la reserva en conflicto');
      assert.ok(!JSON.stringify(data).includes('hue-01'), 'No debe revelar el ID del huésped');
      assert.ok(!JSON.stringify(data).includes('Alejandro'), 'No debe revelar el nombre del huésped');
      assert.ok(data.motivo.includes('no están disponibles'));
    });

    it('permite estancias consecutivas exactamente acopladas [ingreso, salida)', async () => {
      // res-01 sale el 2026-11-15. Un nuevo huésped que entra el 2026-11-15 y sale el 2026-11-18 es admitido.
      const res = await app.inject({
        method: 'GET',
        url: '/api/propiedades/prop-01/disponibilidad?ingreso=2026-11-18&salida=2026-11-20',
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().disponible, true);
    });

    it('rechaza fechas con salida menor o igual a ingreso', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/propiedades/prop-01/disponibilidad?ingreso=2026-11-20&salida=2026-11-20',
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, 'VALIDATION_ERROR');
    });

    it('rechaza fechas inexistentes en el calendario real (ej. 2026-02-30 o 2026-04-31)', async () => {
      // Febrero 2026 no tiene 30 días
      const resFeb30 = await app.inject({
        method: 'GET',
        url: '/api/propiedades/prop-01/disponibilidad?ingreso=2026-02-30&salida=2026-03-05',
      });
      assert.equal(resFeb30.statusCode, 400);
      assert.ok(resFeb30.json().error.message.includes('calendario'));

      // Abril no tiene 31 días
      const resApr31 = await app.inject({
        method: 'GET',
        url: '/api/propiedades/prop-01/disponibilidad?ingreso=2026-04-31&salida=2026-05-02',
      });
      assert.equal(resApr31.statusCode, 400);
      assert.ok(resApr31.json().error.message.includes('calendario'));
    });

    it('indica no disponible si la propiedad está en mantenimiento o inactiva', async () => {
      // prop-03 está EN_MANTENIMIENTO
      const resMaint = await app.inject({
        method: 'GET',
        url: '/api/propiedades/prop-03/disponibilidad?ingreso=2026-12-10&salida=2026-12-15',
      });
      assert.equal(resMaint.statusCode, 200);
      assert.equal(resMaint.json().disponible, false);
      assert.ok(resMaint.json().motivo.includes('mantenimiento'));

      // prop-05 está INACTIVA
      const resInact = await app.inject({
        method: 'GET',
        url: '/api/propiedades/prop-05/disponibilidad?ingreso=2026-12-10&salida=2026-12-15',
      });
      assert.equal(resInact.statusCode, 200);
      assert.equal(resInact.json().disponible, false);
      assert.ok(resInact.json().motivo.includes('inactiva'));
    });
  });

  describe('2. Ciclo de Vida de Reserva (Creación, Confirmación, Cambio de Fechas y Cancelación)', () => {
    it('crea solicitud de reserva en estado SOLICITADA con persistencia y auditoría', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          id: 'res-test-lifecycle',
          propiedadId: 'prop-02',
          huespedId: 'hue-02',
          ingreso: '2026-11-01',
          salida: '2026-11-05',
          montoAcordado: 880,
          origen: 'WEB',
          notas: 'Reserva para prueba de ciclo de vida',
        },
      });

      assert.equal(res.statusCode, 201);
      const data = res.json();
      assert.equal(data.id, 'res-test-lifecycle');
      assert.equal(data.estado, 'SOLICITADA');
      assert.equal(data.noches, 4);

      // Verificar persistencia en PostgreSQL
      const inDb = await db.prisma.reserva.findUnique({ where: { id: 'res-test-lifecycle' } });
      assert.ok(inDb, 'La reserva debe existir en PostgreSQL');
      assert.equal(inDb.estado, 'SOLICITADA');

      // Verificar auditoría
      const audit = await db.prisma.auditoriaEvento.findFirst({
        where: { entidad: 'Reserva', entidadId: 'res-test-lifecycle', accion: 'CREAR_SOLICITUD_RESERVA' },
      });
      assert.ok(audit, 'Debe registrarse auditoría de creación');
      assert.equal(audit.actor, 'admin@daplace.example.invalid');
    });

    it('rechaza creación si las fechas se solapan con reserva activa existente (409)', async () => {
      const resConflict = await app.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-02',
          huespedId: 'hue-03',
          ingreso: '2026-11-03', // Solapa con 2026-11-01 a 2026-11-05
          salida: '2026-11-07',
          montoAcordado: 900,
        },
      });

      assert.equal(resConflict.statusCode, 409);
      assert.equal(resConflict.json().error.code, 'RESERVATION_CONFLICT');
    });

    it('confirma la reserva solicitada atómicamente', async () => {
      const confirmRes = await app.inject({
        method: 'POST',
        url: '/api/reservas/res-test-lifecycle/confirmar',
      });

      assert.equal(confirmRes.statusCode, 200);
      assert.equal(confirmRes.json().estado, 'CONFIRMADA');

      const inDb = await db.prisma.reserva.findUnique({ where: { id: 'res-test-lifecycle' } });
      assert.equal(inDb?.estado, 'CONFIRMADA');
    });

    it('reprograma fechas excluyendo la propia reserva del chequeo de solape', async () => {
      // Mover del 2026-11-01 al 2026-11-02 a 2026-11-06 (mismo inmueble)
      const updateRes = await app.inject({
        method: 'PATCH',
        url: '/api/reservas/res-test-lifecycle/fechas',
        payload: {
          ingreso: '2026-11-02',
          salida: '2026-11-06',
          montoAcordado: 880,
        },
      });

      assert.equal(updateRes.statusCode, 200);
      assert.equal(updateRes.json().ingreso, '2026-11-02');
      assert.equal(updateRes.json().salida, '2026-11-06');
    });

    it('cancela reserva y libera disponibilidad inmediatamente para nuevas reservas', async () => {
      // 1. Cancelar
      const cancelRes = await app.inject({
        method: 'POST',
        url: '/api/reservas/res-test-lifecycle/cancelar',
        payload: { motivo: 'Cliente canceló por viaje cancelado' },
      });
      assert.equal(cancelRes.statusCode, 200);
      assert.equal(cancelRes.json().estado, 'CANCELADA');

      // 2. Comprobar disponibilidad en esas mismas fechas: ahora debe estar DISPONIBLE
      const availRes = await app.inject({
        method: 'GET',
        url: '/api/propiedades/prop-02/disponibilidad?ingreso=2026-11-02&salida=2026-11-06',
      });
      assert.equal(availRes.statusCode, 200);
      assert.equal(availRes.json().disponible, true, 'Las fechas canceladas deben quedar libres');

      // 3. Crear otra reserva en ese intervalo liberado: debe tener éxito
      const newBookRes = await app.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          id: 'res-test-rebooked',
          propiedadId: 'prop-02',
          huespedId: 'hue-01',
          ingreso: '2026-11-02',
          salida: '2026-11-06',
          montoAcordado: 880,
        },
      });
      assert.equal(newBookRes.statusCode, 201);
    });
  });

  describe('3. Prueba de Concurrencia Real sobre PostgreSQL (Prevención Crítica de Overbooking)', () => {
    it('garantiza que de múltiples solicitudes concurrentes sobre el mismo intervalo, exactamente UNA se acepta y las demás reciben 409', async () => {
      // Fecha a disputar: 2026-12-20 a 2026-12-25 en prop-04
      const targetDates = {
        propiedadId: 'prop-04',
        ingreso: '2026-12-20',
        salida: '2026-12-25',
        montoAcordado: 3250,
      };

      // Disparar 5 solicitudes estrictamente simultáneas con Promise.all
      const requests = Array.from({ length: 5 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/reservas',
          payload: {
            id: `res-concurrent-${i + 1}`,
            ...targetDates,
            huespedId: i % 2 === 0 ? 'hue-01' : 'hue-02',
            notas: `Intento concurrente #${i + 1}`,
          },
        })
      );

      const responses = await Promise.all(requests);

      const successResponses = responses.filter((r) => r.statusCode === 201);
      const conflictResponses = responses.filter((r) => r.statusCode === 409);

      // Exigencia transaccional matemática:
      assert.equal(successResponses.length, 1, 'Exactamente UNA solicitud concurrente debe ser aceptada (201)');
      assert.equal(conflictResponses.length, 4, 'Todas las demás solicitudes concurrentes deben ser rechazadas con conflicto 409');

      for (const cr of conflictResponses) {
        assert.equal(cr.json().error.code, 'RESERVATION_CONFLICT');
      }

      // Comprobar estado en PostgreSQL real
      const countInDb = await db.prisma.reserva.count({
        where: {
          propiedadId: 'prop-04',
          ingreso: new Date('2026-12-20T00:00:00Z'),
          salida: new Date('2026-12-25T00:00:00Z'),
        },
      });

      assert.equal(countInDb, 1, 'En PostgreSQL debe persistir exactamente 1 registro, sin duplicados ni escrituras parciales');
    });
  });

  describe('4. Endpoint de Calendario Operativo', () => {
    it('obtiene cuadrícula mensual de ocupación y resumen de ocupación', async () => {
      // Consultar prop-01 para Noviembre 2026 (mes con res-01 y res-06 consecutivas)
      const res = await app.inject({
        method: 'GET',
        url: '/api/calendario?propiedadId=prop-01&year=2026&month=11',
      });

      assert.equal(res.statusCode, 200);
      const data = res.json();
      assert.equal(data.propiedadId, 'prop-01');
      assert.equal(data.year, 2026);
      assert.equal(data.month, 11);

      assert.ok(data.summary.totalDays === 30, 'Noviembre tiene 30 días');
      assert.ok(data.summary.occupiedDays > 0, 'Debe haber días ocupados');
      assert.ok(typeof data.summary.occupancyRate === 'number');

      // Verificar que el 15 de Noviembre (transición de res-01 a res-06) está marcado como TRANSICION
      const day15 = data.days.find((d: any) => d.date === '2026-11-15');
      assert.ok(day15, 'El día 15 debe estar presente');
      assert.equal(day15.status, 'TRANSICION');

      // Días dentro de res-01 (ej. 11 de Noviembre) están como CONFIRMADA
      const day11 = data.days.find((d: any) => d.date === '2026-11-11');
      assert.equal(day11.status, 'CONFIRMADA');

      // Día libre (ej. 28 de Noviembre) está como DISPONIBLE
      const day28 = data.days.find((d: any) => d.date === '2026-11-28');
      assert.equal(day28.status, 'DISPONIBLE');
    });
  });
});
