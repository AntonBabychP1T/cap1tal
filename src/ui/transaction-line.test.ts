import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { namesById } from '../domain/category';
import type { CategoryLimit } from '../domain/limits';
import { money } from '../domain/money';
import {
  expenseByDefault,
  refund,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Income,
  type Transaction,
} from '../domain/transaction';
import {
  accountsById,
  feedSubtitle,
  feedTitle,
  overLimitByMonth,
  transactionLine,
} from './transaction-line';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const usd = account({ id: 'usd', name: 'долари', kind: 'savings', currency: 'USD' });
const byId = accountsById([card, jar, usd]);
/** The categories list as the feed loads it — the seeded reserved rows plus one of the owner's. */
const names = namesById([
  { id: UNCATEGORISED_CATEGORY_ID, name: 'Без категорії' },
  { id: 'groceries', name: 'Groceries' },
]);

describe('transactionLine', () => {
  it('An expense shows its amount with currency, its account and its date', () => {
    const line = transactionLine(
      expenseByDefault({
        id: 'e1',
        date: '2026-08-24',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
      }),
      byId,
      names,
    );
    expect(line).toEqual({
      id: 'e1',
      type: 'витрата',
      amount: '125,50 UAH',
      accounts: 'mono black',
      date: '2026-08-24',
      category: 'Без категорії',
      uncategorised: true,
      overLimit: false,
    });
  });

  it('A переказ shows both accounts', () => {
    const line = transactionLine(
      transfer({
        id: 't1',
        date: '2026-08-24',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(100000, 'UAH'),
        arrived: money(100000, 'UAH'),
      }),
      byId,
      names,
    );
    expect(line).toMatchObject({
      type: 'переказ',
      amount: '1000,00 UAH',
      accounts: 'mono black → банка',
    });
    expect(line.category).toBeUndefined();
  });

  it('A cross-currency переказ shows both amounts in their own currencies', () => {
    const line = transactionLine(
      transfer({
        id: 't2',
        date: '2026-08-24',
        fromAccountId: 'card',
        toAccountId: 'usd',
        left: money(410000, 'UAH'),
        arrived: money(10000, 'USD'),
      }),
      byId,
      names,
    );
    expect(line.amount).toBe('4100,00 UAH → 100,00 USD');
    expect(line.accounts).toBe('mono black → долари');
  });

  it('Income and correction show their own words', () => {
    const income: Income = {
      type: 'income',
      id: 'i1',
      date: '2026-08-01',
      accountId: 'card',
      amount: money(5000000, 'UAH'),
      sourceId: 'salary',
    };
    expect(transactionLine(income, byId, names)).toMatchObject({
      type: 'дохід',
      amount: '50000,00 UAH',
    });
    expect(
      transactionLine(
        { type: 'correction', id: 'c1', date: '2026-08-31', accountId: 'card', amount: money(-3000, 'UAH') },
        byId,
        names,
      ),
    ).toMatchObject({ type: 'коригування', amount: '−30,00 UAH' });
  });

  it('An unknown account shows its id rather than an empty gap', () => {
    const line = transactionLine(
      expenseByDefault({
        id: 'e2',
        date: '2026-08-24',
        accountId: 'gone',
        amount: money(100, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
      }),
      byId,
      names,
    );
    expect(line.accounts).toBe('gone');
  });
});

describe('«Без категорії» is highlighted and categorised in one tap — the marking half', () => {
  const at = (id: string, categoryId: string) =>
    transactionLine(
      expenseByDefault({
        id,
        date: '2026-08-24',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId,
      }),
      byId,
      names,
    );

  it('Scenario: An uncategorised expense is marked in the feed', () => {
    expect(at('e1', UNCATEGORISED_CATEGORY_ID).uncategorised).toBe(true);
    expect(at('e2', 'groceries').uncategorised).toBe(false);
  });

  it('Scenario: One tap categorises from the feed — the mark goes with the category', () => {
    // What the feed stores after the pick is the same transaction with another category id; the
    // line built from it no longer carries the mark, which is how the mark disappears.
    expect(at('e1', UNCATEGORISED_CATEGORY_ID).uncategorised).toBe(true);
    expect(at('e1', 'groceries')).toMatchObject({ category: 'Groceries', uncategorised: false });
  });

  it('A type that carries no category is never marked', () => {
    const line = transactionLine(
      transfer({
        id: 't1',
        date: '2026-08-24',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(100000, 'UAH'),
        arrived: money(100000, 'UAH'),
      }),
      byId,
      names,
    );
    expect(line.uncategorised).toBe(false);
    expect(line.category).toBeUndefined();
  });

  it('A повернення in «Без категорії» is marked like a витрата', () => {
    const line = transactionLine(
      refund({
        id: 'r1',
        date: '2026-08-24',
        accountId: 'card',
        amount: money(80000, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
      }),
      byId,
      names,
    );
    expect(line).toMatchObject({ type: 'повернення', uncategorised: true });
  });
});

/**
 * The опис a monobank import brings: informational, secondary, and never mistaken for a category,
 * a джерело or an account.
 */
describe('transactionLine — the imported опис', () => {
  const sourceNames = namesById([
    { id: UNSOURCED_SOURCE_ID, name: 'Без джерела' },
    { id: 'salary', name: 'Salary' },
  ]);

  it('Scenario: An uncategorised merchant can be identified in the feed', () => {
    const line = transactionLine(
      expenseByDefault({
        id: 'e1',
        date: '2026-08-27',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId: UNCATEGORISED_CATEGORY_ID,
        description: 'СІЛЬПО Київ',
      }),
      byId,
      names,
      sourceNames,
    );

    // The merchant is readable in the feed…
    expect(line.description).toBe('СІЛЬПО Київ');
    // …while the category is still «Без категорії», and still marked as such.
    expect(line.category).toBe('Без категорії');
    expect(line.uncategorised).toBe(true);
    // The опис replaced nothing: amount, account and date are what they were.
    expect(line.amount).toBe('125,50 UAH');
    expect(line.accounts).toBe('mono black');
    expect(line.date).toBe('2026-08-27');
  });

  it('Scenario: An arriving item keeps its source distinct from its description', () => {
    const arrival: Income = {
      type: 'income',
      id: 'i1',
      date: '2026-08-27',
      accountId: 'card',
      amount: money(30000, 'UAH'),
      sourceId: UNSOURCED_SOURCE_ID,
      description: 'Повернення за замовлення',
    };

    const line = transactionLine(arrival, byId, names, sourceNames);

    // Both are shown, and they are two different fields — the опис is not a джерело.
    expect(line.source).toBe('Без джерела');
    expect(line.description).toBe('Повернення за замовлення');
    expect(line.type).toBe('дохід');
    expect(line.category).toBeUndefined();
  });

  it('Scenario: A manual transaction stays compact', () => {
    const line = transactionLine(
      expenseByDefault({
        id: 'e2',
        date: '2026-08-27',
        accountId: 'card',
        amount: money(5000, 'UAH'),
        categoryId: 'groceries',
      }),
      byId,
      names,
      sourceNames,
    );

    // No empty description row and no placeholder: the property is simply absent.
    expect(line).not.toHaveProperty('description');
    expect(Object.keys(line)).not.toContain('description');
  });

  it('An опис survives on every type that can carry one', () => {
    const moved = transfer({
      id: 't1',
      date: '2026-08-27',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(100000, 'UAH'),
      arrived: money(100000, 'UAH'),
      description: 'На банку',
    });
    const returned = refund({
      id: 'r1',
      date: '2026-08-27',
      accountId: 'card',
      amount: money(45000, 'UAH'),
      categoryId: 'groceries',
      description: 'Rozetka',
    });

    expect(transactionLine(moved, byId, names, sourceNames).description).toBe('На банку');
    expect(transactionLine(returned, byId, names, sourceNames).description).toBe('Rozetka');
    // The переказ still names both accounts, so the опис took nothing's place.
    expect(transactionLine(moved, byId, names, sourceNames).accounts).toBe('mono black → банка');
  });

  it('A джерело the loaded list misses shows its id rather than disappearing', () => {
    const arrival: Income = {
      type: 'income',
      id: 'i2',
      date: '2026-08-27',
      accountId: 'card',
      amount: money(30000, 'UAH'),
      sourceId: 'gone',
    };

    expect(transactionLine(arrival, byId, names, new Map()).source).toBe('gone');
  });
});

/**
 * FR-L2's «у списку транзакцій»: a feed line whose category is over its ліміт for the month of
 * that транзакція's date shows the category red. The determination is `domain/limits.ts`'s; what
 * these prove is that each line is judged by its own month, and that the mark joins the «Без
 * категорії» highlight rather than replacing it.
 */
describe('the feed marks a category over its ліміт', () => {
  const groceriesLimit: CategoryLimit = { categoryId: 'groceries', amount: money(250000, 'UAH') };

  const spend = (id: string, date: string, amount: number, currency = 'UAH', categoryId = 'groceries') =>
    expenseByDefault({ id, date, accountId: currency === 'USD' ? 'usd' : 'card', amount: money(amount, currency), categoryId });

  /** The whole months behind a feed — what `transactionsRepo.listMonth` would return. */
  const marks = (months: Record<string, Transaction[]>, feed: Transaction[]) =>
    overLimitByMonth({
      feed,
      limits: [groceriesLimit],
      monthTransactions: (month) => months[month] ?? [],
    });

  it('Scenario: A витрата in an over-limit category is marked', () => {
    const august = [spend('e1', '2026-08-10', 260000)];
    const line = transactionLine(august[0]!, byId, names, new Map(), marks({ '2026-08': august }, august));

    expect(line.category).toBe('Groceries');
    expect(line.overLimit).toBe(true);
  });

  it('Scenario: A line in an under-limit month is not marked', () => {
    const august = [spend('e1', '2026-08-10', 260000)];
    const july = [spend('e2', '2026-07-10', 100000)];
    const feed = [...august, ...july];
    const over = marks({ '2026-08': august, '2026-07': july }, feed);

    expect(transactionLine(august[0]!, byId, names, new Map(), over).overLimit).toBe(true);
    expect(transactionLine(july[0]!, byId, names, new Map(), over).overLimit).toBe(false);
  });

  it('Scenario: A транзакція in another currency is judged by the ліміт’s currency', () => {
    // August's UAH spending in Groceries is under the ліміт; the USD витрата never counted toward
    // it, so it is unmarked whatever the USD amounts are.
    const august = [spend('e1', '2026-08-10', 100000), spend('e2', '2026-08-11', 900000, 'USD')];
    const over = marks({ '2026-08': august }, august);

    expect(transactionLine(august[1]!, byId, names, new Map(), over).overLimit).toBe(false);

    // And when the UAH spending *is* over, the USD line is marked too — it is the category that is
    // over, not the line.
    const overspent = [spend('e3', '2026-08-12', 260000), ...august];
    const overMarks = marks({ '2026-08': overspent }, overspent);
    expect(transactionLine(august[1]!, byId, names, new Map(), overMarks).overLimit).toBe(true);
  });

  it('Scenario: The «Без категорії» highlight and the over-limit mark coexist', () => {
    const august = [spend('e1', '2026-08-10', 260000, 'UAH', UNCATEGORISED_CATEGORY_ID)];
    const over = overLimitByMonth({
      feed: august,
      limits: [{ categoryId: UNCATEGORISED_CATEGORY_ID, amount: money(250000, 'UAH') }],
      monthTransactions: () => august,
    });
    const line = transactionLine(august[0]!, byId, names, new Map(), over);

    expect(line.uncategorised).toBe(true);
    expect(line.overLimit).toBe(true);
  });

  it('A повернення of an over-limit category is marked too; a переказ and a дохід never are', () => {
    const august = [spend('e1', '2026-08-10', 400000)];
    const back = refund({
      id: 'r1',
      date: '2026-08-20',
      accountId: 'card',
      amount: money(1000, 'UAH'),
      categoryId: 'groceries',
    });
    const whole = [...august, back];
    const over = marks({ '2026-08': whole }, whole);

    expect(transactionLine(back, byId, names, new Map(), over).overLimit).toBe(true);
    const move = transfer({
      id: 't1',
      date: '2026-08-21',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(1000, 'UAH'),
      arrived: money(1000, 'UAH'),
    });
    expect(transactionLine(move, byId, names, new Map(), over).overLimit).toBe(false);
  });

  it('With no ліміт anywhere nothing is loaded and nothing is marked', () => {
    const august = [spend('e1', '2026-08-10', 99_000_000)];
    let loads = 0;
    const over = overLimitByMonth({
      feed: august,
      limits: [],
      monthTransactions: () => {
        loads += 1;
        return august;
      },
    });

    expect(loads).toBe(0);
    expect(transactionLine(august[0]!, byId, names, new Map(), over).overLimit).toBe(false);
  });

  it('Each distinct month of the feed is loaded once', () => {
    const feed = [spend('e1', '2026-08-10', 1), spend('e2', '2026-08-11', 1), spend('e3', '2026-07-10', 1)];
    const asked: string[] = [];
    overLimitByMonth({
      feed,
      limits: [groceriesLimit],
      monthTransactions: (month) => {
        asked.push(month);
        return [];
      },
    });

    expect(asked.sort()).toEqual(['2026-07', '2026-08']);
  });
});


describe('feedTitle / feedSubtitle', () => {
  const income = (sourceId: string): Income => ({
    id: 'i1',
    type: 'income',
    date: '2026-08-25',
    accountId: 'card',
    amount: money(3_200_000, 'UAH'),
    sourceId,
  });
  const sources = namesById([
    { id: UNSOURCED_SOURCE_ID, name: 'Без джерела' },
    { id: 'salary', name: 'Зарплата' },
  ]);

  it('A витрата leads with its категорія and names its рахунок and date underneath', () => {
    const line = transactionLine(
      expenseByDefault({
        id: 'e1',
        date: '2026-08-24',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId: 'groceries',
      }),
      byId,
      names,
    );

    expect(feedTitle(line)).toBe('Groceries');
    expect(feedSubtitle(line)).toBe('mono black · 2026-08-24');
  });

  it('A дохід leads with its джерело', () => {
    const line = transactionLine(income('salary'), byId, names, sources);

    expect(feedTitle(line)).toBe('Зарплата');
    expect(feedSubtitle(line)).toBe('mono black · 2026-08-25');
  });

  it('A переказ leads with both рахунки and says what it is underneath, never twice', () => {
    const line = transactionLine(
      transfer({
        id: 't1',
        date: '2026-08-24',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(100000, 'UAH'),
        arrived: money(100000, 'UAH'),
      }),
      byId,
      names,
    );

    expect(feedTitle(line)).toBe('mono black → банка');
    expect(feedSubtitle(line)).toBe('переказ · 2026-08-24');
  });

  it('A коригування has no label of its own and reads like a переказ does', () => {
    const line = transactionLine(
      {
        id: 'c1',
        type: 'correction',
        date: '2026-08-24',
        accountId: 'card',
        amount: money(-5000, 'UAH'),
      },
      byId,
      names,
    );

    expect(feedTitle(line)).toBe('mono black');
    expect(feedSubtitle(line)).toBe('коригування · 2026-08-24');
  });
});
