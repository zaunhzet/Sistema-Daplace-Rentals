import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { paymentService, validatePaymentPayload, financialReadService } from '../src/features/payments';
import { reservationService } from '../src/features/reservations';
import { guaranteeService } from '../src/features/guarantees';

describe('Payments & Reconciliation Module — Unit & Integration Tests (UI-ANDRE-003)', () => {
  beforeEach(() => {
    paymentService.reset();
    guaranteeService.reset();
    reservationService.reset();
  });

  describe('Validation Logic', () => {
    it('rejects payment with empty reservation or invalid amounts', () => {
      const emptyRes = validatePaymentPayload({ reservaId: '', importe: '100.00' });
      assert.equal(emptyRes.isValid, false);
      assert.ok(emptyRes.errors.reservaId);

      const zeroAmount = validatePaymentPayload({ reservaId: 'res-01', importe: '0.00' });
      assert.equal(zeroAmount.isValid, false);
      assert.ok(zeroAmount.errors.importe);

      const negativeAmount = validatePaymentPayload({ reservaId: 'res-01', importe: '-150.00' });
      assert.equal(negativeAmount.isValid, false);
      assert.ok(negativeAmount.errors.importe);
    });

    it('rejects payment without valid reference or payment method', () => {
      const missingRef = validatePaymentPayload({
        reservaId: 'res-01',
        importe: '100.00',
        referencia: '',
      });
      assert.equal(missingRef.isValid, false);
      assert.ok(missingRef.errors.referencia);
    });
  });

  describe('Payment Lifecycle & Financial Invariants', () => {
    it('1. Pago nuevo queda pendiente (PENDIENTE_CONCILIACION)', async () => {
      const payment = await paymentService.createPayment({
        reservaId: 'res-01',
        importe: '300.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'VOUCHER-TEST-01',
        fechaPago: '2026-11-01',
      });

      assert.ok(payment.id);
      assert.equal(payment.estado, 'PENDIENTE_CONCILIACION');
      assert.equal(payment.importe, '300.00');
      assert.equal(payment.reservaId, 'res-01');
    });

    it('2. Pago pendiente no reduce el saldo de la reserva', async () => {
      // res-01 tiene montoAcordado 1400.00 y pag-01 (500.00 CONCILIADO) preexistente
      const summaryBefore = await paymentService.getReservationFinancialSummary('res-01');
      assert.equal(summaryBefore.totalPagosConciliados, '500.00');
      assert.equal(summaryBefore.saldoPendiente, '900.00');

      // Crear pago de 400.00 en estado PENDIENTE_CONCILIACION
      await paymentService.createPayment({
        reservaId: 'res-01',
        importe: '400.00',
        moneda: 'PEN',
        concepto: 'SALDO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'PENDIENTE-400',
        fechaPago: '2026-11-02',
      });

      const summaryAfter = await paymentService.getReservationFinancialSummary('res-01');
      // Total conciliado y saldo pendiente NO cambian ante pagos pendientes
      assert.equal(summaryAfter.totalPagosConciliados, '500.00');
      assert.equal(summaryAfter.saldoPendiente, '900.00');
      assert.equal(summaryAfter.totalPagosPendientes, '1300.00'); // 900 semilla + 400 nuevo
    });

    it('3. Pago conciliado reduce correctamente el saldo', async () => {
      // Registrar abono de 900.00
      const payment = await paymentService.createPayment({
        reservaId: 'res-01',
        importe: '900.00',
        moneda: 'PEN',
        concepto: 'SALDO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'CONCILIAR-ME',
        fechaPago: '2026-11-02',
      });

      // Conciliar explícitamente
      const reconciled = await paymentService.reconcilePayment(payment.id, {
        referencia: 'CONFIRMADO-EXTRACTO-01',
      });
      assert.equal(reconciled.estado, 'CONCILIADO');
      assert.ok(reconciled.conciliadoEn);

      // Ahora el saldo se reduce de 900.00 a 0.00 (500.00 previo + 900.00 nuevo = 1400.00)
      const summary = await paymentService.getReservationFinancialSummary('res-01');
      assert.equal(summary.totalPagosConciliados, '1400.00');
      assert.equal(summary.saldoPendiente, '0.00');
    });

    it('4. Pago rechazado no suma a ingresos ni reduce el saldo', async () => {
      const payment = await paymentService.createPayment({
        reservaId: 'res-01',
        importe: '500.00',
        moneda: 'PEN',
        concepto: 'SALDO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'FALSO-VOUCHER',
        fechaPago: '2026-11-02',
      });

      const rejected = await paymentService.rejectPayment(payment.id, {
        motivo: 'Fondos no ingresaron a la cuenta corriente institucional.',
      });
      assert.equal(rejected.estado, 'RECHAZADO');
      assert.equal(rejected.motivoRechazo, 'Fondos no ingresaron a la cuenta corriente institucional.');

      const summary = await paymentService.getReservationFinancialSummary('res-01');
      assert.equal(summary.totalPagosConciliados, '500.00');
      assert.equal(summary.saldoPendiente, '900.00');
    });

    it('5. Conciliación repetida no duplica importes (idempotencia funcional)', async () => {
      const summaryInitial = await paymentService.getReservationFinancialSummary('res-01');
      assert.equal(summaryInitial.totalPagosConciliados, '500.00');

      // Reconciliar pag-01 que ya está CONCILIADO
      const secondReconciliation = await paymentService.reconcilePayment('pag-01');
      assert.equal(secondReconciliation.estado, 'CONCILIADO');

      // Total conciliado sigue siendo exactamente 500.00, no 1000.00
      const summaryAfter = await paymentService.getReservationFinancialSummary('res-01');
      assert.equal(summaryAfter.totalPagosConciliados, '500.00');
    });

    it('6. Clave idempotente reutilizada con distinto contenido genera conflicto 409', async () => {
      await paymentService.createPayment({
        reservaId: 'res-01',
        importe: '250.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'IDEM-REF-1',
        fechaPago: '2026-11-01',
        idempotencyKey: 'clave-unica-123',
      });

      // Misma clave con importe diferente (500.00 en vez de 250.00)
      await assert.rejects(
        async () => {
          await paymentService.createPayment({
            reservaId: 'res-01',
            importe: '500.00',
            moneda: 'PEN',
            concepto: 'ADELANTO',
            metodoPago: 'TRANSFERENCIA',
            referencia: 'IDEM-REF-1',
            fechaPago: '2026-11-01',
            idempotencyKey: 'clave-unica-123',
          });
        },
        /Conflicto de idempotencia/
      );
    });

    it('6b. Clave idempotente reutilizada con mismo contenido devuelve el pago existente', async () => {
      const first = await paymentService.createPayment({
        reservaId: 'res-01',
        importe: '250.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'IDEM-REF-SAME',
        fechaPago: '2026-11-01',
        idempotencyKey: 'clave-replay-777',
      });

      const replay = await paymentService.createPayment({
        reservaId: 'res-01',
        importe: '250.00',
        moneda: 'PEN',
        concepto: 'ADELANTO',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'IDEM-REF-SAME',
        fechaPago: '2026-11-01',
        idempotencyKey: 'clave-replay-777',
      });

      assert.equal(first.id, replay.id);
    });

    it('7. Importes inválidos son rechazados', async () => {
      await assert.rejects(
        async () => {
          await paymentService.createPayment({
            reservaId: 'res-01',
            importe: '-50.00',
            moneda: 'PEN',
            concepto: 'ADELANTO',
            metodoPago: 'TRANSFERENCIA',
            referencia: 'INV',
            fechaPago: '2026-11-01',
          });
        },
        /Validación de pago fallida/
      );
    });

    it('8. Reserva inexistente o inconsistencia de moneda es rechazada', async () => {
      await assert.rejects(
        async () => {
          await paymentService.createPayment({
            reservaId: 'res-inexistente',
            importe: '100.00',
            moneda: 'PEN',
            concepto: 'ADELANTO',
            metodoPago: 'TRANSFERENCIA',
            referencia: 'INV',
            fechaPago: '2026-11-01',
          });
        },
        /no existe/
      );

      // Inconsistencia de moneda: res-01 está en PEN
      await assert.rejects(
        async () => {
          await paymentService.createPayment({
            reservaId: 'res-01',
            importe: '100.00',
            moneda: 'USD',
            concepto: 'ADELANTO',
            metodoPago: 'TRANSFERENCIA',
            referencia: 'INV',
            fechaPago: '2026-11-01',
          });
        },
        /Inconsistencia de moneda/
      );
    });

    it('9. Detecta sobrepago y emite alerta si pagos conciliados superan el pactado', async () => {
      // res-01 tiene monto 1400.00, agregamos abono de 1000.00 y lo conciliamos (500 + 1000 = 1500 > 1400)
      const overPay = await paymentService.createPayment({
        reservaId: 'res-01',
        importe: '1000.00',
        moneda: 'PEN',
        concepto: 'PAGO_TOTAL',
        metodoPago: 'TRANSFERENCIA',
        referencia: 'OVERPAY',
        fechaPago: '2026-11-01',
      });
      await paymentService.reconcilePayment(overPay.id);

      const summary = await paymentService.getReservationFinancialSummary('res-01');
      assert.equal(summary.tieneSobrepago, true);
      assert.equal(summary.montoSobrepago, '100.00');
      assert.ok(summary.alertaSobrepago?.includes('pendiente de decisión institucional'));
    });
  });

  describe('Financial Read Service for Diego (Dashboard / Reports)', () => {
    it('provides separated rental income and guarantee custody totals per property', async () => {
      const summary = await financialReadService.getPropertySummary('prop-01', 'PEN');
      assert.ok(summary.propiedadId, 'prop-01');
      // res-01 (500 conciliado) + res-03 (840 conciliado) = 1340.00
      assert.equal(summary.totalIngresosConciliados, '1340.00');
      // gar-01 tiene 300.00 en custodia para prop-01, estrictamente separado
      assert.equal(summary.totalGarantiasEnCustodia, '300.00');
    });

    it('generates unified financial ledger with strict rubro separation', async () => {
      const ledger = await financialReadService.getFinancialLedger();
      assert.ok(ledger.length >= 6);

      const rentalEntries = ledger.filter((l) => l.rubro === 'INGRESO_ALQUILER');
      const guaranteeEntries = ledger.filter((l) => l.rubro === 'FONDO_GARANTIA');

      assert.ok(rentalEntries.length > 0);
      assert.ok(guaranteeEntries.length > 0);

      // Garantías nunca son ingreso validado
      for (const g of guaranteeEntries) {
        assert.equal(g.esIngresoValidado, false);
      }
    });
  });
});
