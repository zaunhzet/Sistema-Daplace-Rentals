import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { calendarService, resolveInitialCalendarDateState } from '../src/features/calendar';
import { reservationService } from '../src/features/reservations';
import { propertyService } from '../src/features/properties';

describe('Calendar & Availability Module — Unit Tests (UI-ANDRE-002)', () => {
  beforeEach(() => {
    propertyService.reset();
    reservationService.reset();
  });

  it('generates a full monthly calendar grid with padding for November 2026', async () => {
    const days = await calendarService.getMonthDays('prop-01', 2026, 11);

    // Days in November 2026 = 30. Grid must be multiple of 7
    assert.equal(days.length % 7, 0);

    const currentMonthDays = days.filter((d) => d.isCurrentMonth);
    assert.equal(currentMonthDays.length, 30);
  });

  it('identifies occupied days matching reservations in the same reservation service', async () => {
    // In prop-01, res-01 is 2026-11-10 to 2026-11-15 (CONFIRMADA)
    const days = await calendarService.getMonthDays('prop-01', 2026, 11);

    // Days 10, 11, 12, 13, 14 should be CONFIRMADA (occupied nights)
    const nov10 = days.find((d) => d.date === '2026-11-10');
    const nov12 = days.find((d) => d.date === '2026-11-12');
    const nov14 = days.find((d) => d.date === '2026-11-14');
    const nov15 = days.find((d) => d.date === '2026-11-15'); // Check-out day
    const nov16 = days.find((d) => d.date === '2026-11-16'); // Free day

    assert.equal(nov10?.status, 'CONFIRMADA');
    assert.equal(nov12?.status, 'CONFIRMADA');
    assert.equal(nov14?.status, 'CONFIRMADA');
    assert.equal(nov10?.reservation?.id, 'res-01');

    // On check-out day (Nov 15), if no new check-in is scheduled, it is DISPONIBLE
    assert.equal(nov15?.status, 'DISPONIBLE');
    assert.equal(nov16?.status, 'DISPONIBLE');
  });

  it('identifies transition day when consecutive reservations share check-out and check-in', async () => {
    // Add consecutive reservation: 2026-11-15 to 2026-11-18
    await reservationService.createReservation({
      propiedadId: 'prop-01',
      huespedId: 'hue-02',
      ingreso: '2026-11-15',
      salida: '2026-11-18',
      montoAcordado: 900,
      moneda: 'PEN',
    });

    const days = await calendarService.getMonthDays('prop-01', 2026, 11);
    const nov15 = days.find((d) => d.date === '2026-11-15');

    // Nov 15 now has checkout of res-01 and checkin of new reservation
    assert.equal(nov15?.status, 'TRANSICION');
    assert.ok(nov15?.checkoutReservation);
    assert.ok(nov15?.checkinReservation);
  });

  it('immediately marks days as available when a reservation is cancelled', async () => {
    // Before cancelling: Nov 10 is CONFIRMADA
    const daysBefore = await calendarService.getMonthDays('prop-01', 2026, 11);
    const nov10Before = daysBefore.find((d) => d.date === '2026-11-10');
    assert.equal(nov10Before?.status, 'CONFIRMADA');

    // Cancel res-01
    await reservationService.cancelReservation('res-01', 'Cancelación test');

    // After cancelling: Nov 10 MUST be DISPONIBLE
    const daysAfter = await calendarService.getMonthDays('prop-01', 2026, 11);
    const nov10After = daysAfter.find((d) => d.date === '2026-11-10');
    assert.equal(nov10After?.status, 'DISPONIBLE');
  });

  it('marks all days as MANTENIMIENTO for properties under maintenance', async () => {
    // prop-03 is EN_MANTENIMIENTO
    const days = await calendarService.getMonthDays('prop-03', 2026, 11);
    const currentMonthDays = days.filter((d) => d.isCurrentMonth);

    assert.ok(currentMonthDays.every((d) => d.status === 'MANTENIMIENTO'));
  });

  it('marks all days as INACTIVA for inactive properties', async () => {
    // prop-05 is INACTIVA
    const days = await calendarService.getMonthDays('prop-05', 2026, 11);
    const currentMonthDays = days.filter((d) => d.isCurrentMonth);

    assert.ok(currentMonthDays.every((d) => d.status === 'INACTIVA'));
  });

  it('computes monthly occupancy metrics accurately', async () => {
    const days = await calendarService.getMonthDays('prop-01', 2026, 11);
    const summary = calendarService.getMonthSummary(days);

    assert.equal(summary.totalDays, 30);
    // res-01 covers 5 nights: 10, 11, 12, 13, 14
    assert.equal(summary.occupiedDays, 5);
    assert.equal(summary.availableDays, 25);
    assert.equal(summary.occupancyRate, Math.round((5 / 30) * 100)); // 17%
  });
});

