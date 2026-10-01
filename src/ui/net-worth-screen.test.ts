import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { StoredRate } from '../db/rates-repo';
import { account, type Account } from '../domain/account';
import type { CurrentValue } from '../domain/investments';
import { money } from '../domain/money';
import type { HistoryPeriod } from '../domain/net-worth';
import { expenseByDefault, type Correction, type Income, type Transaction } from '../domain/transaction';
import { OVERFLOW_REASON, TOTAL_HISTORY, netWorthSeries } from './net-worth';
import { netWorthScreenModel, type HistoryView, type ScreenChoices } from './net-worth-screen';
import { netWorthInputFrom } from './net-worth-test-fixtures';

/** The thousands separator every amount uses (U+00A0). */
const T = ' ';

const OCT_1 = new Date('2026-10-01T12:00:00');
const usdRate: StoredRate = { currency: 'USD', rateMillionths: 41_253_450, obtainedAt: new Date('2026-09-30T08:00:00.000Z') };

const uah = (id: string, opening = 0, openingDate?: string, kind: Account['kind'] = 'spending') =>
  account({ id, name: id, kind, currency: 'UAH', openingBalance: money(opening, 'UAH'), ...(openingDate ? { openingDate } : {}) });

const income = (id: string, accountId: string, date: string, amount: number, currency = 'UAH'): Income => ({
  type: 'income',
  id,
  date,
  accountId,
  amount: money(amount, currency),
  sourceId: 'salary',
});
const expense = (id: string, accountId: string, date: string, amount: number): Transaction =>
  expenseByDefault({ id, date, accountId, amount: money(amount, 'UAH'), categoryId: 'food' });
const correction = (id: string, accountId: string, date: string, amount: number): Correction => ({
  type: 'correction',
  id,
  date,
  accountId,
  amount: money(amount, 'UAH'),
});

/** One транзакція per month on «card», moving the level by each `changes[i]` from `firstMonth`. */
function monthly(firstMonth: string, changes: readonly number[]): Transaction[] {
  const [y, m] = firstMonth.split('-').map(Number) as [number, number];
  return changes.map((change, i) => {
    const month = `${y + Math.floor((m - 1 + i) / 12)}-${String(((m - 1 + i) % 12) + 1).padStart(2, '0')}`;
    return change >= 0 ? income(`c${i}`, 'card', `${month}-01`, change) : expense(`c${i}`, 'card', `${month}-01`, -change);
  });
}

function screen(
  input: {
    accounts: readonly Account[];
    transactions?: readonly Transaction[];
    today?: string;
    now?: Date;
    rates?: readonly StoredRate[];
    requestedHistory?: string;
    currentValues?: ReadonlyMap<string, CurrentValue>;
  },
  choices: Partial<ScreenChoices> = {},
) {
  const today = input.today ?? '2026-10-01';
  const now = input.now ?? OCT_1;
  const fixture = netWorthInputFrom({ ...input, today, now });
  return netWorthScreenModel({
    series: netWorthSeries(fixture),
    accounts: input.accounts,
    rates: input.rates ?? [],
    choices: { period: 12 as HistoryPeriod, view: 'bars' as HistoryView, forecast: false, ...choices },
    now,
    today,
  });
}

describe('«Статок» opens on the selected reading and month', () => {
  it('Scenario: The screen opens where the widget is', () => {
    const accounts = [uah('card', 0, '2025-06-01'), account({ id: 'usd', name: 'usd', kind: 'savings', currency: 'USD', openingDate: '2025-06-01' })];
    const model = screen({
      accounts,
      transactions: [income('a', 'card', '2025-06-02', 37500000), income('b', 'card', '2026-10-01', 2640800)],
      rates: [usdRate],
    });
    expect(model.choices.find((c) => c.selected)?.id).toBe(TOTAL_HISTORY);
    expect(model.card?.title).toBe('Статок на 1 жовтня');
    expect(model.card?.value).toBe(`≈401${T}408 грн`);
    expect(model.card?.changeText).toBe(`+≈26${T}408 грн · +7,0% ▲ · від 30 вересня`);
    expect(model.views.find((v) => v.selected)?.label).toBe('Стовпці');
    expect(model.periods.find((p) => p.selected)?.label).toBe('1 рік');
    expect(model.chart?.months.at(model.chart.selectedIndex)).toBe('2026-10');
    expect(model.chart?.values).toHaveLength(12);
  });
});

