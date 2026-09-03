import { describe, expect, it } from 'vitest';

import type { AccountKind } from '../domain/account';
import type { Month } from '../domain/transaction';
import {
  activeMonths,
  cleanMonths,
  cleanRunCompletedAt,
  completedMonths,
  currenciesOf,
  historySpanMonths,
  investedCapital,
  investmentMonths,
  isCompleted,
  limitedCategorySpend,
  longestCleanRun,
  monthAfter,
  monthEnd,
  reserve,
  spentIn,
  unansweredIn,
  waitingDraftsIn,
  type MonthRow,
  type ProgressSummary,
} from './summary';

function monthRow(month: Month, over: Partial<MonthRow> = {}): MonthRow {
  return {
    month,
    currency: 'UAH',
    spent: 0,
    income: 0,
    invested: 0,
    saved: 0,
    transactions: 1,
    uncategorised: 0,
    unsourced: 0,
    ...over,
  };
}

function summary(over: Partial<ProgressSummary> = {}): ProgressSummary {
  return {
    months: [],
    balances: [],
    limitedCategories: [],
    history: { count: 0 },
    drafts: [],
    ...over,
  };
}

function balance(kind: AccountKind, currency: string, amount: number) {
  return { kind, currency, balance: amount };
}

describe('the calendar', () => {
  it('steps to the next місяць across a year boundary', () => {
    expect(monthAfter('2025-11')).toBe('2025-12');
    expect(monthAfter('2025-12')).toBe('2026-01');
  });

  it('ends a місяць on its own last day, leap year included', () => {
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthEnd('2026-04')).toBe('2026-04-30');
    expect(monthEnd('2026-12')).toBe('2026-12-31');
  });
});

describe('активний, завершений, чистий', () => {
  it('Scenario: An imported місяць is активний', () => {
    const imported = summary({ months: [monthRow('2024-11', { transactions: 42, spent: 800000 })] });

    expect(activeMonths(imported)).toEqual(['2024-11']);
  });

  it('Scenario: The current місяць is not завершений', () => {
    const now = summary({ months: [monthRow('2026-09', { transactions: 3 })] });

    expect(activeMonths(now)).toEqual(['2026-09']);
    expect(isCompleted('2026-09', '2026-09-02')).toBe(false);
    expect(completedMonths(now, '2026-09-02')).toEqual([]);
    expect(cleanMonths(now, '2026-09-02')).toEqual([]);
  });

  it('the last day of a місяць is not yet behind today', () => {
    // Завершений means the last day is *before* today: on the 30th of September, September is
    // still running.
    expect(isCompleted('2026-09', '2026-09-30')).toBe(false);
    expect(isCompleted('2026-09', '2026-10-01')).toBe(true);
  });

  it('Scenario: A місяць with no транзакція is not чистий', () => {
    const gapped = summary({
      months: [monthRow('2025-06'), monthRow('2025-08')],
    });

    expect(activeMonths(gapped)).toEqual(['2025-06', '2025-08']);
    expect(cleanMonths(gapped, '2026-09-02')).toEqual(['2025-06', '2025-08']);
    expect(cleanMonths(gapped, '2026-09-02')).not.toContain('2025-07');
  });

  it('Scenario: One «Без категорії» is enough to spoil a місяць', () => {
    const spoiled = summary({
      months: [monthRow('2026-05', { transactions: 180, uncategorised: 1 })],
    });

    expect(cleanMonths(spoiled, '2026-09-02')).toEqual([]);
  });

  it('one «Без джерела» spoils it the same way', () => {
    const spoiled = summary({
      months: [monthRow('2026-05', { transactions: 180, unsourced: 1 })],
    });

    expect(cleanMonths(spoiled, '2026-09-02')).toEqual([]);
  });

  it('a «Без категорії» in another currency still spoils the місяць', () => {
    const spoiled = summary({
      months: [
        monthRow('2026-05', { transactions: 100 }),
        monthRow('2026-05', { currency: 'USD', transactions: 1, uncategorised: 1 }),
      ],
    });

    expect(cleanMonths(spoiled, '2026-09-02')).toEqual([]);
  });

  it('Scenario: Активні місяці need not be consecutive', () => {
    const six = summary({
      months: [
        monthRow('2025-01'),
        monthRow('2025-02'),
        monthRow('2025-03'),
        // 2025-04 and 2025-05 hold nothing.
        monthRow('2025-06'),
        monthRow('2025-07'),
        monthRow('2025-08'),
      ],
    });

    expect(activeMonths(six)).toHaveLength(6);
    expect(completedMonths(six, '2026-09-02')).toHaveLength(6);
  });
});

