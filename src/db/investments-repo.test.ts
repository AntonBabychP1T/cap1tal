import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { account, computeBalance } from '../domain/account';
import { contribution, sumContributions } from '../domain/goals';
import { money } from '../domain/money';
import { monthlyPicture } from '../domain/monthly-picture';
import { transfer } from '../domain/transaction';
import { goalScreenModel } from '../ui/goal-screen';
import { accountsRepo } from './accounts-repo';
import { goalsRepo } from './goals-repo';
import { investmentsRepo, type InvestmentsRepo } from './investments-repo';
import { openFileDb, openTestDb, type TestStorage } from './test-db';
import { transactionsRepo } from './transactions-repo';

const bonds = account({ id: 'bonds', name: 'ОВДП', kind: 'investment', currency: 'UAH' });
const brokerage = account({ id: 'ibkr', name: 'IBKR', kind: 'investment', currency: 'USD' });
const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'Подушка', kind: 'savings', currency: 'UAH' });

describe('investmentsRepo', () => {
  let storage: TestStorage;
  let repo: InvestmentsRepo;

  beforeEach(() => {
    storage = openTestDb();
    const savedAccounts = accountsRepo(storage.db);
    for (const a of [bonds, brokerage, card, jar]) {
      savedAccounts.save(a);
    }
    repo = investmentsRepo(storage.db);
  });

  afterEach(() => {
    storage.close();
  });

  it('A рахунок that was never given a вартість reads back as nothing, not an error', () => {
    expect(repo.get('bonds')).toBeUndefined();
    expect(repo.all()).toEqual(new Map());
  });

  it('Scenario: Storing again replaces, never accumulates', () => {
    repo.set('bonds', { amount: money(560000, 'UAH'), asOf: '2026-08-28' });
    expect(repo.get('bonds')).toEqual({ amount: money(560000, 'UAH'), asOf: '2026-08-28' });

    repo.set('bonds', { amount: money(575000, 'UAH'), asOf: '2026-09-30' });
    expect(repo.get('bonds')).toEqual({ amount: money(575000, 'UAH'), asOf: '2026-09-30' });
    expect(repo.all().size).toBe(1);
  });

  it('Scenario: Clearing leaves nothing behind', () => {
    repo.set('bonds', { amount: money(560000, 'UAH'), asOf: '2026-08-28' });
    repo.clear('bonds');

    expect(repo.get('bonds')).toBeUndefined();
    expect(repo.all()).toEqual(new Map());
    // Clearing what is not there is not an error either — the рахунок simply has none.
    expect(() => repo.clear('bonds')).not.toThrow();
  });

  it('Scenario: An unknown рахунок is rejected', () => {
    expect(() =>
      repo.set('nowhere', { amount: money(560000, 'UAH'), asOf: '2026-08-28' }),
    ).toThrow(/не існує/);
    expect(repo.all()).toEqual(new Map());
  });

  it('Scenario: A рахунок of another вид is rejected', () => {
    expect(() => repo.set('jar', { amount: money(560000, 'UAH'), asOf: '2026-08-28' })).toThrow(
      /інвестиційного/,
    );
    expect(() => repo.set('card', { amount: money(560000, 'UAH'), asOf: '2026-08-28' })).toThrow(
      /інвестиційного/,
    );
    expect(repo.get('jar')).toBeUndefined();
    expect(repo.all()).toEqual(new Map());
  });

  it("Scenario: A currency other than the рахунок's is rejected", () => {
    expect(() => repo.set('bonds', { amount: money(10000, 'USD'), asOf: '2026-08-28' })).toThrow(
      /UAH/,
    );
    expect(repo.get('bonds')).toBeUndefined();

    // And the same сума is welcome on the рахунок that is actually in USD.
    repo.set('ibkr', { amount: money(10000, 'USD'), asOf: '2026-08-28' });
    expect(repo.get('ibkr')).toEqual({ amount: money(10000, 'USD'), asOf: '2026-08-28' });
  });

  it('Scenario: A negative сума is rejected', () => {
    expect(() => repo.set('bonds', { amount: money(-100, 'UAH'), asOf: '2026-08-28' })).toThrow(
      /менш/,
    );
    expect(repo.get('bonds')).toBeUndefined();

    // Zero is not: an інвестиція may be worth nothing, never less than nothing.
    repo.set('bonds', { amount: money(0, 'UAH'), asOf: '2026-08-28' });
    expect(repo.get('bonds')).toEqual({ amount: money(0, 'UAH'), asOf: '2026-08-28' });
  });

  it('A дата that is not a calendar date never reaches storage', () => {
    expect(() => repo.set('bonds', { amount: money(560000, 'UAH'), asOf: '2026-02-30' })).toThrow();
    expect(repo.get('bonds')).toBeUndefined();
  });

  it('An archived рахунок keeps its вартість', () => {
    repo.set('bonds', { amount: money(560000, 'UAH'), asOf: '2026-08-28' });
    accountsRepo(storage.db).save({ ...bonds, archived: true });

    expect(repo.get('bonds')).toEqual({ amount: money(560000, 'UAH'), asOf: '2026-08-28' });
  });

  it('Every вартість comes back by рахунок id', () => {
    repo.set('bonds', { amount: money(560000, 'UAH'), asOf: '2026-08-28' });
    repo.set('ibkr', { amount: money(398000, 'USD'), asOf: '2026-09-01' });

    expect(repo.all()).toEqual(
      new Map([
        ['bonds', { amount: money(560000, 'UAH'), asOf: '2026-08-28' }],
        ['ibkr', { amount: money(398000, 'USD'), asOf: '2026-09-01' }],
      ]),
    );
  });
});

