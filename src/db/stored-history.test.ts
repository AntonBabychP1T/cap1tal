import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'drizzle-orm';
import * as fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account, computeBalance, computeBalances, type Account, type AccountKind } from '../domain/account';
import { money, type CurrencyCode } from '../domain/money';
import {
  CORRECTION_CATEGORY_ID,
  expenseByDefault,
  FEES_CATEGORY_ID,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from '../domain/transaction';
import { mergeAccounts } from './account-merge-repo';
import { accountsRepo } from './accounts-repo';
import { backupRepo } from './backup-repo';
import { netWorthRepo } from './net-worth-repo';
import { reportingRepo } from './reporting-repo';
import { transactions as transactionsTable } from './schema';
import { stampedMemo, storageStamp, storedHistory } from './stored-history';
import { openFileDb, openTestDb, seedReferences, type TestDb, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const VOCABULARY = { categories: ['food', UNCATEGORISED_CATEGORY_ID], sources: ['salary'] } as const;

const card = account({
  id: 'card',
  name: 'mono black',
  kind: 'spending',
  currency: 'UAH',
  openingBalance: money(100000, 'UAH'),
});
const usd = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });

const storedAt = new Date('2026-03-01T09:00:00.000Z');

function spent(id: string, date: string, amount: number, categoryId = 'food'): Transaction {
  return expenseByDefault({
    id,
    date,
    accountId: 'card',
    amount: money(amount, 'UAH'),
    categoryId,
  });
}

function seed(db: TestDb): void {
  seedReferences(db, VOCABULARY);
  accountsRepo(db).save(card);
  accountsRepo(db).save(usd);
}

/** Every stored транзакція's id, read straight from the table — the memo's ground truth. */
function storedIds(db: TestDb): string[] {
  return db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .all()
    .map((row) => row.id)
    .sort();
}

describe('stampedMemo', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seed(storage.db);
    transactionsRepo(storage.db).save(spent('e1', '2026-03-02', 1000), storedAt);
  });

  afterEach(() => storage.close());

  it('Scenario: A second read with nothing written in between reads nothing again', () => {
    let reads = 0;
    const memo = stampedMemo(storage.db, () => {
      reads += 1;
      return storedIds(storage.db);
    });

    const first = memo();
    const second = memo();

    expect(second).toEqual(first);
    expect(second).toBe(first);
    expect(reads).toBe(1);

    // The same through the stored-history memo: the second answer is the first one, not a copy.
    const history = storedHistory(storage.db);
    expect(history.read()).toBe(history.read());
  });

  it('a key other than the remembered one reads again', () => {
    let reads = 0;
    const memo = stampedMemo(storage.db, (day) => {
      reads += 1;
      return day;
    });
    expect(memo('2026-03-01')).toBe('2026-03-01');
    expect(memo('2026-03-01')).toBe('2026-03-01');
    expect(memo('2026-03-02')).toBe('2026-03-02');
    expect(reads).toBe(2);
  });

  it('Scenario: A write that was rolled back changes nothing', () => {
    const history = storedHistory(storage.db);
    const before = history.read();

    expect(() =>
      storage.db.transaction(
        (tx) => {
          transactionsRepo(tx).save(spent('e-rolled', '2026-03-03', 500), storedAt);
          tx.rollback();
        },
        { behavior: 'immediate' },
      ),
    ).toThrow();

    const after = history.read();
    expect(after.transactions).toEqual(before.transactions);
    expect(after.balances()).toEqual(before.balances());
  });

  it('Scenario: A read taken inside a write that is then rolled back is not remembered', () => {
    const history = storedHistory(storage.db);
    history.read();

    expect(() =>
      storage.db.transaction(
        (tx) => {
          transactionsRepo(tx).save(spent('e-rolled', '2026-03-03', 500), storedAt);
          // Read on the app's own opening while the write is in progress: it sees the row…
          expect(history.read().transactions.map((t) => t.id)).toContain('e-rolled');
          tx.rollback();
        },
        { behavior: 'immediate' },
      ),
    ).toThrow();

    // …and nothing of it is remembered once the write is rolled back.
    expect(history.read().transactions.map((t) => t.id)).toEqual(['e1']);
  });

  it("Scenario: One caller cannot change another caller's answer", () => {
    const history = storedHistory(storage.db);
    const answer = history.read();

    expect(() => (answer.transactions as Transaction[]).push(spent('x', '2026-03-04', 1))).toThrow();
    expect(() => {
      (answer.transactions[0] as { amount: unknown }).amount = money(1, 'UAH');
    }).toThrow();
    expect(() => {
      (answer.transactions[0] as { amount: { amount: number } }).amount.amount = 1;
    }).toThrow();
    expect(() => (answer.accounts as unknown[]).pop()).toThrow();
    expect(() => (answer.balances() as Map<string, unknown>).set('card', money(0, 'UAH'))).toThrow();
    expect(() => (answer.balances() as Map<string, unknown>).delete('card')).toThrow();
    expect(() => (answer.byMonth() as Map<string, unknown>).clear()).toThrow();
    expect(() => (answer.byMonth().get('2026-03') as Transaction[]).push(spent('y', '2026-03-05', 1))).toThrow();

    const next = history.read();
    expect(next.transactions.map((t) => t.id)).toEqual(['e1']);
    expect(next.transactions[0]).toEqual(spent('e1', '2026-03-02', 1000));
    expect(next.balances().get('card')).toEqual(money(99000, 'UAH'));
  });

  it('Scenario: A журнал entry between two reads does not cause a re-read', () => {
    let reads = 0;
    const memo = stampedMemo(storage.db, () => {
      reads += 1;
      return storedIds(storage.db);
    });
    const history = storedHistory(storage.db);
    const firstHistory = history.read();
    const first = memo();
    const stamp = storageStamp(storage.db);

    // The owner opens another screen: the root layout records it in the журнал.
    reportingRepo(storage.db).append({
      id: 'j1',
      at: new Date('2026-03-02T10:00:00.000Z'),
      kind: 'screen',
      name: '/(tabs)/accounts',
    });

    expect(storageStamp(storage.db)).toBe(stamp);
    expect(memo()).toBe(first);
    expect(reads).toBe(1);
    expect(history.read()).toBe(firstHistory);

    // A real write after it still moves the stamp.
    transactionsRepo(storage.db).save(spent('e2', '2026-03-03', 200), storedAt);
    expect(memo()).toEqual(['e1', 'e2']);
    expect(reads).toBe(2);
  });
});

