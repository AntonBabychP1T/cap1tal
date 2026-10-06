import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { FEES_CATEGORY_ID, type Expense, type Transaction } from '../domain/transaction';
import { possibleDuplicates } from './duplicates';
import { pairKey } from './observation';
import { ledgerBuilder } from './test-fixtures';
import { ledgerOf } from './window';

const TODAY = '2026-10-20';
const b = ledgerBuilder();
const coffee = (id: string, date: string, description?: string, accountId = 'black') =>
  b.expense(date, 'coffee', 12500, { id, accountId, ...(description ? { description } : {}) });

const withMcc = (t: Expense, mcc: number): Expense => ({ ...t, mcc });

const of = (
  rows: Transaction[],
  month = '2026-10',
  answered: ReadonlySet<string> = new Set(),
  linked: ReadonlySet<string> = new Set(),
) => possibleDuplicates(ledgerOf(rows, TODAY), month, answered, linked);
const pairs = (rows: Transaction[], month?: string, answered?: ReadonlySet<string>, linked?: ReadonlySet<string>) =>
  of(rows, month, answered, linked).map((o) => [o.first.id, o.second.id]);
const LINKED = new Set(['black']);

describe('a можливий дубль', () => {
  it('Scenario: A транзакція recorded by hand and a bank record of the same coffee', () => {
    const rows = [coffee('bank', '2026-10-03', 'Aroma Kava'), coffee('hand', '2026-10-04', 'кава')];

    expect(of(rows)).toEqual([
      {
        kind: 'possible-duplicate',
        month: '2026-10',
        currency: 'UAH',
        key: 'possible-duplicate:UAH:bank+hand:2026-10',
        amount: money(12500, 'UAH'),
        accountId: 'black',
        first: { id: 'bank', date: '2026-10-03', accountId: 'black', amount: money(12500, 'UAH'), description: 'Aroma Kava', categoryId: 'coffee' },
        second: { id: 'hand', date: '2026-10-04', accountId: 'black', amount: money(12500, 'UAH'), description: 'кава', categoryId: 'coffee' },
      },
    ]);
  });

  it('Scenario: A pair across two months is asked in both', () => {
    const rows = [coffee('sep', '2026-09-30', 'Aroma Kava'), coffee('oct', '2026-10-01')];

    expect(pairs(rows, '2026-09')).toEqual([['sep', 'oct']]);
    expect(pairs(rows, '2026-10')).toEqual([['sep', 'oct']]);
    const answered = new Set([pairKey('oct', 'sep')]);
    expect(pairs(rows, '2026-09', answered)).toEqual([]);
    expect(pairs(rows, '2026-10', answered)).toEqual([]);
    // A month neither half is in states nothing.
    expect(pairs(rows, '2026-11')).toEqual([]);
  });

  it('Scenario: Two identical bank records are two purchases', () => {
    const rows = [withMcc(coffee('a', '2026-10-03', 'Aroma Kava'), 5814), withMcc(coffee('b', '2026-10-03', 'AROMA  kava '), 5814)];
    expect(pairs(rows, '2026-10', new Set(), LINKED)).toEqual([]);
    // Either test alone already reads them as the bank's own records.
    expect(pairs(rows)).toEqual([]);
  });

  it('Scenario: The same опис entered twice by hand is a дубль', () => {
    const rows = [
      b.expense('2026-10-05', 'groceries', 25000, { id: 'one', accountId: 'wallet', description: 'Silpo' }),
      b.expense('2026-10-05', 'groceries', 25000, { id: 'two', accountId: 'wallet', description: 'Silpo' }),
    ];
    expect(pairs(rows, '2026-10', new Set(), LINKED)).toEqual([['one', 'two']]);
  });

  it('Scenario: Two equal сповіщення on an unlinked рахунок are asked about', () => {
    const rows = [
      b.expense('2026-10-03', 'coffee', 7500, { id: 'first', accountId: 'privat', description: 'Aroma Kava' }),
      b.expense('2026-10-03', 'coffee', 7500, { id: 'second', accountId: 'privat', description: 'Aroma Kava' }),
    ];
    expect(pairs(rows, '2026-10', new Set(), LINKED)).toEqual([['first', 'second']]);
    // «Не дубль» removes it for good.
    expect(pairs(rows, '2026-10', new Set([pairKey('second', 'first')]), LINKED)).toEqual([]);
  });

  it('Scenario: Equal описи on a linked рахунок are not asked about', () => {
    expect(pairs([coffee('a', '2026-10-03', 'кава'), coffee('b', '2026-10-03', 'кава')], '2026-10', new Set(), LINKED)).toEqual(
      [],
    );
  });

  it("Scenario: A hand record and the bank's record of one purchase with one опис are not asked about", () => {
    const rows = [
      b.expense('2026-10-05', 'groceries', 25000, { id: 'hand', description: 'Сільпо' }),
      withMcc(b.expense('2026-10-05', 'groceries', 25000, { id: 'bank', description: 'Сільпо' }), 5411),
    ];
    expect(pairs(rows, '2026-10', new Set(), LINKED)).toEqual([]);
  });

  it('Scenario: Two days apart is not a дубль', () => {
    expect(pairs([coffee('a', '2026-10-03'), coffee('b', '2026-10-05')])).toEqual([]);
  });

  it('Scenario: Different рахунки are not a дубль', () => {
    expect(pairs([coffee('a', '2026-10-03'), coffee('b', '2026-10-03', undefined, 'white')])).toEqual([]);
  });

  it('Scenario: A переказ is never a дубль', () => {
    const rows = [
      b.transfer('2026-10-03', 'black', 'jar', 500000, { id: 'move' }),
      b.expense('2026-10-03', 'food', 500000, { id: 'spend' }),
      // Nor a дохід, a повернення or a коригування of the same сума on the same рахунок.
      b.income('2026-10-03', 500000, { id: 'in' }),
      b.refund('2026-10-03', 'food', 500000, { id: 'back' }),
      b.correction('2026-10-03', -500000, { id: 'fix' }),
    ];
    expect(pairs(rows)).toEqual([]);
  });

  it('Scenario: Two equal комісії of two перекази are not a дубль', () => {
    const rows = [
      b.expense('2026-10-03', FEES_CATEGORY_ID, 1500, { id: 'fee-1' }),
      b.expense('2026-10-03', FEES_CATEGORY_ID, 1500, { id: 'fee-2' }),
    ];
    expect(pairs(rows)).toEqual([]);
  });

  it('Scenario: Two bank records at two продавці are asked, not guessed', () => {
    const rows = [
      b.expense('2026-10-03', 'coffee', 7500, { id: 'aroma', description: 'Aroma Kava' }),
      b.expense('2026-10-04', 'coffee', 7500, { id: 'lviv', description: 'Львівські круасани' }),
    ];
    expect(pairs(rows)).toEqual([['aroma', 'lviv']]);
    // «Не дубль» removes it for good.
    expect(pairs(rows, '2026-10', new Set([pairKey('lviv', 'aroma')]))).toEqual([]);
  });

  it('Scenario: A third identical витрата is asked anew', () => {
    const answered = new Set([pairKey('bank', 'hand')]);
    const rows = [
      coffee('bank', '2026-10-03', 'Aroma Kava'),
      coffee('hand', '2026-10-04', 'кава'),
      coffee('third', '2026-10-04'),
    ];
    expect(pairs(rows, '2026-10', answered)).toEqual([
      ['bank', 'third'],
      ['hand', 'third'],
    ]);
  });

  it('counts calendar days across month and year ends, leap days included', () => {
    expect(pairs([coffee('a', '2026-12-31'), coffee('b', '2027-01-01')], '2026-12')).toEqual([['a', 'b']]);
    expect(pairs([coffee('a', '2026-12-31'), coffee('b', '2027-01-01')], '2027-01')).toEqual([['a', 'b']]);
    // 28 February and 1 March of a leap year are two days apart; the 29th and the 1st are one.
    expect(pairs([coffee('a', '2028-02-28'), coffee('b', '2028-03-01')], '2028-03')).toEqual([]);
    expect(pairs([coffee('a', '2028-02-29'), coffee('b', '2028-03-01')], '2028-03')).toEqual([['a', 'b']]);
  });
});
