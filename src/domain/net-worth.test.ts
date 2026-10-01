import { describe, expect, it } from 'vitest';

import { account, computeBalances, type Account } from './account';
import type { CurrentValue } from './investments';
import { money } from './money';
import {
  currentNetWorth,
  entryDate,
  forecast,
  investmentDifference,
  monthFigures,
  netWorthHistory,
  periodSummary,
  type MonthSeries,
  type AccountHistoryInput,
  type CurrencyTotal,
  type NetWorthReading,
} from './net-worth';
import { expenseByDefault, transfer, type Income, type Transaction } from './transaction';

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(200000, 'UAH'),
});

const bonds = account({
  id: 'bonds',
  name: 'military bonds',
  kind: 'investment',
  currency: 'UAH',
  openingBalance: money(100000, 'UAH'),
});

const archivedJar = account({
  id: 'old-jar',
  name: 'стара банка',
  kind: 'savings',
  currency: 'UAH',
  openingBalance: money(50000, 'UAH'),
  archived: true,
});

const debtor = account({
  id: 'debtor',
  name: 'борг: Петро',
  kind: 'debt',
  currency: 'UAH',
});

function ready(reading: NetWorthReading) {
  if (reading.status !== 'ready') {
    throw new Error(`expected a ready reading, got ${reading.status}`);
  }
  return reading;
}