describe('storedHistory', () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = openTestDb();
    seed(storage.db);
  });

  afterEach(() => storage.close());

  it('Scenario: A транзакція saved in between is in the next answer', () => {
    const repo = transactionsRepo(storage.db);
    repo.save(spent('e1', '2026-03-02', 1000), storedAt);
    const history = storedHistory(storage.db);
    const before = history.read();

    const saved = spent('e2', '2026-03-10', 2550);
    repo.save(saved, storedAt);
    const after = history.read();

    expect(after.transactions).toContainEqual(saved);
    expect(after.balances().get('card')!.amount).toBe(before.balances().get('card')!.amount - 2550);
    expect(after.balancesIfSafe()).toBe(after.balances());
  });

  it('Scenario: A removal, a recategorisation and a restore are all seen', () => {
    const repo = transactionsRepo(storage.db);
    repo.save(spent('e1', '2026-03-02', 1000), storedAt);
    repo.save(spent('e2', '2026-03-03', 2000, UNCATEGORISED_CATEGORY_ID), storedAt);
    repo.save(spent('e3', '2026-04-01', 3000), storedAt);
    const history = storedHistory(storage.db);
    const fresh = () => ({
      transactions: repo.listAll(),
      balances: computeBalances(accountsRepo(storage.db).list(), repo.listAll()),
    });
    const snapshot = backupRepo(storage.db).snapshot();
    history.read();

    repo.remove('e1');
    expect(history.read().transactions).toEqual(fresh().transactions);
    expect(history.read().balances()).toEqual(fresh().balances);

    repo.setCategory('e2', 'food');
    expect(history.read().transactions.find((t) => t.id === 'e2')).toMatchObject({
      categoryId: 'food',
    });
    expect(history.read().transactions).toEqual(fresh().transactions);

    // Two рахунки merged: the one folded away is gone and its транзакції now name the other.
    const spare = account({ id: 'spare', name: 'запасна', kind: 'spending', currency: 'UAH' });
    accountsRepo(storage.db).save(spare);
    repo.save({ ...spent('e4', '2026-04-02', 400), accountId: 'spare' } as Transaction, storedAt);
    history.read();
    mergeAccounts(storage.db, { fromId: 'spare', intoId: 'card' });
    expect(history.read().accounts.map((a) => a.id)).not.toContain('spare');
    expect(history.read().transactions.find((t) => t.id === 'e4')).toMatchObject({ accountId: 'card' });
    expect(history.read().transactions).toEqual(fresh().transactions);
    expect(history.read().balances()).toEqual(fresh().balances);

    backupRepo(storage.db).replaceAll(snapshot);
    expect(history.read().transactions).toEqual(fresh().transactions);
    expect(history.read().transactions.map((t) => t.id).sort()).toEqual(['e1', 'e2', 'e3']);
    expect(history.read().balances()).toEqual(fresh().balances);
  });

  it('Scenario: The «Без категорії» count and the статок reads follow a write', () => {
    const repo = transactionsRepo(storage.db);
    const netWorth = netWorthRepo(storage.db);
    repo.save(spent('e1', '2026-03-02', 1000, UNCATEGORISED_CATEGORY_ID), storedAt);
    repo.save(spent('e2', '2026-03-03', 2000, UNCATEGORISED_CATEGORY_ID), storedAt);
    const today = '2026-03-31';
    const statok = (from: ReturnType<typeof netWorthRepo>) => ({
      monthly: from.monthlyMovement(today),
      firstDates: from.firstDates(today),
      firstDateMovement: from.firstDateMovement(today),
      future: [...from.accountsWithFutureRecords(today)],
    });
    const countBefore = repo.countUncategorised();
    const statokBefore = statok(netWorth);

    repo.setCategory('e1', 'food');

    expect(repo.countUncategorised()).toBe(countBefore - 1);
    expect(statok(netWorth)).toEqual(statok(netWorthRepo(storage.db)));
    expect(statok(netWorth)).toEqual(statokBefore);

    repo.save(spent('e3', '2026-03-04', 500), storedAt);
    expect(statok(netWorth)).toEqual(statok(netWorthRepo(storage.db)));
    expect(statok(netWorth)).not.toEqual(statokBefore);
  });

  it('months and byMonth are the listing and listMonth readings of the same rows', () => {
    const repo = transactionsRepo(storage.db);
    repo.save(spent('b', '2026-03-02', 1000), storedAt);
    repo.save(spent('a', '2026-03-02', 1000), new Date('2026-03-02T09:00:00.000Z'));
    repo.save(spent('c', '2026-01-31', 3000), storedAt);
    repo.save(spent('d', '2026-04-01', 3000), storedAt);

    const answer = storedHistory(storage.db).read();

    expect(answer.transactions).toEqual(repo.listAll());
    // Its head is the latest listing — what Головний's стрічка is cut from.
    expect(answer.transactions.slice(0, 3)).toEqual(repo.listLatest(3));
    expect(answer.months).toEqual(['2026-04', '2026-03', '2026-01']);
    for (const month of answer.months) {
      expect(answer.byMonth().get(month)).toEqual(repo.listMonth(month));
    }
  });

  it('Scenario: A balance beyond the safe range is refused only to readers of balances', () => {
    const repo = transactionsRepo(storage.db);
    // Each amount is safe on its own; the two together take the рахунок past the safe range.
    const huge = Number.MAX_SAFE_INTEGER - 10;
    repo.save(
      { type: 'income', id: 'i1', date: '2026-03-01', accountId: 'card', amount: money(huge, 'UAH'), sourceId: 'salary' },
      storedAt,
    );
    repo.save(
      { type: 'income', id: 'i2', date: '2026-03-02', accountId: 'card', amount: money(huge, 'UAH'), sourceId: 'salary' },
      storedAt,
    );
    expect(() => computeBalances(accountsRepo(storage.db).list(), repo.listAll())).toThrow();

    const answer = storedHistory(storage.db).read();

    expect(() => answer.balances()).toThrow();
    // Asked again, the same refusal — not a half-built answer.
    expect(() => answer.balances()).toThrow();
    // A reader that can compute only what it needs (a ціль's склад) is told "none", not refused.
    expect(answer.balancesIfSafe()).toBeUndefined();
    expect(answer.transactions.map((t) => t.id)).toEqual(['i2', 'i1']);
    expect(answer.months).toEqual(['2026-03']);
    expect(answer.byMonth().get('2026-03')!.map((t) => t.id)).toEqual(['i1', 'i2']);
  });
});

