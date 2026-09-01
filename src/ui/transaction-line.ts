import type { Account } from '../domain/account';
import { overLimitCategories, type CategoryLimit } from '../domain/limits';
import { categoryBreakdown } from '../domain/monthly-picture';
import {
  monthOf,
  UNCATEGORISED_CATEGORY_ID,
  type IsoDate,
  type Month,
  type Transaction,
} from '../domain/transaction';
import { formatMoney } from './amount-input';
import { categoryLabel, sourceLabel, transactionTypeLabel } from './labels';

/**
 * One row of the стрічка: what the feed requirement asks it to show — the amount with its
 * currency, the account (both accounts for a переказ) and the date. Pure, so the feed's content
 * is proven by `verify` even though the list itself is JSX.
 */
export interface TransactionLine {
  readonly id: string;
  /** витрата, переказ, дохід, повернення, коригування. */
  readonly type: string;
  readonly amount: string;
  readonly accounts: string;
  readonly date: IsoDate;
  /** The category label where the type has one; absent otherwise. */
  readonly category?: string;
  /**
   * The джерело label of a дохід. It is here because an imported arrival lands on «Без джерела»
   * and the feed has to say so: without it, a дохід the app itself classified would look like one
   * the owner did, and the state that asks to be resolved would be invisible.
   */
  readonly source?: string;
  /**
   * The опис the bank sent, when the транзакція carries one. Secondary text, never a category, a
   * джерело or an account: it is what tells an uncategorised «СІЛЬПО Київ» apart from an
   * uncategorised «Uklon» before the owner has said which is which. A транзакція recorded by hand
   * carries none, and then this is absent — no empty row, no placeholder.
   */
  readonly description?: string;
  /**
   * The line carries «Без категорії», so the feed marks it and offers the one-tap categorisation
   * (main-screen: "«Без категорії» is highlighted and categorised in one tap"). Deciding it here
   * rather than in the feed keeps the reserved id out of JSX and puts the rule under `verify`.
   */
  readonly uncategorised: boolean;
  /**
   * The line's category is over its ліміт for the calendar month of this транзакція's date, so the
   * feed shows the category red. It is the *category* that is over, not the line: a витрата and a
   * повернення of the same category in the same month are both marked, and a line in another
   * currency is marked too, because the ліміт was judged in its own currency and this line's
   * currency never entered that judgement. A line showing no category is never marked.
   */
  readonly overLimit: boolean;
}

/**
 * The over-limit категорії of every month the loaded feed touches — what `transactionLine` needs
 * to mark a line by its own month.
 *
 * The feed holds the latest транзакції, not whole months, so the month's spent cannot be read off
 * it: `monthTransactions` loads each distinct month in full (`transactionsRepo.listMonth`), and
 * there are typically one or two of them. The loader is an argument so this stays pure and the
 * screen keeps adding no decision of its own.
 */
export function overLimitByMonth(input: {
  feed: readonly Transaction[];
  limits: readonly CategoryLimit[];
  monthTransactions: (month: Month) => readonly Transaction[];
}): Map<Month, ReadonlySet<string>> {
  const marked = new Map<Month, ReadonlySet<string>>();
  if (input.limits.length === 0) {
    return marked;
  }
  for (const month of new Set(input.feed.map((t) => monthOf(t.date)))) {
    const breakdown = categoryBreakdown({ month, transactions: input.monthTransactions(month) });
    marked.set(month, new Set(overLimitCategories({ breakdown, limits: input.limits }).keys()));
  }
  return marked;
}

/**
 * An account whose row is gone shows its id rather than an empty gap. Exported because every
 * surface that names a рахунок needs the same fallback — the feed here, the чернетки on Головний,
 * the watched apps in «Сповіщення банків» — and three copies would be three chances to drift into
 * showing nothing at all.
 */
export function accountNameOf(accountId: string, accountsById: ReadonlyMap<string, Account>): string {
  return accountsById.get(accountId)?.name ?? accountId;
}

export function transactionLine(
  t: Transaction,
  accountsById: ReadonlyMap<string, Account>,
  /** The categories list as the screen loaded it — see `categoryLabel` in ./labels. */
  categoryNames: ReadonlyMap<string, string>,
  /** The джерела list, for the one type that has one. Absent on a screen that shows no доходи. */
  sourceNames: ReadonlyMap<string, string> = new Map(),
  /** Per month, the categories over their ліміт — `overLimitByMonth` above. Empty marks nothing. */
  overLimit: ReadonlyMap<Month, ReadonlySet<string>> = new Map(),
): TransactionLine {
  const common = {
    id: t.id,
    type: transactionTypeLabel(t.type),
    date: t.date,
    uncategorised: false,
    overLimit: false,
    // Guarded, not assigned: an empty опис is no опис, and the row must stay compact.
    ...(t.description ? { description: t.description } : {}),
  };
  if (t.type === 'transfer') {
    const legs =
      t.left.currency === t.arrived.currency
        ? formatMoney(t.left)
        : `${formatMoney(t.left)} → ${formatMoney(t.arrived)}`;
    return {
      ...common,
      amount: legs,
      accounts: `${accountNameOf(t.fromAccountId, accountsById)} → ${accountNameOf(t.toAccountId, accountsById)}`,
    };
  }
  return {
    ...common,
    amount: formatMoney(t.amount),
    accounts: accountNameOf(t.accountId, accountsById),
    ...(t.type === 'expense' || t.type === 'refund'
      ? {
          category: categoryLabel(t.categoryId, categoryNames),
          // A повернення can carry it too, and it is as uncategorised as a витрата is.
          uncategorised: t.categoryId === UNCATEGORISED_CATEGORY_ID,
          // By this транзакція's own month, not by the month the screen happens to be showing.
          overLimit: overLimit.get(monthOf(t.date))?.has(t.categoryId) ?? false,
        }
      : {}),
    ...(t.type === 'income' ? { source: sourceLabel(t.sourceId, sourceNames) } : {}),
  };
}

/**
 * What a row of the стрічка leads with, and what it says underneath — the same strings the line
 * already carries, in the order the row reads them: the label the owner gave the money first, the
 * сума opposite it, where it sat and when on the second line.
 *
 * A витрата and a повернення lead with their категорія, a дохід with its джерело; both then name
 * their рахунок below. A переказ and a коригування carry no such label, so they lead with the
 * рахунки they touched and say what they are underneath instead — the alternative would print the
 * same account names twice.
 */
export function feedTitle(line: TransactionLine): string {
  return line.category ?? line.source ?? line.accounts;
}

export function feedSubtitle(line: TransactionLine): string {
  const labelled = line.category !== undefined || line.source !== undefined;
  return `${labelled ? line.accounts : line.type} · ${line.date}`;
}

export function accountsById(accounts: readonly Account[]): ReadonlyMap<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]));
}
