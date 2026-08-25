import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account, classifyTransfer, computeBalance } from '../domain/account';
import { proposeForTransfer } from '../ui/entry-form';
import { money } from '../domain/money';
import {
  expenseByDefault,
  proposeFee,
  refund,
  transfer,
  FEES_CATEGORY_ID,
  INTEREST_SOURCE_ID,
  UNCATEGORISED_CATEGORY_ID,
  type Correction,
  type Income,
  type Transaction,
  type Transfer,
} from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { openFileDb, openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';

/**
 * The categories and sources these transactions point at. A stored витрата, повернення or дохід
 * references a real row since categories-rules, and none of the tests below is about that rule —
 * they declare the vocabulary and get on with their subject.
 */
const VOCABULARY = {
  categories: ['food', 'clothes', 'electronics', UNCATEGORISED_CATEGORY_ID, FEES_CATEGORY_ID],
  sources: ['salary'],
} as const;

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(100000, 'UAH'),
});
const usd = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });
const wallet = account({ id: 'wallet', name: 'гаманець', kind: 'cash', currency: 'UAH' });

const income: Income = {
  type: 'income',
  id: 'i1',
  date: '2026-03-01',
  accountId: 'card',
  amount: money(5000000, 'UAH'),
  sourceId: 'salary',
};

const correction: Correction = {
  type: 'correction',
  id: 'c1',
  date: '2026-03-31',
  accountId: 'card',
  amount: money(-3000, 'UAH'),
};

const crossCurrencyTransfer = transfer({
  id: 't1',
  date: '2026-03-15',
  fromAccountId: 'card',
  toAccountId: 'usd',
  left: money(410000, 'UAH'),
  arrived: money(10000, 'USD'),
});

/** Fixed instants: storage recency is data these tests control, never the wall clock. */
const at = (iso: string): Date => new Date(iso);
const storedAt = at('2026-03-01T09:00:00.000Z');

function seedAccounts(storage: TestStorage): void {
  const repo = accountsRepo(storage.db);
  repo.save(card);
  repo.save(usd);
  repo.save(wallet);
}

