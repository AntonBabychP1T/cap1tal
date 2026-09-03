import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { account, computeBalance } from '../domain/account';
import { money } from '../domain/money';
import { categoryBreakdown, monthlyPicture } from '../domain/monthly-picture';
import {
  expenseByDefault,
  refund,
  transfer,
  CORRECTION_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Correction,
  type Income,
  type Transaction,
} from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import type { EarnedAchievement } from '../progress/earned';
import { limitsRepo } from './limits-repo';
import { progressRepo, type ProgressRepo } from './progress-repo';
import {
  challengeDecisions,
  earnedAchievements,
  notificationDrafts,
  transactions,
} from './schema';
import {
  openFileDb,
  openTestDb,
  seedReferences,
  type TestDb,
  type TestStorage,
} from './test-db';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';

const VOCABULARY = {
  categories: ['food', 'clothes', UNCATEGORISED_CATEGORY_ID, CORRECTION_CATEGORY_ID],
  sources: ['salary', UNSOURCED_SOURCE_ID],
} as const;

const card = account({
  id: 'card',
  name: 'картка',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(100000, 'UAH'),
});
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const dollars = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });
const broker = account({ id: 'broker', name: 'брокер', kind: 'investment', currency: 'UAH' });

const ACCOUNTS = [card, jar, dollars, broker];

const STORED_AT = new Date('2026-09-01T10:00:00Z');

/**
 * How many rows each reading returned, so «the зведення is bounded, not per транзакція» is a
 * measurement rather than a hope. The proxy sits over the drizzle handle the repo is given, which
 * is the only door the repo has to the database.
 */
