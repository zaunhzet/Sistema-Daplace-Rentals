import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNights,
  checkDatesOverlap,
  reservationService,
  validateReservationDates,
  validateReservationPayload,
} from '../src/features/reservations';
import { guestService } from '../src/features/guests';
import { propertyService } from '../src/features/properties';

describe('Reservations Module — Unit & Mock Tests (UI-ANDRE-002)', () => {
  beforeEach(() => {
    propertyService.reset();
    guestService.reset();
    reservationService.reset();
  });

  describe('Interval & Date Helpers', () => {
    it('calculates nights correctly for [ingreso, salida)', () => {
      assert.equal(calculateNights('2026-11-10', '2026-11-15'), 5);
      assert.equal(calculateNights('2026-11-10', '2026-11-11'), 1);
      assert.equal(calculateNights('2026-11-10', '2026-11-10'), 0);
      assert.equal(calculateNights('2026-11-15', '2026-11-10'), -5);
    });

    it('validates that salida must be strictly after ingreso', () => {
      const sameDay = validateReservationDates('2026-11-10', '2026-11-10');
      assert.equal(sameDay.isValid, false);
      assert.ok(sameDay.error);

      const inverted = validateReservationDates('2026-11-15', '2026-11-10');
      assert.equal(inverted.isValid, false);

      const valid = validateReservationDates('2026-11-10', '2026-11-15');
      assert.equal(valid.isValid, true);
    });

    it('allows consecutive intervals [10, 15) and [15, 20)', () => {
      // Semi-open check: check-out day of first can be check-in day of second
      assert.equal(checkDatesOverlap('2026-11-10', '2026-11-15', '2026-11-15', '2026-11-20'), false);
      assert.equal(checkDatesOverlap('2026-11-15', '2026-11-20', '2026-11-10', '2026-11-15'), false);
    });

    it('detects incompatible overlaps correctly', () => {
      // Overlapping intervals
      assert.equal(checkDatesOverlap('2026-11-10', '2026-11-15', '2026-11-12', '2026-11-14'), true);
      assert.equal(checkDatesOverlap('2026-11-10', '2026-11-15', '2026-11-08', '2026-11-12'), true);
      assert.equal(checkDatesOverlap('2026-11-10', '2026-11-15', '2026-11-14', '2026-11-18'), true);
      assert.equal(checkDatesOverlap('2026-11-10', '2026-11-15', '2026-11-05', '2026-11-25'), true);
    });
  });

  describe('Validation Logic', () => {
    it('rejects reservation with missing property or guest', () => {
      const res1 = validateReservationPayload({
        propiedadId: '',
        huespedId: 'hue-01',
        ingreso: '2026-11-10',
        salida: '2026-11-15',
        montoAcordado: 1000,
      });
      assert.equal(res1.isValid, false);
      assert.ok(res1.errors.propiedadId);

      const res2 = validateReservationPayload({
        propiedadId: 'prop-01',
        huespedId: '',
        ingreso: '2026-11-10',
        salida: '2026-11-15',
        montoAcordado: 1000,
      });
      assert.equal(res2.isValid, false);
      assert.ok(res2.errors.huespedId);
    });

    it('rejects non-positive monetary amount', () => {
      const res = validateReservationPayload({
        propiedadId: 'prop-01',
        huespedId: 'hue-01',
        ingreso: '2026-11-10',
        salida: '2026-11-15',
        montoAcordado: 0,
      });
      assert.equal(res.isValid, false);
      assert.ok(res.errors.montoAcordado);
    });
  });

  describe('Reservation Service Operations & Invariants', () => {
    it('creates a valid reservation request in SOLICITADA state', async () => {
      // In prop-01, res-01 occupies 2026-11-10 to 2026-11-15
      // Let's create consecutive reservation starting 2026-11-15 to 2026-11-20
      const created = await reservationService.createReservation({
        propiedadId: 'prop-01',
        huespedId: 'hue-02',
        ingreso: '2026-11-15',
        salida: '2026-11-20',
        montoAcordado: 1400,
        moneda: 'PEN',
        origen: 'WEB',
      });

      assert.ok(created.id);
      assert.equal(created.estado, 'SOLICITADA');
      assert.equal(created.noches, 5);
      assert.equal(created.propiedadId, 'prop-01');
      assert.equal(created.huespedNombre, 'Sophie Martin');
    });

    it('rejects reservation with overlapping dates on the same property', async () => {
      // res-01 already occupies prop-01 for 2026-11-10 to 2026-11-15
      await assert.rejects(
        async () => {
          await reservationService.createReservation({
            propiedadId: 'prop-01',
            huespedId: 'hue-02',
            ingreso: '2026-11-12',
            salida: '2026-11-16',
            montoAcordado: 1000,
          });
        },
        {
          message: /Conflicto de solape/,
        }
      );
    });

    it('rejects reservation for inactive property or property in maintenance', async () => {
      // prop-03 is EN_MANTENIMIENTO
      await assert.rejects(
        async () => {
          await reservationService.createReservation({
            propiedadId: 'prop-03',
            huespedId: 'hue-01',
            ingreso: '2026-12-10',
            salida: '2026-12-15',
            montoAcordado: 1500,
          });
        },
        {
          message: /mantenimiento operativo/,
        }
      );

      // prop-05 is INACTIVA
      await assert.rejects(
        async () => {
          await reservationService.createReservation({
            propiedadId: 'prop-05',
            huespedId: 'hue-01',
            ingreso: '2026-12-10',
            salida: '2026-12-15',
            montoAcordado: 1000,
          });
        },
        {
          message: /inactiva/,
        }
      );
    });

    it('rejects reservation for non-existent guest or property', async () => {
      await assert.rejects(
        async () => {
          await reservationService.createReservation({
            propiedadId: 'prop-999',
            huespedId: 'hue-01',
            ingreso: '2026-12-10',
            salida: '2026-12-15',
            montoAcordado: 1000,
          });
        },
        {
          message: /no existe/,
        }
      );

      await assert.rejects(
        async () => {
          await reservationService.createReservation({
            propiedadId: 'prop-01',
            huespedId: 'hue-999',
            ingreso: '2026-12-10',
            salida: '2026-12-15',
            montoAcordado: 1000,
          });
        },
        {
          message: /Huésped no encontrado/,
        }
      );
    });

    it('confirms a SOLICITADA reservation successfully', async () => {
      // res-04 is in SOLICITADA state on prop-02
      const confirmed = await reservationService.confirmReservation('res-04');
      assert.equal(confirmed.estado, 'CONFIRMADA');

      const retrieved = await reservationService.getReservationById('res-04');
      assert.equal(retrieved?.estado, 'CONFIRMADA');
    });

    it('cancels a reservation and frees calendar availability', async () => {
      // res-01 occupies 2026-11-10 to 2026-11-15
      const checkBefore = await reservationService.checkAvailability('prop-01', '2026-11-10', '2026-11-15');
      assert.equal(checkBefore.disponible, false);

      const cancelled = await reservationService.cancelReservation('res-01', 'Cancelación por prueba');
      assert.equal(cancelled.estado, 'CANCELADA');

      // Now availability check MUST return true!
      const checkAfter = await reservationService.checkAvailability('prop-01', '2026-11-10', '2026-11-15');
      assert.equal(checkAfter.disponible, true);
    });

    it('updates reservation dates excluding own reservation from conflict check', async () => {
      // res-01 is currently 2026-11-10 to 2026-11-15
      // Extending to 2026-11-16 should work if 15-16 is free
      const updated = await reservationService.updateReservationDates('res-01', {
        ingreso: '2026-11-10',
        salida: '2026-11-16',
      });
      assert.equal(updated.salida, '2026-11-16');
      assert.equal(updated.noches, 6);
    });

    it('rejects date modification if it causes overlap with another reservation', async () => {
      // In prop-01: res-03 is 2026-10-15 to 2026-10-18, and res-01 is 2026-11-10 to 2026-11-15
      // If we try to move res-01 to 2026-10-16 to 2026-10-20, it overlaps with res-03!
      await assert.rejects(
        async () => {
          await reservationService.updateReservationDates('res-01', {
            ingreso: '2026-10-16',
            salida: '2026-10-20',
          });
        },
        {
          message: /Conflicto de solape/,
        }
      );
    });

    it('single source of truth: created reservation is immediately visible in guest detail', async () => {
      // Create a reservation for hue-04 (who originally had 0 reservations)
      const guestBefore = await guestService.getGuestById('hue-04');
      assert.equal(guestBefore?.reservasRelacionadas.length, 0);

      const created = await reservationService.createReservation({
        propiedadId: 'prop-04',
        huespedId: 'hue-04',
        ingreso: '2026-11-20',
        salida: '2026-11-25',
        montoAcordado: 2500,
        moneda: 'PEN',
      });

      // Query guest detail via guestService
      const guestAfter = await guestService.getGuestById('hue-04');
      assert.ok(guestAfter);
      assert.equal(guestAfter?.reservasRelacionadas.length, 1);
      assert.equal(guestAfter?.reservasRelacionadas[0].id, created.id);
      assert.equal(guestAfter?.reservasRelacionadas[0].propiedadNombre, 'Casa de Playa Punta Hermosa');
      assert.equal(guestAfter?.reservasRelacionadas[0].estado, 'SOLICITADA');
    });
  });
});