describe('Every month is named and its direction readable without colour', () => {
  const transactions = [
    income('base', 'card', '2026-05-02', 50000000),
    ...monthly('2026-06', [1500000, -5600000, 2000000, 3400000, 2600000]),
  ];

  it('Scenario: Up and down months read at a glance', () => {
    const model = screen({ accounts: [uah('card', 0, '2026-05-01')], transactions }, { view: 'change' });
    const chart = model.chart!;
    expect(chart.kind).toBe('change');
    expect(chart.values.slice(-5)).toEqual([1500000, -5600000, 2000000, 3400000, 2600000]);
    expect(chart.values.slice(-5).filter((v) => v! > 0)).toHaveLength(4);
    expect(chart.ticks.map((t) => t.text)).toEqual(['тра', 'чер', 'лип', 'сер', 'вер', 'жов']);
    expect(chart.monthLabels[2]).toContain('спад');
  });

  it('Scenario: An entry month is marked', () => {
    const model = screen(
      {
        accounts: [uah('card', 0, '2025-11-01'), uah('later', 4360237, '2026-01-14')],
        transactions: [income('i', 'card', '2026-01-05', 10000)],
      },
      { view: 'change' },
    );
    const january = model.chart!.months.indexOf('2026-01');
    // «card» opened at zero adds no step; only the later рахунок's month is marked.
    expect(model.chart!.entryIndexes).toEqual([january]);
    // Its «Зміна» bar is the зміна without those 43 602,37 грн.
    expect(model.chart!.values[january]).toBe(10000);
    expect(model.table.find((r) => r.month === '2026-01')?.note).toBe(`нові рахунки +43${T}602,37 UAH`);
  });

  it('Scenario: A month is read aloud', () => {
    const model = screen({ accounts: [uah('card', 0, '2026-05-01')], transactions }, { view: 'change' });
    const july = model.chart!.monthLabels[model.chart!.months.indexOf('2026-07')];
    expect(july).toBe(`липень, статок 459${T}000 гривень, зміна мінус 56${T}000 гривень, спад`);
  });
});

describe('Selecting a month explains its change', () => {
  it('Scenario: The owner sees why July fell', () => {
    const transactions = [
      income('base', 'card', '2026-06-02', 50000000),
      income('pay', 'card', '2026-07-05', 6000000),
      expense('spend', 'card', '2026-07-10', 11000000),
      correction('fix', 'card', '2026-07-20', -600000),
    ];
    const model = screen({ accounts: [uah('card', 0, '2026-06-01')], transactions }, { selectedMonth: '2026-07' });
    expect(model.card?.title).toBe('Статок на 31 липня');
    expect(model.card?.value).toBe(`444${T}000,00 UAH`);
    expect(model.card?.changeText).toBe(`−56${T}000,00 UAH · −11,2% ▼ · від 30 червня`);
    expect(model.card?.breakdownText).toBe(
      `дохід +60${T}000,00 UAH · витрати −110${T}000,00 UAH · коригування −6${T}000,00 UAH`,
    );
    expect(model.table.find((r) => r.selected)?.month).toBe('2026-07');
  });
});

describe('The period is summarised beneath the chart', () => {
  it('Scenario: The year at a glance', () => {
    const changes = [1000, 2000, -500, 3000, 1500, 500, 2500, -1000, 4000, 2000, 1000, 700];
    const model = screen({
      accounts: [uah('card', 100000, '2025-09-01')],
      transactions: monthly('2025-11', changes),
    });
    expect(model.summary?.period).toBe('листопад 2025 — 1 жовтня');
    expect(model.summary?.change).toBe(`Зміна за період: +167,00 UAH · +16,7%`);
    // 16 000 over the eleven complete months, halves away from zero.
    expect(model.summary?.average).toBe('Середня за місяць: +14,55 UAH (повних місяців: 11)');
    expect(model.summary?.best).toBe('Найкращий: липень +40,00 UAH');
    expect(model.summary?.worst).toBe('Найгірший: червень −10,00 UAH');
  });
});