function counting(db: TestDb): { db: TestDb; largestResult: () => number } {
  let largest = 0;
  const wrapped = new Proxy(db, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === 'all' && typeof value === 'function') {
        return (...args: unknown[]) => {
          const rows = (value as (...a: unknown[]) => unknown[]).apply(target, args);
          largest = Math.max(largest, rows.length);
          return rows;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as TestDb;
  return { db: wrapped, largestResult: () => largest };
}

describe('the зведення прогресу', () => {
  let storage: TestStorage;
  let repo: ProgressRepo;
  let txs: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    const accounts = accountsRepo(storage.db);
    for (const one of ACCOUNTS) {
      accounts.save(one);
    }
    txs = transactionsRepo(storage.db);
    repo = progressRepo(storage.db);
  });

  it('Scenario: The зведення holds the same numbers as the місячна картина', () => {
    const salary: Income = {
      type: 'income',
      id: 'salary-1',
      date: '2026-05-01',
      accountId: 'card',
      amount: money(6000000, 'UAH'),
      sourceId: 'salary',
    };
    const correction: Correction = {
      type: 'correction',
      id: 'corr-1',
      date: '2026-05-20',
      accountId: 'card',
      amount: money(-1500, 'UAH'),
    };
    const stored: Transaction[] = [
      expenseByDefault({
        id: 'e1',
        date: '2026-05-03',
        accountId: 'card',
        amount: money(120000, 'UAH'),
        categoryId: 'food',
      }),
      refund({
        id: 'r1',
        date: '2026-05-09',
        accountId: 'card',
        amount: money(20000, 'UAH'),
        categoryId: 'food',
      }),
      salary,
      correction,
      transfer({
        id: 't1',
        date: '2026-05-10',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(500000, 'UAH'),
        arrived: money(500000, 'UAH'),
      }),
      transfer({
        id: 't2',
        date: '2026-05-12',
        fromAccountId: 'card',
        toAccountId: 'broker',
        left: money(300000, 'UAH'),
        arrived: money(300000, 'UAH'),
      }),
    ];
    for (const t of stored) {
      txs.save(t, STORED_AT);
    }

    const picture = monthlyPicture({ month: '2026-05', accounts: ACCOUNTS, transactions: stored });
    const row = repo
      .readProgressSummary()
      .months.find((one) => one.month === '2026-05' && one.currency === 'UAH');

    expect(row).toBeDefined();
    expect(row!.spent).toBe(picture.get('UAH')!.spent.amount);
    expect(row!.income).toBe(picture.get('UAH')!.income.amount);
    expect(row!.saved).toBe(picture.get('UAH')!.saved.amount);
    expect(row!.invested).toBe(picture.get('UAH')!.invested.amount);
  });

  it('holds the same numbers as the місячна картина for a cross-currency переказ too', () => {
    const stored: Transaction[] = [
      transfer({
        id: 't3',
        date: '2026-06-04',
        fromAccountId: 'card',
        toAccountId: 'usd',
        left: money(410000, 'UAH'),
        arrived: money(10000, 'USD'),
      }),
    ];
    for (const t of stored) {
      txs.save(t, STORED_AT);
    }

    const picture = monthlyPicture({ month: '2026-06', accounts: ACCOUNTS, transactions: stored });
    const summary = repo.readProgressSummary();

    for (const [currency, numbers] of picture) {
      const row = summary.months.find((one) => one.month === '2026-06' && one.currency === currency);
      expect(row?.saved ?? 0).toBe(numbers.saved.amount);
      expect(row?.invested ?? 0).toBe(numbers.invested.amount);
    }
    // The переказ names two currencies, so both місяць rows count it — and it is one транзакція
    // in each of them, not two.
    expect(
      summary.months
        .filter((one) => one.month === '2026-06')
        .map((one) => [one.currency, one.transactions]),
    ).toEqual([
      ['UAH', 1],
      ['USD', 1],
    ]);
  });

  it('counts a same-currency переказ once in its місяць', () => {
    txs.save(
      transfer({
        id: 't4',
        date: '2026-06-04',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(100000, 'UAH'),
        arrived: money(100000, 'UAH'),
      }),
      STORED_AT,
    );

    const row = repo
      .readProgressSummary()
      .months.find((one) => one.month === '2026-06' && one.currency === 'UAH');

    expect(row!.transactions).toBe(1);
  });

  it('counts the витрати «Без категорії» and the доходи «Без джерела» of a місяць', () => {
    txs.save(
      expenseByDefault({
        id: 'e2',
        date: '2026-07-02',
        accountId: 'card',
        amount: money(30000, 'UAH'),
      }),
      STORED_AT,
    );
    txs.save(
      {
        type: 'income',
        id: 'i2',
        date: '2026-07-03',
        accountId: 'card',
        amount: money(50000, 'UAH'),
        sourceId: UNSOURCED_SOURCE_ID,
      },
      STORED_AT,
    );

    const row = repo
      .readProgressSummary()
      .months.find((one) => one.month === '2026-07' && one.currency === 'UAH');

    expect(row!.uncategorised).toBe(1);
    expect(row!.unsourced).toBe(1);
  });

  it('Scenario: A вид рахунку’s total keeps its currencies apart', () => {
    txs.save(
      transfer({
        id: 't5',
        date: '2026-05-10',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(4000000, 'UAH'),
        arrived: money(4000000, 'UAH'),
      }),
      STORED_AT,
    );
    txs.save(
      transfer({
        id: 't6',
        date: '2026-05-11',
        fromAccountId: 'card',
        toAccountId: 'usd',
        left: money(2050000, 'UAH'),
        arrived: money(50000, 'USD'),
      }),
      STORED_AT,
    );

    const balances = repo
      .readProgressSummary()
      .balances.filter((row) => row.kind === 'savings')
      .map((row) => [row.currency, row.balance]);

    expect(balances).toEqual([
      ['UAH', 4000000],
      ['USD', 50000],
    ]);
  });

  it('the total of a вид is exactly what computeBalance says of its рахунки', () => {
    const stored: Transaction[] = [
      expenseByDefault({
        id: 'e3',
        date: '2026-05-03',
        accountId: 'card',
        amount: money(120000, 'UAH'),
        categoryId: 'food',
      }),
      refund({
        id: 'r3',
        date: '2026-05-04',
        accountId: 'card',
        amount: money(20000, 'UAH'),
        categoryId: 'food',
      }),
      {
        type: 'correction',
        id: 'c3',
        date: '2026-05-05',
        accountId: 'card',
        amount: money(-700, 'UAH'),
      } satisfies Correction,
      transfer({
        id: 't7',
        date: '2026-05-06',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(300000, 'UAH'),
        arrived: money(300000, 'UAH'),
      }),
      transfer({
        id: 't8',
        date: '2026-05-07',
        fromAccountId: 'jar',
        toAccountId: 'card',
        left: money(50000, 'UAH'),
        arrived: money(50000, 'UAH'),
      }),
    ];
    for (const t of stored) {
      txs.save(t, STORED_AT);
    }

    const summary = repo.readProgressSummary();
    for (const one of ACCOUNTS) {
      const expected = computeBalance(one, stored);
      const row = summary.balances.find(
        (r) => r.kind === one.kind && r.currency === one.currency,
      );
      if (one.kind === 'savings' && one.currency === 'UAH') {
        expect(row!.balance).toBe(expected.amount);
      }
      if (one.id === 'card') {
        expect(row!.balance).toBe(expected.amount);
      }
    }
  });

  it('Scenario: A ціль`s progress is read from the зведення, not from the транзакції', () => {
    txs.save(
      transfer({
        id: 'g1',
        date: '2026-05-10',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(400_000, 'UAH'),
        arrived: money(400_000, 'UAH'),
      }),
      STORED_AT,
    );

    const measured = counting(storage.db);
    const summary = progressRepo(measured.db).readProgressSummary();

    // One row per рахунок, carrying exactly what computeBalance says of it.
    const stored = txs.listAll();
    for (const one of ACCOUNTS) {
      const row = summary.accounts.find((r) => r.id === one.id);
      expect(row?.balance).toBe(computeBalance(one, stored).amount);
      expect(row?.kind).toBe(one.kind);
      expect(row?.currency).toBe(one.currency);
    }
    expect(summary.accounts).toHaveLength(ACCOUNTS.length);
    expect(measured.largestResult()).toBeLessThanOrEqual(ACCOUNTS.length);
  });

  it('the (вид, currency) totals are the sums of the рахунки, read once', () => {
    txs.save(
      transfer({
        id: 'g2',
        date: '2026-05-10',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(400_000, 'UAH'),
        arrived: money(400_000, 'UAH'),
      }),
      STORED_AT,
    );

    const summary = progressRepo(storage.db).readProgressSummary();

    for (const total of summary.balances) {
      const sum = summary.accounts
        .filter((one) => one.kind === total.kind && one.currency === total.currency)
        .reduce((held, one) => held + one.balance, 0);
      expect(total.balance).toBe(sum);
    }
  });

  it('Scenario: The зведення is bounded, not per транзакція', () => {
    // 5000 транзакції across 24 місяці and 3 currencies, on 12 рахунки of 4 видів.
    const accounts = accountsRepo(storage.db);
    const currencies = ['UAH', 'USD', 'EUR'] as const;
    const kinds = ['spending', 'savings', 'investment', 'cash'] as const;
    const many = kinds.flatMap((kind) =>
      currencies.map((currency) =>
        account({ id: `${kind}-${currency}`, name: `${kind} ${currency}`, kind, currency }),
      ),
    );
    for (const one of many) {
      accounts.save(one);
    }
    // Inserted in batches through the query builder: the subject is the reading, and 5000 domain
    // round-trips would make this test about the writer instead.
    const rows = Array.from({ length: 5000 }, (_, n) => {
      const month = String((n % 24) + 1).padStart(2, '0');
      const year = 2024 + Math.floor(n / (24 * 250));
      const currency = currencies[n % 3]!;
      return {
        id: `m${n}`,
        type: 'expense',
        date: `${year}-${month}-05`,
        createdAt: STORED_AT,
        accountId: `spending-${currency}`,
        amount: 100,
        currency,
        categoryId: 'food',
      };
    });
    for (let from = 0; from < rows.length; from += 500) {
      storage.db.insert(transactions).values(rows.slice(from, from + 500)).run();
    }

    const measured = counting(storage.db);
    const summary = progressRepo(measured.db).readProgressSummary();

    expect(summary.history.count).toBe(5000);
    expect(summary.months.length).toBeLessThanOrEqual(72);
    expect(summary.balances.length).toBeLessThanOrEqual(12);
    expect(measured.largestResult()).toBeLessThanOrEqual(72);
  });
});