describe('investmentsRepo across a restart', () => {
  it('Scenario: Reopening storage returns the вартість unchanged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cap1tal-investments-'));
    const file = join(dir, 'cap1tal.db');
    try {
      const first = openFileDb(file);
      accountsRepo(first.db).save(bonds);
      investmentsRepo(first.db).set('bonds', { amount: money(560000, 'UAH'), asOf: '2026-08-28' });
      first.close();

      const second = openFileDb(file);
      try {
        expect(investmentsRepo(second.db).get('bonds')).toEqual({
          amount: money(560000, 'UAH'),
          asOf: '2026-08-28',
        });
      } finally {
        second.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Scenario: Clearing leaves nothing behind after a restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cap1tal-investments-'));
    const file = join(dir, 'cap1tal.db');
    try {
      const first = openFileDb(file);
      accountsRepo(first.db).save(bonds);
      investmentsRepo(first.db).set('bonds', { amount: money(560000, 'UAH'), asOf: '2026-08-28' });
      investmentsRepo(first.db).clear('bonds');
      first.close();

      const second = openFileDb(file);
      try {
        expect(investmentsRepo(second.db).get('bonds')).toBeUndefined();
      } finally {
        second.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * The rule the whole capability rests on, proved against real storage: a поточна вартість is an
 * observation of the outside world, so recording, replacing and clearing one moves no money and no
 * monthly number — and moves exactly one number that is not monthly, the внесок an інвестиційний
 * рахунок brings to a ціль-накопичення.
 */
describe('a поточна вартість moves no money and no monthly number', () => {
  let storage: TestStorage;
  let repo: InvestmentsRepo;

  /** 500000 minor units UAH onto the інвестиційний рахунок, in March and by переказ. */
  const invested = transfer({
    id: 't1',
    date: '2026-03-10',
    fromAccountId: 'card',
    toAccountId: 'bonds',
    left: money(500_000, 'UAH'),
    arrived: money(500_000, 'UAH'),
  });

  const monthOf = () =>
    monthlyPicture({
      month: '2026-03',
      accounts: accountsRepo(storage.db).list(),
      transactions: transactionsRepo(storage.db).listAll(),
    }).get('UAH');

  const balanceOf = () => {
    const stored = accountsRepo(storage.db).list().find((a) => a.id === 'bonds')!;
    return computeBalance(stored, transactionsRepo(storage.db).listByAccount('bonds'));
  };

  beforeEach(() => {
    storage = openTestDb();
    const savedAccounts = accountsRepo(storage.db);
    for (const a of [bonds, card]) savedAccounts.save(a);
    transactionsRepo(storage.db).save(invested, new Date('2026-03-10T10:00:00.000Z'));
    repo = investmentsRepo(storage.db);
  });

  afterEach(() => storage.close());

  it('Scenario: A вартість is recorded with the дата it was entered', () => {
    repo.set('bonds', { amount: money(560_000, 'UAH'), asOf: '2026-08-28' });

    expect(repo.get('bonds')).toEqual({ amount: money(560_000, 'UAH'), asOf: '2026-08-28' });
  });

  it('Scenario: Entering another вартість replaces the сума and the дата', () => {
    repo.set('bonds', { amount: money(560_000, 'UAH'), asOf: '2026-08-28' });
    repo.set('bonds', { amount: money(575_000, 'UAH'), asOf: '2026-09-30' });

    expect(repo.all()).toEqual(
      new Map([['bonds', { amount: money(575_000, 'UAH'), asOf: '2026-09-30' }]]),
    );
  });

  it('Scenario: A вартість can be cleared', () => {
    repo.set('bonds', { amount: money(560_000, 'UAH'), asOf: '2026-08-28' });
    repo.clear('bonds');

    expect(repo.get('bonds')).toBeUndefined();
  });

  it('Scenario: A вартість in another currency is rejected', () => {
    repo.set('bonds', { amount: money(560_000, 'UAH'), asOf: '2026-08-28' });

    expect(() => repo.set('bonds', { amount: money(10_000, 'USD'), asOf: '2026-09-30' })).toThrow();
    expect(repo.get('bonds')).toEqual({ amount: money(560_000, 'UAH'), asOf: '2026-08-28' });
  });

  it('Scenario: A вартість on a рахунок of another вид is rejected', () => {
    accountsRepo(storage.db).save(jar);

    expect(() => repo.set('jar', { amount: money(560_000, 'UAH'), asOf: '2026-08-28' })).toThrow();
    expect(repo.get('jar')).toBeUndefined();
  });

  it('Scenario: A вартість above вкладено leaves the баланс where it was', () => {
    expect(balanceOf()).toEqual(money(500_000, 'UAH'));
    const before = transactionsRepo(storage.db).listAll();

    repo.set('bonds', { amount: money(560_000, 'UAH'), asOf: '2026-08-28' });

    expect(balanceOf()).toEqual(money(500_000, 'UAH'));
    // No транзакція was created, changed or removed by it.
    expect(transactionsRepo(storage.db).listAll()).toEqual(before);
  });

  it('Scenario: The month of the інвестиція counts only the переказ', () => {
    const before = monthOf();
    expect(before?.invested).toEqual(money(500_000, 'UAH'));

    repo.set('bonds', { amount: money(560_000, 'UAH'), asOf: '2026-03-20' });

    const after = monthOf();
    expect(after?.invested).toEqual(money(500_000, 'UAH'));
    expect(after?.income).toEqual(before?.income);
    expect(after?.left).toEqual(before?.left);
    // Every one of the six, so no monthly number can move by a market's opinion.
    expect(after).toEqual(before);
  });

  it('Scenario: Clearing a вартість changes nothing else', () => {
    repo.set('bonds', { amount: money(560_000, 'UAH'), asOf: '2026-08-28' });
    const balance = balanceOf();
    const transactions = transactionsRepo(storage.db).listAll();
    const month = monthOf();

    repo.clear('bonds');

    expect(balanceOf()).toEqual(balance);
    expect(transactionsRepo(storage.db).listAll()).toEqual(transactions);
    expect(monthOf()).toEqual(month);
  });

  it('Scenario: A вартість moves the прогрес of a ціль that holds the рахунок', () => {
    goalsRepo(storage.db).save({
      id: 'g-flat',
      name: 'Квартира',
      target: money(2_000_000, 'UAH'),
      accountIds: ['bonds'],
    });
    const accounts = accountsRepo(storage.db).list();
    const transactions = transactionsRepo(storage.db).listAll();
    const goal = goalsRepo(storage.db).get('g-flat')!;
    const progress = () =>
      sumContributions(
        goal.target.currency,
        goal.accountIds.map((id) =>
          contribution(
            accounts.find((a) => a.id === id)!,
            transactions,
            repo.amounts().get(id),
          ),
        ),
      );

    expect(progress()).toEqual(money(500_000, 'UAH'));

    repo.set('bonds', { amount: money(560_000, 'UAH'), asOf: '2026-08-28' });
    expect(progress()).toEqual(money(560_000, 'UAH'));

    // ...and the ціль's own screen says the same, from the same repo call the screen makes.
    const model = goalScreenModel({
      goal,
      accounts,
      transactions,
      rates: [],
      currentValues: repo.all(),
      now: new Date('2026-08-28T10:00:00.000Z'),
    });
    expect(model.kind).toBe('goal');
    if (model.kind === 'goal') {
      expect(model.readout.progress).toContain('5\u00A0600,00 UAH');
      expect(model.accounts[0]?.valueAsOf).toBe('2026-08-28');
    }

    // Clearing puts the розрахунковий баланс back as the внесок; nothing else moved either way.
    repo.clear('bonds');
    expect(progress()).toEqual(money(500_000, 'UAH'));
    expect(monthOf()?.invested).toEqual(money(500_000, 'UAH'));
  });
});
