import type { Account } from '../domain/account';
import { money, type CurrencyCode, type Money } from '../domain/money';
import { monthlyPicture, type MonthlyNumbers } from '../domain/monthly-picture';
import { monthOf, type Month, type Transaction } from '../domain/transaction';
import { byCurrency } from '../ui/amount-input';
import { prevMonth } from '../ui/months';
import { averageMinor, bp, changeBp, decimalOf, type Amount, type BasisPoints } from './decimal';
import { monthsOfPeriod, type AnalysisPeriod } from './period';

/**
 * The six numbers of every month of the period, per currency, and what the пакет says about them:
 * the change against the month before, the two rates, the period's totals and averages, and the
 * baseline the period is judged against.
 *
 * Nothing here computes money a second way. Every month's six numbers are `monthlyPicture`'s own —
 * the same function the Місяць screen shows — so «a month equals its monthly picture» holds by
 * construction and not by agreement. What this module adds is arithmetic *about* those answers:
 * sums, means and ratios, which are statistics and not money truth (design D1).
 */

/** The six numbers of the monthly picture, as the пакет writes them. */
export interface SixNumbers {
  readonly spent: Amount;
  readonly income: Amount;
  readonly invested: Amount;
  readonly saved: Amount;
  readonly lent: Amount;
  readonly left: Amount;
}

/** The same six as changes in basis points; `null` where the base was zero. */
export type SixChanges = { readonly [K in keyof SixNumbers]: BasisPoints | null };

export interface MonthReport extends SixNumbers {
  readonly month: Month;
  readonly partial: boolean;
  /**
   * Against the calendar month before this one, which may lie before the period — the пакет reads
   * it from the history so the first month of a period is not left without a comparison. `null`
   * when that month holds nothing of this currency at all; `null` per field when its own base is
   * zero. The month itself is not in the series: it is context, not a month of the period.
   */
  readonly changeVsPreviousMonth: SixChanges | null;
  readonly savingsRate: BasisPoints | null;
  readonly investmentRate: BasisPoints | null;
}

export interface PeriodTotals extends SixNumbers {
  /** Over the months of the period in which this currency moved — never over empty months. */
  readonly averagePerMonth: SixNumbers;
  readonly savingsRate: BasisPoints | null;
  readonly investmentRate: BasisPoints | null;
}

export interface Baseline {
  readonly monthsBefore: number;
  readonly averagePerMonth: SixNumbers;
}

/** The six as `Money`, before they are written down — what the arithmetic below works in. */
export type SixMoney = { readonly [K in keyof SixNumbers]: Money };

/** What this module answers for one currency; `package.ts` folds the categories and trends in. */
export interface MonthlyReports {
  readonly currency: CurrencyCode;
  readonly months: readonly MonthReport[];
  readonly period: PeriodTotals;
  readonly baseline: Baseline | null;
  /**
   * The period's totals still as `Money` — the base a категорія's share is taken of, and what
   * `approximatePicture` needs to cross the currencies once. Not part of the пакет: `package.ts`
   * names the fields it copies, and these are the same numbers `period` already writes down.
   */
  readonly totals: SixMoney;
}

/**
 * How far back a baseline may reach: the twelve calendar months before the period. A year is what
 * makes «більше, ніж зазвичай» mean anything — it covers the seasons the owner lives through once
 * — and a window rather than «the last twelve months that had anything in them» keeps the baseline
 * about a recent normal, not about a year the owner spent differently three years ago.
 */
export const BASELINE_MONTHS = 12;

/**
 * The транзакції of each month. `reports.ts` has the same three lines privately and does not export
 * them (design D3); copying them is cheaper than widening the domain's surface for a statistic.
 */
export function byMonth(transactions: readonly Transaction[]): Map<Month, Transaction[]> {
  const grouped = new Map<Month, Transaction[]>();
  for (const t of transactions) {
    const month = monthOf(t.date);
    const bucket = grouped.get(month);
    if (bucket) {
      bucket.push(t);
    } else {
      grouped.set(month, [t]);
    }
  }
  return grouped;
}

