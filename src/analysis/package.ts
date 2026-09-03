import type { Account, AccountKind } from '../domain/account';
import type { Category, Source } from '../domain/category';
import type { AccumulationGoal } from '../domain/goals';
import type { CategoryLimit } from '../domain/limits';
import type { CurrencyCode, Money } from '../domain/money';
import type { MonthlyNumbers } from '../domain/monthly-picture';
import { monthOf, type IsoDate, type Transaction } from '../domain/transaction';
import type { MonobankRate } from '../monobank/currency';
import { byCurrency as compareCurrency } from '../ui/amount-input';
import { approximatePicture, type KnownRate } from '../ui/approx-uah';
import { todayIso } from '../ui/dates';
import { categoryReports, type CategoryReport } from './categories';
import { decimalOf } from './decimal';
import {
  merchantReports,
  transactionLines,
  type MerchantReport,
  type TransactionLine,
} from './details';
import { goalReports, type GoalReport } from './goals';
import {
  monthlyReports,
  type Baseline,
  type MonthReport,
  type PeriodTotals,
  type SixMoney,
  type SixNumbers,
} from './monthly';
import {
  historyOf,
  monthsOfPeriod,
  resolvePeriod,
  type AnalysisPeriod,
  type AnalysisRefusal,
  type PeriodChoice,
} from './period';
import { trendsOf, type Trends } from './trends';

/**
 * The пакет для аналізу: everything the app has computed about a period, in one value, ready to be
 * written into a файл and handed to an assistant.
 *
 * Three properties hold it together, and every decision in `src/analysis` serves one of them.
 *
 * **It is deterministic.** The inputs are plain values and the day, never a clock and never a
 * repository; the транзакції are sorted before anything is emitted; every mean is integer
 * arithmetic. The same stored state and the same day build a пакет equal in every value, whatever
 * order the rows were read in — which is what makes «show me the file first» a promise rather than
 * a hope.
 *
 * **It excludes by construction.** The input type has no field for a token, a баланс банку, a
 * captured notification, a чернетка, a cursor or a відстежуваний застосунок, so the screen cannot
 * pass one. Ids and рахунок назви *are* in the input — the domain types carry them — and are
 * dropped by the mappers: категорії and джерела by назва, перекази by вид, цілі without their
 * рахунок. `privacy.test.ts` proves it over the serialised text with sentinels, rather than by
 * anyone believing this paragraph.
 *
 * **It computes nothing a second way.** Every сума in it is `monthlyPicture`'s,
 * `categoryBreakdown`'s, `goalProgress`'s or `overLimitBy`'s. What this layer adds is statistics —
 * shares, changes, medians, ranks — which is the reading the assistant is then asked to explain
 * rather than to redo.
 */

export const ANALYSIS_PACKAGE_SCHEMA = 'cap1tal.analysis-package';
export const ANALYSIS_PACKAGE_VERSION = 1;

/** `'investments'` is added by `ai-investment-analysis`, once `investments-value` is archived. */
export type AnalysisKind = 'monthly-picture';

export type { Amount, BasisPoints } from './decimal';
export type { AnalysisPeriod, AnalysisRefusal, PeriodChoice } from './period';
export type { Baseline, MonthReport, PeriodTotals, SixChanges, SixNumbers } from './monthly';
export type { Anchor, CategoryReport } from './categories';
export type { CategoryChange, NotableExpense, RecurringCandidate, Trends } from './trends';
export type { MerchantReport, TransactionLine } from './details';
export type { GoalReport } from './goals';

export interface CurrencyReport {
  readonly currency: CurrencyCode;
  /** Every month of the period, zeros kept. */
  readonly months: readonly MonthReport[];
  readonly period: PeriodTotals;
  readonly baseline: Baseline | null;
  /** By total, largest first. */
  readonly categories: readonly CategoryReport[];
  readonly trends: Trends;
  /** Present only when `included.descriptions`. */
  readonly merchants?: readonly MerchantReport[];
}

export interface ApproximateUah {
  readonly note: 'approximate';
  /** The period's six, all in UAH, at the monobank rates named below. */
  readonly period: SixNumbers;
  readonly rates: readonly { readonly currency: CurrencyCode; readonly rateAsOf: IsoDate }[];
}

