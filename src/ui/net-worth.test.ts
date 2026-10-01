import { describe, expect, it } from 'vitest';

import type { StoredRate } from '../db/rates-repo';
import { account } from '../domain/account';
import { money } from '../domain/money';
import type { AccountContribution, CurrencyTotal } from '../domain/net-worth';
import { expenseByDefault, transfer, type Income, type Transaction } from '../domain/transaction';
import {
  ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION,
  OVERFLOW_REASON,
  TOTAL_HISTORY,
  accountBasisLines,
  approximateNetWorthUah,
  buildHistoryInputs,
  changeLine,
  convertTotalsToUah,
  currencyReadouts,
  historyChoices,
  netWorthSeries,
  netWorthWidgetModel,
  selectHistory,
} from './net-worth';
import { netWorthInputFrom } from './net-worth-test-fixtures';

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


const usdRate = (millionths: number, at = '2026-09-19T08:00:00.000Z') => rate('USD', millionths, at);
/** 41.25345 UAH per USD, as the spec's scenarios read it. */
const USD_RATE = usdRate(41_253_450);
const eurRate = (at = '2026-09-19T08:00:00.000Z') => rate('EUR', 45_000_000, at);

const uah = (id: string, opening = 0, extra: { openingDate?: string; kind?: 'spending' | 'investment' | 'cash' } = {}) =>
  account({ id, name: id, kind: extra.kind ?? 'spending', currency: 'UAH', openingBalance: money(opening, 'UAH'), ...(extra.openingDate ? { openingDate: extra.openingDate } : {}) });
const foreign = (id: string, currency: string, opening = 0, openingDate?: string, archived = false) =>
  account({ id, name: id, kind: 'savings', currency, openingBalance: money(opening, currency), archived, ...(openingDate ? { openingDate } : {}) });
const earned = (id: string, accountId: string, date: string, amount: number, currency = 'UAH'): Income => ({
  type: 'income',
  id,
  date,
  accountId,
  amount: money(amount, currency),
  sourceId: 'salary',
});
const spent = (id: string, accountId: string, date: string, amount: number, currency = 'UAH'): Transaction =>
  expenseByDefault({ id, date, accountId, amount: money(amount, currency), categoryId: 'food' });

const seriesOf = (input: Parameters<typeof netWorthInputFrom>[0]) => netWorthSeries(netWorthInputFrom(input));
const monthsOf = (input: Parameters<typeof netWorthInputFrom>[0]) => {
  const reading = seriesOf(input).reading;
  if (!reading) throw new Error('expected a reading');
  return reading.months;
};
const endOf = (months: readonly { month: string; end?: number }[], month: string) =>
  months.find((m) => m.month === month)?.end;

describe('buildHistoryInputs', () => {
  it('groups the repo’s flat readings by account, the розбивка included, retaining accounts with none', () => {
    const inputs = buildHistoryInputs(
      [uah('card'), uah('idle')],
      [{ accountId: 'card', month: '2026-08', net: 700 }],
      [{ accountId: 'card', firstDate: '2026-08-02' }],
      [{ accountId: 'card', net: 1000 }],
      [
        { accountId: 'card', month: '2026-08', kind: 'income', net: 1000 },
        { accountId: 'card', month: '2026-08', kind: 'spending', net: -300 },
      ],
    );
    expect(inputs[0]).toMatchObject({ firstDate: '2026-08-02', firstDateNet: 1000 });
    expect(inputs[0]!.monthlyNet.get('2026-08')).toBe(700);
    expect(inputs[0]!.monthlyByKind?.get('2026-08')).toEqual({ income: 1000, spending: -300 });
    expect(inputs[1]).toMatchObject({ firstDate: undefined });
    expect(inputs[1]!.monthlyByKind).toBeUndefined();
  });
});

