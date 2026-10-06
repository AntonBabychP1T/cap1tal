import { describe, expect, it } from 'vitest';

import type { Category } from '../domain/category';
import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import type { AnsweredPair } from './observation';
import { observationsOf } from './observations';
import { ledgerBuilder, monthsFrom } from './test-fixtures';

const CATEGORIES: readonly Category[] = [
  { id: 'cafe', name: 'Кафе', archived: false },
  { id: 'food', name: 'Продукти', archived: false },
  { id: 'subscriptions', name: 'Підписки', archived: false },
  { id: 'other', name: 'Інше', archived: false },
];

/**
 * April to September spend 6 000 000 UAH each (October's поріг is 180 000), Кафе 390 000 of
 * September's; Netflix at 299 ₴ in July to September; then October: Кафе already at 420 000, Netflix
 * at 349 ₴, and a coffee recorded twice.
 */
function october(): Transaction[] {
  const b = ledgerBuilder();
  const rows: Transaction[] = [];
  for (const month of monthsFrom('2026-04', '2026-09')) {
    const cafe = month === '2026-09' ? 390000 : 300000;
    const netflix = month >= '2026-07' ? 29900 : 0;
    rows.push(b.expense(`${month}-05`, 'cafe', cafe));
    if (netflix) rows.push(b.expense(`${month}-07`, 'subscriptions', netflix, { description: 'Netflix' }));
    rows.push(b.expense(`${month}-20`, 'other', 6000000 - cafe - netflix));
  }
  rows.push(
    b.expense('2026-10-02', 'cafe', 420000),
    b.expense('2026-10-05', 'subscriptions', 34900, { id: 'netflix-oct', description: 'Netflix' }),
    b.expense('2026-10-03', 'cafe', 12500, { id: 'bank', description: 'Aroma Kava' }),
    b.expense('2026-10-04', 'cafe', 12500, { id: 'hand' }),
  );
  return rows;
}

const read = (
  transactions: readonly Transaction[],
  month: string,
  today: string,
  answers: readonly AnsweredPair[] = [],
) => observationsOf({ month, today, transactions, categories: CATEGORIES, answers, linkedAccountIds: new Set() });

