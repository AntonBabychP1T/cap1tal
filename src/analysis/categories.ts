import type { Category } from '../domain/category';
import { overLimitBy, type CategoryLimit } from '../domain/limits';
import { money, type CurrencyCode, type Money } from '../domain/money';
import { categoryBreakdown } from '../domain/monthly-picture';
import type { Month, Transaction } from '../domain/transaction';
import { prevMonth } from '../ui/months';
import { averageMinor, bp, changeBp, decimalOf, type Amount, type BasisPoints } from './decimal';
import { baselineWindow, byMonth, monthsHoldingCurrency } from './monthly';
import { monthsOfPeriod, type AnalysisPeriod } from './period';

/**
 * What the пакет says about each категорія of a period, in one currency: how much, what share of
 * витрачено, how each month went, how it moved against the month before and against the months
 * before the period, and whether it went over its ліміт.
 *
 * Every сума here is `categoryBreakdown`'s — the same fold the Місяць screen shows — so the
 * категорії of a currency sum exactly to that currency's витрачено, and the пакет is a breakdown
 * rather than a second opinion. What this module adds is the shares, the changes and the ліміт's
 * verdict.
 *
 * A категорія is named by the owner's own назва and never by an identifier: the id is the thing
 * the spec forbids the пакет to carry, and a name is what an assistant can say back to the owner.
 */

/**
 * The two months every month-to-month comparison in the пакет is made between, so the category
 * table and the trends can never anchor differently.
 *
 * The anchor is the latest month of the period that is *finished*: comparing a month that is three
 * days old against a whole month would call the difference a fall in spending. Only when the period
 * holds no finished month — «Цей місяць» — is the partial one the anchor, and then the comparison
 * says so, because three days against a month is worth showing as long as it is labelled.
 */
export interface Anchor {
  readonly from: Month;
  readonly to: Month;
  readonly partial: boolean;
}

export function anchorOf(period: AnalysisPeriod): Anchor {
  const months = monthsOfPeriod(period);
  const partialMonth = period.partialMonth?.month;
  const finished = months.filter((month) => month !== partialMonth);
  const to = finished.length > 0 ? finished[finished.length - 1]! : months[months.length - 1]!;
  return { from: prevMonth(to), to, partial: to === partialMonth };
}

export interface CategoryReport {
  /** The owner's назва; never an id. */
  readonly name: string;
  readonly archived: boolean;
  readonly total: Amount;
  /** Of the period's витрачено in this currency. */
  readonly share: BasisPoints | null;
  /** Every month of the period, zeros kept; the month still running is marked, as the series is. */
  readonly byMonth: readonly {
    readonly month: Month;
    readonly amount: Amount;
    readonly partial: boolean;
  }[];
  /** The anchor against the month before it, both named; `change` null when that month held none. */
  readonly changeVsPreviousMonth: Anchor & { readonly change: BasisPoints | null };
  /** Averaged over the same months the currency's own baseline stands on. */
  readonly baselineAverage: Amount | null;
  readonly changeVsBaseline: BasisPoints | null;
  readonly limit: {
    readonly amount: Amount;
    readonly exceeded: readonly { readonly month: Month; readonly by: Amount }[];
  } | null;
}

/**
 * The назва of a категорія whose row is gone. Not the id — that is precisely what the пакет may
 * never carry, and «the category `a3f2-…` grew by 40 %» is a sentence an assistant would then
 * repeat back to the owner. It is a defensive branch: the app archives категорії and never deletes
 * them, so a транзакція always has its row.
 */
const UNNAMED = 'Без назви';