describe('«Усе ≈ грн» month by month', () => {
  it('Scenario: Each date converts at the one current rate', () => {
    const accounts = [uah('card', 100000, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 10000, '2026-08-01')];
    const transactions = [{ type: 'income', id: 'i', date: '2026-09-05', accountId: 'usd', amount: money(10000, 'USD'), sourceId: 's' } as Income];
    const months = monthsOf({ accounts, transactions, today: '2026-09-19', rates: [USD_RATE], requestedHistory: TOTAL_HISTORY });
    expect(endOf(months, '2026-08')).toBe(512535);
    expect(endOf(months, '2026-09')).toBe(925069);
    // The exact per-currency histories are untouched by the conversion.
    const usdMonths = monthsOf({ accounts, transactions, today: '2026-09-19', rates: [USD_RATE], requestedHistory: 'USD' });
    expect(usdMonths.map((m) => m.end)).toEqual([10000, 20000]);
  });

  it("Scenario: Changing today's rate revalues every point together", () => {
    const accounts = [uah('card', 100000, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 10000, '2026-08-01')];
    const months = monthsOf({ accounts, today: '2026-09-19', rates: [usdRate(40_000_000)], requestedHistory: TOTAL_HISTORY });
    expect(months.map((m) => m.end)).toEqual([500000, 500000]);
  });

  it('Scenario: Stale cached rates stay marked and nothing is requested', () => {
    const accounts = [uah('card', 100000, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 10000, '2026-08-01')];
    const series = seriesOf({
      accounts,
      today: '2026-09-19',
      rates: [usdRate(41_253_450, '2026-06-01T08:00:00.000Z')],
      requestedHistory: TOTAL_HISTORY,
    });
    expect(series.oldestRateAt).toEqual(new Date('2026-06-01T08:00:00.000Z'));
  });

  it('Scenario: A missing rate withholds the whole history', () => {
    // UAH, USD and EUR held, no EUR rate — including when the EUR balance is zero.
    const accounts = [uah('card', 1000, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 10, '2026-08-01'), foreign('eur', 'EUR', 0, '2026-08-01')];
    const series = seriesOf({ accounts, today: '2026-09-19', rates: [USD_RATE], requestedHistory: TOTAL_HISTORY });
    expect(series.reading).toBeUndefined();
    expect(series.withheldMessage).toBe('Немає курсу EUR для сукупної історії.');
    // The per-currency histories remain readable.
    expect(seriesOf({ accounts, today: '2026-09-19', rates: [USD_RATE], requestedHistory: 'USD' }).reading?.months).toHaveLength(2);
  });

  it('Scenario: A currency first held later does not shorten the whole', () => {
    const accounts = [
      uah('black', 500000, { openingDate: '2024-10-28' }),
      foreign('cash-eur', 'EUR', 30000, '2026-06-07'),
      foreign('mono-eur', 'EUR', 2000, '2026-08-30'),
    ];
    const months = monthsOf({ accounts, today: '2026-09-19', rates: [eurRate()], requestedHistory: TOTAL_HISTORY });
    expect(months[0]!.month).toBe('2024-10');
    expect(months.every((m) => m.end !== undefined)).toBe(true);
    // EUR contributes nothing before June 7 …
    expect(endOf(months, '2026-05')).toBe(500000);
    // … and its entries are steps marked «нові рахунки», never growth.
    const june = months.find((m) => m.month === '2026-06')!;
    expect(june.entered).toBe(1350000);
    expect(june.change).toEqual({ status: 'available', absolute: 0, percent: 0 });
    expect(months.find((m) => m.month === '2026-08')!.entered).toBe(90000);
  });

  it('Scenario: A рахунок entering later is a step, not a gap', () => {
    const accounts = [uah('card', 100000, { openingDate: '2025-12-01' }), foreign('usd', 'USD', 10000, '2026-03-10')];
    const months = monthsOf({ accounts, today: '2026-04-15', rates: [USD_RATE], requestedHistory: TOTAL_HISTORY });
    expect(endOf(months, '2026-01')).toBe(100000);
    expect(endOf(months, '2026-02')).toBe(100000);
    expect(endOf(months, '2026-03')).toBe(512535);
  });

  it('Scenario: Overflow is a gap that says so', () => {
    const accounts = [uah('huge', Number.MAX_SAFE_INTEGER - 10, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 10000, '2026-08-01')];
    const months = monthsOf({ accounts, today: '2026-09-19', rates: [USD_RATE], requestedHistory: TOTAL_HISTORY });
    expect(months.map((m) => m.end)).toEqual([undefined, undefined]);
    expect(months[1]!.change).toEqual({ status: 'unavailable', reason: 'overflow' });
    expect(changeLine({ approximate: true, currency: 'UAH' }, months[1]!, '2026-08-31', now).text).toContain(OVERFLOW_REASON);
    // The exact UAH history is still known: only the converted sum is unrepresentable.
    expect(monthsOf({ accounts, today: '2026-09-19', rates: [USD_RATE], requestedHistory: 'UAH' })[1]!.end).toBe(
      Number.MAX_SAFE_INTEGER - 10,
    );
  });

  it('Scenario: An exchange moves money between currencies — the «≈» line is the rate difference', () => {
    const accounts = [uah('card', 500000, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 0, '2026-08-01')];
    const exchange = transfer({ id: 'fx', date: '2026-09-10', fromAccountId: 'card', toAccountId: 'usd', left: money(410000, 'UAH'), arrived: money(10000, 'USD') });
    const september = monthsOf({ accounts, transactions: [exchange], today: '2026-09-30', rates: [USD_RATE], requestedHistory: TOTAL_HISTORY }).at(-1)!;
    expect(september.breakdown.transfer).toBe(2535);
    const b = september.breakdown;
    expect(b.income + b.spending + b.correction + b.transfer + b.entered).toBe(2535);
  });

  it('carries the rounding of the parts on «перекази й обмін», so they add up exactly', () => {
    const accounts = [uah('card', 0, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 333, '2026-08-01')];
    const transactions = [
      earned('i1', 'usd', '2026-09-03', 333, 'USD'),
      spent('e1', 'usd', '2026-09-04', 111, 'USD'),
    ];
    const months = monthsOf({ accounts, transactions, today: '2026-09-30', rates: [USD_RATE], requestedHistory: TOTAL_HISTORY });
    for (const [i, m] of months.entries()) {
      const before = i === 0 ? 0 : months[i - 1]!.end!;
      const b = m.breakdown;
      expect(b.income + b.spending + b.correction + b.transfer + b.entered).toBe(m.end! - before);
    }
  });
});

