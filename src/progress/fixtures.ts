import type { AccountKind } from '../domain/account';
import type { IsoDate, Month } from '../domain/transaction';
import { monthAfter, type MonthRow, type ProgressSummary } from './summary';

/**
 * A generated history the size and shape of the owner's real one, and **carrying nothing
 * personal**: no назва, no опис, no сума from any real export, and no категорія at all — a
 * зведення прогресу holds none of those by construction, which is exactly why the engine can be
 * exercised against a two-year history without a byte of the owner's money in the repository.
 *
 * Test-only, like `src/db/test-db.ts`: it is imported by tests and by nothing under `src/app/`, so
 * Metro never pulls it into the bundle. `progress-screen.test.ts` holds that as an assertion.
 *
 * The numbers below are chosen to reproduce the *shape* the achievements spec's existing-user
 * scenario names — 2459 транзакції across 23 активні місяці from 2024-10 to 2026-09, a run of
 * чисті місяці, a резерв and інвестиційні рахунки in three currencies — and nothing else.
 */

/** The first and last місяць of the generated history, and the місяць it deliberately skips. */
export const FIRST_MONTH: Month = '2024-10';
export const LAST_MONTH: Month = '2026-09';
/** One місяць with no транзакція at all, so «активні місяці need not be consecutive» is exercised. */
export const SKIPPED_MONTH: Month = '2025-07';
export const TOTAL_TRANSACTIONS = 2459;
/** The consecutive чисті місяці at the end of the history. */
export const CLEAN_RUN: readonly Month[] = [
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
];

/** Every calendar місяць of the span, oldest first. */
function span(): Month[] {
  const months: Month[] = [];
  for (let month = FIRST_MONTH; month <= LAST_MONTH; month = monthAfter(month)) {
    months.push(month);
  }
  return months;
}

/** The активні місяці: the span minus the one that holds nothing. */
export function activeMonthsOfFixture(): Month[] {
  return span().filter((month) => month !== SKIPPED_MONTH);
}

/**
 * How many транзакції each активний місяць holds — evenly, with the remainder on the earliest
 * місяці, so the total is exactly `TOTAL_TRANSACTIONS` and the distribution is the same on every
 * run. A test that has to know where the 500th транзакція falls needs it to be somewhere fixed.
 */
export function countsByMonth(): Map<Month, number> {
  const months = activeMonthsOfFixture();
  const base = Math.floor(TOTAL_TRANSACTIONS / months.length);
  const remainder = TOTAL_TRANSACTIONS - base * months.length;
  return new Map(months.map((month, index) => [month, base + (index < remainder ? 1 : 0)]));
}

/**
 * The дата of the Nth транзакція of the generated history — дата then stored order, exactly as
 * `progress-repo.nthTransactionDate` reads it. Within a місяць the транзакції are spread over its
 * first 28 days, so no month length can make a date invalid.
 */
export function nthTransactionDateOfFixture(n: number): IsoDate | undefined {
  if (n < 1 || n > TOTAL_TRANSACTIONS) {
    return undefined;
  }
  let left = n;
  for (const [month, count] of countsByMonth()) {
    if (left <= count) {
      const day = String(Math.min(28, Math.floor((left - 1) / 4) + 1)).padStart(2, '0');
      return `${month}-${day}`;
    }
    left -= count;
  }
  return undefined;
}

/** The дата of the earliest переказ onto a рахунок of a вид, in the generated history. */
export function firstTransferOntoKindOfFixture(kind: AccountKind): IsoDate | undefined {
  switch (kind) {
    case 'savings':
      return '2024-11-08';
    case 'investment':
      return '2025-02-12';
    default:
      return undefined;
  }
}

/**
 * Витрачено of a місяць, in kopiykas: a steady figure that wanders a little, so the median of the
 * last six is a real median of six different numbers rather than one number repeated.
 */
function spentOf(month: Month, index: number): number {
  return 2_800_000 + ((index * 137) % 9) * 50_000 + (month === '2025-12' ? 2_000_000 : 0);
}

/**
 * The зведення прогресу of a device holding that history.
 *
 * Every місяць carries UAH; a handful also carry USD and EUR, because the owner's history does and
 * because «two currencies are two досягнення» has to be exercised against a зведення that really
 * holds two.
 */
export function ownerShapedSummary(): ProgressSummary {
  const counts = countsByMonth();
  const active = activeMonthsOfFixture();
  const months: MonthRow[] = [];

  active.forEach((month, index) => {
    const clean = CLEAN_RUN.includes(month);
    months.push({
      month,
      currency: 'UAH',
      spent: spentOf(month, index),
      income: 4_500_000,
      // Something reaches інвестиції in most місяці, and nothing at all in the earliest three.
      invested: index >= 3 ? 300_000 : 0,
      saved: index >= 1 ? 200_000 : 0,
      transactions: counts.get(month)!,
      // Before the clean run the record still had unanswered rows in it.
      uncategorised: clean ? 0 : index % 3 === 0 ? 2 : 0,
      unsourced: clean ? 0 : index % 7 === 0 ? 1 : 0,
    });
    if (index % 4 === 0) {
      months.push({
        month,
        currency: 'USD',
        spent: 12_000,
        income: 0,
        invested: 20_000,
        saved: 0,
        transactions: 2,
        uncategorised: 0,
        unsourced: 0,
      });
    }
    if (index % 6 === 0) {
      months.push({
        month,
        currency: 'EUR',
        spent: 0,
        income: 0,
        invested: 15_000,
        saved: 0,
        transactions: 1,
        uncategorised: 0,
        unsourced: 0,
      });
    }
  });

  const balance = (kind: AccountKind, currency: string, amount: number) => ({
    kind,
    currency,
    balance: amount,
  });

  return {
    months,
    balances: [
      balance('spending', 'UAH', 1_850_000),
      // A резерв of rather more than one місяць of витрати, in two currencies.
      balance('savings', 'UAH', 4_200_000),
      balance('savings', 'USD', 60_000),
      // Over 100 000 UAH of розрахунковий баланс on the UAH інвестиційні рахунки.
      balance('investment', 'UAH', 12_400_000),
      balance('investment', 'USD', 180_000),
      balance('investment', 'EUR', 90_000),
    ],
    limitedCategories: [],
    history: {
      count: TOTAL_TRANSACTIONS,
      earliest: nthTransactionDateOfFixture(1)!,
      latest: nthTransactionDateOfFixture(TOTAL_TRANSACTIONS)!,
    },
    drafts: [],
  };
}
