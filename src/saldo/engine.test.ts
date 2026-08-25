import { describe, expect, it } from 'vitest';

import { account, computeBalance } from '../domain/account';
import { monthlyPicture } from '../domain/monthly-picture';
import { FEES_CATEGORY_ID } from '../domain/transaction';
import { interpret } from './interpret';
import { survey, type Decisions } from './survey';
import { leg, pair, parseRows, type FixtureRow } from './test-fixtures';
import { verify } from './verify';

/**
 * One synthetic export holding every shape the real file holds, run end to end. This is where the
 * balance-preservation invariant is actually proved: if any interpretation rule moved a рахунок by
 * something other than what its own real leg says, at least one рахунок stops reconciling — which
 * is exactly what the report is for, and exactly what the dry-run over the real export relies on.
 */

const EXPORT: FixtureRow[] = [
  // ── opening balances: two Saldo accounts the owner will merge, plus cash and an investment ──
  ...pair({ id: '10', datetime: '2024-10-27T13:55:31.129', account: 'mono black', journalType: 'DEBIT', amount: '123.00', other: 'Initial balance', otherType: 'EQUITY' }),
  ...pair({ id: '11', datetime: '2024-10-27T13:55:31.130', account: 'Monobank UAH, Black', journalType: 'DEBIT', amount: '50000.00', other: 'Initial balance', otherType: 'EQUITY' }),
  ...pair({ id: '12', datetime: '2024-10-27T13:55:31.131', account: 'гаманець', accountType: 'CASH', journalType: 'DEBIT', amount: '2000.00', other: 'Initial balance', otherType: 'EQUITY' }),
  ...pair({ id: '13', datetime: '2024-10-27T13:55:31.132', account: 'Monobank USD, Black', journalType: 'DEBIT', amount: '100.00', currency: 'USD', other: 'Initial balance', otherType: 'EQUITY' }),
  ...pair({ id: '14', datetime: '2024-10-27T13:55:31.133', account: 'binance usdt', accountType: 'OTHER_ASSETS', journalType: 'DEBIT', amount: '250.00', currency: 'USD', other: 'Initial balance', otherType: 'EQUITY' }),
  ...pair({ id: '15', datetime: '2024-10-27T13:55:31.134', account: 'Monobank UAH, White', journalType: 'DEBIT', amount: '8000.00', other: 'Initial balance', otherType: 'EQUITY' }),

  // ── витрати: a plain one, a foreign purchase, an uncategorised one and a повернення ────────
  ...pair({ id: '20', datetime: '2024-11-01T09:00:00.000', account: 'Monobank UAH, Black', journalType: 'CREDIT', amount: '850.84', other: 'Groceries', otherType: 'EXPENSES' }),
  ...pair({ id: '21', datetime: '2024-11-02T09:00:00.000', account: 'Monobank UAH, Black', journalType: 'CREDIT', amount: '850.84', other: 'Eating out', otherType: 'EXPENSES', otherAmount: '6370.00', otherCurrency: 'HUF' }),
  ...pair({ id: '22', datetime: '2024-11-03T09:00:00.000', account: 'mono black', journalType: 'CREDIT', amount: '12.50', other: 'Uncategorised expense', otherType: 'EXPENSES' }),
  ...pair({ id: '23', datetime: '2024-11-04T09:00:00.000', account: 'Monobank UAH, Black', journalType: 'DEBIT', amount: '2214.82', other: 'Travel', otherType: 'EXPENSES', otherAmount: '186.36', otherCurrency: 'PLN' }),

  // ── доходи, including one handed back, and коригування both ways ───────────────────────────
  ...pair({ id: '30', datetime: '2024-11-05T09:00:00.000', account: 'Monobank UAH, Black', journalType: 'DEBIT', amount: '50000.00', other: 'Salary', otherType: 'INCOME' }),
  ...pair({ id: '31', datetime: '2024-11-06T09:00:00.000', account: 'mono black', journalType: 'CREDIT', amount: '271.00', other: 'Other income', otherType: 'INCOME' }),
  ...pair({ id: '32', datetime: '2024-11-07T09:00:00.000', account: 'гаманець', accountType: 'CASH', journalType: 'DEBIT', amount: '1500.00', other: 'Андрій', otherParent: 'батьки', otherType: 'INCOME' }),
  ...pair({ id: '33', datetime: '2024-11-08T09:00:00.000', account: 'гаманець', accountType: 'CASH', journalType: 'CREDIT', amount: '42.00', other: 'Balance correction', otherType: 'EXPENSES' }),
  ...pair({ id: '34', datetime: '2024-11-09T09:00:00.000', account: 'гаманець', accountType: 'CASH', journalType: 'DEBIT', amount: '17.00', other: 'Balance correction', otherType: 'INCOME' }),

  // ── direct перекази: same currency, cross currency, and cash withdrawn ─────────────────────
  ...pair({ id: '40', datetime: '2024-11-10T09:00:00.000', account: 'Monobank UAH, Black', journalType: 'CREDIT', amount: '4000.00', other: 'binance usdt', otherType: 'OTHER_ASSETS', otherAmount: '100.00', otherCurrency: 'USD' }),
  ...pair({ id: '41', datetime: '2024-11-11T09:00:00.000', account: 'Monobank UAH, Black', journalType: 'CREDIT', amount: '1000.00', other: 'гаманець', otherType: 'CASH' }),

  // ── in transit: a same-currency pair, a cross-currency pair, and a three-legged fee pair ───
  leg({ 'Transaction ID': '50', 'Transaction Date': '2024-11-12T09:00:00.000', Account: 'Monobank UAH, White', 'Journal Type': 'CREDIT', Amount: '5000.00' }),
  leg({ 'Transaction ID': '50', 'Transaction Date': '2024-11-12T09:00:00.000', Account: 'Monobank UAH, Black', 'Account Type': 'MONEY_ON_THE_WAY', 'Journal Type': 'DEBIT', Amount: '5000.00' }),
  leg({ 'Transaction ID': '51', 'Transaction Date': '2024-11-12T09:00:01.000', Account: 'Monobank UAH, Black', 'Journal Type': 'DEBIT', Amount: '5000.00' }),
  leg({ 'Transaction ID': '51', 'Transaction Date': '2024-11-12T09:00:01.000', Account: 'Monobank UAH, White', 'Account Type': 'MONEY_ON_THE_WAY', 'Journal Type': 'CREDIT', Amount: '5000.00' }),

  leg({ 'Transaction ID': '52', 'Transaction Date': '2024-11-13T09:00:00.000', Account: 'Monobank UAH, Black', 'Journal Type': 'CREDIT', Amount: '3462.45' }),
  leg({ 'Transaction ID': '52', 'Transaction Date': '2024-11-13T09:00:00.000', Account: 'Monobank USD, Black', 'Account Type': 'MONEY_ON_THE_WAY', 'Journal Type': 'DEBIT', Amount: '3462.45' }),
  leg({ 'Transaction ID': '53', 'Transaction Date': '2024-11-13T09:00:01.000', Account: 'Monobank USD, Black', 'Journal Type': 'DEBIT', Amount: '80.00', Currency: 'USD' }),
  leg({ 'Transaction ID': '53', 'Transaction Date': '2024-11-13T09:00:01.000', Account: 'Monobank UAH, Black', 'Account Type': 'MONEY_ON_THE_WAY', 'Journal Type': 'CREDIT', Amount: '3462.45' }),

  leg({ 'Transaction ID': '54', 'Transaction Date': '2024-11-14T09:00:00.000', Account: 'Monobank UAH, Black', 'Journal Type': 'CREDIT', Amount: '125.00' }),
  leg({ 'Transaction ID': '54', 'Transaction Date': '2024-11-14T09:00:00.000', Account: 'Monobank UAH, White', 'Account Type': 'MONEY_ON_THE_WAY', 'Journal Type': 'DEBIT', Amount: '121.98' }),
  leg({ 'Transaction ID': '54', 'Transaction Date': '2024-11-14T09:00:00.000', Account: 'Fees', 'Account Type': 'EXPENSES', 'Journal Type': 'DEBIT', Amount: '3.02' }),
  leg({ 'Transaction ID': '55', 'Transaction Date': '2024-11-20T09:00:00.000', Account: 'Monobank UAH, White', 'Journal Type': 'DEBIT', Amount: '121.98' }),
  leg({ 'Transaction ID': '55', 'Transaction Date': '2024-11-20T09:00:00.000', Account: 'Monobank UAH, Black', 'Account Type': 'MONEY_ON_THE_WAY', 'Journal Type': 'CREDIT', Amount: '121.98' }),

  // ── «Борг» both ways, one description, plus one with none at all ───────────────────────────
  ...pair({ id: '60', datetime: '2024-11-15T09:00:00.000', description: 'борг яріку', account: 'Monobank UAH, Black', journalType: 'CREDIT', amount: '1000.00', other: 'Борг', otherType: 'EXPENSES' }),
  ...pair({ id: '61', datetime: '2024-11-16T09:00:00.000', description: 'борг яріку', account: 'Monobank UAH, Black', journalType: 'DEBIT', amount: '400.00', other: 'Борг', otherType: 'EXPENSES' }),
  ...pair({ id: '62', datetime: '2024-11-17T09:00:00.000', description: '', account: 'гаманець', accountType: 'CASH', journalType: 'CREDIT', amount: '300.00', other: 'Борг', otherType: 'EXPENSES' }),
];

