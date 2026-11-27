import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app/app.js';
import { seedDatabase } from '../src/scripts/seed.js';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';

const testDbUrl = getRequiredTestDatabaseUrl();

describe('Journey Integrado de Tesis — Ciclo Operativo Completo sobre una Misma Reserva', { concurrency: 1 }, () => {
  let db: ReturnType<typeof createDatabase>;
  let app: FastifyInstance;

  const propId = 'prop-tesis-demo';
  const huespedId = 'hue-tesis-demo';
  const montoAcordado = 1200;
  const importeAbono = '450.00';

  let reservaId = '';
  let contratoId = '';
  let pagoId = '';

  before(async () => {
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
    process.env.API_HOST = '127.0.0.1';

    await safeResetTestDatabase(testDbUrl);
    db = createDatabase(testDbUrl);
    await db.check();
    await seedDatabase(db.prisma);

    await db.prisma.propiedad.create({
      data: {
        id: propId,
        nombre: 'Departamento Ficticio Tesis',
        propietarioId: 'usr-102',
        direccion: 'Av. Ficticia 123, Miraflores, Lima',
        estadoOperativo: 'OPERATIVA',
        estadoPublicacion: 'PUBLICADA',
        activa: true,
        capacidadHuespedes: 4,
        precioBaseNoche: 300,
        moneda: 'PEN',
      },
    });

    await db.prisma.huesped.create({
      data: {
        id: huespedId,
        nombreCompleto: 'Huésped Ficticio Tesis',
        telefono: '+51 999 888 777',
        email: 'huesped.tesis@example.invalid',
        tipoDocumento: 'DNI',
        numeroDocumento: '99887766',
        nacionalidad: 'Peruana',
      },
    });

    app = buildApp({
      prisma: db.prisma,
      checkDatabase: db.check,
    });
    await app.ready();
  });

  after(async () => {
    delete process.env.ENABLE_DEMO_AUTH_BYPASS;
    await app.close();
    await db.close();
  });

  it('Paso 1: Crea solicitud de reserva (201, SOLICITADA) y refleja el intervalo ocupado en GET /api/calendario', async () => {
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      payload: {
        propiedadId: propId,
        huespedId,
        ingreso: '2027-06-10',
        salida: '2027-06-14',
        cantidadHuespedes: 2,
        montoAcordado,
        moneda: 'PEN',
        origen: 'WEB',
        notas: 'Reserva journey integrado tesis',
      },
    });

    assert.equal(resCreate.statusCode, 201);
    const created = resCreate.json();
    assert.ok(created.id);
    assert.equal(created.estado, 'SOLICITADA');
    assert.equal(created.moneda, 'PEN');
    assert.equal(created.origen, 'WEB');
    assert.equal(created.noches, 4);
    reservaId = created.id;

    const resCal = await app.inject({
      method: 'GET',
      url: `/api/calendario?propiedadId=${propId}&year=2027&month=6`,
    });

    assert.equal(resCal.statusCode, 200);
    const cal = resCal.json();
    assert.equal(cal.propiedadId, propId);

    for (const fecha of ['2027-06-10', '2027-06-11', '2027-06-12', '2027-06-13']) {
      const day = cal.days.find((d: any) => d.date === fecha);
      assert.ok(day, `Debe existir el día ${fecha} en calendario`);
      assert.equal(day.status, 'SOLICITADA');
      assert.equal(day.reservation?.id, reservaId);
    }

    const dayCheckout = cal.days.find((d: any) => d.date === '2027-06-14');
    assert.ok(dayCheckout);
    assert.equal(dayCheckout.status, 'DISPONIBLE');
    assert.equal(dayCheckout.checkoutReservation?.id, reservaId);
  });

  it('Paso 2: Rechaza solicitud solapada para la misma propiedad (409, RESERVATION_CONFLICT) y mantiene count === 1 en BD', async () => {
    assert.ok(reservaId, 'Requiere reservaId del Paso 1');

    const resConflict = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      payload: {
        propiedadId: propId,
        huespedId,
        ingreso: '2027-06-12',
        salida: '2027-06-16',
        cantidadHuespedes: 2,
        montoAcordado,
        moneda: 'PEN',
        origen: 'WEB',
      },
    });

    assert.equal(resConflict.statusCode, 409);
    assert.equal(resConflict.json().error.code, 'RESERVATION_CONFLICT');

    const countInDb = await db.prisma.reserva.count({
      where: { propiedadId: propId },
    });
    assert.equal(countInDb, 1);
  });

  it('Paso 3: Registra referencia de contrato (REFERENCIADA) y verifica persistencia al reconsultar contratos y reserva', async () => {
    assert.ok(reservaId, 'Requiere reservaId del Paso 1');

    const resPostContract = await app.inject({
      method: 'POST',
      url: `/api/reservas/${reservaId}/contratos`,
      payload: {
        nombreOriginal: 'contrato_tesis_demo_v1.pdf',
        urlReferencia: 'https://docs.daplace.internal/contracts/tesis-demo/v1.pdf',
      },
    });

    assert.equal(resPostContract.statusCode, 201);
    const createdContract = resPostContract.json().data;
    assert.ok(createdContract.id);
    assert.equal(createdContract.reservaId, reservaId);
    assert.equal(createdContract.estadoFirma, 'REFERENCIADA');
    contratoId = createdContract.id;

    const resGetContracts = await app.inject({
      method: 'GET',
      url: `/api/reservas/${reservaId}/contratos`,
    });

    assert.equal(resGetContracts.statusCode, 200);
    const contracts = resGetContracts.json().data;
    assert.ok(Array.isArray(contracts));
    const found = contracts.find((c: any) => c.id === contratoId);
    assert.ok(found, 'El contrato debe persistir al reconsultar');
    assert.equal(found.estadoFirma, 'REFERENCIADA');

    const resGetReserva = await app.inject({
      method: 'GET',
      url: `/api/reservas/${reservaId}`,
    });

    assert.equal(resGetReserva.statusCode, 200);
    const reservaDetail = resGetReserva.json();
    assert.equal(reservaDetail.id, reservaId);
    assert.equal(reservaDetail.estado, 'SOLICITADA');
    assert.equal(reservaDetail.moneda, 'PEN');
    assert.equal(reservaDetail.origen, 'WEB');
  });

  it('Paso 4: Registra abono (201, PENDIENTE_CONCILIACION) con cuenta enmascarada ****4444 sin reducir saldoPendiente', async () => {
    assert.ok(reservaId, 'Requiere reservaId del Paso 1');

    const resResumenPrevio = await app.inject({
      method: 'GET',
      url: `/api/reservas/${reservaId}/resumen-financiero`,
    });
    assert.equal(resResumenPrevio.statusCode, 200);
    const montoAcordadoPrevio = resResumenPrevio.json().data.montoAcordado;
    assert.equal(montoAcordadoPrevio, '1200.00');

    const resPago = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId,
        importe: importeAbono,
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'BCP-TESIS-0001',
        fechaPago: '2027-06-01',
        cuentaReferencia: '****4444',
        notas: 'Abono inicial journey tesis',
      },
    });

    assert.equal(resPago.statusCode, 201);
    const pago = resPago.json().data;
    assert.ok(pago.id);
    assert.equal(pago.estado, 'PENDIENTE_CONCILIACION');
    assert.equal(pago.moneda, 'PEN');
    assert.equal(pago.importe, importeAbono);
    assert.equal(pago.cuentaReferencia, '****4444');
    pagoId = pago.id;

    const resResumenDespues = await app.inject({
      method: 'GET',
      url: `/api/reservas/${reservaId}/resumen-financiero`,
    });
    assert.equal(resResumenDespues.statusCode, 200);
    const resumen = resResumenDespues.json().data;
    assert.equal(resumen.totalPagosPendientes, importeAbono);
    assert.equal(resumen.totalPagosConciliados, '0.00');
    assert.equal(resumen.saldoPendiente, montoAcordadoPrevio);
  });

  it('Paso 5: Concilia el abono (200, CONCILIADO) y reduce saldoPendiente exactamente por el importe del abono', async () => {
    assert.ok(reservaId, 'Requiere reservaId del Paso 1');
    assert.ok(pagoId, 'Requiere pagoId del Paso 4');

    const resConciliar = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/conciliar`,
      payload: {
        notas: 'Conciliado en journey integrado de tesis',
      },
    });

    assert.equal(resConciliar.statusCode, 200);
    const conciliado = resConciliar.json().data;
    assert.equal(conciliado.id, pagoId);
    assert.equal(conciliado.estado, 'CONCILIADO');

    const resResumen = await app.inject({
      method: 'GET',
      url: `/api/reservas/${reservaId}/resumen-financiero`,
    });
    assert.equal(resResumen.statusCode, 200);
    const resumen = resResumen.json().data;
    assert.equal(resumen.montoAcordado, '1200.00');
    assert.equal(resumen.totalPagosConciliados, '450.00');
    assert.equal(resumen.totalPagosPendientes, '0.00');
    assert.equal(resumen.saldoPendiente, '750.00');
  });
});
