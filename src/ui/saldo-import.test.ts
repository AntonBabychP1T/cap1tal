import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { accountsRepo } from '../db/accounts-repo';
import { categoriesRepo } from '../db/categories-repo';
import { seedStarterSet } from '../db/seed';
import { sourcesRepo } from '../db/sources-repo';
import { openTestDb } from '../db/test-db';
import { transactionsRepo } from '../db/transactions-repo';
import { accountKey } from '../saldo/survey';
import { csv, pair, existingAccount, existingState, SALDO_COLUMNS } from '../saldo/test-fixtures';
import {
  accountRows,
  assignDescription,
  assignTransaction,
  canCommit,
  commitFailed,
  debtRows,
  committed,
  confirmSecondImport,
  planSummary,
  redirectAccount,
  redirectName,
  setAccountKind,
  startFlow,
  startWithText,
  toStep,
  unassignedDebts,
} from './saldo-import';

/** An export the flow can actually run on: an opening balance, a витрата and a переказ. */
const ORDINARY = csv([
  ...pair({ id: '1', account: 'mono black', journalType: 'DEBIT', amount: '1000.00', other: 'Initial balance', otherType: 'EQUITY' }),
  ...pair({ id: '2', datetime: '2024-11-01T10:00:00.000', account: 'mono black', journalType: 'CREDIT', amount: '250.00', other: 'булка', otherType: 'EXPENSES' }),
  ...pair({ id: '3', datetime: '2024-11-02T10:00:00.000', account: 'mono black', journalType: 'CREDIT', amount: '300.00', other: 'готівка', otherType: 'CASH' }),
]);

const started = () => startWithText(startFlow(), ORDINARY);

describe('the import flow — choosing the export', () => {
  it('Scenario: A file with an alien header is refused with the reason', () => {
    const withoutJournalType = SALDO_COLUMNS.filter((column) => column !== 'Journal Type');
    const alien = csv(
      pair({ id: '1', account: 'mono black', journalType: 'DEBIT', amount: '1.00', other: 'булка', otherType: 'EXPENSES' }),
      withoutJournalType,
    );

    const state = startWithText(startFlow(), alien);

    expect(state.step).toBe('file');
    expect(state.refusal).toMatch(/Journal Type/);
    // Nothing was imported from a refused file: there is no plan to commit at all.
    expect(state.plan).toBeUndefined();
    expect(canCommit(state)).toBe(false);
  });

  it('A malformed amount refuses the file too, naming it', () => {
    const malformed = csv(
      pair({ id: '1', account: 'mono black', journalType: 'DEBIT', amount: '1,234.5', other: 'булка', otherType: 'EXPENSES' }),
    );

    expect(startWithText(startFlow(), malformed).refusal).toMatch(/1,234\.5/);
  });

  it('Scenario: A readable export moves the flow on', () => {
    const state = started();

    expect(state.step).toBe('accounts');
    expect(state.refusal).toBeUndefined();
    expect(accountRows(state).map((row) => row.entry.saldoAccount)).toEqual([
      'mono black',
      'готівка',
    ]);
  });

  it('A refused file after a good one leaves no stale plan behind', () => {
    const good = started();

    const refused = startWithText(good, 'Nonsense,Header\n1,2');

    expect(refused.plan).toBeUndefined();
    expect(refused.report).toBeUndefined();
    expect(refused.step).toBe('file');
  });
});