const DECISIONS: Decisions = {
  accountRedirects: {
    'UAH|mono black': { to: 'entry', key: 'UAH|Monobank UAH, Black' },
  },
  accountKinds: { 'UAH|Monobank UAH, White': 'savings' },
  debtPeople: { 'борг яріку': { to: 'person', name: 'Ярослав' } },
  debtTransactions: { '62': { to: 'person', name: 'Оля' } },
};

const build = (decisions: Decisions = DECISIONS) => {
  const transactions = parseRows(EXPORT);
  const surveyed = survey(transactions);
  const plan = interpret({ transactions, survey: surveyed, decisions });
  return { transactions, surveyed, plan, report: verify({ transactions, plan }) };
};

describe('the engine over one export of every shape', () => {
  it('Scenario: A fully interpreted рахунок reconciles exactly — for every рахунок at once', () => {
    const { report } = build();
    for (const row of report.accounts) {
      expect(
        `${row.name}: plan ${row.planBalance.amount} vs saldo ${row.saldoBalance.amount}`,
      ).toBe(`${row.name}: plan ${row.saldoBalance.amount} vs saldo ${row.saldoBalance.amount}`);
    }
    expect(report.reconciles).toBe(true);
    expect(report.unresolvedDebts).toEqual([]);
    expect(report.rejectedRedirects).toEqual([]);
    // Nothing the plan skipped moves any рахунок: the only listed row is the informational
    // original-currency amount a повернення cannot carry.
    expect(report.droppedRows.filter((row) => row.effect !== undefined)).toEqual([]);
    expect(report.droppedRows.map((row) => row.reason)).toEqual(['dropped-original-amount']);
  });

  it('holds every shape: merged рахунки, комісія, negative дохід, коригування, борг both ways', () => {
    const { plan } = build();
    const types = plan.transactions.map((t) => t.transaction.type);
    expect(new Set(types)).toEqual(new Set(['expense', 'refund', 'income', 'correction', 'transfer']));

    // The two Saldo cards became one рахунок carrying both opening balances.
    expect(plan.accounts.filter((a) => a.name === 'mono black')).toEqual([]);
    const black = plan.accounts.find((a) => a.name === 'Monobank UAH, Black');
    expect(black?.openingBalance).toEqual({ amount: 5012300, currency: 'UAH' });

    // The three-legged departure produced its own витрата «Комісія».
    const fee = plan.transactions.find((t) => t.transaction.id === 'saldo:54/fee');
    expect(fee?.transaction).toMatchObject({
      type: 'expense',
      amount: { amount: 302, currency: 'UAH' },
      categoryId: FEES_CATEGORY_ID,
      accountId: black?.id,
    });

    // The дохід handed back kept its джерело and its sign.
    expect(plan.transactions.find((t) => t.transaction.id === 'saldo:31')?.transaction).toMatchObject(
      { type: 'income', amount: { amount: -27100, currency: 'UAH' } },
    );

    // Both people got their own рахунок-борг, one of them from a transaction with no description.
    expect(plan.accounts.filter((a) => a.kind === 'debt').map((a) => a.name)).toEqual([
      'Ярослав',
      'Оля',
    ]);
    expect(plan.complete).toBe(true);
  });

  it('states each рахунок-борг’s resulting balance', () => {
    const { report } = build();
    expect(report.debts).toEqual([
      { accountId: expect.any(String), name: 'Ярослав', balance: { amount: 60000, currency: 'UAH' } },
      { accountId: expect.any(String), name: 'Оля', balance: { amount: 30000, currency: 'UAH' } },
    ]);
  });

  it('keeps the plan in export datetime order and replays identically', () => {
    const first = build().plan;
    const second = build().plan;
    expect(first).toEqual(second);
    const dates = first.transactions.map((t) => t.transaction.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('feeds the domain: every рахунок’s balance and the month add up on the plan alone', () => {
    const { plan, report } = build();
    const accounts = plan.accounts.map((a) =>
      account({ id: a.id, name: a.name, kind: a.kind, currency: a.currency, openingBalance: a.openingBalance }),
    );
    const transactions = plan.transactions.map((t) => t.transaction);
    for (const one of accounts) {
      const balance = computeBalance(one, transactions);
      const row = report.accounts.find((r) => r.accountId === one.id);
      // The report's plan balance is the domain's, not a second opinion.
      expect(balance).toEqual(row?.planBalance ?? balance);
    }
    const november = monthlyPicture({ month: '2024-11', accounts, transactions }).get('UAH');
    expect(november?.left.amount).toBe(
      (november?.income.amount ?? 0) -
        (november?.spent.amount ?? 0) -
        (november?.invested.amount ?? 0) -
        (november?.saved.amount ?? 0) -
        (november?.lent.amount ?? 0),
    );
    // «Борг» lending and repayment net to what is still out on loan; the jar рахунок holds відкладено.
    expect(november?.lent.amount).toBe(90000);
    expect(november?.saved.amount).toBe(-487802);
  });

  it('leaves the plan incomplete while a «Борг» transaction is unassigned', () => {
    const { report } = build({ ...DECISIONS, debtTransactions: {} });
    expect(report.unresolvedDebts.map((d) => d.transactionId)).toEqual(['62']);
    expect(report.reconciles).toBe(false);
    // The гаманець is short by exactly the row nothing was done with, and the report says so.
    const wallet = report.accounts.find((r) => r.name === 'гаманець');
    expect(wallet?.difference).toEqual({ amount: 30000, currency: 'UAH' });
    expect(wallet?.explanations[0]).toMatchObject({ kind: 'export-row' });
  });

});
