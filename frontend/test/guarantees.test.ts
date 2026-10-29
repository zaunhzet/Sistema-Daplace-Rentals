import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { guaranteeService, validateGuaranteePayload } from '../src/features/guarantees';
import { paymentService } from '../src/features/payments';
import { reservationService } from '../src/features/reservations';

describe('Guarantees Module — Unit & Integration Tests (UI-ANDRE-003)', () => {
  beforeEach(() => {
    guaranteeService.reset();
    paymentService.reset();
    reservationService.reset();
  });

  describe('Validation Logic', () => {
    it('rejects guarantee with empty reservation or non-positive amounts', () => {
      const invalidRes = validateGuaranteePayload({ reservaId: '', importe: '300.00', moneda: 'PEN' });
      assert.equal(invalidRes.isValid, false);
      assert.ok(invalidRes.errors.reservaId);

      const zeroAmount = validateGuaranteePayload({ reservaId: 'res-01', importe: '0.00', moneda: 'PEN' });
      assert.equal(zeroAmount.isValid, false);
      assert.ok(zeroAmount.errors.importe);

      const negativeAmount = validateGuaranteePayload({ reservaId: 'res-01', importe: '-200.00', moneda: 'PEN' });
      assert.equal(negativeAmount.isValid, false);
      assert.ok(negativeAmount.errors.importe);
    });
  });

  describe('Guarantees Lifecycle & Financial Invariants', () => {
    it('1. Garantía registrada no aumenta ingresos de alquiler', async () => {
      // res-03 no tiene garantía en seed
      const summaryBefore = await paymentService.getReservationFinancialSummary('res-03');
      const ingresosBefore = summaryBefore.totalPagosConciliados;

      // Registrar garantía de 500.00 para res-03
      const guarantee = await guaranteeService.createGuarantee({
        reservaId: 'res-03',
        importe: '500.00',
        moneda: 'PEN',
        motivo: 'Depósito en garantía',
      });
      assert.ok(guarantee.id);
      assert.equal(guarantee.saldoDisponible, '500.00');
      assert.equal(guarantee.estado, 'EN_CUSTODIA');

      // Comprobar que los ingresos de alquiler de res-03 NO cambiaron
      const summaryAfter = await paymentService.getReservationFinancialSummary('res-03');
      assert.equal(summaryAfter.totalPagosConciliados, ingresosBefore);
    });

    it('2. Devolución parcial reduce el saldo de garantía', async () => {
      // gar-01 tiene importeRecibido 300.00, saldoDisponible 300.00
      const updated = await guaranteeService.registerMovement('gar-01', {
        tipo: 'DEVOLUCION_PARCIAL',
        importe: '100.00',
        motivo: 'Devolución parcial acordada',
      });

      assert.equal(updated.totalDevuelto, '100.00');
      assert.equal(updated.saldoDisponible, '200.00');
      assert.equal(updated.estado, 'EN_CUSTODIA');
      assert.equal(updated.movimientos.length, 2); // RECEPCION + DEVOLUCION_PARCIAL
    });

    it('3. Retención reduce el saldo disponible y cambia estado a PARCIALMENTE_RETENIDA', async () => {
      const updated = await guaranteeService.registerMovement('gar-01', {
        tipo: 'RETENCION',
        importe: '80.00',
        motivo: 'Cargos por reposición de llaves extraviadas',
        documentoSoporte: 'ACTA-LLAVE-01',
      });

      assert.equal(updated.totalRetenido, '80.00');
      assert.equal(updated.saldoDisponible, '220.00');
      assert.equal(updated.estado, 'PARCIALMENTE_RETENIDA');
    });

    it('4. Devolución excesiva se rechaza', async () => {
      // gar-01 tiene saldo 300.00, intentar devolver 350.00
      await assert.rejects(
        async () => {
          await guaranteeService.registerMovement('gar-01', {
            tipo: 'DEVOLUCION_TOTAL',
            importe: '350.00',
            motivo: 'Reembolso inflado',
          });
        },
        /excede el saldo disponible en custodia/
      );
    });

    it('5. Retención excesiva se rechaza', async () => {
      await assert.rejects(
        async () => {
          await guaranteeService.registerMovement('gar-01', {
            tipo: 'RETENCION',
            importe: '500.00',
            motivo: 'Cargos excesivos',
          });
        },
        /excede el saldo disponible en custodia/
      );
    });

    it('6. No se admite segunda garantía para la misma reserva bajo la política mock', async () => {
      // res-01 ya tiene gar-01 registrada
      await assert.rejects(
        async () => {
          await guaranteeService.createGuarantee({
            reservaId: 'res-01',
            importe: '200.00',
            moneda: 'PEN',
            motivo: 'Intento de duplicar garantía',
          });
        },
        /Ya existe una garantía registrada para la reserva/
      );
    });

    it('7. Movimientos históricos quedan inmutables en libro mayor', async () => {
      await guaranteeService.registerMovement('gar-01', {
        tipo: 'RETENCION',
        importe: '50.00',
        motivo: 'Rotura de copa',
      });
      await guaranteeService.registerMovement('gar-01', {
        tipo: 'DEVOLUCION_TOTAL',
        importe: '250.00',
        motivo: 'Cierre',
      });

      const finalGar = await guaranteeService.getGuaranteeById('gar-01');
      assert.ok(finalGar);
      assert.equal(finalGar?.saldoDisponible, '0.00');
      assert.equal(finalGar?.movimientos.length, 3);
      assert.equal(finalGar?.movimientos[0]?.tipo, 'RECEPCION');
      assert.equal(finalGar?.movimientos[1]?.tipo, 'RETENCION');
      assert.equal(finalGar?.movimientos[2]?.tipo, 'DEVOLUCION_TOTAL');
      assert.equal(finalGar?.estado, 'RETENIDA_TOTAL');
    });

    it('8. Transición a DEVUELTA_TOTAL cuando se reembolsa el saldo completo sin retenciones', async () => {
      // res-04 no tiene garantía, registramos una de 200.00
      const gar = await guaranteeService.createGuarantee({
        reservaId: 'res-04',
        importe: '200.00',
        moneda: 'PEN',
      });

      const closed = await guaranteeService.registerMovement(gar.id, {
        tipo: 'DEVOLUCION_TOTAL',
        importe: '200.00',
        motivo: 'Devolución completa',
      });

      assert.equal(closed.saldoDisponible, '0.00');
      assert.equal(closed.totalDevuelto, '200.00');
      assert.equal(closed.totalRetenido, '0.00');
      assert.equal(closed.estado, 'DEVUELTA_TOTAL');
    });
  });
});