/**
 * Every currency a сума of these транзакції carries — both legs of a переказ included, so a
 * currency that only ever arrived in one still gets its own report rather than vanishing into the
 * currency it was sent from.
 *
 * The сума в оригінальній валюті of a foreign purchase from a hryvnia картка is deliberately not
 * read: the витрата is the UAH the bank charged, and the original figure is information about it
 * (glossary, "Original-currency amount"). Reading it here would open a USD report for a month in
 * which no dollar moved.
 *
 * UAH first, then alphabetical — `byCurrency`, the one order every screen already uses.
 */
export function currenciesOf(transactions: readonly Transaction[]): CurrencyCode[] {
  const currencies = new Set<CurrencyCode>();
  for (const t of transactions) {
    if (t.type === 'transfer') {
      currencies.add(t.left.currency);
      currencies.add(t.arrived.currency);
    } else {
      currencies.add(t.amount.currency);
    }
  }
  return [...currencies].sort(byCurrency);
}

/** Whether a сума of this currency moved at all in these транзакції — what «a month with data» is. */
function holdsCurrency(transactions: readonly Transaction[], currency: CurrencyCode): boolean {
  return currenciesOf(transactions).includes(currency);
}

/**
 * Which of these months a сума of this currency moved in — the months an average is divided by.
 *
 * Shared with `categories.ts` so a категорія's average per month and its currency's average per
 * month stand on the very same months: two averages over two different denominators, compared as
 * if they were one, is how a пакет would quietly lie.
 */
export function monthsHoldingCurrency(
  transactions: readonly Transaction[],
  months: readonly Month[],
  currency: CurrencyCode,
): Month[] {
  const grouped = byMonth(transactions);
  return months.filter((month) => holdsCurrency(grouped.get(month) ?? [], currency));
}

/**
 * The twelve calendar months immediately before the period, in calendar order — the window a
 * baseline may stand on, before the months without транзакції are dropped from it. Shared with
 * `categories.ts`, which judges a категорія against the very same months.
 */
export function baselineWindow(period: AnalysisPeriod): Month[] {
  const months: Month[] = [];
  for (let month = period.from, step = 0; step < BASELINE_MONTHS; step += 1) {
    month = prevMonth(month);
    months.unshift(month);
  }
  return months;
}

/** The six, named once so a sum and a mean can never disagree about which fields they cover. */
type Field = keyof SixNumbers;

function zeroes(currency: CurrencyCode): SixMoney {
  return {
    spent: money(0, currency),
    income: money(0, currency),
    invested: money(0, currency),
    saved: money(0, currency),
    lent: money(0, currency),
    left: money(0, currency),
  };
}

/** One currency's row of a month's picture, or zeros — an empty month is present, not absent. */
function sixOf(picture: ReadonlyMap<CurrencyCode, MonthlyNumbers>, currency: CurrencyCode): SixMoney {
  const numbers = picture.get(currency);
  return numbers
    ? {
        spent: numbers.spent,
        income: numbers.income,
        invested: numbers.invested,
        saved: numbers.saved,
        lent: numbers.lent,
        left: numbers.left,
      }
    : zeroes(currency);
}

function written(six: SixMoney): SixNumbers {
  return {
    spent: decimalOf(six.spent),
    income: decimalOf(six.income),
    invested: decimalOf(six.invested),
    saved: decimalOf(six.saved),
    lent: decimalOf(six.lent),
    left: decimalOf(six.left),
  };
}

/**
 * The sum of several months. `left` is computed from the other five rather than summed on its own,
 * so the identity дохід − витрачено − інвестовано − відкладено − позичено holds in the totals for
 * the same reason it holds in a month: it is the definition, not a coincidence of two sums.
 */
function totalOf(months: readonly SixMoney[], currency: CurrencyCode): SixMoney {
  const sum = (field: Field): number =>
    months.reduce((total, six) => total + six[field].amount, 0);
  const spent = sum('spent');
  const income = sum('income');
  const invested = sum('invested');
  const saved = sum('saved');
  const lent = sum('lent');
  return {
    spent: money(spent, currency),
    income: money(income, currency),
    invested: money(invested, currency),
    saved: money(saved, currency),
    lent: money(lent, currency),
    left: money(income - spent - invested - saved - lent, currency),
  };
}