export function categoryReports(input: {
  readonly period: AnalysisPeriod;
  readonly currency: CurrencyCode;
  readonly transactions: readonly Transaction[];
  readonly categories: readonly Category[];
  readonly limits: readonly CategoryLimit[];
  /** The period's витрачено in this currency — the base of every share. */
  readonly periodSpent: Money;
}): CategoryReport[] {
  const { period, currency } = input;
  const months = monthsOfPeriod(period);
  const anchor = anchorOf(period);
  const grouped = byMonth(input.transactions);

  const breakdownFor = (month: Month): ReadonlyMap<string, Money> =>
    categoryBreakdown({ month, transactions: grouped.get(month) ?? [] }).get(currency) ??
    new Map<string, Money>();

  // The anchor's own previous month may lie before the period — the comparison is read from the
  // history, not from the period, so the first month of a period is not left without one.
  const readMonths = new Set<Month>([
    ...months,
    ...baselineWindow(period),
    anchor.from,
    anchor.to,
  ]);
  const breakdowns = new Map<Month, ReadonlyMap<string, Money>>();
  for (const month of readMonths) {
    breakdowns.set(month, breakdownFor(month));
  }
  const amountIn = (month: Month, categoryId: string): Money =>
    breakdowns.get(month)?.get(categoryId) ?? money(0, currency);

  // The months an average is divided by: the same ones the currency's own averages use, so a
  // категорія and its currency are never averaged over different denominators.
  const periodMonthsWithData = monthsHoldingCurrency(input.transactions, months, currency);
  const baselineMonths = monthsHoldingCurrency(
    input.transactions,
    baselineWindow(period),
    currency,
  );

  const byId = new Map(input.categories.map((category) => [category.id, category]));
  const limitFor = new Map(
    input.limits
      .filter((limit) => limit.amount.currency === currency)
      .map((limit) => [limit.categoryId, limit]),
  );

  // Every категорія that occurs in the period — reserved ones included, since «Комісія» and
  // «Без категорії» are витрати like any other and are named by their seeded rows.
  const occurring = new Set<string>();
  for (const month of months) {
    for (const categoryId of breakdowns.get(month)?.keys() ?? []) {
      occurring.add(categoryId);
    }
  }

  const reports: { readonly report: CategoryReport; readonly totalMinor: number }[] = [];
  for (const categoryId of occurring) {
    const category = byId.get(categoryId);
    const perMonth = months.map((month) => amountIn(month, categoryId));
    const total = money(
      perMonth.reduce((sum, m) => sum + m.amount, 0),
      currency,
    );

    const baselineAverage =
      baselineMonths.length === 0
        ? null
        : averageMinor(baselineMonths.map((month) => amountIn(month, categoryId)));
    const periodAverage =
      periodMonthsWithData.length === 0
        ? null
        : averageMinor(periodMonthsWithData.map((month) => amountIn(month, categoryId)));

    const limit = limitFor.get(categoryId);

    reports.push({
      totalMinor: total.amount,
      report: {
      name: category?.name ?? UNNAMED,
      archived: category?.archived ?? false,
      total: decimalOf(total),
      share: bp(total, input.periodSpent),
      byMonth: months.map((month, index) => ({
        month,
        amount: decimalOf(perMonth[index]!),
        // Marked here as well as on the `MonthReport`: a reader looking at one категорія's months
        // must not have to cross-reference the series to learn that the last one is three days old.
        partial: period.partialMonth?.month === month,
      })),
      changeVsPreviousMonth: {
        ...anchor,
        change: changeBp(amountIn(anchor.from, categoryId), amountIn(anchor.to, categoryId)),
      },
      baselineAverage: baselineAverage ? decimalOf(baselineAverage) : null,
      changeVsBaseline:
        baselineAverage && periodAverage ? changeBp(baselineAverage, periodAverage) : null,
      limit: limit
        ? {
            amount: decimalOf(limit.amount),
            // Judged month by month in the ліміт's own currency: a ліміт is monthly, and spending
            // in any other currency neither counts toward it nor is converted toward it.
            exceeded: months.flatMap((month) => {
              const by = overLimitBy(amountIn(month, categoryId), limit.amount);
              return by ? [{ month, by: decimalOf(by) }] : [];
            }),
          }
        : null,
      },
    });
  }

  // Largest first, then by назва: two категорії of the same сума would otherwise be ordered by the
  // order their rows were read in, and the same stored state must build the same пакет. The name
  // tie-break compares code units and never `localeCompare` — an `Intl` collation would let Node
  // under `verify` and Hermes on the phone sort the same пакет two ways.
  return reports
    .sort((a, b) =>
      b.totalMinor !== a.totalMinor
        ? b.totalMinor - a.totalMinor
        : a.report.name < b.report.name
          ? -1
          : a.report.name > b.report.name
            ? 1
            : 0,
    )
    .map((entry) => entry.report);
}
