import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { merchantOutliers } from './merchant-outlier';
import { merchantOfDescription } from './observation';
import { ledgerBuilder, monthsFrom } from './test-fixtures';
import { ledgerOf } from './window';

const TODAY = '2026-10-15';

/** April to September each spend 6 000 000 UAH, so October's поріг is 180 000. */
function background(): Transaction[] {
  const b = ledgerBuilder();
  return monthsFrom('2026-04', '2026-09').map((month) => b.expense(`${month}-28`, 'other', 6000000));
}

function at(name: string, rows: readonly [string, number][]): Transaction[] {
  const b = ledgerBuilder();
  return rows.map(([date, amount], i) =>
    b.expense(date, 'food', amount, { description: name, id: `${name}-${i}` }),
  );
}

const octoberOf = (rows: Transaction[]) =>
  merchantOutliers(ledgerOf([...background(), ...rows], TODAY), '2026-10', merchantOfDescription);

describe('a purchase far above what its продавець usually costs', () => {
  it('Scenario: A purchase four times the usual', () => {
    const rows = at('Сільпо', [
      ['2026-02-14', 60000],
      ['2026-05-02', 70000],
      ['2026-08-21', 80000],
      ['2026-10-12', 294000],
    ]);
    expect(octoberOf(rows)).toEqual([
      {
        kind: 'merchant-outlier',
        month: '2026-10',
        currency: 'UAH',
        key: 'merchant-outlier:UAH:Сільпо-3:2026-10',
        transaction: {
          id: 'Сільпо-3',
          date: '2026-10-12',
          accountId: 'black',
          amount: money(294000, 'UAH'),
          description: 'Сільпо',
          categoryId: 'food',
        },
        usual: money(70000, 'UAH'),
        ratioTenths: 42,
      },
    ]);
  });

  it('Scenario: Two earlier purchases are not a usual', () => {
    const rows = at('Сільпо', [
      ['2026-05-02', 70000],
      ['2026-08-21', 70000],
      ['2026-10-12', 300000],
    ]);
    expect(octoberOf(rows)).toEqual([]);
  });

  it('Scenario: A large ratio of a small сума is not noticeable', () => {
    const rows = at('Кавʼярня', [
      ['2026-07-02', 5000],
      ['2026-08-02', 5000],
      ['2026-09-02', 5000],
      ['2026-10-12', 20000],
    ]);
    expect(octoberOf(rows)).toEqual([]);
  });

  it('reads earlier days of the month, never the same day, and nothing older than twelve months', () => {
    const rows = at('Епіцентр', [
      // Before the first day of the twelfth month before October: out of reach.
      ['2025-09-30', 70000],
      ['2025-10-01', 70000],
      ['2026-10-03', 70000],
      ['2026-10-12', 70000],
      // The same date as the purchase does not count as earlier.
      ['2026-10-14', 70000],
      ['2026-10-14', 300000],
    ]);
    // Earlier than 2026-10-14 and in reach: 2025-10-01, 2026-10-03, 2026-10-12 — three, median 70 000.
    expect(octoberOf(rows)).toMatchObject([{ transaction: { amount: money(300000, 'UAH') }, ratioTenths: 43 }]);
  });
});