describe('the import flow — the account map', () => {
  it('Scenario: Merging two entries leaves one рахунок', () => {
    const twoCards = csv([
      ...pair({ id: '1', account: 'mono black', journalType: 'CREDIT', amount: '100.00', other: 'булка', otherType: 'EXPENSES' }),
      ...pair({ id: '2', account: 'Monobank UAH, Black', journalType: 'CREDIT', amount: '200.00', other: 'булка', otherType: 'EXPENSES' }),
    ]);
    const state = startWithText(startFlow(), twoCards);
    expect(state.plan!.accounts).toHaveLength(2);

    const merged = redirectAccount(state, accountKey('mono black', 'UAH'), {
      to: 'entry',
      key: accountKey('Monobank UAH, Black', 'UAH'),
    });

    expect(merged.plan!.accounts).toHaveLength(1);
    expect(merged.plan!.accounts[0]!.name).toBe('Monobank UAH, Black');
    // Both entries are still shown; the redirected one says what it was merged into.
    const rows = accountRows(merged);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.entry.saldoAccount === 'mono black')?.mergedInto).toBe(
      'Monobank UAH, Black',
    );
    expect(planSummary(merged)?.newAccounts).toBe(1);
  });

  it('Scenario: Changing a вид changes what the month counts', () => {
    const reserve = csv([
      ...pair({ id: '1', account: 'РЕЗЕРВ', journalType: 'DEBIT', amount: '500.00', other: 'Initial balance', otherType: 'EQUITY' }),
    ]);
    const state = startWithText(startFlow(), reserve);
    expect(accountRows(state)[0]!.becomes.kind).toBe('spending');

    const saved = setAccountKind(state, accountKey('РЕЗЕРВ', 'UAH'), 'savings');

    expect(accountRows(saved)[0]!.becomes.kind).toBe('savings');
    expect(saved.plan!.accounts[0]!.kind).toBe('savings');
  });

  it('An entry can be merged onto a рахунок the owner already has', () => {
    const existing = existingState({
      accounts: [existingAccount({ id: 'card', name: 'mono black', openingAmount: 5000 })],
    });
    const state = startWithText(startFlow({ existing }), ORDINARY);

    const merged = redirectAccount(state, accountKey('mono black', 'UAH'), {
      to: 'account',
      accountId: 'card',
    });

    // No second рахунок for the same card, and its початковий залишок is the one Saldo implies.
    const onto = merged.plan!.accounts.find((a) => a.existingId === 'card')!;
    expect(onto).toMatchObject({ name: 'mono black', openingBalance: money(100000, 'UAH') });
    expect(onto.replacedOpeningBalance).toEqual(money(5000, 'UAH'));
    // Said as what it is, not inferred from the name: the export's "mono black" and the owner's
    // рахунок of the same name are one word and two very different decisions.
    const row = accountRows(merged).find((r) => r.entry.saldoAccount === 'mono black')!;
    expect(row.becomes.id).toBe('card');
    expect(row.ontoExisting).toBe(true);
    expect(row.mergedInto).toBeUndefined();
  });

  it('Scenario: A cross-currency redirect is shown as rejected', () => {
    const existing = existingState({
      accounts: [existingAccount({ id: 'usd', name: 'долари', currency: 'USD' })],
    });
    const state = startWithText(startFlow({ existing }), ORDINARY);

    const rejected = redirectAccount(state, accountKey('mono black', 'UAH'), {
      to: 'account',
      accountId: 'usd',
    });

    const row = accountRows(rejected).find((r) => r.entry.saldoAccount === 'mono black')!;
    expect(row.rejection).toBeDefined();
    expect(row.becomes.currency).toBe('UAH');
    expect(row.becomes.name).toBe('mono black');
  });

  it('A redirect can be undone, and the entry goes back to its own proposal', () => {
    const state = started();
    const merged = redirectAccount(state, accountKey('готівка', 'UAH'), {
      to: 'entry',
      key: accountKey('mono black', 'UAH'),
    });
    expect(merged.plan!.accounts).toHaveLength(1);

    const undone = redirectAccount(merged, accountKey('готівка', 'UAH'));

    expect(undone.plan!.accounts).toHaveLength(2);
    expect(undone.decisions.accountRedirects).toBeUndefined();
  });
});

describe('the import flow — proposed категорії and джерела', () => {
  it('A redirected категорія can be put back to being created', () => {
    const existing = existingState({
      categories: [{ id: 'groceries', name: 'Продукти', archived: false }],
    });
    const state = startWithText(startFlow({ existing }), ORDINARY);
    const redirected = redirectName(state, 'categories', 'булка', 'groceries');
    expect(redirected.plan!.categories.map((p) => p.saldoName)).not.toContain('булка');

    const undone = redirectName(redirected, 'categories', 'булка');

    expect(undone.plan!.categories.map((p) => p.saldoName)).toContain('булка');
    expect(undone.decisions.categoryRedirects).toBeUndefined();
  });

  it('Scenario: A proposed category is redirected onto an existing one', () => {
    const existing = existingState({
      categories: [{ id: 'groceries', name: 'Продукти', archived: false }],
    });
    const state = startWithText(startFlow({ existing }), ORDINARY);
    // Nothing matched «булка» by name, so the plan would create it.
    expect(state.plan!.categories.map((p) => p.saldoName)).toContain('булка');

    const redirected = redirectName(state, 'categories', 'булка', 'groceries');

    // Redirected onto «Продукти», so it is no longer among the names the plan creates.
    expect(redirected.plan!.categories.map((p) => p.saldoName)).not.toContain('булка');
    expect(planSummary(redirected)?.categories).toBe(0);
    // And the витрата carries the existing row rather than a new one.
    const expense = redirected.plan!.transactions
      .map((planned) => planned.transaction)
      .find((t) => t.type === 'expense');
    expect(expense?.type === 'expense' && expense.categoryId).toBe('groceries');
  });
});

