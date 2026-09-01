import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { expenseByDefault, isoDate } from '../domain/transaction';
import { accountKey, debtAccountId } from './survey';
import {
  existingAccount,
  existingState,
  leg,
  pair,
  parseRows,
  planFrom,
  type FixtureRow,
} from './test-fixtures';
import { verify } from './verify';

/** parse → survey → interpret → verify, the whole engine over one fixture. */
const report = (
  rows: readonly FixtureRow[],
  options: Parameters<typeof planFrom>[1] = {},
) => verify({ transactions: parseRows(rows), plan: planFrom(rows, options), ...options });

const reconciliationOf = (
  rows: readonly FixtureRow[],
  name: string,
  options: Parameters<typeof planFrom>[1] = {},
) => {
  const found = report(rows, options).accounts.find((row) => row.name === name);
  if (!found) {
    throw new Error(`the report holds no рахунок "${name}"`);
  }
  return found;
};

/** Every leg of "гаманець", all of them interpreted: an opening, a витрата, a дохід, a повернення. */
const wallet: FixtureRow[] = [
  ...pair({ id: '1', account: 'гаманець', accountType: 'CASH', journalType: 'DEBIT', amount: '500.00', other: 'Initial balance', otherType: 'EQUITY' }),
  ...pair({ id: '2', account: 'гаманець', accountType: 'CASH', journalType: 'CREDIT', amount: '42.00', other: 'Groceries', otherType: 'EXPENSES', datetime: '2024-10-28T10:00:00.000' }),
  ...pair({ id: '3', account: 'гаманець', accountType: 'CASH', journalType: 'DEBIT', amount: '100.00', other: 'Salary', otherType: 'INCOME', datetime: '2024-10-29T10:00:00.000' }),
  ...pair({ id: '4', account: 'гаманець', accountType: 'CASH', journalType: 'DEBIT', amount: '12.00', other: 'Groceries', otherType: 'EXPENSES', datetime: '2024-10-30T10:00:00.000' }),
];

