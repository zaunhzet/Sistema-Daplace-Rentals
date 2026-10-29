import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCents,
  fromCents,
  addMoney,
  subtractMoney,
  compareMoney,
  formatMoney,
  validateMoneyInput,
  adaptReservationAmount,
} from '../src/shared/money';

describe('Money Utilities — Unit Tests', () => {
  it('converts exact decimal strings to integer cents without float precision bugs', () => {
    assert.equal(toCents('0.10') + toCents('0.20'), 30);
    assert.equal(fromCents(30), '0.30');
    assert.equal(toCents('1400.00'), 140000);
    assert.equal(toCents('1400.5'), 140050);
    assert.equal(toCents('1400.55'), 140055);
    assert.equal(toCents('250'), 25000);
    assert.equal(toCents('-50.25'), -5025);
  });

  it('converts cents back to 2-decimal string', () => {
    assert.equal(fromCents(140000), '1400.00');
    assert.equal(fromCents(25050), '250.50');
    assert.equal(fromCents(5), '0.05');
    assert.equal(fromCents(0), '0.00');
    assert.equal(fromCents(-1250), '-12.50');
  });

  it('performs addition and subtraction accurately', () => {
    const sumCents = addMoney('100.25', '200.50', '50.00');
    assert.equal(sumCents, 35075);
    assert.equal(fromCents(sumCents), '350.75');

    const diffCents = subtractMoney('500.00', '150.75');
    assert.equal(diffCents, 34925);
    assert.equal(fromCents(diffCents), '349.25');
  });

  it('compares amounts correctly', () => {
    assert.equal(compareMoney('100.00', '50.00'), 1);
    assert.equal(compareMoney('50.00', '100.00'), -1);
    assert.equal(compareMoney('100.00', '100.00'), 0);
  });

  it('formats amounts in PEN and USD nicely', () => {
    const formattedPEN = formatMoney('1400.50', 'PEN');
    assert.ok(formattedPEN.includes('S/'));
    assert.ok(formattedPEN.includes('1,400.50') || formattedPEN.includes('1.400,50') || formattedPEN.includes('1400.50'));

    const formattedUSD = formatMoney('350.00', 'USD');
    assert.ok(formattedUSD.includes('US$'));
  });

  it('validates strictly positive amounts and flags invalid inputs', () => {
    assert.equal(validateMoneyInput('250.00').isValid, true);
    assert.equal(validateMoneyInput('0.00').isValid, false);
    assert.equal(validateMoneyInput('-100.00').isValid, false);
    assert.equal(validateMoneyInput('abc').isValid, false);
    assert.equal(validateMoneyInput('100.555').isValid, false);
  });

  it('adapts numeric reservation amount to exact string', () => {
    assert.equal(adaptReservationAmount(1400), '1400.00');
    assert.equal(adaptReservationAmount(840.5), '840.50');
    assert.equal(adaptReservationAmount(0), '0.00');
  });
});