export interface AnalysisPackage {
  readonly schema: typeof ANALYSIS_PACKAGE_SCHEMA;
  readonly version: typeof ANALYSIS_PACKAGE_VERSION;
  readonly kind: AnalysisKind;
  /** The device's calendar day the пакет was built for — an input, never a clock read. */
  readonly builtOn: IsoDate;
  readonly period: AnalysisPeriod;
  readonly included: { readonly descriptions: boolean; readonly transactions: boolean };
  readonly counts: {
    readonly transactions: number;
    readonly categories: number;
    /** UAH first, then alphabetical. */
    readonly currencies: readonly CurrencyCode[];
    readonly accountsByKind: Readonly<Record<AccountKind, number>>;
    readonly monthsWithData: number;
  };
  /** 'short' when fewer than two months of the period hold транзакції. */
  readonly history: 'short' | 'sufficient';
  /** One per currency, never merged. */
  readonly byCurrency: readonly CurrencyReport[];
  /** Only when every foreign currency of the period has a known rate. */
  readonly approximateUah: ApproximateUah | null;
  readonly goals: readonly GoalReport[];
  /** Present only when `included.transactions`. */
  readonly transactions?: readonly TransactionLine[];
}

/** A stored monobank rate as the builder wants it: the rate and the day it was obtained. */
export type DatedRate = MonobankRate & KnownRate;

export interface AnalysisInput {
  readonly kind: AnalysisKind;
  readonly period: PeriodChoice;
  readonly included: { readonly descriptions: boolean; readonly transactions: boolean };
  /** The device's calendar day, read once by the screen — `todayIso(new Date())`. */
  readonly builtOn: IsoDate;
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly categories: readonly Category[];
  readonly sources: readonly Source[];
  readonly limits: readonly CategoryLimit[];
  readonly goals: readonly AccumulationGoal[];
  /**
   * The поточна вартість of each інвестиційний рахунок that has one, by рахунок id — from the same
   * repo the screens read, so the пакет's progress for a ціль is the identical number «Звіти»
   * shows (design D13). Empty until `investments-value` lands, and absent from every caller
   * until then; the seam exists on both sides so the two cannot drift the day it does.
   */
  readonly currentValues?: ReadonlyMap<string, Money>;
  readonly rates: readonly DatedRate[];
  // Deliberately absent, and the absence is the guarantee: no monobank token, no cursor, no
  // баланс банку, no captured notification, no чернетка, no відстежуваний застосунок, no бекап.
  // The screen cannot hand over what this type does not name (design D5).
}

const ALL_KINDS: readonly AccountKind[] = ['spending', 'savings', 'investment', 'cash', 'debt'];

/**
 * The order the транзакції are emitted in, and the whole of the determinism guarantee.
 *
 * By дата, then type, then сума, then what it was for, then its опис — never by id, which the пакет
 * does not carry and which would make the output depend on something its reader cannot see. Two
 * транзакції agreeing on all five are indistinguishable in the пакет anyway, so no order among them
 * can be observed.
 */
function sortForOutput(transactions: readonly Transaction[]): Transaction[] {
  const amountOf = (t: Transaction): number =>
    t.type === 'transfer' ? t.left.amount : t.amount.amount;
  const currencyOf = (t: Transaction): string =>
    t.type === 'transfer' ? t.left.currency : t.amount.currency;
  const aboutOf = (t: Transaction): string => {
    switch (t.type) {
      case 'expense':
      case 'refund':
        return t.categoryId;
      case 'income':
        return t.sourceId;
      case 'transfer':
        return `${t.fromAccountId}→${t.toAccountId}`;
      case 'correction':
        return '';
    }
  };
  const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

  return [...transactions].sort(
    (a, b) =>
      compare(a.date, b.date) ||
      compare(a.type, b.type) ||
      amountOf(a) - amountOf(b) ||
      compare(currencyOf(a), currencyOf(b)) ||
      compare(aboutOf(a), aboutOf(b)) ||
      compare(a.description ?? '', b.description ?? ''),
  );
}

/**
 * The пакет, or the one refusal the builder can make: a period with nothing in it.
 *
 * Nothing is stored, nothing is mutated and no clock is read. The транзакції are copied before they
 * are sorted, so the list the screen handed over is the list the screen still holds.
 */
