import { readFileSync } from 'node:fs';

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
import { narrow, PICKER_SIZE } from './shortlist';
import {
  accountRows,
  canCommit,
  commitFailed,
  committed,
  confirmSecondImport,
  dismissHint,
  duplicateHints,
  mapSections,
  mapSummary,
  mergeTargets,
  noTargetsMessage,
  receivesLine,
  planLine,
  planSummary,
  redirectAccount,
  redirectName,
  setAccountKind,
  startFlow,
  startWithText,
  stateLine,
  targetOf,
  toStep,
  writtenLine,
  SEPARATE_TARGET,
} from './saldo-import';

/** An export the flow can actually run on: an opening balance, a витрата and a переказ. */
const ORDINARY = csv([
  ...pair({
    id: '1',
    account: 'mono black',
    journalType: 'DEBIT',
    amount: '1000.00',
    other: 'Initial balance',
    otherType: 'EQUITY',
  }),
  ...pair({
    id: '2',
    datetime: '2024-11-01T10:00:00.000',
    account: 'mono black',
    journalType: 'CREDIT',
    amount: '250.00',
    other: 'булка',
    otherType: 'EXPENSES',
  }),
  ...pair({
    id: '3',
    datetime: '2024-11-02T10:00:00.000',
    account: 'mono black',
    journalType: 'CREDIT',
    amount: '300.00',
    other: 'готівка',
    otherType: 'CASH',
  }),
]);

const started = () => startWithText(startFlow(), ORDINARY);

