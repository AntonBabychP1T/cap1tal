import { describe, expect, it } from 'vitest';

import type { StoredRate } from '../db/rates-repo';
import { account } from '../domain/account';
import { money } from '../domain/money';
import type { AccountContribution, ChangeResult, CurrencyTotal, HistoryPoint } from '../domain/net-worth';
import {
  ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION,
  accountBasisLines,
  approximateNetWorthUah,
  buildHistoryInputs,
  changeLabel,
  currencyReadouts,
  historyPointLabel,
  historySeriesFor,
  netWorthWidgetModel,
  selectHistoryCurrency,
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
    const accountNames = new Map([
      ['bonds', 'military bonds'],
      ['card', 'mono black'],
    ]);
    expect(accountBasisLines(contributions, accountNames, now)).toEqual([
      // Same year as `now` (2026): calendarLabel omits it, as it does everywhere else.
      {
        accountId: 'bonds',
        name: 'military bonds',
        amount: `1${T}500,00 UAH`,
        basis: 'поточна вартість на 1 червня',
      },
      { accountId: 'card', name: 'mono black', amount: `1${T}000,00 UAH`, basis: 'вкладено' },
    ]);
  });

  it('An account id with no name falls back to the id itself', () => {
    const contributions: AccountContribution[] = [
      { accountId: 'ghost', currency: 'UAH', amount: money(0, 'UAH'), basis: 'ledger' },
    ];
    expect(accountBasisLines(contributions, new Map(), now)[0]?.name).toBe('ghost');
  });
});

describe('ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION', () => {
  it('Scenario: Existing Accounts totals have a different scope — membership and valuation are both named', () => {
    expect(ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION).toContain('архівні рахунки');
    expect(ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION).toContain('поточною вартістю');
  });
});

const point = (date: string, uah?: number, reason?: 'gap' | 'overflow'): HistoryPoint => ({
  date,
  totals: new Map(
    uah !== undefined
      ? [['UAH', { status: 'known' as const, amount: money(uah, 'UAH') }]]
      : reason
        ? [['UAH', { status: 'unavailable' as const, reason }]]
        : [],
  ),
});

describe('historySeriesFor', () => {
  it('Scenario: Point values remain exact — known points carry their exact value, evenly spaced', () => {
    const points = [point('2026-06-05', 10000), point('2026-06-30', 8000), point('2026-09-19', 12000)];
    expect(historySeriesFor(points, 'UAH')).toEqual([
      { x: 0, value: 10000 },
      { x: 0.5, value: 8000 },
      { x: 1, value: 12000 },
    ]);
  });

  it('Scenario: A gap becomes a missing value, never a fabricated one', () => {
    const points = [point('2026-06-05', 10000), point('2026-07-31', undefined, 'gap')];
    expect(historySeriesFor(points, 'UAH')).toEqual([
      { x: 0, value: 10000 },
      { x: 1, value: undefined },
    ]);
  });

  it('A single point sits at x=0', () => {
    expect(historySeriesFor([point('2026-09-19', 500)], 'UAH')).toEqual([{ x: 0, value: 500 }]);
  });
});

describe('historyPointLabel', () => {
  it('Scenario: Point values remain exact — a known point reads its exact value', () => {
    expect(historyPointLabel(point('2026-06-30', 8000), 'UAH', now)).toBe('30 червня: 80,00 UAH');
  });

  it('Scenario: Undated opening money produces honest coverage gaps — a gap names itself', () => {
    expect(historyPointLabel(point('2026-07-31', undefined, 'gap'), 'UAH', now)).toContain('невідомо');
  });

  it('An overflow point names itself distinctly from a gap', () => {
    expect(historyPointLabel(point('2026-07-31', undefined, 'overflow'), 'UAH', now)).toContain(
      'перевищує безпечне представлення',
    );
  });

  it('A currency the point carries no entry for at all reads as unknown too', () => {
    expect(historyPointLabel(point('2026-07-31', 100, undefined), 'EUR', now)).toContain('невідомо');
  });
});