describe('the категорії that carry a ліміт', () => {
  let storage: TestStorage;
  let repo: ProgressRepo;
  let txs: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    txs = transactionsRepo(storage.db);
    repo = progressRepo(storage.db);
    limitsRepo(storage.db).set({ categoryId: 'food', amount: money(800000, 'UAH') });
  });

  it('Scenario: Only категорії with a ліміт are broken out', () => {
    txs.save(
      expenseByDefault({
        id: 'lc1',
        date: '2026-05-03',
        accountId: 'card',
        amount: money(120000, 'UAH'),
        categoryId: 'food',
      }),
      STORED_AT,
    );
    txs.save(
      expenseByDefault({
        id: 'lc2',
        date: '2026-05-04',
        accountId: 'card',
        amount: money(90000, 'UAH'),
        categoryId: 'clothes',
      }),
      STORED_AT,
    );

    const rows = repo.readProgressSummary().limitedCategories;

    expect(rows).toEqual([
      { month: '2026-05', currency: 'UAH', categoryId: 'food', spent: 120000 },
    ]);
    expect(rows.some((row) => row.categoryId === 'clothes')).toBe(false);
  });

  it('holds exactly what categoryBreakdown computes for that категорія', () => {
    const stored: Transaction[] = [
      expenseByDefault({
        id: 'lc3',
        date: '2026-05-03',
        accountId: 'card',
        amount: money(120000, 'UAH'),
        categoryId: 'food',
      }),
      refund({
        id: 'lc4',
        date: '2026-05-06',
        accountId: 'card',
        amount: money(35000, 'UAH'),
        categoryId: 'food',
      }),
    ];
    for (const t of stored) {
      txs.save(t, STORED_AT);
    }

    const breakdown = categoryBreakdown({ month: '2026-05', transactions: stored });
    const row = repo
      .readProgressSummary()
      .limitedCategories.find((one) => one.categoryId === 'food');

    expect(row!.spent).toBe(breakdown.get('UAH')!.get('food')!.amount);
  });

  it('a negative коригування reaches the correction категорія only when that one is limited', () => {
    limitsRepo(storage.db).set({
      categoryId: CORRECTION_CATEGORY_ID,
      amount: money(100000, 'UAH'),
    });
    txs.save(
      {
        type: 'correction',
        id: 'lc5',
        date: '2026-05-08',
        accountId: 'card',
        amount: money(-2500, 'UAH'),
      } satisfies Correction,
      STORED_AT,
    );

    const rows = repo.readProgressSummary().limitedCategories;

    expect(rows).toContainEqual({
      month: '2026-05',
      currency: 'UAH',
      categoryId: CORRECTION_CATEGORY_ID,
      spent: 2500,
    });
  });
});

