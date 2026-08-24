import { describe, expect, it } from 'vitest';

import { add, money, subtract } from './money';

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