/** «Борг» history: lending and a repayment, both needing a person before anything may be stored. */
const DEBTS = csv([
  ...pair({ id: '1', datetime: '2024-11-01T10:00:00.000', description: 'борг', account: 'mono black', journalType: 'CREDIT', amount: '1000.00', other: 'Борг', otherType: 'EXPENSES' }),
  ...pair({ id: '2', datetime: '2024-11-02T10:00:00.000', description: 'борг', account: 'mono black', journalType: 'DEBIT', amount: '400.00', other: 'Борг', otherType: 'EXPENSES' }),
]);

const yaroslav = { to: 'person', name: 'Ярослав' } as const;
const olya = { to: 'person', name: 'Оля' } as const;

describe('the import flow — «Борг»', () => {
  it('Scenario: An unassigned «Борг» transaction blocks the commit', () => {
    const state = toStep(startWithText(startFlow(), DEBTS), 'report');

    expect(state.plan!.complete).toBe(false);
    expect(unassignedDebts(state).map((row) => row.transactionId)).toEqual(['1', '2']);
    expect(canCommit(state)).toBe(false);
  });

  it('Scenario: Assigning the last one opens the commit', () => {
    const state = toStep(startWithText(startFlow(), DEBTS), 'report');

    const assigned = assignDescription(state, 'борг', yaroslav);

    expect(assigned.plan!.complete).toBe(true);
    expect(unassignedDebts(assigned)).toEqual([]);
    expect(canCommit(assigned)).toBe(true);
    // The money went onto a рахунок-борг named for the person, and came partly back.
    const debtAccount = assigned.plan!.accounts.find((a) => a.kind === 'debt');
    expect(debtAccount?.name).toBe('Ярослав');
    expect(assigned.report!.debts).toEqual([
      expect.objectContaining({ name: 'Ярослав', balance: money(60000, 'UAH') }),
    ]);
  });

  it('Scenario: One transaction goes to a different person than its description', () => {
    const state = assignDescription(startWithText(startFlow(), DEBTS), 'борг', yaroslav);

    const split = assignTransaction(state, '2', olya);

    expect(split.plan!.complete).toBe(true);
    const names = split.report!.debts.map((debt) => debt.name).sort();
    expect(names).toEqual(['Оля', 'Ярослав']);
    // Ярослав still owes the whole 1000; the 400 came back out of Оля's, taking it below zero.
    const byName = new Map(split.report!.debts.map((debt) => [debt.name, debt.balance]));
    expect(byName.get('Ярослав')).toEqual(money(100000, 'UAH'));
    expect(byName.get('Оля')).toEqual(money(-40000, 'UAH'));
  });

  it('Every «Борг» transaction is listed with its date, amount and person', () => {
    const state = startWithText(startFlow(), DEBTS);

    // Before any assignment: both listed, both unassigned, each with what the export says.
    expect(debtRows(state)).toEqual([
      { transactionId: '1', description: 'борг', date: '2024-11-01', amount: money(100000, 'UAH'), assigned: false },
      { transactionId: '2', description: 'борг', date: '2024-11-02', amount: money(40000, 'UAH'), assigned: false },
    ]);

    const assigned = assignDescription(state, 'борг', yaroslav);

    // After: both carry the person their money moves to and from, and keep the description they
    // were assigned by.
    expect(debtRows(assigned)).toEqual([
      { transactionId: '1', description: 'борг', date: '2024-11-01', amount: money(100000, 'UAH'), assigned: true, person: 'Ярослав' },
      { transactionId: '2', description: 'борг', date: '2024-11-02', amount: money(40000, 'UAH'), assigned: true, person: 'Ярослав' },
    ]);
    expect(unassignedDebts(assigned)).toEqual([]);
  });

  it('A рахунок the owner made a вид `debt` brings no false «Борг» rows', () => {
    // The ordinary export: a витрата and a переказ, no «Борг» leg anywhere in it.
    const state = startWithText(startFlow(), ORDINARY);

    const asDebt = setAccountKind(state, accountKey('готівка', 'UAH'), 'debt');

    // The переказ onto it now lands on a рахунок-борг, but it is still not a «Борг» transaction —
    // the export says which are, and this one is not among them.
    expect(asDebt.plan!.accounts.some((a) => a.kind === 'debt')).toBe(true);
    expect(debtRows(asDebt)).toEqual([]);
  });

  it('A «Борг» transaction can go to a рахунок-борг the owner already has', () => {
    const existing = existingState({
      accounts: [existingAccount({ id: 'debt-o', name: 'Оля', kind: 'debt' })],
    });
    const state = startWithText(startFlow({ existing }), DEBTS);

    const assigned = assignDescription(state, 'борг', { to: 'account', accountId: 'debt-o' });

    expect(assigned.plan!.complete).toBe(true);
    // No second рахунок-борг is created; the money lands on the one that is already there.
    expect(assigned.plan!.accounts.filter((a) => a.kind === 'debt')).toEqual([
      expect.objectContaining({ existingId: 'debt-o', name: 'Оля' }),
    ]);
    expect(debtRows(assigned).every((row) => row.person === 'Оля')).toBe(true);
  });

  it('An assignment can be undone, and the transaction is unassigned again', () => {
    const assigned = assignDescription(startWithText(startFlow(), DEBTS), 'борг', yaroslav);

    const undone = assignDescription(assigned, 'борг');

    expect(undone.plan!.complete).toBe(false);
    expect(unassignedDebts(undone)).toHaveLength(2);
  });
});