describe('currentNetWorth', () => {
  it('Scenario: No accounts is empty, not a zeroed total', () => {
    expect(currentNetWorth({ accounts: [], transactions: [], currentValues: new Map() })).toEqual({
      status: 'empty',
    });
  });

  it('Scenario: All currencies stay exact and distinct', () => {
    const usd = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD', openingBalance: money(20000, 'USD') });
    const eur = account({ id: 'eur', name: 'євро', kind: 'savings', currency: 'EUR', openingBalance: money(30000, 'EUR') });
    const reading = ready(
      currentNetWorth({ accounts: [card, usd, eur], transactions: [], currentValues: new Map() }),
    );
    expect(reading.totals.get('UAH')).toEqual({ status: 'known', amount: money(200000, 'UAH') });
    expect(reading.totals.get('USD')).toEqual({ status: 'known', amount: money(20000, 'USD') });
    expect(reading.totals.get('EUR')).toEqual({ status: 'known', amount: money(30000, 'EUR') });
  });

  it('Scenario: Contributions replace rather than duplicate investments', () => {
    // вкладено 100000, поточна вартість 150000 — Статок counts 150000, not 250000, and the
    // investment's own computed balance (вкладено) is unaffected.
    const currentValues = new Map<string, CurrentValue>([
      ['bonds', { amount: money(150000, 'UAH'), asOf: '2026-06-01' }],
    ]);
    const reading = ready(
      currentNetWorth({ accounts: [card, bonds], transactions: [], currentValues }),
    );
    expect(reading.totals.get('UAH')).toEqual({ status: 'known', amount: money(350000, 'UAH') });
    const bondsContribution = reading.contributions.find((c) => c.accountId === 'bonds');
    expect(bondsContribution).toEqual({
      accountId: 'bonds',
      currency: 'UAH',
      amount: money(150000, 'UAH'),
      basis: 'currentValue',
      asOf: '2026-06-01',
      ledger: money(100000, 'UAH'),
    });
  });

  it('Scenario: Zero observation is not absence', () => {
    const zeroValue = new Map<string, CurrentValue>([
      ['bonds', { amount: money(0, 'UAH'), asOf: '2026-06-01' }],
    ]);
    const withZero = ready(currentNetWorth({ accounts: [bonds], transactions: [], currentValues: zeroValue }));
    const bondsWithZero = withZero.contributions.find((c) => c.accountId === 'bonds');
    expect(bondsWithZero?.amount).toEqual(money(0, 'UAH'));
    expect(bondsWithZero?.basis).toBe('currentValue');

    // Cleared — the map has no entry at all — falls back to вкладено (100000, the opening
    // balance with no transactions).
    const cleared = ready(currentNetWorth({ accounts: [bonds], transactions: [], currentValues: new Map() }));
    const bondsCleared = cleared.contributions.find((c) => c.accountId === 'bonds');
    expect(bondsCleared?.amount).toEqual(money(100000, 'UAH'));
    expect(bondsCleared?.basis).toBe('ledger');
  });

  it('Scenario: Archiving moves no wealth', () => {
    const reading = ready(
      currentNetWorth({ accounts: [card, archivedJar], transactions: [], currentValues: new Map() }),
    );
    expect(reading.totals.get('UAH')).toEqual({ status: 'known', amount: money(250000, 'UAH') });
    expect(reading.contributions.map((c) => c.accountId).sort()).toEqual(['card', 'old-jar']);
  });

  it('Scenario: Debt is a receivable', () => {
    // A card holds 100000, a person owes 50000 — Статок is 150000.
    const cardOf100k = account({ ...card, openingBalance: money(100000, 'UAH') });
    const debtorOwed = account({ ...debtor, openingBalance: money(50000, 'UAH') });
    const reading = ready(
      currentNetWorth({ accounts: [cardOf100k, debtorOwed], transactions: [], currentValues: new Map() }),
    );
    expect(reading.totals.get('UAH')).toEqual({ status: 'known', amount: money(150000, 'UAH') });
  });

  it('Scenario: Negative debt and card balance keep their signs', () => {
    const positive = account({ id: 'p', name: 'p', kind: 'spending', currency: 'UAH', openingBalance: money(100000, 'UAH') });
    const negativeCard = account({ id: 'n1', name: 'n1', kind: 'spending', currency: 'UAH', openingBalance: money(-5000, 'UAH') });
    const negativeDebt = account({ id: 'n2', name: 'n2', kind: 'debt', currency: 'UAH', openingBalance: money(-2000, 'UAH') });
    const reading = ready(
      currentNetWorth({
        accounts: [positive, negativeCard, negativeDebt],
        transactions: [],
        currentValues: new Map(),
      }),
    );
    expect(reading.totals.get('UAH')).toEqual({ status: 'known', amount: money(93000, 'UAH') });
  });

  it('reads the same with precomputed balances as from the whole history', () => {
    const cardOf150k = account({ ...card, openingBalance: money(150000, 'UAH') });
    const debtor = account({ id: 'debtor3', name: 'debtor3', kind: 'debt', currency: 'UAH' });
    const usd = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });
    const accounts = [cardOf150k, debtor, usd];
    const transactions = [
      transfer({ id: 'lend', date: '2026-01-01', fromAccountId: 'card', toAccountId: 'debtor3', left: money(50000, 'UAH'), arrived: money(50000, 'UAH') }),
      transfer({ id: 'fx', date: '2026-01-02', fromAccountId: 'card', toAccountId: 'usd', left: money(41000, 'UAH'), arrived: money(1000, 'USD') }),
    ];
    const balances = computeBalances(accounts, transactions);

    expect(currentNetWorth({ accounts, transactions, currentValues: new Map(), balances })).toEqual(
      currentNetWorth({ accounts, transactions, currentValues: new Map() }),
    );
  });

  it('Scenario: Lending principal is a move and interest is income', () => {
    const cardOf150k = account({ ...card, openingBalance: money(150000, 'UAH') });
    const zeroDebt = account({ id: 'debtor2', name: 'debtor2', kind: 'debt', currency: 'UAH' });
    const accounts = [cardOf150k, zeroDebt];

    const lent = transfer({
      id: 'lend',
      date: '2026-01-01',
      fromAccountId: 'card',
      toAccountId: 'debtor2',
      left: money(50000, 'UAH'),
      arrived: money(50000, 'UAH'),
    });
    const stillLent = ready(currentNetWorth({ accounts, transactions: [lent], currentValues: new Map() }));
    expect(stillLent.totals.get('UAH')).toEqual({ status: 'known', amount: money(150000, 'UAH') });

    const principal = transfer({
      id: 'repay',
      date: '2026-02-01',
      fromAccountId: 'debtor2',
      toAccountId: 'card',
      left: money(50000, 'UAH'),
      arrived: money(50000, 'UAH'),
    });
    const interest: Income = {
      type: 'income',
      id: 'interest',
      date: '2026-02-01',
      accountId: 'card',
      amount: money(5000, 'UAH'),
      sourceId: 'interest',
    };
    const repaid = ready(
      currentNetWorth({ accounts, transactions: [lent, principal, interest], currentValues: new Map() }),
    );
    expect(repaid.totals.get('UAH')).toEqual({ status: 'known', amount: money(155000, 'UAH') });
  });

  it('Scenario: Overflow yields an unavailable total, never an unsafe integer', () => {
    const huge1 = account({
      id: 'huge1',
      name: 'huge1',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(Number.MAX_SAFE_INTEGER - 1, 'UAH'),
    });
    const huge2 = account({
      id: 'huge2',
      name: 'huge2',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(Number.MAX_SAFE_INTEGER - 1, 'UAH'),
    });
    const reading = ready(
      currentNetWorth({ accounts: [huge1, huge2], transactions: [], currentValues: new Map() }),
    );
    expect(reading.totals.get('UAH')).toEqual({ status: 'unavailable', reason: 'overflow' });
    // Per-account contributions remain exact even though the combined total is not.
    expect(reading.contributions.find((c) => c.accountId === 'huge1')?.amount.amount).toBe(
      Number.MAX_SAFE_INTEGER - 1,
    );
  });

  it('Scenario: Every account is represented, including a known zero balance', () => {
    const zeroAccount = account({ id: 'z', name: 'z', kind: 'spending', currency: 'UAH' });
    const reading = ready(
      currentNetWorth({ accounts: [zeroAccount], transactions: [], currentValues: new Map() }),
    );
    expect(reading.contributions).toEqual([
      { accountId: 'z', currency: 'UAH', amount: money(0, 'UAH'), basis: 'ledger' },
    ]);
    expect(reading.totals.get('UAH')).toEqual({ status: 'known', amount: money(0, 'UAH') });
  });

  it('An expense still reduces the reading like any other computed balance', () => {
    const spent: Transaction = expenseByDefault({
      id: 'e1',
      date: '2026-03-10',
      accountId: 'card',
      amount: money(30000, 'UAH'),
      categoryId: 'food',
    });
    const reading = ready(currentNetWorth({ accounts: [card], transactions: [spent], currentValues: new Map() }));
    expect(reading.totals.get('UAH')).toEqual({ status: 'known', amount: money(170000, 'UAH') });
  });
});

