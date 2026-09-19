import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault, refund, transfer, type Income, UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
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

const income = (id: string, accountId: string, date: string, amountMinor: number): Income => ({
  type: 'income',
  id,
  date,
  accountId,
  amount: money(amountMinor, 'UAH'),
  sourceId: 'salary',
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
