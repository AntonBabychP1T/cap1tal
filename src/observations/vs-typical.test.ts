import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { CORRECTION_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID, type Transaction } from '../domain/transaction';
import { ledgerBuilder, monthsFrom } from './test-fixtures';
import { vsTypical } from './vs-typical';
import { ledgerOf } from './window';

const TODAY = '2026-10-02';
const WINDOW = monthsFrom('2026-03', '2026-08');
/** Every window month spends exactly this in UAH, so the поріг is 180 000. */
const MONTH_SPENT = 6000000;

/**
 * Six window months in which the named категорії take the given сум and «Інше» the rest of
 * 6 000 000, then September as given.
 */
function history(window: Record<string, number>, september: Record<string, number>): Transaction[] {
  const b = ledgerBuilder();
  const rows: Transaction[] = [];
  for (const month of WINDOW) {
    let rest = MONTH_SPENT;
    for (const [categoryId, amount] of Object.entries(window)) {
      rows.push(b.expense(`${month}-10`, categoryId, amount));
      rest -= amount;
    }
    rows.push(b.expense(`${month}-11`, 'other', rest));
  }
  for (const [categoryId, amount] of Object.entries(september)) {
    rows.push(b.expense('2026-09-10', categoryId, amount));
  }
  return rows;
}

const about = (categoryId: string, rows: Transaction[]) =>
  vsTypical(ledgerOf(rows, TODAY), '2026-09').filter((o) => o.categoryId === categoryId);

describe('a категорія of a finished month against its типова сума', () => {
  it('Scenario: Groceries well above typical', () => {
    expect(about('food', history({ food: 1000000 }, { food: 1380000 }))).toEqual([
      {
        kind: 'category-vs-typical',
        month: '2026-09',
        currency: 'UAH',
        key: 'category-vs-typical:UAH:food:2026-09',
        categoryId: 'food',
        amount: money(1380000, 'UAH'),
        typical: money(1000000, 'UAH'),
        changePercent: 38,
      },
    ]);
  });

  it('Scenario: A категорія well below typical', () => {
    const [stated] = about('travel', history({ travel: 800000 }, { travel: 400000 }));
    expect(stated).toMatchObject({ amount: money(400000, 'UAH'), typical: money(800000, 'UAH'), changePercent: -50 });
  });

  it('Scenario: A категорія absent this month is stated as all of it less', () => {
    // The fact is stated: no Оренда in September against its типова сума. That it is said as an
    // absence, with no percentage, is the sentence's work (src/ui/observations.test.ts).
    const [stated] = about('rent', history({ rent: 1500000 }, { food: 100000 }));
    expect(stated).toMatchObject({ kind: 'category-vs-typical', amount: money(0, 'UAH'), typical: money(1500000, 'UAH') });
  });

  it('Scenario: A large percentage of a small сума is not noticeable', () => {
    expect(about('coffee', history({ coffee: 30000 }, { coffee: 60000 }))).toEqual([]);
  });

  it('Scenario: A сума inside the band is not stated', () => {
    expect(about('food', history({ food: 1000000 }, { food: 1200000 }))).toEqual([]);
  });

  it('Scenario: Коригування are never the subject', () => {
    const b = ledgerBuilder();
    const quiet = [...history({}, { food: 100000 }), b.correction('2026-09-30', -900000)];
    const ledger = ledgerOf(quiet, TODAY);
    expect(vsTypical(ledger, '2026-09').map((o) => o.categoryId)).not.toContain(CORRECTION_CATEGORY_ID);
    // Those коригування still count in September's витрачено as they always do.
    expect(ledger.spent('2026-09', 'UAH')).toEqual(money(1000000, 'UAH'));

    // Even where the window gives them a типова сума, neither they nor «Без категорії» are named.
    const loud = history({ [UNCATEGORISED_CATEGORY_ID]: 300000 }, { [UNCATEGORISED_CATEGORY_ID]: 1500000 });
    for (const month of WINDOW) loud.push(b.correction(`${month}-28`, -300000));
    loud.push(b.correction('2026-09-28', -2000000));
    expect(vsTypical(ledgerOf(loud, TODAY), '2026-09').map((o) => o.categoryId)).toEqual(['other']);
  });

  it('says nothing in a currency the month does not touch, nor with too little history', () => {
    const b = ledgerBuilder();
    const rows = [
      ...history({ food: 1000000 }, { food: 1380000 }),
      ...WINDOW.map((month) => b.expense(`${month}-03`, 'food', 9000, { currency: 'USD', accountId: 'usd' })),
    ];
    expect(new Set(vsTypical(ledgerOf(rows, TODAY), '2026-09').map((o) => o.currency))).toEqual(
      new Set(['UAH']),
    );
    expect(vsTypical(ledgerOf(rows.filter((t) => t.date >= '2026-07'), TODAY), '2026-09')).toEqual([]);
  });
});
