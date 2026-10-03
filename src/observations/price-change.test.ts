import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { merchantOfDescription } from './observation';
import { priceChanges } from './price-change';
import { ledgerBuilder } from './test-fixtures';
import { ledgerOf } from './window';

const b = ledgerBuilder();

function charges(name: string, amounts: readonly [string, number][]): Transaction[] {
  return amounts.map(([date, amount]) => b.expense(date, 'subscriptions', amount, { description: name }));
}

const octoberOf = (rows: Transaction[], today = '2026-10-20') =>
  priceChanges(ledgerOf(rows, today), '2026-10', merchantOfDescription);

describe('a regular payment whose price changed', () => {
  it('Scenario: Netflix got dearer', () => {
    const rows = charges('Netflix', [
      ['2026-07-05', 29900],
      ['2026-08-05', 29900],
      ['2026-09-05', 29900],
      ['2026-10-05', 34900],
    ]);
    const [stated] = octoberOf(rows);

    expect(stated).toMatchObject({
      kind: 'price-change',
      month: '2026-10',
      currency: 'UAH',
      usual: money(29900, 'UAH'),
      changePercent: 17,
      transaction: { date: '2026-10-05', amount: money(34900, 'UAH'), description: 'Netflix' },
    });
    expect(stated!.transaction.id).toBe(rows[3]!.id);
  });

  it('Scenario: A rate wobble inside the band is not a price change', () => {
    const rows = charges('Spotify USD', [
      ['2026-07-05', 41000],
      ['2026-08-05', 41500],
      ['2026-09-05', 40800],
      ['2026-10-05', 42300],
    ]);
    expect(octoberOf(rows)).toEqual([]);
  });

  it('Scenario: An unrelated purchase at the same продавець is not a price change', () => {
    const rows = charges('rozetka', [
      ['2026-07-05', 29900],
      ['2026-08-05', 29900],
      ['2026-09-05', 29900],
      ['2026-10-12', 150000],
    ]);
    expect(octoberOf(rows)).toEqual([]);
  });

  it('Scenario: No charge yet this month says nothing', () => {
    const rows = charges('Netflix', [
      ['2026-07-05', 29900],
      ['2026-08-05', 29900],
      ['2026-09-05', 29900],
    ]);
    expect(octoberOf(rows, '2026-10-03')).toEqual([]);
  });

  it('needs a charge in each of the three months before, and the regular one this month keeps quiet', () => {
    const missing = charges('Netflix', [
      ['2026-07-05', 29900],
      ['2026-09-05', 29900],
      ['2026-10-05', 34900],
    ]);
    expect(octoberOf(missing)).toEqual([]);
    const both = charges('Netflix', [
      ['2026-07-05', 29900],
      ['2026-08-05', 29900],
      ['2026-09-05', 29900],
      ['2026-10-05', 29900],
      ['2026-10-06', 34900],
    ]);
    expect(octoberOf(both)).toEqual([]);
  });

  it('names the charge nearest the usual one, the earlier on a tie, and a cheaper price too', () => {
    const rows = charges('Netflix', [
      ['2026-07-05', 29900],
      ['2026-08-05', 29900],
      ['2026-09-05', 29900],
      ['2026-10-09', 25900],
      ['2026-10-05', 33900],
      ['2026-10-20', 50000],
    ]);
    const [stated] = octoberOf(rows);
    expect(stated).toMatchObject({ transaction: { date: '2026-10-05' }, changePercent: 13 });

    const cheaper = charges('Megogo', [
      ['2026-07-05', 20000],
      ['2026-08-05', 20000],
      ['2026-09-05', 20000],
      ['2026-10-05', 15000],
    ]);
    expect(octoberOf(cheaper)).toMatchObject([{ changePercent: -25 }]);
  });

  it('needs no поріг: a currency with no history beyond the three months still speaks', () => {
    const rows = charges('iCloud', [
      ['2026-07-05', 299],
      ['2026-08-05', 299],
      ['2026-09-05', 299],
      ['2026-10-05', 399],
    ]).map((t) => (t.type === 'expense' ? { ...t, amount: money(t.amount.amount, 'USD') } : t));
    expect(octoberOf(rows)).toMatchObject([{ currency: 'USD', changePercent: 33 }]);
  });
});