describe('the first переказ onto a вид', () => {
  let storage: TestStorage;
  let repo: ProgressRepo;
  let txs: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    const accounts = accountsRepo(storage.db);
    for (const one of ACCOUNTS) {
      accounts.save(one);
    }
    txs = transactionsRepo(storage.db);
    repo = progressRepo(storage.db);
  });

  it('Scenario: The first переказ onto a вид is read alone', () => {
    txs.save(
      transfer({
        id: 'f2',
        date: '2025-08-14',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(100000, 'UAH'),
        arrived: money(100000, 'UAH'),
      }),
      STORED_AT,
    );
    txs.save(
      transfer({
        id: 'f1',
        date: '2025-03-02',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(50000, 'UAH'),
        arrived: money(50000, 'UAH'),
      }),
      STORED_AT,
    );

    const measured = counting(storage.db);

    expect(progressRepo(measured.db).firstTransferOntoKind('savings')).toBe('2025-03-02');
    expect(measured.largestResult()).toBe(0);
  });

  it('has no answer where no such переказ exists', () => {
    expect(repo.firstTransferOntoKind('investment')).toBeUndefined();
  });

  it('does not mistake a переказ out of the вид for one onto it', () => {
    txs.save(
      transfer({
        id: 'f3',
        date: '2025-03-02',
        fromAccountId: 'jar',
        toAccountId: 'card',
        left: money(50000, 'UAH'),
        arrived: money(50000, 'UAH'),
      }),
      STORED_AT,
    );

    expect(repo.firstTransferOntoKind('savings')).toBeUndefined();
  });
});