const known = (amountMinor: number, currency = 'UAH'): CurrencyTotal => ({
  status: 'known',
  amount: money(amountMinor, currency),
});

function zeroOpening(id: string, currency = 'UAH'): Account {
  return account({ id, name: id, kind: 'spending', currency });
}

function nonzeroOpening(id: string, amountMinor: number, currency = 'UAH'): Account {
  return account({ id, name: id, kind: 'spending', currency, openingBalance: money(amountMinor, currency) });
}

function historyInput(
  acc: Account,
  data: { firstDate?: string; firstDateNet?: number; monthlyNet?: Record<string, number> } = {},
): AccountHistoryInput {
  return {
    account: acc,
    firstDate: data.firstDate,
    firstDateNet: data.firstDateNet,
    monthlyNet: new Map(Object.entries(data.monthlyNet ?? {})),
  };
}

function totalOf(points: readonly ReturnType<typeof netWorthHistory>[number][], date: string) {
  const point = points.find((p) => p.date === date);
  return point?.totals.get('UAH');
}

describe('netWorthHistory', () => {
  it('Scenario: No history or one date — no рахунок at all draws no history', () => {
    expect(netWorthHistory({ accounts: [], today: '2026-09-19' })).toEqual([]);
  });

  it('Scenario: No history or one date — every entry falls on today', () => {
    // Created today, and one with no дата and no транзакція at all: both enter today.
    const createdToday = account({ ...zeroOpening('new'), openingDate: '2026-09-19' });
    const undated = nonzeroOpening('cash', 2022, 'EUR');
    const points = netWorthHistory({
      accounts: [historyInput(createdToday), historyInput(undated)],
      today: '2026-09-19',
    });
    expect(points.map((p) => p.date)).toEqual(['2026-09-19']);
    expect(points[0]!.totals.get('EUR')).toEqual(known(2022, 'EUR'));
  });

  it('Scenario: The first date does not absorb its whole month', () => {
    const card = zeroOpening('card');
    const points = netWorthHistory({
      accounts: [
        historyInput(card, {
          firstDate: '2026-06-05',
          firstDateNet: 10000,
          monthlyNet: { '2026-06': 8000 },
        }),
      ],
      today: '2026-09-19',
    });
    expect(totalOf(points, '2026-06-05')).toEqual({ status: 'known', amount: money(10000, 'UAH') });
    expect(totalOf(points, '2026-06-30')).toEqual({ status: 'known', amount: money(8000, 'UAH') });
  });

  it('Scenario: A later рахунок does not hide earlier history', () => {
    const early = zeroOpening('black');
    const later = nonzeroOpening('later', 80316);
    const points = netWorthHistory({
      accounts: [
        historyInput(early, {
          firstDate: '2024-10-28',
          firstDateNet: 500000,
          monthlyNet: { '2024-10': 500000, '2026-02': 1000 },
        }),
        historyInput(later, {
          firstDate: '2026-02-27',
          firstDateNet: -300,
          monthlyNet: { '2026-02': -300, '2026-03': 200 },
        }),
      ],
      today: '2026-03-15',
    });
    expect(points[0]!.date).toBe('2024-10-28');
    for (const point of points) {
      expect(point.totals.get('UAH')!.status).toBe('known');
    }
    expect(totalOf(points, '2024-10-28')).toEqual(known(500000));
    // Before its first транзакція the later рахунок contributes nothing…
    expect(totalOf(points, '2026-01-31')).toEqual(known(500000));
    // …and from then on its початковий залишок plus its транзакції.
    expect(totalOf(points, '2026-02-28')).toEqual(known(500000 + 1000 + 80316 - 300));
    expect(totalOf(points, '2026-03-15')).toEqual(known(500000 + 1000 + 80316 - 300 + 200));
  });

  it('Scenario: An earlier first транзакція wins over the recorded дата', () => {
    const cash = account({ ...nonzeroOpening('cash', 30000, 'EUR'), openingDate: '2026-06-08' });
    const input = historyInput(cash, { firstDate: '2026-06-07', firstDateNet: -500, monthlyNet: { '2026-06': -500 } });
    expect(entryDate(input, '2026-09-19')).toBe('2026-06-07');
    const points = netWorthHistory({ accounts: [input], today: '2026-09-19' });
    expect(points[0]!.date).toBe('2026-06-07');
    expect(points[0]!.totals.get('EUR')).toEqual(known(29500, 'EUR'));
  });

  it('Scenario: A рахунок with neither enters today', () => {
    const uah = zeroOpening('card');
    const eur = nonzeroOpening('cash', 2022, 'EUR');
    const input = historyInput(eur);
    expect(entryDate(input, '2026-09-19')).toBe('2026-09-19');
    const points = netWorthHistory({
      accounts: [historyInput(uah, { firstDate: '2026-06-05', firstDateNet: 100, monthlyNet: { '2026-06': 100 } }), input],
      today: '2026-09-19',
    });
    for (const point of points.slice(0, -1)) {
      expect(point.totals.get('EUR')).toEqual(known(0, 'EUR'));
    }
    expect(points.at(-1)!.totals.get('EUR')).toEqual(known(2022, 'EUR'));
  });

  it('a recorded дата after today counts as today', () => {
    const odd = account({ ...nonzeroOpening('odd', 700), openingDate: '2026-12-01' });
    expect(entryDate(historyInput(odd), '2026-09-19')).toBe('2026-09-19');
  });

  it('Scenario: A zero opening adds no step', () => {
    const zero = zeroOpening('z');
    const other = zeroOpening('other');
    const inputs = [
      historyInput(other, { firstDate: '2026-01-10', firstDateNet: 1000, monthlyNet: { '2026-01': 1000 } }),
      historyInput(zero, { firstDate: '2026-03-04', firstDateNet: 700, monthlyNet: { '2026-03': 700 } }),
    ];
    const march = monthFigures({ accounts: inputs, today: '2026-03-20' }).get('UAH')!.at(-1)!;
    expect(march.month).toBe('2026-03');
    expect(march.entered).toBe(0);
    // Its транзакції count as ordinary movement.
    expect(march.change).toEqual({ status: 'available', absolute: 700, percent: 70 });
  });

  it('Scenario: An opening dated before any транзакція starts the history', () => {
    const black = account({ ...nonzeroOpening('black', 12300), openingDate: '2024-10-27' });
    const points = netWorthHistory({
      accounts: [historyInput(black, { firstDate: '2024-10-28', firstDateNet: 5000, monthlyNet: { '2024-10': 5000 } })],
      today: '2024-11-15',
    });
    expect(points.map((p) => p.date)).toEqual(['2024-10-27', '2024-10-31', '2024-11-15']);
    expect(points[0]!.totals.get('UAH')).toEqual(known(12300));
    expect(points[1]!.totals.get('UAH')).toEqual(known(17300));
  });

  it('Scenario: Empty months carry balances', () => {
    const card = zeroOpening('card');
    const points = netWorthHistory({
      accounts: [
        historyInput(card, {
          firstDate: '2026-06-05',
          firstDateNet: 10000,
          monthlyNet: { '2026-06': 10000, '2026-08': 5000 }, // no entry for July
        }),
      ],
      today: '2026-09-19',
    });
    const months = points.map((p) => p.date);
    expect(months).toEqual(['2026-06-05', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-19']);
    expect(totalOf(points, '2026-07-31')).toEqual({ status: 'known', amount: money(10000, 'UAH') });
    expect(totalOf(points, '2026-08-31')).toEqual({ status: 'known', amount: money(15000, 'UAH') });
  });

  it('Scenario: Future dates do not extend the curve', () => {
    const card = zeroOpening('card');
    // Movement data as net-worth-repo itself would already bound it: nothing dated after today.
    const points = netWorthHistory({
      accounts: [
        historyInput(card, { firstDate: '2026-06-05', firstDateNet: 10000, monthlyNet: { '2026-06': 10000 } }),
      ],
      today: '2026-09-19',
    });
    expect(points.at(-1)!.date).toBe('2026-09-19');
    expect(points.some((p) => p.date > '2026-09-19')).toBe(false);
  });

  it('Scenario: Reconstructing is not an immutable audit log — recomputing changes only what actually changed', () => {
    const card = zeroOpening('card');
    const read = (monthlyNet: Record<string, number>, opening?: { amount: number; date: string }) =>
      netWorthHistory({
        accounts: [
          historyInput(
            opening
              ? account({ ...card, openingBalance: money(opening.amount, 'UAH'), openingDate: opening.date })
              : card,
            { firstDate: '2026-06-05', firstDateNet: 10000, monthlyNet },
          ),
        ],
        today: '2026-09-19',
      });
    const before = read({ '2026-06': 10000, '2026-08': 5000 });
    // A later backdated edit changes August's net; June's point must not move.
    const after = read({ '2026-06': 10000, '2026-08': 9000 });
    expect(totalOf(before, '2026-06-30')).toEqual(totalOf(after, '2026-06-30'));
    expect(totalOf(before, '2026-08-31')).not.toEqual(totalOf(after, '2026-08-31'));
    // An opening and its дата corrected: the history now starts there and every point moves by it.
    const dated = read({ '2026-06': 10000, '2026-08': 5000 }, { amount: 3000, date: '2026-05-20' });
    expect(dated[0]!.date).toBe('2026-05-20');
    expect(totalOf(dated, '2026-08-31')).toEqual(known(18000));
  });

  it("Scenario: Today's valuation never changes past points — history has no currentValues input at all", () => {
    // An investment account's history uses only its ledger (вкладено), never a поточна вартість —
    // there is no parameter here through which one could reach it, by construction.
    const bonds = account({
      id: 'bonds',
      name: 'bonds',
      kind: 'investment',
      currency: 'UAH',
      openingBalance: money(0, 'UAH'),
    });
    const points = netWorthHistory({
      accounts: [
        historyInput(bonds, { firstDate: '2026-08-01', firstDateNet: 100000, monthlyNet: { '2026-08': 100000 } }),
      ],
      today: '2026-09-19',
    });
    // Whatever the account is "worth" today, August's reconstructed point is вкладено alone.
    expect(totalOf(points, '2026-08-31')).toEqual({ status: 'known', amount: money(100000, 'UAH') });
  });
});

/** The current month's figure of a UAH card at `august` on Aug 31 and `today` on Sep 19. */
function septemberOf(august: number, today: number, extra: AccountHistoryInput[] = []) {
  const card = nonzeroOpening('card', august);
  const inputs = [
    historyInput(account({ ...card, openingDate: '2026-08-01' }), {
      firstDate: '2026-09-10',
      firstDateNet: today - august,
      monthlyNet: { '2026-09': today - august },
    }),
    ...extra,
  ];
  return monthFigures({ accounts: inputs, today: '2026-09-19' }).get('UAH')!.at(-1)!;
}

describe('the change: today against the preceding month-end', () => {
  it('Scenario: Positive comparable baseline', () => {
    const september = septemberOf(100000, 120000);
    expect(september.date).toBe('2026-09-19');
    expect(september.change).toEqual({ status: 'available', absolute: 20000, percent: 20 });
  });

  it('Scenario: Zero or negative denominator', () => {
    expect(septemberOf(0, 20000).change).toEqual({ status: 'available', absolute: 20000 });
    expect(septemberOf(-10000, 20000).change).toEqual({ status: 'available', absolute: 30000 });
  });

  it('Scenario: An entered поточна вартість does not withhold the change', () => {
    // вкладено 100000, поточна вартість 150000: the current Статок counts 150000; the change reads
    // the recorded-balance points alone, which no поточна вартість can reach.
    const bondsAt = account({ ...bonds, openingBalance: money(100000, 'UAH') });
    const reading = ready(
      currentNetWorth({
        accounts: [bondsAt],
        transactions: [],
        currentValues: new Map([['bonds', { amount: money(150000, 'UAH'), asOf: '2026-09-10' }]]),
      }),
    );
    expect(reading.totals.get('UAH')).toEqual(known(150000));
    expect(septemberOf(300000, 320000).change).toEqual({ status: 'available', absolute: 20000, percent: 6.7 });
  });

  it('Scenario: A new рахунок is not growth', () => {
    const fresh = account({ ...nonzeroOpening('fresh', 50000), openingDate: '2026-09-05' });
    const september = septemberOf(100000, 110000, [historyInput(fresh)]);
    expect(september.end).toBe(160000);
    expect(september.entered).toBe(50000);
    expect(september.change).toEqual({ status: 'available', absolute: 10000, percent: 10 });
  });

  it('Scenario: A future-dated record does not enter the change', () => {
    // The repository bounds every movement to today: the stored expense dated after today is not
    // in `monthlyNet` at all, so today's point — and the change — are without it, while the
    // current Статок over every stored транзакція counts it (and the screens disclose it).
    expect(septemberOf(100000, 120000).change).toMatchObject({ status: 'available', absolute: 20000 });
    const card = zeroOpening('card');
    const future = expenseByDefault({ id: 'f', date: '2026-10-02', accountId: 'card', amount: money(5000, 'UAH'), categoryId: 'food' });
    const all = [{ type: 'income', id: 'i', date: '2026-08-01', accountId: 'card', amount: money(120000, 'UAH'), sourceId: 's' } as Income, future];
    expect(ready(currentNetWorth({ accounts: [card], transactions: all, currentValues: new Map() })).totals.get('UAH')).toEqual(known(115000));
  });

  it('Scenario: No matching baseline means no change — an unrepresentable month-end', () => {
    const half = 2 ** 52;
    const figures = monthFigures({
      accounts: [
        historyInput(account({ ...nonzeroOpening('a', half), openingDate: '2026-07-01' })),
        historyInput(account({ ...nonzeroOpening('b', half), openingDate: '2026-08-15' }), {
          firstDate: '2026-09-02',
          firstDateNet: -1000,
          monthlyNet: { '2026-09': -1000 },
        }),
      ],
      today: '2026-09-19',
    }).get('UAH')!;
    expect(figures.find((m) => m.month === '2026-08')!.end).toBeUndefined();
    // No older period is substituted: September has no change at all.
    expect(figures.at(-1)!.change).toEqual({ status: 'unavailable', reason: 'overflow' });
  });

  it('Scenario: No matching baseline means no change — the earliest entry is this month', () => {
    const card = zeroOpening('card');
    const september = monthFigures({
      accounts: [historyInput(card, { firstDate: '2026-09-03', firstDateNet: 100, monthlyNet: { '2026-09': 100 } })],
      today: '2026-09-19',
    }).get('UAH')!;
    expect(september).toHaveLength(1);
    expect(september[0]!.change).toEqual({ status: 'unavailable', reason: 'no-baseline' });
  });
});

/** A рахунок's month as the repository reads it: the net and its split by kind, which add up. */
function monthOfKinds(kinds: { income?: number; spending?: number; correction?: number; transfer?: number }) {
  const net = (kinds.income ?? 0) + (kinds.spending ?? 0) + (kinds.correction ?? 0) + (kinds.transfer ?? 0);
  return { net, kinds };
}

function kindedInput(
  acc: Account,
  firstDate: string,
  months: Record<string, ReturnType<typeof monthOfKinds>>,
): AccountHistoryInput {
  return {
    account: acc,
    firstDate,
    firstDateNet: 0,
    monthlyNet: new Map(Object.entries(months).map(([m, v]) => [m, v.net])),
    monthlyByKind: new Map(Object.entries(months).map(([m, v]) => [m, v.kinds])),
  };
}

describe('the розбивка of a month', () => {
  it('Scenario: Flows and corrections explain the month', () => {
    const card = nonzeroOpening('card', 100000);
    const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
    const petro = account({ id: 'petro', name: 'Петро', kind: 'debt', currency: 'UAH' });
    const figures = monthFigures({
      accounts: [
        kindedInput(card, '2026-08-01', {
          '2026-08': monthOfKinds({ income: 1000 }),
          // дохід 60000, витрати 30000 less повернення 2000, коригування −500, two перекази out.
          '2026-09': monthOfKinds({ income: 60000, spending: -28000, correction: -500, transfer: -15000 }),
        }),
        kindedInput(jar, '2026-09-10', { '2026-09': monthOfKinds({ transfer: 10000 }) }),
        kindedInput(petro, '2026-09-12', { '2026-09': monthOfKinds({ transfer: 5000 }) }),
      ],
      today: '2026-09-30',
    }).get('UAH')!;
    const september = figures.at(-1)!;
    expect(september.breakdown).toEqual({ income: 60000, spending: -28000, correction: -500, transfer: 0, entered: 0 });
    expect(september.change).toMatchObject({ status: 'available', absolute: 31500 });
  });

  it('Scenario: An exchange moves money between currencies', () => {
    const card = nonzeroOpening('card', 500000);
    const usd = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });
    const figures = monthFigures({
      accounts: [
        kindedInput(card, '2026-08-01', { '2026-08': monthOfKinds({}), '2026-09': monthOfKinds({ transfer: -410000 }) }),
        kindedInput(usd, '2026-09-05', { '2026-09': monthOfKinds({ transfer: 10000 }) }),
      ],
      today: '2026-09-30',
    });
    expect(figures.get('UAH')!.at(-1)!.breakdown.transfer).toBe(-410000);
    expect(figures.get('USD')!.at(-1)!.breakdown.transfer).toBe(10000);
  });

  it('Scenario: A new рахунок is its own line', () => {
    const card = nonzeroOpening('card', 100000);
    const fresh = account({ ...nonzeroOpening('fresh', 50000), openingDate: '2026-09-05' });
    const september = monthFigures({
      accounts: [
        kindedInput(card, '2026-08-01', { '2026-08': monthOfKinds({}), '2026-09': monthOfKinds({ income: 7000 }) }),
        { account: fresh, monthlyNet: new Map() },
      ],
      today: '2026-09-30',
    }).get('UAH')!.at(-1)!;
    expect(september.breakdown.entered).toBe(50000);
    expect(september.change).toMatchObject({ status: 'available', absolute: 7000 });
  });

  it('Scenario: A history starting mid-month has no first зміна', () => {
    const black = account({ ...nonzeroOpening('black', 12300), openingDate: '2024-10-28' });
    const figures = monthFigures({
      accounts: [
        kindedInput(black, '2024-10-29', {
          '2024-10': monthOfKinds({ income: 5000 }),
          '2024-11': monthOfKinds({ income: 1000 }),
        }),
      ],
      today: '2024-11-30',
    }).get('UAH')!;
    const [october, november] = figures;
    expect(october!.change).toEqual({ status: 'unavailable', reason: 'no-baseline' });
    expect(october!.breakdown).toEqual({ income: 5000, spending: 0, correction: 0, transfer: 0, entered: 12300 });
    expect(october!.end).toBe(17300);
    expect(november!.change).toEqual({ status: 'available', absolute: 1000, percent: 5.8 });
    // October is not a complete month: it counts toward no summary.
    expect(periodSummary(figures, 'all')).toMatchObject({ completeMonths: 0 });
  });

  it('adds up exactly to the month\'s difference, month after month', () => {
    const accounts = [
      kindedInput(account({ ...nonzeroOpening('a', 1234), openingDate: '2026-01-03' }), '2026-01-09', {
        '2026-01': monthOfKinds({ income: 900, spending: -300 }),
        '2026-03': monthOfKinds({ correction: 77, transfer: -400 }),
      }),
      kindedInput(nonzeroOpening('b', 5000), '2026-02-14', {
        '2026-02': monthOfKinds({ spending: -10 }),
        '2026-03': monthOfKinds({ transfer: 400 }),
      }),
    ];
    const figures = monthFigures({ accounts, today: '2026-04-10' }).get('UAH')!;
    let previous = 0;
    for (const f of figures) {
      const b = f.breakdown;
      expect(b.income + b.spending + b.correction + b.transfer + b.entered).toBe(f.end! - previous);
      previous = f.end!;
    }
  });
});

