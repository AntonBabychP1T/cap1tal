import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import type { AccumulationGoal } from '../domain/goals';
import { money } from '../domain/money';
import { transfer, type Transaction } from '../domain/transaction';
import { goalScreenModel, type CurrentValue } from './goal-screen';

const reserve = account({
  id: 'jar',
  name: 'Резерв',
  kind: 'savings',
  currency: 'UAH',
  openingBalance: money(15000000, 'UAH'),
});
const cash = account({
  id: 'cash',
  name: 'Готівка',
  kind: 'cash',
  currency: 'UAH',
  openingBalance: money(4000000, 'UAH'),
});
const dollars = account({
  id: 'usd',
  name: 'USD банка',
  kind: 'savings',
  currency: 'USD',
  openingBalance: money(300000, 'USD'),
});
const euros = account({
  id: 'eur',
  name: 'EUR банка',
  kind: 'savings',
  currency: 'EUR',
  openingBalance: money(200000, 'EUR'),
});
const bonds = account({
  id: 'bonds',
  name: 'ОВДП',
  kind: 'investment',
  currency: 'UAH',
  openingBalance: money(15000000, 'UAH'),
});

const ACCOUNTS = [reserve, cash, dollars, euros, bonds];
const USD_RATE = [{ currency: 'USD', rateMillionths: 41_250_000 }];
const NOW = new Date(2026, 7, 28, 12, 0, 0);

const machine: AccumulationGoal = {
  id: 'g-machine',
  name: 'Машина',
  target: money(70000000, 'UAH'),
  deadline: '2027-06-30',
  accountIds: ['jar', 'cash'],
};

const model = (over: Partial<Parameters<typeof goalScreenModel>[0]> = {}) =>
  goalScreenModel({
    goal: machine,
    accounts: ACCOUNTS,
    transactions: [],
    rates: USD_RATE,
    now: NOW,
    ...over,
  });