describe('the Nth транзакція', () => {
  let storage: TestStorage;
  let repo: ProgressRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    repo = progressRepo(storage.db);
    // Stored out of дата order on purpose: the order the Nth is counted in is дата first, and
    // only then the order the rows were stored.
    const dates = ['2026-01-05', '2026-01-01', '2026-01-05', '2025-12-30'];
    dates.forEach((date, index) => {
      storage.db
        .insert(transactions)
        .values({
          id: `n${index}`,
          type: 'expense',
          date,
          createdAt: STORED_AT,
          accountId: 'card',
          amount: 100,
          currency: 'UAH',
          categoryId: 'food',
        })
        .run();
    });
  });

  it('Scenario: The Nth транзакція is read alone', () => {
    const measured = counting(storage.db);
    const alone = progressRepo(measured.db);

    expect(alone.nthTransactionDate(1)).toBe('2025-12-30');
    expect(alone.nthTransactionDate(2)).toBe('2026-01-01');
    // The two of 2026-01-05 keep the order they were stored in.
    expect(alone.nthTransactionDate(3)).toBe('2026-01-05');
    expect(alone.nthTransactionDate(4)).toBe('2026-01-05');
    expect(measured.largestResult()).toBe(0);
  });

  it('Scenario: A crossed tier reads exactly one транзакція for its дата', () => {
    expect(repo.nthTransactionDate(3)).toBe('2026-01-05');
  });

  it('has no answer for a tier the history has not reached', () => {
    expect(repo.nthTransactionDate(500)).toBeUndefined();
  });

  it('refuses an N that is not a position', () => {
    expect(() => repo.nthTransactionDate(0)).toThrow();
    expect(() => repo.nthTransactionDate(-1)).toThrow();
  });
});

describe('the чернетки still waiting', () => {
  it('counts them by the місяць their own дата falls in', () => {
    const storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    storage.db
      .insert(notificationDrafts)
      .values([
        {
          id: 'd1',
          accountId: 'card',
          currency: 'UAH',
          date: '2026-05-18',
          text: 'щось',
          kind: 'raw',
          createdAt: STORED_AT,
        },
        {
          id: 'd2',
          accountId: 'card',
          currency: 'UAH',
          date: '2026-05-19',
          text: 'щось інше',
          kind: 'expense',
          amount: 1000,
          createdAt: STORED_AT,
        },
        {
          id: 'd3',
          accountId: 'card',
          currency: 'UAH',
          date: '2026-06-01',
          text: 'ще щось',
          kind: 'raw',
          createdAt: STORED_AT,
        },
      ])
      .run();

    expect(progressRepo(storage.db).readProgressSummary().drafts).toEqual([
      { month: '2026-05', waiting: 2 },
      { month: '2026-06', waiting: 1 },
    ]);
  });
});