describe('Calendar initial date state resolution', () => {
  it('defaults year, month and selectedDate together to the injected local civil date when preferences are missing', () => {
    const fixedClock = new Date(2026, 11, 10, 14, 30, 0);

    assert.deepEqual(resolveInitialCalendarDateState(undefined, fixedClock), {
      year: 2026,
      month: 12,
      selectedDate: '2026-12-10',
    });
    assert.deepEqual(resolveInitialCalendarDateState({}, fixedClock), {
      year: 2026,
      month: 12,
      selectedDate: '2026-12-10',
    });
  });

  it('preserves valid persisted date preferences without imposing extra coupling between month and selectedDate', () => {
    const fixedClock = new Date(2026, 11, 10, 14, 30, 0);

    assert.deepEqual(
      resolveInitialCalendarDateState(
        { year: 2027, month: 1, selectedDate: '2027-01-15' },
        fixedClock
      ),
      {
        year: 2027,
        month: 1,
        selectedDate: '2027-01-15',
      }
    );

    assert.deepEqual(
      resolveInitialCalendarDateState(
        { year: 2026, month: 11, selectedDate: '2026-12-01' },
        fixedClock
      ),
      {
        year: 2026,
        month: 11,
        selectedDate: '2026-12-01',
      }
    );
  });

  it('recovers a valid local civil date when persisted month is out of range or selectedDate is impossible', () => {
    const fixedClock = new Date(2026, 11, 10, 14, 30, 0);
    const expected = { year: 2026, month: 12, selectedDate: '2026-12-10' };

    assert.deepEqual(
      resolveInitialCalendarDateState({ year: 2026, month: 13, selectedDate: '2026-12-15' }, fixedClock),
      expected
    );
    assert.deepEqual(
      resolveInitialCalendarDateState({ year: 2026, month: 0, selectedDate: '2026-12-15' }, fixedClock),
      expected
    );
    assert.deepEqual(
      resolveInitialCalendarDateState({ year: 2026, month: 2, selectedDate: '2026-02-30' }, fixedClock),
      expected
    );
    assert.deepEqual(
      resolveInitialCalendarDateState({ year: 2026, month: 4, selectedDate: '2026-04-31' }, fixedClock),
      expected
    );
    assert.deepEqual(
      resolveInitialCalendarDateState({ year: Number.NaN, month: 11, selectedDate: '2026-11-01' }, fixedClock),
      expected
    );
  });

  it('uses local civil date near midnight instead of shifting to the next day via UTC toISOString()', () => {
    const nearMidnightLocal = new Date(2026, 11, 10, 23, 45, 0);
    // Simula un desplazamiento UTC (ej. UTC-5 a las 23:45 locales ya es 2026-12-11T04:45:00Z)
    Object.defineProperty(nearMidnightLocal, 'toISOString', {
      value: () => '2026-12-11T04:45:00.000Z',
    });

    assert.deepEqual(resolveInitialCalendarDateState({}, nearMidnightLocal), {
      year: 2026,
      month: 12,
      selectedDate: '2026-12-10',
    });
  });
});
