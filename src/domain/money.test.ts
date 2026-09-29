import { describe, expect, it } from 'vitest';

import { add, MAX_AMOUNT_MINOR, money, subtract } from './money';

describe('money', () => {
  it('Creating a valid amount', () => {
    const m = money(12550, 'UAH');
    expect(m.amount).toBe(12550);
    expect(m.currency).toBe('UAH');
  });

  it('Rejecting a fractional amount', () => {
    expect(() => money(125.5, 'UAH')).toThrow();
  });

  it('A negative amount is valid', () => {
    const m = money(-5000, 'UAH');
    expect(m.amount).toBe(-5000);
    expect(m.currency).toBe('UAH');
  });

  it('Adding two amounts of the same currency', () => {
    expect(add(money(10000, 'UAH'), money(2500, 'UAH'))).toEqual(money(12500, 'UAH'));
  });

  it('Cross-currency sum is rejected', () => {
    expect(() => add(money(100, 'UAH'), money(100, 'USD'))).toThrow();
    expect(() => subtract(money(100, 'UAH'), money(100, 'USD'))).toThrow();
  });
});

describe('MAX_AMOUNT_MINOR', () => {
  it('Sums of any realistic number of rows at the ceiling stay exact integers', () => {
    // Ninety thousand rows, every one at the largest сума the app admits, still add up inside the
    // safe-integer range `money` insists on — so no total, balance or month can overflow it.
    expect(Number.isSafeInteger(MAX_AMOUNT_MINOR * 90_000)).toBe(true);
    expect(MAX_AMOUNT_MINOR * 90_000).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('Is itself a valid amount', () => {
    expect(money(MAX_AMOUNT_MINOR, 'UAH').amount).toBe(99_999_999_999);
    expect(money(-MAX_AMOUNT_MINOR, 'UAH').amount).toBe(-99_999_999_999);
  });
});