describe('the import flow — the report and the pre-commit summary', () => {
  it('Scenario: Leaving before the commit stores nothing', () => {
    // The flow driven all the way to the report, then abandoned. Nothing it decided is a write:
    // the reducer holds no database handle at all, and the screen is the only thing that commits.
    const storage = openTestDb();
    try {
      seedStarterSet(storage.db);
      const before = {
        accounts: accountsRepo(storage.db).list(),
        categories: categoriesRepo(storage.db).list(),
        sources: sourcesRepo(storage.db).list(),
        transactions: transactionsRepo(storage.db).listAll(),
      };

      const abandoned = toStep(
        redirectName(
          setAccountKind(started(), accountKey('готівка', 'UAH'), 'savings'),
          'categories',
          'булка',
          'groceries',
        ),
        'report',
      );
      expect(abandoned.plan!.transactions.length).toBeGreaterThan(0);

      expect(accountsRepo(storage.db).list()).toEqual(before.accounts);
      expect(categoriesRepo(storage.db).list()).toEqual(before.categories);
      expect(sourcesRepo(storage.db).list()).toEqual(before.sources);
      expect(transactionsRepo(storage.db).listAll()).toEqual(before.transactions);
    } finally {
      storage.close();
    }
  });

  it('Scenario: The plan is shown before it is committed', () => {
    const state = started();

    expect(planSummary(state)).toEqual({
      accounts: 2,
      newAccounts: 2,
      categories: 1,
      sources: 0,
      transactions: 2,
      droppedRows: 0,
      unassignedDebts: 0,
    });
  });

  it('Scenario: A reconciling рахунок is shown as equal', () => {
    const report = started().report!;

    const cash = report.accounts.find((a) => a.name === 'готівка')!;
    expect(cash.saldoBalance).toEqual(cash.planBalance);
    expect(cash.reconciles).toBe(true);
    expect(report.reconciles).toBe(true);
  });

  it('Scenario: A difference is shown with its explanation', () => {
    // One in-transit departure with no arrival: the рахунок it left cannot be explained by the
    // plan, so the report shows the gap and names the row.
    const unpaired = csv([
      ...pair({ id: '1', account: 'Monobank UAH, White', journalType: 'CREDIT', amount: '121.98', other: 'Monobank UAH, Black', otherType: 'MONEY_ON_THE_WAY' }),
    ]);

    const report = startWithText(startFlow(), unpaired).report!;

    const white = report.accounts.find((a) => a.name === 'Monobank UAH, White')!;
    expect(white.reconciles).toBe(false);
    expect(white.difference).toEqual(money(12198, 'UAH'));
    expect(white.explanations).toHaveLength(1);
    expect(white.explanations[0]).toMatchObject({ kind: 'export-row' });
    expect(report.droppedRows.map((row) => row.reason)).toContain('unpaired-in-transit');
  });

  it('Scenario: An over-repaid рахунок-борг is visible before the commit', () => {
    const overRepaid = csv([
      ...pair({ id: '1', datetime: '2024-11-01T10:00:00.000', description: 'борг', account: 'mono black', journalType: 'CREDIT', amount: '1000.00', other: 'Борг', otherType: 'EXPENSES' }),
      ...pair({ id: '2', datetime: '2024-11-02T10:00:00.000', description: 'борг', account: 'mono black', journalType: 'DEBIT', amount: '1100.00', other: 'Борг', otherType: 'EXPENSES' }),
    ]);
    const state = assignDescription(
      toStep(startWithText(startFlow(), overRepaid), 'report'),
      'борг',
      yaroslav,
    );

    expect(state.report!.debts).toEqual([
      expect.objectContaining({ name: 'Ярослав', balance: money(-10000, 'UAH') }),
    ]);
    // Visible, and still the owner's to judge: the commit stays on offer.
    expect(canCommit(state)).toBe(true);
  });
});