describe('selectHistoryCurrency', () => {
  it('Scenario: History currency has a deterministic default', () => {
    expect(selectHistoryCurrency(['EUR', 'UAH', 'USD'])).toBe('UAH');
    expect(selectHistoryCurrency(['EUR', 'USD'])).toBe('EUR');
    expect(selectHistoryCurrency([])).toBeUndefined();
  });

  it('A subsequent available choice survives, and a disappeared one falls back', () => {
    expect(selectHistoryCurrency(['UAH', 'USD'], 'USD')).toBe('USD');
    expect(selectHistoryCurrency(['UAH'], 'USD')).toBe('UAH');
  });
});

describe('changeLabel', () => {
  it('Scenario: Positive comparable baseline', () => {
    const change: ChangeResult = {
      status: 'available',
      change: { currency: 'UAH', absolute: money(20000, 'UAH'), percent: 20, since: '2026-08-31' },
    };
    expect(changeLabel(change, now)).toBe('+200,00 UAH · +20.0% · від 31 серпня');
  });

  it('Scenario: Zero or negative denominator — absolute only, no percentage', () => {
    const change: ChangeResult = {
      status: 'available',
      change: { currency: 'UAH', absolute: money(20000, 'UAH'), since: '2026-08-31' },
    };
    expect(changeLabel(change, now)).toBe('+200,00 UAH · від 31 серпня');
  });

  it('Scenario: No matching baseline means no change — each reason gets its own sentence', () => {
    expect(changeLabel({ status: 'unavailable', reason: 'no-baseline' }, now)).not.toBe('');
    expect(changeLabel({ status: 'unavailable', reason: 'valuation-substituted' }, now)).toContain(
      'поточна вартість',
    );
    expect(changeLabel({ status: 'unavailable', reason: 'future-records' }, now)).toContain(
      'майбутніми датами',
    );
  });
});

describe('buildHistoryInputs', () => {
  it('groups the repo’s three flat readings by account, retaining accounts with none', () => {
    const card = account({ id: 'card', name: 'card', kind: 'spending', currency: 'UAH' });
    const jar = account({ id: 'jar', name: 'jar', kind: 'savings', currency: 'UAH' });
    const inputs = buildHistoryInputs(
      [card, jar],
      [{ accountId: 'card', month: '2026-06', net: 1000 }],
      [{ accountId: 'card', firstDate: '2026-06-05' }],
      [{ accountId: 'card', net: 500 }],
    );
    expect(inputs).toEqual([
      {
        account: card,
        firstDate: '2026-06-05',
        firstDateNet: 500,
        monthlyNet: new Map([['2026-06', 1000]]),
      },
      { account: jar, firstDate: undefined, firstDateNet: undefined, monthlyNet: new Map() },
    ]);
  });
});

describe('netWorthWidgetModel', () => {
  it('Scenario: Empty and incomplete data are not zero money — no accounts at all', () => {
    const model = netWorthWidgetModel({
      accounts: [],
      transactions: [],
      currentValues: new Map(),
      monthlyMovement: [],
      firstDates: [],
      firstDateMovement: [],
      accountsWithFutureRecords: new Set(),
      rates: [],
      now,
      today: '2026-09-19',
    });
    expect(model.emptyMessage).toBe('Ще немає рахунків');
    expect(model.readouts).toEqual([]);
  });

  it('assembles current readouts, history and change from one consistent account', () => {
    const card = account({
      id: 'card',
      name: 'card',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(100000, 'UAH'),
    });
    const model = netWorthWidgetModel({
      accounts: [card],
      transactions: [],
      currentValues: new Map(),
      monthlyMovement: [{ accountId: 'card', month: '2026-08', net: 20000 }],
      firstDates: [{ accountId: 'card', firstDate: '2026-01-01' }],
      firstDateMovement: [{ accountId: 'card', net: 0 }],
      accountsWithFutureRecords: new Set(),
      rates: [],
      now,
      today: '2026-09-19',
    });
    // Current: opening 100000 (no transactions passed here, contribution() falls back to it).
    expect(model.readouts).toEqual([{ currency: 'UAH', text: '1 000,00 UAH', available: true }]);
    expect(model.historyCurrencies).toEqual(['UAH']);
    expect(model.historyCurrency).toBe('UAH');
    expect(model.historyPoints.length).toBeGreaterThan(0);
    // August 31 is a real known point (firstDate is January, well before it), so a comparable
    // baseline exists and a change line is produced rather than an "unavailable" sentence.
    expect(model.changeText).toBeDefined();
    expect(model.changeText).toMatch(/^[+−]/);
  });
});