/** A series of month-ends from `first`, starting at `start` and moving by each `changes[i]`. */
function series(first: string, start: number, changes: readonly number[]): MonthSeries {
  const [y, m] = first.split('-').map(Number) as [number, number];
  const months: { month: string; end: number; change: MonthSeries[number]['change'] }[] = [];
  let end = start;
  for (let i = 0; i <= changes.length; i++) {
    const month = `${y + Math.floor((m - 1 + i) / 12)}-${String(((m - 1 + i) % 12) + 1).padStart(2, '0')}`;
    if (i > 0) end += changes[i - 1]!;
    const previous = i === 0 ? undefined : months[i - 1]!.end;
    months.push({
      month,
      end,
      change:
        previous === undefined
          ? { status: 'unavailable', reason: 'no-baseline' }
          : { status: 'available', absolute: changes[i - 1]! },
    });
  }
  return months;
}

describe('periodSummary', () => {
  it('Scenario: A half-year summary', () => {
    // March 31 at 200000, then April–August and September so far.
    const months = series('2026-03', 200000, [10000, 20000, -5000, 15000, 30000, 12000]);
    expect(periodSummary(months, 6)).toEqual({
      startMonth: '2026-04',
      cut: false,
      change: 82000,
      percent: 41,
      average: 14000,
      completeMonths: 5,
      best: { month: '2026-08', change: 30000 },
      worst: { month: '2026-06', change: -5000 },
    });
  });

  it('Scenario: No history or one date — one month reads no period change', () => {
    const months = series('2026-09', 100000, []);
    expect(periodSummary(months, 12)).toEqual({ startMonth: '2026-09', cut: true, completeMonths: 0 });
  });

  it('Scenario: The period is longer than the history', () => {
    // History begins in June: June has no зміна, the period runs from its end.
    const months = series('2026-06', 100000, [5000, -2000, 4000, 1000]);
    expect(periodSummary(months, 24)).toEqual({
      startMonth: '2026-06',
      cut: true,
      change: 8000,
      percent: 8,
      average: 2333,
      completeMonths: 3,
      best: { month: '2026-07', change: 5000 },
      worst: { month: '2026-08', change: -2000 },
    });
  });
});

