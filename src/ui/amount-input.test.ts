import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import {
  formatMinorUnits,
  formatMoney,
  parseAmount,
  parseOpeningBalance,
} from './amount-input';

describe('parseAmount', () => {
  it('Scenario: Typed amount becomes exact minor units', () => {
    expect(parseAmount('125.50', 'UAH')).toEqual(money(12550, 'UAH'));
    // The Ukrainian decimal separator means the same amount.
    expect(parseAmount('125,50', 'UAH')).toEqual(money(12550, 'UAH'));
  });

  it('Scenario: A whole amount needs no fractional part', () => {
    expect(parseAmount('200', 'UAH')).toEqual(money(20000, 'UAH'));
    // A single fractional digit is tenths, not hundredths.
    expect(parseAmount('200.5', 'UAH')).toEqual(money(20050, 'UAH'));
  });

  it('Scenario: Too many fractional digits are rejected', () => {
    expect(() => parseAmount('12.345', 'UAH')).toThrow();
  });

  it('Scenario: A non-positive amount is rejected', () => {
    expect(() => parseAmount('0', 'UAH')).toThrow();
    expect(() => parseAmount('0.00', 'UAH')).toThrow();
    expect(() => parseAmount('-5', 'UAH')).toThrow();
  });

  it('What is not a number is not an amount', () => {
    for (const typed of ['', ' ', 'abc', '12.', '1.2.3', '1 000', '12,', '.5']) {
      expect(() => parseAmount(typed, 'UAH'), `"${typed}" was accepted`).toThrow();
    }
  });

  it('The amount lands in the account currency it was typed for', () => {
    expect(parseAmount('5.00', 'USD')).toEqual(money(500, 'USD'));
    expect(parseAmount('10.00', 'EUR')).toEqual(money(1000, 'EUR'));
  });

  it('Large amounts stay exact — no float ever touches them', () => {
    expect(parseAmount('99999999.99', 'UAH')).toEqual(money(9999999999, 'UAH'));
  });
});

describe('formatMoney', () => {
  it('Minor units are shown as major units with their currency', () => {
    expect(formatMoney(money(12550, 'UAH'))).toBe('125,50 UAH');
    expect(formatMoney(money(500, 'USD'))).toBe('5,00 USD');
    expect(formatMoney(money(0, 'UAH'))).toBe('0,00 UAH');
    expect(formatMoney(money(7, 'UAH'))).toBe('0,07 UAH');
  });

  it('A negative balance keeps its sign', () => {
    expect(formatMoney(money(-3000, 'UAH'))).toBe('−30,00 UAH');
  });

  it('What was typed comes back unchanged', () => {
    expect(formatMoney(parseAmount('125,50', 'UAH'))).toBe('125,50 UAH');
  });
});

describe('parseOpeningBalance', () => {
  it('An omitted opening balance is zero in the account currency', () => {
    expect(parseOpeningBalance('', 'UAH')).toEqual(money(0, 'UAH'));
    expect(parseOpeningBalance('   ', 'USD')).toEqual(money(0, 'USD'));
  });

  it('An opening balance may be zero, unlike a transaction amount', () => {
    expect(parseOpeningBalance('0', 'UAH')).toEqual(money(0, 'UAH'));
    expect(parseOpeningBalance('0,00', 'UAH')).toEqual(money(0, 'UAH'));
    expect(parseOpeningBalance('-0,00', 'UAH')).toEqual(money(0, 'UAH'));
  });

  it('An opening balance may be negative — a card can be in overdraft', () => {
    expect(parseOpeningBalance('-1250,75', 'UAH')).toEqual(money(-125075, 'UAH'));
    expect(parseOpeningBalance('-5', 'USD')).toEqual(money(-500, 'USD'));
  });

  it('The digits obey the same rules as any other amount', () => {
    expect(parseOpeningBalance('1000,50', 'UAH')).toEqual(money(100050, 'UAH'));
    expect(() => parseOpeningBalance('12.345', 'UAH')).toThrow();
    expect(() => parseOpeningBalance('-12.345', 'UAH')).toThrow();
    expect(() => parseOpeningBalance('abc', 'UAH')).toThrow();
  });
});

describe('formatMinorUnits', () => {
  it('Round-trips through the opening-balance field', () => {
    for (const amount of [0, 7, 12550, -125075, 9999999999]) {
      expect(parseOpeningBalance(formatMinorUnits(amount), 'UAH')).toEqual(money(amount, 'UAH'));
    }
  });

  it('Carries no currency code, unlike formatMoney', () => {
    expect(formatMinorUnits(12550)).toBe('125,50');
    expect(formatMoney(money(12550, 'UAH'))).toBe('125,50 UAH');
  });
});