describe('goalScreenModel', () => {
  it('Scenario: The ціль’s own numbers are shown', () => {
    const shown = model({
      goal: { ...machine, accountIds: ['jar'] },
      transactions: [
        transfer({
          id: 't1',
          date: '2026-08-01',
          fromAccountId: 'cash',
          toAccountId: 'jar',
          left: money(33730000, 'UAH'),
          arrived: money(33730000, 'UAH'),
        }),
      ],
    });

    expect(shown.kind).toBe('goal');
    if (shown.kind !== 'goal') return;
    expect(shown.name).toBe('Машина');
    expect(shown.readout.progress).toBe('487 300,00 UAH');
    expect(shown.readout.target).toBe('700 000,00 UAH');
    expect(shown.readout.percentage).toBe(69);
    expect(shown.readout.leftToAccumulate).toBe('212 700,00 UAH');
    expect(shown.deadline).toBe('2027-06-30');
    expect(shown.overdue).toBe(false);
  });

  it('Scenario: A deleted ціль says so', () => {
    const shown = goalScreenModel({
      goal: undefined,
      accounts: ACCOUNTS,
      transactions: [],
      rates: [],
      now: NOW,
    });

    expect(shown).toEqual({ kind: 'gone', message: 'Цієї цілі більше немає.' });
  });

  it('Scenario: The listed внески account for the progress', () => {
    const shown = model();
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.accounts.map((row) => ({ name: row.name, own: row.own }))).toEqual([
      { name: 'Резерв', own: '150 000,00 UAH' },
      { name: 'Готівка', own: '40 000,00 UAH' },
    ]);
    // The list read together is the progress above it.
    expect(shown.readout.progress).toBe('190 000,00 UAH');
  });

  it('Scenario: An інвестиційний рахунок shows the вартість it contributed', () => {
    const values = new Map<string, CurrentValue>([
      ['bonds', { amount: money(17270000, 'UAH'), asOf: '2026-08-28' }],
    ]);
    const shown = model({ goal: { ...machine, accountIds: ['bonds'] }, currentValues: values });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    // The вартість, not the розрахунковий баланс of 15 000 000 — and the дата it describes.
    expect(shown.accounts[0]).toMatchObject({
      name: 'ОВДП',
      own: '172 700,00 UAH',
      valueAsOf: '2026-08-28',
    });
    expect(shown.readout.progress).toBe('172 700,00 UAH');
  });

  it('An інвестиційний рахунок with no вартість shows its баланс and no дата', () => {
    const shown = model({ goal: { ...machine, accountIds: ['bonds'] } });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.accounts[0]).toMatchObject({ own: '150 000,00 UAH', valueAsOf: null });
  });

  it('Scenario: A negative внесок is shown as it is', () => {
    const overdrawn = account({
      id: 'card',
      name: 'mono',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(-200000, 'UAH'),
    });
    const shown = model({
      goal: { ...machine, accountIds: ['card'] },
      accounts: [...ACCOUNTS, overdrawn],
    });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.accounts[0]?.own).toBe('−2 000,00 UAH');
  });

  it('Scenario: A USD рахунок reads in both currencies', () => {
    const shown = model({ goal: { ...machine, accountIds: ['jar', 'usd'] } });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.accounts[1]).toMatchObject({
      name: 'USD банка',
      own: '3 000,00 USD',
      approximateInGoalCurrency: '≈ 123 750,00 UAH',
      rateUnknown: false,
    });
    expect(shown.readout.approximate).toBe(true);
  });

  it('Scenario: An approximate progress is marked on the screen', () => {
    const shown = model({ goal: { ...machine, accountIds: ['jar', 'usd'] } });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.readout.approximate).toBe(true);
    expect(shown.readout.progress).toBe('273 750,00 UAH');
    expect(shown.readout.percentage).toBe(39);
  });

  it('Scenario: A рахунок in the ціль’s own currency gets no second line', () => {
    const shown = model();
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.accounts.every((row) => row.approximateInGoalCurrency === null)).toBe(true);
  });

  it('Scenario: The missing currency is named and the total withheld', () => {
    const shown = model({ goal: { ...machine, accountIds: ['jar', 'eur'] } });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.readout.progress).toBeNull();
    expect(shown.readout.percentage).toBeNull();
    expect(shown.readout.uncountable).toContain('EUR');
    // Both рахунки are still listed, with what is known of each.
    expect(shown.accounts.map((row) => ({ own: row.own, rateUnknown: row.rateUnknown }))).toEqual([
      { own: '150 000,00 UAH', rateUnknown: false },
      { own: '2 000,00 EUR', rateUnknown: true },
    ]);
  });

  it('Scenario: The readable part is not passed off as the whole', () => {
    const shown = model({ goal: { ...machine, accountIds: ['jar', 'eur'] } });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    // 150 000,00 UAH is the readable внесок, and it must not appear as the ціль's progress.
    expect(shown.readout.progress).not.toBe('150 000,00 UAH');
    expect(shown.readout.progress).toBeNull();
  });

  it('Scenario: An archived рахунок is listed, marked and counted', () => {
    const archived = account({ ...reserve, archived: true });
    const shown = model({
      goal: { ...machine, accountIds: ['jar'] },
      accounts: [archived, cash, dollars, euros, bonds],
    });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.accounts[0]).toMatchObject({ name: 'Резерв', own: '150 000,00 UAH', archived: true });
    // Archiving changes where new транзакції may be recorded, not what a ціль has ever counted.
    expect(shown.readout.progress).toBe('150 000,00 UAH');
  });

  it('A ціль past its дата and below its target is marked overdue', () => {
    const shown = model({ goal: { ...machine, deadline: '2025-12-31' } });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.overdue).toBe(true);
  });

  it('A ціль whose progress cannot be counted is marked neither reached nor overdue', () => {
    const shown = model({
      goal: { ...machine, deadline: '2025-12-31', accountIds: ['jar', 'eur'] },
    });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.overdue).toBe(false);
    expect(shown.readout.reached).toBe(false);
  });

  it('A ціль without a дата shows none', () => {
    const shown = model({
      goal: { id: 'g', name: 'Резерв', target: money(1000000, 'UAH'), accountIds: ['jar'] },
    });
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.deadline).toBeNull();
    expect(shown.overdue).toBe(false);
  });

  it('Nothing outside the склад appears in the list', () => {
    const shown = model();
    if (shown.kind !== 'goal') throw new Error('expected a ціль');

    expect(shown.accounts.map((row) => row.accountId)).toEqual(['jar', 'cash']);
  });

  it('The screen records nothing: the same input twice gives the same model', () => {
    const transactions: Transaction[] = [
      transfer({
        id: 't1',
        date: '2026-08-01',
        fromAccountId: 'cash',
        toAccountId: 'jar',
        left: money(1000000, 'UAH'),
        arrived: money(1000000, 'UAH'),
      }),
    ];

    expect(model({ transactions })).toEqual(model({ transactions }));
  });
});

describe('a ціль витрат has no screen of its own', () => {
  it('Scenario: A ціль витрат leads to the категорія\u2019s month', () => {
    // `goalScreenModel` takes an `AccumulationGoal` and nothing else: there is no shape here a
    // ціль витрат could be handed in, and `reports-screen` routes it to
    // `category/[month]/[categoryId]` instead — asserted there over the row's own `route`.
    const source = readFileSync(new URL('./goal-screen.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('SpendingGoal');
    expect(source).not.toContain('CategoryLimit');
  });

  it('Scenario: No second transaction list exists for a ціль', () => {
    // Nothing under `src/app/goal/` lists транзакції: the категорія's month is where they are read,
    // and a second listing of the same транзакції under a ціль's name is what this change refuses
    // to build.
    const screen = readFileSync(
      new URL('../app/goal/[id].tsx', import.meta.url),
      'utf8',
    );

    expect(screen).not.toContain('transactionLine');
    expect(screen).not.toContain('categoryTransactions');
    expect(screen).toContain('goalScreenModel');
  });
});