describe('storedHistory over two openings of one file', () => {
  let dir: string;
  let app: TestStorage;
  let background: TestStorage;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cap1tal-stamp-'));
    app = openFileDb(join(dir, 'cap1tal.db'));
    seed(app.db);
    background = openFileDb(join(dir, 'cap1tal.db'));
    transactionsRepo(app.db).save(spent('e1', '2026-03-02', 1000), storedAt);
  });

  afterEach(() => {
    app.close();
    background.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('Scenario: A write committed by the background opening is seen on the next read', () => {
    const history = storedHistory(app.db);
    expect(history.read().transactions.map((t) => t.id)).toEqual(['e1']);

    // The фоновий прогін commits on its own connection.
    transactionsRepo(background.db).save(spent('e-bg', '2026-03-05', 700), storedAt);

    const next = history.read();
    expect(next.transactions.map((t) => t.id)).toEqual(['e-bg', 'e1']);
    expect(next.balances().get('card')).toEqual(money(100000 - 1000 - 700, 'UAH'));
  });

  it('Scenario: A write committed by the background opening during a read is seen on the next read', () => {
    let committedDuringRead = false;
    const memo = stampedMemo(app.db, () => {
      // The read runs its SELECT…
      const rows = storedIds(app.db);
      // …the background opening commits before the read returns…
      if (!committedDuringRead) {
        committedDuringRead = true;
        transactionsRepo(background.db).save(spent('e-bg', '2026-03-05', 700), storedAt);
      }
      // …and the read hands back what it saw before that commit.
      return rows;
    });

    expect(memo()).toEqual(['e1']);
    // Had the stamp been taken after the read, it would include the commit and this would stay
    // ['e1'] — checked by hand once, when this test was written.
    expect(memo()).toEqual(['e-bg', 'e1']);
  });

  it('a журнал entry the background opening writes costs one rebuild, never a stale answer', () => {
    const history = storedHistory(app.db);
    const first = history.read();
    reportingRepo(background.db).append({
      id: 'j-bg',
      at: new Date('2026-03-02T10:00:00.000Z'),
      kind: 'step',
      name: 'monobank-sync',
    });
    const second = history.read();
    expect(second).not.toBe(first);
    expect(second.transactions).toEqual(first.transactions);
  });
});