describe('the earned досягнення in storage', () => {
  let storage: TestStorage;
  let repo: ProgressRepo;

  const RECORDED = new Date('2026-09-02T09:00:00.000Z');
  const SEEN = new Date('2026-09-02T09:30:00.000Z');

  const earned = (over: Partial<EarnedAchievement> = {}): EarnedAchievement => ({
    key: 'ledger.transactions:500',
    template: 'ledger.transactions',
    achievedOn: '2025-04-18',
    recordedAtMs: RECORDED.getTime(),
    evidence: { kind: 'count', count: 500 },
    ...over,
  });

  beforeEach(() => {
    storage = openTestDb();
    repo = progressRepo(storage.db);
  });

  it('Scenario: A stored досягнення round-trips', () => {
    repo.earn(earned());
    storage.close();
    // Reopening a `:memory:` database gives a new one, so the round trip is proved on a file.
    const path = join(mkdtempSync(join(tmpdir(), 'cap1tal-progress-')), 'progress.db');
    const first = openFileDb(path);
    progressRepo(first.db).earn(earned());
    first.close();

    const reopened = openFileDb(path);
    try {
      expect(progressRepo(reopened.db).listEarned()).toEqual([
        {
          key: 'ledger.transactions:500',
          template: 'ledger.transactions',
          achievedOn: '2025-04-18',
          recordedAtMs: RECORDED.getTime(),
          evidence: { kind: 'count', count: 500 },
        },
      ]);
    } finally {
      reopened.close();
      rmSync(path, { force: true });
    }
  });

  it('Scenario: Storing the same key twice stores one row', () => {
    repo.earn(earned({ evidence: { kind: 'count', count: 500 } }));
    repo.earn(earned({ evidence: { kind: 'count', count: 999 }, achievedOn: '2026-01-01' }));
    repo.earn(earned({ evidence: { kind: 'count', count: 1 } }));

    const stored = repo.listEarned();
    expect(stored).toHaveLength(1);
    // The first свідчення stays: the fact happened when it happened.
    expect(stored[0]?.evidence).toEqual({ kind: 'count', count: 500 });
    expect(stored[0]?.achievedOn).toBe('2025-04-18');
  });

  it('Scenario: Seen is recorded once and for all unseen at once', () => {
    for (let i = 0; i < 12; i += 1) {
      repo.earn(earned({ key: `ledger.transactions:${i}` }));
    }
    expect(repo.listEarned().every((one) => one.seenAtMs === undefined)).toBe(true);

    expect(repo.markAllSeen(SEEN)).toBe(12);

    expect(repo.listEarned().every((one) => one.seenAtMs === SEEN.getTime())).toBe(true);
    // A second opening marks nothing: they are already seen, and the moment they were is kept.
    expect(repo.markAllSeen(new Date('2026-09-03T10:00:00.000Z'))).toBe(0);
    expect(repo.listEarned().every((one) => one.seenAtMs === SEEN.getTime())).toBe(true);
  });

  it('hands the engine the keys it already holds', () => {
    repo.earn(earned({ key: 'a' }));
    repo.earn(earned({ key: 'b' }));

    expect(repo.earnedKeys()).toEqual(new Set(['a', 'b']));
  });

  it('keeps a row whose свідчення this build cannot read, and does not show it', () => {
    repo.earn(earned({ key: 'known' }));
    storage.db
      .insert(earnedAchievements)
      .values({
        key: 'from-a-later-build',
        template: 'something.new',
        achievedOn: '2026-09-02',
        recordedAt: RECORDED,
        seenAt: null,
        evidence: '{"kind":"constellation","stars":7}',
      })
      .run();

    expect(repo.listEarned().map((one) => one.key)).toEqual(['known']);
    // Kept, not deleted: a row is never removed by a code change.
    expect(storage.db.select().from(earnedAchievements).all()).toHaveLength(2);
  });

  it('refuses a дата that is not a calendar date, having written nothing', () => {
    expect(() => repo.earn(earned({ achievedOn: '2025-02-30' }))).toThrow();
    expect(repo.listEarned()).toEqual([]);
  });

  it('carries every свідчення shape through storage unchanged', () => {
    repo.earn(earned({ key: 'count', evidence: { kind: 'count', count: 2459 } }));
    repo.earn(
      earned({
        key: 'months',
        evidence: { kind: 'months', months: 3, from: '2026-04', to: '2026-06' },
      }),
    );
    repo.earn(
      earned({ key: 'money', evidence: { kind: 'money', money: money(4_000_000, 'UAH') } }),
    );
    repo.earn(earned({ key: 'month', evidence: { kind: 'month', month: '2026-06' } }));
    repo.earn(earned({ key: 'goal', evidence: { kind: 'goal', goalId: 'g1', name: 'Авто' } }));

    expect(repo.listEarned().map((one) => one.evidence)).toEqual([
      { kind: 'count', count: 2459 },
      { kind: 'goal', goalId: 'g1', name: 'Авто' },
      { kind: 'money', money: money(4_000_000, 'UAH') },
      { kind: 'month', month: '2026-06' },
      { kind: 'months', months: 3, from: '2026-04', to: '2026-06' },
    ]);
  });
});

