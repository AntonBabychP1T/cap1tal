import { describe, expect, it } from 'vitest';

import { account, type Account, type AccountKind } from '../domain/account';
import { namesById } from '../domain/category';
import type { CategoryLimit } from '../domain/limits';
import { money, type CurrencyCode } from '../domain/money';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Correction,
  type Expense,
  type Transaction,
} from '../domain/transaction';
import type { MonobankRate } from '../monobank/currency';
import { monthViewModel } from './month-screen';

const acc = (id: string, kind: AccountKind, currency: CurrencyCode, archived = false): Account =>
  account({ id, name: id, kind, currency, archived });

const card = acc('card', 'spending', 'UAH');
const usdCard = acc('usd-card', 'spending', 'USD');
const wallet = acc('wallet', 'cash', 'UAH');
/** Archived, and still on a transfer this month — design decision 8. */
const oldJar = acc('old-jar', 'savings', 'UAH', true);
const accounts = [card, usdCard, wallet, oldJar];

const USD_RATE: MonobankRate = { currency: 'USD', rateMillionths: 41_250_000 };

/** A fixed instant in August 2026 — the clock is data these tests control. */
const august = new Date(2026, 7, 24, 12, 0, 0);

let n = 0;
const nextId = () => `t${(n += 1)}`;

const expense = (
  amount: number,
  currency: CurrencyCode,
  categoryId = UNCATEGORISED_CATEGORY_ID,
  date = '2026-08-10',
  accountId = currency === 'USD' ? 'usd-card' : 'card',
): Expense => ({
  type: 'expense',
  id: nextId(),
  date,
  accountId,
  amount: money(amount, currency),
  categoryId,
});

const correction = (amount: number, date = '2026-08-12'): Correction => ({
  type: 'correction',
  id: nextId(),
  date,
  accountId: 'card',
  amount: money(amount, 'UAH'),
});