export function buildAnalysisPackage(input: AnalysisInput): AnalysisPackage | AnalysisRefusal {
  const period = resolvePeriod(input.period, input.builtOn);
  const sorted = sortForOutput(input.transactions);

  const history = historyOf(period, sorted);
  if ('kind' in history) {
    return history;
  }

  const monthly = monthlyReports({ period, accounts: input.accounts, transactions: sorted });

  const reports: CurrencyReport[] = [];
  const totalsByCurrency = new Map<CurrencyCode, SixMoney>();
  const categoryNames = new Set<string>();

  for (const [currency, monthlyReport] of monthly) {
    totalsByCurrency.set(currency, monthlyReport.totals);

    const categories = categoryReports({
      period,
      currency,
      transactions: sorted,
      categories: input.categories,
      limits: input.limits,
      periodSpent: monthlyReport.totals.spent,
    });
    for (const category of categories) {
      categoryNames.add(category.name);
    }

    const merchants = input.included.descriptions
      ? merchantReports({ period, currency, transactions: sorted, categories: input.categories })
      : undefined;

    reports.push({
      currency,
      months: monthlyReport.months,
      period: monthlyReport.period,
      baseline: monthlyReport.baseline,
      categories,
      trends: trendsOf({
        period,
        currency,
        transactions: sorted,
        categories: input.categories,
        categoryReports: categories,
        included: input.included,
      }),
      ...(merchants ? { merchants } : {}),
    });
  }

  const months = new Set(monthsOfPeriod(period));
  const accountsByKind = Object.fromEntries(
    ALL_KINDS.map((kind) => [kind, input.accounts.filter((a) => a.kind === kind).length]),
  ) as Record<AccountKind, number>;

  return {
    schema: ANALYSIS_PACKAGE_SCHEMA,
    version: ANALYSIS_PACKAGE_VERSION,
    kind: input.kind,
    builtOn: input.builtOn,
    period,
    included: input.included,
    counts: {
      transactions: sorted.filter((t) => months.has(monthOf(t.date))).length,
      categories: categoryNames.size,
      currencies: [...monthly.keys()],
      accountsByKind,
      monthsWithData: history.monthsWithData,
    },
    history: history.history,
    byCurrency: reports,
    approximateUah: approximationOf(totalsByCurrency, input.rates),
    goals: goalReports({
      goals: input.goals,
      accounts: input.accounts,
      transactions: sorted,
      builtOn: input.builtOn,
      ...(input.currentValues ? { currentValues: input.currentValues } : {}),
    }),
    ...(input.included.transactions
      ? {
          transactions: transactionLines({
            period,
            transactions: sorted,
            accounts: input.accounts,
            categories: input.categories,
            sources: input.sources,
            included: input.included,
          }),
        }
      : {}),
  };
}

/**
 * The one figure in the пакет that crosses currencies — the app's own приблизно в гривні, taken
 * from `approximatePicture` so it is exactly the number the screens already show and never a
 * second conversion of its own.
 *
 * `null` for a UAH-only period, where there is nothing to approximate, and `null` when any foreign
 * currency of the period has no rate: a sum missing a currency is not an approximation of the
 * period, it is an approximation of part of it wearing the period's name. Each rate is dated by the
 * day it was obtained, so a reader can see how old the crossing is.
 */
function approximationOf(
  totals: ReadonlyMap<CurrencyCode, SixMoney>,
  rates: readonly DatedRate[],
): ApproximateUah | null {
  const picture = new Map<CurrencyCode, MonthlyNumbers>(totals);
  const approximated = approximatePicture(picture, rates);
  if (!approximated) {
    return null;
  }

  const rateFor = new Map(rates.map((rate) => [rate.currency, rate]));
  return {
    note: 'approximate',
    period: {
      spent: decimalOf(approximated.spent),
      income: decimalOf(approximated.income),
      invested: decimalOf(approximated.invested),
      saved: decimalOf(approximated.saved),
      lent: decimalOf(approximated.lent),
      left: decimalOf(approximated.left),
    },
    rates: [...totals.keys()]
      .filter((currency) => currency !== 'UAH')
      .sort(compareCurrency)
      .flatMap((currency) => {
        const rate = rateFor.get(currency);
        return rate ? [{ currency, rateAsOf: todayIso(rate.obtainedAt) }] : [];
      }),
  };
}