describe('the import flow — the commit gate', () => {
  it('The commit is not offered before the report has been shown', () => {
    const state = started();

    expect(state.reportSeen).toBe(false);
    expect(canCommit(state)).toBe(false);
    expect(canCommit(toStep(state, 'report'))).toBe(true);
  });

  it('Scenario: The first import needs no extra confirmation', () => {
    const state = toStep(started(), 'report');

    expect(state.previouslyCommittedAt).toBeUndefined();
    expect(state.secondImportConfirmed).toBe(false);
    expect(canCommit(state)).toBe(true);
  });

  it('Scenario: A second import states when the first happened', () => {
    const first = new Date('2026-08-25T12:00:00.000Z');

    const state = toStep(startWithText(startFlow({ previouslyCommittedAt: first }), ORDINARY), 'report');

    expect(state.previouslyCommittedAt).toEqual(first);
  });

  it('Scenario: Declining the extra confirmation writes nothing', () => {
    const first = new Date('2026-08-25T12:00:00.000Z');

    const state = toStep(startWithText(startFlow({ previouslyCommittedAt: first }), ORDINARY), 'report');

    // Nothing is written because nothing may be: the commit is not on offer at all.
    expect(canCommit(state)).toBe(false);
  });

  it('Scenario: Accepting the extra confirmation stores the second plan', () => {
    const first = new Date('2026-08-25T12:00:00.000Z');
    const state = toStep(startWithText(startFlow({ previouslyCommittedAt: first }), ORDINARY), 'report');

    const confirmed = confirmSecondImport(state);

    expect(canCommit(confirmed)).toBe(true);
  });

  it('Scenario: A committed plan reaches the rest of the app', () => {
    const state = toStep(started(), 'report');

    const done = committed(state, { accounts: 2, categories: 1, sources: 0, transactions: 2 });

    expect(done.step).toBe('done');
    expect(done.outcome).toEqual({
      kind: 'written',
      summary: { accounts: 2, categories: 1, sources: 0, transactions: 2 },
    });
    // Committed once, the flow offers no second commit of the same plan.
    expect(canCommit(done)).toBe(false);
  });

  it('Scenario: A failed commit leaves nothing behind', () => {
    const state = toStep(started(), 'report');

    const failed = commitFailed(state, 'FOREIGN KEY constraint failed');

    expect(failed.step).toBe('done');
    expect(failed.outcome).toEqual({ kind: 'failed', reason: 'FOREIGN KEY constraint failed' });
    expect(canCommit(failed)).toBe(false);
  });
});
