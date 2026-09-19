import { describe, expect, it } from 'vitest';

import { account } from './account';
import type { CurrentValue } from './investments';
import { money } from './money';
import { currentNetWorth, type NetWorthReading } from './net-worth';
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