describe('transactionsRepo', () => {
  let storage: TestStorage;
  let repo: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    seedAccounts(storage);
    repo = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: Expense with an original-currency amount round-trips', () => {
    const foreignPurchase = expenseByDefault({
      id: 'e1',
      date: '2026-03-10',
      accountId: 'card',
      amount: money(420000, 'UAH'),
      categoryId: 'electronics',
      originalAmount: money(10000, 'USD'),
    });
    repo.save(foreignPurchase, storedAt);

    const loaded = repo.get('e1');
    expect(loaded).toEqual(foreignPurchase);
    expect(loaded).toMatchObject({
      type: 'expense',
      amount: money(420000, 'UAH'),
      categoryId: 'electronics',
      originalAmount: money(10000, 'USD'),
    });
  });

  it('Scenario: Cross-currency transfer round-trips with two legs and no rate', () => {
    repo.save(crossCurrencyTransfer, storedAt);

    const loaded = repo.get('t1');
    expect(loaded).toEqual(crossCurrencyTransfer);
    expect(loaded).toMatchObject({
      type: 'transfer',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(410000, 'UAH'),
      arrived: money(10000, 'USD'),
    });
    // No exchange rate exists anywhere in storage: read the migrated table itself, not the
    // schema object, so a stray migrated column could not hide.
    const columns = storage.db
      .all<{ name: string }>(sql`PRAGMA table_info(transactions)`)
      .map((column) => column.name);
    expect(columns.filter((name) => name.includes('rate'))).toEqual([]);
  });

  it('Scenario: Income, refund and correction round-trip', () => {
    const clothesRefund = refund({
      id: 'r1',
      date: '2026-03-18',
      accountId: 'card',
      amount: money(80000, 'UAH'),
      categoryId: 'clothes',
    });
    repo.save(income, storedAt);
    repo.save(clothesRefund, storedAt);
    repo.save(correction, storedAt);

    expect(repo.get('i1')).toEqual(income);
    expect(repo.get('i1')).toMatchObject({ amount: money(5000000, 'UAH'), sourceId: 'salary' });
    expect(repo.get('r1')).toEqual(clothesRefund);
    expect(repo.get('r1')).toMatchObject({ amount: money(80000, 'UAH'), categoryId: 'clothes' });
    expect(repo.get('c1')).toEqual(correction);
    const loadedCorrection = repo.get('c1');
    expect(loadedCorrection?.type).toBe('correction');
    // The negative sign survives storage; a correction below zero counts as spent.
    expect(loadedCorrection).toMatchObject({ amount: money(-3000, 'UAH') });
  });

  it('Scenario: Loading an unknown id returns nothing', () => {
    expect(repo.get('never-stored')).toBeUndefined();
  });

  it('Scenario: A transaction referencing an unknown account is rejected', () => {
    const orphan = expenseByDefault({
      id: 'e-orphan',
      date: '2026-03-10',
      accountId: 'no-such-account',
      amount: money(12550, 'UAH'),
      categoryId: 'food',
    });
    expect(() => repo.save(orphan, storedAt)).toThrow();
    expect(repo.get('e-orphan')).toBeUndefined();
  });

  it('A date that is not a calendar date never reaches storage', () => {
    // The column CHECK only proves the 'NNNN-NN-NN' shape; the repository proves the date exists.
    const impossible: Transaction = { ...correction, id: 'c-impossible', date: '2026-02-31' };
    expect(() => repo.save(impossible, storedAt)).toThrow();
    expect(repo.get('c-impossible')).toBeUndefined();
  });

  it('Scenario: A transaction referencing an unknown account is rejected (transfer legs too)', () => {
    const orphanTransfer = transfer({
      id: 't-orphan',
      date: '2026-03-15',
      fromAccountId: 'card',
      toAccountId: 'no-such-account',
      left: money(1000, 'UAH'),
      arrived: money(1000, 'UAH'),
    });
    expect(() => repo.save(orphanTransfer, storedAt)).toThrow();
    expect(repo.get('t-orphan')).toBeUndefined();
  });
});

describe('transactionsRepo on a file database', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-db-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: Reopening storage returns what was stored', () => {
    const path = join(dir, 'cap1tal.db');
    const expense = expenseByDefault({
      id: 'e1',
      date: '2026-03-10',
      accountId: 'card',
      amount: money(12550, 'UAH'),
      categoryId: 'food',
    });

    const first = openFileDb(path);
    seedReferences(first.db, VOCABULARY);
    accountsRepo(first.db).save(card);
    transactionsRepo(first.db).save(expense, storedAt);
    first.close();

    const reopened = openFileDb(path);
    try {
      expect(accountsRepo(reopened.db).get('card')).toEqual(card);
      expect(transactionsRepo(reopened.db).get('e1')).toEqual(expense);
    } finally {
      reopened.close();
    }
  });
});

