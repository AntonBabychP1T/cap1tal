import { describe, expect, it } from 'vitest';

import type { StoredRate } from '../db/rates-repo';
import { account } from '../domain/account';
import { money } from '../domain/money';
import type { AccountContribution, ChangeResult, CurrencyTotal, HistoryPoint } from '../domain/net-worth';
import {
  ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION,
  accountBasisLines,
  approximateNetWorthUah,
  TOTAL_HISTORY,
  buildHistoryInputs,
  changeLabel,
  chartedCombinedHistory,
  chartedHistory,
  combinedHistory,
  combinedPointRows,
  combinedSeriesFor,
  convertTotalsToUah,
  currencyReadouts,
  historyPointLabel,
  historyPointRows,
  historySpanOf,
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
  const kinds = new Map([
    ['bonds', 'investment' as const],
    ['inzhur', 'investment' as const],
    ['card', 'spending' as const],
  ]);

  it('A card is not «вкладено»', () => {
    const contributions: AccountContribution[] = [
      { accountId: 'card', currency: 'UAH', amount: money(230000, 'UAH'), basis: 'ledger' },
      { accountId: 'inzhur', currency: 'UAH', amount: money(2630728, 'UAH'), basis: 'ledger' },
      {
        accountId: 'bonds',
        currency: 'UAH',
        amount: money(150000, 'UAH'),
        basis: 'currentValue',
        asOf: '2026-06-01',
      },
    ];
    const accountNames = new Map([
      ['bonds', 'military bonds'],
      ['inzhur', 'інжур'],
      ['card', 'mono black'],
    ]);
    expect(accountBasisLines(contributions, accountNames, now, kinds)).toEqual([
      { accountId: 'card', name: 'mono black', amount: `2${T}300,00 UAH`, basis: '' },
      { accountId: 'inzhur', name: 'інжур', amount: `26${T}307,28 UAH`, basis: 'вкладено' },
      // Same year as `now` (2026): calendarLabel omits it, as it does everywhere else.
      {
        accountId: 'bonds',
        name: 'military bonds',
        amount: `1${T}500,00 UAH`,
        basis: 'поточна вартість на 1 червня',
      },
    ]);
  });

  it('An account id with no name falls back to the id itself, and claims no basis', () => {
    const contributions: AccountContribution[] = [
      { accountId: 'ghost', currency: 'UAH', amount: money(0, 'UAH'), basis: 'ledger' },
    ];
    expect(accountBasisLines(contributions, new Map(), now, kinds)[0]).toMatchObject({
      name: 'ghost',
      basis: '',
    });
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
    expect(changeLabel(change, now)).toBe('+200,00 UAH · +20,0% · від 31 серпня');
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

  it('The chart starts at the first point the history currency has a value for', () => {
    // QA on the owner's data: a zero-opening USD рахунок from 28 жовтня 2024 started the whole
    // history there, while every UAH рахунок is known only from February 2026 — the UAH chart
    // spent ~70% of its width on a leading gap with no line in it.
    const usd = account({
      id: 'usd',
      name: 'usd',
      kind: 'spending',
      currency: 'USD',
      openingBalance: money(0, 'USD'),
    });
    const card = account({
      id: 'card',
      name: 'card',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(100000, 'UAH'),
    });
    const model = netWorthWidgetModel({
      accounts: [usd, card],
      transactions: [],
      currentValues: new Map(),
      monthlyMovement: [
        { accountId: 'usd', month: '2024-10', net: 500 },
        { accountId: 'card', month: '2026-02', net: 20000 },
      ],
      firstDates: [
        { accountId: 'usd', firstDate: '2024-10-28' },
        { accountId: 'card', firstDate: '2026-02-10' },
      ],
      firstDateMovement: [
        { accountId: 'usd', net: 500 },
        { accountId: 'card', net: 20000 },
      ],
      accountsWithFutureRecords: new Set(),
      rates: [],
      now,
      today: '2026-09-19',
    });
    expect(model.historyCurrency).toBe('UAH');
    // 10 лютого is not a candidate date (only the global first date, month-ends and today are), so
    // the first UAH value is the February month-end.
    expect(model.historySpan).toEqual({ first: '28 лютого', last: '19 вересня' });
    expect(model.historySeries[0]).toEqual({ x: 0, value: 120000 });
    expect(model.historySeries.every((p) => p.value !== undefined)).toBe(true);
    // The point list still says why there is nothing before February — folded into one line.
    expect(model.historyPoints[0]?.label).toBe(
      '28 жовтня 2024 — 31 січня: невідомо — недостатньо даних за цей період',
    );
  });
});

describe('chartedHistory', () => {
  it('drops the leading run of points with no value for the currency', () => {
    const points = [
      point('2024-10-28', undefined, 'gap'),
      point('2024-10-31', undefined, 'gap'),
      point('2026-02-28', 100),
      point('2026-03-31', undefined, 'gap'),
      point('2026-09-23', 200),
    ];
    expect(chartedHistory(points, 'UAH').map((p) => p.date)).toEqual([
      '2026-02-28',
      // An inner gap stays: it is a break in the line, not a stretch before the line begins.
      '2026-03-31',
      '2026-09-23',
    ]);
  });

  it('keeps every point when the first one already has a value', () => {
    const points = [point('2026-06-05', 1), point('2026-06-30', undefined, 'gap')];
    expect(chartedHistory(points, 'UAH')).toEqual(points);
  });

  it('keeps every point when none has a value — nothing to start the axis at', () => {
    const points = [point('2026-06-30', undefined, 'gap'), point('2026-07-31', undefined, 'gap')];
    expect(chartedHistory(points, 'UAH')).toEqual(points);
  });
});

describe('historyPointRows', () => {
  const at = new Date(2026, 8, 23, 12, 0, 0);

  it('Fifteen unknown month-ends read as one line', () => {
    const points = [
      point('2024-10-28', undefined, 'gap'),
      point('2024-10-31', undefined, 'gap'),
      point('2024-11-30', undefined, 'gap'),
      point('2026-01-31', undefined, 'gap'),
      point('2026-02-28', 16039349),
      point('2026-09-23', 18744916),
    ];
    expect(historyPointRows(points, 'UAH', at).map((r) => r.label)).toEqual([
      '28 жовтня 2024 — 31 січня: невідомо — недостатньо даних за цей період',
      `28 лютого: 160${T}393,49 UAH`,
      `23 вересня: 187${T}449,16 UAH`,
    ]);
  });

  it('A run broken by a known point is two ranges', () => {
    const points = [
      point('2026-05-31', undefined, 'gap'),
      point('2026-06-30', undefined, 'gap'),
      point('2026-07-31', 100),
      point('2026-08-31', undefined, 'gap'),
      point('2026-09-23', undefined, 'gap'),
    ];
    expect(historyPointRows(points, 'UAH', at).map((r) => r.label)).toEqual([
      '31 травня — 30 червня: невідомо — недостатньо даних за цей період',
      '31 липня: 1,00 UAH',
      '31 серпня — 23 вересня: невідомо — недостатньо даних за цей період',
    ]);
  });

  it('A single unknown point reads as one date, not a range', () => {
    const points = [point('2026-08-31', undefined, 'gap'), point('2026-09-23', 100)];
    expect(historyPointRows(points, 'UAH', at)[0]?.label).toBe(
      '31 серпня: невідомо — недостатньо даних за цей період',
    );
  });

  it('Different reasons are never folded together', () => {
    const points = [point('2026-07-31', undefined, 'gap'), point('2026-08-31', undefined, 'overflow')];
    expect(historyPointRows(points, 'UAH', at)).toHaveLength(2);
  });

  it('Every row has a distinct key', () => {
    const points = [point('2026-07-31', undefined, 'gap'), point('2026-08-31', 1), point('2026-09-23', 2)];
    const keys = historyPointRows(points, 'UAH', at).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('historySpanOf', () => {
  const at = new Date(2026, 8, 23, 12, 0, 0);

  it('The chart names its span', () => {
    const points = [point('2024-10-28', undefined, 'gap'), point('2026-08-31', 1), point('2026-09-23', 2)];
    expect(historySpanOf(points, at)).toEqual({ first: '28 жовтня 2024', last: '23 вересня' });
  });

  it('A single point has no span', () => {
    expect(historySpanOf([point('2026-09-23', 2)], at)).toBeUndefined();
    expect(historySpanOf([], at)).toBeUndefined();
  });
});

/** A history point over several currencies: a number is a known total, a word is why it has none. */
const multi = (date: string, totals: Record<string, number | 'gap' | 'overflow'>): HistoryPoint => ({
  date,
  totals: new Map(
    Object.entries(totals).map(([currency, value]): [string, CurrencyTotal] => [
      currency,
      typeof value === 'number'
        ? known(value, currency)
        : { status: 'unavailable', reason: value },
    ]),
  ),
});

const usdRate = (millionths: number, at = '2026-09-19T08:00:00.000Z') => rate('USD', millionths, at);
const HELD = ['UAH', 'USD'];

const readyPoints = (result: ReturnType<typeof combinedHistory>) => {
  if (result.status !== 'ready') throw new Error('expected a ready combined history');
  return result.points;
};

describe('convertTotalsToUah', () => {
  it('sums known totals at the cached rates and names the oldest rate', () => {
    const totals = new Map<string, CurrencyTotal>([
      ['UAH', known(100000, 'UAH')],
      ['USD', known(10000, 'USD')],
    ]);
    expect(convertTotalsToUah(totals, [usdRate(41_253_450)])).toEqual({
      status: 'known',
      amount: 512535,
      oldestRateAt: new Date('2026-09-19T08:00:00.000Z'),
    });
  });
});

describe('combinedHistory', () => {
  const august = multi('2026-08-31', { UAH: 100000, USD: 10000 });
  const today = multi('2026-09-19', { UAH: 100000, USD: 20000 });

  it('Scenario: Each date converts at the one current rate', () => {
    const points = readyPoints(combinedHistory([august, today], HELD, [usdRate(41_253_450)]));
    expect(points).toEqual([
      { date: '2026-08-31', status: 'known', amount: 512535 },
      { date: '2026-09-19', status: 'known', amount: 925069 },
    ]);
    // The exact per-currency histories are untouched by the conversion.
    expect(historySeriesFor([august, today], 'USD').map((p) => p.value)).toEqual([10000, 20000]);
  });

  it('Scenario: Changing today’s rate revalues every point together', () => {
    const points = readyPoints(combinedHistory([august, today], HELD, [usdRate(40_000_000)]));
    expect(points.map((p) => p.status === 'known' && p.amount)).toEqual([500000, 900000]);
  });

  it('Scenario: Stale cached rates stay marked and nothing is requested', () => {
    const result = combinedHistory(
      [august, today],
      HELD,
      [usdRate(41_000_000, '2026-08-01T08:00:00.000Z')],
    );
    expect(result.status === 'ready' && result.oldestRateAt).toEqual(new Date('2026-08-01T08:00:00.000Z'));
  });

  it('Scenario: A missing rate withholds the whole history — including for a zero balance', () => {
    const points = [multi('2026-08-31', { UAH: 100000, USD: 10000, EUR: 0 })];
    expect(combinedHistory(points, ['UAH', 'EUR', 'USD'], [usdRate(41_000_000)])).toEqual({
      status: 'withheld',
      missing: ['EUR'],
    });
  });

  it('Scenario: A missing rate names every currency without one', () => {
    expect(combinedHistory([august], ['UAH', 'EUR', 'USD'], [])).toEqual({
      status: 'withheld',
      missing: ['EUR', 'USD'],
    });
  });

  it('Scenario: An unknown currency makes the point a gap, not a partial sum', () => {
    const points = readyPoints(
      combinedHistory(
        [
          multi('2026-01-31', { UAH: 100000, USD: 'gap' }),
          multi('2026-02-28', { UAH: 100000, USD: 'gap' }),
          multi('2026-03-31', { UAH: 100000, USD: 10000 }),
        ],
        HELD,
        [usdRate(41_000_000)],
      ),
    );
    expect(points).toEqual([
      { date: '2026-01-31', status: 'unavailable', reason: 'gap', currency: 'USD' },
      { date: '2026-02-28', status: 'unavailable', reason: 'gap', currency: 'USD' },
      { date: '2026-03-31', status: 'known', amount: 510000 },
    ]);
  });

  it('Scenario: A currency with no entry for a point is unknown, not zero', () => {
    const points = readyPoints(
      combinedHistory([multi('2026-01-31', { UAH: 100000 })], HELD, [usdRate(41_000_000)]),
    );
    expect(points[0]).toMatchObject({ status: 'unavailable', reason: 'gap', currency: 'USD' });
  });

  it('Scenario: Overflow is a gap that says so', () => {
    const points = readyPoints(
      combinedHistory(
        [
          multi('2026-01-31', { UAH: 'overflow', USD: 100 }),
          multi('2026-02-28', { UAH: Number.MAX_SAFE_INTEGER - 1, USD: Number.MAX_SAFE_INTEGER - 1 }),
        ],
        HELD,
        [usdRate(41_000_000)],
      ),
    );
    expect(points.map((p) => p.status === 'unavailable' && p.reason)).toEqual(['overflow', 'overflow']);
    expect(combinedPointRows(points, now).map((r) => r.label)).toEqual([
      '31 січня — 28 лютого: сума перевищує безпечне представлення',
    ]);
  });

  it('Scenario: Leading gaps do not become empty chart', () => {
    const points = readyPoints(
      combinedHistory(
        [
          multi('2024-10-28', { UAH: 'gap', USD: 500 }),
          multi('2024-10-31', { UAH: 'gap', USD: 500 }),
          multi('2026-02-28', { UAH: 120000, USD: 500 }),
          multi('2026-03-31', { UAH: 'gap', USD: 500 }),
          multi('2026-09-19', { UAH: 200000, USD: 500 }),
        ],
        HELD,
        [usdRate(40_000_000)],
      ),
    );
    const charted = chartedCombinedHistory(points);
    expect(charted.map((p) => p.date)).toEqual(['2026-02-28', '2026-03-31', '2026-09-19']);
    expect(combinedSeriesFor(charted)).toEqual([
      { x: 0, value: 140000 },
      { x: 0.5, value: undefined },
      { x: 1, value: 220000 },
    ]);
    // The point list still opens with the earlier unknown dates and why.
    expect(combinedPointRows(points, now)[0]?.label).toBe('28 жовтня 2024 — 31 жовтня 2024: немає даних за UAH');
  });

  it('Scenario: The point list folds runs of the same reason only', () => {
    const points = readyPoints(
      combinedHistory(
        [
          multi('2026-01-31', { UAH: 100, USD: 'gap', EUR: 5 }),
          multi('2026-02-28', { UAH: 100, USD: 'gap', EUR: 5 }),
          multi('2026-03-31', { UAH: 100, USD: 5, EUR: 'gap' }),
          multi('2026-04-30', { UAH: 100, USD: 5, EUR: 'gap' }),
          multi('2026-05-31', { UAH: 100, USD: 5, EUR: 5 }),
        ],
        ['UAH', 'EUR', 'USD'],
        [rate('USD', 40_000_000, '2026-09-19T08:00:00.000Z'), rate('EUR', 45_000_000, '2026-09-19T08:00:00.000Z')],
      ),
    );
    const rows = combinedPointRows(points, new Date(2026, 8, 23, 12));
    expect(rows.map((r) => r.label)).toEqual([
      '31 січня — 28 лютого: немає даних за USD',
      '31 березня — 30 квітня: немає даних за EUR',
      '31 травня: ≈ 5,25 грн',
    ]);
  });

  it('Scenario: Combined rows fold same-reason gaps and carry «≈» on every value', () => {
    const rows = combinedPointRows(
      [
        { date: '2026-06-30', status: 'known', amount: -12345 },
        { date: '2026-07-31', status: 'unavailable', reason: 'gap', currency: 'USD' },
        { date: '2026-08-31', status: 'unavailable', reason: 'gap', currency: 'USD' },
      ],
      new Date(2026, 8, 23, 12),
    );
    expect(rows.map((r) => r.label)).toEqual([
      '30 червня: ≈ −123,45 грн',
      '31 липня — 31 серпня: немає даних за USD',
    ]);
  });
});

describe('selectHistoryCurrency with the combined choice', () => {
  it('Scenario: The combined choice is never the default and does not outlive its currencies', () => {
    expect(selectHistoryCurrency(['UAH', 'USD'])).toBe('UAH');
    expect(selectHistoryCurrency(['UAH', 'USD'], TOTAL_HISTORY)).toBe(TOTAL_HISTORY);
    expect(selectHistoryCurrency(['UAH'], TOTAL_HISTORY)).toBe('UAH');
    expect(selectHistoryCurrency(['EUR'], TOTAL_HISTORY)).toBe('EUR');
    expect(selectHistoryCurrency([], TOTAL_HISTORY)).toBeUndefined();
  });
});

describe('changeLabel for the combined history', () => {
  const at = new Date(2026, 8, 19, 12);

  it('Scenario: Positive comparable baseline (Усе ≈ грн) marks the amount «≈» after its sign', () => {
    const change: ChangeResult = {
      status: 'available',
      change: { currency: 'UAH', absolute: money(20000, 'UAH'), percent: 20, since: '2026-08-31' },
    };
    expect(changeLabel(change, at, true)).toBe('+≈200,00 UAH · +20,0% · від 31 серпня');
    expect(changeLabel(change, at)).toBe('+200,00 UAH · +20,0% · від 31 серпня');
  });

  it('a negative change keeps its sign before «≈»', () => {
    const change: ChangeResult = {
      status: 'available',
      change: { currency: 'UAH', absolute: money(-30000, 'UAH'), since: '2026-08-31' },
    };
    expect(changeLabel(change, at, true)).toBe('−≈300,00 UAH · від 31 серпня');
  });

  it('the valuation reason drops «в цій валюті» when combined', () => {
    const text = changeLabel({ status: 'unavailable', reason: 'valuation-substituted' }, at, true);
    expect(text).toContain('поточна вартість');
    expect(text).not.toContain('в цій валюті');
  });
});

describe('netWorthWidgetModel: Усе ≈ грн', () => {
  const uahCard = (opening: number, extra: Partial<Parameters<typeof account>[0]> = {}) =>
    account({
      id: 'card',
      name: 'card',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(opening, 'UAH'),
      ...extra,
    });
  const usdJar = account({
    id: 'usd',
    name: 'usd',
    kind: 'spending',
    currency: 'USD',
    openingBalance: money(0, 'USD'),
  });
  const base = {
    transactions: [],
    currentValues: new Map(),
    accountsWithFutureRecords: new Set<string>(),
    now: new Date(2026, 8, 19, 12),
    today: '2026-09-19',
    requestedHistory: TOTAL_HISTORY,
  } as const;
  /** UAH opening from January, then `monthly` net through January; USD zero from January. */
  const movement = (monthly: number) => ({
    monthlyMovement: [{ accountId: 'card', month: '2026-01' as const, net: monthly }],
    firstDates: [
      { accountId: 'card', firstDate: '2026-01-01' as const },
      { accountId: 'usd', firstDate: '2026-01-01' as const },
    ],
    firstDateMovement: [
      { accountId: 'card', net: monthly },
      { accountId: 'usd', net: 0 },
    ],
  });
  const rates = [rate('USD', 41_253_450, '2026-09-18T08:00:00.000Z')];

  it('Scenario: The combined choice is offered only when it adds something', () => {
    const two = netWorthWidgetModel({ ...base, requestedHistory: '', accounts: [uahCard(0), usdJar], ...movement(0), rates });
    expect(two.historyChoices.map((c) => c.label)).toEqual(['UAH', 'USD', 'Усе ≈ грн']);
    const one = netWorthWidgetModel({ ...base, requestedHistory: '', accounts: [uahCard(0)], ...movement(0), rates });
    expect(one.historyChoices.map((c) => c.label)).toEqual(['UAH']);
  });

  it('Scenario: The combined choice is never the default and does not outlive its currencies', () => {
    const first = netWorthWidgetModel({ ...base, requestedHistory: '', accounts: [uahCard(0), usdJar], ...movement(0), rates });
    expect(first.historyTotalSelected).toBe(false);
    expect(first.historyCurrency).toBe('UAH');
    const removed = netWorthWidgetModel({ ...base, accounts: [uahCard(0)], ...movement(0), rates });
    expect(removed.historyTotalSelected).toBe(false);
    expect(removed.historyCurrency).toBe('UAH');
  });

  it('Scenario: The owner reads the whole статок in time — the exact headline and choices are unchanged', () => {
    const accounts = [uahCard(100000), usdJar];
    const currency = netWorthWidgetModel({ ...base, requestedHistory: 'USD', accounts, ...movement(0), rates });
    const total = netWorthWidgetModel({ ...base, accounts, ...movement(0), rates });
    expect(total.historyTotalSelected).toBe(true);
    expect(total.historyCurrency).toBeUndefined();
    expect(total.readouts).toEqual(currency.readouts);
    expect(total.approximate).toEqual(currency.approximate);
    expect(total.historyCurrencies).toEqual(currency.historyCurrencies);
    expect(total.historyChoices.map((c) => c.id)).toEqual(['UAH', 'USD', TOTAL_HISTORY]);
    expect(total.historyCaption).toBe(
      'Історія розрахункових балансів · інвестиції за вкладеним · ≈ за поточним курсом, не за курсом на дату',
    );
    expect(total.historySeries.length).toBeGreaterThan(0);
    expect(total.historyPoints.every((r) => r.label.includes('≈') || r.label.includes('немає'))).toBe(true);
    expect(total.historyRateFreshness).toBe('курс станом на 18 вересня');
    expect(total.historyWithheldMessage).toBeUndefined();
    // The per-currency caption is the one it always was.
    expect(currency.historyCaption).toBe('Історія розрахункових балансів · інвестиції за вкладеним');
    expect(currency.historyRateFreshness).toBeUndefined();
  });

  it('Scenario: The combined choice is announced to TalkBack', () => {
    const total = netWorthWidgetModel({ ...base, accounts: [uahCard(0), usdJar], ...movement(0), rates });
    const chip = total.historyChoices.find((c) => c.id === TOTAL_HISTORY)!;
    expect(chip).toMatchObject({
      label: 'Усе ≈ грн',
      accessibilityLabel: 'Усе, наближено в гривнях, обрано',
      selected: true,
    });
    const other = netWorthWidgetModel({ ...base, requestedHistory: 'UAH', accounts: [uahCard(0), usdJar], ...movement(0), rates });
    expect(other.historyChoices.find((c) => c.id === TOTAL_HISTORY)?.accessibilityLabel).toBe(
      'Усе, наближено в гривнях',
    );
    expect(total.historyChartLabel).toContain('наближено в гривнях');
    expect(total.historyPoints[0]?.label).toContain('≈');
  });

  it('Scenario: A withheld combined history says why', () => {
    const eur = account({ id: 'eur', name: 'eur', kind: 'spending', currency: 'EUR', openingBalance: money(0, 'EUR') });
    const model = netWorthWidgetModel({ ...base, accounts: [uahCard(0), eur], ...movement(0), rates: [] });
    expect(model.historyWithheldMessage).toBe('Немає курсу EUR для сукупної історії.');
    expect(model.historySeries).toEqual([]);
    expect(model.historyPoints).toEqual([]);
    expect(model.historySpan).toBeUndefined();
    expect(model.changeText).toBeUndefined();
    // The currency choices still read their own histories.
    const uah = netWorthWidgetModel({ ...base, requestedHistory: 'UAH', accounts: [uahCard(0), eur], ...movement(0), rates: [] });
    expect(uah.historyWithheldMessage).toBeUndefined();
    expect(uah.historyPoints.length).toBeGreaterThan(0);
  });

  it('Scenario: A currency held only in an archived рахунок still needs its rate', () => {
    const eur = account({
      id: 'eur',
      name: 'eur',
      kind: 'spending',
      currency: 'EUR',
      openingBalance: money(0, 'EUR'),
      archived: true,
    });
    const model = netWorthWidgetModel({ ...base, accounts: [uahCard(0), eur], ...movement(0), rates: [] });
    expect(model.historyWithheldMessage).toContain('EUR');
  });

  // baseline: 120000 opening, −`drop` through January → the August 31 point is 120000 − drop; the
  // current reading is the opening, 120000 (no transactions are passed).
  const withDrop = (drop: number, extra: Parameters<typeof netWorthWidgetModel>[0]['accountsWithFutureRecords'] = new Set()) =>
    netWorthWidgetModel({
      ...base,
      accounts: [uahCard(120000), usdJar],
      ...movement(-drop),
      accountsWithFutureRecords: extra,
      rates,
    });

  it('Scenario: Positive comparable baseline (Усе ≈ грн)', () => {
    expect(withDrop(20000).changeText).toBe('+≈200,00 UAH · +20,0% · від 31 серпня');
  });

  it('Scenario: Zero or negative baseline has no percentage (Усе ≈ грн)', () => {
    expect(withDrop(120000).changeText).toBe(`+≈1${T}200,00 UAH · від 31 серпня`);
    expect(withDrop(130000).changeText).toBe(`+≈1${T}300,00 UAH · від 31 серпня`);
  });

  it('Scenario: A future-dated record withholds the change — on any рахунок held', () => {
    expect(withDrop(20000, new Set(['usd'])).changeText).toBe(
      'Порівняння недоступне: є записи з майбутніми датами.',
    );
  });

  it('Scenario: A substituted valuation withholds the change — in any currency', () => {
    const bonds = account({
      id: 'usd',
      name: 'usd bonds',
      kind: 'investment',
      currency: 'USD',
      openingBalance: money(0, 'USD'),
    });
    const model = netWorthWidgetModel({
      ...base,
      accounts: [uahCard(120000), bonds],
      ...movement(-20000),
      currentValues: new Map([['usd', { amount: money(5000, 'USD'), asOf: '2026-09-01' }]]),
      rates,
    });
    expect(model.changeText).toContain('поточна вартість');
  });

  it('Scenario: A missing baseline withholds the change — no older period is substituted', () => {
    const model = netWorthWidgetModel({
      ...base,
      accounts: [uahCard(100000), usdJar],
      monthlyMovement: [],
      firstDates: [
        { accountId: 'card', firstDate: '2026-09-05' },
        { accountId: 'usd', firstDate: '2026-01-01' },
      ],
      firstDateMovement: [{ accountId: 'usd', net: 0 }, { accountId: 'card', net: 0 }],
      rates,
    });
    expect(model.changeText).toBe('Порівняння з попереднім місяцем поки недоступне.');
  });

  it('Scenario: Today’s valuation never changes past points — the per-currency series is unchanged', () => {
    const accounts = [uahCard(100000), usdJar];
    const plain = netWorthWidgetModel({ ...base, requestedHistory: 'UAH', accounts, ...movement(0), rates });
    const repriced = netWorthWidgetModel({
      ...base,
      requestedHistory: 'UAH',
      accounts,
      ...movement(0),
      rates: [rate('USD', 1_000_000, '2026-09-18T08:00:00.000Z')],
    });
    expect(repriced.historySeries).toEqual(plain.historySeries);
    expect(repriced.historyPoints).toEqual(plain.historyPoints);
  });

  it('a chosen combined history with no history at all draws nothing and says so', () => {
    const model = netWorthWidgetModel({
      ...base,
      accounts: [uahCard(0), usdJar],
      monthlyMovement: [],
      firstDates: [],
      firstDateMovement: [],
      rates,
    });
    expect(model.historyUnavailableMessage).toBe('Історія поки недоступна.');
    expect(model.historySeries).toEqual([]);
  });
});
