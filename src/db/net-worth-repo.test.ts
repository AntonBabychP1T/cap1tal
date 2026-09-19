import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { account, computeBalance, type Account } from '../domain/account';
import { money, type CurrencyCode } from '../domain/money';
import {
  expenseByDefault,
  refund,
  transfer,
  type Correction,
  type Income,
  type Transaction,
  UNCATEGORISED_CATEGORY_ID,
} from '../domain/transaction';
import { accountsRepo } from './accounts-repo';
import { netWorthRepo, type NetWorthRepo } from './net-worth-repo';
import { openTestDb, seedReferences, type TestStorage } from './test-db';
import { transactionsRepo, type TransactionsRepo } from './transactions-repo';

const VOCABULARY = {
  categories: ['food', UNCATEGORISED_CATEGORY_ID],
  sources: ['salary'],
} as const;

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const usdAccount = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });
const archived = account({
  id: 'archived',
  name: 'стара картка',
  kind: 'spending',
  currency: 'UAH',
  archived: true,
});

const income = (
  id: string,
  accountId: string,
  date: string,
  amountMinor: number,
  currency: CurrencyCode = 'UAH',
): Income => ({
  type: 'income',
  id,
  date,
  accountId,
  amount: money(amountMinor, currency),
  sourceId: 'salary',
});

const correctionOf = (
  id: string,
  accountId: string,
  date: string,
  amountMinor: number,
  currency: CurrencyCode = 'UAH',
): Correction => ({
  type: 'correction',
  id,
  date,
  accountId,
  amount: money(amountMinor, currency),
});

const storedAt = new Date('2026-01-01T00:00:00.000Z');

