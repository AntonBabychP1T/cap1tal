import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import {
  expenseByDefault,
  refund,
  transfer,
  UNCATEGORISED_CATEGORY_ID,
  type Correction,
  type Income,
  type Transaction,
} from '../domain/transaction';
import { buildEntry } from './entry-form';
import { formatMinorUnits } from './amount-input';
import { labelsAfterRetype, recategorise, shapesFor, type RetypeShape } from './retype';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
const accounts = [card, jar];

const storedExpense = expenseByDefault({
  id: 't1',
  date: '2026-08-24',
  accountId: 'card',
  amount: money(80000, 'UAH'),
  categoryId: 'clothing',
});
const storedIncome: Income = {
  type: 'income',
  id: 't2',
  date: '2026-08-23',
  accountId: 'card',
  amount: money(500000, 'UAH'),
  sourceId: 'salary',
};
const storedRefund = refund({
  id: 't3',
  date: '2026-08-22',
  accountId: 'card',
  amount: money(80000, 'UAH'),
  categoryId: 'clothing',
});
const storedTransfer = transfer({
  id: 't4',
  date: '2026-08-21',
  fromAccountId: 'card',
  toAccountId: 'jar',
  left: money(100000, 'UAH'),
  arrived: money(100000, 'UAH'),
});
const storedCorrection: Correction = {
  type: 'correction',
  id: 't5',
  date: '2026-08-20',
  accountId: 'card',
  amount: money(-3000, 'UAH'),
};

/**
 * The whole of what the editing screen does when the owner flips the type: the pickers are seeded
 * with what survives the move, and what is then stored is `buildEntry` under the stored id. Doing
 * both here is what makes these tests the scenario rather than half of it.
 */
function retypedTo(
  t: Transaction,
  to: RetypeShape,
  picked: { categoryId?: string; sourceId?: string } = {},
): Transaction {
  const carried = labelsAfterRetype(t, to);
  const amount = t.type === 'transfer' ? t.left : t.amount;
  return buildEntry(
    {
      type: to,
      accountId: t.type === 'transfer' ? t.fromAccountId : t.accountId,
      toAccountId: 'jar',
      amount: formatMinorUnits(amount.amount),
      arrived: '',
      date: t.date,
      categoryId: picked.categoryId ?? carried.categoryId,
      sourceId: picked.sourceId ?? carried.sourceId,
    },
    { id: t.id, accounts },
  );
}

describe('shapesFor — what a stored transaction may become', () => {
  it('Scenario: A повернення is not retyped into a дохід', () => {
    // Neither direction is offered. A повернення is a negative витрата in the category it came
    // out of and is never income; the one tap across would raise дохід and stop the month's
    // spent shrinking at the same time.
    expect(shapesFor(storedRefund)).not.toContain('income');
    expect(shapesFor(storedIncome)).not.toContain('refund');
    // And each still offers the way back to витрата, which is the route between them.
    expect(shapesFor(storedRefund)).toEqual(['expense', 'refund']);
    expect(shapesFor(storedIncome)).toEqual(['expense', 'income']);
  });

  it('A витрата is the hub: it becomes any of the other three', () => {
    expect(shapesFor(storedExpense)).toEqual(['expense', 'transfer', 'income', 'refund']);
  });

  it('A переказ offers only витрата and переказ', () => {
    // The pair the retype requirement names. Nothing turns a переказ into a дохід: the money
    // never left the owner's accounts.
    expect(shapesFor(storedTransfer)).toEqual(['expense', 'transfer']);
  });

  it('A коригування offers nothing, because nothing can record one yet', () => {
    expect(shapesFor(storedCorrection)).toEqual([]);
  });

  it('Every offered shape is one the requirement names, in both directions', () => {
    // The move list, read off the requirement: витрата ↔ переказ, витрата ↔ повернення,
    // витрата ↔ дохід. Anything else appearing here would be behaviour no spec asked for.
    const offered = new Set<string>();
    for (const t of [storedExpense, storedIncome, storedRefund, storedTransfer, storedCorrection]) {
      for (const to of shapesFor(t)) {
        if (to !== t.type) offered.add(`${t.type}→${to}`);
      }
    }
    expect([...offered].sort()).toEqual([
      'expense→income',
      'expense→refund',
      'expense→transfer',
      'income→expense',
      'refund→expense',
      'transfer→expense',
    ]);
  });
});