/** The categories list a screen loads: the seeded reserved rows, plus the ones these tests name. */
const categoryNames = namesById([
  { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії' },
  { id: FEES_CATEGORY_ID, name: 'Комісія' },
  { id: CORRECTION_CATEGORY_ID, name: 'Коригування' },
  { id: 'groceries', name: 'Groceries' },
]);

const view = (
  transactions: Transaction[],
  rates: MonobankRate[] = [],
  month = '2026-08',
  limits: CategoryLimit[] = [],
) => monthViewModel({ month, accounts, transactions, rates, categoryNames, limits, now: august });

const groupOf = (model: ReturnType<typeof view>, currency: CurrencyCode) => {
  const group = model.groups.find((g) => g.currency === currency);
  if (!group) {
    throw new Error(`no ${currency} group in the view model`);
  }
  return group;
};

const amountFor = (model: ReturnType<typeof view>, currency: CurrencyCode, key: string) =>
  groupOf(model, currency).numbers.find((row) => row.key === key)?.amount;

describe('monthViewModel', () => {
  it('Scenario: Two currencies form two separate groups', () => {
    const model = view([expense(100000, 'UAH'), expense(10000, 'USD')]);

    expect(model.groups.map((g) => g.currency)).toEqual(['UAH', 'USD']);
    expect(amountFor(model, 'UAH', 'spent')).toBe('1000,00 UAH');
    expect(amountFor(model, 'USD', 'spent')).toBe('100,00 USD');
    // No primary number anywhere combines the two.
    for (const group of model.groups) {
      for (const row of group.numbers) {
        expect(row.amount.endsWith(group.currency)).toBe(true);
      }
    }
  });

  it('The month is named in Ukrainian and knows whether it can step forward', () => {
    expect(view([]).title).toBe('Серпень 2026');
    expect(view([]).canStepForward).toBe(false);
    expect(view([], [], '2026-07').title).toBe('Липень 2026');
    expect(view([], [], '2026-07').canStepForward).toBe(true);
  });

  it('Scenario: An empty month says it is empty', () => {
    const model = view([]);

    expect(model.groups).toEqual([]);
    expect(model.emptyMessage).toBe('У цьому місяці ще нічого не записано.');
  });

  it('A month of transfers alone gets its own sentence, not the wrong one', () => {
    // card → wallet moves no monthly number: neither is savings, investment or debt.
    const model = view([
      transfer({
        id: 't-cash',
        date: '2026-08-05',
        fromAccountId: 'card',
        toAccountId: 'wallet',
        left: money(50000, 'UAH'),
        arrived: money(50000, 'UAH'),
      }),
    ]);

    expect(model.groups).toEqual([]);
    expect(model.emptyMessage).toBe('У цьому місяці гроші лише переходили між рахунками.');
  });

  it('A month with numbers has no empty message at all', () => {
    expect(view([expense(100000, 'UAH')]).emptyMessage).toBeNull();
  });

  it('Scenario: The breakdown lists the categories of the month', () => {
    const model = view([
      expense(100000, 'UAH', UNCATEGORISED_CATEGORY_ID),
      expense(500, 'UAH', FEES_CATEGORY_ID),
      correction(-3000),
    ]);

    expect(groupOf(model, 'UAH').breakdown).toEqual([
      {
        categoryId: UNCATEGORISED_CATEGORY_ID,
        label: 'Без категорії',
        currency: 'UAH',
        amount: '1000,00 UAH',
        overLimit: false,
        share: 1,
      },
      {
        categoryId: CORRECTION_CATEGORY_ID,
        label: 'Коригування',
        currency: 'UAH',
        amount: '30,00 UAH',
        overLimit: false,
        share: 0.03,
      },
      {
        categoryId: FEES_CATEGORY_ID,
        label: 'Комісія',
        currency: 'UAH',
        amount: '5,00 UAH',
        overLimit: false,
        share: 0.005,
      },
    ]);
  });

  it('The breakdown sums to the spent it sits under', () => {
    const model = view([
      expense(100000, 'UAH', UNCATEGORISED_CATEGORY_ID),
      expense(500, 'UAH', FEES_CATEGORY_ID),
      correction(-3000),
    ]);

    expect(amountFor(model, 'UAH', 'spent')).toBe('1035,00 UAH');
  });

  it('A refunded category sorts as the small number it is, not as the biggest', () => {
    const model = view([
      expense(100000, 'UAH', 'food'),
      expense(1000, 'UAH', FEES_CATEGORY_ID),
      { ...expense(200000, 'UAH', 'clothes'), type: 'refund' } as Transaction,
    ]);

    // clothes is −2000,00: it must come last, not first. `formatMoney` writes a typographic minus,
    // so an ordering that read the formatted string would put it at the top.
    expect(groupOf(model, 'UAH').breakdown.map((r) => r.amount)).toEqual([
      '1000,00 UAH',
      '10,00 UAH',
      '−2000,00 UAH',
    ]);
  });

  it('A transfer touching an archived рахунок is still classified by its вид', () => {
    const model = view([
      transfer({
        id: 't-old',
        date: '2026-08-06',
        fromAccountId: 'card',
        toAccountId: 'old-jar',
        left: money(200000, 'UAH'),
        arrived: money(200000, 'UAH'),
      }),
    ]);

    // The account is archived; the transfer is still відкладено, because the вид decides.
    expect(amountFor(model, 'UAH', 'saved')).toBe('2000,00 UAH');
    expect(groupOf(model, 'UAH').breakdown).toEqual([]);
  });

  it('Scenario: A known rate yields a marked approximation', () => {
    const model = view([expense(100000, 'UAH'), expense(10000, 'USD')], [USD_RATE]);

    expect(model.approximate).not.toBeNull();
    const spent = model.approximate?.find((row) => row.key === 'spent');
    // 100000 UAH + 10000 USD × 41.25 = 512500 kopiykas.
    expect(spent?.amount).toBe('≈ 5125,00 грн');
    expect(spent?.label).toBe('Витрачено');
    for (const row of model.approximate ?? []) {
      expect(row.amount.startsWith('≈ ')).toBe(true);
      expect(row.amount.endsWith(' грн')).toBe(true);
    }
    expect(model.approximate?.map((row) => row.key)).toEqual([
      'spent',
      'invested',
      'saved',
      'lent',
      'income',
      'left',
    ]);
  });

  it('Scenario: An unknown rate hides the approximation, not the numbers', () => {
    const model = view([expense(100000, 'UAH'), expense(10000, 'USD')], []);

    expect(model.approximate).toBeNull();
    expect(amountFor(model, 'UAH', 'spent')).toBe('1000,00 UAH');
    expect(amountFor(model, 'USD', 'spent')).toBe('100,00 USD');
    expect(groupOf(model, 'USD').breakdown).toHaveLength(1);
  });

  it('Scenario: A UAH-only month has nothing to approximate', () => {
    const model = view([expense(100000, 'UAH')], [USD_RATE]);

    expect(model.approximate).toBeNull();
    expect(amountFor(model, 'UAH', 'spent')).toBe('1000,00 UAH');
  });

  it('Only the shown month reaches the screen', () => {
    const transactions = [
      expense(100000, 'UAH', UNCATEGORISED_CATEGORY_ID, '2026-07-31'),
      expense(200000, 'UAH', UNCATEGORISED_CATEGORY_ID, '2026-08-01'),
      expense(300000, 'UAH', UNCATEGORISED_CATEGORY_ID, '2026-09-01'),
    ];

    expect(amountFor(view(transactions), 'UAH', 'spent')).toBe('2000,00 UAH');
    expect(amountFor(view(transactions, [], '2026-07'), 'UAH', 'spent')).toBe('1000,00 UAH');
  });

  it('All six numbers are shown, each under its glossary name', () => {
    const model = view([expense(100000, 'UAH')]);

    expect(groupOf(model, 'UAH').numbers.map((row) => row.label)).toEqual([
      'Витрачено',
      'Інвестовано',
      'Відкладено',
      'Позичено',
      'Дохід',
      'Залишилось',
    ]);
  });
});

describe('the breakdown reads the editable category list', () => {
  it('Scenario: A renamed category shows its new name', () => {
    const spent = [expense(80000, 'UAH', 'groceries')];
    const renamed = namesById([{ id: 'groceries', name: 'Продукти' }]);

    const before = view(spent).groups[0]!.breakdown;
    const after = monthViewModel({
      month: '2026-08',
      accounts,
      transactions: spent,
      rates: [],
      categoryNames: renamed,
      limits: [],
      now: august,
    }).groups[0]!.breakdown;

    expect(before.map((row) => row.label)).toEqual(['Groceries']);
    // The same stored id, the same amount — only the name the owner gave the row moved.
    expect(after.map((row) => row.label)).toEqual(['Продукти']);
    expect(after.map((row) => row.categoryId)).toEqual(['groceries']);
  });

  it('Scenario: An archived category still shows its months', () => {
    // Archiving takes a category out of pickers, never out of the months it already has: the
    // breakdown is computed from the transactions, and the name map holds every row, archived
    // ones included.
    const model = view([expense(80000, 'UAH', 'groceries')]);

    expect(model.groups[0]!.breakdown).toEqual([
      {
        categoryId: 'groceries',
        label: 'Groceries',
        currency: 'UAH',
        amount: '800,00 UAH',
        overLimit: false,
        share: 1,
      },
    ]);
  });

  it('A category id with no row in the loaded list shows itself rather than disappearing', () => {
    const model = view([expense(80000, 'UAH', 'not-loaded-yet')]);

    expect(model.groups[0]!.breakdown.map((row) => row.label)).toEqual(['not-loaded-yet']);
  });
});

/**
 * FR-L2's «у місячній картині»: the breakdown marks a category over its ліміт for the shown month.
 * The determination itself is `domain/limits.ts`; what is proven here is that the right row wears
 * it — the one in the ліміт's own currency, in the month that was actually judged.
 */
describe('the breakdown marks a category over its ліміт', () => {
  const groceriesLimit: CategoryLimit = {
    categoryId: 'groceries',
    amount: money(250000, 'UAH'),
  };

  const rowFor = (model: ReturnType<typeof view>, currency: CurrencyCode, categoryId: string) =>
    groupOf(model, currency).breakdown.find((row) => row.categoryId === categoryId);

  it('Scenario: An over-limit row is red', () => {
    const model = view([expense(260000, 'UAH', 'groceries')], [], '2026-08', [groceriesLimit]);

    expect(rowFor(model, 'UAH', 'groceries')?.overLimit).toBe(true);
  });

  it('Scenario: Spending at the ліміт is not marked', () => {
    const model = view([expense(250000, 'UAH', 'groceries')], [], '2026-08', [groceriesLimit]);

    expect(rowFor(model, 'UAH', 'groceries')?.overLimit).toBe(false);
  });

  it('Scenario: Another currency’s amount stays unmarked', () => {
    const model = view(
      [expense(260000, 'UAH', 'groceries'), expense(10000, 'USD', 'groceries')],
      [],
      '2026-08',
      [groceriesLimit],
    );

    expect(rowFor(model, 'UAH', 'groceries')?.overLimit).toBe(true);
    expect(rowFor(model, 'USD', 'groceries')?.overLimit).toBe(false);
  });

  it('Scenario: The mark follows the shown month', () => {
    const spent = [
      expense(260000, 'UAH', 'groceries', '2026-08-10'),
      expense(100000, 'UAH', 'groceries', '2026-07-10'),
    ];

    expect(rowFor(view(spent, [], '2026-08', [groceriesLimit]), 'UAH', 'groceries')?.overLimit).toBe(
      true,
    );
    expect(rowFor(view(spent, [], '2026-07', [groceriesLimit]), 'UAH', 'groceries')?.overLimit).toBe(
      false,
    );
  });

  it('A category with no ліміт is never marked', () => {
    const model = view([expense(99_000_000, 'UAH', 'groceries')], [], '2026-08', []);

    expect(rowFor(model, 'UAH', 'groceries')?.overLimit).toBe(false);
  });
});


/**
 * The bar beside each категорія. It is a display decision, like the order the rows come in, so it
 * is proven here rather than left to JSX.
 */
describe('the breakdown sizes its bars against the month’s largest категорія', () => {
  it('The largest fills its track and the rest read against it', () => {
    const model = view([
      expense(100000, 'UAH', 'groceries'),
      expense(25000, 'UAH', 'transport'),
      expense(50000, 'UAH', UNCATEGORISED_CATEGORY_ID),
    ]);

    expect(groupOf(model, 'UAH').breakdown.map((row) => [row.label, row.share])).toEqual([
      ['Groceries', 1],
      ['Без категорії', 0.5],
      ['transport', 0.25],
    ]);
  });

  it('Each currency is measured against its own largest, never across currencies', () => {
    const model = view([expense(100000, 'UAH', 'groceries'), expense(1000, 'USD', 'groceries')]);

    expect(groupOf(model, 'UAH').breakdown[0]?.share).toBe(1);
    expect(groupOf(model, 'USD').breakdown[0]?.share).toBe(1);
  });

  it('A категорія a повернення pushed below zero gets no bar', () => {
    const model = view([
      expense(100000, 'UAH', 'groceries'),
      { ...expense(0, 'UAH', 'transport'), amount: money(-20000, 'UAH') },
    ]);

    expect(
      groupOf(model, 'UAH').breakdown.find((row) => row.categoryId === 'transport')?.share,
    ).toBe(0);
  });
});
