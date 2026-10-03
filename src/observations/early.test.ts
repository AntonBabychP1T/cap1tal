import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { early } from './early';
import { ledgerBuilder, monthsFrom } from './test-fixtures';
import { ledgerOf } from './window';

/**
 * April to September each spend 6 000 000 UAH — so October's поріг is 180 000 — with Кафе taking
 * `cafes[i]` of it, then October's Кафе as given.
 */
function history(cafes: readonly number[], october: readonly [string, number][]): Transaction[] {
  const b = ledgerBuilder();
  const rows: Transaction[] = [];
  monthsFrom('2026-04', '2026-09').forEach((month, i) => {
    rows.push(b.expense(`${month}-05`, 'cafe', cafes[i]!), b.expense(`${month}-06`, 'other', 6000000 - cafes[i]!));
  });
  for (const [date, amount] of october) rows.push(b.expense(date, 'cafe', amount));
  return rows;
}

const SIX = [300000, 300000, 300000, 300000, 300000, 390000];

describe('a категорія that has already reached last month’s whole', () => {
  it('Scenario: Ten days of cafés already exceed September', () => {
    const rows = history(SIX, [
      ['2026-10-02', 200000],
      ['2026-10-09', 220000],
    ]);

    expect(early(ledgerOf(rows, '2026-10-10'))).toEqual([
      {
        kind: 'category-early',
        month: '2026-10',
        currency: 'UAH',
        key: 'category-early:UAH:cafe:2026-10',
        categoryId: 'cafe',
        daysElapsed: 10,
        soFar: money(420000, 'UAH'),
        previousWhole: money(390000, 'UAH'),
      },
    ]);
  });

  it('Scenario: No projection is stated', () => {
    const [stated] = early(ledgerOf(history(SIX, [['2026-10-09', 420000]]), '2026-10-10'));
    // Exactly the three facts and nothing that reaches past today: no сума for the end of October,
    // no pace, no days left.
    expect(Object.keys(stated!).sort()).toEqual(
      ['categoryId', 'currency', 'daysElapsed', 'key', 'kind', 'month', 'previousWhole', 'soFar'].sort(),
    );
  });

  it('counts only what is dated by today, and equal is already enough', () => {
    const rows = history(SIX, [
      ['2026-10-03', 390000],
      // A транзакція dated later this month has not happened yet.
      ['2026-10-20', 100000],
    ]);
    expect(early(ledgerOf(rows, '2026-10-10'))).toMatchObject([{ soFar: money(390000, 'UAH') }]);
    expect(early(ledgerOf(rows, '2026-10-02'))).toEqual([]);
  });

  it('says nothing about a previous month below the поріг', () => {
    const small = [10000, 10000, 10000, 10000, 10000, 150000];
    expect(early(ledgerOf(history(small, [['2026-10-03', 200000]]), '2026-10-10'))).toEqual([]);
  });

  it('Scenario: A finished month is not judged this way', () => {
    // On 2026-10-10 the detector reads October alone; September — finished — is never its month.
    const stated = early(ledgerOf(history(SIX, [['2026-10-03', 420000]]), '2026-10-10'));
    expect(stated.every((o) => o.month === '2026-10')).toBe(true);
  });
});
