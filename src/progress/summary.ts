import type { AccountKind } from '../domain/account';
import { money, type CurrencyCode, type Money } from '../domain/money';
import { isoDate, type IsoDate, type Month } from '../domain/transaction';

/**
 * The **зведення прогресу**: the whole stored history read once, as aggregates, and the pure
 * derivations every досягнення and виклик is decided from.
 *
 * Its size is bounded by (місяць × currency) + (вид рахунку × currency) plus a fixed handful of
 * single values — about a hundred rows for a two-year history of two and a half thousand
 * транзакції (design D10). Nothing here loads a транзакція: what the engine needs of the history
 * is how much moved, in which місяць, in which currency, and how many rows carried «Без
 * категорії» or «Без джерела». `src/db/progress-repo.ts` is what produces it, in `GROUP BY`s;
 * this module is what the numbers *mean*.
 *
 * Amounts are integer minor units beside the row's own currency code, exactly as the schema
 * stores money — and every derivation that hands a сума outward returns a `Money`, so no caller
 * ever holds a bare number that is money (rules/domain.md).
 */

/** One (місяць, currency) of the history. The four money numbers are the місячна картина's own. */
export interface MonthRow {
  readonly month: Month;
  readonly currency: CurrencyCode;
  /** Витрачено: витрати net of повернення, negative коригування included. Minor units. */
  readonly spent: number;
  readonly income: number;
  readonly invested: number;
  readonly saved: number;
  /** How many транзакції of that місяць carried an amount in this currency. */
  readonly transactions: number;
  /** How many of them were витрати «Без категорії». */
  readonly uncategorised: number;
  /** How many of them were доходи «Без джерела». */
  readonly unsourced: number;
}

/**
 * The sum of the розрахункові баланси of the рахунки of one вид in one currency — which is what
 * «резерв» and «інвестиційний капітал» are. Currencies never meet: two currencies are two rows.
 */
export interface KindRow {
  readonly kind: AccountKind;
  readonly currency: CurrencyCode;
  readonly balance: number;
}

/**
 * One рахунок's розрахунковий баланс, beside the вид and currency it is in — what a ціль's progress
 * is read from, so evaluating never loads a транзакція for one either. Archived рахунки are here
 * like every other: archiving stops a рахунок being offered, and takes none of its money away.
 */
export interface AccountRow {
  readonly id: string;
  readonly kind: AccountKind;
  readonly currency: CurrencyCode;
  readonly balance: number;
}

/** The history's own extent: how many транзакції, and the дати of the first and the last. */
export interface HistorySpan {
  readonly count: number;
  /** Absent exactly when nothing is stored — never a sentinel date. */
  readonly earliest?: IsoDate;
  readonly latest?: IsoDate;
}

/**
 * The витрачено of one категорія that carries a ліміт, in one місяць and one currency — exactly the
 * number `categoryBreakdown` computes for it. Only limited категорії get a row: «Втримай ліміт» is
 * the one thing that asks, and a vocabulary of forty категорій would otherwise cost the зведення
 * forty times as many rows for thirty-seven answers nobody wants.
 */
export interface LimitedCategoryRow {
  readonly month: Month;
  readonly currency: CurrencyCode;
  readonly categoryId: string;
  readonly spent: number;
}

/** How many чернетки dated inside a місяць are still waiting for a word. */
export interface DraftRow {
  readonly month: Month;
  readonly waiting: number;
}

export interface ProgressSummary {
  readonly months: readonly MonthRow[];
  readonly accounts: readonly AccountRow[];
  /** The (вид, currency) totals — the sums of `accounts`, never a second reading of the history. */
  readonly balances: readonly KindRow[];
  readonly limitedCategories: readonly LimitedCategoryRow[];
  readonly history: HistorySpan;
  readonly drafts: readonly DraftRow[];
}

/** A зведення of a device holding nothing — what a fresh install evaluates against. */
export const EMPTY_SUMMARY: ProgressSummary = {
  months: [],
  accounts: [],
  balances: [],
  limitedCategories: [],
  history: { count: 0 },
  drafts: [],
};

const MONTH = /^(\d{4})-(\d{2})$/;

function partsOf(month: Month): { year: number; month: number } {
  const match = MONTH.exec(month);
  if (!match) {
    throw new Error(`month must be YYYY-MM, got "${month}"`);
  }
  const parsed = { year: Number(match[1]), month: Number(match[2]) };
  if (parsed.month < 1 || parsed.month > 12) {
    throw new Error(`not a calendar month: "${month}"`);
  }
  return parsed;
}