describe('transactionsRepo listings', () => {
  let storage: TestStorage;
  let repo: TransactionsRepo;

  const march31 = expenseByDefault({
    id: 'e-march',
    date: '2026-03-31',
    accountId: 'card',
    amount: money(10000, 'UAH'),
    categoryId: 'food',
  });
  const april1 = expenseByDefault({
    id: 'e-april',
    date: '2026-04-01',
    accountId: 'card',
    amount: money(20000, 'UAH'),
    categoryId: 'food',
  });

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    seedAccounts(storage);
    repo = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: Month boundaries are respected', () => {
    repo.save(march31, storedAt);
    repo.save(april1, storedAt);

    expect(repo.listMonth('2026-03')).toEqual([march31]);
    expect(repo.listMonth('2026-04')).toEqual([april1]);
  });

  it('Scenario: Both transfer legs count as touching', () => {
    const arriving = transfer({
      id: 't-arriving',
      date: '2026-03-05',
      fromAccountId: 'card',
      toAccountId: 'wallet',
      left: money(50000, 'UAH'),
      arrived: money(50000, 'UAH'),
    });
    const walletExpense = expenseByDefault({
      id: 'e-wallet',
      date: '2026-03-07',
      accountId: 'wallet',
      amount: money(1500, 'UAH'),
      categoryId: 'food',
    });
    const unrelated = transfer({
      id: 't-unrelated',
      date: '2026-03-08',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(410000, 'UAH'),
      arrived: money(10000, 'USD'),
    });
    repo.save(arriving, storedAt);
    repo.save(walletExpense, storedAt);
    repo.save(unrelated, storedAt);

    const touching = repo.listByAccount('wallet');
    expect(touching.map((t: Transaction) => t.id).sort()).toEqual(['e-wallet', 't-arriving']);
    expect(touching.map((t: Transaction) => t.id)).not.toContain('t-unrelated');

    // The source leg counts too.
    expect(repo.listByAccount('card').map((t: Transaction) => t.id).sort()).toEqual([
      't-arriving',
      't-unrelated',
    ]);
  });

  it('Scenario: Retyping an expense into a transfer keeps the id', () => {
    repo.save(march31, storedAt);
    expect(repo.get('e-march')?.type).toBe('expense');

    const retyped = transfer({
      id: 'e-march',
      date: '2026-03-31',
      fromAccountId: 'card',
      toAccountId: 'wallet',
      left: money(10000, 'UAH'),
      arrived: money(10000, 'UAH'),
    });
    repo.save(retyped, storedAt);

    expect(repo.get('e-march')).toEqual(retyped);
    expect(repo.listMonth('2026-03')).toEqual([retyped]);
  });

  it('Scenario: A removed transaction disappears from listings', () => {
    repo.save(march31, storedAt);
    expect(repo.listMonth('2026-03')).toEqual([march31]);
    expect(repo.listByAccount('card')).toEqual([march31]);

    repo.remove('e-march');

    expect(repo.get('e-march')).toBeUndefined();
    expect(repo.listMonth('2026-03')).toEqual([]);
    expect(repo.listByAccount('card')).toEqual([]);
  });
});