describe('the import flow — choosing the export', () => {
  it('Scenario: A file with an alien header is refused with the reason', () => {
    const withoutJournalType = SALDO_COLUMNS.filter((column) => column !== 'Journal Type');
    const alien = csv(
      pair({
        id: '1',
        account: 'mono black',
        journalType: 'DEBIT',
        amount: '1.00',
        other: 'булка',
        otherType: 'EXPENSES',
      }),
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
      pair({
        id: '1',
        account: 'mono black',
        journalType: 'DEBIT',
        amount: '1,234.5',
        other: 'булка',
        otherType: 'EXPENSES',
      }),
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
      ...pair({
        id: '1',
        account: 'mono black',
        journalType: 'CREDIT',
        amount: '100.00',
        other: 'булка',
        otherType: 'EXPENSES',
      }),
      ...pair({
        id: '2',
        account: 'Monobank UAH, Black',
        journalType: 'CREDIT',
        amount: '200.00',
        other: 'булка',
        otherType: 'EXPENSES',
      }),
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

  it('Scenario: The targets are offered on the row', () => {
    const threeCards = csv([
      ...pair({
        id: '1',
        account: 'mono black',
        journalType: 'CREDIT',
        amount: '100.00',
        other: 'булка',
        otherType: 'EXPENSES',
      }),
      ...pair({
        id: '2',
        account: 'Monobank UAH, Black',
        journalType: 'CREDIT',
        amount: '200.00',
        other: 'булка',
        otherType: 'EXPENSES',
      }),
      ...pair({
        id: '3',
        account: 'готівка',
        journalType: 'CREDIT',
        amount: '300.00',
        other: 'булка',
        otherType: 'EXPENSES',
      }),
    ]);
    const existing = existingState({
      accounts: [
        existingAccount({ id: 'card', name: 'картка' }),
        { ...existingAccount({ id: 'old', name: 'закритий' }), archived: true },
      ],
    });
    const state = startWithText(startFlow({ existing }), threeCards);
    const mono = accountKey('mono black', 'UAH');

    const offered = mergeTargets(state, mono);

    // The other two entries, then the рахунки the owner keeps — and never the row itself.
    expect(offered.map((t) => t.id)).toEqual([
      `entry:${accountKey('Monobank UAH, Black', 'UAH')}`,
      `entry:${accountKey('готівка', 'UAH')}`,
      'account:card',
    ]);
    // The currency rides every label, on both halves of the list, in one format.
    expect(offered.map((t) => t.name)).toEqual([
      'Monobank UAH, Black · UAH',
      'готівка · UAH',
      'картка · UAH — наявний',
    ]);
    // The archived рахунок is not offered: an archived рахунок takes no new money.
    expect(offered.some((t) => t.id === 'account:old')).toBe(false);

    // An entry already merging away is not a target either — that would build a chain no row shows.
    const merged = redirectAccount(state, accountKey('готівка', 'UAH'), {
      to: 'entry',
      key: accountKey('Monobank UAH, Black', 'UAH'),
    });
    expect(mergeTargets(merged, mono).map((t) => t.id)).toEqual([
      `entry:${accountKey('Monobank UAH, Black', 'UAH')}`,
      'account:card',
    ]);

    // What a tap sends back is what `redirectAccount` takes, for both kinds of target.
    expect(targetOf(`entry:${mono}`)).toEqual({ to: 'entry', key: mono });
    expect(targetOf('account:card')).toEqual({ to: 'account', accountId: 'card' });
  });

  it('Scenario: Changing a вид changes what the month counts', () => {
    const reserve = csv([
      ...pair({
        id: '1',
        account: 'РЕЗЕРВ',
        journalType: 'DEBIT',
        amount: '500.00',
        other: 'Initial balance',
        otherType: 'EQUITY',
      }),
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
    const expense = redirected
      .plan!.transactions.map((planned) => planned.transaction)
      .find((t) => t.type === 'expense');
    expect(expense?.type === 'expense' && expense.categoryId).toBe('groceries');
  });
});

/** «Борг» history: lending and a repayment, both needing a person before anything may be stored. */
const DEBTS = csv([
  ...pair({
    id: '1',
    datetime: '2024-11-01T10:00:00.000',
    description: 'борг',
    account: 'mono black',
    journalType: 'CREDIT',
    amount: '1000.00',
    other: 'Борг',
    otherType: 'EXPENSES',
  }),
  ...pair({
    id: '2',
    datetime: '2024-11-02T10:00:00.000',
    description: 'борг',
    account: 'mono black',
    journalType: 'DEBIT',
    amount: '400.00',
    other: 'Борг',
    otherType: 'EXPENSES',
  }),
]);

describe('the import flow — «Борг»', () => {
  it('Scenario: The map step leads straight to the звірка', () => {
    // An export whose only rows are «Борг» ones: nothing is asked about them, and the commit is
    // offered off the report itself.
    const state = toStep(startWithText(startFlow(), DEBTS), 'report');

    expect(canCommit(state)).toBe(true);
    expect(state.step).toBe('report');
  });

  it('puts every «Борг» transaction on one рахунок-борг «Борги», asking nothing', () => {
    const state = startWithText(startFlow(), DEBTS);

    // Lent 1000 out, 400 came back — one рахунок-борг, and the decisions record is still empty.
    expect(state.plan!.accounts.filter((a) => a.kind === 'debt')).toEqual([
      expect.objectContaining({ name: 'Борги', currency: 'UAH' }),
    ]);
    expect(state.report!.debts).toEqual([
      expect.objectContaining({ name: 'Борги', balance: money(60000, 'UAH') }),
    ]);
    expect(state.decisions).toEqual({});
  });

  it('A рахунок the owner made a вид `debt` is not «Борги»', () => {
    // The ordinary export: a витрата and a переказ, no «Борг» leg anywhere in it.
    const state = startWithText(startFlow(), ORDINARY);

    const asDebt = setAccountKind(state, accountKey('готівка', 'UAH'), 'debt');

    // The переказ onto it now lands on a рахунок-борг, but no «Борги» was invented for an export
    // holding no «Борг» row.
    expect(asDebt.plan!.accounts.some((a) => a.kind === 'debt')).toBe(true);
    expect(asDebt.plan!.accounts.some((a) => a.name === 'Борги')).toBe(false);
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
      ...pair({
        id: '1',
        account: 'Monobank UAH, White',
        journalType: 'CREDIT',
        amount: '121.98',
        other: 'Monobank UAH, Black',
        otherType: 'MONEY_ON_THE_WAY',
      }),
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
      ...pair({
        id: '1',
        datetime: '2024-11-01T10:00:00.000',
        description: 'борг',
        account: 'mono black',
        journalType: 'CREDIT',
        amount: '1000.00',
        other: 'Борг',
        otherType: 'EXPENSES',
      }),
      ...pair({
        id: '2',
        datetime: '2024-11-02T10:00:00.000',
        description: 'борг',
        account: 'mono black',
        journalType: 'DEBIT',
        amount: '1100.00',
        other: 'Борг',
        otherType: 'EXPENSES',
      }),
    ]);
    const state = toStep(startWithText(startFlow(), overRepaid), 'report');

    expect(state.report!.debts).toEqual([
      expect.objectContaining({ name: 'Борги', balance: money(-10000, 'UAH') }),
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

    const state = toStep(
      startWithText(startFlow({ previouslyCommittedAt: first }), ORDINARY),
      'report',
    );

    expect(state.previouslyCommittedAt).toEqual(first);
  });

  it('Scenario: Declining the extra confirmation writes nothing', () => {
    const first = new Date('2026-08-25T12:00:00.000Z');

    const state = toStep(
      startWithText(startFlow({ previouslyCommittedAt: first }), ORDINARY),
      'report',
    );

    // Nothing is written because nothing may be: the commit is not on offer at all.
    expect(canCommit(state)).toBe(false);
  });

  it('Scenario: Accepting the extra confirmation stores the second plan', () => {
    const first = new Date('2026-08-25T12:00:00.000Z');
    const state = toStep(
      startWithText(startFlow({ previouslyCommittedAt: first }), ORDINARY),
      'report',
    );

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

/**
 * The account map as a screen: what a row says, which рахунки it may be merged onto, and the one
 * sentence the flow is allowed to state about a pair. Everything here is decided in this module
 * precisely because `verify` never runs JSX.
 */
describe('the account map — the compact list', () => {
  /** One витрата off `account`, which is all the survey needs to find a (рахунок, валюта) pair. */
  const spend = (id: string, account: string, currency = 'UAH') =>
    pair({
      id,
      account,
      journalType: 'CREDIT',
      amount: '100.00',
      currency,
      other: 'булка',
      otherType: 'EXPENSES',
    });

  /**
   * Six entries in four currencies' worth of shapes: a pair that is one card, two рахунки that are
   * nothing like it, and two USD entries that must never be offered to a UAH row. The export's own
   * order puts "Monobank UAH, Black" last, so a list that comes back with it first has been sorted.
   */
  const MANY = csv([
    ...spend('1', 'mono black'),
    ...spend('2', 'гаманець'),
    ...spend('3', 'OTP'),
    ...spend('4', 'Monobank UAH, Black'),
    ...spend('5', 'binance usdt', 'USD'),
    ...spend('6', 'валюта моно', 'USD'),
  ]);

  const many = (existing = existingState()) => startWithText(startFlow({ existing }), MANY);
  const MONO = accountKey('mono black', 'UAH');
  const MONOBANK = accountKey('Monobank UAH, Black', 'UAH');
  const WALLET = accountKey('гаманець', 'UAH');

  it("Scenario: Only рахунки of the row's currency are offered", () => {
    const state = many(
      existingState({
        accounts: [
          existingAccount({ id: 'card', name: 'картка' }),
          existingAccount({ id: 'usd', name: 'долари', currency: 'USD' }),
          {
            ...existingAccount({ id: 'old', name: 'закритий' }),
            archived: true,
          },
        ],
      }),
    );

    const offered = mergeTargets(state, MONO);

    // No USD рахунок, whether it comes from the import or from the owner's own list.
    expect(offered.map((t) => t.id)).not.toContain(`entry:${accountKey('binance usdt', 'USD')}`);
    expect(offered.map((t) => t.id)).not.toContain('account:usd');
    expect(offered.every((t) => t.name.includes('UAH'))).toBe(true);
    // And the exclusions that were already there still hold: the row itself, and an archived рахунок.
    expect(offered.map((t) => t.id)).not.toContain(`entry:${MONO}`);
    expect(offered.map((t) => t.id)).not.toContain('account:old');

    // A USD row is offered the USD рахунки and nothing else, so the filter is not "UAH only".
    const usd = mergeTargets(state, accountKey('binance usdt', 'USD'));
    expect(usd.map((t) => t.id)).toEqual([
      `entry:${accountKey('валюта моно', 'USD')}`,
      'account:usd',
    ]);
  });

  it('Scenario: The most alike name comes first', () => {
    const offered = mergeTargets(many(), MONO);

    // "Monobank UAH, Black" is last in the export and first in the list; the two names that
    // resemble "mono black" not at all keep the order they already had.
    expect(offered.map((t) => t.name)).toEqual([
      'Monobank UAH, Black · UAH',
      'гаманець · UAH',
      'OTP · UAH',
    ]);
  });

  it('Scenario: Creating a separate рахунок is always the way back', () => {
    const merged = redirectAccount(many(), MONO, {
      to: 'entry',
      key: MONOBANK,
    });
    expect(merged.plan!.accounts).toHaveLength(5);

    const undone = redirectAccount(merged, MONO, targetOf(SEPARATE_TARGET.id));

    expect(undone.plan!.accounts).toHaveLength(6);
    expect(accountRows(undone).find((r) => r.key === MONO)!.state).toBe('new');
    expect(undone.plan!.accounts.some((a) => a.name === 'mono black')).toBe(true);
  });

  it('Scenario: The way out is never a search result', () => {
    // Five real targets: three other UAH entries plus two рахунки the owner keeps.
    const state = many(
      existingState({
        accounts: [
          existingAccount({ id: 'card', name: 'картка' }),
          existingAccount({ id: 'jar', name: 'банка' }),
        ],
      }),
    );
    const offered = mergeTargets(state, MONO);

    expect(offered).toHaveLength(PICKER_SIZE);
    // So no search field is raised — and the way out is not one of the five that decides that.
    expect(offered.map((t) => t.id)).not.toContain(SEPARATE_TARGET.id);
    expect(SEPARATE_TARGET.name).toBe('Створити окремий рахунок');
  });

  it('Scenario: A search that matches nothing still leaves the way out', () => {
    const offered = mergeTargets(many(), MONO);

    expect(narrow(offered, 'mono').map((t) => t.name)).toEqual(['Monobank UAH, Black · UAH']);
    expect(narrow(offered, 'жодного такого')).toEqual([]);
    // `narrow` can never take the way out away, because the way out was never in the list.
    expect(narrow(offered, 'mono').map((t) => t.id)).not.toContain(SEPARATE_TARGET.id);
  });

  it('Scenario: A currency with nothing to merge says so', () => {
    const alone = csv([...spend('1', 'mono black'), ...spend('2', 'євро', 'EUR')]);
    const state = startWithText(startFlow(), alone);

    expect(mergeTargets(state, accountKey('євро', 'EUR'))).toEqual([]);
    expect(noTargetsMessage('EUR')).toBe('Немає рахунків у валюті EUR, з якими можна об’єднати');
  });

  it('Scenario: A row states what will happen without being opened', () => {
    const row = accountRows(many()).find((r) => r.key === MONO)!;

    expect(row.state).toBe('new');
    expect(row.receives).toEqual([]);
    expect(row.kindOverridden).toBe(false);
    expect(row.becomes.kind).toBe('spending');
    expect(row.entry.currency).toBe('UAH');
  });

  it('Scenario: A merged row states what it merges into', () => {
    const merged = redirectAccount(many(), MONO, {
      to: 'entry',
      key: MONOBANK,
    });
    const rows = accountRows(merged);

    expect(rows.find((r) => r.key === MONO)).toMatchObject({
      state: 'merged-entry',
      mergedInto: 'Monobank UAH, Black',
      receives: [],
    });
    // Readable from the other end too: the receiving row names what it takes in.
    expect(rows.find((r) => r.key === MONOBANK)).toMatchObject({
      state: 'new',
      receives: ['mono black'],
    });
  });

  it('Scenario: A row added to a рахунок the owner already has says so', () => {
    const existing = existingState({
      accounts: [existingAccount({ id: 'w', name: 'Гаманець' })],
    });
    const merged = redirectAccount(many(existing), WALLET, {
      to: 'account',
      accountId: 'w',
    });

    const row = accountRows(merged).find((r) => r.key === WALLET)!;
    expect(row.state).toBe('merged-existing');
    expect(row.ontoExisting).toBe(true);
    expect(row.mergedInto).toBeUndefined();
  });

  it('says whether the вид was changed by hand, so «Повернути вид із Saldo» has something to undo', () => {
    const state = many();
    expect(accountRows(state).find((r) => r.key === MONO)!.kindOverridden).toBe(false);

    const changed = setAccountKind(state, MONO, 'savings');
    expect(accountRows(changed).find((r) => r.key === MONO)!.kindOverridden).toBe(true);
  });
});

describe('the account map — підказки про дублі', () => {
  const spend = (id: string, account: string, currency = 'UAH') =>
    pair({
      id,
      account,
      journalType: 'CREDIT',
      amount: '100.00',
      currency,
      other: 'булка',
      otherType: 'EXPENSES',
    });

  const MANY = csv([
    ...spend('1', 'mono black'),
    ...spend('2', 'гаманець'),
    ...spend('3', 'OTP'),
    ...spend('4', 'Monobank UAH, Black'),
    ...spend('5', 'binance usdt', 'USD'),
    ...spend('6', 'валюта моно', 'USD'),
  ]);
  const many = (existing = existingState()) => startWithText(startFlow({ existing }), MANY);
  const MONO = accountKey('mono black', 'UAH');
  const MONOBANK = accountKey('Monobank UAH, Black', 'UAH');
  const WALLET = accountKey('гаманець', 'UAH');
  const OTP = accountKey('OTP', 'UAH');

  const hintOn = (state: ReturnType<typeof many>, key: string) =>
    accountRows(state).find((r) => r.key === key)?.duplicateHint;

  it('Scenario: An obvious duplicate is pointed out, not merged', () => {
    const state = many();

    expect([...duplicateHints(state).keys()]).toEqual([MONOBANK]);
    expect(hintOn(state, MONOBANK)).toEqual({
      id: `entry:${MONO}`,
      name: 'mono black',
    });
    // Nothing merged by the sentence alone: the plan still holds both.
    expect(state.plan!.accounts.filter((a) => a.currency === 'UAH')).toHaveLength(4);
  });

  it('Scenario: A pair is pointed out on one side only', () => {
    const state = many();

    // Both would qualify; the later of the two in the map's order carries it, naming the earlier.
    expect(hintOn(state, MONO)).toBeUndefined();
    expect(hintOn(state, MONOBANK)?.name).toBe('mono black');
  });

  it('Scenario: Taking the підказка merges exactly as the targets would', () => {
    const state = many();
    const hint = hintOn(state, MONOBANK)!;
    // The id it names is one of that row's own merge targets — the same value a pick sends back.
    expect(mergeTargets(state, MONOBANK).map((t) => t.id)).toContain(hint.id);

    const taken = redirectAccount(state, MONOBANK, targetOf(hint.id));

    expect(taken.plan!.accounts.filter((a) => a.currency === 'UAH')).toHaveLength(3);
    expect(accountRows(taken).find((r) => r.key === MONO)!.receives).toEqual([
      'Monobank UAH, Black',
    ]);
    // Undone through the row exactly as any other merge is.
    const undone = redirectAccount(taken, MONOBANK);
    expect(undone.plan!.accounts.filter((a) => a.currency === 'UAH')).toHaveLength(4);
  });

  it('Scenario: A рахунок the owner already has is pointed out', () => {
    const existing = existingState({
      accounts: [existingAccount({ id: 'w', name: 'Гаманець' })],
    });

    const state = many(existing);

    expect(hintOn(state, WALLET)).toEqual({
      id: 'account:w',
      name: 'Гаманець',
    });
  });

  it('Scenario: An archived рахунок is never named by a підказка', () => {
    const existing = existingState({
      accounts: [{ ...existingAccount({ id: 'old', name: 'OTP' }), archived: true }],
    });

    const state = many(existing);

    expect(hintOn(state, OTP)).toBeUndefined();
    expect(mergeTargets(state, OTP).map((t) => t.id)).not.toContain('account:old');
  });

  it('Scenario: Two candidates cancel each other out', () => {
    // The owner already keeps a рахунок named exactly like the entry the pair points at, so both
    // sides of the pair have two candidates apiece.
    const existing = existingState({
      accounts: [existingAccount({ id: 'mb', name: 'Monobank UAH, Black' })],
    });

    const state = many(existing);

    expect(hintOn(state, MONO)).toBeUndefined();
    expect(hintOn(state, MONOBANK)).toBeUndefined();
    // And the owner is left with the targets, which offer both.
    expect(mergeTargets(state, MONO).map((t) => t.id)).toEqual(
      expect.arrayContaining([`entry:${MONOBANK}`, 'account:mb']),
    );
  });

  it('Scenario: Different currencies are never called the same рахунок', () => {
    const twoCurrencies = csv([...spend('1', 'валюта моно'), ...spend('2', 'валюта моно', 'USD')]);

    const state = startWithText(startFlow(), twoCurrencies);

    expect([...duplicateHints(state).keys()]).toEqual([]);
  });

  it('Scenario: A merged row states its merge and no підказка', () => {
    const merged = redirectAccount(many(), MONOBANK, { to: 'entry', key: OTP });

    const row = accountRows(merged).find((r) => r.key === MONOBANK)!;
    expect(row.state).toBe('merged-entry');
    expect(row.duplicateHint).toBeUndefined();
  });

  it('Scenario: A підказка naming a рахунок that has since been merged away is withdrawn', () => {
    const state = many();
    expect(hintOn(state, MONOBANK)?.name).toBe('mono black');

    const elsewhere = redirectAccount(state, MONO, {
      to: 'entry',
      key: WALLET,
    });

    expect(hintOn(elsewhere, MONOBANK)).toBeUndefined();
    // What is left to the owner is the targets, which no longer offer the entry that merged away.
    expect(mergeTargets(elsewhere, MONOBANK).map((t) => t.id)).not.toContain(`entry:${MONO}`);
  });

  it('Scenario: A dismissed підказка does not come back', () => {
    const state = many();

    const dismissed = dismissHint(state, MONOBANK);

    expect(hintOn(dismissed, MONOBANK)).toBeUndefined();
    expect(accountRows(dismissed).find((r) => r.key === MONOBANK)!.state).toBe('new');
    // Going on to the звірка and back does not bring it back — and dismissing twice is one entry.
    const returned = toStep(toStep(dismissed, 'report'), 'accounts');
    expect(hintOn(returned, MONOBANK)).toBeUndefined();
    expect(dismissHint(dismissed, MONOBANK).dismissedHints).toEqual([MONOBANK]);
    // Nothing about it is a decision: the plan is bit-for-bit the plan before it.
    expect(dismissed.decisions).toEqual(state.decisions);
    expect(dismissed.plan).toEqual(state.plan);
  });

  it('a new export forgets what was dismissed on the last one', () => {
    const dismissed = dismissHint(many(), MONOBANK);

    expect(startWithText(dismissed, MANY).dismissedHints).toEqual([]);
  });
});

describe('the account map — the opening line and the two groups', () => {
  const spend = (id: string, account: string) =>
    pair({
      id,
      account,
      journalType: 'CREDIT',
      amount: '100.00',
      other: 'булка',
      otherType: 'EXPENSES',
    });

  /**
   * The owner's own export in shape rather than in content: twenty-three (рахунок, валюта) pairs,
   * of which one pair is plainly one card and one entry is plainly a рахунок they already keep.
   */
  const NAMES = [
    'mono black',
    'Monobank UAH, Black',
    'гаманець',
    ...Array.from({ length: 20 }, (_, i) => `банка ${i + 4}`),
  ];
  const TWENTY_THREE = csv(NAMES.flatMap((name, index) => spend(String(index + 1), name)));
  const EXISTING = existingState({
    accounts: [existingAccount({ id: 'w', name: 'Гаманець' })],
  });
  const big = () => startWithText(startFlow({ existing: EXISTING }), TWENTY_THREE);

  const MONOBANK = accountKey('Monobank UAH, Black', 'UAH');
  const WALLET = accountKey('гаманець', 'UAH');

  it('Scenario: The step opens with what it found and the way on', () => {
    const state = big();

    expect(mapSummary(state)).toMatchObject({ accounts: 23, duplicates: 2 });
    expect(mapSummary(state).sentence).toBe(
      '23 рахунки з Saldo. 2 схожі на дублі — перевірте їх; решту буде створено окремо.',
    );
  });

  it('says so plainly when the export holds no likely dubles at all', () => {
    const plain = startWithText(startFlow(), csv(spend('1', 'mono black')));

    expect(mapSummary(plain)).toMatchObject({ accounts: 1, duplicates: 0 });
    expect(mapSummary(plain).sentence).toBe(
      '1 рахунок з Saldo. Дублів не видно — усі буде створено окремо.',
    );
  });

  it('Scenario: Twenty-three entries are twenty-three rows and no chips', () => {
    const sections = mapSections(big());

    expect(sections.duplicates.map((r) => r.key)).toEqual([MONOBANK, WALLET]);
    expect(sections.rest).toHaveLength(21);
    expect(sections.duplicates.length + sections.rest.length).toBe(mapSummary(big()).accounts);
  });

  it('Scenario: Going on without touching anything creates every рахунок separately', () => {
    const state = big();

    expect(state.plan!.accounts).toHaveLength(23);
    expect(planSummary(state)?.newAccounts).toBe(23);
    expect(accountRows(state).every((row) => row.state === 'new')).toBe(true);
  });

  it('Scenario: Neither the grouping nor the counts move while the owner decides', () => {
    const state = big();
    const before = mapSections(state).duplicates.map((r) => r.key);

    const merged = redirectAccount(state, MONOBANK, {
      to: 'account',
      accountId: 'w',
    });
    const undone = redirectAccount(merged, MONOBANK);
    const dismissed = dismissHint(state, MONOBANK);

    for (const after of [merged, undone, dismissed]) {
      expect(mapSections(after).duplicates.map((r) => r.key)).toEqual(before);
      expect(mapSections(after).rest).toHaveLength(21);
      expect(mapSummary(after)).toMatchObject({ accounts: 23, duplicates: 2 });
    }
    // The merged row is still in its group — saying what it now is.
    expect(mapSections(merged).duplicates[0]!.state).toBe('merged-existing');
    expect(mapSections(merged).duplicates[0]!.duplicateHint).toBeUndefined();
  });
});

/**
 * What the screen does with all of that, asserted over its source.
 *
 * The gate never runs JSX, so the rules above can be perfect and the step still draw 621 chips.
 * These are the same structural assertions `entry-form.test.ts` uses for the same blind spot: they
 * prove the accounts step reads its rows from this module, draws no list until an editor is opened,
 * holds one editor for all three lists, and answers the phone's «назад». What the owner then *sees*
 * is the emulator pass's question, not this file's.
 */
describe('the accounts step draws what this module decided', () => {
  const screen = readFileSync(new URL('../app/manage/saldo-import.tsx', import.meta.url), 'utf8');

  it('builds its rows and its opening line here, not in the screen', () => {
    expect(screen).toContain('mapSections(flow)');
    expect(screen).toContain('mapSummary(flow)');
    expect(screen).toContain('sections.duplicates.map(mapRow)');
    expect(screen).toContain('sections.rest.map(mapRow)');
    // Neither group is headed when it is empty — the emulator found «Решта рахунків (0)» over
    // nothing, beside an opening line that promised that rest would be created.
    expect(screen).toContain('sections.rest.length > 0 ? (');
    expect(screen).toContain('sections.duplicates.length > 0 ? (');
    expect(screen).toContain('flow.plan!.categories.length + flow.plan!.sources.length > 0 ? (');
    expect(screen).toContain('{opening.sentence}');
    // The rows are `accountRows` already grouped, so the screen never re-derives its own list.
    expect(screen).not.toContain('accountRows(');
    // The words of a row are the module's too, beside `mapSummary` and `noTargetsMessage`.
    expect(screen).toContain('stateLine(row)');
    expect(screen).toContain('receivesLine(row)');
  });

  it('Scenario: Nothing is drawn until the row is asked', () => {
    // Both lists are behind the one editor flag: `mergeTargets` is not even called for a closed
    // row, and `KIND_CHOICES` is drawn after the вид has been opened, never beside it.
    expect(screen).toContain(
      "const targets = isOpen(row.key, 'merge') ? mergeTargets(flow, row.key) : [];",
    );
    const kindGate = screen.indexOf("{isOpen(row.key, 'kind') && row.state === 'new' ? (");
    expect(kindGate).toBeGreaterThan(-1);
    expect(screen.indexOf('choices={KIND_CHOICES}')).toBeGreaterThan(kindGate);
    expect(screen.split('KIND_CHOICES').length - 1).toBe(2); // the import and the one drawing
    // And the вид is offered only where it decides something: `interpret` reads the вид of the
    // owner entry a redirect resolves to, so on a merged-away row the control would be a no-op.
    expect(screen).toContain(
      `{row.state === 'new' ? (\n            <RowAction title="Вид" onPress={() => openEditor(row.key, 'kind')} />`,
    );
  });

  it('holds one open editor for all three lists, and lets «назад» close it', () => {
    expect(screen).toContain("editor: 'merge' | 'kind' | 'name'");
    expect(screen).toContain('useCloseOnBack(open !== undefined, close)');
    // The категорія/джерело list is the third editor rather than a flag of its own inside NameRow.
    const nameRow = screen.slice(screen.indexOf('function NameRow('));
    expect(nameRow).not.toContain('useState');
    expect(screen).toContain("openEditor(`c-${proposal.saldoName}`, 'name')");
    expect(screen).toContain("openEditor(`s-${proposal.saldoName}`, 'name')");
  });

  it('draws the way out above the targets, and never inside the search', () => {
    // `narrowed` is what the search leaves standing; `SEPARATE_TARGET` is prepended to it, so it
    // stands first and no query can take it away.
    expect(screen).toContain('{ value: SEPARATE_TARGET.id, label: SEPARATE_TARGET.name },');
    expect(screen).toContain('...narrowed.map((target) => ({');
    expect(screen).toContain('targets.length > PICKER_SIZE ? (');
    expect(screen).toContain('noTargetsMessage(row.entry.currency)');
    expect(screen).toContain('{NOTHING_FOUND}');
  });

  it('takes a підказка про дубль through the same redirect a pick makes', () => {
    expect(screen).toContain('onPress={() => merge(row.duplicateHint!.id)}');
    expect(screen).toContain('onSelect={merge}');
    expect(screen).toContain('setFlow((c) => dismissHint(c, row.key))');
    expect(screen).toContain('Схоже, це той самий рахунок → ');
  });

  it('offers the way on under the opening line as well as after the last row', () => {
    expect(screen.split('title="Далі — звірка"').length - 1).toBe(2);
  });
});

/**
 * The rest of the map's scenarios, each named after the one it proves. Two of them — the narrow
 * screen and the size of a touch target — can only be *seen* on a device; what stands here is the
 * structure that makes them true, and §6.1's emulator pass is what actually looks at them.
 */
describe('the account map — what is offered, and what is not', () => {
  const spend = (id: string, account: string, currency = 'UAH') =>
    pair({
      id,
      account,
      journalType: 'CREDIT',
      amount: '100.00',
      currency,
      other: 'булка',
      otherType: 'EXPENSES',
    });

  const MANY = csv([
    ...spend('1', 'mono black'),
    ...spend('2', 'гаманець'),
    ...spend('3', 'OTP'),
    ...spend('4', 'Monobank UAH, Black'),
  ]);
  const MONO = accountKey('mono black', 'UAH');
  const MONOBANK = accountKey('Monobank UAH, Black', 'UAH');
  const OTP = accountKey('OTP', 'UAH');

  it('Scenario: An entry already merged away is not a target', () => {
    const state = startWithText(startFlow(), MANY);

    const merged = redirectAccount(state, MONO, { to: 'entry', key: MONOBANK });

    const offered = mergeTargets(merged, OTP).map((t) => t.id);
    expect(offered).toContain(`entry:${MONOBANK}`);
    expect(offered).not.toContain(`entry:${MONO}`);
  });

  it('Scenario: An archived рахунок is not a target', () => {
    const existing = existingState({
      accounts: [{ ...existingAccount({ id: 'old', name: 'закритий' }), archived: true }],
    });

    const offered = mergeTargets(startWithText(startFlow({ existing }), MANY), MONO);

    expect(offered.map((t) => t.id)).not.toContain('account:old');
  });

  it('Scenario: An existing рахунок is told apart from an entry of the import', () => {
    // The owner keeps a «гаманець» and the export holds a Saldo account of the same name, both UAH.
    const existing = existingState({ accounts: [existingAccount({ id: 'w', name: 'гаманець' })] });

    const offered = mergeTargets(startWithText(startFlow({ existing }), MANY), MONO);

    expect(offered.map((t) => t.name)).toContain('гаманець · UAH');
    expect(offered.map((t) => t.name)).toContain('гаманець · UAH — наявний');
  });

  it('Scenario: Long lists of targets are searched by name', () => {
    const wide = csv([
      ...spend('1', 'mono black'),
      ...spend('2', 'Monobank UAH, Black'),
      ...spend('3', 'monobank біла'),
      ...Array.from({ length: 15 }, (_, i) => spend(String(i + 4), `банка ${i + 4}`)).flat(),
    ]);
    const state = startWithText(startFlow(), wide);

    const offered = mergeTargets(state, MONO);
    expect(offered).toHaveLength(17);
    expect(offered.length).toBeGreaterThan(PICKER_SIZE);

    // «mono» in any letter case, matched anywhere in the name.
    expect(narrow(offered, 'mono').map((t) => t.name)).toEqual([
      'Monobank UAH, Black · UAH',
      'monobank біла · UAH',
    ]);
    expect(narrow(offered, 'MONO')).toEqual(narrow(offered, 'mono'));
  });

  it('Scenario: A вид changed by hand can be given back to Saldo', () => {
    const reserve = csv([
      ...pair({
        id: '1',
        account: 'РЕЗЕРВ',
        journalType: 'DEBIT',
        amount: '500.00',
        other: 'Initial balance',
        otherType: 'EQUITY',
      }),
    ]);
    const key = accountKey('РЕЗЕРВ', 'UAH');
    const changed = setAccountKind(startWithText(startFlow(), reserve), key, 'savings');
    expect(changed.plan!.accounts[0]!.kind).toBe('savings');

    const given = setAccountKind(changed, key);

    expect(accountRows(given)[0]!.becomes.kind).toBe('spending');
    expect(given.plan!.accounts[0]!.kind).toBe('spending');
    expect(accountRows(given)[0]!.kindOverridden).toBe(false);
  });

  /**
   * Why the screen offers «Вид» only on a row that becomes its own рахунок. `interpret` reads the
   * kind of the *owner* entry a redirect resolves to (`src/saldo/survey.ts`), so a вид chosen on a
   * merged-away row is written into `Decisions` and never read — a control that appears to set what
   * the month counts and does not. Drawing it there was the old screen's regression, caught in
   * review; this is the test that keeps it caught.
   */
  it('a вид chosen on a merged-away row would change nothing, which is why it is not offered', () => {
    const merged = redirectAccount(startWithText(startFlow(), MANY), MONO, {
      to: 'entry',
      key: MONOBANK,
    });

    const attempted = setAccountKind(merged, MONO, 'savings');

    expect(accountRows(attempted).find((r) => r.key === MONO)!.becomes.kind).toBe('spending');
    expect(attempted.plan!.accounts).toEqual(merged.plan!.accounts);
  });

  it('names what a row receives, and says nothing when the receiver is not on the screen', () => {
    const existing = existingState({ accounts: [existingAccount({ id: 'w', name: 'спільний' })] });
    const state = startWithText(startFlow({ existing }), MANY);

    // Two entries onto one рахунок of the owner's: the thing receiving them is not a row here, so
    // neither row claims to receive the other — each says what it is, «Додається до наявного «…»».
    const both = redirectAccount(
      redirectAccount(state, MONO, { to: 'account', accountId: 'w' }),
      MONOBANK,
      { to: 'account', accountId: 'w' },
    );

    for (const key of [MONO, MONOBANK]) {
      const row = accountRows(both).find((r) => r.key === key)!;
      expect(row.receives).toEqual([]);
      expect(stateLine(row)).toBe('Додається до наявного «спільний»');
      expect(receivesLine(row)).toBeUndefined();
    }
  });

  it('says each of the three row states in the owner’s words', () => {
    const state = startWithText(startFlow(), MANY);
    expect(stateLine(accountRows(state).find((r) => r.key === MONO)!)).toBe('Новий рахунок');

    const merged = redirectAccount(state, MONO, { to: 'entry', key: MONOBANK });
    expect(stateLine(accountRows(merged).find((r) => r.key === MONO)!)).toBe(
      'Об’єднується з «Monobank UAH, Black»',
    );
    expect(receivesLine(accountRows(merged).find((r) => r.key === MONOBANK)!)).toBe(
      'Приймає: «mono black»',
    );
  });
});

/**
 * The scenarios whose whole subject is the screen's wiring: which editor is open, what «назад»
 * does over it, and that closing one decides nothing. `verify` cannot press a chip, so what stands
 * here is the structure that makes each true — the emulator pass of §6.1 is what presses them.
 */
describe('the accounts step keeps one editor, and «назад» closes it', () => {
  const screen = readFileSync(new URL('../app/manage/saldo-import.tsx', import.meta.url), 'utf8');

  it("Scenario: Opening one row's targets closes another's", () => {
    // One flag for the whole step, replaced wholesale, and read by both key *and* editor: two rows
    // cannot be open at once because there is nowhere to record that they are.
    expect(screen).toContain(
      "const [open, setOpen] = useState<{ key: string; editor: 'merge' | 'kind' | 'name' } | undefined>",
    );
    expect(screen).toContain('setOpen({ key, editor });');
    expect(screen).toContain("open?.key === key && open.editor === editor");
  });

  it('Scenario: Opening a вид closes the open targets', () => {
    // The same one flag carries the editor as well as the row, so opening a вид displaces targets
    // exactly as it displaces another row's вид.
    expect(screen).toContain("openEditor(row.key, 'merge')");
    expect(screen).toContain("openEditor(row.key, 'kind')");
    expect(screen).toContain("const targets = isOpen(row.key, 'merge') ? mergeTargets(flow, row.key) : [];");
  });

  it('Scenario: «Назад» closes the open targets before the step', () => {
    expect(screen).toContain('useCloseOnBack(open !== undefined, close)');
  });

  it('Scenario: «Назад» closes an open вид before the step', () => {
    // One subscription answers for all three editors, and `backGesture` is what decides — proven
    // in `src/ui/back-gesture.test.ts`; this is the caller.
    expect(screen).toContain('useCloseOnBack(open !== undefined, close)');
    expect(screen).toContain("import { useCloseOnBack } from '@/hooks/use-close-on-back';");
  });

  it('Scenario: «Назад» closes an open list of existing rows before the step', () => {
    // The категорія/джерело list is the third editor rather than a flag of its own inside NameRow,
    // which is what puts it under the same «назад».
    const nameRow = screen.slice(screen.indexOf('function NameRow('));
    expect(nameRow).not.toContain('useState');
    expect(screen).toContain("openEditor(`c-${proposal.saldoName}`, 'name')");
    expect(screen).toContain("openEditor(`s-${proposal.saldoName}`, 'name')");
  });

  it('Scenario: Closing the targets without choosing changes nothing', () => {
    // `close` touches the two pieces of presentation and never `setFlow`, so «Згорнути» and «назад»
    // cannot decide anything on their way out.
    const body = screen.slice(screen.indexOf('const close = useCallback('));
    expect(body.slice(0, body.indexOf('}, []);'))).not.toContain('setFlow');
    expect(screen).toContain('<RowAction title={COLLAPSE_LABEL} tone="quiet" onPress={close} />');
  });

  it('Scenario: The existing категорії are searched rather than scrolled', () => {
    const nameRow = screen.slice(screen.indexOf('function NameRow('));
    expect(nameRow).toContain('const narrowed = narrow(rows, query);');
    expect(nameRow).toContain('rows.length > PICKER_SIZE ? (');
    expect(nameRow).toContain('{NOTHING_FOUND}');
  });

  it('Scenario: A long Saldo name does not push the currency off the screen', () => {
    // The four facts are four lines of a column, not a row: nothing is laid out beside the назва,
    // and nothing truncates it, so a long one wraps and the currency and the state stay below it.
    // What that looks like at 375 dp is the emulator pass's question (§6.1).
    const row = screen.slice(screen.indexOf('const mapRow = (row: AccountRow) => {'));
    const head = row.slice(0, row.indexOf('{row.rejection ?'));
    expect(head).toContain('<ThemedText type="smallBold">{row.entry.saldoAccount}</ThemedText>');
    expect(head).not.toContain('numberOfLines');
    expect(head).not.toContain('flexDirection');
    // Nothing on the step scrolls sideways. Asserted as the `horizontal` prop rather than as the
    // absence of a `ScrollView`: the column this screen sits in is one, and a vertical one here
    // would be legitimate — it is the sideways gesture the requirement forbids.
    expect(screen).not.toContain('horizontal={');
    expect(screen).not.toMatch(/<ScrollView[^>]*\shorizontal\b/);
  });

  it('Scenario: Every action of a row is a full touch target', () => {
    // Every tappable thing on the step is an `Action`, a `RowAction` or a `Choices` chip — there is
    // no bare `Pressable` here — and `src/components/form.tsx` is where each gets its size: the
    // action carries `TouchTarget` outright, the chip is 38 tall and the row action ~36, both
    // reaching 48 through `hitSlop`.
    const step = screen.slice(
      screen.indexOf('const mapRow = (row: AccountRow) => {'),
      screen.indexOf("{flow.step === 'report'"),
    );
    expect(step).not.toContain('Pressable');
    expect(step).not.toContain('TouchableOpacity');
    const form = readFileSync(new URL('../components/form.tsx', import.meta.url), 'utf8');
    expect(form).toContain('minHeight: TouchTarget');
    expect(form).toContain('hitSlop={Spacing.two}');
    // The two verbs of a підказка sit further apart than their own hitSlop, so a tap between them
    // cannot land on the one that merges.
    expect(screen).toContain("actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three }");
  });
});

/**
 * Two defects the emulator found in the opening line, on data the unit tests had not reached: a
 * count of five or more, and a map where *every* row carries a підказка. The owner's own export
 * hides both — 23 falls in the *few* bucket and its rest is never empty.
 */
describe('the opening line stays true and stays Ukrainian', () => {
  const spend = (id: string, account: string) =>
    pair({
      id,
      account,
      journalType: 'CREDIT',
      amount: '100.00',
      other: 'булка',
      otherType: 'EXPENSES',
    });

  /** N entries the owner already has a рахунок of the same name for, plus `rest` that they do not. */
  const map = (duplicates: number, rest: number) => {
    const alike = Array.from({ length: duplicates }, (_, i) => `картка ${i + 1}`);
    const others = Array.from({ length: rest }, (_, i) => `конверт ${i + 1}`);
    const csvText = csv([...alike, ...others].flatMap((name, i) => spend(String(i + 1), name)));
    const existing = existingState({
      accounts: alike.map((name, i) => existingAccount({ id: `e${i}`, name })),
    });
    return startWithText(startFlow({ existing }), csvText);
  };

  it('declines the adjective and not the noun after «на» — «13 схожих на дублі»', () => {
    // The emulator read «13 схожих на дублів» off the 12-entry slice: «дубль» is the object of «на»
    // and stays in the accusative plural at every count; only «схожий» declines with the number.
    expect(mapSummary(map(13, 4)).sentence).toBe(
      '17 рахунків з Saldo. 13 схожих на дублі — перевірте їх; решту буде створено окремо.',
    );
    // The two-clause sentence design D9 states, unchanged.
    expect(mapSummary(map(2, 21)).sentence).toBe(
      '23 рахунки з Saldo. 2 схожі на дублі — перевірте їх; решту буде створено окремо.',
    );
    expect(mapSummary(map(1, 4)).sentence).toBe(
      '5 рахунків з Saldo. 1 схожий на дубль — перевірте його; решту буде створено окремо.',
    );
  });

  it('promises no rest when there is no rest', () => {
    // «решту буде створено окремо» over a «Решта рахунків (0)» is a sentence the screen contradicts
    // two lines below itself. The requirement is that the line stays true.
    expect(mapSections(map(13, 0)).rest).toHaveLength(0);
    expect(mapSummary(map(13, 0)).sentence).toBe(
      '13 рахунків з Saldo. Усі схожі на дублі — перевірте їх.',
    );
    expect(mapSummary(map(1, 0)).sentence).toBe(
      '1 рахунок з Saldo. Він схожий на дубль — перевірте його.',
    );
  });
});

describe('saldo-import-screen — The import states its four counts in the form each number asks for', () => {
  it('Scenario: A plan of small counts reads as Ukrainian', () => {
    expect(
      planLine({
        accounts: 2,
        newAccounts: 2,
        categories: 3,
        sources: 1,
        transactions: 5,
        droppedRows: 0,
      }),
    ).toBe('Буде записано: 5 транзакцій, 2 рахунки, 3 категорії, 1 джерело.');
  });

  it('Scenario: The result line agrees with itself', () => {
    expect(writtenLine({ accounts: 1, categories: 14, sources: 4, transactions: 21 })).toBe(
      'Записано: 21 транзакція, 1 рахунок, 14 категорій, 4 джерела.',
    );
  });

  it('One of everything is one of everything', () => {
    expect(writtenLine({ accounts: 1, categories: 1, sources: 1, transactions: 1 })).toBe(
      'Записано: 1 транзакція, 1 рахунок, 1 категорія, 1 джерело.',
    );
  });

  it('The teens take the many form on all four counts', () => {
    expect(
      planLine({
        accounts: 12,
        newAccounts: 12,
        categories: 13,
        sources: 14,
        transactions: 11,
        droppedRows: 0,
      }),
    ).toBe('Буде записано: 11 транзакцій, 12 рахунків, 13 категорій, 14 джерел.');
  });

  it('The plan line counts the рахунки it would create, not every рахунок it touches', () => {
    expect(
      planLine({
        accounts: 5,
        newAccounts: 2,
        categories: 0,
        sources: 0,
        transactions: 0,
        droppedRows: 0,
      }),
    ).toContain('2 рахунки');
  });

  it('The two sentences are not built inside the screen, where nothing can read them', () => {
    // `verify` never runs JSX, so a sentence left in `saldo-import.tsx` is a sentence no test
    // covers — which is how «2 рахунків» reached the emulator in the first place.
    const screen = readFileSync('src/app/manage/saldo-import.tsx', 'utf8');
    expect(screen).not.toContain('Буде записано:');
    expect(screen).not.toContain('Записано:');
    expect(screen).toContain('planLine(');
    expect(screen).toContain('writtenLine(');
  });
});
