import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sql } from 'drizzle-orm';

import { account, computeBalance } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, type Transaction } from '../domain/transaction';
import type { ImportPlan } from '../saldo/interpret';
import { accountKey } from '../saldo/survey';
import { existingAccount, existingState, pair, planFrom } from '../saldo/test-fixtures';
import { accountsRepo } from './accounts-repo';
import { importRepo } from './import-repo';
import { categories, sources } from './schema';
import { openFileDb, openTestDb, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

/** Fixed instants: when an import happened is data these tests hand in, never the wall clock. */
const firstImport = new Date('2026-08-25T12:00:00.000Z');
const secondImport = new Date('2026-09-01T08:30:00.000Z');

describe('importRepo — the marker', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: Before any import there is no marker', () => {
    expect(importRepo(storage.db).committedAt()).toBeUndefined();
  });

  it('Scenario: A second import replaces the moment', () => {
    const repo = importRepo(storage.db);
    repo.markCommitted(firstImport);

    repo.markCommitted(secondImport);

    expect(repo.committedAt()).toEqual(secondImport);
  });
});

describe('importRepo — across a restart', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-import-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const reopen = <T>(read: (storage: TestStorage) => T): T => {
    const storage = openFileDb(join(dir, 'cap1tal.db'));
    try {
      return read(storage);
    } finally {
      storage.close();
    }
  };

  it('Scenario: The moment survives a restart', () => {
    reopen((storage) => importRepo(storage.db).markCommitted(firstImport));

    expect(reopen((storage) => importRepo(storage.db).committedAt())).toEqual(firstImport);
  });
});

/**
 * The commit itself, run against a real database on the fixtures the engine's own tests use — so
 * what is stored is what the verification report the owner read was about.
 */
