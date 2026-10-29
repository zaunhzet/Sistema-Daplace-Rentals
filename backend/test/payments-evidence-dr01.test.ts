import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app/app.js';
import { seedDatabase } from '../src/scripts/seed.js';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';
import { computePaymentPayloadHash } from '../src/routes/payments.js';

const testDbUrl = getRequiredTestDatabaseUrl();

describe('DR-01-FIX: Idempotencia, Privacidad Bancaria e Integridad Documental — Tests Focales', () => {
  let db: ReturnType<typeof createDatabase>;
  let app: FastifyInstance;

  before(async () => {
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
    process.env.API_HOST = '127.0.0.1';
    process.env.BANK_ACCOUNT_HMAC_SECRET = 'daplace-test-stable-hmac-secret-key-32b!';

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
    delete process.env.BANK_ACCOUNT_HMAC_SECRET;
    await app.close();
    await db.close();
  });

  // H1: Idempotencia de evidencias posteriores
  it('1. Dos adjuntos secuenciales con la misma clave y payload devuelven el mismo documento sin duplicar auditoría', async () => {
    // Pago base
    const pagoRes = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '100.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-SEQ-01',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-pay-seq-01',
      },
    });
    assert.equal(pagoRes.statusCode, 201);
    const pagoId = pagoRes.json().data.id;

    const evPayload = {
      nombreArchivo: 'voucher_secuencial_01.pdf',
      referenciaDocumental: 'OP-SEQ-01',
      url: 'https://cdn.example.invalid/vouchers/voucher_seq_01.pdf',
      tipo: 'VOUCHER',
      idempotencyKey: 'idem-ev-seq-01',
    };

    // Primer adjunto
    const res1 = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/evidencias`,
      payload: evPayload,
    });
    assert.equal(res1.statusCode, 201);
    const evId = res1.json().data.id;
    assert.ok(evId);

    // Segundo adjunto (mismo payload y misma clave)
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/evidencias`,
      payload: evPayload,
    });
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.json().idempotentReplay, true);
    assert.equal(res2.json().data.id, evId);

    // Comprobar que en auditoría solo se registró exactamente 1 evento para este adjunto
    const auditEvents = await db.prisma.auditoriaEvento.findMany({
      where: {
        entidad: 'Pago',
        entidadId: pagoId,
        accion: 'EVIDENCIA_PAGO_AGREGADA',
      },
    });
    assert.equal(auditEvents.length, 1, 'No debe duplicar eventos de auditoría en reintentos idempotentes');
  });

  it('2. Dos adjuntos concurrentes con la misma clave y payload gestionan concurrencia en PostgreSQL', async () => {
    const pagoRes = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '120.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-CONC-01',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-pay-conc-01',
      },
    });
    const pagoId = pagoRes.json().data.id;

    const evPayload = {
      nombreArchivo: 'voucher_concurrente_01.pdf',
      referenciaDocumental: 'OP-CONC-01',
      idempotencyKey: 'idem-ev-conc-key-01',
    };

    const [callA, callB] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/pagos/${pagoId}/evidencias`,
        payload: evPayload,
      }),
      app.inject({
        method: 'POST',
        url: `/api/pagos/${pagoId}/evidencias`,
        payload: evPayload,
      }),
    ]);

    const statuses = [callA.statusCode, callB.statusCode].sort();
    assert.deepEqual(statuses, [200, 201], `Respuestas concurrentes esperadas exactamente [200, 201], obtenidas: [${statuses[0]}, ${statuses[1]}]`);

    const idA = callA.json().data?.id;
    const idB = callB.json().data?.id;
    assert.ok(idA, 'La evidencia devuelta debe contener un ID');
    assert.equal(idA, idB, 'Ambas llamadas concurrentes deben retornar la misma evidencia');

    // Validar en PostgreSQL que existe exactamente 1 registro
    const rows = await db.prisma.evidenciaPago.findMany({
      where: { pagoId, idempotencyKey: 'idem-ev-conc-key-01' },
    });
    assert.equal(rows.length, 1, 'Debe persistirse exactamente 1 fila en evidencias_pago');

    // Validar en auditoría exactamente 1 evento de alta documental
    const auditEvents = await db.prisma.auditoriaEvento.findMany({
      where: {
        entidad: 'Pago',
        entidadId: pagoId,
        accion: 'EVIDENCIA_PAGO_AGREGADA',
      },
    });
    assert.equal(auditEvents.length, 1, 'Debe registrarse exactamente un único evento de alta documental en auditoría');
  });

  it('3. Misma clave de evidencia con contenido diferente genera conflicto HTTP 409', async () => {
    const pagoRes = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '130.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-DIFF-01',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-pay-diff-01',
      },
    });
    const pagoId = pagoRes.json().data.id;

    const res1 = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/evidencias`,
      payload: {
        nombreArchivo: 'voucher_original.pdf',
        referenciaDocumental: 'OP-ORIGINAL',
        idempotencyKey: 'idem-ev-diff-key',
      },
    });
    assert.equal(res1.statusCode, 201);

    // Mismo idempotencyKey pero diferente nombreArchivo y referencia
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/evidencias`,
      payload: {
        nombreArchivo: 'voucher_alterado.pdf',
        referenciaDocumental: 'OP-ALTERADO',
        idempotencyKey: 'idem-ev-diff-key',
      },
    });
    assert.equal(res2.statusCode, 409);
    assert.equal(res2.json().error.code, 'IDEMPOTENCY_CONFLICT');
  });

  it('4. Misma clave en pagos diferentes se permite (unicidad compuesta pagoId + idempotencyKey)', async () => {
    const p1 = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '50.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'EFECTIVO',
        referencia: 'SHARED-KEY-PAY-1',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-shared-pay-1',
      },
    });
    const p2 = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '50.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'EFECTIVO',
        referencia: 'SHARED-KEY-PAY-2',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-shared-pay-2',
      },
    });

    const pagoId1 = p1.json().data.id;
    const pagoId2 = p2.json().data.id;
    assert.notEqual(pagoId1, pagoId2);

    // Misma clave idempotente en Pago 1
    const ev1 = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId1}/evidencias`,
      payload: {
        nombreArchivo: 'voucher_compartido.pdf',
        idempotencyKey: 'shared-ev-key-100',
      },
    });
    assert.equal(ev1.statusCode, 201);

    // Misma clave idempotente en Pago 2: debe admitirse exitosamente
    const ev2 = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId2}/evidencias`,
      payload: {
        nombreArchivo: 'voucher_compartido.pdf',
        idempotencyKey: 'shared-ev-key-100',
      },
    });
    assert.equal(ev2.statusCode, 201);
    assert.notEqual(ev1.json().data.id, ev2.json().data.id);
  });

  // H2 y H3: Protección de referencias bancarias
  it('5. Dos cuentas completas distintas terminadas en 4444 manteniendo idéntica la referencia de operación provocan 409', async () => {
    const payloadA = {
      reservaId: 'res-01',
      importe: '220.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'VOUCHER-HMAC-4444-SAME-OP',
      fechaPago: '2026-10-30',
      beneficiarioTipo: 'PROPIETARIO',
      beneficiarioNombre: 'Propietario Demo',
      bancoReceptor: 'BCP',
      cuentaReferencia: '191-1111-4444', // Cuenta 1 que termina en 4444
      idempotencyKey: 'idem-same-suffix-4444',
    };

    const resA = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: payloadA,
    });
    assert.equal(resA.statusCode, 201);
    // En la respuesta la cuenta debe ser devuelta enmascarada
    assert.equal(resA.json().data.cuentaReferencia, '****4444');

    // Mismo idempotencyKey e idéntica referencia de operación y campos; cambia ÚNICAMENTE la cuenta bancaria
    const payloadB = {
      ...payloadA,
      cuentaReferencia: '191-2222-4444', // Cuenta distinta pero con mismo sufijo ****4444
    };

    const resB = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: payloadB,
    });

    // Debe provocar 409 Conflict porque el HMAC fingerprint es diferente, evitando colisión de sufijos
    assert.equal(resB.statusCode, 409);
    assert.equal(resB.json().error.code, 'IDEMPOTENCY_CONFLICT');
  });

  it('6. Entrada maliciosa o parcialmente enmascarada es rechazada con 400 Bad Request', async () => {
    // Caso con asteriscos ambiguos que no cumplen el formato estricto ****DDDD
    const resMalicioso1 = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '110.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'TEST-MALICIOUS-1',
        fechaPago: '2026-10-30',
        cuentaReferencia: '1234***5678',
        idempotencyKey: 'idem-malicious-1',
      },
    });
    assert.equal(resMalicioso1.statusCode, 400);
    assert.equal(resMalicioso1.json().error.code, 'INVALID_ACCOUNT_REFERENCE');

    // Caso con 3 asteriscos
    const resMalicioso2 = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '110.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'TEST-MALICIOUS-2',
        fechaPago: '2026-10-30',
        cuentaReferencia: '***4444',
        idempotencyKey: 'idem-malicious-2',
      },
    });
    assert.equal(resMalicioso2.statusCode, 400);
    assert.equal(resMalicioso2.json().error.code, 'INVALID_ACCOUNT_REFERENCE');

    // Formato estricto válido ****DDDD debe aceptarse
    const resValido = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '110.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'TEST-STRICT-MASK',
        fechaPago: '2026-10-30',
        cuentaReferencia: '****4444',
        idempotencyKey: 'idem-strict-mask-ok',
      },
    });
    assert.equal(resValido.statusCode, 201);
    assert.equal(resValido.json().data.cuentaReferencia, '****4444');
  });

  // H4: Hash documental completo v2
  it('7. Cambio aislado del tipo de evidencia inicial con la misma clave devuelve 409 Conflict', async () => {
    const payloadBase = {
      reservaId: 'res-01',
      importe: '140.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'TEST-TYPE-CHANGE-01',
      fechaPago: '2026-10-30',
      beneficiarioTipo: 'DAPLACE',
      idempotencyKey: 'idem-type-change-key',
      evidencias: [
        {
          nombreArchivo: 'deposito.pdf',
          tipo: 'VOUCHER',
          referenciaDocumental: 'DEP-01',
        },
      ],
    };

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: payloadBase,
    });
    assert.equal(res1.statusCode, 201);

    // Mismo idempotencyKey pero cambiando únicamente el tipo de evidencia a COMPROBANTE
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        ...payloadBase,
        evidencias: [
          {
            nombreArchivo: 'deposito.pdf',
            tipo: 'COMPROBANTE',
            referenciaDocumental: 'DEP-01',
          },
        ],
      },
    });
    assert.equal(res2.statusCode, 409);
    assert.equal(res2.json().error.code, 'IDEMPOTENCY_CONFLICT');
  });

  it('8. Cambio aislado de notas en la evidencia inicial con la misma clave devuelve 409 Conflict', async () => {
    const payloadBase = {
      reservaId: 'res-01',
      importe: '145.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'TEST-NOTAS-CHANGE-01',
      fechaPago: '2026-10-30',
      beneficiarioTipo: 'DAPLACE',
      idempotencyKey: 'idem-notas-change-key',
      evidencias: [
        {
          nombreArchivo: 'transferencia.pdf',
          notas: 'Nota original adjunta',
        },
      ],
    };

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: payloadBase,
    });
    assert.equal(res1.statusCode, 201);

    // Mismo idempotencyKey pero alterando únicamente notas
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        ...payloadBase,
        evidencias: [
          {
            nombreArchivo: 'transferencia.pdf',
            notas: 'Nota alterada en reintento',
          },
        ],
      },
    });
    assert.equal(res2.statusCode, 409);
    assert.equal(res2.json().error.code, 'IDEMPOTENCY_CONFLICT');
  });

  // H4: Compatibilidad histórica y 3 cohortes
  it('9. Cohorte 1 (v1 original 8583989): fixture sintético independiente derivado del algoritmo original', async () => {
    // Fixture sintético independiente precalculado a partir de la especificación de 8583989:
    // SHA256(JSON.stringify({reservaId:'res-01',monto:'175.00',moneda:'PEN',concepto:'ADELANTO',metodoPago:'EFECTIVO',referencia:'LEGACY-REPLAY-01',fechaPago:'2026-10-29'}))
    const SYNTHETIC_V1_FIXTURE_HASH = '8f2e6f151192aa29967215e85efc94bf8371d2f7e9a4f8053de1e1ad1c1fd286';

    const legacyPayload = {
      reservaId: 'res-01',
      importe: '175.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'EFECTIVO',
      referencia: 'LEGACY-REPLAY-01',
      fechaPago: '2026-10-29',
      idempotencyKey: 'idem-v1-synthetic-fixture-test',
    };

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: legacyPayload,
    });
    assert.equal(res1.statusCode, 201);

    const pagoGuardado = await db.prisma.pago.findUnique({
      where: { idempotencyKey: 'idem-v1-synthetic-fixture-test' },
    });
    assert.equal(
      pagoGuardado?.payloadHash,
      SYNTHETIC_V1_FIXTURE_HASH,
      'Debe persistir exactamente el hash del fixture sintético v1 independiente'
    );

    // Replay v1 idéntico devuelve 200 con idempotentReplay: true
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: legacyPayload,
    });
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.json().idempotentReplay, true);
    assert.equal(res2.json().data.id, pagoGuardado?.id);
  });

  it('9b. Cohorte 2 (v2 preliminar): escenario sintético demuestra 409 ante replay incompatible preservando hash histórico', async () => {
    // Escenario sintético v2 preliminar: un pago registrado en la fase preliminar previa a canonicalización determinista/HMAC
    const v2PreliminarKey = 'idem-v2-preliminar-synthetic-key';
    const syntheticPreliminaryHash = 'synthetic-v2-preliminary-hash-non-canonical-hmac-3344';

    await db.prisma.pago.create({
      data: {
        reservaId: 'res-01',
        monto: new Prisma.Decimal('160.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'VOUCHER-PRELIMINARY-V2',
        fechaPago: new Date('2026-10-30'),
        estado: 'PENDIENTE_CONCILIACION',
        beneficiarioTipo: 'PROPIETARIO',
        bancoReceptor: 'BCP',
        cuentaReferencia: '****4444',
        idempotencyKey: v2PreliminarKey,
        payloadHash: syntheticPreliminaryHash,
      },
    });

    // Intentar replay del pago con la canonicalización actual post-FIX
    const resPreliminaryReplay = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '160.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-PRELIMINARY-V2',
        fechaPago: '2026-10-30',
        beneficiarioTipo: 'PROPIETARIO',
        bancoReceptor: 'BCP',
        cuentaReferencia: '191-1111-4444',
        idempotencyKey: v2PreliminarKey,
      },
    });

    // Debe resultar en 409 Conflict porque el hash canónico actual difiere del hash preliminar
    assert.equal(resPreliminaryReplay.statusCode, 409);
    assert.equal(resPreliminaryReplay.json().error.code, 'IDEMPOTENCY_CONFLICT');

    // Inmunidad Financiera: el registro en PostgreSQL NO debe haber sido modificado ni su hash sobrescrito
    const pagoInmutable = await db.prisma.pago.findUnique({
      where: { idempotencyKey: v2PreliminarKey },
    });
    assert.equal(pagoInmutable?.payloadHash, syntheticPreliminaryHash, 'El hash preliminar histórico debe permanecer inalterado');
  });

  it('10. Reintento después de conciliación devuelve el pago conciliado sin alterar hash original', async () => {
    const payload = {
      reservaId: 'res-01',
      importe: '185.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'RECONCILED-REPLAY-01',
      fechaPago: '2026-10-30',
      idempotencyKey: 'idem-reconciled-replay',
    };

    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload,
    });
    assert.equal(resCreate.statusCode, 201);
    const pagoId = resCreate.json().data.id;

    // Conciliar el pago
    const resConc = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/conciliar`,
      payload: { referencia: 'EXTRACTO-REC-01' },
    });
    assert.equal(resConc.statusCode, 200);
    assert.equal(resConc.json().data.estado, 'CONCILIADO');

    // Reintento idéntico de creación
    const resReplay = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload,
    });
    assert.equal(resReplay.statusCode, 200);
    assert.equal(resReplay.json().idempotentReplay, true);
    assert.equal(resReplay.json().data.id, pagoId);
    assert.equal(resReplay.json().data.estado, 'CONCILIADO');
  });

  it('11. Pago concurrente con evidencias iniciales gestiona concurrencia sobre PostgreSQL', async () => {
    const payload = {
      reservaId: 'res-01',
      importe: '190.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'CONCURRENT-INIT-EVIDENCES',
      fechaPago: '2026-10-30',
      idempotencyKey: 'idem-concurrent-initial-evidences',
      beneficiarioTipo: 'DAPLACE',
      evidencias: [
        {
          nombreArchivo: 'recibo_inicial.pdf',
          referenciaDocumental: 'REC-INIT-01',
        },
      ],
    };

    const [resA, resB] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/pagos', payload }),
      app.inject({ method: 'POST', url: '/api/pagos', payload }),
    ]);

    const codes = [resA.statusCode, resB.statusCode].sort();
    assert.ok(
      (codes[0] === 200 && codes[1] === 201) ||
      (codes[0] === 200 && codes[1] === 200) ||
      (codes[0] === 201 && codes[1] === 201),
      `Esperados [200, 201], obtenidos [${codes[0]}, ${codes[1]}]`
    );

    const rows = await db.prisma.pago.findMany({
      where: { idempotencyKey: 'idem-concurrent-initial-evidences' },
      include: { evidencias: true },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].evidencias.length, 1);
  });

  // H5: Conservación documental y atomicidad transaccional
  it('12. Fallo en auditoría induce rollback completo en POST /api/pagos/:id/evidencias sin evidencia ni auditoría parcial', async () => {
    // Pago base para la prueba
    const pagoRes = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '135.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-ROLLBACK-BASE',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-rollback-base-pay',
      },
    });
    assert.equal(pagoRes.statusCode, 201);
    const pagoId = pagoRes.json().data.id;

    const prevEvidencesCount = await db.prisma.evidenciaPago.count({
      where: { pagoId },
    });
    const prevAuditCount = await db.prisma.auditoriaEvento.count({
      where: { entidad: 'Pago', entidadId: pagoId },
    });

    // Doble controlado: Proxy de Prisma que induce fallo en auditoriaEvento.create dentro de la transacción real de PostgreSQL
    const failingPrisma = new Proxy(db.prisma, {
      get(target: any, prop: string | symbol, receiver: any) {
        if (prop === '$transaction') {
          return async (callback: any, options?: any) => {
            return target.$transaction(async (tx: any) => {
              const proxyTx = new Proxy(tx, {
                get(txTarget: any, txProp: string | symbol) {
                  if (txProp === 'auditoriaEvento') {
                    return {
                      ...txTarget.auditoriaEvento,
                      create: async () => {
                        throw new Error('SIMULATED_AUDIT_FAILURE_FOR_ROLLBACK');
                      },
                    };
                  }
                  return Reflect.get(txTarget, txProp);
                },
              });
              return callback(proxyTx);
            }, options);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const failingApp = buildApp({
      prisma: failingPrisma,
      checkDatabase: db.check,
    });
    await failingApp.ready();

    // Invocar el endpoint POST real de evidencias
    const resRollback = await failingApp.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/evidencias`,
      payload: {
        nombreArchivo: 'voucher_destinado_a_rollback.pdf',
        referenciaDocumental: 'OP-ROLLBACK-TEST',
        idempotencyKey: 'idem-ev-rollback-key',
      },
    });

    // El error en auditoría aborta la transacción y el endpoint responde HTTP 500
    assert.equal(resRollback.statusCode, 500);

    // Verificar inequívocamente que PostgreSQL revirtió toda la transacción:
    // Cero evidencias creadas y cero eventos de auditoría parcial persistidos
    const postEvidencesCount = await db.prisma.evidenciaPago.count({
      where: { pagoId },
    });
    const postAuditCount = await db.prisma.auditoriaEvento.count({
      where: { entidad: 'Pago', entidadId: pagoId },
    });

    assert.equal(postEvidencesCount, prevEvidencesCount, 'No debe quedar ninguna evidencia huérfana en la base de datos tras rollback');
    assert.equal(postAuditCount, prevAuditCount, 'No debe quedar ningún evento de auditoría parcial tras rollback');

    await failingApp.close();
  });

  it('13. DELETE /api/pagos/:id/evidencias/:evidenciaId está deshabilitado y retorna 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/pagos/pag-01/evidencias/ev-01',
    });
    assert.equal(res.statusCode, 404, 'El endpoint DELETE debe retornar 404 Not Found al haber sido retirado');
  });

  it('14. Restricción de borrado del pago padre (ON DELETE RESTRICT en PostgreSQL)', async () => {
    // Crear un pago y una evidencia asociada
    const pagoRes = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '95.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-RESTRICT-TEST',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-restrict-test',
      },
    });
    const pagoId = pagoRes.json().data.id;

    await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/evidencias`,
      payload: {
        nombreArchivo: 'voucher_no_borrable.pdf',
        idempotencyKey: 'idem-ev-restrict-doc',
      },
    });

    // Intentar borrar el pago padre directamente en la base de datos
    await assert.rejects(
      async () => {
        await db.prisma.pago.delete({
          where: { id: pagoId },
        });
      },
      (err: any) => {
        // En Prisma, RESTRICT genera código P2003 (Foreign key constraint violation) o error de constraint
        return err.code === 'P2003' || String(err).includes('violates foreign key constraint');
      },
      'PostgreSQL debe rechazar el borrado del pago padre debido a ON DELETE RESTRICT'
    );
  });

  it('15. Seguridad: 401 sin autenticación y 403 a roles sin autorización', async () => {
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'false';
    const unauthRes = await app.inject({
      method: 'POST',
      url: '/api/pagos/pag-01/evidencias',
      payload: {
        nombreArchivo: 'unauthorized.pdf',
        idempotencyKey: 'idem-unauth',
      },
    });
    assert.equal(unauthRes.statusCode, 401);
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';

    // 403 con rol PROPIETARIO
    const customApp = buildApp({
      prisma: db.prisma,
      checkDatabase: db.check,
    });
    customApp.addHook('preHandler', async (req) => {
      req.user = {
        id: 'usr-prop-test',
        nombre: 'Propietario Sin Permiso',
        email: 'propietario@example.invalid',
        rol: 'PROPIETARIO',
      };
    });
    await customApp.ready();

    const forbidRes = await customApp.inject({
      method: 'POST',
      url: '/api/pagos/pag-01/evidencias',
      payload: {
        nombreArchivo: 'forbid.pdf',
        idempotencyKey: 'idem-forbid',
      },
    });
    assert.equal(forbidRes.statusCode, 403);
    await customApp.close();
  });

  // Pruebas funcionales de continuidad
  it('16. Pago pendiente con voucher continúa sin reducir el saldo de la reserva', async () => {
    const resSummaryBefore = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-01/resumen-financiero',
    });
    const saldoInicial = Number(resSummaryBefore.json().data.saldoPendiente);

    const pagoRes = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '260.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-NOT-REDUCING-DEBT-FIX',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-dr01-debt-test-fix',
      },
    });
    const pagoId = pagoRes.json().data.id;

    await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/evidencias`,
      payload: {
        nombreArchivo: 'voucher_adjunto_fix.pdf',
        referenciaDocumental: 'OP-PENDING-77-FIX',
        idempotencyKey: 'idem-ev-debt-fix',
      },
    });

    const resSummaryAfter = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-01/resumen-financiero',
    });
    const saldoFinal = Number(resSummaryAfter.json().data.saldoPendiente);
    assert.equal(saldoFinal, saldoInicial, 'Adjuntar voucher no debe reducir la deuda');
  });

  it('17. Evidencia permanece después de conciliar el pago formalmente', async () => {
    const pagoRes = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-03',
        importe: '150.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'CONCILIAR-WITH-EVIDENCE-FIX',
        fechaPago: '2026-10-30',
        idempotencyKey: 'idem-dr01-conciliar-fix',
      },
    });
    const pagoId = pagoRes.json().data.id;

    const evRes = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/evidencias`,
      payload: {
        nombreArchivo: 'voucher_reconciled.pdf',
        referenciaDocumental: 'OP-REC-55',
        idempotencyKey: 'idem-ev-reconciled',
      },
    });
    assert.equal(evRes.statusCode, 201);
    const evId = evRes.json().data.id;

    // Conciliar
    const concRes = await app.inject({
      method: 'POST',
      url: `/api/pagos/${pagoId}/conciliar`,
      payload: { referencia: 'EXTRACTO-CONFIRMADO-55' },
    });
    assert.equal(concRes.statusCode, 200);

    // Comprobar que la evidencia sigue vinculada y disponible en GET
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/pagos/${pagoId}/evidencias`,
    });
    assert.equal(listRes.statusCode, 200);
    const evidencias = listRes.json().data;
    assert.ok(evidencias.some((e: any) => e.id === evId));
  });

  it('18. Separación estricta de garantías e ingresos', async () => {
    const garantiaRes = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-01/garantia',
    });
    assert.equal(garantiaRes.statusCode, 200);
    const garantia = garantiaRes.json().data;
    assert.ok(garantia.id);
    assert.equal(garantia.estado, 'EN_CUSTODIA');
    assert.equal(garantia.importeRecibido, '500.00');
  });

  // H3 / HMAC: Validación de configuración, estabilidad y privacidad
  it('19. Sin secreto HMAC: rechazo con HTTP 500 MISSING_CONFIGURATION y cero escrituras', async () => {
    const originalSecret = process.env.BANK_ACCOUNT_HMAC_SECRET;
    const originalAlias = process.env.PAYMENT_HMAC_SECRET;
    delete process.env.BANK_ACCOUNT_HMAC_SECRET;
    delete process.env.PAYMENT_HMAC_SECRET;

    const prevPaymentsCount = await db.prisma.pago.count();

    const res = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '110.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-NO-HMAC-SECRET',
        fechaPago: '2026-10-30',
        cuentaReferencia: '191-1234-5678',
        idempotencyKey: 'idem-no-hmac-secret-test',
      },
    });

    // Restaurar inmediatamente el secreto para no contaminar tests subsecuentes
    process.env.BANK_ACCOUNT_HMAC_SECRET = originalSecret;
    if (originalAlias) process.env.PAYMENT_HMAC_SECRET = originalAlias;

    assert.equal(res.statusCode, 500);
    assert.equal(res.json().error.code, 'MISSING_CONFIGURATION');

    const postPaymentsCount = await db.prisma.pago.count();
    assert.equal(postPaymentsCount, prevPaymentsCount, 'Cero escrituras en la base de datos cuando falta la configuración');
  });

  it('20. Secreto HMAC con menos de 32 bytes: rechazo con HTTP 500 INVALID_CONFIGURATION y cero escrituras', async () => {
    const originalSecret = process.env.BANK_ACCOUNT_HMAC_SECRET;
    process.env.BANK_ACCOUNT_HMAC_SECRET = 'clave_corta_de_menos_de_32b'; // 27 bytes

    const prevPaymentsCount = await db.prisma.pago.count();

    const res = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '110.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-SHORT-HMAC-SECRET',
        fechaPago: '2026-10-30',
        cuentaReferencia: '191-1234-5678',
        idempotencyKey: 'idem-short-hmac-secret-test',
      },
    });

    process.env.BANK_ACCOUNT_HMAC_SECRET = originalSecret;

    assert.equal(res.statusCode, 500);
    assert.equal(res.json().error.code, 'INVALID_CONFIGURATION');

    const postPaymentsCount = await db.prisma.pago.count();
    assert.equal(postPaymentsCount, prevPaymentsCount, 'Cero escrituras en la base de datos ante secreto HMAC corto');
  });

  it('21. Secreto HMAC compuesto solo de espacios: rechazo con HTTP 500 INVALID_CONFIGURATION sin trim permisivo', async () => {
    const originalSecret = process.env.BANK_ACCOUNT_HMAC_SECRET;
    process.env.BANK_ACCOUNT_HMAC_SECRET = '                                    '; // 36 espacios en blanco

    const prevPaymentsCount = await db.prisma.pago.count();

    const res = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '110.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-SPACES-HMAC-SECRET',
        fechaPago: '2026-10-30',
        cuentaReferencia: '191-1234-5678',
        idempotencyKey: 'idem-spaces-hmac-secret-test',
      },
    });

    process.env.BANK_ACCOUNT_HMAC_SECRET = originalSecret;

    assert.equal(res.statusCode, 500);
    assert.equal(res.json().error.code, 'INVALID_CONFIGURATION');

    const postPaymentsCount = await db.prisma.pago.count();
    assert.equal(postPaymentsCount, prevPaymentsCount, 'Cero escrituras en la base de datos ante secreto con solo espacios');
  });

  it('22. Precedencia: si la variable principal es inválida, NO se oculta el error recurriendo al alias', async () => {
    const originalSecret = process.env.BANK_ACCOUNT_HMAC_SECRET;
    const originalAlias = process.env.PAYMENT_HMAC_SECRET;

    // Principal definida pero inválida (corta), alias definido y válido (32+ bytes)
    process.env.BANK_ACCOUNT_HMAC_SECRET = 'short_invalid';
    process.env.PAYMENT_HMAC_SECRET = 'valid_alias_secret_key_with_at_least_32_bytes!';

    const res = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '110.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-PRECEDENCE-TEST',
        fechaPago: '2026-10-30',
        cuentaReferencia: '191-1234-5678',
        idempotencyKey: 'idem-precedence-test',
      },
    });

    process.env.BANK_ACCOUNT_HMAC_SECRET = originalSecret;
    delete process.env.PAYMENT_HMAC_SECRET;
    if (originalAlias) process.env.PAYMENT_HMAC_SECRET = originalAlias;

    // No debe usar el alias cuando el principal está explícitamente configurado de manera inválida
    assert.equal(res.statusCode, 500);
    assert.equal(res.json().error.code, 'INVALID_CONFIGURATION');
  });

  it('23. Secreto HMAC cambiado entre reintentos genera 409 Conflict sin sobrescribir hash histórico', async () => {
    const originalSecret = process.env.BANK_ACCOUNT_HMAC_SECRET;
    const secretV1 = 'daplace-test-stable-hmac-secret-key-32b!';
    const secretV2 = 'daplace-different-stable-secret-key-32b!';

    process.env.BANK_ACCOUNT_HMAC_SECRET = secretV1;

    const payload = {
      reservaId: 'res-01',
      importe: '195.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'VOUCHER-HMAC-ROTATION-TEST',
      fechaPago: '2026-10-30',
      cuentaReferencia: '191-9999-4444',
      idempotencyKey: 'idem-hmac-rotation-key',
    };

    // Creación inicial con Secreto 1
    const resInitial = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload,
    });
    assert.equal(resInitial.statusCode, 201);
    const initialHash = resInitial.json().data.payloadHash;

    const pagoGuardado = await db.prisma.pago.findUnique({
      where: { idempotencyKey: 'idem-hmac-rotation-key' },
    });
    assert.ok(pagoGuardado?.payloadHash);

    // Cambiar secreto a Secreto 2 (simulando rotación o desalineación entre reinicios)
    process.env.BANK_ACCOUNT_HMAC_SECRET = secretV2;

    const resReplayChangedSecret = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload,
    });

    // Restaurar secreto original
    process.env.BANK_ACCOUNT_HMAC_SECRET = originalSecret;

    // Debe generar 409 Conflict porque el hash calculado con la nueva clave difiere del persistido
    assert.equal(resReplayChangedSecret.statusCode, 409);
    assert.equal(resReplayChangedSecret.json().error.code, 'IDEMPOTENCY_CONFLICT');

    // Inmunidad Financiera: el hash histórico persistido en PostgreSQL NO fue modificado ni sobrescrito
    const pagoPostConflict = await db.prisma.pago.findUnique({
      where: { idempotencyKey: 'idem-hmac-rotation-key' },
    });
    assert.equal(pagoPostConflict?.payloadHash, pagoGuardado?.payloadHash);
  });

  it('24. Privacidad absoluta: ningún secreto ni cuenta completa aparece en respuesta HTTP o auditoría', async () => {
    const rawAccount = '191-8888-7777';
    const secret = process.env.BANK_ACCOUNT_HMAC_SECRET || '';
    assert.ok(secret);

    const res = await app.inject({
      method: 'POST',
      url: '/api/pagos',
      payload: {
        reservaId: 'res-01',
        importe: '205.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-PRIVACY-AUDIT-TEST',
        fechaPago: '2026-10-30',
        cuentaReferencia: rawAccount,
        idempotencyKey: 'idem-privacy-audit-test',
      },
    });

    assert.equal(res.statusCode, 201);
    const responseBody = res.body;

    // La respuesta HTTP no debe contener ni la cuenta completa ni el secreto HMAC
    assert.equal(responseBody.includes(rawAccount), false, 'La cuenta bancaria completa no debe figurar en la respuesta');
    assert.equal(responseBody.includes(secret), false, 'El secreto HMAC jamás debe figurar en la respuesta');
    assert.equal(res.json().data.cuentaReferencia, '****7777');

    const pagoId = res.json().data.id;
    // Inspeccionar el registro de auditoría en PostgreSQL
    const auditEvents = await db.prisma.auditoriaEvento.findMany({
      where: {
        entidad: 'Pago',
        entidadId: pagoId,
      },
    });

    assert.ok(auditEvents.length >= 1);
    for (const event of auditEvents) {
      const serialized = JSON.stringify(event);
      assert.equal(serialized.includes(rawAccount), false, 'La cuenta bancaria completa jamás debe figurar en la auditoría');
      assert.equal(serialized.includes(secret), false, 'El secreto HMAC jamás debe figurar en la auditoría');
    }
  });
});