describe('The month table reads every month', () => {
  it("Scenario: Rows read like Saldo's months", () => {
    const model = screen({ accounts: [uah('card', 100000, '2025-01-01')] }, { period: 6 });
    expect(model.table.map((r) => r.label)).toEqual([
      'жовтень (на 1 жовтня)',
      'вересень',
      'серпень',
      'липень',
      'червень',
      'травень',
    ]);
    expect(model.table[0]).toMatchObject({ value: `1${T}000,00 UAH`, change: '0,00 UAH · 0,0%' });
  });

  it("Scenario: The current month's row is the history point", () => {
    const model = screen({
      accounts: [uah('main', 34500000, '2026-01-01'), uah('fund', 5500000, '2026-01-01', 'investment')],
      currentValues: new Map([['fund', { amount: money(6000000, 'UAH'), asOf: '2026-09-21' }]]),
    });
    expect(model.card?.value).toBe(`405${T}000,00 UAH`);
    expect(model.card?.investmentLine).toBe(`інвестиції: +5${T}000,00 UAH понад вкладене, станом на 21 вересня`);
    expect(model.chart?.values.at(-1)).toBe(40000000);
    expect(model.table[0]!.value).toBe(`400${T}000,00 UAH`);
  });

  it('Scenario: An unrepresentable month says why', () => {
    const half = 2 ** 52;
    const model = screen({
      accounts: [uah('a', half, '2026-06-01'), uah('b', half, '2026-08-15')],
      transactions: [expense('down', 'b', '2026-09-10', 1000)],
    });
    const august = model.table.find((r) => r.month === '2026-08')!;
    expect(august.value).toBe(OVERFLOW_REASON);
    expect(august.label).toBe('серпень');
    expect(model.table.find((r) => r.month === '2026-07')!.value).not.toBe(OVERFLOW_REASON);
    expect(model.table.find((r) => r.month === '2026-09')!.value).not.toBe(OVERFLOW_REASON);
  });
});

describe('«Прогноз» is off until asked and visibly not history', () => {
  const steady = {
    accounts: [uah('card', 1000000, '2025-12-01')],
    transactions: monthly('2026-01', [10000, 12000, 14000, 16000, 18000, 20000, 15000, 15000, 0, 0]),
  };

  it('Scenario: The owner asks where the trend leads', () => {
    const off = screen(steady, { view: 'line' });
    const on = screen(steady, { view: 'line', forecast: true });
    expect(off.forecastSwitch).toEqual({ on: false });
    expect(off.chart?.forecast).toBeUndefined();
    expect(on.chart?.forecast?.values).toHaveLength(6);
    expect(on.chart?.accessibilityLabel).toContain('прогноз');
    expect(off.chart?.accessibilityLabel).not.toContain('прогноз');
    expect(on.forecastCaption).toMatch(/^≈ якщо темп збережеться: \+\d.* на місяць, медіана останніх 6 місяців\./);
    // The recorded line, the summary and the table are unchanged.
    expect(on.chart?.values).toEqual(off.chart?.values);
    expect(on.summary).toEqual(off.summary);
    expect(on.table).toEqual(off.table);
  });

  it('Scenario: «Зміна» offers no forecast', () => {
    const change = screen(steady, { view: 'change', forecast: true });
    expect(change.forecastSwitch).toBeUndefined();
    expect(change.chart?.forecast).toBeUndefined();
    expect(screen(steady, { view: 'line', forecast: true }).chart?.forecast).toBeDefined();
  });

  it('withholds the forecast with too little history and says why', () => {
    const short = screen({ accounts: [uah('card', 1000, '2026-07-01')] }, { forecast: true });
    expect(short.chart?.forecast).toBeUndefined();
    expect(short.forecastWithheld).toBe('Прогноз недоступний: потрібно 6 повних місяців.');
  });
});