describe('a retype keeps the transaction and moves only what the shape allows', () => {
  it('Scenario: An expense becomes a refund in the same category', () => {
    expect(retypedTo(storedExpense, 'refund')).toEqual({
      type: 'refund',
      id: 't1',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(80000, 'UAH'),
      categoryId: 'clothing',
    });
  });

  it('Scenario: An expense becomes an income with a picked source', () => {
    const retyped = retypedTo(storedExpense, 'income', { sourceId: 'salary' });

    expect(retyped).toEqual({
      type: 'income',
      id: 't1',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(80000, 'UAH'),
      sourceId: 'salary',
    });
    // No category survives onto a дохід — it has nowhere to carry one.
    expect('categoryId' in retyped).toBe(false);
  });

  it('Scenario: An income becomes an uncategorised expense', () => {
    const retyped = retypedTo(storedIncome, 'expense');

    expect(retyped).toEqual({
      type: 'expense',
      id: 't2',
      date: '2026-08-23',
      accountId: 'card',
      amount: money(500000, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
  });

  it('A повернення becomes a витрата in the same category', () => {
    expect(retypedTo(storedRefund, 'expense')).toMatchObject({
      type: 'expense',
      id: 't3',
      categoryId: 'clothing',
    });
  });

  it('Scenario: An uncategorised expense becoming a refund asks for the category', () => {
    // «Без категорії» is what a витрата arrives wearing, not something the owner picked, and a
    // повернення takes no default — so nothing carries over and nothing is stored until a pick.
    const uncategorised = expenseByDefault({
      id: 't6',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(80000, 'UAH'),
    });

    expect(labelsAfterRetype(uncategorised, 'refund')).toEqual({});
    expect(() => retypedTo(uncategorised, 'refund')).toThrow('оберіть категорію');
    expect(retypedTo(uncategorised, 'refund', { categoryId: 'clothing' })).toMatchObject({
      type: 'refund',
      categoryId: 'clothing',
    });
  });

  it('A витрата does not become a дохід without a picked джерело', () => {
    expect(labelsAfterRetype(storedExpense, 'income')).toEqual({});
    expect(() => retypedTo(storedExpense, 'income')).toThrow('оберіть джерело');
  });

  it('A дохід keeps its джерело while it stays a дохід, and loses it when it stops', () => {
    expect(labelsAfterRetype(storedIncome, 'income')).toEqual({ sourceId: 'salary' });
    expect(labelsAfterRetype(storedIncome, 'expense')).toEqual({});
  });

  it('Neither label crosses a переказ', () => {
    expect(labelsAfterRetype(storedExpense, 'transfer')).toEqual({});
    expect(labelsAfterRetype(storedTransfer, 'expense')).toEqual({});
    expect(labelsAfterRetype(storedCorrection, 'expense')).toEqual({});
  });
});

describe('recategorise — the feed\'s one tap', () => {
  it('Scenario: One tap categorises from the feed', () => {
    const categorised = recategorise(storedExpense, 'groceries');

    // The same transaction in every respect but the category: the type does not move either,
    // which is what makes "without the editing screen having opened" honest.
    expect(categorised).toEqual({ ...storedExpense, categoryId: 'groceries' });
  });

  it('A повернення is categorised the same way and stays a повернення', () => {
    expect(recategorise(storedRefund, 'groceries')).toEqual({
      ...storedRefund,
      categoryId: 'groceries',
    });
  });

  it('An unanswered picker is not a pick', () => {
    // What a `Choices` row hands back before anything is chosen; storing it would reference a
    // category no row has.
    expect(() => recategorise(storedExpense, '')).toThrow('оберіть категорію');
  });

  it('A type that carries no category is refused', () => {
    expect(() => recategorise(storedTransfer, 'groceries')).toThrow();
    expect(() => recategorise(storedIncome, 'groceries')).toThrow();
    expect(() => recategorise(storedCorrection, 'groceries')).toThrow();
  });

  it('The original-currency сума survives, because recategorising says nothing about it', () => {
    const foreign = expenseByDefault({
      id: 't7',
      date: '2026-08-24',
      accountId: 'card',
      amount: money(41000, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
      originalAmount: money(1000, 'USD'),
    });

    expect(recategorise(foreign, 'groceries')).toEqual({ ...foreign, categoryId: 'groceries' });
  });
});