describe('the «≈» change compares recorded-balance points', () => {
  const line = (input: Parameters<typeof netWorthInputFrom>[0]) => {
    const series = seriesOf(input);
    const months = series.reading!.months;
    return changeLine(series.reading!, months.at(-1)!, months.at(-2)?.date, now);
  };

  it('Scenario: Positive comparable baseline', () => {
    const accounts = [uah('card', 100000, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 0, '2026-08-01')];
    const text = line({ accounts, transactions: [earned('i', 'card', '2026-09-10', 20000)], today: '2026-09-19', rates: [USD_RATE] }).text;
    expect(text).toBe('+≈200 грн · +20,0% ▲ · від 31 серпня');
  });

  it('Scenario: Zero or negative baseline has no percentage', () => {
    const accounts = [uah('card', -10000, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 0, '2026-08-01')];
    const result = line({ accounts, transactions: [earned('i', 'card', '2026-09-10', 30000)], today: '2026-09-19', rates: [USD_RATE] });
    expect(result.text).toBe('+≈300 грн ▲ · від 31 серпня');
  });

  it('Scenario: An entered поточна вартість does not withhold the change', () => {
    const accounts = [uah('fund', 100000, { openingDate: '2026-08-01', kind: 'investment' }), foreign('usd', 'USD', 0, '2026-08-01')];
    const result = line({
      accounts,
      transactions: [earned('i', 'fund', '2026-09-10', 20000)],
      today: '2026-09-19',
      rates: [USD_RATE],
      currentValues: new Map([['fund', { amount: money(150000, 'UAH'), asOf: '2026-09-15' }]]),
    });
    expect(result.text).toBe('+≈200 грн · +20,0% ▲ · від 31 серпня');
  });

  it('Scenario: A missing baseline withholds the change', () => {
    const accounts = [uah('huge', Number.MAX_SAFE_INTEGER - 10, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 10000, '2026-08-01')];
    expect(line({ accounts, today: '2026-09-19', rates: [USD_RATE] }).text).toBe(
      `Порівняння недоступне: ${OVERFLOW_REASON}.`,
    );
  });
});