describe('runs of чисті місяці', () => {
  it('Scenario: An empty місяць breaks the run', () => {
    const broken = summary({
      months: [
        monthRow('2026-03'),
        monthRow('2026-04'),
        // 2026-05 holds no транзакція at all.
        monthRow('2026-06'),
        monthRow('2026-07'),
      ],
    });

    expect(longestCleanRun(broken, '2026-09-02')).toBe(2);
    expect(cleanRunCompletedAt(broken, '2026-09-02', 3)).toBeUndefined();
  });

  it('three consecutive чисті місяці make a run of three, dated at the third', () => {
    const run = summary({
      months: [monthRow('2026-04'), monthRow('2026-05'), monthRow('2026-06')],
    });

    expect(longestCleanRun(run, '2026-09-02')).toBe(3);
    expect(cleanRunCompletedAt(run, '2026-09-02', 3)).toBe('2026-06');
    expect(monthEnd(cleanRunCompletedAt(run, '2026-09-02', 3)!)).toBe('2026-06-30');
  });

  it('a spoiled місяць breaks the run as an empty one does', () => {
    const broken = summary({
      months: [
        monthRow('2026-03'),
        monthRow('2026-04', { uncategorised: 1 }),
        monthRow('2026-05'),
        monthRow('2026-06'),
      ],
    });

    expect(longestCleanRun(broken, '2026-09-02')).toBe(2);
  });
});

describe('what a місяць still leaves unanswered', () => {
  it('counts the чернетки still waiting in that місяць, and none of another', () => {
    const waiting = summary({
      months: [monthRow('2026-05', { transactions: 40 })],
      drafts: [
        { month: '2026-05', waiting: 2 },
        { month: '2026-06', waiting: 1 },
      ],
    });

    expect(waitingDraftsIn(waiting, '2026-05')).toBe(2);
    expect(waitingDraftsIn(waiting, '2026-07')).toBe(0);
  });

  it('counts the «Без категорії» and «Без джерела» of a місяць across its currencies', () => {
    const open = summary({
      months: [
        monthRow('2026-05', { transactions: 40, uncategorised: 2, unsourced: 1 }),
        monthRow('2026-05', { currency: 'USD', transactions: 3, uncategorised: 1 }),
      ],
    });

    expect(unansweredIn(open, '2026-05')).toBe(4);
    expect(unansweredIn(open, '2026-06')).toBe(0);
  });
});

describe('the span of the history', () => {
  it('Scenario: A gapped year still spans a year', () => {
    const gapped = summary({
      months: [monthRow('2024-10'), monthRow('2025-11')],
      history: { count: 300, earliest: '2024-10-05', latest: '2025-11-02' },
    });

    expect(historySpanMonths(gapped)).toBe(12);
    expect(activeMonths(gapped).length).toBeLessThan(12);
  });

  it('eleven months and most of a twelfth is not a year', () => {
    const nearly = summary({ history: { count: 10, earliest: '2024-10-05', latest: '2025-10-04' } });

    expect(historySpanMonths(nearly)).toBe(11);
  });

  it('an empty history spans nothing', () => {
    expect(historySpanMonths(summary())).toBe(0);
  });
});