describe('importRepo — committing a plan', () => {
  let storage: TestStorage;
  const committedAt = new Date('2026-08-25T12:00:00.000Z');

  beforeEach(() => {
    storage = openTestDb();
  });

  afterEach(() => {
    storage.close();
  });

  const balanceOf = (id: string) => {
    const account = accountsRepo(storage.db).get(id)!;
    return computeBalance(account, transactionsRepo(storage.db).listByAccount(id));
  };

  it('Scenario: A stored plan reads back whole', () => {
    // An opening balance on the card, a витрата out of it, and a переказ onto a second рахунок.
    const plan = planFrom([
      ...pair({ id: '1', account: 'mono black', journalType: 'DEBIT', amount: '1000.00', other: 'Initial balance', otherType: 'EQUITY' }),
      ...pair({ id: '2', datetime: '2024-11-01T10:00:00.000', account: 'mono black', journalType: 'CREDIT', amount: '250.00', other: 'булка', otherType: 'EXPENSES' }),
      ...pair({ id: '3', datetime: '2024-11-02T10:00:00.000', account: 'mono black', journalType: 'CREDIT', amount: '300.00', other: 'готівка', otherType: 'CASH' }),
      ...pair({ id: '4', datetime: '2024-11-03T10:00:00.000', account: 'mono black', journalType: 'DEBIT', amount: '500.00', other: 'Salary', otherType: 'INCOME' }),
    ]);
    const summary = importRepo(storage.db).commit(plan, committedAt);

    // Literals, not the plan's own arithmetic: «булка» is created as a категорія and "Salary" as a
    // джерело, and a summary computed from the plan could never disagree with it.
    expect(summary).toEqual({ accounts: 2, categories: 1, sources: 1, transactions: 3 });
    const stored = accountsRepo(storage.db).list();
    expect(stored.map((a) => a.name).sort()).toEqual(['mono black', 'готівка']);
    const card = stored.find((a) => a.name === 'mono black')!;
    // 1000 opening − 250 витрата − 300 переказ out + 500 дохід.
    expect(card.openingBalance).toEqual(money(100000, 'UAH'));
    expect(balanceOf(card.id)).toEqual(money(95000, 'UAH'));
    expect(balanceOf(stored.find((a) => a.name === 'готівка')!.id)).toEqual(money(30000, 'UAH'));
    // Nothing carries a plan-local id: the import's vocabulary stayed out of the database.
    const all = transactionsRepo(storage.db).listMonth('2024-11');
    expect(all).toHaveLength(3);
    expect(JSON.stringify([stored, all])).not.toContain('saldo:');
    // The категорія the plan proposed is a real row the витрата points at.
    const bulka = storage.db.select().from(categories).all().find((c) => c.name === 'булка');
    expect(bulka).toBeDefined();
    // The джерело is a real row too, readable by the name the export carried.
    const salary = storage.db.select().from(sources).all().find((row) => row.name === 'Salary');
    expect(salary).toBeDefined();
    const income = all.find((t) => t.type === 'income')!;
    expect(income.type === 'income' && income.sourceId).toBe(salary!.id);
    const expense = all.find((t) => t.type === 'expense')!;
    expect(expense.type === 'expense' && expense.categoryId).toBe(bulka!.id);
    expect(storage.db.all(sql`PRAGMA foreign_key_check`)).toEqual([]);
    expect(importRepo(storage.db).committedAt()).toEqual(committedAt);
  });

  it('Scenario: A plan mapping onto an existing рахунок replaces its opening balance', () => {
    accountsRepo(storage.db).save(
      account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH', openingBalance: money(5000, 'UAH') }),
    );
    const existing = existingState({ accounts: [existingAccount({ id: 'card', name: 'mono black', openingAmount: 5000 })] });
    const plan = planFrom(
      [...pair({ id: '1', account: 'mono black', journalType: 'DEBIT', amount: '123.00', other: 'Initial balance', otherType: 'EQUITY' })],
      { existing, decisions: { accountRedirects: { [accountKey('mono black', 'UAH')]: { to: 'account', accountId: 'card' } } } },
    );

    importRepo(storage.db).commit(plan, committedAt);

    const stored = accountsRepo(storage.db).list();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: 'card', name: 'mono black', openingBalance: money(12300, 'UAH') });
    // Nothing was created, so the summary counts no рахунок — it says what the import added.
    expect(importRepo(storage.db).committedAt()).toEqual(committedAt);
  });

  it("Scenario: The plan's order becomes the stored order", () => {
    // Two транзакції of one calendar date, the export's earlier one first in the plan.
    const plan = planFrom([
      ...pair({ id: '1', datetime: '2024-11-01T09:00:00.000', account: 'mono black', journalType: 'CREDIT', amount: '100.00', other: 'булка', otherType: 'EXPENSES' }),
      ...pair({ id: '2', datetime: '2024-11-01T18:00:00.000', account: 'mono black', journalType: 'CREDIT', amount: '200.00', other: 'булка', otherType: 'EXPENSES' }),
    ]);
    const amountOf = (t: Transaction) => (t.type === 'expense' ? t.amount.amount : 0);
    expect(plan.transactions.map((planned) => amountOf(planned.transaction))).toEqual([10000, 20000]);

    importRepo(storage.db).commit(plan, committedAt);

    // The latest listing puts the most recently stored first among same-date rows — so the
    // export's later transaction leads, exactly as two hand-recorded ones would. This only holds
    // because the commit stores them one after the other rather than under one instant; under a
    // single instant the last tie-break is the id, whose suffix is random.
    const latest = transactionsRepo(storage.db).listLatest(2);
    expect(latest.map(amountOf)).toEqual([20000, 10000]);
  });

  it('Scenario: A plan that fails partway stores nothing', () => {
    const plan = planFrom([
      ...pair({ id: '1', account: 'mono black', journalType: 'CREDIT', amount: '100.00', other: 'булка', otherType: 'EXPENSES' }),
    ]);
    // A plan whose last транзакція points at a категорія the plan never creates: the reference
    // the database refuses, reached only after the рахунок and the first rows are already in.
    const broken: ImportPlan = {
      ...plan,
      transactions: [
        ...plan.transactions,
        {
          transaction: expenseByDefault({
            id: 'never',
            date: '2024-11-02',
            accountId: plan.accounts[0]!.id,
            amount: money(100, 'UAH'),
            categoryId: 'no-such-category',
          }),
          saldoIds: ['x'],
        },
      ],
    };

    expect(() => importRepo(storage.db).commit(broken, committedAt)).toThrow();

    // The three reserved rows migration 0003 puts there are the whole of the vocabulary; nothing
    // the plan proposed, and no рахунок or транзакція of it, survived the failure.
    expect(accountsRepo(storage.db).list()).toEqual([]);
    expect(storage.db.select().from(categories).all().map((row) => row.id).sort()).toEqual(
      ['correction', 'fees', 'uncategorised'],
    );
    expect(storage.db.select().from(sources).all()).toEqual([]);
    expect(transactionsRepo(storage.db).listLatest(10)).toEqual([]);
  });

  it('Scenario: A failed commit leaves no marker', () => {
    const plan = planFrom([
      ...pair({ id: '1', account: 'mono black', journalType: 'CREDIT', amount: '100.00', other: 'булка', otherType: 'EXPENSES' }),
    ]);
    const broken: ImportPlan = {
      ...plan,
      transactions: [
        ...plan.transactions,
        {
          transaction: expenseByDefault({
            id: 'never',
            date: '2024-11-02',
            accountId: plan.accounts[0]!.id,
            amount: money(100, 'UAH'),
            categoryId: 'no-such-category',
          }),
          saldoIds: ['x'],
        },
      ],
    };

    expect(() => importRepo(storage.db).commit(broken, committedAt)).toThrow();

    expect(importRepo(storage.db).committedAt()).toBeUndefined();
  });
});