describe('netWorthRepo', () => {
  let storage: TestStorage;
  let repo: NetWorthRepo;
  let transactions: TransactionsRepo;

  beforeEach(() => {
    storage = openTestDb();
    seedReferences(storage.db, VOCABULARY);
    accountsRepo(storage.db).save(card);
    accountsRepo(storage.db).save(jar);
    accountsRepo(storage.db).save(usdAccount);
    accountsRepo(storage.db).save(archived);
    transactions = transactionsRepo(storage.db);
    repo = netWorthRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('Scenario: The first date does not absorb its whole month', () => {
    transactions.save(income('i-june5', 'card', '2026-06-05', 10000), storedAt);
    transactions.save(
      expenseByDefault({
        id: 'e-june20',
        date: '2026-06-20',
        accountId: 'card',
        amount: money(2000, 'UAH'),
        categoryId: 'food',
      }),
      storedAt,
    );

    const firstDateNet = repo.firstDateMovement('2026-09-19').find((r) => r.accountId === 'card');
    const juneMonthNet = repo
      .monthlyMovement('2026-09-19')
      .find((r) => r.accountId === 'card' && r.month === '2026-06');

    expect(firstDateNet?.net).toBe(10000);
    expect(juneMonthNet?.net).toBe(8000);
    expect(repo.firstDates('2026-09-19')).toContainEqual({
      accountId: 'card',
      firstDate: '2026-06-05',
    });
  });

  it('Scenario: Future rows are excluded from historical aggregates and flagged', () => {
    transactions.save(income('i-past', 'card', '2026-06-05', 10000), storedAt);
    transactions.save(
      expenseByDefault({
        id: 'e-future',
        date: '2026-10-02',
        accountId: 'card',
        amount: money(5000, 'UAH'),
        categoryId: 'food',
      }),
      storedAt,
    );

    const today = '2026-09-19';
    const juneNet = repo.monthlyMovement(today).find((r) => r.accountId === 'card' && r.month === '2026-06');
    const octoberEntry = repo.monthlyMovement(today).find((r) => r.month === '2026-10');
    expect(juneNet?.net).toBe(10000);
    expect(octoberEntry).toBeUndefined();
    expect(repo.firstDates(today)).toContainEqual({ accountId: 'card', firstDate: '2026-06-05' });
    expect(repo.accountsWithFutureRecords(today).has('card')).toBe(true);
    expect(repo.accountsWithFutureRecords(today).has('jar')).toBe(false);
  });

  it('Scenario: All accounts participate, archived included', () => {
    transactions.save(income('i-archived', 'archived', '2026-05-01', 30000), storedAt);
    const today = '2026-09-19';
    expect(repo.firstDates(today)).toContainEqual({ accountId: 'archived', firstDate: '2026-05-01' });
    expect(
      repo.monthlyMovement(today).find((r) => r.accountId === 'archived' && r.month === '2026-05')?.net,
    ).toBe(30000);
  });

  it('Scenario: Multiple currencies keep independent per-account effects', () => {
    const cross = transfer({
      id: 't-cross',
      date: '2026-07-10',
      fromAccountId: 'card',
      toAccountId: 'usd',
      left: money(410000, 'UAH'),
      arrived: money(10000, 'USD'),
    });
    transactions.save(cross, storedAt);

    const today = '2026-09-19';
    const cardMonth = repo.monthlyMovement(today).find((r) => r.accountId === 'card' && r.month === '2026-07');
    const usdMonth = repo.monthlyMovement(today).find((r) => r.accountId === 'usd' && r.month === '2026-07');
    expect(cardMonth?.net).toBe(-410000);
    expect(usdMonth?.net).toBe(10000);
  });

  it('Scenario: A transfer leg and a refund both move the right account', () => {
    transactions.save(
      refund({
        id: 'r1',
        date: '2026-04-02',
        accountId: 'jar',
        amount: money(1500, 'UAH'),
        categoryId: 'food',
      }),
      storedAt,
    );
    const today = '2026-09-19';
    expect(
      repo.monthlyMovement(today).find((r) => r.accountId === 'jar' && r.month === '2026-04')?.net,
    ).toBe(1500);
  });

  it('Scenario: A no-transaction account appears in none of these readings', () => {
    // net-worth-repo answers only what it can compute from `transactions`; a рахунок the caller
    // knows about (from the accounts list) but that carries no транзакція yet is simply absent
    // here, not zeroed — the domain layer (task 2.4/2.5) is what still retains it.
    const today = '2026-09-19';
    expect(repo.firstDates(today).some((r) => r.accountId === 'jar')).toBe(false);
    expect(repo.monthlyMovement(today).some((r) => r.accountId === 'jar')).toBe(false);
    expect(repo.firstDateMovement(today).some((r) => r.accountId === 'jar')).toBe(false);
    expect(repo.accountsWithFutureRecords(today).has('jar')).toBe(false);
  });

  it('Scenario: Empty months between two touched months carry no row of their own', () => {
    transactions.save(income('i-june', 'card', '2026-06-05', 10000), storedAt);
    transactions.save(income('i-august', 'card', '2026-08-01', 5000), storedAt);
    const months = repo
      .monthlyMovement('2026-09-19')
      .filter((r) => r.accountId === 'card')
      .map((r) => r.month)
      .sort();
    expect(months).toEqual(['2026-06', '2026-08']);
  });
});

/** The twelve calendar months ending at, and including, `today`'s month — oldest first. */
function monthsBackFrom(today: string, count: number): string[] {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    months.push(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  return months;
}

/** Every transaction that touches `accountId`, whichever role it plays in a переказ. */
function touchingAccount(all: readonly Transaction[], accountId: string): Transaction[] {
  return all.filter(
    (t) =>
      (t.type !== 'transfer' && t.accountId === accountId) ||
      (t.type === 'transfer' && (t.fromAccountId === accountId || t.toAccountId === accountId)),
  );
}

describe('netWorthRepo — differential verification against computeBalance (task 2.3)', () => {
  const TODAY = '2026-09-19';
  const ACCOUNT_COUNT = 30;
  const MONTH_COUNT = 120;

  it('Scenario: Generated 50000-record histories agree with computeBalance, bounded by accounts x months', () => {
    const storage = openTestDb();
    try {
      seedReferences(storage.db, { categories: ['food', 'fees'], sources: ['salary'] });
      const currencyOf = (i: number): CurrencyCode => (i % 5 === 0 ? 'EUR' : i % 3 === 0 ? 'USD' : 'UAH');
      const accountList: Account[] = Array.from({ length: ACCOUNT_COUNT }, (_, i) =>
        account({
          id: `acc-${i}`,
          name: `рахунок ${i}`,
          kind: 'spending',
          currency: currencyOf(i),
          openingBalance: money(i % 2 === 0 ? 100000 : 0, currencyOf(i)),
        }),
      );
      const write = accountsRepo(storage.db);
      for (const a of accountList) write.save(a);

      const months = monthsBackFrom(TODAY, MONTH_COUNT);
      const allTransactions: Transaction[] = [];
      let counter = 0;

      storage.db.transaction(
        (tx) => {
          const repoTx = transactionsRepo(tx);
          for (const month of months) {
            for (let i = 0; i < ACCOUNT_COUNT; i++) {
              const acc = accountList[i]!;
              // Five repetitions per (month, account) cell so the generated ledger comfortably
              // exceeds 50000 records while `monthlyMovement`'s output stays exactly accounts x
              // months — repeating within a cell adds records, never a new (account, month) row.
              for (let rep = 0; rep < 5; rep++) {
              const day = String((counter % 27) + 1).padStart(2, '0');
              const date = `${month}-${day}`;

              const expense = expenseByDefault({
                id: `e-${counter++}`,
                date,
                accountId: acc.id,
                amount: money(1000 + (counter % 5000), acc.currency),
                categoryId: 'food',
              });
              repoTx.save(expense, storedAt);
              allTransactions.push(expense);

              const earned = income(`i-${counter}`, acc.id, date, 2000 + (counter % 3000), acc.currency);
              counter++;
              repoTx.save(earned, storedAt);
              allTransactions.push(earned);

              const corr = correctionOf(
                `c-${counter}`,
                acc.id,
                date,
                counter % 2 === 0 ? 50 : -50,
                acc.currency,
              );
              counter++;
              repoTx.save(corr, storedAt);
              allTransactions.push(corr);

              // A same-currency transfer to the next account, shortfall (a Комісія-style split)
              // on every fourth one — exercising exactly what task 2.1's accepted/declined fee
              // scenario covers, now differentially against the repository's SQL aggregates.
              const dest = accountList[(i + 1) % ACCOUNT_COUNT]!;
              if (dest.currency === acc.currency) {
                const left = money(500 + (counter % 2000), acc.currency);
                const shortfall = counter % 4 === 0;
                const arrived = shortfall ? money(left.amount - 100, acc.currency) : left;
                const t = transfer({
                  id: `t-${counter}`,
                  date,
                  fromAccountId: acc.id,
                  toAccountId: dest.id,
                  left,
                  arrived,
                });
                counter++;
                repoTx.save(t, storedAt);
                allTransactions.push(t);
                if (shortfall) {
                  const fee = expenseByDefault({
                    id: `fee-${counter}`,
                    date,
                    accountId: acc.id,
                    amount: money(100, acc.currency),
                    categoryId: 'fees',
                  });
                  counter++;
                  repoTx.save(fee, storedAt);
                  allTransactions.push(fee);
                }
              }
              }
            }
          }
        },
        { behavior: 'immediate' },
      );

      expect(allTransactions.length).toBeGreaterThanOrEqual(50000);

      const repo = netWorthRepo(storage.db);
      // Task 5.4: the same four reads Головний's Статок widget makes on every load, timed
      // together over this exact 50000-record/30-account/120-month fixture — the one
      // `dashboard-layout`-style Node proxy for "profile the fixture" that `verify` can run; the
      // device's own frame rate is recorded on the emulator in §7, not here.
      const start = performance.now();
      const monthly = repo.monthlyMovement(TODAY);
      const firsts = repo.firstDates(TODAY);
      const firstMovement = repo.firstDateMovement(TODAY);
      const futureRecords = repo.accountsWithFutureRecords(TODAY);
      const elapsedMs = performance.now() - start;

      // Bounded by accounts x months — a tiny fraction of the transactions that produced it.
      expect(monthly.length).toBeLessThanOrEqual(ACCOUNT_COUNT * MONTH_COUNT);
      expect(monthly.length * 10).toBeLessThan(allTransactions.length);
      // Bounded by accounts alone — never by how many future-dated records exist.
      expect(futureRecords.size).toBeLessThanOrEqual(ACCOUNT_COUNT);
      // Generous on purpose — this guards against an accidental per-account or per-month loop
      // reappearing, not against normal variance on a shared CI machine. Four bounded SQL
      // aggregates over 50000 rows finishing in seconds, not this, is the regression it catches.
      expect(elapsedMs).toBeLessThan(5000);

      for (const acc of accountList) {
        // Bounded by `TODAY`, matching what `monthlyMovement`/`firstDateMovement` themselves
        // read — a handful of generated records fall after TODAY within its own month (the day
        // component cycles 1-27), and those are exactly what a future-dated record must not
        // enter a historical aggregate (net-worth, "Future dates do not extend the curve").
        const touching = touchingAccount(allTransactions, acc.id).filter((t) => t.date <= TODAY);

        const monthNet = monthly
          .filter((r) => r.accountId === acc.id)
          .reduce((sum, r) => sum + r.net, 0);
        expect(acc.openingBalance.amount + monthNet).toBe(computeBalance(acc, touching).amount);

        const first = firsts.find((r) => r.accountId === acc.id);
        expect(first).toBeDefined();
        const firstNet = firstMovement.find((r) => r.accountId === acc.id)?.net ?? 0;
        const expectedAtFirst = computeBalance(
          acc,
          touching.filter((t) => t.date <= first!.firstDate),
        );
        expect(acc.openingBalance.amount + firstNet).toBe(expectedAtFirst.amount);
      }
    } finally {
      storage.close();
    }
  }, 20000);

  it('Scenario: No per-account or per-month full-history rescans — one query per reading, regardless of scale', () => {
    // Task 5.4. Account/month *count* does not change how many queries a reading issues — only
    // how many rows the one query it does issue returns — so a small fixture proves the same
    // thing the 50000-record one above does about *shape*, at a fraction of the cost. A repo that
    // regressed into looping `db.all` once per account, or once per (account, month) cell, would
    // fail this test at 5 accounts exactly as it would at 30.
    const storage = openTestDb();
    try {
      seedReferences(storage.db, { categories: ['food'], sources: ['salary'] });
      const accountList: Account[] = Array.from({ length: 5 }, (_, i) =>
        account({ id: `acc-${i}`, name: `рахунок ${i}`, kind: 'spending', currency: 'UAH' }),
      );
      const write = accountsRepo(storage.db);
      for (const a of accountList) write.save(a);
      const tx = transactionsRepo(storage.db);
      for (const month of monthsBackFrom('2026-09-19', 6)) {
        for (const acc of accountList) {
          tx.save(
            expenseByDefault({
              id: `e-${acc.id}-${month}`,
              date: `${month}-10`,
              accountId: acc.id,
              amount: money(1000, 'UAH'),
              categoryId: 'food',
            }),
            storedAt,
          );
        }
      }

      const queries = vi.spyOn(storage.db, 'all');
      const repo = netWorthRepo(storage.db);
      repo.monthlyMovement('2026-09-19');
      repo.firstDates('2026-09-19');
      repo.firstDateMovement('2026-09-19');
      repo.accountsWithFutureRecords('2026-09-19');
      // Exactly one `db.all` per reading — five accounts and six months included, summed and
      // grouped by SQLite itself, never walked one at a time from this side of the connection.
      expect(queries).toHaveBeenCalledTimes(4);
      queries.mockRestore();
    } finally {
      storage.close();
    }
  });
});