describe('the owner`s decisions about виклики in storage', () => {
  let storage: TestStorage;
  let repo: ProgressRepo;
  const DECIDED = new Date('2026-09-01T20:00:00.000Z');

  beforeEach(() => {
    storage = openTestDb();
    repo = progressRepo(storage.db);
  });

  it('Scenario: A decision round-trips', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'cap1tal-decisions-')), 'decisions.db');
    const first = openFileDb(path);
    progressRepo(first.db).decide({
      key: 'close-month:2026-08',
      decision: 'accepted',
      decidedAtMs: DECIDED.getTime(),
    });
    first.close();

    const reopened = openFileDb(path);
    try {
      expect(progressRepo(reopened.db).listDecisions()).toEqual([
        { key: 'close-month:2026-08', decision: 'accepted', decidedAtMs: DECIDED.getTime() },
      ]);
    } finally {
      reopened.close();
      rmSync(path, { force: true });
    }
  });

  it('Scenario: A decision is replaced under its key', () => {
    const later = new Date('2026-09-02T08:00:00.000Z');
    repo.decide({ key: 'invest-habit', decision: 'accepted', decidedAtMs: DECIDED.getTime() });
    repo.decide({ key: 'invest-habit', decision: 'dismissed', decidedAtMs: later.getTime() });

    expect(repo.listDecisions()).toEqual([
      { key: 'invest-habit', decision: 'dismissed', decidedAtMs: later.getTime() },
    ]);
  });

  it('Scenario: Nothing derived is stored beside it', () => {
    repo.decide({ key: 'invest-habit', decision: 'accepted', decidedAtMs: DECIDED.getTime() });

    const row = storage.db.select().from(challengeDecisions).all()[0]!;
    expect(Object.keys(row).sort()).toEqual(['decidedAt', 'decision', 'key']);
  });

  it('brings a dismissed виклик back by removing the decision, not by a third state', () => {
    repo.decide({ key: 'invest-habit', decision: 'dismissed', decidedAtMs: DECIDED.getTime() });

    repo.undecide('invest-habit');

    expect(repo.listDecisions()).toEqual([]);
  });
});

describe('the місячна норма витрат in storage', () => {
  let storage: TestStorage;
  let repo: ProgressRepo;
  const CONFIRMED = new Date('2026-08-31T18:00:00.000Z');

  beforeEach(() => {
    storage = openTestDb();
    repo = progressRepo(storage.db);
  });

  it('Scenario: A норма round-trips per currency', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'cap1tal-norms-')), 'norms.db');
    const first = openFileDb(path);
    progressRepo(first.db).confirmNorm({
      amount: money(3_050_000, 'UAH'),
      confirmedAtMs: CONFIRMED.getTime(),
    });
    progressRepo(first.db).confirmNorm({
      amount: money(40_000, 'USD'),
      confirmedAtMs: CONFIRMED.getTime(),
    });
    first.close();

    const reopened = openFileDb(path);
    try {
      const norms = progressRepo(reopened.db).norms();
      expect(norms.get('UAH')).toEqual({
        amount: money(3_050_000, 'UAH'),
        confirmedAtMs: CONFIRMED.getTime(),
      });
      expect(norms.get('USD')).toEqual({
        amount: money(40_000, 'USD'),
        confirmedAtMs: CONFIRMED.getTime(),
      });
      // Neither was converted: two currencies, two сум, no rate anywhere.
      expect([...norms.keys()]).toEqual(['UAH', 'USD']);
    } finally {
      reopened.close();
      rmSync(path, { force: true });
    }
  });

  it('Scenario: Confirming again replaces', () => {
    repo.confirmNorm({ amount: money(3_050_000, 'UAH'), confirmedAtMs: CONFIRMED.getTime() });
    repo.confirmNorm({ amount: money(3_200_000, 'UAH'), confirmedAtMs: CONFIRMED.getTime() });

    expect([...repo.norms().values()]).toEqual([
      { amount: money(3_200_000, 'UAH'), confirmedAtMs: CONFIRMED.getTime() },
    ]);
  });

  it('Scenario: A non-positive норма is rejected', () => {
    expect(() =>
      repo.confirmNorm({ amount: money(0, 'UAH'), confirmedAtMs: CONFIRMED.getTime() }),
    ).toThrow();
    expect(() =>
      repo.confirmNorm({ amount: money(-1, 'UAH'), confirmedAtMs: CONFIRMED.getTime() }),
    ).toThrow();

    expect(repo.norm('UAH')).toBeUndefined();
  });

  it('Scenario: An absent норма is absent, not zero', () => {
    repo.confirmNorm({ amount: money(3_050_000, 'UAH'), confirmedAtMs: CONFIRMED.getTime() });

    expect(repo.norm('EUR')).toBeUndefined();
    expect(repo.norms().has('EUR')).toBe(false);
    // And the one that exists is not confused with it.
    expect(repo.norm('UAH')?.amount).toEqual(money(3_050_000, 'UAH'));
  });
});