describe('the totals of a вид рахунку', () => {
  it('Scenario: A вид рахунку’s total keeps its currencies apart', () => {
    const kept = summary({
      balances: [balance('savings', 'UAH', 4000000), balance('savings', 'USD', 50000)],
    });

    expect(reserve(kept, 'UAH')).toEqual({ amount: 4000000, currency: 'UAH' });
    expect(reserve(kept, 'USD')).toEqual({ amount: 50000, currency: 'USD' });
    // Nothing anywhere holds their sum.
    expect(kept.balances.map((row) => row.balance)).toEqual([4000000, 50000]);
  });

  it('a currency the owner keeps no резерв in reads as zero of that currency, not as nothing', () => {
    const kept = summary({ balances: [balance('savings', 'UAH', 4000000)] });

    expect(reserve(kept, 'EUR')).toEqual({ amount: 0, currency: 'EUR' });
  });

  it('інвестиційний капітал reads the investment вид and never the savings one', () => {
    const both = summary({
      balances: [balance('savings', 'UAH', 4000000), balance('investment', 'UAH', 12000000)],
    });

    expect(investedCapital(both, 'UAH')).toEqual({ amount: 12000000, currency: 'UAH' });
    expect(reserve(both, 'UAH')).toEqual({ amount: 4000000, currency: 'UAH' });
  });
});

describe('the місяці that hold an інвестиція', () => {
  it('counts a місяць once however many currencies it holds, and sums none of them', () => {
    const contributed = summary({
      months: [
        monthRow('2026-01', { invested: 500000 }),
        monthRow('2026-01', { currency: 'USD', invested: 10000 }),
        monthRow('2026-02', { currency: 'USD', invested: 10000 }),
        monthRow('2026-03', { invested: 0 }),
      ],
    });

    expect(investmentMonths(contributed)).toEqual(['2026-01', '2026-02']);
  });

  it('a місяць whose інвестовано went negative is not a місяць of contribution', () => {
    const withdrawn = summary({ months: [monthRow('2026-01', { invested: -500000 })] });

    expect(investmentMonths(withdrawn)).toEqual([]);
  });
});

describe('the категорії that carry a ліміт', () => {
  it('reads one категорія of one місяць in one currency', () => {
    const limited = summary({
      limitedCategories: [
        { month: '2026-05', currency: 'UAH', categoryId: 'food', spent: 850000 },
        { month: '2026-05', currency: 'USD', categoryId: 'food', spent: 4000 },
      ],
    });

    expect(limitedCategorySpend(limited, '2026-05', 'UAH', 'food')).toEqual({
      amount: 850000,
      currency: 'UAH',
    });
    expect(limitedCategorySpend(limited, '2026-05', 'USD', 'food')).toEqual({
      amount: 4000,
      currency: 'USD',
    });
  });

  it('a категорія that moved nothing that місяць is zero of that currency, not absent', () => {
    expect(limitedCategorySpend(summary(), '2026-05', 'UAH', 'food')).toEqual({
      amount: 0,
      currency: 'UAH',
    });
  });
});

describe('reading one number out', () => {
  it('names every currency the зведення knows, sorted', () => {
    const many = summary({
      months: [monthRow('2026-01', { currency: 'USD' }), monthRow('2026-01')],
      balances: [balance('savings', 'EUR', 1)],
    });

    expect(currenciesOf(many)).toEqual(['EUR', 'UAH', 'USD']);
  });

  it('reads витрачено of one місяць in one currency, and zero of it where nothing moved', () => {
    const spent = summary({ months: [monthRow('2026-01', { spent: 2800000 })] });

    expect(spentIn(spent, '2026-01', 'UAH')).toEqual({ amount: 2800000, currency: 'UAH' });
    expect(spentIn(spent, '2026-02', 'UAH')).toEqual({ amount: 0, currency: 'UAH' });
  });
});
