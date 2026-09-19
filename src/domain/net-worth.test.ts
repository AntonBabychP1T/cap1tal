import { describe, expect, it } from 'vitest';

import { account, type Account } from './account';
import type { CurrentValue } from './investments';
import { money } from './money';
import {
  currentNetWorth,
  netWorthChange,
  netWorthHistory,
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
  it('Scenario: No account has ever carried a транзакція means no points at all', () => {
    expect(netWorthHistory({ accounts: [historyInput(zeroOpening('z'))], today: '2026-09-19' })).toEqual([]);
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

  it('Scenario: A later nonzero opening blocks earlier totals', () => {
    const january = nonzeroOpening('jan-account', 0); // zero opening, first recorded in January
    const march = nonzeroOpening('march-account', 50000); // nonzero opening, anchored March 10
    const points = netWorthHistory({
      accounts: [
        historyInput(january, { firstDate: '2026-01-15', firstDateNet: 1000, monthlyNet: { '2026-01': 1000 } }),
        historyInput(march, { firstDate: '2026-03-10', firstDateNet: 2000, monthlyNet: { '2026-03': 2000 } }),
      ],
      today: '2026-09-19',
    });
    expect(totalOf(points, '2026-01-31')).toEqual({ status: 'unavailable', reason: 'gap' });
    expect(totalOf(points, '2026-02-28')).toEqual({ status: 'unavailable', reason: 'gap' });
    expect(totalOf(points, '2026-03-31')).toEqual({
      status: 'known',
      // january-account: opening 0 + Jan/Feb/Mar movement (only Jan's 1000 recorded) = 1000
      // march-account: opening 50000 + March movement 2000 = 52000
      amount: money(53000, 'UAH'),
    });
  });

  it('Scenario: No anchor remains unknown', () => {
    const noAnchor = nonzeroOpening('no-anchor', 30000, 'EUR');
    const points = netWorthHistory({
      accounts: [
        historyInput(zeroOpening('other', 'UAH'), {
          firstDate: '2026-01-01',
          firstDateNet: 0,
          monthlyNet: {},
        }),
        historyInput(noAnchor), // no firstDate at all — never anchored
      ],
      today: '2026-09-19',
    });
    for (const point of points) {
      expect(point.totals.get('EUR')).toEqual({ status: 'unavailable', reason: 'gap' });
    }
  });

  it('Scenario: Zero openings contribute zero before their first recorded movement', () => {
    const zero = zeroOpening('z');
    const points = netWorthHistory({
      accounts: [historyInput(zero, { firstDate: '2026-06-05', firstDateNet: 0, monthlyNet: {} })],
      today: '2026-06-05',
    });
    expect(points).toHaveLength(1);
    expect(points[0]!.totals.get('UAH')).toEqual({ status: 'known', amount: money(0, 'UAH') });
  });

  it('Scenario: Empty months carry the previous balance', () => {
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

  it('Scenario: No history or one date', () => {
    const onlyToday = zeroOpening('z');
    const points = netWorthHistory({
      accounts: [historyInput(onlyToday, { firstDate: '2026-09-19', firstDateNet: 500, monthlyNet: {} })],
      today: '2026-09-19',
    });
    expect(points.map((p) => p.date)).toEqual(['2026-09-19']);
    expect(points[0]!.totals.get('UAH')).toEqual({ status: 'known', amount: money(500, 'UAH') });
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
    const before = netWorthHistory({
      accounts: [
        historyInput(card, {
          firstDate: '2026-06-05',
          firstDateNet: 10000,
          monthlyNet: { '2026-06': 10000, '2026-08': 5000 },
        }),
      ],
      today: '2026-09-19',
    });
    // A later backdated edit changes August's net; June's point must not move.
    const after = netWorthHistory({
      accounts: [
        historyInput(card, {
          firstDate: '2026-06-05',
          firstDateNet: 10000,
          monthlyNet: { '2026-06': 10000, '2026-08': 9000 },
        }),
      ],
      today: '2026-09-19',
    });
    expect(totalOf(before, '2026-06-30')).toEqual(totalOf(after, '2026-06-30'));
    expect(totalOf(before, '2026-08-31')).not.toEqual(totalOf(after, '2026-08-31'));
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

const known = (amountMinor: number, currency = 'UAH'): CurrencyTotal => ({
  status: 'known',
  amount: money(amountMinor, currency),
});

describe('netWorthChange', () => {
  it('Scenario: Positive comparable baseline', () => {
    const result = netWorthChange({
      current: known(120000),
      currentUsedValuation: false,
      hasFutureRecords: false,
      previousMonthEnd: { date: '2026-08-31', total: known(100000) },
    });
    expect(result).toEqual({
      status: 'available',
      change: {
        currency: 'UAH',
        absolute: money(20000, 'UAH'),
        percent: 20,
        since: '2026-08-31',
      },
    });
  });

  it('Scenario: Zero or negative denominator', () => {
    const zeroBaseline = netWorthChange({
      current: known(20000),
      currentUsedValuation: false,
      hasFutureRecords: false,
      previousMonthEnd: { date: '2026-08-31', total: known(0) },
    });
    expect(zeroBaseline.status).toBe('available');
    expect(zeroBaseline.status === 'available' && zeroBaseline.change.absolute).toEqual(money(20000, 'UAH'));
    expect(zeroBaseline.status === 'available' && zeroBaseline.change.percent).toBeUndefined();

    const negativeBaseline = netWorthChange({
      current: known(20000),
      currentUsedValuation: false,
      hasFutureRecords: false,
      previousMonthEnd: { date: '2026-08-31', total: known(-10000) },
    });
    expect(negativeBaseline.status === 'available' && negativeBaseline.change.absolute).toEqual(
      money(30000, 'UAH'),
    );
    expect(negativeBaseline.status === 'available' && negativeBaseline.change.percent).toBeUndefined();
  });

  it('Scenario: No matching baseline means no change — missing previous month-end', () => {
    const result = netWorthChange({
      current: known(120000),
      currentUsedValuation: false,
      hasFutureRecords: false,
      previousMonthEnd: undefined,
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'no-baseline' });
  });

  it('Scenario: A gap baseline is also no matching baseline', () => {
    const result = netWorthChange({
      current: known(120000),
      currentUsedValuation: false,
      hasFutureRecords: false,
      previousMonthEnd: { date: '2026-08-31', total: { status: 'unavailable', reason: 'gap' } },
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'no-baseline' });
  });

  it('Scenario: An investment valuation substitution suppresses comparison', () => {
    const result = netWorthChange({
      current: known(120000),
      currentUsedValuation: true,
      hasFutureRecords: false,
      previousMonthEnd: { date: '2026-08-31', total: known(100000) },
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'valuation-substituted' });
  });

  it('Scenario: A future-dated record suppresses comparison', () => {
    const result = netWorthChange({
      current: known(120000),
      currentUsedValuation: false,
      hasFutureRecords: true,
      previousMonthEnd: { date: '2026-08-31', total: known(100000) },
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'future-records' });
  });

  it('Scenario: An unrelated currency remains comparable', () => {
    // A USD future record or valuation substitution must not suppress a UAH comparison — the
    // caller evaluates each currency with its own flags, never one shared across all of them.
    const uah = netWorthChange({
      current: known(120000, 'UAH'),
      currentUsedValuation: false,
      hasFutureRecords: false,
      previousMonthEnd: { date: '2026-08-31', total: known(100000, 'UAH') },
    });
    const usd = netWorthChange({
      current: known(5000, 'USD'),
      currentUsedValuation: true,
      hasFutureRecords: false,
      previousMonthEnd: { date: '2026-08-31', total: known(4000, 'USD') },
    });
    expect(uah.status).toBe('available');
    expect(usd).toEqual({ status: 'unavailable', reason: 'valuation-substituted' });
  });
});
