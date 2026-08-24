import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import {
  expenseByDefault,
  refund,
  transfer,
  type Correction,
  type Income,
  type Transaction,
} from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { openFileDb, openTestDb, type TestStorage } from './test-db';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';

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
    repo.save(foreignPurchase);

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
    repo.save(crossCurrencyTransfer);

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
    repo.save(income);
    repo.save(clothesRefund);
    repo.save(correction);

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
    expect(() => repo.save(orphan)).toThrow();
    expect(repo.get('e-orphan')).toBeUndefined();
  });

  it('A date that is not a calendar date never reaches storage', () => {
    // The column CHECK only proves the 'NNNN-NN-NN' shape; the repository proves the date exists.
    const impossible: Transaction = { ...correction, id: 'c-impossible', date: '2026-02-31' };
    expect(() => repo.save(impossible)).toThrow();
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
    expect(() => repo.save(orphanTransfer)).toThrow();
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
    accountsRepo(first.db).save(card);
    transactionsRepo(first.db).save(expense);
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
    seedAccounts(storage);
    repo = transactionsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: Month boundaries are respected', () => {
    repo.save(march31);
    repo.save(april1);

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
    repo.save(arriving);
    repo.save(walletExpense);
    repo.save(unrelated);

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
    repo.save(march31);
    expect(repo.get('e-march')?.type).toBe('expense');

    const retyped = transfer({
      id: 'e-march',
      date: '2026-03-31',
      fromAccountId: 'card',
      toAccountId: 'wallet',
      left: money(10000, 'UAH'),
      arrived: money(10000, 'UAH'),
    });
    repo.save(retyped);

    expect(repo.get('e-march')).toEqual(retyped);
    expect(repo.listMonth('2026-03')).toEqual([retyped]);
  });

  it('Scenario: A removed transaction disappears from listings', () => {
    repo.save(march31);
    expect(repo.listMonth('2026-03')).toEqual([march31]);
    expect(repo.listByAccount('card')).toEqual([march31]);

    repo.remove('e-march');

    expect(repo.get('e-march')).toBeUndefined();
    expect(repo.listMonth('2026-03')).toEqual([]);
    expect(repo.listByAccount('card')).toEqual([]);
  });
});