describe('transactionsRepo latest listing', () => {
  let storage: TestStorage;
  let repo: TransactionsRepo;

  const august20 = expenseByDefault({
    id: 'e-20',
    date: '2026-08-20',
    accountId: 'card',
    amount: money(10000, 'UAH'),
    categoryId: 'food',
  });
  const august24 = expenseByDefault({
    id: 'e-24',
    date: '2026-08-24',
    accountId: 'card',
    amount: money(20000, 'UAH'),
    categoryId: 'food',
  });

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    seedAccounts(storage);
    repo = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: Newest date comes first', () => {
    repo.save(august20, at('2026-08-20T10:00:00.000Z'));
    repo.save(august24, at('2026-08-24T10:00:00.000Z'));

    expect(repo.listLatest(10).map((t) => t.id)).toEqual(['e-24', 'e-20']);
  });

  it('Scenario: Newest date comes first, whatever order they were stored in', () => {
    // The date decides, not the storage instant: the later date was stored first here.
    repo.save(august24, at('2026-08-24T10:00:00.000Z'));
    repo.save(august20, at('2026-08-24T11:00:00.000Z'));

    expect(repo.listLatest(10).map((t) => t.id)).toEqual(['e-24', 'e-20']);
  });

  it('Scenario: Same-date transactions are ordered by storage recency', () => {
    const first = expenseByDefault({
      id: 'e-first',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(10000, 'UAH'),
      categoryId: 'food',
    });
    const second = expenseByDefault({
      id: 'e-second',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(20000, 'UAH'),
      categoryId: 'food',
    });
    repo.save(first, at('2026-08-24T10:00:00.000Z'));
    repo.save(second, at('2026-08-24T10:05:00.000Z'));

    expect(repo.listLatest(10).map((t) => t.id)).toEqual(['e-second', 'e-first']);
  });

  it('listAll returns every stored транзакція in the latest order', () => {
    const older = expenseByDefault({
      id: 'e-older',
      date: '2026-08-20',
      accountId: 'card',
      amount: money(1000, 'UAH'),
      categoryId: 'food',
    });
    const newer = expenseByDefault({
      id: 'e-newer',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(2000, 'UAH'),
      categoryId: 'food',
    });
    repo.save(older, storedAt);
    repo.save(newer, storedAt);

    // No limit to pass and nothing left out — the same order the feed shows.
    expect(repo.listAll().map((t) => t.id)).toEqual(['e-newer', 'e-older']);
    expect(repo.listAll()).toHaveLength(repo.listLatest(50).length);
  });

  it('Scenario: The requested count is respected', () => {
    const august22 = expenseByDefault({
      id: 'e-22',
      date: '2026-08-22',
      accountId: 'card',
      amount: money(30000, 'UAH'),
      categoryId: 'food',
    });
    repo.save(august20, at('2026-08-20T10:00:00.000Z'));
    repo.save(august22, at('2026-08-22T10:00:00.000Z'));
    repo.save(august24, at('2026-08-24T10:00:00.000Z'));

    expect(repo.listLatest(2).map((t) => t.id)).toEqual(['e-24', 'e-22']);
  });

  it('Scenario: Replacing a transaction keeps its place', () => {
    const first = expenseByDefault({
      id: 'e-first',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(10000, 'UAH'),
      categoryId: 'food',
    });
    const second = expenseByDefault({
      id: 'e-second',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(20000, 'UAH'),
      categoryId: 'food',
    });
    repo.save(first, at('2026-08-24T10:00:00.000Z'));
    repo.save(second, at('2026-08-24T10:05:00.000Z'));

    // Replaced long after the second one was stored, and yet it stays behind it.
    repo.save({ ...first, amount: money(13000, 'UAH') }, at('2026-08-24T23:00:00.000Z'));

    expect(repo.listLatest(10).map((t) => t.id)).toEqual(['e-second', 'e-first']);
    expect(repo.get('e-first')).toMatchObject({ amount: money(13000, 'UAH') });
  });

  it('Scenario: A recorded transaction appears at the top of the feed', () => {
    repo.save(august20, at('2026-08-20T10:00:00.000Z'));
    const today = expenseByDefault({
      id: 'e-today',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(12550, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });

    repo.save(today, at('2026-08-24T12:00:00.000Z'));

    expect(repo.listLatest(50)[0]).toEqual(today);
  });

  it('A removed transaction leaves the feed', () => {
    repo.save(august20, at('2026-08-20T10:00:00.000Z'));
    repo.save(august24, at('2026-08-24T10:00:00.000Z'));

    repo.remove('e-24');

    expect(repo.listLatest(50).map((t) => t.id)).toEqual(['e-20']);
  });
});

