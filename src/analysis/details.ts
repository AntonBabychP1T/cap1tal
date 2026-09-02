import type { Account, AccountKind } from '../domain/account';
import type { Category, Source } from '../domain/category';
import { money, type CurrencyCode } from '../domain/money';
import { monthOf, type IsoDate, type Month, type Transaction } from '../domain/transaction';
import { decimalOf, type Amount } from './decimal';
import { monthsOfPeriod, type AnalysisPeriod } from './period';
import { largestPerMonthByKey, MERCHANTS, recurrenceOf } from './trends';

/**
 * The two things the owner has to switch on for themselves: the продавці behind the витрати, and
 * the витрати one by one.
 *
 * Everything else in a пакет is an aggregate — a month, a категорія, a trend — and says nothing
 * about any single purchase. These two do, which is why they are off by default and why they are
 * the only part of this module: the switch is a real line between «where the money went» and
 * «what you bought, from whom, on which day».
 *
 * Neither carries an identifier or a рахунок назва in any case. A переказ names its ends by вид —
 * `spending`, `savings`, `investment`, `cash`, `debt` — because the вид is what decides the
 * monthly numbers, and the назва «mono black» is the owner's private label for a card.
 */

export interface MerchantReport {
  /** The опис, folded and trimmed. */
  readonly merchant: string;
  readonly total: Amount;
  readonly count: number;
  readonly categories: readonly string[];
  /** The same rule the категорії are judged by (`trends.ts`), asked of the merchant instead. */
  readonly recurring: boolean;
}

export type TransactionLine =
  | {
      readonly date: IsoDate;
      readonly type: 'expense' | 'refund';
      readonly amount: Amount;
      readonly category: string;
      readonly description?: string;
    }
  | {
      readonly date: IsoDate;
      readonly type: 'income';
      readonly amount: Amount;
      readonly source: string;
      readonly description?: string;
    }
  | {
      readonly date: IsoDate;
      readonly type: 'correction';
      readonly amount: Amount;
      readonly description?: string;
    }
  | {
      readonly date: IsoDate;
      readonly type: 'transfer';
      readonly from: AccountKind;
      readonly to: AccountKind;
      readonly left: Amount;
      readonly arrived: Amount;
      readonly description?: string;
    };

/** The same fallback the rest of `src/analysis` uses: a назва, never the id the spec forbids. */
const UNNAMED = 'Без назви';

/**
 * One опис as one merchant: trimmed, its inner whitespace collapsed, lower-cased. «СІЛЬПО»,
 * «Сільпо» and «сільпо  » are one shop and have to fold into one row, or the largest merchant of a
 * month is three rows of a third of it each.
 *
 * Nothing else is done to it — no cleaning, no dictionary, no guessing at a chain behind a branch
 * code. The опис is the bank's text and the пакет passes it on as the bank wrote it, only folded.
 *
 * `toLowerCase()` and deliberately **not** `toLocaleLowerCase('uk')`, which is what
 * `transactions-repo.ts:247` and `transaction-search.ts` use on the very same описи. The two are
 * folding for two different purposes and the difference is the пакет's own guarantee: a search
 * result is read once and thrown away, while this string is both the key merchants are grouped by
 * and the key they are sorted by, and every ordering in a пакет must be identical under Node in
 * `verify` and under Hermes on the phone. That is the same rule the sorts below and in
 * `categories.ts` keep by refusing `localeCompare`. Cyrillic has no locale tailoring today — `uk`
 * and the root mapping agree — so this costs nothing and removes the one `Intl` dependency that
 * could ever make two devices build two пакети out of one stored state.
 */
