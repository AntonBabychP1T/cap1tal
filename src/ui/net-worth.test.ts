import { describe, expect, it } from 'vitest';

import type { StoredRate } from '../db/rates-repo';
import { money } from '../domain/money';
import type { AccountContribution, CurrencyTotal } from '../domain/net-worth';
import {
  ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION,
  accountBasisLines,
  approximateNetWorthUah,
  currencyReadouts,
} from './net-worth';

const now = new Date('2026-09-19T12:00:00.000Z');

const known = (amountMinor: number, currency: string): CurrencyTotal => ({
  status: 'known',
  amount: money(amountMinor, currency),
});

const rate = (currency: string, rateMillionths: number, obtainedAt: string): StoredRate => ({
  currency,
  rateMillionths,
  obtainedAt: new Date(obtainedAt),
});

/** The thousands separator `formatMoney`/`formatMinorUnitsGrouped` actually use (U+00A0 NBSP). */
const T = ' ';

describe('currencyReadouts', () => {
  it('Scenario: All currencies stay exact and distinct, UAH first', () => {
    const totals = new Map<string, CurrencyTotal>([
      ['USD', known(20000, 'USD')],
      ['UAH', known(100000, 'UAH')],
      ['EUR', known(30000, 'EUR')],
    ]);
    expect(currencyReadouts(totals)).toEqual([
      { currency: 'UAH', text: `1${T}000,00 UAH`, available: true },
      { currency: 'EUR', text: '300,00 EUR', available: true },
      { currency: 'USD', text: '200,00 USD', available: true },
    ]);
  });

  it('Scenario: An overflow currency is named, not hidden', () => {
    const totals = new Map<string, CurrencyTotal>([
      ['UAH', { status: 'unavailable', reason: 'overflow' }],
    ]);
    const [readout] = currencyReadouts(totals);
    expect(readout!.available).toBe(false);
    expect(readout!.text).toContain('UAH');
  });
});

describe('approximateNetWorthUah', () => {
  it('Scenario: A full approximation stays secondary — rounding example', () => {
    // 10000 USD at 41.25345 UAH/USD → 412534.5 minor units, rounded half away from zero → 412535;
    // plus 100000 UAH exact = 512535.
    const totals = new Map<string, CurrencyTotal>([
      ['UAH', known(100000, 'UAH')],
      ['USD', known(10000, 'USD')],
    ]);
    const rates = [rate('USD', 41_253_450, '2026-09-19T08:00:00.000Z')];
    const result = approximateNetWorthUah(totals, rates);
    expect(result).toEqual({
      status: 'available',
      text: `≈ 5${T}125,35 грн`,
      oldestRateAt: new Date('2026-09-19T08:00:00.000Z'),
    });
  });

  it('Scenario: Signed conversion', () => {
    const totals = new Map<string, CurrencyTotal>([
      ['UAH', known(0, 'UAH')],
      ['USD', known(-10000, 'USD')],
    ]);
    const rates = [rate('USD', 41_000_000, '2026-09-19T08:00:00.000Z')];
    const result = approximateNetWorthUah(totals, rates);
    expect(result.status === 'available' && result.text).toBe(`≈ −4${T}100,00 грн`);
  });

  it('Scenario: Missing EUR withholds the entire approximation, including when EUR totals zero', () => {
    const totals = new Map<string, CurrencyTotal>([
      ['UAH', known(100000, 'UAH')],
      ['USD', known(10000, 'USD')],
      ['EUR', known(0, 'EUR')],
    ]);
    const rates = [rate('USD', 41_000_000, '2026-09-19T08:00:00.000Z')];
    const result = approximateNetWorthUah(totals, rates);
    expect(result).toEqual({ status: 'unavailable', reason: 'missing-rate', missing: ['EUR'] });
  });

  it('Scenario: Cached stale rates remain marked with the oldest participating timestamp', () => {
    const totals = new Map<string, CurrencyTotal>([
      ['UAH', known(0, 'UAH')],
      ['USD', known(10000, 'USD')],
      ['EUR', known(5000, 'EUR')],
    ]);
    const rates = [
      rate('USD', 41_000_000, '2026-09-10T08:00:00.000Z'),
      rate('EUR', 45_000_000, '2026-09-05T08:00:00.000Z'),
    ];
    const result = approximateNetWorthUah(totals, rates);
    expect(result.status === 'available' && result.oldestRateAt).toEqual(
      new Date('2026-09-05T08:00:00.000Z'),
    );
  });

  it('Scenario: UAH only has no redundant approximation', () => {
    const totals = new Map<string, CurrencyTotal>([['UAH', known(100000, 'UAH')]]);
    expect(approximateNetWorthUah(totals, [])).toEqual({ status: 'unavailable', reason: 'uah-only' });
  });

  it('Scenario: Overflow withholds the approximation with no misleading total', () => {
    const totals = new Map<string, CurrencyTotal>([
      ['UAH', { status: 'unavailable', reason: 'overflow' }],
      ['USD', known(1000, 'USD')],
    ]);
    const rates = [rate('USD', 41_000_000, '2026-09-19T08:00:00.000Z')];
    expect(approximateNetWorthUah(totals, rates)).toEqual({ status: 'unavailable', reason: 'overflow' });
  });
});

describe('accountBasisLines', () => {
  it('Scenario: An investment observation names its date; a fallback names вкладено', () => {
    const contributions: AccountContribution[] = [
      {
        accountId: 'bonds',
        currency: 'UAH',
        amount: money(150000, 'UAH'),
        basis: 'currentValue',
        asOf: '2026-06-01',
      },
      {
        accountId: 'card',
        currency: 'UAH',
        amount: money(100000, 'UAH'),
        basis: 'ledger',
      },
    ];
    expect(accountBasisLines(contributions, now)).toEqual([
      // Same year as `now` (2026): calendarLabel omits it, as it does everywhere else.
      { accountId: 'bonds', amount: `1${T}500,00 UAH`, basis: 'поточна вартість на 1 червня' },
      { accountId: 'card', amount: `1${T}000,00 UAH`, basis: 'вкладено' },
    ]);
  });
});

describe('ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION', () => {
  it('Scenario: Existing Accounts totals have a different scope — membership and valuation are both named', () => {
    expect(ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION).toContain('архівні рахунки');
    expect(ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION).toContain('поточною вартістю');
  });
});
