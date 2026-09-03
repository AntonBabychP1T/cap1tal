import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { Month } from '../domain/transaction';
import { completedMonthsIn, proposeNorm } from './norm';
import type { MonthRow, ProgressSummary } from './summary';

const TODAY = '2026-09-02';

function monthRow(month: Month, spent: number, over: Partial<MonthRow> = {}): MonthRow {
  return {
    month,
    currency: 'UAH',
    spent,
    income: 0,
    invested: 0,
    saved: 0,
    transactions: 1,
    uncategorised: 0,
    unsourced: 0,
    ...over,
  };
}

function summary(months: MonthRow[]): ProgressSummary {
  return {
    months,
    accounts: [],
    balances: [],
    limitedCategories: [],
    history: { count: 0 },
    drafts: [],
  };
}

describe('the проposal', () => {
  it('Scenario: The proposal is the median of six місяці', () => {
    const six = summary([
      monthRow('2026-02', 2_800_000),
      monthRow('2026-03', 3_100_000),
      monthRow('2026-04', 2_900_000),
      monthRow('2026-05', 4_900_000),
      monthRow('2026-06', 3_000_000),
      monthRow('2026-07', 3_200_000),
    ]);

    const proposal = proposeNorm(six, 'UAH', TODAY);

    expect(proposal?.amount).toEqual({ amount: 3_050_000, currency: 'UAH' });
    expect(proposal?.months).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
  });

  it('reads the last six, not the first six', () => {
    const eight = summary([
      monthRow('2025-12', 100),
      monthRow('2026-01', 100),
      monthRow('2026-02', 2_800_000),
      monthRow('2026-03', 3_100_000),
      monthRow('2026-04', 2_900_000),
      monthRow('2026-05', 4_900_000),
      monthRow('2026-06', 3_000_000),
      monthRow('2026-07', 3_200_000),
    ]);

    expect(proposeNorm(eight, 'UAH', TODAY)?.amount).toEqual({
      amount: 3_050_000,
      currency: 'UAH',
    });
  });

  it('never reads the current місяць, which is not завершений', () => {
    const running = summary([
      monthRow('2026-03', 3_000_000),
      monthRow('2026-04', 3_000_000),
      monthRow('2026-05', 3_000_000),
      monthRow('2026-06', 3_000_000),
      monthRow('2026-07', 3_000_000),
      monthRow('2026-08', 3_000_000),
      // September is half over and would drag the median down if it counted.
      monthRow('2026-09', 200_000),
    ]);

    expect(completedMonthsIn(running, 'UAH', TODAY)).not.toContain('2026-09');
    expect(proposeNorm(running, 'UAH', TODAY)?.amount).toEqual({
      amount: 3_000_000,
      currency: 'UAH',
    });
  });

  it('Scenario: Too little history offers no proposal', () => {
    const three = summary([
      monthRow('2026-05', 40_000, { currency: 'USD' }),
      monthRow('2026-06', 50_000, { currency: 'USD' }),
      monthRow('2026-07', 45_000, { currency: 'USD' }),
    ]);

    expect(proposeNorm(three, 'USD', TODAY)).toBeUndefined();
  });

  it('Scenario: A median of nothing is no proposal', () => {
    const onlyIncome = summary(
      ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map((month) =>
        monthRow(month, 0, { currency: 'USD', income: 100_000 }),
      ),
    );

    expect(completedMonthsIn(onlyIncome, 'USD', TODAY)).toHaveLength(6);
    expect(proposeNorm(onlyIncome, 'USD', TODAY)).toBeUndefined();
  });

  it('a місяць that held only a дохід is still one of the six, at витрачено of zero', () => {
    const mixed = summary([
      monthRow('2026-02', 3_000_000),
      monthRow('2026-03', 3_000_000),
      monthRow('2026-04', 3_000_000),
      monthRow('2026-05', 3_000_000),
      monthRow('2026-06', 0, { income: 900_000 }),
      monthRow('2026-07', 0, { income: 900_000 }),
    ]);

    expect(completedMonthsIn(mixed, 'UAH', TODAY)).toHaveLength(6);
    // Sorted: 0, 0, 3M, 3M, 3M, 3M — the two middle ones are 3M and 3M.
    expect(proposeNorm(mixed, 'UAH', TODAY)?.amount).toEqual({
      amount: 3_000_000,
      currency: 'UAH',
    });
  });

  it('rounds a half minor unit away from zero, and stays an integer', () => {
    const odd = summary([
      monthRow('2026-02', 1),
      monthRow('2026-03', 1),
      monthRow('2026-04', 100),
      monthRow('2026-05', 101),
      monthRow('2026-06', 900),
      monthRow('2026-07', 900),
    ]);

    // The two middle values are 100 and 101; their mean is 100.5.
    expect(proposeNorm(odd, 'UAH', TODAY)?.amount).toEqual({ amount: 101, currency: 'UAH' });
  });

  it('keeps the currencies apart: a UAH history proposes nothing for USD', () => {
    const uah = summary([
      monthRow('2026-02', 3_000_000),
      monthRow('2026-03', 3_000_000),
      monthRow('2026-04', 3_000_000),
      monthRow('2026-05', 3_000_000),
      monthRow('2026-06', 3_000_000),
      monthRow('2026-07', 3_000_000),
    ]);

    expect(proposeNorm(uah, 'USD', TODAY)).toBeUndefined();
  });

  it('Scenario: A норма is never guessed from category names', () => {
    // Proved by the module's own shape: it takes no категорія and imports nothing that has one.
    // A норма that could move because the owner renamed «Продукти» would be a number about a word.
    // Comments are stripped first — the prose explains the rule, the code is what has to keep it.
    const code = readFileSync(new URL('./norm.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(code).not.toMatch(/categor/i);
    expect(code).not.toMatch(/категорі/);
    expect(code).not.toMatch(/limitedCategories/);
    // Its three arguments are the зведення, a currency code and the day — no vocabulary among them.
    expect(proposeNorm.length).toBe(3);
  });
});