export function foldMerchant(description: string): string {
  return description.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The largest продавці of the period in one currency, with what each cost, how often, under which
 * категорії, and whether the сума comes back every month.
 *
 * Витрати only, as the spec says in as many words: a повернення does not reduce a merchant (money
 * came back from the shop, but «what this shop cost» is still what was paid there), a дохід and a
 * коригування have no merchant at all, and a переказ moves the owner's own money between their own
 * рахунки — there is no seller in it.
 */
export function merchantReports(input: {
  readonly period: AnalysisPeriod;
  readonly currency: CurrencyCode;
  readonly transactions: readonly Transaction[];
  readonly categories: readonly Category[];
}): MerchantReport[] {
  const months = monthsOfPeriod(input.period);
  const inPeriod = new Set<Month>(months);
  const nameOf = new Map(input.categories.map((category) => [category.id, category.name]));

  const totals = new Map<
    string,
    { total: number; count: number; categories: Set<string> }
  >();
  for (const t of input.transactions) {
    if (t.type !== 'expense' || t.amount.currency !== input.currency) continue;
    if (!inPeriod.has(monthOf(t.date))) continue;
    if (!t.description) continue;
    const merchant = foldMerchant(t.description);
    if (merchant === '') continue;

    const row = totals.get(merchant) ?? { total: 0, count: 0, categories: new Set<string>() };
    row.total += t.amount.amount;
    row.count += 1;
    row.categories.add(nameOf.get(t.categoryId) ?? UNNAMED);
    totals.set(merchant, row);
  }

  const recurringMerchants = new Set<string>();
  for (const [merchant, largest] of largestPerMonthByKey({
    transactions: input.transactions,
    months,
    currency: input.currency,
    keyOf: (t) => {
      if (!t.description) return null;
      const folded = foldMerchant(t.description);
      return folded === '' ? null : folded;
    },
  })) {
    if (recurrenceOf(largest, months.length)) {
      recurringMerchants.add(merchant);
    }
  }

  return [...totals]
    .map(([merchant, row]) => ({
      merchant,
      total: decimalOf(money(row.total, input.currency)),
      count: row.count,
      // Sorted by code units, never `localeCompare`: an `Intl` collation would let Node and Hermes
      // build two different пакети out of one stored state.
      categories: [...row.categories].sort(),
      recurring: recurringMerchants.has(merchant),
      totalMinor: row.total,
    }))
    .sort((a, b) =>
      b.totalMinor !== a.totalMinor
        ? b.totalMinor - a.totalMinor
        : a.merchant < b.merchant
          ? -1
          : a.merchant > b.merchant
            ? 1
            : 0,
    )
    .slice(0, MERCHANTS)
    .map(({ totalMinor: _totalMinor, ...report }) => report);
}

/**
 * Every транзакція of the period, one line each, in whatever order it is given them —
 * `package.ts` sorts the транзакції before it calls this, so the order is the пакет's own and never
 * the order the rows came out of SQLite in.
 *
 * The сума в оригінальній валюті of a foreign purchase is not among the fields: the витрата is the
 * UAH the bank charged, and a second сума beside it would invite exactly the cross-currency
 * arithmetic the пакет forbids.
 */
export function transactionLines(input: {
  readonly period: AnalysisPeriod;
  readonly transactions: readonly Transaction[];
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly sources: readonly Source[];
  readonly included: { readonly descriptions: boolean };
}): TransactionLine[] {
  const inPeriod = new Set<Month>(monthsOfPeriod(input.period));
  const categoryName = new Map(input.categories.map((c) => [c.id, c.name]));
  const sourceName = new Map(input.sources.map((s) => [s.id, s.name]));
  const kindOf = new Map(input.accounts.map((a) => [a.id, a.kind]));

  const described = (description?: string): { description?: string } =>
    input.included.descriptions && description ? { description } : {};

  const lines: TransactionLine[] = [];
  for (const t of input.transactions) {
    if (!inPeriod.has(monthOf(t.date))) continue;

    switch (t.type) {
      case 'expense':
      case 'refund':
        lines.push({
          date: t.date,
          type: t.type,
          amount: decimalOf(t.amount),
          category: categoryName.get(t.categoryId) ?? UNNAMED,
          ...described(t.description),
        });
        break;
      case 'income':
        lines.push({
          date: t.date,
          type: 'income',
          amount: decimalOf(t.amount),
          source: sourceName.get(t.sourceId) ?? UNNAMED,
          ...described(t.description),
        });
        break;
      case 'correction':
        // No категорія and no джерело: a коригування is unexplained money, and the domain fixes
        // its category to «Коригування» precisely so nobody has to label it here.
        lines.push({
          date: t.date,
          type: 'correction',
          amount: decimalOf(t.amount),
          ...described(t.description),
        });
        break;
      case 'transfer':
        lines.push({
          date: t.date,
          type: 'transfer',
          from: kindFor(kindOf, t.fromAccountId),
          to: kindFor(kindOf, t.toAccountId),
          // Both legs, each in its own currency and with no rate between them — a cross-currency
          // переказ is two сумі that happened, not one сума converted.
          left: decimalOf(t.left),
          arrived: decimalOf(t.arrived),
          ...described(t.description),
        });
        break;
    }
  }
  return lines;
}

function kindFor(kinds: ReadonlyMap<string, AccountKind>, accountId: string): AccountKind {
  const kind = kinds.get(accountId);
  if (!kind) {
    // The same refusal `monthlyPicture` makes: a переказ to a рахунок that is not in the list is a
    // broken state, and guessing a вид would put a wrong number in the monthly picture too.
    throw new Error('transaction references unknown account');
  }
  return kind;
}
