import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { runs } from './run';
import { ledgerBuilder, monthsFrom } from './test-fixtures';
import { vsTypical } from './vs-typical';
import { ledgerOf } from './window';

const TODAY = '2026-10-02';

/**
 * March to September, Кафе taking `cafes[i]` and «Інше» the rest of 6 000 000 UAH in each of March
 * to August — so September's поріг is 180 000 — and September's Кафе alone after them.
 */
function history(cafes: readonly number[]): Transaction[] {
  const b = ledgerBuilder();
  const rows: Transaction[] = [];
  monthsFrom('2026-03', '2026-09').forEach((month, i) => {
    rows.push(b.expense(`${month}-05`, 'cafe', cafes[i]!));
    if (month !== '2026-09') rows.push(b.expense(`${month}-06`, 'other', 6000000 - cafes[i]!));
  });
  return rows;
}

function cafeRuns(rows: Transaction[]) {
  const ledger = ledgerOf(rows, TODAY);
  return runs(ledger, '2026-09', vsTypical(ledger, '2026-09')).filter((o) => o.categoryId === 'cafe');
}

describe('a категорія that has grown three months running', () => {
  it('Scenario: Cafés grow for the third month running', () => {
    const rows = history([400000, 380000, 350000, 210000, 260000, 305000, 390000]);
    const ledger = ledgerOf(rows, TODAY);
    // The scenario's premise: 19 % above a типова сума of 327 500 — inside the band.
    expect(vsTypical(ledger, '2026-09').filter((o) => o.categoryId === 'cafe')).toEqual([]);

    expect(cafeRuns(rows)).toEqual([
      {
        kind: 'category-run',
        month: '2026-09',
        currency: 'UAH',
        key: 'category-run:UAH:cafe:2026-09',
        categoryId: 'cafe',
        run: 3,
        series: [210000, 260000, 305000, 390000].map((amount) => money(amount, 'UAH')),
      },
    ]);
  });

  it('Scenario: Above-typical takes precedence over the run', () => {
    // Typical 500 000; September 700 000 is 40 % above it and ends a run of 380 → 430 → 500 → 700.
    const rows = history([500000, 500000, 500000, 380000, 430000, 500000, 700000]);
    const ledger = ledgerOf(rows, TODAY);
    const typical = vsTypical(ledger, '2026-09').filter((o) => o.categoryId === 'cafe');

    expect(typical).toMatchObject([{ changePercent: 40 }]);
    expect(runs(ledger, '2026-09', typical).filter((o) => o.categoryId === 'cafe')).toEqual([]);
  });

  it('Scenario: A flat month breaks the run', () => {
    expect(cafeRuns(history([100000, 100000, 100000, 200000, 260000, 260000, 390000]))).toEqual([]);
  });

  it('is not made by a month the currency does not touch, nor across one', () => {
    const b = ledgerBuilder();
    const rows = history([100000, 100000, 100000, 200000, 260000, 330000, 420000]).filter(
      (t) => !t.date.startsWith('2026-07'),
    );
    rows.push(b.expense('2026-07-05', 'cafe', 1, { currency: 'USD', accountId: 'usd' }));
    // July holds no UAH транзакція, so the UAH run cannot pass through it.
    expect(cafeRuns(rows)).toEqual([]);
  });

  it('needs the rise to be noticeable', () => {
    // 330 000 → 340 000 → 350 000 → 360 000: three rises, 30 000 in all — below the поріг.
    expect(cafeRuns(history([300000, 300000, 300000, 330000, 340000, 350000, 360000]))).toEqual([]);
  });
});
