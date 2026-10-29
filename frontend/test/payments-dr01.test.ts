import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  paymentService,
  validatePaymentPayload,
  maskRestrictedAccountReference,
  MockPaymentService,
  ApiPaymentService,
} from '../src/features/payments';
import type { CreatePaymentDto } from '../src/features/payments/types';
import { ApiError } from '../src/shared/api/client';

describe('DR-01-FIX: Pagos y Evidencias Documentales — Frontend Unit & Service Tests', () => {
  beforeEach(() => {
    paymentService.reset();
  });

  it('1. Valida y acepta payload de pago con beneficiario, banco receptor y cuenta restringida', () => {
    const dto: CreatePaymentDto = {
      reservaId: 'res-01',
      importe: '450.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'VOUCHER-FRONT-01',
      fechaPago: '2026-10-30',
      beneficiarioTipo: 'PROPIETARIO',
      beneficiarioNombre: 'Propietario Inmueble Lima',
      bancoReceptor: 'BCP',
      cuentaReferencia: '****1234',
    };

    const val = validatePaymentPayload(dto);
    assert.equal(val.isValid, true);
  });

  it('2. Registra un pago con beneficiario y banco en el servicio mock con cuenta enmascarada', async () => {
    const payment = await paymentService.createPayment({
      reservaId: 'res-01',
      importe: '600.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'VOUCHER-FRONT-02',
      fechaPago: '2026-10-30',
      beneficiarioTipo: 'DAPLACE',
      bancoReceptor: 'BBVA',
      cuentaReferencia: '****9988',
    });

    assert.ok(payment.id);
    assert.equal(payment.beneficiarioTipo, 'DAPLACE');
    assert.equal(payment.bancoReceptor, 'BBVA');
    assert.equal(payment.cuentaReferencia, '****9988');
    assert.equal(payment.estado, 'PENDIENTE_CONCILIACION');
  });

  it('3. Enmascaramiento estricto de cuenta: normaliza cuentas completas y rechaza formatos ambiguos', () => {
    // Cuenta completa normalizada
    const masked1 = maskRestrictedAccountReference('191-1234-5678');
    assert.equal(masked1, '****5678');

    // Máscara estricta documentada
    const masked2 = maskRestrictedAccountReference('****4444');
    assert.equal(masked2, '****4444');

    // Rechazo de máscaras ambiguas o mixtas
    assert.throws(() => {
      maskRestrictedAccountReference('123*456');
    }, /formato estricto/);

    assert.throws(() => {
      maskRestrictedAccountReference('***1234');
    }, /formato estricto/);
  });

  it('4. MockPaymentService preserva snapshot inmutable de creación y resuelve idempotencia tras conciliación', async () => {
    const mockService = new MockPaymentService();
    const idempotencyKey = 'idem-mock-snapshot-01';

    const p1 = await mockService.createPayment({
      reservaId: 'res-01',
      importe: '300.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'OP-MOCK-SNAP-01',
      fechaPago: '2026-10-30',
      idempotencyKey,
    });
    assert.equal(p1.estado, 'PENDIENTE_CONCILIACION');

    // Conciliar el pago (el pago muta internamente a CONCILIADO)
    await mockService.reconcilePayment(p1.id, { referencia: 'EXTRACTO-MOCK' });
    const p1Reconciled = await mockService.getPaymentById(p1.id);
    assert.equal(p1Reconciled?.estado, 'CONCILIADO');

    // Replay idempotente con la misma clave: debe devolver el pago existente sin error de comparación
    const p1Replay = await mockService.createPayment({
      reservaId: 'res-01',
      importe: '300.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'OP-MOCK-SNAP-01',
      fechaPago: '2026-10-30',
      idempotencyKey,
    });
    assert.equal(p1Replay.id, p1.id);
    assert.equal(p1Replay.estado, 'CONCILIADO');

    // Conflicto de idempotencia si se intenta enviar payload distinto con la misma clave
    await assert.rejects(
      async () => {
        await mockService.createPayment({
          reservaId: 'res-01',
          importe: '400.00', // Importe diferente
          moneda: 'PEN',
          concepto: 'ADELANTO',
          metodoPago: 'TRANSFERENCIA',
          referencia: 'OP-MOCK-SNAP-01',
          fechaPago: '2026-10-30',
          idempotencyKey,
        });
      },
      /Conflicto de idempotencia \(409\)/
    );
  });

  it('5. MockPaymentService gestiona idempotencia en evidencias posteriores', async () => {
    const mockService = new MockPaymentService();
    const p = await mockService.createPayment({
      reservaId: 'res-01',
      importe: '250.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'OP-MOCK-EV-01',
      fechaPago: '2026-10-30',
    });

    const evKey = 'idem-ev-mock-key-01';
    const ev1 = await mockService.addEvidence(
      p.id,
      {
        nombreArchivo: 'recibo_bcp.pdf',
        referenciaDocumental: 'OP-REC-01',
      },
      evKey
    );
    assert.ok(ev1.id);

    // Mismo envío (reintento idempotente con misma clave)
    const evReplay = await mockService.addEvidence(
      p.id,
      {
        nombreArchivo: 'recibo_bcp.pdf',
        referenciaDocumental: 'OP-REC-01',
      },
      evKey
    );
    assert.equal(evReplay.id, ev1.id);

    // Conflicto con misma clave pero payload diferente
    await assert.rejects(
      async () => {
        await mockService.addEvidence(
          p.id,
          {
            nombreArchivo: 'otro_recibo_modificado.pdf',
            referenciaDocumental: 'OP-REC-01',
          },
          evKey
        );
      },
      /Conflicto de idempotencia \(409\)/
    );
  });

  it('6. Rechaza intento de establecer estado VALIDADA desde el cliente', async () => {
    const payment = await paymentService.createPayment({
      reservaId: 'res-01',
      importe: '150.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'VOUCHER-FRONT-05',
      fechaPago: '2026-10-30',
    });

    await assert.rejects(
      async () => {
        await paymentService.addEvidence(payment.id, {
          nombreArchivo: 'voucher_auto_validado.pdf',
          estado: 'VALIDADA',
        });
      },
      (err: any) => {
        return err.message.includes('VALIDADA') || err.message.includes('REFERENCIADA');
      }
    );
  });

  // H6: Adaptador ApiPaymentService con fetch simulado
  it('7. ApiPaymentService transmite headers de idempotencia y maneja propagación de error 409', async () => {
    const apiService = new ApiPaymentService();
    const originalFetch = globalThis.fetch;

    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = {};

    try {
      // 1. Simulación exitosa con captura de headers
      globalThis.fetch = async (url: any, init: any) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers || {};
        capturedBody = JSON.parse(init?.body || '{}');

        return new Response(
          JSON.stringify({
            data: {
              id: 'ev-mock-api-01',
              pagoId: 'pag-test-01',
              nombreArchivo: capturedBody.nombreArchivo,
              estado: 'REFERENCIADA',
              idempotencyKey: capturedHeaders['idempotency-key'],
              creadoEn: new Date().toISOString(),
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await apiService.addEvidence(
        'pag-test-01',
        {
          nombreArchivo: 'voucher_api_test.pdf',
          referenciaDocumental: 'OP-API-01',
        },
        'custom-idempotency-key-777'
      );

      assert.ok(capturedUrl.includes('/api/pagos/pag-test-01/evidencias'));
      assert.equal(capturedHeaders['idempotency-key'], 'custom-idempotency-key-777');
      assert.equal(capturedBody.idempotencyKey, 'custom-idempotency-key-777');
      assert.equal(result.id, 'ev-mock-api-01');

      // 2. Simulación de respuesta 409 Conflict desde backend
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'La clave de idempotencia ya fue utilizada con un contenido diferente.',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      };

      await assert.rejects(
        async () => {
          await apiService.addEvidence(
            'pag-test-01',
            {
              nombreArchivo: 'voucher_conflicto.pdf',
            },
            'custom-idempotency-key-777'
          );
        },
        (err: any) => {
          return err instanceof ApiError && err.statusCode === 409 && err.code === 'IDEMPOTENCY_CONFLICT';
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('8. H6: MockPaymentService distingue cuentas completas distintas con el mismo sufijo (4444) generando 409 y permite replay con separadores equivalentes', async () => {
    const mockService = new MockPaymentService();
    const idempotencyKey = 'idem-mock-account-h6';

    const baseDto: CreatePaymentDto = {
      reservaId: 'res-01',
      importe: '500.00',
      moneda: 'PEN',
      concepto: 'ADELANTO',
      metodoPago: 'TRANSFERENCIA',
      referencia: 'OP-MOCK-H6',
      fechaPago: '2026-10-30',
      beneficiarioTipo: 'PROPIETARIO',
      bancoReceptor: 'BCP',
      cuentaReferencia: '191-1111-4444', // Cuenta A
      idempotencyKey,
    };

    // 1. Registro inicial con Cuenta A
    const pA = await mockService.createPayment(baseDto);
    assert.ok(pA.id);
    assert.equal(pA.cuentaReferencia, '****4444');

    const totalPagosInicial = (await mockService.getPayments()).length;

    // 2. Intento de reutilizar la misma clave con Cuenta B (distinto número completo pero mismo sufijo 4444)
    await assert.rejects(
      async () => {
        await mockService.createPayment({
          ...baseDto,
          cuentaReferencia: '191-2222-4444', // Cuenta B con mismo sufijo
        });
      },
      /Conflicto de idempotencia \(409\)/
    );

    // Verificar que no se creó un segundo pago y el snapshot original está intacto
    const totalPagosTrasConflicto = (await mockService.getPayments()).length;
    assert.equal(totalPagosTrasConflicto, totalPagosInicial, 'No debe persistir un segundo pago en conflicto');

    // 3. Replay con la misma Cuenta A pero con separadores equivalentes (espacios)
    const pAReplay = await mockService.createPayment({
      ...baseDto,
      cuentaReferencia: '191 1111 4444', // Misma cuenta con espacios
    });
    assert.equal(pAReplay.id, pA.id, 'Debe permitir replay idempotente con separadores equivalentes');
    assert.equal(pAReplay.cuentaReferencia, '****4444');
  });
});