function dayPartsOf(date: IsoDate): { year: number; month: number; day: number } {
  const { year, month } = partsOf(isoDate(date).slice(0, 7));
  return { year, month, day: Number(date.slice(8, 10)) };
}

function daysIn(year: number, month: number): number {
  if (month === 2) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * The next calendar місяць — plain string arithmetic over 'YYYY-MM', so no `Date` and no timezone
 * takes part. Written here rather than borrowed from `src/ui/months.ts` because this module sits
 * below the screens and imports nothing from them (design D14).
 */
export function monthAfter(month: Month): Month {
  const { year, month: m } = partsOf(month);
  const next = m === 12 ? { year: year + 1, month: 1 } : { year, month: m + 1 };
  return `${String(next.year).padStart(4, '0')}-${String(next.month).padStart(2, '0')}`;
}

/**
 * The last calendar day of a місяць — the дата a досягнення about a whole місяць is stamped with
 * («6 активних місяців» happened when the sixth місяць ended, not when the app noticed).
 */
export function monthEnd(month: Month): IsoDate {
  const { year, month: m } = partsOf(month);
  return isoDate(`${month}-${String(daysIn(year, m)).padStart(2, '0')}`);
}

/**
 * The активні місяці, oldest first: every calendar місяць holding at least one транзакція,
 * whether it was typed, imported or synced. A місяць is not made активний by a чернетка — a
 * чернетка is not yet a транзакція — nor by the owner having opened the app in it.
 */
export function activeMonths(summary: ProgressSummary): Month[] {
  const months = new Set<Month>();
  for (const row of summary.months) {
    if (row.transactions > 0) {
      months.add(row.month);
    }
  }
  return [...months].sort();
}

/**
 * Завершений: the місяць's last day is already behind the device's today. Comparing місяці as
 * strings is comparing calendar order, so the current місяць is never завершений however late in
 * it today falls — its last day is today at the earliest, and today is not "before today".
 */
export function isCompleted(month: Month, today: IsoDate): boolean {
  return monthEnd(month) < isoDate(today);
}

/** The завершені активні місяці, oldest first. */
export function completedMonths(summary: ProgressSummary, today: IsoDate): Month[] {
  return activeMonths(summary).filter((month) => isCompleted(month, today));
}

/**
 * Чистий: a завершений активний місяць in which no витрата carried «Без категорії» and no дохід
 * carried «Без джерела». One such транзакція in any currency spoils the місяць — the question is
 * about the record, not about a sum, so the counts of every currency row are added.
 */
export function cleanMonths(summary: ProgressSummary, today: IsoDate): Month[] {
  const unanswered = new Map<Month, number>();
  for (const row of summary.months) {
    unanswered.set(row.month, (unanswered.get(row.month) ?? 0) + row.uncategorised + row.unsourced);
  }
  return completedMonths(summary, today).filter((month) => (unanswered.get(month) ?? 0) === 0);
}

/**
 * The runs of consecutive чисті місяці, in calendar order. A місяць that is not чистий breaks a
 * run — and so does a місяць holding no транзакція at all, because it is not активний and
 * therefore cannot be чистий (the spec says so outright, and this is where that is true).
 */
export function cleanRuns(summary: ProgressSummary, today: IsoDate): Month[][] {
  const runs: Month[][] = [];
  let current: Month[] = [];
  for (const month of cleanMonths(summary, today)) {
    const last = current[current.length - 1];
    if (last !== undefined && monthAfter(last) === month) {
      current.push(month);
    } else {
      current = [month];
      runs.push(current);
    }
  }
  return runs;
}

/** The longest run of consecutive чисті місяці; 0 when there is none. */
export function longestCleanRun(summary: ProgressSummary, today: IsoDate): number {
  return cleanRuns(summary, today).reduce((longest, run) => Math.max(longest, run.length), 0);
}

/**
 * The місяць whose end first completed a run of `length` чисті місяці — what such a досягнення is
 * dated by. The *first* such місяць, not the latest: the fact happened when it happened, and a
 * later run does not re-date it.
 */
export function cleanRunCompletedAt(
  summary: ProgressSummary,
  today: IsoDate,
  length: number,
): Month | undefined {
  for (const run of cleanRuns(summary, today)) {
    if (run.length >= length) {
      return run[length - 1];
    }
  }
  return undefined;
}

/**
 * How many чернетки dated inside a місяць are still waiting for a word — what «Закрий <місяць>»
 * counts down. A чернетка counts against the місяць its own дата falls in, the day the money
 * moved, and not the day the phone overheard it.
 */
export function waitingDraftsIn(summary: ProgressSummary, month: Month): number {
  return summary.drafts
    .filter((row) => row.month === month)
    .reduce((total, row) => total + row.waiting, 0);
}

/**
 * How many транзакції of a місяць are still unanswered — витрати «Без категорії» and доходи «Без
 * джерела», across every currency. The other half of «Закрий <місяць>»'s countdown, and the number
 * a чистий місяць is the zero of.
 */
export function unansweredIn(summary: ProgressSummary, month: Month): number {
  return summary.months
    .filter((row) => row.month === month)
    .reduce((total, row) => total + row.uncategorised + row.unsourced, 0);
}

/**
 * How many whole calendar місяці the history spans, earliest транзакція to latest — the number
 * «Рік історії» is judged by. Whole місяці, so a span that has not yet reached the same day of
 * the twelfth місяць is eleven and not twelve: the badge claims a year of history and must not be
 * earned by anything less. Gaps inside the span do not shorten it — the span is not a count of
 * активні місяці, and the two are named apart for exactly that reason.
 */
export function historySpanMonths(summary: ProgressSummary): number {
  const { earliest, latest } = summary.history;
  if (earliest === undefined || latest === undefined) {
    return 0;
  }
  const from = dayPartsOf(earliest);
  const to = dayPartsOf(latest);
  const months = (to.year - from.year) * 12 + (to.month - from.month);
  return Math.max(0, to.day < from.day ? months - 1 : months);
}

function balanceOf(
  summary: ProgressSummary,
  kind: AccountKind,
  currency: CurrencyCode,
): Money {
  const row = summary.balances.find((one) => one.kind === kind && one.currency === currency);
  return money(row?.balance ?? 0, currency);
}

/**
 * The **резерв** in one currency: the sum of the розрахункові баланси of the рахунки of вид
 * `savings` in that currency, and nothing else. Never a mixture of currencies, and never
 * converted — a currency the owner keeps nothing in reads as zero of that currency.
 */
export function reserve(summary: ProgressSummary, currency: CurrencyCode): Money {
  return balanceOf(summary, 'savings', currency);
}

/** The **інвестиційний капітал** in one currency: the same reading over вид `investment`. */
export function investedCapital(summary: ProgressSummary, currency: CurrencyCode): Money {
  return balanceOf(summary, 'investment', currency);
}

/**
 * The місяці in which something was actually put into інвестиції — інвестовано above zero in at
 * least one currency, oldest first. A місяць counts once however many currencies it holds, and no
 * two currencies are ever added together to decide it: the question is «did the owner contribute
 * that місяць», which has an answer per місяць and not per сума.
 */
export function investmentMonths(summary: ProgressSummary): Month[] {
  const months = new Set<Month>();
  for (const row of summary.months) {
    if (row.invested > 0) {
      months.add(row.month);
    }
  }
  return [...months].sort();
}

/** One рахунок's розрахунковий баланс, or zero of its currency when the зведення does not hold it. */
export function balanceOfAccount(summary: ProgressSummary, id: string): Money | undefined {
  const row = summary.accounts.find((one) => one.id === id);
  return row === undefined ? undefined : money(row.balance, row.currency);
}

/** The currencies the зведення knows about at all — every місяць row and every вид row. */
export function currenciesOf(summary: ProgressSummary): CurrencyCode[] {
  const currencies = new Set<CurrencyCode>();
  for (const row of summary.months) {
    currencies.add(row.currency);
  }
  for (const row of summary.balances) {
    currencies.add(row.currency);
  }
  return [...currencies].sort();
}

/**
 * What one категорія carrying a ліміт spent in one місяць, in one currency. Zero of that currency
 * where the категорія moved nothing — which is within any positive ліміт, and is the same answer
 * `spendingGoalSpent` gives for the same місяць.
 */
export function limitedCategorySpend(
  summary: ProgressSummary,
  month: Month,
  currency: CurrencyCode,
  categoryId: string,
): Money {
  const row = summary.limitedCategories.find(
    (one) => one.month === month && one.currency === currency && one.categoryId === categoryId,
  );
  return money(row?.spent ?? 0, currency);
}

/** Витрачено in one місяць in one currency, as a `Money`; zero of that currency when nothing did. */
export function spentIn(summary: ProgressSummary, month: Month, currency: CurrencyCode): Money {
  const row = summary.months.find((one) => one.month === month && one.currency === currency);
  return money(row?.spent ?? 0, currency);
}