describe('forecast', () => {
  it('Scenario: A steady pace projects a straight continuation', () => {
    // Six complete months then September, today the 15th of 30 days at 300000.
    const months = series('2026-02', 0, [10000, 12000, 14000, 16000, 18000, 20000, 0]);
    const withToday = [...months.slice(0, -1), { ...months.at(-1)!, end: 300000 }];
    const result = forecast(withToday, '2026-09-15');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.pace).toBe(15000);
    expect(result.points.map((p) => [p.date, p.value])).toEqual([
      ['2026-09-30', 307500],
      ['2026-10-31', 322500],
      ['2026-11-30', 337500],
      ['2026-12-31', 352500],
      ['2027-01-31', 367500],
      ['2027-02-28', 382500],
    ]);
  });

  it("Scenario: The range comes from a year's spread", () => {
    const months = series('2025-08', 0, [0, 5000, 10000, 15000, 20000, 25000, 10000, 12000, 14000, 16000, 18000, 20000, 0]);
    const withToday = [...months.slice(0, -1), { ...months.at(-1)!, end: 300000 }];
    const result = forecast(withToday, '2026-09-15');
    if (result.status !== 'ready') throw new Error('withheld');
    expect([result.lowPace, result.highPace]).toEqual([10000, 19000]);
    expect(result.points.slice(0, 2).map((p) => [p.date, p.low, p.high])).toEqual([
      ['2026-09-30', 305000, 309500],
      ['2026-10-31', 315000, 328500],
    ]);
  });

  it('Scenario: A raise moves the pace within half a year', () => {
    const changes = [10000, 10000, 10000, 10000, 10000, 10000, 24000, 25000, 26000, 25000, 24000, 26000];
    const months = series('2025-08', 0, [...changes, 0]);
    const result = forecast(months, '2026-09-15');
    if (result.status !== 'ready') throw new Error('withheld');
    expect(result.pace).toBe(25000);
    expect(result.pace).not.toBe(changes.reduce((a, b) => a + b) / changes.length);
  });

  it('Scenario: An odd count leaves the middle out of both halves', () => {
    const months = series('2026-01', 0, [1000, 2000, 3000, 4000, 5000, 6000, 7000, 0]);
    const result = forecast(months, '2026-09-15');
    if (result.status !== 'ready') throw new Error('withheld');
    expect([result.lowPace, result.highPace]).toEqual([2000, 6000]);
  });

  it('Scenario: Too little history withholds the forecast', () => {
    // History beginning four complete months ago (the first month has no зміна of its own).
    const months = series('2026-04', 0, [1000, 1000, 1000, 1000, 0]);
    expect(forecast(months, '2026-09-15')).toEqual({ status: 'withheld', reason: 'too-short' });
    const unknown = series('2026-01', 0, [1000, 1000, 1000, 1000, 1000, 1000, 1000, 0]).map((m, i) =>
      i === 5 ? { ...m, change: { status: 'unavailable', reason: 'overflow' } as const } : m,
    );
    expect(forecast(unknown, '2026-09-15')).toEqual({ status: 'withheld', reason: 'unknown' });
  });

  it('Scenario: A forecast never becomes a record', () => {
    const months = series('2026-01', 0, [1000, 2000, 3000, 4000, 5000, 6000, 7000, 0]);
    const before = JSON.stringify(months);
    forecast(months, '2026-09-15');
    forecast(months, '2026-09-15');
    // It reads its input and returns a value: nothing it was given changed, and it has no other
    // input — no storage, no request — through which anything could.
    expect(JSON.stringify(months)).toBe(before);
    expect(forecast(months, '2026-09-15')).toEqual(forecast(months, '2026-09-15'));
  });
});

describe('investmentDifference', () => {
  it('Scenario: The investment difference is its own line', () => {
    const fund = account({ id: 'fund', name: 'інжур', kind: 'investment', currency: 'UAH', openingBalance: money(5500000, 'UAH') });
    const main = nonzeroOpening('main', 34500000);
    const reading = currentNetWorth({
      accounts: [main, fund],
      transactions: [],
      currentValues: new Map([['fund', { amount: money(6000000, 'UAH'), asOf: '2026-09-21' }]]),
    });
    expect(ready(reading).totals.get('UAH')).toEqual(known(40500000));
    const history = netWorthHistory({ accounts: [historyInput(main), historyInput(fund)], today: '2026-10-01' });
    expect(history.at(-1)!.totals.get('UAH')).toEqual(known(40000000));
    expect(investmentDifference(reading)).toEqual(
      new Map([['UAH', { amount: money(500000, 'UAH'), asOf: '2026-09-21' }]]),
    );
  });
});
