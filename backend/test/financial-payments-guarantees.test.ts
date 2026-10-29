import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app/app.js';
import { seedDatabase } from '../src/scripts/seed.js';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';

const testDbUrl = getRequiredTestDatabaseUrl();

describe('BACKEND-002: Persistencia Financiera, Pagos, Conciliación y Control de Garantías', () => {
  let db: ReturnType<typeof createDatabase>;
  let app: FastifyInstance;

  before(async () => {
    // Configurar bypass local de demostración para pruebas con rol ADMIN en loopback
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
    process.env.API_HOST = '127.0.0.1';

    await safeResetTestDatabase(testDbUrl);
    db = createDatabase(testDbUrl);
    await db.check();
    await seedDatabase(db.prisma);

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

  describe('1. HU-05: Registro de Pagos, Estados y Conciliación', () => {
    it('1.1. Registra un nuevo pago en estado PENDIENTE_CONCILIACION con persistencia real y auditoría', async () => {
      const payload = {
        reservaId: 'res-01',
        importe: '350.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'BCP-OP-77491',
        fechaPago: '2026-10-28',
        notas: 'Segundo adelanto por transferencia',
        idempotencyKey: 'test-idem-key-01',
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload,
      });

      assert.equal(res.statusCode, 201);
      const body = res.json();
      assert.ok(body.data.id);
      assert.equal(body.data.estado, 'PENDIENTE_CONCILIACION');
      assert.equal(body.data.importe, '350.00');
      assert.equal(body.data.moneda, 'PEN');
      assert.equal(body.data.referencia, 'BCP-OP-77491');

      // Validar persistencia real en PostgreSQL
      const pagoEnDb = await db.prisma.pago.findUnique({
        where: { id: body.data.id },
      });
      assert.ok(pagoEnDb);
      assert.equal(pagoEnDb.estado, 'PENDIENTE_CONCILIACION');
      assert.equal(pagoEnDb.monto.toFixed(2), '350.00');

      // Validar registro atómico de auditoría
      const audit = await db.prisma.auditoriaEvento.findFirst({
        where: { entidad: 'Pago', entidadId: body.data.id, accion: 'PAGO_REGISTRADO' },
      });
      assert.ok(audit, 'Debe existir evento de auditoría PAGO_REGISTRADO');
    });

    it('1.2. Pago pendiente NO reduce la deuda de alquiler en el resumen financiero', async () => {
      // res-02 tiene montoAcordado 1400.00 PEN y pag-02 pendiente por 450.00 PEN en seed
      const res = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-02/resumen-financiero',
      });

      assert.equal(res.statusCode, 200);
      const { data } = res.json();
      assert.equal(data.montoAcordado, '1400.00');
      assert.equal(data.totalPagosConciliados, '0.00');
      assert.equal(data.totalPagosPendientes, '450.00');
      // Invariante innegociable: solo los conciliados reducen saldo deudor
      assert.equal(data.saldoPendiente, '1400.00');
      assert.equal(data.tieneSobrepago, false);
    });

    it('1.3. Conciliar pago formalmente reduce la deuda de la reserva', async () => {
      // Conciliar pag-02 de res-02 (450.00 PEN)
      const resConciliar = await app.inject({
        method: 'POST',
        url: '/api/pagos/pag-02/conciliar',
        payload: { notas: 'Validado en cuenta corriente BCP' },
      });

      assert.equal(resConciliar.statusCode, 200);
      const body = resConciliar.json();
      assert.equal(body.data.estado, 'CONCILIADO');
      assert.ok(body.data.conciliadoEn);

      // Verificar nuevo resumen financiero
      const resResumen = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-02/resumen-financiero',
      });

      assert.equal(resResumen.statusCode, 200);
      const { data } = resResumen.json();
      assert.equal(data.totalPagosConciliados, '450.00');
      assert.equal(data.totalPagosPendientes, '0.00');
      assert.equal(data.saldoPendiente, '950.00'); // 1400 - 450 = 950
    });

    it('1.4. Conciliación repetida es idempotente y no duplica ingresos', async () => {
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/pagos/pag-02/conciliar',
      });
      assert.equal(res1.statusCode, 200);

      const resResumen = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-02/resumen-financiero',
      });
      assert.equal(resResumen.json().data.totalPagosConciliados, '450.00');
    });

    it('1.5. Rechazo de pago no reduce deuda y exige motivo obligatorio', async () => {
      // Registrar pago para res-02 que será rechazado
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload: {
          reservaId: 'res-02',
          importe: '200.00',
          moneda: 'PEN',
          concepto: 'SALDO',
          metodoPago: 'TRANSFERENCIA',
          referencia: 'REF-FALSA-001',
          fechaPago: '2026-10-29',
        },
      });
      const pagoId = createRes.json().data.id;

      // Intento de rechazo sin motivo: 400
      const resFail = await app.inject({
        method: 'POST',
        url: `/api/pagos/${pagoId}/rechazar`,
        payload: { motivo: '' },
      });
      assert.equal(resFail.statusCode, 400);

      // Rechazo con motivo formal
      const resOk = await app.inject({
        method: 'POST',
        url: `/api/pagos/${pagoId}/rechazar`,
        payload: { motivo: 'Operación no figura en extracto bancario de la fecha indicada' },
      });
      assert.equal(resOk.statusCode, 200);
      assert.equal(resOk.json().data.estado, 'RECHAZADO');

      // Comprobar que no reduce saldo (sigue en 950.00)
      const resResumen = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-02/resumen-financiero',
      });
      assert.equal(resResumen.json().data.saldoPendiente, '950.00');
    });

    it('1.6. Rechaza pagos ya conciliados con conflicto 409 si se intentan rechazar', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/pagos/pag-02/rechazar',
        payload: { motivo: 'Intento de anulación indebida' },
      });
      assert.equal(res.statusCode, 409);
    });

    it('1.7. Rechaza discrepancia de moneda entre pago y reserva (400)', async () => {
      // res-01 tiene moneda PEN. Enviar USD debe ser rechazado
      const res = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload: {
          reservaId: 'res-01',
          importe: '100.00',
          moneda: 'USD',
          concepto: 'ADELANTO',
          metodoPago: 'TRANSFERENCIA',
          referencia: 'USD-TRX-101',
          fechaPago: '2026-10-28',
        },
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, 'CURRENCY_MISMATCH');
    });

    it('1.8. Detecta sobrepago y emite alerta si pagos conciliados superan el pactado', async () => {
      // res-06 pactada por 840.00 PEN. Registramos y conciliamos pago por 1000.00 PEN
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload: {
          reservaId: 'res-06',
          importe: '1000.00',
          moneda: 'PEN',
          concepto: 'PAGO_TOTAL',
          metodoPago: 'TRANSFERENCIA',
          referencia: 'OP-SOBREPAGO-01',
          fechaPago: '2026-10-28',
        },
      });
      const pagoId = regRes.json().data.id;

      await app.inject({
        method: 'POST',
        url: `/api/pagos/${pagoId}/conciliar`,
      });

      const resResumen = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-06/resumen-financiero',
      });

      assert.equal(resResumen.statusCode, 200);
      const { data } = resResumen.json();
      assert.equal(data.tieneSobrepago, true);
      assert.equal(data.montoSobrepago, '160.00'); // 1000 - 840 = 160
      assert.ok(data.alertaSobrepago?.includes('ALERTA DE SOBREPAGO'));
      assert.equal(data.saldoPendiente, '0.00');
    });

    it('1.9. Concurrencia transaccional: conciliar y rechazar simultáneamente el mismo pago garantiza transición atómica exclusiva y única auditoría', async () => {
      // Registrar un pago nuevo en estado PENDIENTE_CONCILIACION
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload: {
          reservaId: 'res-05',
          importe: '300.00',
          moneda: 'PEN',
          concepto: 'ADELANTO',
          metodoPago: 'TRANSFERENCIA',
          referencia: 'CONCURRENCY-RACE-01',
          fechaPago: '2026-10-28',
        },
      });
      assert.equal(regRes.statusCode, 201);
      const pagoId = regRes.json().data.id;

      // Disparar conciliación y rechazo concurrentes con Promise.all
      const [resConciliar, resRechazar] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/pagos/${pagoId}/conciliar`,
          payload: { notas: 'Conciliación concurrente' },
        }),
        app.inject({
          method: 'POST',
          url: `/api/pagos/${pagoId}/rechazar`,
          payload: { motivo: 'Rechazo concurrente por inconsistencia' },
        }),
      ]);

      const codes = [resConciliar.statusCode, resRechazar.statusCode];
      // Exactamente una solicitud debe haber ganado (200) y la otra debe haber fallado (409 o 400)
      assert.ok(codes.includes(200), 'Exactamente una solicitud de transición debe triunfar');
      const winningResponse = resConciliar.statusCode === 200 ? resConciliar : resRechazar;
      const losingResponse = resConciliar.statusCode === 200 ? resRechazar : resConciliar;

      const estadoFinal = winningResponse.json().data.estado;
      assert.ok(estadoFinal === 'CONCILIADO' || estadoFinal === 'RECHAZADO');
      assert.ok(
        losingResponse.statusCode === 409 || losingResponse.statusCode === 400,
        `La solicitud perdedora debe recibir conflicto o error de estado inválido. Recibió: ${losingResponse.statusCode}`
      );

      // Comprobar estado real en PostgreSQL
      const pagoEnDb = await db.prisma.pago.findUniqueOrThrow({ where: { id: pagoId } });
      assert.equal(pagoEnDb.estado, estadoFinal);

      // Invariante crítico: registrar auditoría ÚNICAMENTE para la transición efectivamente realizada
      const auditoriasTransicion = await db.prisma.auditoriaEvento.findMany({
        where: {
          entidad: 'Pago',
          entidadId: pagoId,
          accion: { in: ['PAGO_CONCILIADO', 'PAGO_RECHAZADO'] },
        },
      });
      assert.equal(auditoriasTransicion.length, 1, 'Debe registrarse exactamente una auditoría para la transición ejecutada');
      assert.equal(
        auditoriasTransicion[0].accion,
        estadoFinal === 'CONCILIADO' ? 'PAGO_CONCILIADO' : 'PAGO_RECHAZADO'
      );
    });

    it('1.10. Detección segura de duplicación de referencia bancaria dentro de la misma reserva (P2)', async () => {
      // Pago inicial legítimo
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload: {
          reservaId: 'res-05',
          importe: '120.00',
          moneda: 'PEN',
          concepto: 'ADELANTO',
          metodoPago: 'TRANSFERENCIA',
          referencia: 'REF-BCP-SHARED-001',
          fechaPago: '2026-10-28',
          idempotencyKey: 'idem-ref-dup-1',
        },
      });
      assert.equal(res1.statusCode, 201);
      const pago1Id = res1.json().data.id;

      // Intento de registrar la misma transacción con diferente clave de idempotencia en la misma reserva
      const resDup = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload: {
          reservaId: 'res-05',
          importe: '120.00',
          moneda: 'PEN',
          concepto: 'ADELANTO',
          metodoPago: 'TRANSFERENCIA',
          referencia: 'REF-BCP-SHARED-001',
          fechaPago: '2026-10-28',
          idempotencyKey: 'idem-ref-dup-2', // Clave diferente
        },
      });
      assert.equal(resDup.statusCode, 409);
      assert.equal(resDup.json().error.code, 'DUPLICATE_PAYMENT_REFERENCE');

      // Comprobar que en OTRA reserva diferente no se bloquea indebidamente
      const resOtraReserva = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload: {
          reservaId: 'res-04',
          importe: '120.00',
          moneda: 'PEN',
          concepto: 'ADELANTO',
          metodoPago: 'TRANSFERENCIA',
          referencia: 'REF-BCP-SHARED-001', // Misma ref pero en otra reserva
          fechaPago: '2026-10-28',
        },
      });
      assert.equal(resOtraReserva.statusCode, 201);

      // Si el pago original es rechazado, la referencia debe poder ser reutilizada para corrección legítima
      await app.inject({
        method: 'POST',
        url: `/api/pagos/${pago1Id}/rechazar`,
        payload: { motivo: 'Comprobante errado, volver a registrar' },
      });

      const resReintentoValido = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload: {
          reservaId: 'res-05',
          importe: '120.00',
          moneda: 'PEN',
          concepto: 'ADELANTO',
          metodoPago: 'TRANSFERENCIA',
          referencia: 'REF-BCP-SHARED-001',
          fechaPago: '2026-10-28',
        },
      });
      assert.equal(resReintentoValido.statusCode, 201);
    });
  });


  describe('2. Idempotencia Robusta en PostgreSQL', () => {
    it('2.1. Idempotency key con payload idéntico devuelve registro existente (200/201)', async () => {
      const payload = {
        reservaId: 'res-03',
        importe: '200.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'EFECTIVO',
        referencia: 'RECIBO-EF-001',
        fechaPago: '2026-10-28',
        idempotencyKey: 'idem-test-repeat-ok',
      };

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload,
      });
      assert.equal(res1.statusCode, 201);
      const pago1Id = res1.json().data.id;

      // Reintento idéntico
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload,
      });
      assert.equal(res2.statusCode, 200);
      assert.equal(res2.json().data.id, pago1Id);
      assert.equal(res2.json().idempotentReplay, true);
    });

    it('2.2. Idempotency key reutilizada con payload diferente devuelve 409 Conflicto', async () => {
      const payloadOriginal = {
        reservaId: 'res-03',
        importe: '300.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'EFECTIVO',
        referencia: 'RECIBO-EF-002',
        fechaPago: '2026-10-28',
        idempotencyKey: 'idem-test-conflict-key',
      };

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload: payloadOriginal,
      });
      assert.equal(res1.statusCode, 201);

      // Reintento con clave igual pero monto alterado
      const resConflict = await app.inject({
        method: 'POST',
        url: '/api/pagos',
        payload: {
          ...payloadOriginal,
          importe: '450.00', // Modificado
        },
      });
      assert.equal(resConflict.statusCode, 409);
      assert.equal(resConflict.json().error.code, 'IDEMPOTENCY_CONFLICT');
    });

    it('2.3. Peticiones concurrentes con la misma clave de idempotencia no duplican registros', async () => {
      const payload = {
        reservaId: 'res-04',
        importe: '150.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'BILLETERA_DIGITAL',
        referencia: 'PLIN-998811',
        fechaPago: '2026-10-28',
        idempotencyKey: 'idem-concurrent-payments-test',
      };

      const results = await Promise.all([
        app.inject({ method: 'POST', url: '/api/pagos', payload }),
        app.inject({ method: 'POST', url: '/api/pagos', payload }),
        app.inject({ method: 'POST', url: '/api/pagos', payload }),
      ]);

      const statusCodes = results.map((r) => r.statusCode);
      // Al menos uno debe haber sido 201 y los demás 200 (reproducción idempotente)
      assert.ok(statusCodes.includes(201));
      for (const code of statusCodes) {
        assert.ok(code === 201 || code === 200, `Código inesperado: ${code}`);
      }

      // Exactamente UN registro creado en PostgreSQL
      const count = await db.prisma.pago.count({
        where: { idempotencyKey: 'idem-concurrent-payments-test' },
      });
      assert.equal(count, 1, 'Debe existir exactamente un pago persistido');
    });
  });

  describe('3. HU-06: Control de Garantías y Libro Inmutable de Movimientos', () => {
    it('3.1. Crea una garantía en custodia con movimiento inicial RECEPCION atómico', async () => {
      // res-03 no tiene garantía
      const res = await app.inject({
        method: 'POST',
        url: '/api/garantias',
        payload: {
          reservaId: 'res-03',
          importe: '600.00',
          moneda: 'PEN',
          motivo: 'Garantía en custodia recibida para res-03',
        },
      });

      assert.equal(res.statusCode, 201);
      const { data } = res.json();
      assert.ok(data.id);
      assert.equal(data.estado, 'EN_CUSTODIA');
      assert.equal(data.importeRecibido, '600.00');
      assert.equal(data.saldoDisponible, '600.00');
      assert.equal(data.totalRetenido, '0.00');
      assert.equal(data.totalDevuelto, '0.00');
      assert.equal(data.movimientos.length, 1);
      assert.equal(data.movimientos[0].tipo, 'RECEPCION');
      assert.equal(data.movimientos[0].importe, '600.00');

      // Verificar persistencia de auditoría
      const audit = await db.prisma.auditoriaEvento.findFirst({
        where: { entidad: 'Garantia', entidadId: data.id, accion: 'GARANTIA_CREADA' },
      });
      assert.ok(audit);
    });

    it('3.2. Impide registrar más de una garantía para la misma reserva (409 Conflict)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/garantias',
        payload: {
          reservaId: 'res-03',
          importe: '600.00',
          moneda: 'PEN',
        },
      });

      assert.equal(res.statusCode, 409);
      assert.equal(res.json().error.code, 'GUARANTEE_ALREADY_EXISTS');
    });

    it('3.3. Retención parcial por daños documentados reduce saldo y transiciona a PARCIALMENTE_RETENIDA', async () => {
      const garantia = await db.prisma.garantia.findUniqueOrThrow({ where: { reservaId: 'res-03' } });

      const res = await app.inject({
        method: 'POST',
        url: `/api/garantias/${garantia.id}/movimientos`,
        payload: {
          tipo: 'RETENCION',
          importe: '150.00',
          motivo: 'Rotura de luminaria decorativa sala principal',
          documentoSoporte: 'ACTA-INSP-2026-03',
        },
      });

      assert.equal(res.statusCode, 201);
      const { data } = res.json();
      assert.equal(data.estado, 'PARCIALMENTE_RETENIDA');
      assert.equal(data.totalRetenido, '150.00');
      assert.equal(data.saldoDisponible, '450.00'); // 600 - 150 = 450
      assert.equal(data.movimientos.length, 2);
    });

    it('3.4. Devolución parcial al huésped reduce el saldo disponible en custodia', async () => {
      const garantia = await db.prisma.garantia.findUniqueOrThrow({ where: { reservaId: 'res-03' } });

      const res = await app.inject({
        method: 'POST',
        url: `/api/garantias/${garantia.id}/movimientos`,
        payload: {
          tipo: 'DEVOLUCION_PARCIAL',
          importe: '100.00',
          motivo: 'Reembolso parcial anticipado autorizado',
        },
      });

      assert.equal(res.statusCode, 201);
      const { data } = res.json();
      assert.equal(data.estado, 'PARCIALMENTE_RETENIDA');
      assert.equal(data.totalDevuelto, '100.00');
      assert.equal(data.saldoDisponible, '350.00'); // 450 - 100 = 350
    });

    it('3.5. Rechaza movimientos que excedan el saldo disponible (400 INSUFFICIENT_FUNDS)', async () => {
      const garantia = await db.prisma.garantia.findUniqueOrThrow({ where: { reservaId: 'res-03' } });

      // Saldo disponible es 350.00; intentar retirar 500.00
      const res = await app.inject({
        method: 'POST',
        url: `/api/garantias/${garantia.id}/movimientos`,
        payload: {
          tipo: 'RETENCION',
          importe: '500.00',
          motivo: 'Intento de deducción mayor al saldo disponible',
        },
      });

      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, 'INSUFFICIENT_FUNDS');
    });

    it('3.6. Caso mixto: retención previa y devolución final transicionan a LIQUIDADA_MIXTA', async () => {
      const garantia = await db.prisma.garantia.findUniqueOrThrow({ where: { reservaId: 'res-03' } });
      // Saldo actual: 350.00 (recibido: 600, retenido: 150, devuelto: 100)
      // Liquidamos los 350 restantes como DEVOLUCION_TOTAL
      const res = await app.inject({
        method: 'POST',
        url: `/api/garantias/${garantia.id}/movimientos`,
        payload: {
          tipo: 'DEVOLUCION_TOTAL',
          importe: '350.00',
          motivo: 'Devolución final del remanente',
        },
      });

      assert.equal(res.statusCode, 201);
      const { data } = res.json();
      assert.equal(data.saldoDisponible, '0.00');
      assert.equal(data.totalRetenido, '150.00');
      assert.equal(data.totalDevuelto, '450.00'); // 100 + 350
      // Invariante de negocio: NO es RETENIDA_TOTAL ni DEVUELTA_TOTAL falsa, es LIQUIDADA_MIXTA
      assert.equal(data.estado, 'LIQUIDADA_MIXTA');
    });

    it('3.7. Concurrencia transaccional: dos devoluciones concurrentes no pueden disponer dos veces del mismo saldo', async () => {
      // Creamos garantía en res-04 con 300.00 PEN
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/garantias',
        payload: {
          reservaId: 'res-04',
          importe: '300.00',
          moneda: 'PEN',
          motivo: 'Custodia para res-04 concurrencia',
        },
      });
      const garantiaId = regRes.json().data.id;

      // Dos peticiones simultáneas intentando devolver 200.00 cada una (total 400 > 300 disponible)
      const [r1, r2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/garantias/${garantiaId}/movimientos`,
          payload: { tipo: 'DEVOLUCION_PARCIAL', importe: '200.00', motivo: 'Devolución concurrente A' },
        }),
        app.inject({
          method: 'POST',
          url: `/api/garantias/${garantiaId}/movimientos`,
          payload: { tipo: 'DEVOLUCION_PARCIAL', importe: '200.00', motivo: 'Devolución concurrente B' },
        }),
      ]);

      const codes = [r1.statusCode, r2.statusCode];
      // Exactamente una tuvo éxito (201) y la otra fue rechazada por falta de saldo (400)
      assert.ok(codes.includes(201), 'Una de las solicitudes debió completarse');
      assert.ok(codes.includes(400), 'La otra solicitud debió ser rechazada por fondos insuficientes');

      // Verificar que el saldo no quedó negativo en PostgreSQL
      const movimientos = await db.prisma.movimientoGarantia.findMany({ where: { garantiaId } });
      let saldo = 0;
      for (const m of movimientos) {
        if (m.tipo === 'RECEPCION') saldo += Number(m.monto);
        else saldo -= Number(m.monto);
      }
      assert.ok(saldo >= 0, `El saldo nunca puede ser negativo. Actual: ${saldo}`);
      assert.equal(saldo, 100.0); // 300 - 200 = 100
    });

    it('3.8. Separación contable estricta: los fondos de garantía NO se computan en ingresos de alquiler', async () => {
      // res-01 tiene 700 conciliados y garantía de 500 en custodia
      const resResumen = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-01/resumen-financiero',
      });

      assert.equal(resResumen.statusCode, 200);
      const { data } = resResumen.json();
      assert.equal(data.totalPagosConciliados, '700.00'); // No incluye los 500 de garantía
      assert.equal(data.saldoPendiente, '700.00'); // 1400 acordado - 700 conciliado
    });

    it('3.9. Idempotencia en movimientos de garantía: misma clave y mismo payload retorna respuesta idempotente sin duplicar movimientos ni auditoría', async () => {
      // Creamos una garantía dedicada en res-06
      const regGarantia = await app.inject({
        method: 'POST',
        url: '/api/garantias',
        payload: {
          reservaId: 'res-06',
          importe: '400.00',
          moneda: 'PEN',
          motivo: 'Custodia para pruebas de idempotencia',
        },
      });
      assert.equal(regGarantia.statusCode, 201);
      const garantiaId = regGarantia.json().data.id;

      const payloadMovimiento = {
        tipo: 'RETENCION',
        importe: '50.00',
        motivo: 'Daño leve en cortinas',
        documentoSoporte: 'https://docs.example/acta-01.pdf',
        idempotencyKey: 'idem-gar-mov-01',
      };

      // Primer registro
      const res1 = await app.inject({
        method: 'POST',
        url: `/api/garantias/${garantiaId}/movimientos`,
        payload: payloadMovimiento,
      });
      assert.equal(res1.statusCode, 201);
      assert.equal(res1.json().data.totalRetenido, '50.00');

      // Reintento idéntico con misma clave y mismo payload canónico
      const res2 = await app.inject({
        method: 'POST',
        url: `/api/garantias/${garantiaId}/movimientos`,
        payload: payloadMovimiento,
      });
      assert.equal(res2.statusCode, 200);
      assert.equal(res2.json().idempotentReplay, true);
      assert.equal(res2.json().data.totalRetenido, '50.00');

      // Verificar en BD que NO se duplicó el movimiento
      const countMovimientos = await db.prisma.movimientoGarantia.count({
        where: { idempotencyKey: 'idem-gar-mov-01' },
      });
      assert.equal(countMovimientos, 1, 'Debe existir exactamente un movimiento persistido');

      // Verificar que NO se duplicó el evento de auditoría
      const countAuditorias = await db.prisma.auditoriaEvento.count({
        where: {
          entidad: 'Garantia',
          entidadId: garantiaId,
          accion: 'GARANTIA_RETENCION',
          motivo: 'Daño leve en cortinas',
        },
      });
      assert.equal(countAuditorias, 1, 'Debe existir exactamente una auditoría para el movimiento idempotente');
    });

    it('3.10. Idempotencia en movimientos de garantía: misma clave y payload alterado retorna 409 IDEMPOTENCY_CONFLICT', async () => {
      // Obtener la garantía creada en 3.9 (res-06)
      const resGarantia = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-06/garantia',
      });
      const garantiaId = resGarantia.json().data.id;

      // Reutilizar clave 'idem-gar-mov-01' pero con monto diferente (75.00 en vez de 50.00)
      const resConflictoMonto = await app.inject({
        method: 'POST',
        url: `/api/garantias/${garantiaId}/movimientos`,
        payload: {
          tipo: 'RETENCION',
          importe: '75.00', // Alterado
          motivo: 'Daño leve en cortinas',
          documentoSoporte: 'https://docs.example/acta-01.pdf',
          idempotencyKey: 'idem-gar-mov-01',
        },
      });
      assert.equal(resConflictoMonto.statusCode, 409);
      assert.equal(resConflictoMonto.json().error.code, 'IDEMPOTENCY_CONFLICT');

      // Reutilizar clave 'idem-gar-mov-01' pero con motivo diferente
      const resConflictoMotivo = await app.inject({
        method: 'POST',
        url: `/api/garantias/${garantiaId}/movimientos`,
        payload: {
          tipo: 'RETENCION',
          importe: '50.00',
          motivo: 'Otro motivo no registrado', // Alterado
          documentoSoporte: 'https://docs.example/acta-01.pdf',
          idempotencyKey: 'idem-gar-mov-01',
        },
      });
      assert.equal(resConflictoMotivo.statusCode, 409);
      assert.equal(resConflictoMotivo.json().error.code, 'IDEMPOTENCY_CONFLICT');

      // Reutilizar clave 'idem-gar-mov-01' en OTRA garantía
      const resConflictoGarantia = await app.inject({
        method: 'POST',
        url: '/api/garantias/gar-01/movimientos',
        payload: {
          tipo: 'RETENCION',
          importe: '50.00',
          motivo: 'Daño leve en cortinas',
          documentoSoporte: 'https://docs.example/acta-01.pdf',
          idempotencyKey: 'idem-gar-mov-01', // Clave ya usada en otra garantía
        },
      });
      assert.equal(resConflictoGarantia.statusCode, 409);
      assert.equal(resConflictoGarantia.json().error.code, 'IDEMPOTENCY_CONFLICT');
    });

    it('3.11. Concurrencia en movimientos de garantía con la misma clave de idempotencia no duplica registros', async () => {
      const resGarantia = await app.inject({
        method: 'GET',
        url: '/api/reservas/res-06/garantia',
      });
      const garantiaId = resGarantia.json().data.id;

      const payload = {
        tipo: 'DEVOLUCION_PARCIAL',
        importe: '30.00',
        motivo: 'Devolución parcial concurrente',
        idempotencyKey: 'idem-gar-concurrent-test',
      };

      const results = await Promise.all([
        app.inject({ method: 'POST', url: `/api/garantias/${garantiaId}/movimientos`, payload }),
        app.inject({ method: 'POST', url: `/api/garantias/${garantiaId}/movimientos`, payload }),
        app.inject({ method: 'POST', url: `/api/garantias/${garantiaId}/movimientos`, payload }),
      ]);

      const codes = results.map((r) => r.statusCode);
      assert.ok(codes.includes(201), 'Una de las solicitudes debió ser 201 Created');
      for (const code of codes) {
        assert.ok(code === 201 || code === 200, `Código inesperado en concurrencia: ${code}`);
      }

      // En base de datos PostgreSQL: exactamente 1 movimiento registrado con esta clave
      const count = await db.prisma.movimientoGarantia.count({
        where: { idempotencyKey: 'idem-gar-concurrent-test' },
      });
      assert.equal(count, 1, 'Debe persistirse exactamente un movimiento');

      // Exactamente una auditoría
      const countAuditorias = await db.prisma.auditoriaEvento.count({
        where: {
          entidad: 'Garantia',
          entidadId: garantiaId,
          accion: 'GARANTIA_DEVOLUCION_PARCIAL',
          motivo: 'Devolución parcial concurrente',
        },
      });
      assert.equal(countAuditorias, 1, 'Debe registrarse exactamente una auditoría');
    });
  });


  describe('4. Autorización y Seguridad Financiera', () => {
    it('4.1. Deniega acceso sin autenticación (401)', async () => {
      // Temporalmente deshabilitar bypass para verificar 401
      process.env.ENABLE_DEMO_AUTH_BYPASS = 'false';

      const res = await app.inject({
        method: 'GET',
        url: '/api/pagos',
      });

      assert.equal(res.statusCode, 401);
      assert.equal(res.json().error.code, 'UNAUTHORIZED');

      process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
    });

    it('4.2. Deniega acceso a rol PROPIETARIO con 403 Forbidden', async () => {
      // Simular petición con token/identidad de propietario
      const customApp = buildApp({
        prisma: db.prisma,
        checkDatabase: db.check,
      });

      // Registrar preHandler mock para inyectar usuario PROPIETARIO
      customApp.addHook('preHandler', async (req) => {
        req.user = {
          id: 'usr-102',
          nombre: 'Carlos Méndez',
          email: 'carlos.mendez@propietarios.example.invalid',
          rol: 'PROPIETARIO',
        };
      });

      await customApp.ready();

      const res = await customApp.inject({
        method: 'GET',
        url: '/api/pagos',
      });

      assert.equal(res.statusCode, 403);
      assert.equal(res.json().error.code, 'FORBIDDEN');

      await customApp.close();
    });
  });
});
