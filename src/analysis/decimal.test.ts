import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { averageMinor, bp, changeBp, decimalOf } from './decimal';

describe('decimalOf', () => {
  it('Scenario: Two currencies are two reports', () => {
    // The decimal text carries its own currency, so a UAH сума and a USD сума can sit side by
    // side in one пакет without anything ever adding them.
    expect(decimalOf(money(412534, 'UAH'))).toEqual({ amount: '4125.34', currency: 'UAH' });
    expect(decimalOf(money(10000, 'USD'))).toEqual({ amount: '100.00', currency: 'USD' });
  });

  it('writes zero and a negative сума in full', () => {
    // Money back from an інвестиційний рахунок is a negative інвестовано, and an empty month is
    // present at zero — both are written out rather than left absent.
    expect(decimalOf(money(0, 'UAH')).amount).toBe('0.00');
    expect(decimalOf(money(-30000, 'UAH')).amount).toBe('-300.00');
  });

  it('never groups thousands: the text is a number again without cleaning', () => {
    expect(decimalOf(money(120425990, 'UAH')).amount).toBe('1204259.90');
  });

  it('is exact for every сума the domain can hold', () => {
    fc.assert(
      fc.property(fc.integer({ min: -Number.MAX_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }), (amount) => {
        const text = decimalOf(money(amount, 'UAH')).amount;

        // Two decimals, always — never `4125.3`, never `4.1253400000000001e3`.
        expect(text).toMatch(/^-?\d+\.\d{2}$/);
        // And the digits are the minor units themselves: reading them back is exact arithmetic on
        // strings, so a float rounding error anywhere in the formatting would show here.
        expect(BigInt(text.replace('.', ''))).toBe(BigInt(amount));
      }),
    );
  });
});

describe('bp', () => {
  it('Scenario: A ratio with a zero base is absent', () => {
    // A month with витрати and no дохід has no savings rate and no investment rate — not zero,
    // not infinite: absent.
    expect(bp(money(50000, 'UAH'), money(0, 'UAH'))).toBeNull();
  });

  it('a share of the period’s витрачено', () => {
    expect(bp(money(100000, 'UAH'), money(400000, 'UAH'))).toBe(2500);
  });

  it('keeps the sign of the part, not of the base', () => {
    // інвестовано −300.00 against a дохід of 1000.00 is an investment rate of −3000.
    expect(bp(money(-30000, 'UAH'), money(100000, 'UAH'))).toBe(-3000);
  });

  it('rounds half away from zero', () => {
    // 5 / 10000 of the base is exactly half a basis point, either way.
    expect(bp(money(5, 'UAH'), money(100000, 'UAH'))).toBe(1);
    expect(bp(money(-5, 'UAH'), money(100000, 'UAH'))).toBe(-1);
  });

  it('refuses one currency against another rather than converting it', () => {
    expect(() => bp(money(1, 'USD'), money(100000, 'UAH'))).toThrow(/USD/);
  });
});

describe('changeBp', () => {
  it('Scenario: Month-over-month change', () => {
    // July's витрачено 3000.00 → August's 3600.00.
    expect(changeBp(money(300000, 'UAH'), money(360000, 'UAH'))).toBe(2000);
  });

  it('a категорія that doubled', () => {
    expect(changeBp(money(50000, 'UAH'), money(100000, 'UAH'))).toBe(10000);
  });

  it('a категорія absent from the earlier month has no change', () => {
    expect(changeBp(money(0, 'UAH'), money(100000, 'UAH'))).toBeNull();
  });
});

describe('averageMinor', () => {
  it('the mean of the months, in whole minor units', () => {
    expect(averageMinor([money(100000, 'UAH'), money(200000, 'UAH'), money(300001, 'UAH')])).toEqual(
      money(200000, 'UAH'),
    );
  });

  it('rounds half away from zero, symmetrically', () => {
    expect(averageMinor([money(1, 'UAH'), money(2, 'UAH')])).toEqual(money(2, 'UAH'));
    expect(averageMinor([money(-1, 'UAH'), money(-2, 'UAH')])).toEqual(money(-2, 'UAH'));
  });

  it('stays exact past what a double holds', () => {
    const big = Number.MAX_SAFE_INTEGER - 1;
    expect(averageMinor([money(big, 'UAH'), money(big, 'UAH')])).toEqual(money(big, 'UAH'));
  });

  it('refuses an average of nothing, and an average across currencies', () => {
    expect(() => averageMinor([])).toThrow(/at least one/);
    expect(() => averageMinor([money(1, 'UAH'), money(1, 'USD')])).toThrow(/USD/);
  });
});