describe('selectHistory', () => {
  it('Scenario: History currency has a deterministic default', () => {
    const currencies = ['UAH', 'EUR', 'USD'];
    expect(selectHistory(currencies, [USD_RATE, eurRate()])).toBe(TOTAL_HISTORY);
    // A subsequent choice of USD survives refresh.
    expect(selectHistory(currencies, [USD_RATE, eurRate()], 'USD')).toBe('USD');
  });

  it('Scenario: A missing rate makes UAH the default', () => {
    expect(selectHistory(['UAH', 'EUR'], [])).toBe('UAH');
    expect(selectHistory(['EUR', 'USD'], [USD_RATE])).toBe('EUR');
  });

  it('Scenario: The combined choice is offered only when it adds something', () => {
    expect(historyChoices(['UAH', 'USD'], 'UAH').map((c) => c.id)).toEqual(['UAH', 'USD', TOTAL_HISTORY]);
    expect(historyChoices(['UAH'], 'UAH').map((c) => c.id)).toEqual(['UAH']);
  });

  it('Scenario: The combined choice does not outlive its currencies', () => {
    expect(selectHistory(['UAH', 'USD'], [USD_RATE], TOTAL_HISTORY)).toBe(TOTAL_HISTORY);
    expect(selectHistory(['UAH'], [USD_RATE], TOTAL_HISTORY)).toBe('UAH');
  });

  it('keeps a chosen «Усе ≈ грн» while a rate is missing, so the widget can say why', () => {
    expect(selectHistory(['UAH', 'EUR'], [], TOTAL_HISTORY)).toBe(TOTAL_HISTORY);
  });
});