function averageOf(months: readonly SixMoney[], currency: CurrencyCode): SixMoney {
  if (months.length === 0) {
    return zeroes(currency);
  }
  const mean = (field: Field): Money =>
    averageMinor(months.map((six) => six[field]));
  return {
    spent: mean('spent'),
    income: mean('income'),
    invested: mean('invested'),
    saved: mean('saved'),
    lent: mean('lent'),
    left: mean('left'),
  };
}

function changesOf(before: SixMoney, after: SixMoney): SixChanges {
  return {
    spent: changeBp(before.spent, after.spent),
    income: changeBp(before.income, after.income),
    invested: changeBp(before.invested, after.invested),
    saved: changeBp(before.saved, after.saved),
    lent: changeBp(before.lent, after.lent),
    left: changeBp(before.left, after.left),
  };
}

/**
 * Every currency of the period, with its months, its totals and its baseline.
 *
 * The pictures are computed once per month and read per currency, so a twelve-month period over
 * two currencies is twelve passes over the history and not twenty-four. The months computed reach
 * one month before the period (for the first change) and back over the baseline window; the series
 * itself carries only the months of the period.
 */
export function monthlyReports(input: {
  readonly period: AnalysisPeriod;
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
}): Map<CurrencyCode, MonthlyReports> {
  const months = monthsOfPeriod(input.period);
  const grouped = byMonth(input.transactions);

  const pictureOf = (month: Month): ReadonlyMap<CurrencyCode, MonthlyNumbers> =>
    monthlyPicture({
      month,
      accounts: input.accounts,
      transactions: grouped.get(month) ?? [],
    });

  // Every month whose numbers are read: the period, the month before it (context for the first
  // change) and the baseline window. Computed once each and reused by every currency.
  const baselineMonths = baselineWindow(input.period);
  const pictures = new Map<Month, ReadonlyMap<CurrencyCode, MonthlyNumbers>>();
  for (const month of [...baselineMonths, ...months]) {
    pictures.set(month, pictureOf(month));
  }
  const pictureFor = (month: Month): ReadonlyMap<CurrencyCode, MonthlyNumbers> =>
    pictures.get(month) ?? pictureOf(month);

  const inPeriod = months.flatMap((month) => grouped.get(month) ?? []);
  const reports = new Map<CurrencyCode, MonthlyReports>();

  for (const currency of currenciesOf(inPeriod)) {
    const monthly: MonthReport[] = [];
    const withData: SixMoney[] = [];

    for (const month of months) {
      const six = sixOf(pictureFor(month), currency);
      const previous = prevMonth(month);
      const previousHolds = holdsCurrency(grouped.get(previous) ?? [], currency);

      monthly.push({
        month,
        partial: input.period.partialMonth?.month === month,
        ...written(six),
        changeVsPreviousMonth: previousHolds
          ? changesOf(sixOf(pictureFor(previous), currency), six)
          : null,
        savingsRate: bp(six.saved, six.income),
        investmentRate: bp(six.invested, six.income),
      });

      if (holdsCurrency(grouped.get(month) ?? [], currency)) {
        withData.push(six);
      }
    }

    const total = totalOf(
      months.map((month) => sixOf(pictureFor(month), currency)),
      currency,
    );
    const baselineWithData = baselineMonths
      .filter((month) => holdsCurrency(grouped.get(month) ?? [], currency))
      .map((month) => sixOf(pictureFor(month), currency));

    reports.set(currency, {
      currency,
      totals: total,
      months: monthly,
      period: {
        ...written(total),
        averagePerMonth: written(averageOf(withData, currency)),
        savingsRate: bp(total.saved, total.income),
        investmentRate: bp(total.invested, total.income),
      },
      baseline:
        baselineWithData.length === 0
          ? null
          : {
              monthsBefore: baselineWithData.length,
              averagePerMonth: written(averageOf(baselineWithData, currency)),
            },
    });
  }

  return reports;
}
