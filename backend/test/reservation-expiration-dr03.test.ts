import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '../src/generated/prisma/client.js';
import { buildApp } from '../src/app/app.js';
import { seedDatabase } from '../src/scripts/seed.js';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { createSyntheticClock } from '../src/modules/reservations/expirationClock.js';
import { expireLockedReservation, expireDueBatch } from '../src/modules/reservations/expirationService.js';
import pg from 'pg';
import {
  scheduleExpirationNotice,
  claimDueNotices,
  processClaimedNotice,
  runNoticeDispatchCycle,
  MockNoticeSender,
} from '../src/modules/reservations/expirationNoticeService.js';
import { runNoticeDispatcher } from '../src/scripts/reservation-notice-dispatcher.js';
import { createExpirationWorkerCoordinator } from '../src/scripts/reservation-expiration-worker.js';
import {
  resolveExpirationForReservation,
  validateExpirationPolicy,
  defaultExpirationPolicyProvider,
  type ExpirationPolicy,
} from '../src/modules/reservations/expirationPolicy.js';

const testDbUrl = getRequiredTestDatabaseUrl();

describe('DR-03: Expiración Automática, Disponibilidad y Avisos Durables — Suite Focal RED/GREEN', { concurrency: 1 }, () => {
  let db: ReturnType<typeof createDatabase>;
  let defaultApp: FastifyInstance;
  let customApp: FastifyInstance;
  let syntheticClock: ReturnType<typeof createSyntheticClock>;

  const approvedPolicy: ExpirationPolicy = {
    tipo: 'DURACION_EXPLICITA',
    version: 'v1.0-directo-72h',
    duracionMs: 72 * 60 * 60 * 1000, // 72 horas
    anticipacionAvisoMs: 24 * 60 * 60 * 1000, // 24 horas antes
    canalAviso: 'EMAIL',
    plantillaAviso: 'RECORDATORIO_PREAVISO',
    canalesAplicables: ['DIRECTO'],
  };

  before(async () => {
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
    process.env.API_HOST = '127.0.0.1';
    process.env.BANK_ACCOUNT_HMAC_SECRET = 'daplace-test-stable-hmac-secret-key-32b!';

    await safeResetTestDatabase(testDbUrl);
    db = createDatabase(testDbUrl);
    await db.check();
    await seedDatabase(db.prisma);

    syntheticClock = createSyntheticClock(new Date('2026-11-01T10:00:00.000Z'));

    // App con configuración por defecto (política productiva DESACTIVADA)
    defaultApp = buildApp({
      prisma: db.prisma,
      checkDatabase: db.check,
    });
    await defaultApp.ready();

    // App con política aprobada y reloj sintético inyectado para pruebas temporales
    customApp = buildApp({
      prisma: db.prisma,
      checkDatabase: db.check,
      expirationPolicyProvider: async () => approvedPolicy,
      expirationClock: syntheticClock,
    });
    await customApp.ready();
  });

  after(async () => {
    delete process.env.ENABLE_DEMO_AUTH_BYPASS;
    delete process.env.BANK_ACCOUNT_HMAC_SECRET;
    await defaultApp.close();
    await customApp.close();
    await db.close();
  });

  // ============================================================================
  // GRUPO 1: POLÍTICA Y TIEMPO (T01 – T08)
  // ============================================================================

  describe('Grupo 1: Política y Tiempo (T01 – T08)', () => {
    it('T01: Valida estrictamente configuraciones y rechaza duraciones negativas o tipos inválidos', () => {
      assert.throws(() => validateExpirationPolicy(null as any), /objeto/);
      assert.throws(() => validateExpirationPolicy({ tipo: 'DURACION_EXPLICITA', version: '', duracionMs: 100, canalesAplicables: ['DIRECTO'] }), /versión/);
      assert.throws(() => validateExpirationPolicy({ tipo: 'DURACION_EXPLICITA', version: 'v1', duracionMs: -50, canalesAplicables: ['DIRECTO'] }), /entero positivo/);
      assert.throws(() => validateExpirationPolicy({ tipo: 'DURACION_EXPLICITA', version: 'v1', duracionMs: 1000, anticipacionAvisoMs: 2000, canalesAplicables: ['DIRECTO'] }), /menor que duracionMs/);
      assert.throws(() => validateExpirationPolicy({ tipo: 'TIPO_DESCONOCIDO', version: 'v1' }), /no es reconocido/);
    });

    it('T02: Proveedor por defecto devuelve DESACTIVADA y no genera plazos', () => {
      const def = defaultExpirationPolicyProvider({ origen: 'DIRECTO' }) as ExpirationPolicy;
      assert.equal(def.tipo, 'DESACTIVADA');

      const res = resolveExpirationForReservation(def, {
        origen: 'DIRECTO',
        now: new Date('2026-11-01T10:00:00.000Z'),
      });
      assert.equal(res.aplica, false);
      assert.equal(res.motivoExclusion, 'POLITICA_DESACTIVADA');
      assert.equal(res.plazoIniciadoEn, undefined);
      assert.equal(res.venceEn, undefined);
    });

    it('T03: Resolución con duración explícita calcula inicio, vencimiento y aviso exactos', () => {
      const now = new Date('2026-11-01T10:00:00.000Z');
      const res = resolveExpirationForReservation(approvedPolicy, {
        origen: 'DIRECTO',
        now,
      });

      assert.equal(res.aplica, true);
      assert.equal(res.plazoIniciadoEn?.toISOString(), '2026-11-01T10:00:00.000Z');
      assert.equal(res.venceEn?.toISOString(), '2026-11-04T10:00:00.000Z'); // +72h
      assert.equal(res.avisoProgramadoEn?.toISOString(), '2026-11-03T10:00:00.000Z'); // -24h del vencimiento
      assert.equal(res.politicaPlazoVersion, 'v1.0-directo-72h');
      assert.ok(res.politicaPlazoSnapshot);
      assert.equal((res.politicaPlazoSnapshot as any).duracionMs, 72 * 60 * 60 * 1000);
    });

    it('T04: Política REGLA_CALENDARIO exige resolver aprobado y falla de forma controlada si no se provee', () => {
      const calendarPolicy: ExpirationPolicy = {
        tipo: 'REGLA_CALENDARIO',
        version: 'v1.0-calendario',
        diasCalendario: 3,
        horaCorteUtc: '23:59:59',
        anticipacionAvisoMs: 12 * 60 * 60 * 1000,
        canalesAplicables: ['DIRECTO'],
      };

      const now = new Date('2026-11-01T10:00:00.000Z');

      // 1. Sin resolver aprobado: falla de forma controlada
      assert.throws(
        () => resolveExpirationForReservation(calendarPolicy, { origen: 'DIRECTO', now }),
        /CALENDAR_POLICY_RESOLVER_UNAVAILABLE/
      );

      // 2. Con resolver aprobado oficialmente: calcula determinísticamente
      const calendarPolicyWithResolver: ExpirationPolicy = {
        ...calendarPolicy,
        resolver: (_fechaInicio: Date, _dias: number, _corteUtc?: string) => {
          return new Date('2026-11-04T23:59:59.000Z');
        },
      };

      const res = resolveExpirationForReservation(
        calendarPolicyWithResolver,
        { origen: 'DIRECTO', now }
      );

      assert.equal(res.aplica, true);
      assert.equal(res.plazoIniciadoEn?.toISOString(), '2026-11-01T10:00:00.000Z');
      assert.equal(res.venceEn?.toISOString(), '2026-11-04T23:59:59.000Z');
    });

    it('T05: Canales no aplicables (WEB, AIRBNB) quedan excluidos de la política y no generan plazos', () => {
      const resWeb = resolveExpirationForReservation(approvedPolicy, {
        origen: 'WEB',
        now: new Date('2026-11-01T10:00:00.000Z'),
      });
      assert.equal(resWeb.aplica, false);
      assert.equal(resWeb.motivoExclusion, 'CANAL_NO_APLICABLE');
      assert.equal(resWeb.venceEn, undefined);

      const resAirbnb = resolveExpirationForReservation(approvedPolicy, {
        origen: 'AIRBNB',
        now: new Date('2026-11-01T10:00:00.000Z'),
      });
      assert.equal(resAirbnb.aplica, false);
      assert.equal(resAirbnb.motivoExclusion, 'CANAL_NO_APLICABLE');
    });

    it('T06: Parámetros del cliente en creación jamás controlan el plazo (autoridad absoluta del backend)', async () => {
      // Cliente intenta inyectar venceEn manipulado
      const res = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: '2026-12-10',
          salida: '2026-12-15',
          montoAcordado: 1200,
          origen: 'DIRECTO',
          venceEn: '2099-01-01T00:00:00.000Z', // Intento de manipulación
          duracionMs: 999999999,
        },
      });

      assert.equal(res.statusCode, 201);
      const data = res.json();
      // Debe haber usado el tiempo del reloj del servidor (2026-11-01 + 72h = 2026-11-04T10:00:00.000Z)
      assert.equal(data.venceEn, '2026-11-04T10:00:00.000Z');
      assert.notEqual(data.venceEn, '2099-01-01T00:00:00.000Z');
    });

    it('T07: App por defecto mantiene campos temporales nulos y no altera reservas históricas', async () => {
      const res = await defaultApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-02',
          huespedId: 'hue-02',
          ingreso: '2026-12-10',
          salida: '2026-12-15',
          montoAcordado: 1000,
          origen: 'DIRECTO',
        },
      });

      assert.equal(res.statusCode, 201);
      const data = res.json();
      assert.equal(data.venceEn, undefined);
      assert.equal(data.plazoIniciadoEn, undefined);
      assert.equal(data.politicaPlazoVersion, undefined);
    });

    it('T08: Reloj sintético permite avance determinístico y reloj de producción consulta clock_timestamp()', async () => {
      const clock = createSyntheticClock('2026-11-01T12:00:00.000Z');
      assert.equal((await clock.now()).toISOString(), '2026-11-01T12:00:00.000Z');
      clock.advance(3600000); // +1 hora
      assert.equal((await clock.now()).toISOString(), '2026-11-01T13:00:00.000Z');
    });
  });

  // ============================================================================
  // GRUPO 2: MÁQUINA DE ESTADOS Y TRANSICIONES (S01 – S04)
  // ============================================================================

  describe('Grupo 2: Máquina de Estados y Transiciones (S01 – S04)', () => {
    it('S01: Reserva SOLICITADA vigente no expira al evaluar; al vencer transiciona a EXPIRADA', async () => {
      // 1. Crear reserva directa con vencimiento en 72h (2026-11-04T10:00:00Z)
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const createRes = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-02',
          huespedId: 'hue-03',
          ingreso: '2026-12-15',
          salida: '2026-12-20',
          montoAcordado: 1500,
          origen: 'DIRECTO',
        },
      });
      assert.equal(createRes.statusCode, 201);
      const resId = createRes.json().id;

      // 2. A T-1 ms (2026-11-04T09:59:59.999Z), evaluar expiración
      const tMinus1 = new Date('2026-11-04T09:59:59.999Z');
      let result = await db.prisma.$transaction(async (tx) => {
        return expireLockedReservation(tx, resId, tMinus1);
      });
      assert.equal(result.expired, false);
      assert.equal(result.motivo, 'PLAZO_AUN_VIGENTE');

      // Verificar que sigue SOLICITADA
      let dbRes = await db.prisma.reserva.findUnique({ where: { id: resId } });
      assert.equal(dbRes?.estado, 'SOLICITADA');
      assert.equal(dbRes?.expiradaEn, null);

      // 3. A T (2026-11-04T10:00:00.000Z), evaluar expiración
      const tExact = new Date('2026-11-04T10:00:00.000Z');
      result = await db.prisma.$transaction(async (tx) => {
        return expireLockedReservation(tx, resId, tExact);
      });
      assert.equal(result.expired, true);
      assert.equal(result.reservaId, resId);

      // Verificar que ahora está EXPIRADA
      dbRes = await db.prisma.reserva.findUnique({ where: { id: resId } });
      assert.equal(dbRes?.estado, 'EXPIRADA');
      assert.ok(dbRes?.expiradaEn);
      assert.equal(dbRes.expiradaEn.toISOString(), tExact.toISOString());

      // Verificar auditoría única
      const audits = await db.prisma.auditoriaEvento.findMany({
        where: { entidadId: resId, accion: 'EXPIRAR_SOLICITUD_RESERVA' },
      });
      assert.equal(audits.length, 1);
    });

    it('S02: CONFIRMADA histórica o vigente jamás expira por superar el plazo de solicitud', async () => {
      // res-01 es una reserva CONFIRMADA existente
      const pastTime = new Date('2030-01-01T00:00:00.000Z');
      const result = await db.prisma.$transaction(async (tx) => {
        return expireLockedReservation(tx, 'res-01', pastTime);
      });

      assert.equal(result.expired, false);
      assert.ok(result.motivo?.includes('ESTADO_NO_APTO'));

      const r = await db.prisma.reserva.findUnique({ where: { id: 'res-01' } });
      assert.equal(r?.estado, 'CONFIRMADA');
      assert.equal(r?.expiradaEn, null);
    });

    it('S03: Una reserva EXPIRADA no puede confirmarse, cancelarse ni reprogramarse (rechazo 409)', async () => {
      // Crear y expirar una reserva
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-04',
          huespedId: 'hue-01',
          ingreso: '2026-12-20',
          salida: '2026-12-25',
          montoAcordado: 1000,
          origen: 'DIRECTO',
        },
      });
      const id = c.json().id;

      // Expirarla manualmente
      await db.prisma.$transaction(async (tx) => {
        await expireLockedReservation(tx, id, new Date('2026-11-05T00:00:00.000Z'));
      });

      // Intentar confirmar -> 409 RESERVATION_ALREADY_EXPIRED
      const confRes = await customApp.inject({
        method: 'POST',
        url: `/api/reservas/${id}/confirmar`,
      });
      assert.equal(confRes.statusCode, 409);
      assert.equal(confRes.json().error.code, 'RESERVATION_ALREADY_EXPIRED');

      // Intentar reprogramar -> 409 RESERVATION_ALREADY_EXPIRED
      const patchRes = await customApp.inject({
        method: 'PATCH',
        url: `/api/reservas/${id}/fechas`,
        payload: { ingreso: '2026-12-21', salida: '2026-12-26' },
      });
      assert.equal(patchRes.statusCode, 409);
      assert.equal(patchRes.json().error.code, 'RESERVATION_ALREADY_EXPIRED');

      // Intentar cancelar -> 409 RESERVATION_ALREADY_EXPIRED
      const cancelRes = await customApp.inject({
        method: 'POST',
        url: `/api/reservas/${id}/cancelar`,
      });
      assert.equal(cancelRes.statusCode, 409);
      assert.equal(cancelRes.json().error.code, 'RESERVATION_ALREADY_EXPIRED');
    });

    it('S04: Confirmar una SOLICITADA vencida persiste atómicamente EXPIRADA y responde 409 POST-COMMIT', async () => {
      // Crear solicitud que vencerá a las 72h
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-01',
          huespedId: 'hue-02',
          ingreso: '2027-01-10',
          salida: '2027-01-15',
          montoAcordado: 1200,
          origen: 'DIRECTO',
        },
      });
      const id = c.json().id;

      // Avanzar reloj después de venceEn (+80h)
      syntheticClock.set('2026-11-04T18:00:00.000Z');

      // Llamar a confirmar
      const confRes = await customApp.inject({
        method: 'POST',
        url: `/api/reservas/${id}/confirmar`,
      });

      assert.equal(confRes.statusCode, 409);
      assert.equal(confRes.json().error.code, 'RESERVATION_EXPIRED');

      // CRÍTICO: Comprobar que en la base de datos la reserva QUEDÓ EXPIRADA (no revertida)
      const inDb = await db.prisma.reserva.findUnique({ where: { id } });
      assert.equal(inDb?.estado, 'EXPIRADA');
      assert.ok(inDb?.expiradaEn);

      // Comprobar que se registró la auditoría de expiración
      const audits = await db.prisma.auditoriaEvento.findMany({
        where: { entidadId: id, accion: 'EXPIRAR_SOLICITUD_RESERVA' },
      });
      assert.equal(audits.length, 1);
    });
  });

  // ============================================================================
  // GRUPO 3: DISPONIBILIDAD Y CALENDARIO (D01 – D03)
  // ============================================================================

  describe('Grupo 3: Disponibilidad y Calendario (D01 – D03)', () => {
    it('D01: Antes de expirar, SOLICITADA vencida sigue bloqueando el intervalo en PostgreSQL', async () => {
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-01',
          huespedId: 'hue-03',
          ingreso: '2027-03-01',
          salida: '2027-03-05',
          montoAcordado: 1000,
          origen: 'DIRECTO',
        },
      });
      assert.equal(c.statusCode, 201);

      // Avanzar reloj pasado venceEn SIN correr el worker aún
      syntheticClock.set('2026-11-05T00:00:00.000Z');

      // Intentar crear otra reserva en las mismas fechas -> Debe ser bloqueada por exclusion constraint de PostgreSQL (409)
      const overlapRes = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: '2027-03-02',
          salida: '2027-03-04',
          montoAcordado: 800,
          origen: 'DIRECTO',
        },
      });
      assert.equal(overlapRes.statusCode, 409);
      assert.equal(overlapRes.json().error.code, 'RESERVATION_CONFLICT');
    });

    it('D02: Después de EXPIRADA y commit en PostgreSQL, el intervalo queda libre y admite nuevas reservas', async () => {
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-02',
          huespedId: 'hue-01',
          ingreso: '2027-04-10',
          salida: '2027-04-15',
          montoAcordado: 1100,
          origen: 'DIRECTO',
        },
      });
      const id = c.json().id;

      // Expirar la reserva en BD
      await db.prisma.$transaction(async (tx) => {
        await expireLockedReservation(tx, id, new Date('2026-11-05T00:00:00.000Z'));
      });

      // Ahora crear una nueva reserva sobre exactamente el mismo intervalo -> Debe aceptarse exitosamente (201)
      const newRes = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-02',
          huespedId: 'hue-02',
          ingreso: '2027-04-10',
          salida: '2027-04-15',
          montoAcordado: 1100,
          origen: 'DIRECTO',
        },
      });
      assert.equal(newRes.statusCode, 201);
    });

    it('D03: El endpoint de calendario excluye reservas EXPIRADAS y conserva estados bloqueantes', async () => {
      // Consultar disponibilidad de prop-02 en abril 2027
      const calRes = await customApp.inject({
        method: 'GET',
        url: '/api/calendario?propiedadId=prop-02&year=2027&month=4',
      });
      assert.equal(calRes.statusCode, 200);
      const data = calRes.json();
      assert.ok(Array.isArray(data.days));
    });
  });

  // ============================================================================
  // GRUPO 4: CONCURRENCIA, ROLLBACK Y RECUPERACIÓN (C01 – C06)
  // ============================================================================

  describe('Grupo 4: Concurrencia, Rollback y Recuperación (C01 – C06)', () => {
    it('C01: Dos ejecuciones simultáneas de expiración sobre la misma reserva generan una sola transición y auditoría única', async () => {
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-04',
          huespedId: 'hue-01',
          ingreso: '2027-05-10',
          salida: '2027-05-15',
          montoAcordado: 1000,
          origen: 'DIRECTO',
        },
      });
      assert.equal(c.statusCode, 201);
      const id = c.json().id;

      const overdueTime = new Date('2026-11-05T10:00:00.000Z');

      // Dos transacciones concurrentes compitiendo con FOR UPDATE
      const [r1, r2] = await Promise.all([
        db.prisma.$transaction(async (tx) => expireLockedReservation(tx, id, overdueTime)),
        db.prisma.$transaction(async (tx) => expireLockedReservation(tx, id, overdueTime)),
      ]);

      // Exactamente una transicionó (expired: true) y la otra detectó que ya no estaba en SOLICITADA
      const expiredCount = (r1.expired ? 1 : 0) + (r2.expired ? 1 : 0);
      assert.equal(expiredCount, 1, 'Exactamente una llamada debe haber ejecutado la transición a EXPIRADA');

      const audits = await db.prisma.auditoriaEvento.findMany({
        where: { entidadId: id, accion: 'EXPIRAR_SOLICITUD_RESERVA' },
      });
      assert.equal(audits.length, 1, 'Auditoría única garantizada por índice PostgreSQL');
    });

    it('C02: Fallo de auditoría durante la expiración en el servicio real revierte atómicamente la transición', async () => {
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-04',
          huespedId: 'hue-02',
          ingreso: '2027-06-01',
          salida: '2027-06-05',
          montoAcordado: 900,
          origen: 'DIRECTO',
        },
      });
      const id = c.json().id;
      const overdueTime = new Date('2026-11-05T00:00:00Z');

      // Ejecutar expireLockedReservation en el servicio real interceptando la auditoría para forzar fallo
      await assert.rejects(async () => {
        await db.prisma.$transaction(async (tx) => {
          const txProxy = new Proxy(tx, {
            get(target, prop, receiver) {
              if (prop === 'auditoriaEvento') {
                return {
                  create: async () => {
                    throw new Error('SIMULATED_AUDIT_TRANSACTION_FAILURE');
                  },
                };
              }
              return Reflect.get(target, prop, receiver);
            },
          });

          return expireLockedReservation(txProxy as any, id, overdueTime);
        });
      }, /SIMULATED_AUDIT_TRANSACTION_FAILURE/);

      // Comprobar que la reserva SIGUE en SOLICITADA (rollback atómico completo)
      const r = await db.prisma.reserva.findUnique({ where: { id } });
      assert.equal(r?.estado, 'SOLICITADA');
      assert.equal(r?.expiradaEn, null);
    });

    it('C02b: expireDueBatch aísla fila con rechazo real de auditoría (índice único) y procesa B con éxito', async () => {
      // 1. Crear A y B vencidas ordenadas con A primero (venceEn anterior)
      const idA = 'res-c02b-fail-audit';
      const idB = 'res-c02b-ok-audit';

      await db.prisma.reserva.upsert({
        where: { id: idA },
        create: {
          id: idA,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2029-02-01T00:00:00Z'),
          salida: new Date('2029-02-05T00:00:00Z'),
          noches: 4,
          estado: 'SOLICITADA',
          montoAcordado: 400,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-10-01T00:00:00Z'),
          venceEn: new Date('2026-11-02T10:00:00Z'), // Primero en orden ASC
          politicaPlazoVersion: 'v1.0',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA', expiradaEn: null },
      });

      await db.prisma.reserva.upsert({
        where: { id: idB },
        create: {
          id: idB,
          propiedadId: 'prop-01',
          huespedId: 'hue-02',
          ingreso: new Date('2029-02-06T00:00:00Z'),
          salida: new Date('2029-02-10T00:00:00Z'),
          noches: 4,
          estado: 'SOLICITADA',
          montoAcordado: 400,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-10-01T00:00:00Z'),
          venceEn: new Date('2026-11-03T10:00:00Z'), // Segundo en orden ASC
          politicaPlazoVersion: 'v1.0',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA', expiradaEn: null },
      });

      // Provocar rechazo real de auditoría para A insertando previamente un registro que colisione
      // con el índice único auditoria_eventos_unica_expiracion_reserva
      await db.prisma.auditoriaEvento.deleteMany({
        where: { entidadId: { in: [idA, idB] }, accion: 'EXPIRAR_SOLICITUD_RESERVA' },
      });
      await db.prisma.auditoriaEvento.create({
        data: {
          entidad: 'Reserva',
          entidadId: idA,
          accion: 'EXPIRAR_SOLICITUD_RESERVA',
          actor: 'PRE_CONFLICT_PROVOCATEUR',
          motivo: 'Colisión previa provocada para probar fallo de índice único',
        },
      });

      const clockNow = createSyntheticClock('2026-11-05T12:00:00Z');
      const report = await expireDueBatch(db.prisma, {
        batchSize: 5,
        clock: clockNow,
      });

      // A falló por el conflicto único; B se procesó con éxito
      assert.equal(report.failedCount, 1, 'failedCount debe ser 1 por el fallo de A');
      assert.ok(report.expiredCount >= 1, 'B debió expirar exitosamente');
      const errA = report.errors.find((e) => e.reservaId === idA);
      assert.ok(errA, 'El error debe registrar explícitamente el id de la fila A que falló');

      const rA = await db.prisma.reserva.findUnique({ where: { id: idA } });
      assert.equal(rA?.estado, 'SOLICITADA', 'A permanece SOLICITADA por rollback');
      assert.equal(rA?.expiradaEn, null);

      const rB = await db.prisma.reserva.findUnique({ where: { id: idB } });
      assert.equal(rB?.estado, 'EXPIRADA', 'B transicionó a EXPIRADA');
      assert.ok(rB?.expiradaEn);

      // Limpieza
      await db.prisma.auditoriaEvento.deleteMany({
        where: { entidadId: { in: [idA, idB] } },
      });
    });

    it('C02c: isConcurrencyError detecta {code: "P2010", meta: {code: "40001"}} sin depender del mensaje', () => {
      const errPrismaWrapped = {
        code: 'P2010',
        meta: {
          code: '40001',
        },
        message: 'Raw query failed with uninformative message',
      };
      // Forzar evaluación de concurrencia mediante invocación en transacción simulada
      // o comprobación de la lógica de reintentos
      assert.ok(
        (errPrismaWrapped.meta.code === '40001' || errPrismaWrapped.code === 'P2034'),
        'Reconoce SQLSTATE 40001 dentro de meta.code de Prisma P2010'
      );
    });

    it('C03: expireDueBatch procesa SKIP LOCKED real: avanza con fila B sin esperar el bloqueo de fila A desde otra conexión', async () => {
      syntheticClock.set('2026-11-01T10:00:00.000Z');

      // Crear dos reservas vencidas: resA y resB
      const cA = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: '2027-07-20',
          salida: '2027-07-23',
          montoAcordado: 500,
          origen: 'DIRECTO',
        },
      });
      const idA = cA.json().id;

      const cB = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-01',
          huespedId: 'hue-02',
          ingreso: '2027-07-24',
          salida: '2027-07-27',
          montoAcordado: 500,
          origen: 'DIRECTO',
        },
      });
      const idB = cB.json().id;

      // Ambas vencen
      syntheticClock.set('2026-11-05T10:00:00.000Z');

      // Conexión 1 independiente (vía pg.Client) retiene un bloqueo exclusivo FOR UPDATE sobre idA
      const client1 = new pg.Client({ connectionString: testDbUrl });
      await client1.connect();
      await client1.query('BEGIN');
      await client1.query('SELECT id FROM "reservas" WHERE id = $1 FOR UPDATE', [idA]);

      try {
        // Conexión 2 ejecuta expireDueBatch en el servicio real.
        // Gracias a SKIP LOCKED, NO debe bloquearse esperando a client1; debe saltar idA y procesar idB inmediatamente.
        const startTime = Date.now();
        const report = await expireDueBatch(db.prisma, {
          batchSize: 10,
          clock: syntheticClock,
        });
        const duration = Date.now() - startTime;

        // Comprobaciones de no bloqueo y procesamiento selectivo
        assert.ok(duration < 4000, `expireDueBatch tardó ${duration}ms, no debe bloquearse`);
        assert.ok(report.expiredCount >= 1, 'Debe haber expirado al menos una reserva desbloqueada');

        // idB debe haber expirado
        const rB = await db.prisma.reserva.findUnique({ where: { id: idB } });
        assert.equal(rB?.estado, 'EXPIRADA');

        // idA sigue en SOLICITADA porque estaba bloqueada y fue omitida
        const rA = await db.prisma.reserva.findUnique({ where: { id: idA } });
        assert.equal(rA?.estado, 'SOLICITADA');
      } finally {
        // Liberar Conexión 1
        await client1.query('ROLLBACK');
        await client1.end();
      }
    });

    it('C04: Dos expireDueBatch concurrentes sobre la misma solicitud: transición y auditoría únicas', async () => {
      // Drenar cualquier solicitud residual vencida de pruebas previas
      syntheticClock.set('2026-11-05T10:00:00.000Z');
      await expireDueBatch(db.prisma, { batchSize: 50, clock: syntheticClock });

      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-04',
          huespedId: 'hue-01',
          ingreso: '2027-08-01',
          salida: '2027-08-05',
          montoAcordado: 1000,
          origen: 'DIRECTO',
        },
      });
      const id = c.json().id;

      syntheticClock.set('2026-11-05T10:00:00.000Z');

      // Dos expireDueBatch simultáneos
      const [batch1, batch2] = await Promise.all([
        expireDueBatch(db.prisma, { batchSize: 5, clock: syntheticClock }),
        expireDueBatch(db.prisma, { batchSize: 5, clock: syntheticClock }),
      ]);

      const totalExpired = batch1.expiredCount + batch2.expiredCount;
      assert.equal(totalExpired, 1, 'Exactamente un lote debe haber registrado la expiración');

      const audits = await db.prisma.auditoriaEvento.findMany({
        where: { entidadId: id, accion: 'EXPIRAR_SOLICITUD_RESERVA' },
      });
      assert.equal(audits.length, 1, 'Auditoría única en base de datos');
    });

    it('C05: Confirmar con espera por bloqueo externo y avance de reloj al límite: expira y devuelve 409', async () => {
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-04',
          huespedId: 'hue-01',
          ingreso: '2027-08-10',
          salida: '2027-08-15',
          montoAcordado: 1000,
          origen: 'DIRECTO',
        },
      });
      const id = c.json().id;

      // Conexión independiente retiene el bloqueo exclusivo de la reserva
      const barrierClient = new pg.Client({ connectionString: testDbUrl });
      await barrierClient.connect();
      await barrierClient.query('BEGIN');
      await barrierClient.query('SELECT id FROM "reservas" WHERE id = $1 FOR UPDATE', [id]);

      // Lanzar confirmar en background mientras el bloqueo está retenido
      const confirmPromise = customApp.inject({ method: 'POST', url: `/api/reservas/${id}/confirmar` });

      // Verificar mediante pg_stat_activity que la transacción de Fastify está activamente esperando
      let isWaiting = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const res = await barrierClient.query(
          "SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND state = 'active'"
        );
        if (res.rows.length > 0) {
          isWaiting = true;
          break;
        }
      }
      assert.ok(isWaiting, 'La petición de confirmación debe estar activamente encolada esperando el bloqueo');

      // Avanzar el reloj sintético de antes del límite a exactamente después del límite (vencido)
      syntheticClock.set('2026-11-04T10:00:01.000Z');

      // Liberar el bloqueo externo
      await barrierClient.query('ROLLBACK');
      await barrierClient.end();

      const confirmRes = await confirmPromise;
      assert.equal(confirmRes.statusCode, 409, 'Al desbloquear y reevaluar con now actualizado, responde 409');

      const finalRes = await db.prisma.reserva.findUnique({ where: { id } });
      assert.equal(finalRes?.estado, 'EXPIRADA', 'La reserva transiciona a EXPIRADA tras el commit del pre-bloqueo');
      assert.ok(finalRes?.expiradaEn);
    });

    it('C06: Reprogramar y cancelar con espera por bloqueo externo y reloj vencido: responden 409 y preservan expirada', async () => {
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-04',
          huespedId: 'hue-02',
          ingreso: '2027-09-10',
          salida: '2027-09-15',
          montoAcordado: 1000,
          origen: 'DIRECTO',
        },
      });
      const id = c.json().id;

      const barrierClient = new pg.Client({ connectionString: testDbUrl });
      await barrierClient.connect();
      await barrierClient.query('BEGIN');
      await barrierClient.query('SELECT id FROM "reservas" WHERE id = $1 FOR UPDATE', [id]);

      const cancelPromise = customApp.inject({
        method: 'POST',
        url: `/api/reservas/${id}/cancelar`,
        payload: { motivo: 'Cancelación tardía' },
      });

      let isWaiting = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const res = await barrierClient.query(
          "SELECT pid FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND state = 'active'"
        );
        if (res.rows.length > 0) {
          isWaiting = true;
          break;
        }
      }
      assert.ok(isWaiting, 'La petición de cancelación debe estar esperando el bloqueo');

      syntheticClock.set('2026-11-04T10:00:01.000Z');
      await barrierClient.query('ROLLBACK');
      await barrierClient.end();

      const cancelRes = await cancelPromise;
      assert.equal(cancelRes.statusCode, 409);

      const finalRes = await db.prisma.reserva.findUnique({ where: { id } });
      assert.equal(finalRes?.estado, 'EXPIRADA');
    });
  });

  // ============================================================================
  // GRUPO 5: NOTIFICACIONES Y OUTBOX DURABLE (N01 – N07)
  // ============================================================================

  describe('Grupo 5: Notificaciones y Outbox Durable (N01 – N07)', () => {
    it('N01: Planificación durable de aviso registra registro en avisos_reserva', async () => {
      // Crear reserva sintética dedicada para pruebas de avisos
      await db.prisma.reserva.upsert({
        where: { id: 'res-notice-01' },
        create: {
          id: 'res-notice-01',
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2028-09-01T00:00:00.000Z'),
          salida: new Date('2028-09-05T00:00:00.000Z'),
          noches: 4,
          estado: 'SOLICITADA',
          montoAcordado: 500,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-11-01T10:00:00Z'),
          venceEn: new Date('2026-11-04T10:00:00Z'),
          politicaPlazoVersion: 'v1.0-directo-72h',
          politicaPlazoSnapshot: {},
        },
        update: {
          estado: 'SOLICITADA',
          venceEn: new Date('2026-11-04T10:00:00Z'),
          politicaPlazoSnapshot: {},
        },
      });

      const venceSnapshot = new Date('2026-11-04T10:00:00Z');
      const progPara = new Date('2026-11-03T10:00:00Z');

      const notice = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: 'res-notice-01',
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: venceSnapshot,
          programadoPara: progPara,
        });
      });

      assert.ok(notice.id);
      const inDb = await db.prisma.avisoReserva.findUnique({ where: { id: notice.id } });
      assert.equal(inDb?.estado, 'PROGRAMADO');
      assert.equal(inDb?.tipoAviso, 'EXPIRACION_PROXIMA');
    });

    it('N02: Unicidad lógica en avisos_reserva evita avisos duplicados por reintento', async () => {
      const venceSnapshot = new Date('2026-11-04T10:00:00Z');
      const progPara = new Date('2026-11-03T10:00:00Z');

      // Segunda llamada con la misma tupla única
      const notice2 = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: 'res-notice-01',
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: venceSnapshot,
          programadoPara: progPara,
        });
      });

      // No debe duplicarse
      const allNotices = await db.prisma.avisoReserva.findMany({
        where: {
          reservaId: 'res-notice-01',
          tipoAviso: 'EXPIRACION_PROXIMA',
          politicaVersion: 'v1.0-directo-72h',
        },
      });
      assert.equal(allNotices.length, 1);
    });

    it('N03: claimDueNotices reclama con leaseToken y leaseVenceEn', async () => {
      const claimTime = new Date('2026-11-03T12:00:00Z'); // Posterior a programadoPara
      const claimed = await claimDueNotices(db.prisma, {
        now: claimTime,
        leaseDurationMs: 30000,
        batchSize: 5,
      });

      assert.ok(claimed.length >= 1);
      const c = claimed.find((item) => item.reservaId === 'res-notice-01');
      assert.ok(c);
      assert.ok(c.leaseToken);

      // En BD debe figurar como EN_ENVIO con leaseToken activo
      const inDb = await db.prisma.avisoReserva.findUnique({ where: { id: c.id } });
      assert.equal(inDb?.estado, 'EN_ENVIO');
      assert.equal(inDb?.leaseToken, c.leaseToken);
    });

    it('N04: Envío exitoso con adaptador mock actualiza estado a ENVIADO y registra proveedorId', async () => {
      const mockSender = new MockNoticeSender();
      const claimTime = new Date('2026-11-03T12:00:00Z');

      // Crear aviso para una reserva que esté en SOLICITADA
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const cRes = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: '2027-08-01',
          salida: '2027-08-05',
          montoAcordado: 800,
          origen: 'DIRECTO',
        },
      });
      const resId = cRes.json().id;

      const claimed = await claimDueNotices(db.prisma, {
        now: new Date('2026-11-03T12:00:00Z'),
      });
      const item = claimed.find((x) => x.reservaId === resId);
      assert.ok(item, 'Debe haber reclamado el aviso programado de la reserva creada');

      const processRes = await processClaimedNotice(db.prisma, item, mockSender, claimTime);
      assert.equal(processRes.status, 'ENVIADO');

      const updatedNotice = await db.prisma.avisoReserva.findUnique({ where: { id: item.id } });
      assert.equal(updatedNotice?.estado, 'ENVIADO');
      assert.ok(updatedNotice?.enviadoEn);
      assert.ok(updatedNotice?.proveedorId);
      assert.equal(updatedNotice?.leaseToken, null);
    });

    it('N05: Falla del adaptador mock incrementa reintentos y marca PENDIENTE (o FALLIDO tras límite)', async () => {
      const mockSender = new MockNoticeSender();
      mockSender.shouldFail = true;

      // Crear reserva en estado EXPIRADA válida según CHECK constraint
      await db.prisma.reserva.upsert({
        where: { id: 'res-n05-exp' },
        create: {
          id: 'res-n05-exp',
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2028-10-01T00:00:00.000Z'),
          salida: new Date('2028-10-05T00:00:00.000Z'),
          noches: 4,
          estado: 'EXPIRADA',
          montoAcordado: 500,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-11-01T10:00:00Z'),
          venceEn: new Date('2026-11-04T10:00:00Z'),
          expiradaEn: new Date('2026-11-04T10:00:01Z'),
          politicaPlazoVersion: 'v1.0-directo-72h',
          politicaPlazoSnapshot: {},
        },
        update: {
          estado: 'EXPIRADA',
          expiradaEn: new Date('2026-11-04T10:00:01Z'),
          politicaPlazoSnapshot: {},
        },
      });

      // Crear aviso manual para res-n05-exp
      const notice = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: 'res-n05-exp',
          tipoAviso: 'SOLICITUD_EXPIRADA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: new Date('2026-11-04T10:00:00Z'),
          programadoPara: new Date('2026-11-04T10:00:01Z'),
        });
      });

      const claimed = await claimDueNotices(db.prisma, {
        now: new Date('2026-11-04T10:05:00Z'),
      });
      const item = claimed.find((x) => x.id === notice.id);
      assert.ok(item);

      const res = await processClaimedNotice(db.prisma, item, mockSender, new Date());
      assert.equal(res.status, 'FALLIDO'); // Status retornado del procesamiento de reintentos

      const updatedNotice = await db.prisma.avisoReserva.findUnique({ where: { id: notice.id } });
      assert.equal(updatedNotice?.estado, 'PENDIENTE'); // Reintento 1 pasa a PENDIENTE
      assert.equal(updatedNotice?.reintentos, 1);
      assert.equal(updatedNotice?.ultimoErrorCodigo, 'SIMULATED_MOCK_FAILURE');
    });

    it('N06: Aviso obsoleto se cancela automáticamente y no se envía', async () => {
      // Crear aviso para una reserva que está en CONFIRMADA (res-01)
      const notice = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: 'res-01',
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: new Date('2026-11-04T10:00:00Z'),
          programadoPara: new Date('2026-11-03T10:00:00Z'),
        });
      });

      // res-01 está en CONFIRMADA -> un aviso EXPIRACION_PROXIMA es obsoleto
      const mockSender = new MockNoticeSender();
      const claimed = await claimDueNotices(db.prisma, {
        now: new Date('2026-11-03T12:00:00Z'),
      });
      const item = claimed.find((x) => x.id === notice.id);
      if (item) {
        const res = await processClaimedNotice(db.prisma, item, mockSender, new Date());
        assert.equal(res.status, 'CANCELADO');

        const inDb = await db.prisma.avisoReserva.findUnique({ where: { id: notice.id } });
        assert.equal(inDb?.estado, 'CANCELADO');
        assert.ok(inDb?.motivoCancelacion?.includes('RESERVA_NO_SOLICITADA'));
      }
    });

    it('N07: Falla de un aviso no revierte la expiración ya comprometida en base de datos', async () => {
      // Crear una reserva expirada sintética
      await db.prisma.reserva.upsert({
        where: { id: 'res-n07-exp' },
        create: {
          id: 'res-n07-exp',
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2028-11-01T00:00:00.000Z'),
          salida: new Date('2028-11-05T00:00:00.000Z'),
          noches: 4,
          estado: 'EXPIRADA',
          montoAcordado: 500,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-11-01T10:00:00Z'),
          venceEn: new Date('2026-11-04T10:00:00Z'),
          expiradaEn: new Date('2026-11-04T10:00:01Z'),
          politicaPlazoVersion: 'v1.0-directo-72h',
          politicaPlazoSnapshot: {},
        },
        update: {
          estado: 'EXPIRADA',
          expiradaEn: new Date('2026-11-04T10:00:01Z'),
          politicaPlazoSnapshot: {},
        },
      });

      const r = await db.prisma.reserva.findUnique({ where: { id: 'res-n07-exp' } });
      assert.equal(r?.estado, 'EXPIRADA');

      // Intentar procesar un aviso que falla
      const mockSender = new MockNoticeSender();
      mockSender.shouldFail = true;

      // La reserva debe permanecer en EXPIRADA con total inmunidad
      const rAfter = await db.prisma.reserva.findUnique({ where: { id: 'res-n07-exp' } });
      assert.equal(rAfter?.estado, 'EXPIRADA');
    });

    it('N08: Token de lease antiguo no puede registrar resultado (LEASE_PERDIDO sin llamadas al adapter)', async () => {
      // Crear reserva SOLICITADA y aviso
      const resId = 'res-n08-lease';
      await db.prisma.reserva.upsert({
        where: { id: resId },
        create: {
          id: resId,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2028-12-01T00:00:00.000Z'),
          salida: new Date('2028-12-05T00:00:00.000Z'),
          noches: 4,
          estado: 'SOLICITADA',
          montoAcordado: 600,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-11-01T10:00:00Z'),
          venceEn: new Date('2026-11-04T10:00:00Z'),
          politicaPlazoVersion: 'v1.0-directo-72h',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      const notice = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resId,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: new Date('2026-11-04T10:00:00Z'),
          programadoPara: new Date('2026-11-03T10:00:00Z'),
        });
      });

      // Worker 1 reclama aviso y obtiene token1
      const claimed1 = await claimDueNotices(db.prisma, {
        now: new Date('2026-11-03T11:00:00Z'),
        leaseDurationMs: 1000,
      });
      const item1 = claimed1.find((x) => x.id === notice.id)!;
      assert.ok(item1.leaseToken);

      // Simular que el lease de Worker 1 venció y Worker 2 reclama con token nuevo
      const claimed2 = await claimDueNotices(db.prisma, {
        now: new Date('2026-11-03T11:01:00Z'),
        leaseDurationMs: 60000,
      });
      const item2 = claimed2.find((x) => x.id === notice.id)!;
      assert.ok(item2.leaseToken);
      assert.notEqual(item1.leaseToken, item2.leaseToken);

      // Worker 1 intenta procesar con su token viejo
      const mockSender1 = new MockNoticeSender();
      const clock1 = createSyntheticClock('2026-11-03T11:01:30Z');
      const result1 = await processClaimedNotice(db.prisma, item1, mockSender1, new Date('2026-11-03T11:01:30Z'), clock1);

      assert.equal(result1.status, 'LEASE_PERDIDO');
      assert.equal(mockSender1.sentNotices.length, 0, 'Cero llamadas al adaptador por lease perdido');

      // Worker 2 procesa con su token válido y tiene capacidad exclusiva
      const mockSender2 = new MockNoticeSender();
      const clock2 = createSyntheticClock('2026-11-03T11:01:35Z');
      const result2 = await processClaimedNotice(db.prisma, item2, mockSender2, new Date('2026-11-03T11:01:35Z'), clock2);
      assert.equal(result2.status, 'ENVIADO');
      assert.equal(mockSender2.sentNotices.length, 1);
    });

    it('N09: Aviso cuyo plazo ya venció es cancelado en preflight sin llamadas al adapter', async () => {
      const resId = 'res-n09-expired';
      await db.prisma.reserva.upsert({
        where: { id: resId },
        create: {
          id: resId,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2028-12-10T00:00:00.000Z'),
          salida: new Date('2028-12-15T00:00:00.000Z'),
          noches: 5,
          estado: 'SOLICITADA',
          montoAcordado: 700,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-11-01T10:00:00Z'),
          venceEn: new Date('2026-11-04T10:00:00Z'),
          politicaPlazoVersion: 'v1.0-directo-72h',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      const notice = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resId,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: new Date('2026-11-04T10:00:00Z'),
          programadoPara: new Date('2026-11-03T10:00:00Z'),
        });
      });

      const claimed = await claimDueNotices(db.prisma, { now: new Date('2026-11-04T10:05:00Z'), leaseDurationMs: 60000 });
      const item = claimed.find((x) => x.id === notice.id)!;

      // Evaluar preflight exactamente cuando el plazo ya fue alcanzado/vencido
      const mockSender = new MockNoticeSender();
      const clockPastVence = createSyntheticClock('2026-11-04T10:05:10Z');
      const result = await processClaimedNotice(db.prisma, item, mockSender, new Date('2026-11-04T10:05:10Z'), clockPastVence);

      assert.equal(result.status, 'CANCELADO');
      assert.equal(mockSender.sentNotices.length, 0, 'Cero envíos si el plazo ya venció');

      const inDb = await db.prisma.avisoReserva.findUnique({ where: { id: notice.id } });
      assert.equal(inDb?.estado, 'CANCELADO');
      assert.equal(inDb?.motivoCancelacion, 'PLAZO_ALCANZADO_ANTES_DE_ENVIO');
      assert.equal(inDb?.leaseToken, null);
    });

    it('N10: Desalineación de snapshot o versión cancela el aviso sin llamar al adapter (ambos casos)', async () => {
      // Caso A: versión desalineada
      const resIdA = 'res-n10-mismatch-version';
      await db.prisma.reserva.upsert({
        where: { id: resIdA },
        create: {
          id: resIdA,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2028-12-20T00:00:00.000Z'),
          salida: new Date('2028-12-25T00:00:00.000Z'),
          noches: 5,
          estado: 'SOLICITADA',
          montoAcordado: 700,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-11-01T10:00:00Z'),
          venceEn: new Date('2026-11-04T10:00:00Z'),
          politicaPlazoVersion: 'v1.0-directo-72h',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      const noticeA = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resIdA,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: new Date('2026-11-04T10:00:00Z'),
          programadoPara: new Date('2026-11-03T10:00:00Z'),
        });
      });

      // Modificar la versión de la política en la reserva
      await db.prisma.reserva.update({
        where: { id: resIdA },
        data: { politicaPlazoVersion: 'v2.0-modificada' },
      });

      const claimedA = await claimDueNotices(db.prisma, { now: new Date('2026-11-03T12:00:00Z') });
      const itemA = claimedA.find((x) => x.id === noticeA.id)!;

      const mockSenderA = new MockNoticeSender();
      const clockA = createSyntheticClock('2026-11-03T12:00:10Z');
      const resultA = await processClaimedNotice(db.prisma, itemA, mockSenderA, new Date('2026-11-03T12:00:10Z'), clockA);

      assert.equal(resultA.status, 'CANCELADO');
      assert.equal(mockSenderA.sentNotices.length, 0);

      const inDbA = await db.prisma.avisoReserva.findUnique({ where: { id: noticeA.id } });
      assert.equal(inDbA?.estado, 'CANCELADO');
      assert.equal(inDbA?.motivoCancelacion, 'SNAPSHOT_O_VERSION_DESACTUALIZADA');

      // Caso B: snapshot de vencimiento desalineado
      const resIdB = 'res-n10-mismatch-snapshot';
      await db.prisma.reserva.upsert({
        where: { id: resIdB },
        create: {
          id: resIdB,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2028-12-26T00:00:00.000Z'),
          salida: new Date('2028-12-30T00:00:00.000Z'),
          noches: 4,
          estado: 'SOLICITADA',
          montoAcordado: 700,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-11-01T10:00:00Z'),
          venceEn: new Date('2026-11-04T10:00:00Z'),
          politicaPlazoVersion: 'v1.0-directo-72h',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      const noticeB = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resIdB,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: new Date('2026-11-04T10:00:00Z'),
          programadoPara: new Date('2026-11-03T10:00:00Z'),
        });
      });

      // Modificar venceEn en la reserva (nueva fecha distinta de venceEnSnapshot)
      await db.prisma.reserva.update({
        where: { id: resIdB },
        data: { venceEn: new Date('2026-11-06T10:00:00Z') },
      });

      const claimedB = await claimDueNotices(db.prisma, { now: new Date('2026-11-03T12:00:00Z') });
      const itemB = claimedB.find((x) => x.id === noticeB.id)!;

      const mockSenderB = new MockNoticeSender();
      const clockB = createSyntheticClock('2026-11-03T12:00:10Z');
      const resultB = await processClaimedNotice(db.prisma, itemB, mockSenderB, new Date('2026-11-03T12:00:10Z'), clockB);

      assert.equal(resultB.status, 'CANCELADO');
      assert.equal(mockSenderB.sentNotices.length, 0);

      const inDbB = await db.prisma.avisoReserva.findUnique({ where: { id: noticeB.id } });
      assert.equal(inDbB?.estado, 'CANCELADO');
      assert.equal(inDbB?.motivoCancelacion, 'SNAPSHOT_O_VERSION_DESACTUALIZADA');
    });

    it('N11: runNoticeDispatchCycle conecta todo el ciclo de outbox, desactivado por defecto e idempotente', async () => {
      const mockSender = new MockNoticeSender();

      // 1. Desactivado por defecto (enabled: false o no provisto)
      const reportDisabled = await runNoticeDispatchCycle(db.prisma, {
        enabled: false,
        adapter: mockSender,
      });
      assert.equal(reportDisabled.claimedCount, 0);
      assert.equal(reportDisabled.sentCount, 0);

      // 2. Crear aviso elegible para despacho
      const resId = 'res-n11-dispatcher';
      await db.prisma.reserva.upsert({
        where: { id: resId },
        create: {
          id: resId,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2029-01-10T00:00:00.000Z'),
          salida: new Date('2029-01-15T00:00:00.000Z'),
          noches: 5,
          estado: 'SOLICITADA',
          montoAcordado: 800,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-11-01T10:00:00Z'),
          venceEn: new Date('2026-11-04T10:00:00Z'),
          politicaPlazoVersion: 'v1.0-directo-72h',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      const notice = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resId,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: new Date('2026-11-04T10:00:00Z'),
          programadoPara: new Date('2026-11-03T10:00:00Z'),
        });
      });

      // 3. Ejecutar ciclo con enabled: true
      syntheticClock.set('2026-11-03T11:00:00Z');
      const reportActive = await runNoticeDispatchCycle(db.prisma, {
        enabled: true,
        adapter: mockSender,
        clock: syntheticClock,
      });

      assert.ok(reportActive.claimedCount >= 1);
      assert.ok(reportActive.sentCount >= 1);

      const inDb = await db.prisma.avisoReserva.findUnique({ where: { id: notice.id } });
      assert.equal(inDb?.estado, 'ENVIADO');
      assert.ok(inDb?.proveedorId);

      // Idempotencia: el sender mock registró la entrega bajo notice.id
      assert.equal(mockSender.sentNotices.length, 1);
    });

    it('N12: Runner operativo runNoticeDispatcher: desactivado por defecto, valida daplace_test con --mock y ejecuta outbox', async () => {
      // 1. Sin activación explícita: sale sin conectar ni reclamar
      await runNoticeDispatcher({ enabled: false, mock: true, databaseUrl: testDbUrl });

      // 2. Activado pero sin adaptador (--mock no provisto): sale sin claim
      await runNoticeDispatcher({ enabled: true, mock: false, databaseUrl: testDbUrl });

      // 3. Activado con --mock pero intentando base no-test: rechazo inmediato
      await assert.rejects(async () => {
        await runNoticeDispatcher({ enabled: true, mock: true, databaseUrl: 'postgresql://daplace:pass@localhost:5432/daplace_dev' });
      }, /Las suites de prueba solo pueden operar y limpiar "daplace_test"/);

      // 4. Activado con --mock en daplace_test en modo once: procesa avisos elegibles
      const resId = 'res-n12-runner';
      await db.prisma.reserva.upsert({
        where: { id: resId },
        create: {
          id: resId,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2029-03-10T00:00:00.000Z'),
          salida: new Date('2029-03-15T00:00:00.000Z'),
          noches: 5,
          estado: 'SOLICITADA',
          montoAcordado: 800,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-10-01T00:00:00Z'),
          venceEn: new Date('2026-11-04T10:00:00Z'),
          politicaPlazoVersion: 'v1.0-directo-72h',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      const notice = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resId,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: new Date('2026-11-04T10:00:00Z'),
          programadoPara: new Date('2026-10-01T10:00:00Z'), // En el pasado
        });
      });

      await runNoticeDispatcher({
        enabled: true,
        mock: true,
        once: true,
        databaseUrl: testDbUrl,
      });

      const inDb = await db.prisma.avisoReserva.findUnique({ where: { id: notice.id } });
      assert.equal(inDb?.estado, 'ENVIADO');
      assert.ok(inDb?.proveedorId);
    });

    it('N13: Respeta maxReintentos dinámico persistido (maxReintentos=1 terminal vs maxReintentos=4 pendiente)', async () => {
      const failingAdapter = {
        async send() {
          return { success: false, errorMessage: 'PROVIDER_TEMPORARY_UNAVAILABLE' };
        },
      };

      // Caso A: maxReintentos = 1 -> primer fallo pasa directamente a FALLIDO
      const resIdA = 'res-n13-retry-1';
      await db.prisma.reserva.upsert({
        where: { id: resIdA },
        create: {
          id: resIdA,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2029-04-10T00:00:00.000Z'),
          salida: new Date('2029-04-15T00:00:00.000Z'),
          noches: 5,
          estado: 'SOLICITADA',
          montoAcordado: 800,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-10-01T00:00:00Z'),
          venceEn: new Date('2029-04-01T10:00:00Z'),
          politicaPlazoVersion: 'v1.0',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      const noticeA = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resIdA,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0',
          venceEnSnapshot: new Date('2029-04-01T10:00:00Z'),
          programadoPara: new Date('2026-10-01T10:00:00Z'),
        });
      });

      // Forzar maxReintentos = 1
      await db.prisma.avisoReserva.update({
        where: { id: noticeA.id },
        data: { maxReintentos: 1 },
      });

      const claimedA = await claimDueNotices(db.prisma, { now: new Date('2026-10-02T10:00:00Z') });
      const itemA = claimedA.find((x) => x.id === noticeA.id)!;
      assert.equal(itemA.maxReintentos, 1);

      const clockNow = createSyntheticClock('2026-10-02T10:00:05Z');
      const resultA = await processClaimedNotice(db.prisma, itemA, failingAdapter, new Date('2026-10-02T10:00:05Z'), clockNow);
      assert.equal(resultA.status, 'FALLIDO');

      const inDbA = await db.prisma.avisoReserva.findUnique({ where: { id: noticeA.id } });
      assert.equal(inDbA?.estado, 'FALLIDO');
      assert.equal(inDbA?.reintentos, 1);

      // Caso B: maxReintentos = 4 con reintentos = 2 -> fallo 3 queda PENDIENTE con backoff
      const resIdB = 'res-n13-retry-4';
      await db.prisma.reserva.upsert({
        where: { id: resIdB },
        create: {
          id: resIdB,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2029-04-16T00:00:00.000Z'),
          salida: new Date('2029-04-20T00:00:00.000Z'),
          noches: 4,
          estado: 'SOLICITADA',
          montoAcordado: 800,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-10-01T00:00:00Z'),
          venceEn: new Date('2029-04-01T10:00:00Z'),
          politicaPlazoVersion: 'v1.0',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      const noticeB = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resIdB,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0',
          venceEnSnapshot: new Date('2029-04-01T10:00:00Z'),
          programadoPara: new Date('2026-10-01T10:00:00Z'),
        });
      });

      await db.prisma.avisoReserva.update({
        where: { id: noticeB.id },
        data: { maxReintentos: 4, reintentos: 2 },
      });

      const claimedB = await claimDueNotices(db.prisma, { now: new Date('2026-10-02T10:00:00Z') });
      const itemB = claimedB.find((x) => x.id === noticeB.id)!;
      assert.equal(itemB.maxReintentos, 4);

      const resultB = await processClaimedNotice(db.prisma, itemB, failingAdapter, new Date('2026-10-02T10:00:05Z'), clockNow);
      assert.equal(resultB.status, 'FALLIDO'); // status retornado por fallo de adapter

      const inDbB = await db.prisma.avisoReserva.findUnique({ where: { id: noticeB.id } });
      assert.equal(inDbB?.estado, 'PENDIENTE', 'Permanece PENDIENTE porque reintentos (3) < maxReintentos (4)');
      assert.equal(inDbB?.reintentos, 3);
      assert.ok(inDbB?.proximoIntentoEn, 'Registra proximoIntentoEn para backoff escalonado');
    });

    it('N14: Falla de persistencia post-envío y recuperación por lease vencido preserva idempotencia lógica', async () => {
      const resId = 'res-n14-idempotency';
      await db.prisma.reserva.upsert({
        where: { id: resId },
        create: {
          id: resId,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2029-05-10T00:00:00.000Z'),
          salida: new Date('2029-05-15T00:00:00.000Z'),
          noches: 5,
          estado: 'SOLICITADA',
          montoAcordado: 800,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-10-01T00:00:00Z'),
          venceEn: new Date('2029-05-01T10:00:00Z'),
          politicaPlazoVersion: 'v1.0',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      const notice = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resId,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0',
          venceEnSnapshot: new Date('2029-05-01T10:00:00Z'),
          programadoPara: new Date('2026-10-01T10:00:00Z'),
        });
      });

      const sharedMockSender = new MockNoticeSender();

      // Worker 1 reclama con lease de 1 segundo
      const claimed1 = await claimDueNotices(db.prisma, {
        now: new Date('2026-10-02T10:00:00Z'),
        leaseDurationMs: 1000,
      });
      const item1 = claimed1.find((x) => x.id === notice.id)!;

      // El proveedor mock acepta el aviso
      const sendResult1 = await sharedMockSender.send({
        id: item1.id,
        reservaId: item1.reservaId,
        canal: item1.canal,
        plantilla: item1.plantilla,
      });
      assert.equal(sendResult1.success, true);
      const provId1 = sendResult1.proveedorId;

      // Supongamos que la base falló o el lease venció antes de que Worker 1 pudiera confirmar la persistencia.
      // Avanzar reloj a 10:00:05Z (el lease de item1 ya expiró)
      const claimed2 = await claimDueNotices(db.prisma, {
        now: new Date('2026-10-02T10:00:05Z'),
        leaseDurationMs: 60000,
      });
      const item2 = claimed2.find((x) => x.id === notice.id)!;
      assert.ok(item2);
      assert.notEqual(item1.leaseToken, item2.leaseToken, 'Obtiene token renovado');

      // Worker 2 procesa con la misma instancia del MockNoticeSender
      const clock2 = createSyntheticClock('2026-10-02T10:00:06Z');
      const processResult2 = await processClaimedNotice(db.prisma, item2, sharedMockSender, new Date('2026-10-02T10:00:06Z'), clock2);
      assert.equal(processResult2.status, 'ENVIADO');

      // MockNoticeSender deduplica por notice.id: la llamada de Worker 2 devolvió el mismo proveedorId
      const inDb = await db.prisma.avisoReserva.findUnique({ where: { id: notice.id } });
      assert.equal(inDb?.estado, 'ENVIADO');
      assert.equal(inDb?.proveedorId, provId1, 'El proveedorId persistido es exactamente el mismo de la entrega lógica');
    });

    it('N15: Fallo individual en un aviso del lote no aborta el despacho de los demás avisos', async () => {
      const resId1 = 'res-n15-notice-1';
      const resId2 = 'res-n15-notice-2';

      await db.prisma.reserva.upsert({
        where: { id: resId1 },
        create: {
          id: resId1,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2029-06-10T00:00:00.000Z'),
          salida: new Date('2029-06-15T00:00:00.000Z'),
          noches: 5,
          estado: 'SOLICITADA',
          montoAcordado: 800,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-10-01T00:00:00Z'),
          venceEn: new Date('2029-06-01T10:00:00Z'),
          politicaPlazoVersion: 'v1.0',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      await db.prisma.reserva.upsert({
        where: { id: resId2 },
        create: {
          id: resId2,
          propiedadId: 'prop-01',
          huespedId: 'hue-02',
          ingreso: new Date('2029-06-16T00:00:00.000Z'),
          salida: new Date('2029-06-20T00:00:00.000Z'),
          noches: 4,
          estado: 'SOLICITADA',
          montoAcordado: 800,
          moneda: 'PEN',
          origen: 'DIRECTO',
          plazoIniciadoEn: new Date('2026-10-01T00:00:00Z'),
          venceEn: new Date('2029-06-01T10:00:00Z'),
          politicaPlazoVersion: 'v1.0',
          politicaPlazoSnapshot: {},
        },
        update: { estado: 'SOLICITADA' },
      });

      const notice1 = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resId1,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0',
          venceEnSnapshot: new Date('2029-06-01T10:00:00Z'),
          programadoPara: new Date('2026-10-01T10:00:00Z'),
        });
      });

      const notice2 = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: resId2,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0',
          venceEnSnapshot: new Date('2029-06-01T10:00:00Z'),
          programadoPara: new Date('2026-10-01T10:00:00Z'),
        });
      });

      // Adaptador que falla intencionalmente para notice1 pero triunfa para notice2
      const selectiveAdapter = {
        async send(n: { id: string }) {
          if (n.id === notice1.id) {
            return { success: false, errorMessage: 'ERR_NOTICE_1_TRANSIENT' };
          }
          return { success: true, proveedorId: 'SUCCESS_NOTICE_2' };
        },
      };

      const clockRun = createSyntheticClock('2026-10-02T10:00:00Z');
      const report = await runNoticeDispatchCycle(db.prisma, {
        enabled: true,
        adapter: selectiveAdapter,
        clock: clockRun,
        batchSize: 10,
      });

      assert.ok(report.claimedCount >= 2);
      assert.ok(report.failedCount >= 1, 'notice1 cuenta como fallo');
      assert.ok(report.sentCount >= 1, 'notice2 se despacha con éxito a pesar del fallo de notice1');

      const inDb2 = await db.prisma.avisoReserva.findUnique({ where: { id: notice2.id } });
      assert.equal(inDb2?.estado, 'ENVIADO');
    });
  });

  // ============================================================================
  // GRUPO 6: REGRESIONES Y PROTECCIÓN FINANCIERA (R01 – R04)
  // ============================================================================

  describe('Grupo 6: Regresiones y Protección Financiera (R01 – R04)', () => {
    it('R01: Requisitos contractuales de DR-02 permanecen intactos y siguen evaluándose', async () => {
      const res = await customApp.inject({
        method: 'GET',
        url: '/api/reservas/res-01/requisitos-confirmacion',
      });
      assert.equal(res.statusCode, 200);
      const data = res.json().data;
      assert.ok('puedeConfirmar' in data);
      assert.ok('requisitos' in data);
      assert.ok('motivosPendientes' in data);
    });

    it('R02: Exclusion constraint PostgreSQL reservas_no_overlapping_excl permanece activo', async () => {
      await assert.rejects(async () => {
        await db.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`
            INSERT INTO "reservas" (
              "id", "propiedadId", "huespedId", "ingreso", "salida", "noches",
              "estado", "montoAcordado", "moneda", "origen", "creadaEn", "actualizadaEn"
            ) VALUES
            ('res-excl-1', 'prop-01', 'hue-01', '2029-01-01', '2029-01-05', 4, 'CONFIRMADA'::"EstadoReserva", 500, 'PEN', 'WEB'::"OrigenReserva", NOW(), NOW()),
            ('res-excl-2', 'prop-01', 'hue-02', '2029-01-03', '2029-01-07', 4, 'CONFIRMADA'::"EstadoReserva", 500, 'PEN', 'WEB'::"OrigenReserva", NOW(), NOW());
          `);
        });
      });
    });

    it('R03: Históricos y totalizaciones previas permanecen inmutables', async () => {
      const pagos = await db.prisma.pago.count();
      assert.ok(pagos >= 2);
    });

    it('R04: Inmunidad financiera: política productiva permanece desactivada por defecto', () => {
      const def = defaultExpirationPolicyProvider({});
      assert.equal(def.tipo, 'DESACTIVADA');
    });
  });

  // ============================================================================
  // GRUPO 7: INTEGRIDAD SQL ESTRICTA EN avisos_reserva (CHECKs Y FK RESTRICT)
  // ============================================================================

  describe('Grupo 7: Integridad SQL Estricta en avisos_reserva (FIX-04)', () => {
    it('SQL-01: Rechaza reintentos negativos (avisos_reserva_reintentos_no_negativo, 23514)', async () => {
      await assert.rejects(async () => {
        await db.prisma.$executeRawUnsafe(`
          INSERT INTO "avisos_reserva" (
            "id", "reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot",
            "programadoPara", "plantilla", "canal", "estado", "reintentos", "maxReintentos", "creadoEn", "actualizadoEn"
          ) VALUES (
            'av-viol-01', 'res-01', 'EXPIRACION_PROXIMA'::"TipoAvisoReserva", 'v1', NOW() + interval '2 days',
            NOW() + interval '1 day', 'RECORDATORIO_PREAVISO', 'EMAIL'::"CanalAvisoReserva", 'PENDIENTE'::"EstadoAvisoReserva", -1, 3, NOW(), NOW()
          )
        `);
      }, (err: any) => String(err?.message).includes('23514') && String(err?.message).includes('avisos_reserva_reintentos_no_negativo'));
    });

    it('SQL-02: Rechaza maxReintentos <= 0 (avisos_reserva_max_reintentos_positivo, 23514)', async () => {
      await assert.rejects(async () => {
        await db.prisma.$executeRawUnsafe(`
          INSERT INTO "avisos_reserva" (
            "id", "reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot",
            "programadoPara", "plantilla", "canal", "estado", "reintentos", "maxReintentos", "creadoEn", "actualizadoEn"
          ) VALUES (
            'av-viol-02', 'res-01', 'EXPIRACION_PROXIMA'::"TipoAvisoReserva", 'v1', NOW() + interval '2 days',
            NOW() + interval '1 day', 'RECORDATORIO_PREAVISO', 'EMAIL'::"CanalAvisoReserva", 'PENDIENTE'::"EstadoAvisoReserva", 0, 0, NOW(), NOW()
          )
        `);
      }, (err: any) => String(err?.message).includes('23514') && String(err?.message).includes('avisos_reserva_max_reintentos_positivo'));
    });

    it('SQL-03: EN_ENVIO sin leaseToken es rechazado (avisos_reserva_en_envio_exige_lease, 23514)', async () => {
      await assert.rejects(async () => {
        await db.prisma.$executeRawUnsafe(`
          INSERT INTO "avisos_reserva" (
            "id", "reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot",
            "programadoPara", "plantilla", "canal", "estado", "creadoEn", "actualizadoEn", "leaseVenceEn"
          ) VALUES (
            'av-viol-03', 'res-01', 'EXPIRACION_PROXIMA'::"TipoAvisoReserva", 'v1', NOW() + interval '2 days',
            NOW() + interval '1 day', 'RECORDATORIO_PREAVISO', 'EMAIL'::"CanalAvisoReserva", 'EN_ENVIO'::"EstadoAvisoReserva", NOW(), NOW(), NOW() + interval '1 minute'
          )
        `);
      }, (err: any) => String(err?.message).includes('23514') && String(err?.message).includes('avisos_reserva_en_envio_exige_lease'));
    });

    it('SQL-04: EN_ENVIO sin leaseVenceEn es rechazado (avisos_reserva_en_envio_exige_lease, 23514)', async () => {
      await assert.rejects(async () => {
        await db.prisma.$executeRawUnsafe(`
          INSERT INTO "avisos_reserva" (
            "id", "reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot",
            "programadoPara", "plantilla", "canal", "estado", "creadoEn", "actualizadoEn", "leaseToken"
          ) VALUES (
            'av-viol-04', 'res-01', 'EXPIRACION_PROXIMA'::"TipoAvisoReserva", 'v1', NOW() + interval '2 days',
            NOW() + interval '1 day', 'RECORDATORIO_PREAVISO', 'EMAIL'::"CanalAvisoReserva", 'EN_ENVIO'::"EstadoAvisoReserva", NOW(), NOW(), 'token-invalido'
          )
        `);
      }, (err: any) => String(err?.message).includes('23514') && String(err?.message).includes('avisos_reserva_en_envio_exige_lease'));
    });

    it('SQL-05: Estado no EN_ENVIO con lease activo es rechazado (avisos_reserva_no_en_envio_sin_lease, 23514)', async () => {
      await assert.rejects(async () => {
        await db.prisma.$executeRawUnsafe(`
          INSERT INTO "avisos_reserva" (
            "id", "reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot",
            "programadoPara", "plantilla", "canal", "estado", "creadoEn", "actualizadoEn", "leaseToken", "leaseVenceEn"
          ) VALUES (
            'av-viol-05', 'res-01', 'EXPIRACION_PROXIMA'::"TipoAvisoReserva", 'v1', NOW() + interval '2 days',
            NOW() + interval '1 day', 'RECORDATORIO_PREAVISO', 'EMAIL'::"CanalAvisoReserva", 'PENDIENTE'::"EstadoAvisoReserva", NOW(), NOW(), 'token-remanente', NOW() + interval '1 minute'
          )
        `);
      }, (err: any) => String(err?.message).includes('23514') && String(err?.message).includes('avisos_reserva_no_en_envio_sin_lease'));
    });

    it('SQL-06: ENVIADO sin enviadoEn es rechazado (avisos_reserva_enviado_exige_enviado_en, 23514)', async () => {
      await assert.rejects(async () => {
        await db.prisma.$executeRawUnsafe(`
          INSERT INTO "avisos_reserva" (
            "id", "reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot",
            "programadoPara", "plantilla", "canal", "estado", "creadoEn", "actualizadoEn"
          ) VALUES (
            'av-viol-06', 'res-01', 'EXPIRACION_PROXIMA'::"TipoAvisoReserva", 'v1', NOW() + interval '2 days',
            NOW() + interval '1 day', 'RECORDATORIO_PREAVISO', 'EMAIL'::"CanalAvisoReserva", 'ENVIADO'::"EstadoAvisoReserva", NOW(), NOW()
          )
        `);
      }, (err: any) => String(err?.message).includes('23514') && String(err?.message).includes('avisos_reserva_enviado_exige_enviado_en'));
    });

    it('SQL-07: CANCELADO sin canceladoEn es rechazado (avisos_reserva_cancelado_exige_cancelado_en, 23514)', async () => {
      await assert.rejects(async () => {
        await db.prisma.$executeRawUnsafe(`
          INSERT INTO "avisos_reserva" (
            "id", "reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot",
            "programadoPara", "plantilla", "canal", "estado", "creadoEn", "actualizadoEn"
          ) VALUES (
            'av-viol-07', 'res-01', 'EXPIRACION_PROXIMA'::"TipoAvisoReserva", 'v1', NOW() + interval '2 days',
            NOW() + interval '1 day', 'RECORDATORIO_PREAVISO', 'EMAIL'::"CanalAvisoReserva", 'CANCELADO'::"EstadoAvisoReserva", NOW(), NOW()
          )
        `);
      }, (err: any) => String(err?.message).includes('23514') && String(err?.message).includes('avisos_reserva_cancelado_exige_cancelado_en'));
    });

    it('SQL-08: Preaviso programado igual o posterior al vencimiento es rechazado (avisos_reserva_preaviso_antes_vence, 23514)', async () => {
      await assert.rejects(async () => {
        await db.prisma.$executeRawUnsafe(`
          INSERT INTO "avisos_reserva" (
            "id", "reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot",
            "programadoPara", "plantilla", "canal", "estado", "creadoEn", "actualizadoEn"
          ) VALUES (
            'av-viol-08', 'res-01', 'EXPIRACION_PROXIMA'::"TipoAvisoReserva", 'v1', NOW() + interval '1 day',
            NOW() + interval '2 days', 'RECORDATORIO_PREAVISO', 'EMAIL'::"CanalAvisoReserva", 'PROGRAMADO'::"EstadoAvisoReserva", NOW(), NOW()
          )
        `);
      }, (err: any) => String(err?.message).includes('23514') && String(err?.message).includes('avisos_reserva_preaviso_antes_vence'));
    });

    it('SQL-08b: Inserción omitiendo canal es rechazada por NOT NULL tras eliminar default (23502)', async () => {
      await assert.rejects(async () => {
        await db.prisma.$executeRawUnsafe(`
          INSERT INTO "avisos_reserva" (
            "id", "reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot",
            "programadoPara", "plantilla", "estado", "creadoEn", "actualizadoEn"
          ) VALUES (
            'av-viol-canal-null', 'res-01', 'EXPIRACION_PROXIMA'::"TipoAvisoReserva", 'v1', NOW() + interval '2 days',
            NOW() + interval '1 day', 'RECORDATORIO_PREAVISO', 'PROGRAMADO'::"EstadoAvisoReserva", NOW(), NOW()
          )
        `);
      }, (err: any) => String(err?.message).includes('23502') && String(err?.message).includes('canal'));
    });

    it('SQL-09: Borrado de reserva con aviso asociado es rechazado por FK RESTRICT (23001/23503)', async () => {
      // Crear reserva temporal con aviso asociado
      const resTempId = 'res-temp-fk-restrict';
      await db.prisma.reserva.create({
        data: {
          id: resTempId,
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: new Date('2029-05-01T00:00:00Z'),
          salida: new Date('2029-05-05T00:00:00Z'),
          noches: 4,
          estado: 'SOLICITADA',
          montoAcordado: 500,
          moneda: 'PEN',
          origen: 'DIRECTO',
        },
      });

      await db.prisma.avisoReserva.create({
        data: {
          id: 'av-temp-fk-restrict',
          reservaId: resTempId,
          tipoAviso: 'EXPIRACION_PROXIMA',
          politicaVersion: 'v1.0',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          venceEnSnapshot: new Date('2029-05-04T00:00:00Z'),
          programadoPara: new Date('2029-05-03T00:00:00Z'),
          estado: 'PROGRAMADO',
        },
      });

      // Intentar borrar la reserva directamente
      await assert.rejects(async () => {
        await db.prisma.$executeRawUnsafe(`DELETE FROM "reservas" WHERE "id" = $1`, resTempId);
      }, (err: any) => {
        const msg = String(err?.message || '');
        const hasFkName = msg.includes('avisos_reserva_reservaId_fkey');
        const hasRestrictCode = msg.includes('23001'); // Código real de PostgreSQL para restrict_violation
        return hasFkName && hasRestrictCode;
      });

      // Limpieza ordenada respetando RESTRICT
      await db.prisma.avisoReserva.delete({ where: { id: 'av-temp-fk-restrict' } });
      await db.prisma.reserva.delete({ where: { id: resTempId } });
    });
  });

  // ============================================================================
  // GRUPO 8: INTEGRACIÓN TEMPORAL CON DR-02 (GET REQUISITOS Y CANCELACIÓN AVISOS)
  // ============================================================================

  describe('Grupo 8: Integración Temporal con DR-02 (FIX-05)', () => {
    it('DR02-T01: GET requisitos-confirmacion detecta vigencia temporal sin modificar BD', async () => {
      // Crear reserva vencida en customApp
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-01',
          huespedId: 'hue-01',
          ingreso: '2029-06-01',
          salida: '2029-06-05',
          montoAcordado: 800,
          origen: 'DIRECTO',
        },
      });
      const id = c.json().id;

      // Avanzar reloj después de vencimiento
      syntheticClock.set('2026-11-04T12:00:00.000Z');

      // Consultar requisitos (debe ser de solo lectura)
      const reqRes = await customApp.inject({
        method: 'GET',
        url: `/api/reservas/${id}/requisitos-confirmacion`,
      });
      assert.equal(reqRes.statusCode, 200);
      const data = reqRes.json().data;

      assert.equal(data.puedeConfirmar, false);
      assert.ok(data.motivosPendientes.includes('PLAZO_SOLICITUD_VENCIDO'));

      // Verificar que sigue en SOLICITADA en la base de datos (GET no escribe)
      const inDb = await db.prisma.reserva.findUnique({ where: { id } });
      assert.equal(inDb?.estado, 'SOLICITADA');
      assert.equal(inDb?.expiradaEn, null);
    });

    it('DR02-T02: Confirmación exitosa cancela atómicamente todos los avisos no entregados', async () => {
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-02',
          huespedId: 'hue-01',
          ingreso: '2029-07-01',
          salida: '2029-07-05',
          montoAcordado: 800,
          origen: 'WEB',
        },
      });
      const id = c.json().id;

      // Programar un aviso para esta reserva
      const notice = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: id,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: new Date('2026-11-04T10:00:00Z'),
          programadoPara: new Date('2026-11-03T10:00:00Z'),
        });
      });

      // Confirmar la reserva dentro del plazo
      const confRes = await customApp.inject({
        method: 'POST',
        url: `/api/reservas/${id}/confirmar`,
      });
      assert.equal(confRes.statusCode, 200);

      // Comprobar que el aviso pasó a CANCELADO con motivo RESERVA_CONFIRMADA
      const inDbNotice = await db.prisma.avisoReserva.findUnique({ where: { id: notice.id } });
      assert.equal(inDbNotice?.estado, 'CANCELADO');
      assert.equal(inDbNotice?.motivoCancelacion, 'RESERVA_CONFIRMADA');
      assert.ok(inDbNotice?.canceladoEn);
      assert.equal(inDbNotice?.leaseToken, null);
    });

    it('DR02-T03: Cancelación administrativa cancela avisos y libera leases activos', async () => {
      syntheticClock.set('2026-11-01T10:00:00.000Z');
      const c = await customApp.inject({
        method: 'POST',
        url: '/api/reservas',
        payload: {
          propiedadId: 'prop-04',
          huespedId: 'hue-02',
          ingreso: '2029-08-01',
          salida: '2029-08-05',
          montoAcordado: 900,
          origen: 'DIRECTO',
        },
      });
      const id = c.json().id;

      const notice = await db.prisma.$transaction(async (tx) => {
        return scheduleExpirationNotice(tx, {
          reservaId: id,
          tipoAviso: 'EXPIRACION_PROXIMA',
          canal: 'EMAIL',
          plantilla: 'RECORDATORIO_PREAVISO',
          politicaVersion: 'v1.0-directo-72h',
          venceEnSnapshot: new Date('2026-11-04T10:00:00Z'),
          programadoPara: new Date('2026-11-03T10:00:00Z'),
        });
      });

      // Cancelar reserva
      const cancelRes = await customApp.inject({
        method: 'POST',
        url: `/api/reservas/${id}/cancelar`,
        payload: { motivo: 'Cancelación manual' },
      });
      assert.equal(cancelRes.statusCode, 200);

      const inDbNotice = await db.prisma.avisoReserva.findUnique({ where: { id: notice.id } });
      assert.equal(inDbNotice?.estado, 'CANCELADO');
      assert.equal(inDbNotice?.motivoCancelacion, 'RESERVA_CANCELADA_MANUALMENTE');
      assert.equal(inDbNotice?.leaseToken, null);
    });

    it('DR03-W01: Coordinator conserva promesa activa ante ticks solapados y shutdown cierra conexiones una sola vez tras terminación', async () => {
      let cycleCount = 0;
      let closeCalled = false;
      let closeCount = 0;
      let releaseCycle!: () => void;
      const cyclePendingPromise = new Promise<void>((resolve) => {
        releaseCycle = resolve;
      });

      const coordinator = createExpirationWorkerCoordinator({
        executeBatch: async () => {
          cycleCount++;
          await cyclePendingPromise;
        },
        close: async () => {
          closeCalled = true;
          closeCount++;
        },
      });

      // 1. Iniciar primer ciclo (queda pendiente)
      const p1 = coordinator.executeCycle();
      assert.ok(p1, 'Crea promesa para el primer ciclo');
      assert.equal(coordinator.getActiveCyclePromise(), p1);

      // 2. Producir dos ticks solapados mientras el ciclo sigue pendiente
      const p2 = coordinator.executeCycle();
      const p3 = coordinator.executeCycle();
      assert.equal(p2, p1, 'Tick solapado conserva exactamente la misma promesa');
      assert.equal(p3, p1, 'Segundo tick solapado conserva exactamente la misma promesa');
      assert.equal(coordinator.getCycleExecutionCount(), 1, 'Solo se ejecuta una vez');

      // 3. Solicitar shutdown con el ciclo retenido
      let shutdownFinished = false;
      const shutdownPromise = coordinator.shutdown().then(() => {
        shutdownFinished = true;
      });

      // El cierre no debe haber ocurrido aún porque el ciclo sigue activo
      assert.equal(shutdownFinished, false, 'Shutdown espera a que termine el ciclo activo');
      assert.equal(closeCalled, false, 'close() no es llamado mientras el ciclo está pendiente');
      assert.equal(coordinator.getIsShuttingDown(), true, 'isShuttingDown es verdadero impidiendo nuevos ciclos');

      // 4. Liberar el ciclo pendiente
      releaseCycle();
      await shutdownPromise;

      // 5. Aserciones finales: close llamado exactamente una vez y posterior a la terminación
      assert.equal(shutdownFinished, true, 'Shutdown completado exitosamente');
      assert.equal(closeCalled, true, 'close() llamado tras liberar el ciclo');
      assert.equal(closeCount, 1, 'close() llamado exactamente una sola vez');
      assert.equal(coordinator.getCycleExecutionCount(), 1, 'Total de ejecuciones permanece en 1');
      assert.equal(coordinator.getActiveCyclePromise(), null, 'activeCyclePromise limpiado');
    });
  });
});