describe('The account explanation and the month table say only what holds', () => {
  it('Scenario: A card is not «вкладено»', () => {
    const model = screen({
      accounts: [
        uah('mono black', 1000, '2026-01-01'),
        uah('інжур', 2000, '2026-01-01', 'investment'),
        account({ id: 'облігація $', name: 'облігація $', kind: 'investment', currency: 'USD', openingBalance: money(500, 'USD'), openingDate: '2026-01-01' }),
      ],
      currentValues: new Map([['облігація $', { amount: money(600, 'USD'), asOf: '2026-09-21' }]]),
      rates: [usdRate],
    });
    const basis = new Map(model.explanation.lines.map((l) => [l.name, l.basis]));
    expect(basis.get('mono black')).toBe('');
    expect(basis.get('інжур')).toBe('вкладено');
    expect(basis.get('облігація $')).toBe('поточна вартість на 21 вересня');
    expect(model.explanation.caption).toContain('≈ за поточним курсом, не за курсом на дату');
    expect(model.explanation.rateFreshness).toBe('курс станом на 30 вересня');
  });

  it('Scenario: The percent reads as Ukrainian', () => {
    const model = screen({
      accounts: [uah('card', 11543300, '2026-08-01')],
      transactions: [income('i', 'card', '2026-10-01', 7202807)],
    });
    expect(model.card?.changeText).toBe(`+72${T}028,07 UAH · +62,4% ▲ · від 30 вересня`);
  });

  it('Scenario: A missing rate is named', () => {
    const accounts = [uah('card', 1000, '2026-08-01'), account({ id: 'eur', name: 'eur', kind: 'cash', currency: 'EUR', openingBalance: money(300, 'EUR'), openingDate: '2026-08-01' })];
    const total = screen({ accounts, requestedHistory: TOTAL_HISTORY });
    expect(total.withheldMessage).toBe('Немає курсу EUR для сукупної історії.');
    expect(total.chart).toBeUndefined();
    expect(total.summary).toBeUndefined();
    expect(total.table).toEqual([]);
    expect(total.choices.map((c) => c.id)).toEqual(['UAH', 'EUR', TOTAL_HISTORY]);
    expect(screen({ accounts, requestedHistory: 'EUR' }).table.length).toBeGreaterThan(0);
    expect(screen({ accounts, requestedHistory: 'UAH' }).table.length).toBeGreaterThan(0);
  });
});

describe('History is readable without colour', () => {
  it('Scenario: Point values remain exact', () => {
    // 120 months of UAH and USD, one USD month-end not representable.
    const half = 2 ** 52;
    const model = screen(
      {
        accounts: [
          uah('card', 100000, '2016-11-01'),
          account({ id: 'usd-a', name: 'a', kind: 'savings', currency: 'USD', openingBalance: money(half, 'USD'), openingDate: '2016-11-01' }),
          account({ id: 'usd-b', name: 'b', kind: 'savings', currency: 'USD', openingBalance: money(half, 'USD'), openingDate: '2026-05-10' }),
        ],
        transactions: [expenseByDefault({ id: 'e', date: '2026-06-03', accountId: 'usd-b', amount: money(1000, 'USD'), categoryId: 'food' })],
        requestedHistory: 'USD',
      },
      { period: 'all' },
    );
    expect(model.table).toHaveLength(120);
    expect(model.chart?.accessibilityLabel).toContain('шкала в USD');
    const may = model.table.find((r) => r.month === '2026-05')!;
    expect(may.value).toBe(OVERFLOW_REASON);
    expect(may.accessibilityLabel).toMatch(new RegExp(`^травень, статок: ${OVERFLOW_REASON}`));
    expect(model.table.find((r) => r.month === '2026-06')!.value).toBe(`90${T}071${T}992${T}547${T}399,92 USD`);
    // No line bridges an unknown month: the chart has no value there.
    expect(model.chart!.values[model.chart!.months.indexOf('2026-05')]).toBeUndefined();
  });
});

describe('the «Усе» period on a long history', () => {
  it('plots at most 120 months, the newest, while the table lists every one', () => {
    const model = screen({ accounts: [uah('card', 1000, '2015-08-01')] }, { period: 'all' });
    expect(model.table).toHaveLength(135);
    expect(model.chart?.values).toHaveLength(120);
    expect(model.chart?.months.at(-1)).toBe('2026-10');
    expect(model.chart?.months[model.chart.selectedIndex]).toBe('2026-10');
  });
});

describe('The widget opens the screen and nothing requests anything', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

  it('Scenario: Tapping opens the screen', () => {
    // The widget is one button; Головний pushes «Статок», which reads the same shared selection.
    expect(read('components/net-worth-widget.tsx')).toMatch(/<Tap onPress=\{onOpen\} accessibilityRole="button"/);
    expect(read('app/(tabs)/index.tsx')).toContain("onOpen={() => router.push('/net-worth')}");
    expect(read('app/net-worth.tsx')).toContain('useNetWorthSelection()');
  });

  it('Scenario: Offline graphs need no request', () => {
    // Neither the screen nor what it draws with reaches the network or a rate refresh; only the
    // pre-existing shared policies on Головний can.
    for (const path of ['app/net-worth.tsx', 'components/net-worth-widget.tsx', 'components/net-worth-chart.tsx', 'ui/net-worth.ts', 'ui/net-worth-screen.ts']) {
      const source = read(path);
      expect(source).not.toMatch(/fetch\(|use-current-rates|@\/monobank|startSync/);
    }
  });
});