describe('verify', () => {
  it('Scenario: A fully interpreted рахунок reconciles exactly', () => {
    const row = reconciliationOf(wallet, 'гаманець');
    // 500 opening − 42 spent + 100 income + 12 refunded = 570.00
    expect(row.saldoBalance).toEqual({ amount: 57000, currency: 'UAH' });
    expect(row.planBalance).toEqual({ amount: 57000, currency: 'UAH' });
    expect(row.difference).toEqual({ amount: 0, currency: 'UAH' });
    expect(row.explanations).toEqual([]);
    expect(row.reconciles).toBe(true);
    expect(report(wallet).reconciles).toBe(true);
  });

  it('Scenario: A dropped row shows up as the difference', () => {
    const rows: FixtureRow[] = [
      ...pair({ id: '0', account: 'Monobank UAH, White', journalType: 'DEBIT', amount: '500.00', other: 'Initial balance', otherType: 'EQUITY' }),
      // An in-transit departure of 121.98 that no arrival matches.
      leg({ 'Transaction ID': '1', 'Transaction Date': '2026-02-09T15:39:49', Account: 'Monobank UAH, White', 'Journal Type': 'CREDIT', Amount: '121.98' }),
      leg({ 'Transaction ID': '1', 'Transaction Date': '2026-02-09T15:39:49', Account: 'Monobank UAH, Black', 'Account Type': 'MONEY_ON_THE_WAY', 'Journal Type': 'DEBIT', Amount: '121.98' }),
    ];
    const row = reconciliationOf(rows, 'Monobank UAH, White');
    expect(row.saldoBalance).toEqual({ amount: 37802, currency: 'UAH' });
    expect(row.planBalance).toEqual({ amount: 50000, currency: 'UAH' });
    expect(row.difference).toEqual({ amount: 12198, currency: 'UAH' });
    expect(row.reconciles).toBe(false);
    expect(row.explanations).toHaveLength(1);
    const [explanation] = row.explanations;
    expect(explanation).toMatchObject({
      kind: 'export-row',
      amount: { amount: 12198, currency: 'UAH' },
    });
    expect(explanation?.kind === 'export-row' && explanation.row.reason).toBe(
      'unpaired-in-transit',
    );
    expect(report(rows).reconciles).toBe(false);
  });

  it('Scenario: A difference explained by existing stored транзакції is named as such', () => {
    const rows = pair({ id: '1', account: 'mono black', journalType: 'CREDIT', amount: '10.00', other: 'Groceries', otherType: 'EXPENSES' });
    const options = {
      decisions: {
        accountRedirects: {
          [accountKey('mono black', 'UAH')]: { to: 'account' as const, accountId: 'black' },
        },
      },
      existing: {
        ...existingState(),
        accounts: [existingAccount({ id: 'black', name: 'Чорна', openingAmount: 30000 })],
        transactions: [
          expenseByDefault({
            id: 'hand-1',
            date: isoDate('2024-10-27'),
            accountId: 'black',
            amount: money(5000, 'UAH'),
            categoryId: 'groceries',
          }),
        ],
      },
    };
    const row = reconciliationOf(rows, 'Чорна', options);
    expect(row.difference).toEqual({ amount: -5000, currency: 'UAH' });
    expect(row.explanations).toEqual([
      { kind: 'existing-transactions', amount: { amount: -5000, currency: 'UAH' }, count: 1 },
    ]);
    // The stored opening balance is replaced, and the report says by what.
    expect(row.replacedOpeningBalance).toEqual({ amount: 30000, currency: 'UAH' });
  });

  it('Scenario: An over-repaid рахунок-борг is visible before commit', () => {
    const rows: FixtureRow[] = [
      ...pair({ id: '1', description: 'борг', account: 'Monobank UAH, Black', journalType: 'CREDIT', amount: '1000.00', other: 'Борг', otherType: 'EXPENSES' }),
      ...pair({ id: '2', description: 'борг', account: 'Monobank UAH, Black', journalType: 'DEBIT', amount: '1100.00', other: 'Борг', otherType: 'EXPENSES', datetime: '2024-11-05T10:00:00.000' }),
    ];
    expect(report(rows).debts).toEqual([
      {
        accountId: debtAccountId('UAH'),
        name: 'Борги',
        balance: { amount: -10000, currency: 'UAH' },
      },
    ]);
  });

  it('Scenario: An accrual-month divergence is noted, not obeyed', () => {
    const rows = pair({
      id: '1',
      account: 'гаманець',
      accountType: 'CASH',
      journalType: 'CREDIT',
      amount: '42.00',
      other: 'Groceries',
      otherType: 'EXPENSES',
      datetime: '2025-08-02T10:00:00.000',
      accrualMonth: '2025-07-01',
    });
    const built = report(rows);
    const noted = built.droppedRows.filter((row) => row.reason === 'accrual-month-divergence');
    expect(noted).toHaveLength(2);
    expect(noted[0]?.detail).toContain('2025-07');
    expect(noted[0]?.detail).toContain('2025-08-02');
    // Noted, not obeyed: the транзакція keeps the transaction date, and the рахунок still balances.
    expect(planFrom(rows).transactions[0]?.transaction.date).toBe('2025-08-02');
    expect(reconciliationOf(rows, 'гаманець').reconciles).toBe(true);
  });

  it('lists the zero-only pair and the dropped повернення amount, and interprets the «Борг»', () => {
    const rows: FixtureRow[] = [
      ...pair({ id: '1', account: 'валюта моно', journalType: 'DEBIT', amount: '100.00', currency: 'USD', other: 'Initial balance', otherType: 'EQUITY' }),
      ...pair({ id: '2', account: 'валюта моно', journalType: 'DEBIT', amount: '0.00', other: 'Initial balance', otherType: 'EQUITY' }),
      ...pair({ id: '3', account: 'Monobank UAH, Black', journalType: 'DEBIT', amount: '2214.82', other: 'Travel', otherType: 'EXPENSES', otherAmount: '186.36', otherCurrency: 'PLN' }),
      ...pair({ id: '4', description: 'борг', account: 'Monobank UAH, Black', journalType: 'CREDIT', amount: '1000.00', other: 'Борг', otherType: 'EXPENSES' }),
    ];
    const built = report(rows);
    expect(built.droppedRows.map((row) => row.reason).sort()).toEqual([
      'dropped-original-amount',
      'zero-only-pair',
    ]);
    // The «Борг» row is not among them: it needs no decision, so it becomes a переказ and the
    // Black рахунок reconciles on it.
    expect(built.debts).toEqual([
      { accountId: debtAccountId('UAH'), name: 'Борги', balance: { amount: 100000, currency: 'UAH' } },
    ]);
    expect(built.reconciles).toBe(true);
  });

  it('reports a rejected redirect rather than swallowing it', () => {
    const rows = pair({ id: '1', account: 'OTP', journalType: 'CREDIT', amount: '10.00', other: 'Groceries', otherType: 'EXPENSES' });
    const built = report(rows, {
      decisions: {
        accountRedirects: { [accountKey('OTP', 'UAH')]: { to: 'account', accountId: 'dollars' } },
      },
      existing: {
        ...existingState(),
        accounts: [existingAccount({ id: 'dollars', name: 'Долари', currency: 'USD' })],
      },
    });
    expect(built.rejectedRedirects).toHaveLength(1);
    // The entry kept its own рахунок, so nothing landed in the wrong currency.
    expect(built.accounts.map((row) => row.name)).toEqual(['OTP']);
  });

  it('keeps the explanations summing to the difference, whatever the difference is', () => {
    const rows: FixtureRow[] = [
      ...pair({ id: '0', account: 'mono black', journalType: 'DEBIT', amount: '500.00', other: 'Initial balance', otherType: 'EQUITY' }),
      ...pair({ id: '1', description: 'борг', account: 'mono black', journalType: 'CREDIT', amount: '100.00', other: 'Борг', otherType: 'EXPENSES' }),
      ...pair({ id: '2', account: 'mono black', journalType: 'CREDIT', amount: '20.00', other: 'Something', otherType: 'LIABILITIES' }),
    ];
    const built = report(rows, {
      decisions: {
        accountRedirects: {
          [accountKey('mono black', 'UAH')]: { to: 'account', accountId: 'black' },
        },
      },
      existing: {
        ...existingState(),
        accounts: [existingAccount({ id: 'black', name: 'Чорна' })],
        transactions: [
          expenseByDefault({
            id: 'hand-1',
            date: isoDate('2024-10-27'),
            accountId: 'black',
            amount: money(700, 'UAH'),
          }),
        ],
      },
    });
    for (const row of built.accounts) {
      const sum = row.explanations.reduce((total, e) => total + e.amount.amount, 0);
      expect(sum).toBe(row.difference.amount);
    }
    // The unknown shape the plan skipped, less the витрата the рахунок already held by hand.
    expect(built.accounts[0]?.difference).toEqual({ amount: 1300, currency: 'UAH' });
  });
});