describe('transactionsRepo editing flows', () => {
  let storage: TestStorage;
  let repo: TransactionsRepo;

  const uahExpense = expenseByDefault({
    id: 'e1',
    date: '2026-08-24',
    accountId: 'card',
    amount: money(100000, 'UAH'),
    categoryId: UNCATEGORISED_CATEGORY_ID,
  });

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    seedAccounts(storage);
    repo = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: An expense becomes a transfer under the same identity', () => {
    repo.save(uahExpense, storedAt);

    const retyped = transfer({
      id: 'e1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'wallet',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
    });
    repo.save(retyped, storedAt);

    const loaded = repo.get('e1');
    expect(loaded).toEqual(retyped);
    expect(loaded?.type).toBe('transfer');
    // No витрата remains: not under this id, and nowhere else either.
    expect(repo.listLatest(50).filter((t) => t.type === 'expense')).toEqual([]);
  });

  it('Scenario: Retyping onto an investment account is the інвестиція', () => {
    accountsRepo(storage.db).save(
      account({ id: 'bonds', name: 'ОВДП', kind: 'investment', currency: 'UAH' }),
    );
    repo.save(uahExpense, storedAt);

    const retyped = transfer({
      id: 'e1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'bonds',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
    });
    repo.save(retyped, storedAt);

    const loaded = repo.get('e1');
    expect(loaded).toMatchObject({ type: 'transfer', toAccountId: 'bonds' });
    const bonds = accountsRepo(storage.db).get('bonds')!;
    expect(bonds.kind).toBe('investment');
    // The kind of the destination is what makes it інвестовано, not a separate action.
    expect(
      classifyTransfer({
        from: accountsRepo(storage.db).get('card')!,
        to: bonds,
        left: money(100000, 'UAH'),
        arrived: money(100000, 'UAH'),
      }),
    ).toEqual([{ bucket: 'invested', amount: money(100000, 'UAH') }]);
  });

  it('Scenario: Moving an expense to another currency asks the amount anew', () => {
    const uahOne = expenseByDefault({
      id: 'e1',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(12550, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    repo.save(uahOne, storedAt);

    // The USD account takes a USD amount the owner typed anew; nothing is converted.
    const moved = expenseByDefault({
      id: 'e1',
      date: '2026-08-24',
      accountId: 'usd',
      amount: money(500, 'USD'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    repo.save(moved, storedAt);

    const loaded = repo.get('e1');
    expect(loaded).toEqual(moved);
    expect(loaded).toMatchObject({ accountId: 'usd', amount: money(500, 'USD') });
    expect(JSON.stringify(loaded)).not.toContain('UAH');
    expect(repo.listByAccount('card')).toEqual([]);
  });

  it('Scenario: Changing a transfer leg to another currency asks that leg anew', () => {
    const uahToUah = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'wallet',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
    });
    repo.save(uahToUah, storedAt);

    const toUsd = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(100000, 'UAH'),
      arrived: money(1000, 'USD'),
    });
    repo.save(toUsd, storedAt);

    const loaded = repo.get('t1');
    expect(loaded).toEqual(toUsd);
    expect(loaded).toMatchObject({
      left: money(100000, 'UAH'),
      arrived: money(1000, 'USD'),
      toAccountId: 'usd',
    });
    expect(repo.listByAccount('wallet')).toEqual([]);
  });

  it('Scenario: Accepted fee proposal records the expense', () => {
    // What the owner typed: 100000 left the card, 99500 reached the jar.
    const typed = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'wallet',
      left: money(100000, 'UAH'),
      arrived: money(99500, 'UAH'),
    });
    const fee = proposeFee(typed);
    expect(fee).toMatchObject({
      amount: money(500, 'UAH'),
      accountId: 'card',
      categoryId: FEES_CATEGORY_ID,
      date: '2026-08-24',
    });

    // Accepting stores the two movements it really was: 99500 between the owner's own accounts,
    // and 500 that left to the bank. See design §8.
    const accepted = transfer({ ...typed, left: typed.arrived });
    repo.save(accepted, storedAt);
    repo.save({ ...fee!, id: 'fee-1' }, storedAt);

    expect(repo.get('t1')).toMatchObject({
      type: 'transfer',
      left: money(99500, 'UAH'),
      arrived: money(99500, 'UAH'),
    });
    expect(repo.get('fee-1')).toEqual({ ...fee, id: 'fee-1' });
    expect(repo.listLatest(50).map((t) => t.id).sort()).toEqual(['fee-1', 't1']);
  });

  it('Scenario: Accepting the комісія keeps the source balance exact', () => {
    const opened = account({
      id: 'opened',
      name: 'mono black',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(1000000, 'UAH'),
    });
    const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
    accountsRepo(storage.db).save(opened);
    accountsRepo(storage.db).save(jar);
    const typed = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'opened',
      toAccountId: 'jar',
      left: money(100000, 'UAH'),
      arrived: money(99500, 'UAH'),
    });
    const fee = { ...proposeFee(typed)!, id: 'fee-1' };

    // Accepted: the trimmed переказ plus the витрата.
    repo.save(transfer({ ...typed, left: typed.arrived }), storedAt);
    repo.save(fee, storedAt);
    expect(computeBalance(opened, repo.listByAccount('opened'))).toEqual(money(900000, 'UAH'));
    expect(computeBalance(jar, repo.listByAccount('jar'))).toEqual(money(99500, 'UAH'));

    // Declined: the typed legs, no витрата. The same balances — which button was tapped never
    // moves a hryvnia, it only decides whether the 500 has a name.
    repo.remove('fee-1');
    repo.save(typed, storedAt);
    expect(computeBalance(opened, repo.listByAccount('opened'))).toEqual(money(900000, 'UAH'));
    expect(computeBalance(jar, repo.listByAccount('jar'))).toEqual(money(99500, 'UAH'));
  });

  it('Scenario: Declined fee proposal records only the transfer', () => {
    const typed = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'wallet',
      left: money(100000, 'UAH'),
      arrived: money(99500, 'UAH'),
    });

    repo.save(typed, storedAt);

    expect(repo.listLatest(50)).toEqual([typed]);
    expect(repo.get('t1')).toMatchObject({
      left: money(100000, 'UAH'),
      arrived: money(99500, 'UAH'),
    });
    expect(repo.listLatest(50).filter((t) => t.type === 'expense')).toEqual([]);
  });

  it('Scenario: An edited переказ that arrives short proposes the комісія', () => {
    const even = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'wallet',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
    });
    repo.save(even, storedAt);
    // A stored переказ with equal legs proposes nothing when it is opened again.
    expect(proposeFee(repo.get('t1') as Transfer)).toBeNull();

    // The owner sets «скільки прийшло» to 99500 and accepts.
    const edited = transfer({ ...even, arrived: money(99500, 'UAH') });
    const fee = { ...proposeFee(edited)!, id: 'fee-1' };
    repo.save(transfer({ ...edited, left: edited.arrived }), storedAt);
    repo.save(fee, storedAt);

    expect(repo.get('t1')).toMatchObject({
      left: money(99500, 'UAH'),
      arrived: money(99500, 'UAH'),
    });
    expect(repo.get('fee-1')).toMatchObject({
      type: 'expense',
      amount: money(500, 'UAH'),
      accountId: 'card',
      categoryId: FEES_CATEGORY_ID,
    });
  });
});