describe('the спостереження of a month', () => {
  it('Scenario: The same state yields the same спостереження', () => {
    const rows = october();
    const first = read(rows, '2026-09', '2026-10-02');
    const second = read([...rows].reverse(), '2026-09', '2026-10-02');
    expect(second).toEqual(first);
    expect(read(rows, '2026-10', '2026-10-10')).toEqual(read(rows, '2026-10', '2026-10-10'));
  });

  it('Scenario: A month with no транзакція has none', () => {
    const rows = october();
    expect(read(rows, '2026-03', '2026-10-10')).toEqual([]);
    // A month after the current one has none either, and nor does text that is not a month.
    expect(read(rows, '2026-12', '2026-10-10')).toEqual([]);
    expect(read(rows, '2026-13', '2026-10-10')).toEqual([]);
  });

  it('Scenario: A дубль leads', () => {
    const kinds = read(october(), '2026-10', '2026-10-10').map((o) => o.kind);
    expect(kinds).toEqual(['possible-duplicate', 'price-change', 'category-early']);
  });

  it('Scenario: Currencies do not mix in the order', () => {
    const b = ledgerBuilder();
    const rows: Transaction[] = [];
    for (const month of ['2026-07', '2026-08', '2026-09']) {
      rows.push(b.expense(`${month}-05`, 'subscriptions', 1000, { currency: 'USD', accountId: 'usd', description: 'GitHub' }));
      rows.push(b.expense(`${month}-06`, 'subscriptions', 29900, { description: 'Netflix' }));
    }
    // The USD change is far larger in minor units — and still comes second.
    rows.push(b.expense('2026-10-05', 'subscriptions', 1900, { currency: 'USD', accountId: 'usd', description: 'GitHub' }));
    rows.push(b.expense('2026-10-06', 'subscriptions', 30900 + 500, { description: 'Netflix' }));

    const stated = read(rows, '2026-10', '2026-10-10').filter((o) => o.kind === 'price-change');
    expect(stated.map((o) => o.currency)).toEqual(['UAH', 'USD']);
    // Each сума in its own currency; none is compared with the other's.
    for (const o of stated) {
      if (o.kind !== 'price-change') throw new Error(o.kind);
      expect(o.transaction.amount.currency).toBe(o.currency);
      expect(o.usual.currency).toBe(o.currency);
    }
  });

  it('Scenario: Answered once, gone everywhere', () => {
    const rows = october();
    const answered = [{ first: 'hand', second: 'bank' }];
    // Головний and Місяць on October, while October is current.
    expect(read(rows, '2026-10', '2026-10-10', answered).map((o) => o.kind)).not.toContain('possible-duplicate');
    // The підсумок of October, once it is finished.
    expect(read(rows, '2026-10', '2026-11-03', answered).map((o) => o.kind)).not.toContain('possible-duplicate');
    // And unanswered, it is in both.
    expect(read(rows, '2026-10', '2026-11-03').map((o) => o.kind)).toContain('possible-duplicate');
  });

  it('Scenario: A fact cannot be hidden', () => {
    const b = ledgerBuilder();
    const rows: Transaction[] = monthsFrom('2026-03', '2026-08').flatMap((month) => [
      b.expense(`${month}-05`, 'food', 1000000),
      b.expense(`${month}-06`, 'other', 5000000),
    ]);
    rows.push(b.expense('2026-09-05', 'food', 1380000), b.expense('2026-09-06', 'other', 5000000));
    // Whatever answers exist — even ones naming every транзакція there is — the fact stands.
    const everyPair = rows.flatMap((x) => rows.map((y) => ({ first: x.id, second: y.id })));

    const stated = read(rows, '2026-09', '2026-10-02', everyPair);
    expect(stated).toMatchObject([{ kind: 'category-vs-typical', categoryId: 'food', changePercent: 38 }]);
  });

  it('a finished month runs the whole-month detectors, the current one the month-in-progress ones', () => {
    const rows = october();
    // September, read from October: no «already more than last month» about it.
    expect(read(rows, '2026-09', '2026-10-10').map((o) => o.kind)).not.toContain('category-early');
    // October, read from November: it is finished now, and «already more» is not said of it.
    expect(read(rows, '2026-10', '2026-11-03').map((o) => o.kind)).not.toContain('category-early');
  });

  it('says nothing that needs a типова сума in a currency with two finished months', () => {
    const b = ledgerBuilder();
    const rows = [
      ...october(),
      b.expense('2026-08-02', 'cafe', 1000, { currency: 'USD', accountId: 'usd' }),
      b.expense('2026-09-02', 'cafe', 1000, { currency: 'USD', accountId: 'usd' }),
      b.expense('2026-10-02', 'cafe', 900000, { currency: 'USD', accountId: 'usd' }),
    ];
    expect(read(rows, '2026-10', '2026-10-10').filter((o) => o.currency === 'USD')).toEqual([]);
  });
});

describe('the detector halves of the бекап scenarios', () => {
  const twoPairs = (): Transaction[] => {
    const b = ledgerBuilder();
    return [
      b.expense('2026-10-03', 'cafe', 12500, { id: 'a1', description: 'Aroma Kava' }),
      b.expense('2026-10-04', 'cafe', 12500, { id: 'a2' }),
      b.expense('2026-10-06', 'food', 7500, { id: 'b1', description: 'АТБ' }),
      b.expense('2026-10-07', 'food', 7500, { id: 'b2', description: 'Сільпо' }),
    ];
  };
  const duplicatesOf = (answers: readonly AnsweredPair[]) =>
    read(twoPairs(), '2026-10', '2026-10-10', answers)
      .filter((o) => o.kind === 'possible-duplicate')
      .map((o) => o.key);

  it('Scenario: The answers survive the round trip', () => {
    // Both answers back — in either order of their pairs — and neither pair is stated.
    expect(duplicatesOf([{ first: 'a1', second: 'a2' }, { first: 'b2', second: 'b1' }])).toEqual([]);
  });

  it('Scenario: A бекап written before the answers existed restores with none', () => {
    // No answer stored: every pair that qualifies is stated again, the later one first.
    expect(duplicatesOf([])).toEqual([
      'possible-duplicate:UAH:b1+b2:2026-10',
      'possible-duplicate:UAH:a1+a2:2026-10',
    ]);
  });

  it('carries the сума of a pair with the pair', () => {
    const [stated] = read(twoPairs(), '2026-10', '2026-10-10', [{ first: 'b1', second: 'b2' }]);
    expect(stated).toMatchObject({ kind: 'possible-duplicate', amount: money(12500, 'UAH') });
  });
});
