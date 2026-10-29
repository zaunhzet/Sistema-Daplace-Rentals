import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '../src/generated/prisma/client.js';
import { buildApp } from '../src/app/app.js';
import { seedDatabase } from '../src/scripts/seed.js';
import { getRequiredTestDatabaseUrl, safeResetTestDatabase, createDatabase } from './test-helpers.js';

const testDbUrl = getRequiredTestDatabaseUrl();

describe('DR-02: Contratos de Reserva y Confirmación Verificable — Tests Focales', { concurrency: 1 }, () => {
  let db: ReturnType<typeof createDatabase>;
  let app: FastifyInstance;
  let appWithHabitualPolicy: FastifyInstance;

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

    // DR02-01: App con política sintética HABITUAL_50 inyectada exclusivamente desde el servidor
    appWithHabitualPolicy = buildApp({
      prisma: db.prisma,
      checkDatabase: db.check,
      politicaAdelantoProvider: async () => ({
        tipo: 'HABITUAL_50',
        porcentajeExigible: 50,
        permitePendienteConVoucher: true,
        versionPolitica: 'HABITUAL_50_TEST',
      }),
    });
    await appWithHabitualPolicy.ready();
  });

  after(async () => {
    delete process.env.ENABLE_DEMO_AUTH_BYPASS;
    delete process.env.BANK_ACCOUNT_HMAC_SECRET;
    await app.close();
    await appWithHabitualPolicy.close();
    await db.close();
  });

  // ============================================================================
  // GRUPO 1: CONTRATOS (Pruebas 1 a 7)
  // ============================================================================

  it('1. Registrar referencia crea contrato en estado REFERENCIADA con versión 1', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reservas/res-01/contratos',
      payload: {
        nombreOriginal: 'contrato_alquiler_res01_firmado.pdf',
        urlReferencia: 'https://docs.daplace.internal/contracts/res-01/c1.pdf',
      },
    });

    assert.equal(res.statusCode, 201);
    const data = res.json().data;
    assert.ok(data.id);
    assert.equal(data.reservaId, 'res-01');
    assert.equal(data.version, 1);
    assert.equal(data.estadoFirma, 'REFERENCIADA');
    assert.equal(data.nombreOriginal, 'contrato_alquiler_res01_firmado.pdf');

    // Comprobar persistencia en PostgreSQL
    const enDb = await db.prisma.contratoReserva.findUnique({ where: { id: data.id } });
    assert.ok(enDb);
    assert.equal(enDb.estadoFirma, 'REFERENCIADA');
    assert.equal(enDb.version, 1);
  });

  it('2. Un nombre PDF o URL no acredita firma válida (estado permanece REFERENCIADA)', async () => {
    // Usar reserva fresca res-05 para verificar contrato único no validado
    const res = await app.inject({
      method: 'POST',
      url: '/api/reservas/res-05/contratos',
      payload: {
        nombreOriginal: 'CONTRATO_TOTALMENTE_FIRMADO_Y_LEGALIZADO.PDF',
        urlReferencia: 'https://cdn.example.invalid/signed_contract_verified.pdf',
      },
    });

    assert.equal(res.statusCode, 201);
    const data = res.json().data;
    assert.equal(data.estadoFirma, 'REFERENCIADA');

    // El evaluador de requisitos debe rechazarlo como contrato válido
    const reqRes = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-05/requisitos-confirmacion',
    });
    assert.equal(reqRes.statusCode, 200);
    assert.equal(reqRes.json().data.requisitos.contratoFirmado, false);
    assert.ok(reqRes.json().data.motivosPendientes.includes('CONTRATO_NO_VALIDADO'));
  });

  it('3. Cliente intenta asignar estado VALIDADA o datos de aprobación y el backend lo rechaza con 400', async () => {
    const resForbidden = await app.inject({
      method: 'POST',
      url: '/api/reservas/res-01/contratos',
      payload: {
        nombreOriginal: 'intento_validado_desde_cliente.pdf',
        estadoFirma: 'VALIDADA', // Intento no autorizado
      },
    });
    assert.equal(resForbidden.statusCode, 400);
    assert.equal(resForbidden.json().error.code, 'FORBIDDEN_STATE');

    const resForbiddenAdminFields = await app.inject({
      method: 'POST',
      url: '/api/reservas/res-01/contratos',
      payload: {
        nombreOriginal: 'intento_admin_fields.pdf',
        validadoPorId: 'usr-admin',
        validadoEn: new Date().toISOString(),
      },
    });
    assert.equal(resForbiddenAdminFields.statusCode, 400);
    assert.equal(resForbiddenAdminFields.json().error.code, 'FORBIDDEN_STATE');
  });

  it('4. Nueva versión preserva la anterior sin borrar contratos sustituidos', async () => {
    // Listar versiones previas de res-01
    const listBefore = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-01/contratos',
    });
    const countBefore = listBefore.json().data.length;
    const versionMaxBefore = Math.max(...listBefore.json().data.map((c: any) => c.version));

    // Registrar nueva versión sustituta
    const resNew = await app.inject({
      method: 'POST',
      url: '/api/reservas/res-01/contratos',
      payload: {
        nombreOriginal: 'adenda_contrato_res01_v2.pdf',
        reemplazaContratoId: listBefore.json().data[0].id,
      },
    });
    assert.equal(resNew.statusCode, 201);
    const newVersion = resNew.json().data.version;
    assert.equal(newVersion, versionMaxBefore + 1);

    // Comprobar que en la BD existen todas las versiones anteriores intactas
    const listAfter = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-01/contratos',
    });
    assert.equal(listAfter.json().data.length, countBefore + 1);
    assert.ok(listAfter.json().data.some((c: any) => c.version === 1));
    assert.ok(listAfter.json().data.some((c: any) => c.version === newVersion));
  });

  it('5. Dos solicitudes concurrentes no generan versiones duplicadas en PostgreSQL', async () => {
    // Usar res-02 para probar concurrencia de versiones
    const [callA, callB] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/reservas/res-02/contratos',
        payload: { nombreOriginal: 'contrato_concurrente_A.pdf' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/reservas/res-02/contratos',
        payload: { nombreOriginal: 'contrato_concurrente_B.pdf' },
      }),
    ]);

    // Ambas llamadas deben ser procesadas o bien con versiones correlativas sin duplicación
    const versions = [callA.json().data?.version, callB.json().data?.version].sort();
    assert.notEqual(versions[0], versions[1], 'No debe haber dos versiones idénticas');

    const rows = await db.prisma.contratoReserva.findMany({
      where: { reservaId: 'res-02' },
      orderBy: { version: 'asc' },
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0].version, 1);
    assert.equal(rows[1].version, 2);
  });

  it('6. Contrato de otra reserva no satisface los requisitos de confirmación', async () => {
    // res-03 tiene contrato validado en seed (ct-01). Evaluamos res-04 (que no tiene contrato validado).
    const reqRes04 = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-04/requisitos-confirmacion',
    });
    assert.equal(reqRes04.statusCode, 200);
    assert.equal(reqRes04.json().data.requisitos.contratoFirmado, false);
    assert.ok(reqRes04.json().data.motivosPendientes.includes('CONTRATO_NO_VALIDADO'));
  });

  it('6b. DR02-03: v1 VALIDADA sustituido por v2 REFERENCIADA bloquea confirmación (no revive contrato anterior)', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: new Date('2028-05-01'),
        salida: new Date('2028-05-05'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    const c1 = await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato_v1_validado.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    // Se registra v2 REFERENCIADA que explícitamente reemplaza a v1
    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 2,
        nombreOriginal: 'adenda_v2_pendiente.pdf',
        estadoFirma: 'REFERENCIADA',
        reemplazaContratoId: c1.id,
        registradoPorId: 'usr-admin',
      },
    });

    const reqRes = await app.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    assert.equal(reqRes.statusCode, 200);
    const body = reqRes.json().data;
    assert.equal(body.puedeConfirmar, false);
    assert.equal(body.requisitos.contratoFirmado, false);
    assert.ok(body.motivosPendientes.includes('CONTRATO_NO_VALIDADO'));
  });

  it('6c. DR02-03: v1 VALIDADA sustituido por v2 RECHAZADA bloquea confirmación', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: new Date('2028-05-06'),
        salida: new Date('2028-05-10'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    const c1 = await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato_v1_validado.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 2,
        nombreOriginal: 'adenda_v2_rechazada.pdf',
        estadoFirma: 'RECHAZADA',
        reemplazaContratoId: c1.id,
        registradoPorId: 'usr-admin',
      },
    });

    const reqRes = await app.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    assert.equal(reqRes.statusCode, 200);
    const body = reqRes.json().data;
    assert.equal(body.puedeConfirmar, false);
    assert.equal(body.requisitos.contratoFirmado, false);
    assert.ok(body.motivosPendientes.includes('CONTRATO_NO_VALIDADO'));
  });

  it('6d. DR02-03: Múltiples candidaturas vigentes sin relación inequívoca devuelven CONTRATO_VIGENCIA_PENDIENTE y bloquean', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: new Date('2028-05-11'),
        salida: new Date('2028-05-15'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    // Dos contratos en VALIDADA pero ninguno reemplaza al otro (ambos compiten)
    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato_a.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });
    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 2,
        nombreOriginal: 'contrato_b.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    const reqRes = await app.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    assert.equal(reqRes.statusCode, 200);
    const body = reqRes.json().data;
    assert.equal(body.puedeConfirmar, false);
    assert.equal(body.requisitos.contratoFirmado, false);
    assert.ok(body.motivosPendientes.includes('CONTRATO_VIGENCIA_PENDIENTE'));
  });

  it('7. Falla de auditoría revierte el alta contractual (atomicidad transaccional)', async () => {
    const prevCount = await db.prisma.contratoReserva.count({ where: { reservaId: 'res-03' } });

    // Doble controlado: Proxy de Prisma que induce fallo en tx.auditoriaEvento.create
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
                        throw new Error('SIMULATED_AUDIT_FAILURE_CONTRACT');
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

    const failingApp = buildApp({ prisma: failingPrisma, checkDatabase: db.check });
    await failingApp.ready();

    const res = await failingApp.inject({
      method: 'POST',
      url: '/api/reservas/res-03/contratos',
      payload: { nombreOriginal: 'contrato_destinado_a_rollback.pdf' },
    });
    assert.equal(res.statusCode, 500);

    const postCount = await db.prisma.contratoReserva.count({ where: { reservaId: 'res-03' } });
    assert.equal(postCount, prevCount, 'No debe persistir ningún contrato si la auditoría falla');

    await failingApp.close();
  });

  // ============================================================================
  // GRUPO 2: PAGOS Y ADELANTO (Pruebas 8 a 14)
  // ============================================================================

  it('8. Adenda DR-02: Pago con voucher revisado por coordinador (VALIDADA) permite confirmación comercial aunque esté PENDIENTE_CONCILIACION bancaria', async () => {
    // Crear reserva directa para esta prueba
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: new Date('2028-05-16'),
        salida: new Date('2028-05-20'),
        noches: 5,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    // Registrar contrato y validarlo
    const contrato = await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato_firmado.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });
    assert.ok(contrato);

    // Registrar pago con voucher en estado PENDIENTE_CONCILIACION (tesorería aún no lo concilia)
    const pagoPendiente = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('500.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'VOUCHER-PEND-01',
        fechaPago: new Date('2026-11-01'),
        estado: 'PENDIENTE_CONCILIACION',
      },
    });

    // El coordinador revisó y validó el voucher documental
    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pagoPendiente.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher_pago_revisado.pdf',
        estado: 'VALIDADA',
      },
    });

    // Evaluar requisitos bajo appWithHabitualPolicy (política sintética del servidor HABITUAL_50)
    const reqRes = await appWithHabitualPolicy.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    assert.equal(reqRes.statusCode, 200);
    const body = reqRes.json().data;
    assert.equal(body.puedeConfirmar, true);
    assert.equal(body.requisitos.contratoFirmado, true);
    assert.equal(body.requisitos.pagoRegistrado, true);
    assert.equal(body.requisitos.evidenciaAdelanto, true);
    assert.equal(body.requisitos.evidenciaRevisada, true);
    assert.equal(body.requisitos.adelantoCubierto, true);
    // Conciliación bancaria permanece false (informativo para tesorería) sin bloquear confirmación comercial
    assert.equal(body.requisitos.adelantoConciliado, false);

    // Confirmación atómica exitosa mediante rutas HTTP reales sin parámetros del cliente
    const confirmRes = await appWithHabitualPolicy.inject({
      method: 'POST',
      url: `/api/reservas/${resDirecta.id}/confirmar`,
    });
    assert.equal(confirmRes.statusCode, 200);
    assert.equal(confirmRes.json().estado, 'CONFIRMADA');
  });

  it('9. Adenda DR-02: Pago con voucher sólo REFERENCIADA (no revisado por coordinador) bloquea confirmación con EVIDENCIA_NO_REVISADA', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: new Date('2028-05-21'),
        salida: new Date('2028-05-25'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('800.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    // Contrato validado
    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato_ok.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    // Pago registrado pero voucher aún no revisado por coordinador (REFERENCIADA)
    const pago = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('400.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'VOUCHER-NO-REVISADO',
        fechaPago: new Date('2026-11-01'),
        estado: 'PENDIENTE_CONCILIACION',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pago.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher_no_revisado.pdf',
        estado: 'REFERENCIADA',
      },
    });

    const reqRes = await appWithHabitualPolicy.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    assert.equal(reqRes.statusCode, 200);
    const body = reqRes.json().data;
    assert.equal(body.puedeConfirmar, false);
    assert.equal(body.requisitos.evidenciaAdelanto, true);
    assert.equal(body.requisitos.evidenciaRevisada, false);
    assert.ok(body.motivosPendientes.includes('EVIDENCIA_NO_REVISADA'));
  });

  it('10. Evidencia de otro pago o de otra reserva no satisface requisitos', async () => {
    const resA = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-02',
        huespedId: 'hue-01',
        ingreso: new Date('2026-12-11'),
        salida: new Date('2026-12-15'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('800.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    // Pago de resA no tiene evidencia
    await db.prisma.pago.create({
      data: {
        reservaId: resA.id,
        monto: new Prisma.Decimal('400.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-A-NO-EV',
        fechaPago: new Date('2026-11-01'),
        estado: 'CONCILIADO',
      },
    });

    const reqRes = await app.inject({
      method: 'GET',
      url: `/api/reservas/${resA.id}/requisitos-confirmacion`,
    });
    assert.equal(reqRes.json().data.requisitos.evidenciaAdelanto, false);
    assert.ok(reqRes.json().data.motivosPendientes.includes('EVIDENCIA_ADELANTO_FALTANTE'));
  });

  it('11. Un pago de garantía no satisface el adelanto (separación estricta)', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-03',
        huespedId: 'hue-01',
        ingreso: new Date('2026-12-06'),
        salida: new Date('2026-12-10'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    // Contrato validado
    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato_garantia_test.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    // Registrar garantía recibida pero CERO pagos de alquiler
    await db.prisma.garantia.create({
      data: {
        reservaId: resDirecta.id,
        montoTotal: new Prisma.Decimal('500.00'),
        moneda: 'PEN',
        estado: 'EN_CUSTODIA',
      },
    });

    const reqRes = await app.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    const body = reqRes.json().data;
    assert.equal(body.puedeConfirmar, false);
    assert.equal(body.requisitos.pagoRegistrado, false);
    assert.ok(body.motivosPendientes.includes('PAGO_ADELANTO_FALTANTE'));
  });

  it('12. Política de adelanto ausente/pendiente devuelve motivo explícito POLITICA_ADELANTO_PENDIENTE', async () => {
    // Si no se especifica política aprobada en servidor, el proveedor productivo por defecto devuelve PENDIENTE_APROBACION
    const reqRes = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-01/requisitos-confirmacion',
    });
    assert.equal(reqRes.statusCode, 200);
    const body = reqRes.json().data;
    assert.equal(body.requisitos.politicaAdelantoDefinida, false);
    assert.ok(body.motivosPendientes.includes('POLITICA_ADELANTO_PENDIENTE'));
  });

  it('13. DR02-01: Rechazo explícito con HTTP 400 cuando el cliente intenta establecer políticas, porcentajes o excepciones', async () => {
    // 1) Enviar parámetros de política por query en GET requisitos
    const getPolicyAttempt = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-01/requisitos-confirmacion?politicaTipo=CONFIGURADA&porcentajeExigible=10',
    });
    assert.equal(getPolicyAttempt.statusCode, 400);
    assert.equal(getPolicyAttempt.json().error.code, 'CLIENT_POLICY_FORBIDDEN');

    // 2) Enviar parámetros de política por body en POST confirmar
    const postPolicyAttempt = await app.inject({
      method: 'POST',
      url: '/api/reservas/res-01/confirmar',
      payload: {
        politicaAdelanto: { tipo: 'CONFIGURADA', porcentajeExigible: 5 },
      },
    });
    assert.equal(postPolicyAttempt.statusCode, 400);
    assert.equal(postPolicyAttempt.json().error.code, 'CLIENT_POLICY_FORBIDDEN');
  });

  it('13b. DR02-01 RED/GREEN: Reserva de 1000 con pago de 1, cliente envía política inventada y backend rechaza con 400', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-04',
        huespedId: 'hue-01',
        ingreso: new Date('2026-12-21'),
        salida: new Date('2026-12-25'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    // Pago de S/ 1
    const pago = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('1.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-FAKE-1-SOL',
        fechaPago: new Date('2026-11-01'),
        estado: 'CONCILIADO',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pago.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher_1.pdf',
        estado: 'VALIDADA',
      },
    });

    // Cliente envía política CONFIGURADA, porcentaje 0.1 %, excepción y gerente inventado
    const postMalicioso = await app.inject({
      method: 'POST',
      url: `/api/reservas/${resDirecta.id}/confirmar`,
      payload: {
        politicaTipo: 'CONFIGURADA',
        porcentajeExigible: 0.1,
        esExcepcion: true,
        autorizadoPorId: 'gerente_inventado_999',
      },
    });
    // POST no confirma, responde 400 CLIENT_POLICY_FORBIDDEN
    assert.equal(postMalicioso.statusCode, 400);
    assert.equal(postMalicioso.json().error.code, 'CLIENT_POLICY_FORBIDDEN');

    // GET tampoco acepta la política inventada
    const getMalicioso = await app.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion?porcentajeExigible=0.1&autorizadoPorId=gerente_inventado`,
    });
    assert.equal(getMalicioso.statusCode, 400);
    assert.equal(getMalicioso.json().error.code, 'CLIENT_POLICY_FORBIDDEN');

    // Sin fuente backend aprobada, puedeConfirmar = false
    const getLimpio = await app.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    assert.equal(getLimpio.statusCode, 200);
    assert.equal(getLimpio.json().data.puedeConfirmar, false);

    // No se registra evento CONFIRMAR_RESERVA
    const auditEvents = await db.prisma.auditoriaEvento.findMany({
      where: { entidadId: resDirecta.id, accion: 'CONFIRMAR_RESERVA' },
    });
    assert.equal(auditEvents.length, 0);
  });

  it('13c. DR02-02: Pago de 500 RECHAZADO con voucher VALIDADA no cubre adelanto de 500', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-04',
        huespedId: 'hue-01',
        ingreso: new Date('2026-12-11'),
        salida: new Date('2026-12-15'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    // Pago de 500 pero en estado RECHAZADO con voucher VALIDADA
    const pagoRechazado = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('500.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-RECHAZADA-500',
        fechaPago: new Date('2026-11-01'),
        estado: 'RECHAZADO',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pagoRechazado.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher_rechazado.pdf',
        estado: 'VALIDADA',
      },
    });

    const reqRes = await appWithHabitualPolicy.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    const body = reqRes.json().data;
    assert.equal(body.puedeConfirmar, false);
    assert.equal(body.requisitos.adelantoCubierto, false);
    assert.equal(body.detalles.totalPagado, '0.00');
    assert.ok(body.motivosPendientes.includes('ADELANTO_INSUFICIENTE'));
  });

  it('13d. DR02-02: Pago de 300 con dos evidencias válidas aporta exactamente 300 (no duplica)', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-04',
        huespedId: 'hue-01',
        ingreso: new Date('2026-12-16'),
        salida: new Date('2026-12-20'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    const pago = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('300.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-300-MULTI-VOUCHER',
        fechaPago: new Date('2026-11-01'),
        estado: 'CONCILIADO',
      },
    });

    // Dos vouchers validados para el mismo pago
    await db.prisma.evidenciaPago.create({
      data: { pagoId: pago.id, tipo: 'VOUCHER', nombreArchivo: 'v1.pdf', estado: 'VALIDADA' },
    });
    await db.prisma.evidenciaPago.create({
      data: { pagoId: pago.id, tipo: 'VOUCHER', nombreArchivo: 'v2.pdf', estado: 'VALIDADA' },
    });

    const reqRes = await appWithHabitualPolicy.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    const body = reqRes.json().data;
    assert.equal(body.detalles.totalPagado, '300.00', 'Debe sumar el pago exactamente una vez');
  });

  it('13e. FIX 1: Bandera permitePendienteConVoucher omitida (undefined) aporta 0 y bloquea confirmación', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-04',
        huespedId: 'hue-01',
        ingreso: new Date('2028-07-01'),
        salida: new Date('2028-07-05'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    const pagoPendiente = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('500.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-PEND-OMITIDA',
        fechaPago: new Date('2028-06-25'),
        estado: 'PENDIENTE_CONCILIACION',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pagoPendiente.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher_omitido.pdf',
        estado: 'VALIDADA',
      },
    });

    // App con proveedor sintético que OMITE permitePendienteConVoucher (undefined)
    const appOmitida = buildApp({
      prisma: db.prisma,
      checkDatabase: db.check,
      politicaAdelantoProvider: async () => ({
        tipo: 'HABITUAL_50',
        porcentajeExigible: 50,
      }),
    });
    await appOmitida.ready();

    const getRes = await appOmitida.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    const body = getRes.json().data;
    assert.equal(body.puedeConfirmar, false);
    assert.equal(body.detalles.totalPagado, '0.00', 'Pago pendiente con bandera omitida debe aportar 0.00');
    assert.ok(body.motivosPendientes.includes('ADELANTO_INSUFICIENTE'));

    const postRes = await appOmitida.inject({
      method: 'POST',
      url: `/api/reservas/${resDirecta.id}/confirmar`,
    });
    assert.equal(postRes.statusCode, 409);
    assert.equal(postRes.json().error.code, 'REQUIREMENTS_NOT_MET');

    await appOmitida.close();
  });

  it('13f. FIX 1: Bandera permitePendienteConVoucher en false aporta 0 y bloquea confirmación con 409', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-04',
        huespedId: 'hue-01',
        ingreso: new Date('2028-07-06'),
        salida: new Date('2028-07-10'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    const pagoPendiente = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('500.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-PEND-FALSE',
        fechaPago: new Date('2028-06-25'),
        estado: 'PENDIENTE_CONCILIACION',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pagoPendiente.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher_false.pdf',
        estado: 'VALIDADA',
      },
    });

    // App con proveedor sintético que explícitamente pone permitePendienteConVoucher: false
    const appFalse = buildApp({
      prisma: db.prisma,
      checkDatabase: db.check,
      politicaAdelantoProvider: async () => ({
        tipo: 'HABITUAL_50',
        porcentajeExigible: 50,
        permitePendienteConVoucher: false,
      }),
    });
    await appFalse.ready();

    const getRes = await appFalse.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    const body = getRes.json().data;
    assert.equal(body.puedeConfirmar, false);
    assert.equal(body.detalles.totalPagado, '0.00', 'Pago pendiente con bandera false debe aportar 0.00');
    assert.ok(body.motivosPendientes.includes('ADELANTO_INSUFICIENTE'));

    const postRes = await appFalse.inject({
      method: 'POST',
      url: `/api/reservas/${resDirecta.id}/confirmar`,
    });
    assert.equal(postRes.statusCode, 409);
    assert.equal(postRes.json().error.code, 'REQUIREMENTS_NOT_MET');

    await appFalse.close();
  });

  it('13g. FIX 1: Bandera permitePendienteConVoucher estrictamente true aporta 500 y permite POST confirmar', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-04',
        huespedId: 'hue-01',
        ingreso: new Date('2028-07-11'),
        salida: new Date('2028-07-15'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    const pagoPendiente = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('500.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-PEND-TRUE',
        fechaPago: new Date('2028-06-25'),
        estado: 'PENDIENTE_CONCILIACION',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pagoPendiente.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher_true.pdf',
        estado: 'VALIDADA',
      },
    });

    // App con proveedor sintético con permitePendienteConVoucher: true
    const appTrue = buildApp({
      prisma: db.prisma,
      checkDatabase: db.check,
      politicaAdelantoProvider: async () => ({
        tipo: 'HABITUAL_50',
        porcentajeExigible: 50,
        permitePendienteConVoucher: true,
      }),
    });
    await appTrue.ready();

    const getRes = await appTrue.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    const body = getRes.json().data;
    assert.equal(body.puedeConfirmar, true);
    assert.equal(body.detalles.totalPagado, '500.00', 'Pago pendiente con bandera true y voucher validado aporta 500');

    // Ejercitar POST confirmar real con proveedor backend inyectado
    const postRes = await appTrue.inject({
      method: 'POST',
      url: `/api/reservas/${resDirecta.id}/confirmar`,
    });
    assert.equal(postRes.statusCode, 200);
    assert.equal(postRes.json().estado, 'CONFIRMADA');

    await appTrue.close();
  });

  it('13h. FIX 1: Pago RECHAZADO aporta 0 incluso con permitePendienteConVoucher en true', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-04',
        huespedId: 'hue-01',
        ingreso: new Date('2028-07-16'),
        salida: new Date('2028-07-20'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    const pagoRechazado = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('500.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-RECHAZADO-CON-FLAG-TRUE',
        fechaPago: new Date('2028-06-25'),
        estado: 'RECHAZADO',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pagoRechazado.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher_rechazado.pdf',
        estado: 'VALIDADA',
      },
    });

    const appTrue = buildApp({
      prisma: db.prisma,
      checkDatabase: db.check,
      politicaAdelantoProvider: async () => ({
        tipo: 'HABITUAL_50',
        porcentajeExigible: 50,
        permitePendienteConVoucher: true,
      }),
    });
    await appTrue.ready();

    const getRes = await appTrue.inject({
      method: 'GET',
      url: `/api/reservas/${resDirecta.id}/requisitos-confirmacion`,
    });
    const body = getRes.json().data;
    assert.equal(body.puedeConfirmar, false);
    assert.equal(body.detalles.totalPagado, '0.00', 'Pago rechazado no aporta nada aunque el flag sea true');
    assert.ok(body.motivosPendientes.includes('ADELANTO_INSUFICIENTE'));

    await appTrue.close();
  });

  it('14. Dos monedas diferentes no se suman (Inmunidad Financiera)', async () => {
    const resPEN = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-04',
        huespedId: 'hue-01',
        ingreso: new Date('2028-06-01'),
        salida: new Date('2028-06-05'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    // Pago conciliado en USD (no en PEN)
    const pagoUSD = await db.prisma.pago.create({
      data: {
        reservaId: resPEN.id,
        monto: new Prisma.Decimal('300.00'),
        moneda: 'USD',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-USD-ON-PEN',
        fechaPago: new Date('2026-11-01'),
        estado: 'CONCILIADO',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pagoUSD.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher_usd.pdf',
        estado: 'REFERENCIADA',
      },
    });

    const reqRes = await appWithHabitualPolicy.inject({
      method: 'GET',
      url: `/api/reservas/${resPEN.id}/requisitos-confirmacion`,
    });
    const body = reqRes.json().data;
    assert.equal(body.puedeConfirmar, false);
    assert.equal(body.detalles.totalConciliado, '0.00', 'No debe sumar pagos en monedas incompatibles');
    assert.ok(body.motivosPendientes.includes('MONEDA_INCONSISTENTE'));
  });

  // ============================================================================
  // GRUPO 3: TRANSICIÓN Y CONCURRENCIA (Pruebas 15 a 22)
  // ============================================================================

  it('15. DIRECTO SOLICITADA incompleta devuelve 409 sin escrituras en base de datos', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-05',
        huespedId: 'hue-01',
        ingreso: new Date('2026-12-21'),
        salida: new Date('2026-12-25'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1200.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    const auditCountBefore = await db.prisma.auditoriaEvento.count();

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/reservas/${resDirecta.id}/confirmar`,
    });

    assert.equal(confirmRes.statusCode, 409);
    assert.equal(confirmRes.json().error.code, 'REQUIREMENTS_NOT_MET');
    assert.ok(Array.isArray(confirmRes.json().error.motivosPendientes));

    // Comprobar que en la BD el estado sigue siendo SOLICITADA (cero escrituras)
    const resDb = await db.prisma.reserva.findUnique({ where: { id: resDirecta.id } });
    assert.equal(resDb?.estado, 'SOLICITADA');

    // Cero eventos de confirmación registrados en auditoría
    const auditEvents = await db.prisma.auditoriaEvento.findMany({
      where: { entidadId: resDirecta.id, accion: 'CONFIRMAR_RESERVA' },
    });
    assert.equal(auditEvents.length, 0);
  });

  it('16. Reserva CANCELADA conserva rechazo HTTP 409 INVALID_STATE_TRANSITION', async () => {
    const resCancelada = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-05',
        huespedId: 'hue-01',
        ingreso: new Date('2026-12-26'),
        salida: new Date('2026-12-30'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1200.00'),
        moneda: 'PEN',
        estado: 'CANCELADA',
        origen: 'DIRECTO',
      },
    });

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/reservas/${resCancelada.id}/confirmar`,
    });
    assert.equal(confirmRes.statusCode, 409);
    assert.equal(confirmRes.json().error.code, 'INVALID_STATE_TRANSITION');
  });

  it('17. Reserva inexistente conserva HTTP 404 RESERVATION_NOT_FOUND', async () => {
    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/reservas/res-inexistente-9999/confirmar',
    });
    assert.equal(confirmRes.statusCode, 404);
    assert.equal(confirmRes.json().error.code, 'RESERVATION_NOT_FOUND');
  });

  it('18. CONFIRMADA histórica conserva el comportamiento definido (replay idempotente)', async () => {
    const resConfirmada = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-05',
        huespedId: 'hue-01',
        ingreso: new Date('2027-01-01'),
        salida: new Date('2027-01-05'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1200.00'),
        moneda: 'PEN',
        estado: 'CONFIRMADA',
        origen: 'DIRECTO',
      },
    });

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/reservas/${resConfirmada.id}/confirmar`,
    });
    assert.equal(confirmRes.statusCode, 200);
    assert.equal(confirmRes.json().estado, 'CONFIRMADA');
  });

  it('19. Dos confirmaciones concurrentes bajo política aprobada no duplican auditoría ni transiciones', async () => {
    // Preparar reserva directa que CUMPLE todos los requisitos bajo política de prueba del servidor
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: new Date('2027-02-01'),
        salida: new Date('2027-02-05'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato_aprobado.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    const pago = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('500.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'VOUCHER-CONCURRENT-OK',
        fechaPago: new Date('2027-01-15'),
        estado: 'CONCILIADO',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pago.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher_500.pdf',
        estado: 'VALIDADA',
      },
    });

    // Dos confirmaciones simultáneas en app con política aprobada HABITUAL_50 (sin payload de cliente)
    const [callA, callB] = await Promise.all([
      appWithHabitualPolicy.inject({
        method: 'POST',
        url: `/api/reservas/${resDirecta.id}/confirmar`,
      }),
      appWithHabitualPolicy.inject({
        method: 'POST',
        url: `/api/reservas/${resDirecta.id}/confirmar`,
      }),
    ]);

    assert.equal(callA.statusCode, 200);
    assert.equal(callB.statusCode, 200);

    const auditEvents = await db.prisma.auditoriaEvento.findMany({
      where: { entidadId: resDirecta.id, accion: 'CONFIRMAR_RESERVA' },
    });
    assert.equal(auditEvents.length, 1, 'Debe haber exactamente un evento de confirmación en auditoría');
  });

  it('20. Fallo de auditoría en confirmación revierte la transición atómicamente', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: new Date('2027-02-10'),
        salida: new Date('2027-02-15'),
        noches: 5,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    const pago = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('500.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-ROLLBACK-CONFIRM',
        fechaPago: new Date('2027-01-20'),
        estado: 'CONCILIADO',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pago.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher.pdf',
        estado: 'VALIDADA',
      },
    });

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
                        throw new Error('SIMULATED_AUDIT_FAILURE_CONFIRMATION');
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
      politicaAdelantoProvider: async () => ({
        tipo: 'HABITUAL_50',
        porcentajeExigible: 50,
        permitePendienteConVoucher: true,
      }),
    });
    await failingApp.ready();

    const res = await failingApp.inject({
      method: 'POST',
      url: `/api/reservas/${resDirecta.id}/confirmar`,
    });
    assert.equal(res.statusCode, 500);

    // En la base de datos debe permanecer en SOLICITADA
    const enDb = await db.prisma.reserva.findUnique({ where: { id: resDirecta.id } });
    assert.equal(enDb?.estado, 'SOLICITADA');

    await failingApp.close();
  });

  it('20b. DR02-02: Rechazo bancario secuencial previo es observado en confirmación tras releer pagos bloqueados y rechaza con 409', async () => {
    const resDirecta = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: new Date('2027-02-18'),
        salida: new Date('2027-02-22'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'DIRECTO',
      },
    });

    await db.prisma.contratoReserva.create({
      data: {
        reservaId: resDirecta.id,
        version: 1,
        nombreOriginal: 'contrato.pdf',
        estadoFirma: 'VALIDADA',
        registradoPorId: 'usr-admin',
      },
    });

    const pago = await db.prisma.pago.create({
      data: {
        reservaId: resDirecta.id,
        monto: new Prisma.Decimal('500.00'),
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referenciaOperacion: 'OP-RACE-RECHAZO',
        fechaPago: new Date('2027-01-20'),
        estado: 'PENDIENTE_CONCILIACION',
      },
    });

    await db.prisma.evidenciaPago.create({
      data: {
        pagoId: pago.id,
        tipo: 'VOUCHER',
        nombreArchivo: 'voucher.pdf',
        estado: 'VALIDADA',
      },
    });

    // Rechazo bancario completado secuencialmente antes de la confirmación
    await app.inject({
      method: 'POST',
      url: `/api/pagos/${pago.id}/rechazar`,
      payload: { motivo: 'Comprobante adulterado detectado por banco' },
    });

    // Confirmar observa el pago en estado RECHAZADO tras releer dentro de la transacción protegida y falla con 409
    const res = await appWithHabitualPolicy.inject({
      method: 'POST',
      url: `/api/reservas/${resDirecta.id}/confirmar`,
    });

    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.code, 'REQUIREMENTS_NOT_MET');
    assert.ok(res.json().error.motivosPendientes.includes('ADELANTO_INSUFICIENTE'));
  });

  it('21. Revalidación de fechas en confirmación conserva restricción PostgreSQL ante solape', async () => {
    // Reserva existente ya confirmada en prop-01
    await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: new Date('2027-03-01'),
        salida: new Date('2027-03-05'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'CONFIRMADA',
        origen: 'WEB',
      },
    });

    // 1) Verificar que a nivel físico PostgreSQL rechaza la inserción solapada con reservas_no_overlapping_excl (23P01)
    await assert.rejects(
      async () => {
        await db.prisma.reserva.create({
          data: {
            propiedadId: 'prop-01',
            huespedId: 'hue-01',
            ingreso: new Date('2027-03-02'),
            salida: new Date('2027-03-06'),
            noches: 4,
            montoAcordado: new Prisma.Decimal('1000.00'),
            moneda: 'PEN',
            estado: 'SOLICITADA',
            origen: 'WEB',
          },
        });
      },
      (err: any) => {
        return err.code === '23P01' || err.message?.includes('reservas_no_overlapping_excl');
      }
    );

    // 2) Verificar que la API HTTP también atrapa la violación y retorna 409 RESERVATION_CONFLICT
    const resConflict = await app.inject({
      method: 'POST',
      url: '/api/reservas',
      payload: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: '2027-03-02',
        salida: '2027-03-06',
        montoAcordado: 1000,
        moneda: 'PEN',
      },
    });
    assert.equal(resConflict.statusCode, 409);
    assert.equal(resConflict.json().error.code, 'RESERVATION_CONFLICT');
  });

  it('22. Otros canales (WEB, AIRBNB) mantienen su comportamiento existente sin exigir contrato', async () => {
    const resWeb = await db.prisma.reserva.create({
      data: {
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: new Date('2027-04-01'),
        salida: new Date('2027-04-05'),
        noches: 4,
        montoAcordado: new Prisma.Decimal('1000.00'),
        moneda: 'PEN',
        estado: 'SOLICITADA',
        origen: 'WEB', // Canal WEB no requiere contrato directo
      },
    });

    const confirmRes = await app.inject({
      method: 'POST',
      url: `/api/reservas/${resWeb.id}/confirmar`,
    });
    assert.equal(confirmRes.statusCode, 200);
    assert.equal(confirmRes.json().estado, 'CONFIRMADA');
  });

  // ============================================================================
  // GRUPO 4: SEGURIDAD (Pruebas 23 a 26)
  // ============================================================================

  it('23. Seguridad: 401 sin autenticación al intentar registrar o consultar contratos', async () => {
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'false';

    const unauthPost = await app.inject({
      method: 'POST',
      url: '/api/reservas/res-01/contratos',
      payload: { nombreOriginal: 'unauth.pdf' },
    });
    assert.equal(unauthPost.statusCode, 401);

    const unauthGet = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-01/contratos',
    });
    assert.equal(unauthGet.statusCode, 401);

    process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
  });

  it('24. Seguridad: 403 para perfil PROPIETARIO al intentar acceder a contratos privados', async () => {
    const customApp = buildApp({ prisma: db.prisma, checkDatabase: db.check });
    customApp.addHook('preHandler', async (req) => {
      req.user = {
        id: 'usr-prop-01',
        nombre: 'Propietario Sin Permiso',
        email: 'propietario@example.invalid',
        rol: 'PROPIETARIO',
      };
    });
    await customApp.ready();

    const forbidPost = await customApp.inject({
      method: 'POST',
      url: '/api/reservas/res-01/contratos',
      payload: { nombreOriginal: 'forbid.pdf' },
    });
    assert.equal(forbidPost.statusCode, 403);

    const forbidGet = await customApp.inject({
      method: 'GET',
      url: '/api/reservas/res-01/contratos',
    });
    assert.equal(forbidGet.statusCode, 403);

    await customApp.close();
  });

  it('25. No exponer enlaces privados de contratos a roles no autorizados', async () => {
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'false';
    const res = await app.inject({
      method: 'GET',
      url: '/api/reservas/res-01/contratos',
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.includes('https://docs.daplace.internal'), false);
    process.env.ENABLE_DEMO_AUTH_BYPASS = 'true';
  });

  it('26. No permitir validaciones documentales por parámetros del cliente (rechazo estricto)', async () => {
    const resMalicioso = await app.inject({
      method: 'POST',
      url: '/api/reservas/res-01/contratos',
      payload: {
        nombreOriginal: 'intento_validar_por_parametro.pdf',
        estadoFirma: 'VALIDADA',
        motivoValidacion: 'Aprobado por el cliente en body',
      },
    });
    assert.equal(resMalicioso.statusCode, 400);
    assert.equal(resMalicioso.json().error.code, 'FORBIDDEN_STATE');
  });
});