describe('netWorthWidgetModel', () => {
  it('Scenario: Empty and incomplete data are not zero money — no accounts at all', () => {
    const model = netWorthWidgetModel(netWorthInputFrom({ accounts: [], today: '2026-10-01' }));
    expect(model.emptyMessage).toBe('Ще немає рахунків');
    expect(model.chartValues).toEqual([]);
  });

  it('Scenario: The widget answers "is it growing" at a glance', () => {
    const accounts = [uah('card', 0, { openingDate: '2025-06-01' }), foreign('usd', 'USD', 0, '2025-06-01'), foreign('eur', 'EUR', 0, '2025-06-01')];
    const transactions = [earned('a', 'card', '2025-06-02', 37500000), earned('b', 'card', '2026-10-01', 2640800)];
    const model = netWorthWidgetModel(
      netWorthInputFrom({ accounts, transactions, today: '2026-10-01', now: new Date('2026-10-01T12:00:00'), rates: [USD_RATE, eurRate()] }),
    );
    expect(model.headline).toBe('≈401 408 грн');
    expect(model.exactLine).toBe('401 408,00 UAH · 0,00 EUR · 0,00 USD');
    expect(model.changeText).toBe('+≈26 408 грн · +7,0% ▲ · від 30 вересня');
    expect(model.changeDirection).toBe('up');
    expect(model.chartValues).toHaveLength(12);
    expect(model.chartTicks.map((t) => t.text)).toEqual(['лис', 'гру', 'січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов']);
    expect(model.chartTicks.at(-1)!.current).toBe(true);
  });

  it('Scenario: Future dates do not extend the curve — the headline discloses its future records', () => {
    const accounts = [uah('card', 100000, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 0, '2026-08-01')];
    const transactions = [spent('later', 'card', '2026-10-02', 5000)];
    const model = netWorthWidgetModel(netWorthInputFrom({ accounts, transactions, today: '2026-09-19', requestedHistory: 'UAH' }));
    expect(model.headline).toBe(`950,00 UAH`);
    expect(model.chartValues.at(-1)).toBe(100000);
    expect(model.futureLine).toBe('Є записи з майбутніми датами: вони вже в статку, але не в історії й не в зміні.');
    // Another currency's reading has nothing to disclose.
    expect(netWorthWidgetModel(netWorthInputFrom({ accounts, transactions, today: '2026-09-19', requestedHistory: 'USD' })).futureLine).toBeUndefined();
  });

  it('Scenario: Headline and history use different investment bases', () => {
    const fund = uah('fund', 100000, { openingDate: '2026-08-01', kind: 'investment' });
    const model = netWorthWidgetModel(
      netWorthInputFrom({
        accounts: [fund],
        today: '2026-09-19',
        currentValues: new Map([['fund', { amount: money(150000, 'UAH'), asOf: '2026-09-15' }]]),
      }),
    );
    expect(model.headline).toBe('1 500,00 UAH');
    expect(model.chartValues.at(-1)).toBe(100000);
    expect(model.investmentLine).toBe('інвестиції: +500,00 UAH понад вкладене, станом на 15 вересня');
    expect(model.changeText).toBe('0,00 UAH · 0,0% · від 31 серпня');
  });

  it('Scenario: A missing rate falls back to UAH by default', () => {
    const accounts = [uah('card', 100000, { openingDate: '2026-08-01' }), foreign('eur', 'EUR', 3000, '2026-08-01')];
    const model = netWorthWidgetModel(netWorthInputFrom({ accounts, today: '2026-09-19' }));
    expect(model.headline).toBe('1 000,00 UAH');
    expect(model.chartValues).toEqual([100000, 100000]);
    expect(model.headline).not.toContain('≈');
  });

  it('Scenario: A withheld combined history says why', () => {
    const accounts = [uah('card', 100000, { openingDate: '2026-08-01' }), foreign('eur', 'EUR', 3000, '2026-08-01')];
    const model = netWorthWidgetModel(netWorthInputFrom({ accounts, today: '2026-09-19', requestedHistory: TOTAL_HISTORY }));
    expect(model.withheldMessage).toBe('Немає курсу EUR для сукупної історії.');
    expect(model.chartValues).toEqual([]);
    expect(model.changeText).toBeUndefined();
    expect(model.exactLine).toBe('1 000,00 UAH · 30,00 EUR');
  });

  it('Scenario: A currency held only in an archived рахунок still needs its rate', () => {
    const accounts = [uah('card', 100000, { openingDate: '2026-08-01' }), foreign('old', 'EUR', 0, '2026-08-01', true)];
    const model = netWorthWidgetModel(netWorthInputFrom({ accounts, today: '2026-09-19', requestedHistory: TOTAL_HISTORY }));
    expect(model.withheldMessage).toBe('Немає курсу EUR для сукупної історії.');
  });

  it('Scenario: The widget is announced to TalkBack', () => {
    const accounts = [uah('card', 0, { openingDate: '2026-08-01' }), foreign('usd', 'USD', 0, '2026-08-01')];
    const transactions = [earned('a', 'card', '2026-08-02', 37500000), earned('b', 'card', '2026-10-01', 2640800)];
    const model = netWorthWidgetModel(
      netWorthInputFrom({ accounts, transactions, today: '2026-10-01', now: new Date('2026-10-01T12:00:00'), rates: [USD_RATE] }),
    );
    expect(model.accessibilityLabel).toBe(
      'Статок, усе наближено в гривнях. приблизно 401 408 гривень. зміна плюс приблизно 26 408 гривень, зростання, від 30 вересня. Відкриває Статок',
    );
  });

  it("Scenario: Today's valuation never changes past points — the per-currency series is unchanged", () => {
    const fund = uah('fund', 100000, { openingDate: '2026-08-01', kind: 'investment' });
    const read = (value: number) =>
      netWorthWidgetModel(
        netWorthInputFrom({
          accounts: [fund],
          today: '2026-09-19',
          currentValues: new Map([['fund', { amount: money(value, 'UAH'), asOf: '2026-09-15' }]]),
        }),
      ).chartValues;
    expect(read(150000)).toEqual(read(170000));
  });
});