describe('transactionsRepo re-dating', () => {
  let storage: TestStorage;
  let repo: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    seedAccounts(storage);
    repo = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: An edited amount persists', () => {
    const original = expenseByDefault({
      id: 'e1',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(12550, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    repo.save(original, at('2026-08-24T10:00:00.000Z'));

    // The owner types "130": the edit lands under the same transaction, not beside it.
    repo.save({ ...original, amount: money(13000, 'UAH') }, at('2026-08-24T11:00:00.000Z'));

    expect(repo.get('e1')).toMatchObject({ amount: money(13000, 'UAH') });
    expect(repo.listLatest(50).map((t) => t.id)).toEqual(['e1']);
    expect(repo.listByAccount('card').map((t) => t.id)).toEqual(['e1']);
  });

  it('Scenario: A corrected date moves the transaction to its real month', () => {
    const august = expenseByDefault({
      id: 'e1',
      date: '2026-08-01',
      accountId: 'card',
      amount: money(12550, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    repo.save(august, at('2026-08-01T10:00:00.000Z'));
    expect(repo.listMonth('2026-08').map((t) => t.id)).toEqual(['e1']);

    repo.save({ ...august, date: '2026-07-31' }, at('2026-08-01T10:00:00.000Z'));

    expect(repo.get('e1')?.date).toBe('2026-07-31');
    expect(repo.listMonth('2026-07').map((t) => t.id)).toEqual(['e1']);
    expect(repo.listMonth('2026-08')).toEqual([]);
  });

  it('Scenario: A replacement with a new date takes its new place', () => {
    const august20 = expenseByDefault({
      id: 'e-20',
      date: '2026-08-20',
      accountId: 'card',
      amount: money(10000, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    const august24 = expenseByDefault({
      id: 'e-24',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(20000, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    repo.save(august20, at('2026-08-20T10:00:00.000Z'));
    repo.save(august24, at('2026-08-24T10:00:00.000Z'));
    expect(repo.listLatest(10).map((t) => t.id)).toEqual(['e-24', 'e-20']);

    // The date is inside the update set: a re-dated transaction moves in the feed even though
    // its storage instant — which orders same-date transactions — is older.
    repo.save({ ...august20, date: '2026-08-25' }, at('2026-08-20T10:00:00.000Z'));

    expect(repo.listLatest(10).map((t) => t.id)).toEqual(['e-20', 'e-24']);
  });

  it('Scenario: A date other than today can be chosen when recording', () => {
    const backdated = expenseByDefault({
      id: 'e1',
      date: '2026-07-31',
      accountId: 'card',
      amount: money(12550, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });

    // Recorded on 24 August, dated 31 July: the storage instant and the calendar date are two
    // different things and neither overwrites the other.
    repo.save(backdated, at('2026-08-24T12:00:00.000Z'));

    expect(repo.get('e1')).toEqual(backdated);
    expect(repo.get('e1')?.date).toBe('2026-07-31');
    expect(repo.listMonth('2026-07').map((t) => t.id)).toEqual(['e1']);
  });
});

describe('transactionsRepo reverse retype', () => {
  let storage: TestStorage;
  let repo: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    seedAccounts(storage);
    repo = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: A transfer becomes an expense on the account the money left', () => {
    const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
    accountsRepo(storage.db).save(jar);
    const t = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
    });
    repo.save(t, storedAt);
    expect(computeBalance(jar, repo.listByAccount('jar'))).toEqual(money(100000, 'UAH'));

    // The витрата lands on the account the money left, for the сума that left it.
    const retyped = expenseByDefault({
      id: 't1',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(100000, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    repo.save(retyped, storedAt);

    expect(repo.get('t1')).toEqual(retyped);
    expect(repo.get('t1')).toMatchObject({
      type: 'expense',
      accountId: 'card',
      amount: money(100000, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    // Nothing remains on the destination, and its balance no longer holds the amount.
    expect(repo.listByAccount('jar')).toEqual([]);
    expect(computeBalance(jar, repo.listByAccount('jar'))).toEqual(money(0, 'UAH'));
  });

  it('Scenario: A cross-currency transfer becomes an expense of what left', () => {
    const t = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(410000, 'UAH'),
      arrived: money(10000, 'USD'),
    });
    repo.save(t, storedAt);

    const retyped = expenseByDefault({
      id: 't1',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(410000, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
    repo.save(retyped, storedAt);

    expect(repo.get('t1')).toEqual(retyped);
    // The USD leg is gone and nothing was converted: no USD amount survives anywhere on it.
    expect(JSON.stringify(repo.get('t1'))).not.toContain('USD');
    expect(repo.listByAccount('usd')).toEqual([]);
  });

  it('Scenario: An accepted дохід «Відсотки» survives editing its переказ', () => {
    // Ярослав owed 1000 and repaid 1100; the accepted proposal stored the principal переказ and
    // the 100 as a дохід «Відсотки» of its own.
    const debtAccount = account({ id: 'debt-y', name: 'Ярослав', kind: 'debt', currency: 'UAH' });
    accountsRepo(storage.db).save(debtAccount);
    // The reserved джерело the proposal picks; on a device the seed puts it there.
    seedReferences(storage.db, { categories: [], sources: [INTEREST_SOURCE_ID] });
    const lent = transfer({
      id: 'lend',
      date: '2026-07-01',
      fromAccountId: 'card',
      toAccountId: 'debt-y',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
    });
    const repayment = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'debt-y',
      toAccountId: 'card',
      left: money(110000, 'UAH'),
      arrived: money(110000, 'UAH'),
    });
    const proposal = proposeForTransfer(repayment, {
      accounts: [card, debtAccount],
      sourceTransactions: [lent],
    })!;
    const interest = { ...(proposal.kind === 'interest' ? proposal.income : proposal.expense), id: 'int-1' };
    repo.save(lent, storedAt);
    repo.save(proposal.transfer, storedAt);
    repo.save(interest as Transaction, storedAt);

    // The owner edits the переказ afterwards; the дохід is a transaction of its own and is theirs
    // to edit or delete in the feed, not something the edit rewrites.
    repo.save(transfer({ ...repayment, left: money(90000, 'UAH'), arrived: money(90000, 'UAH') }), storedAt);

    expect(repo.get('int-1')).toEqual(interest);
    expect(repo.get('int-1')).toMatchObject({ type: 'income', sourceId: INTEREST_SOURCE_ID });
    expect(repo.listLatest(50).map((t) => t.id).sort()).toEqual(['int-1', 'lend', 't1']);
  });

  it('Scenario: An accepted комісія survives the retype as its own transaction', () => {
    const typed = transfer({
      id: 't1',
      date: '2026-08-24',
      fromAccountId: 'card',
      toAccountId: 'wallet',
      left: money(100000, 'UAH'),
      arrived: money(99500, 'UAH'),
    });
    const fee = { ...proposeFee(typed)!, id: 'fee-1' };
    repo.save(transfer({ ...typed, left: typed.arrived }), storedAt);
    repo.save(fee, storedAt);

    // Retyping the переказ touches only the переказ; the комісія is a transaction of its own.
    repo.save(
      expenseByDefault({
        id: 't1',
        date: '2026-08-24',
        accountId: 'card',
        amount: money(99500, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
      }),
      storedAt,
    );

    expect(repo.get('fee-1')).toEqual(fee);
    expect(repo.get('fee-1')).toMatchObject({ accountId: 'card', categoryId: FEES_CATEGORY_ID });
    expect(repo.listLatest(50).map((t) => t.id).sort()).toEqual(['fee-1', 't1']);
  });
});

/**
 * Task 4.4 / persistence: "A transaction references stored categories and sources". Since
 * categories-rules the two columns are real foreign keys, so an id with no row behind it is
 * refused by storage itself rather than by a screen remembering to check.
 */
describe('transactionsRepo references', () => {
  let storage: TestStorage;
  let repo: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    repo = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: An unknown category id is rejected', () => {
    const ghost = expenseByDefault({
      id: 'ghost',
      date: '2026-08-10',
      accountId: 'card',
      amount: money(12550, 'UAH'),
      categoryId: 'no-such-category',
    });

    expect(() => repo.save(ghost, storedAt)).toThrow();
    expect(repo.get('ghost')).toBeUndefined();
    expect(repo.listLatest(50)).toEqual([]);
  });

  it('Scenario: An unknown source id is rejected', () => {
    const ghost: Income = {
      type: 'income',
      id: 'ghost-income',
      date: '2026-08-10',
      accountId: 'card',
      amount: money(5000000, 'UAH'),
      sourceId: 'no-such-source',
    };

    expect(() => repo.save(ghost, storedAt)).toThrow();
    expect(repo.get('ghost-income')).toBeUndefined();
    expect(repo.listLatest(50)).toEqual([]);
  });

  it('A повернення referencing an unknown category is rejected too', () => {
    const ghost = refund({
      id: 'ghost-refund',
      date: '2026-08-10',
      accountId: 'card',
      amount: money(80000, 'UAH'),
      categoryId: 'no-such-category',
    });

    expect(() => repo.save(ghost, storedAt)).toThrow();
    expect(repo.get('ghost-refund')).toBeUndefined();
  });
});