describe('storageStamp', () => {
  it('moves on a write through any repository and stays put on a read', () => {
    const storage = openTestDb();
    seed(storage.db);
    const stamp = storageStamp(storage.db);
    storage.db.get(sql`select count(*) from transactions`);
    expect(storageStamp(storage.db)).toBe(stamp);
    transactionsRepo(storage.db).save(spent('e1', '2026-03-02', 1000), storedAt);
    expect(storageStamp(storage.db)).not.toBe(stamp);
    storage.close();
  });
});

describe('served balances', () => {
  const KINDS: readonly AccountKind[] = ['spending', 'savings', 'investment', 'cash', 'debt'];
  const CURRENCIES: readonly CurrencyCode[] = ['UAH', 'USD', 'EUR'];

  const accountSpec = fc.record({
    kind: fc.constantFrom(...KINDS),
    currency: fc.constantFrom(...CURRENCIES),
    opening: fc.integer({ min: -10_000_000, max: 10_000_000 }),
    archived: fc.boolean(),
  });

  const date = fc
    .record({
      year: fc.integer({ min: 2023, max: 2026 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
    })
    .map(({ year, month, day }) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

  const amount = fc.integer({ min: 1, max: 5_000_000 });

  /** One транзакція, over account indexes resolved once the рахунки are known. */
  const transactionSpec = fc.oneof(
    fc.record({ type: fc.constant('expense' as const), at: fc.nat(), date, amount, fee: fc.boolean() }),
    fc.record({ type: fc.constant('income' as const), at: fc.nat(), date, amount }),
    fc.record({ type: fc.constant('refund' as const), at: fc.nat(), date, amount }),
    fc.record({
      type: fc.constant('correction' as const),
      at: fc.nat(),
      date,
      amount: fc.integer({ min: -5_000_000, max: 5_000_000 }).filter((n) => n !== 0),
    }),
    fc.record({ type: fc.constant('transfer' as const), at: fc.nat(), to: fc.nat(), date, left: amount, arrived: amount }),
  );

  const historySpec = fc.record({
    accounts: fc.array(accountSpec, { minLength: 2, maxLength: 6 }),
    transactions: fc.array(transactionSpec, { maxLength: 40 }),
  });
  type HistorySpec = typeof historySpec extends fc.Arbitrary<infer H> ? H : never;

  function build(spec: HistorySpec) {
    const accounts: Account[] = spec.accounts.map((a, i) =>
      account({
        id: `a${i}`,
        name: `рахунок ${i}`,
        // Always one рахунок-борг and one archived рахунок among the generated ones.
        kind: i === 0 ? 'debt' : a.kind,
        currency: a.currency,
        openingBalance: money(a.opening, a.currency),
        archived: i === 1 ? true : a.archived,
      }),
    );
    const transactions: Transaction[] = [];
    spec.transactions.forEach((t, i) => {
      const on = accounts[t.at % accounts.length]!;
      const id = `t${i}`;
      switch (t.type) {
        case 'expense':
          transactions.push(
            expenseByDefault({
              id,
              date: t.date,
              accountId: on.id,
              amount: money(t.amount, on.currency),
              categoryId: t.fee ? FEES_CATEGORY_ID : 'food',
            }),
          );
          return;
        case 'income':
          transactions.push({ type: 'income', id, date: t.date, accountId: on.id, amount: money(t.amount, on.currency), sourceId: 'salary' });
          return;
        case 'refund':
          transactions.push({ type: 'refund', id, date: t.date, accountId: on.id, amount: money(t.amount, on.currency), categoryId: 'food' });
          return;
        case 'correction':
          transactions.push({ type: 'correction', id, date: t.date, accountId: on.id, amount: money(t.amount, on.currency) });
          return;
        case 'transfer': {
          // Storage's CHECK refuses a переказ onto the рахунок it leaves, so the destination is
          // any other one — across currencies whenever the two differ.
          const others = accounts.filter((a) => a.id !== on.id);
          const to = others[t.to % others.length]!;
          transactions.push(
            transfer({
              id,
              date: t.date,
              fromAccountId: on.id,
              toAccountId: to.id,
              left: money(t.left, on.currency),
              arrived: money(on.currency === to.currency ? t.left : t.arrived, to.currency),
            }),
          );
          return;
        }
      }
    });
    return { accounts, transactions };
  }

  it('Scenario: Served balances agree with a fresh computation over any history', () => {
    fc.assert(
      fc.property(historySpec, (spec) => {
        const { accounts, transactions } = build(spec);
        const storage = openTestDb();
        try {
          seedReferences(storage.db, {
            categories: ['food', FEES_CATEGORY_ID, CORRECTION_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID],
            sources: ['salary'],
          });
          for (const a of accounts) accountsRepo(storage.db).save(a);
          for (const t of transactions) transactionsRepo(storage.db).save(t, storedAt);

          const served = storedHistory(storage.db).read().balances();

          expect(served.size).toBe(accounts.length);
          for (const a of accounts) {
            // The per-рахунок fold over the whole history: opening balance plus every effect.
            expect(served.get(a.id)).toEqual(computeBalance(a, transactions));
          }
        } finally {
          storage.close();
        }
      }),
      { numRuns: 60 },
    );
  });

  it('a переказ onto the рахунок it leaves counts once — the rule computeBalances serves', () => {
    // Unreachable through storage (its CHECK refuses one), so asserted where balances are made.
    const same = { ...transfer({ id: 's', date: '2026-03-01', fromAccountId: 'card', toAccountId: 'usd', left: money(500, 'UAH'), arrived: money(500, 'UAH') }), toAccountId: 'card' };
    expect(computeBalances([card], [same]).get('card')).toEqual(computeBalance(card, [same]));
  });

  it('Scenario: A переказ between currencies moves each leg in its own currency', () => {
    const storage = openTestDb();
    seed(storage.db);
    const history = storedHistory(storage.db);
    const before = history.read().balances();

    transactionsRepo(storage.db).save(
      transfer({
        id: 'x',
        date: '2026-03-15',
        fromAccountId: 'card',
        toAccountId: 'usd',
        left: money(400000, 'UAH'),
        arrived: money(10000, 'USD'),
      }),
      storedAt,
    );
    const after = history.read().balances();

    expect(after.get('card')).toEqual(money(before.get('card')!.amount - 400000, 'UAH'));
    expect(after.get('usd')).toEqual(money(before.get('usd')!.amount + 10000, 'USD'));
    storage.close();
  });
});
