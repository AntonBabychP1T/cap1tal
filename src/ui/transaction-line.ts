import { transactionEffect, type Account } from '../domain/account';
import { resolveCategoryIcon } from '../domain/category-icon';
import { overLimitCategories, type CategoryLimit } from '../domain/limits';
import { categoryBreakdown } from '../domain/monthly-picture';
import {
  monthOf,
  UNCATEGORISED_CATEGORY_ID,
  type Correction,
  type Expense,
  type Income,
  type IsoDate,
  type Month,
  type Refund,
  type Transaction,
  type Transfer,
} from '../domain/transaction';
import { formatMoney, formatSignedMoney } from './amount-input';
import { categoryLabel, sourceLabel, transactionTypeLabel } from './labels';
import { categoryIconDefinition } from './category-icons';
import { dayLabel } from './dates';
import type { IconName } from './icons';
import type { ThemeColor } from '../constants/theme';

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
  /** The row's leading glyph and the two independent tones the renderer must preserve. */
  readonly icon: IconName;
  readonly iconTone: ThemeColor;
  readonly amountTone: ThemeColor;
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

/**
 * The feed's own explicit money direction (main-screen, "The feed shows the latest five legible
 * records"): expense «−», income/повернення «+», коригування its stored sign — never a bare
 * positive number a reader has to infer the direction of from the row's type alone. An expense's
 * amount is stored positive (`transactionEffect` is what negates it for a balance); this is purely
 * a display prefix, and `formatMoney`'s own negative rendering already does the rest.
 */
function directionalAmount(t: Expense | Income | Refund | Correction): string {
  if (t.type === 'expense') {
    return `−${formatMoney(t.amount)}`;
  }
  if (t.type === 'correction') {
    return t.amount.amount >= 0 ? `+${formatMoney(t.amount)}` : formatMoney(t.amount);
  }
  return `+${formatMoney(t.amount)}`;
}

/**
 * A переказ's two legs: a directional arrow always, both amounts named only when they differ —
 * same currency or not (main-screen: "a directional arrow with each leg's amount/currency, both
 * amounts when unequal even in one currency"). Equal legs would otherwise repeat the same figure
 * twice for no reason a same-currency, fee-free переказ ever gives a reader to resolve.
 */
function transferAmount(t: Transfer): string {
  const equal = t.left.currency === t.arrived.currency && t.left.amount === t.arrived.amount;
  return equal ? `→ ${formatMoney(t.left)}` : `${formatMoney(t.left)} → ${formatMoney(t.arrived)}`;
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
  /** Stored keys are separate from labels so a rename cannot recompute a picture. */
  categoryIconKeys: ReadonlyMap<string, string | undefined> = new Map(),
): TransactionLine {
  const common = {
    id: t.id,
    type: transactionTypeLabel(t.type),
    date: t.date,
    uncategorised: false,
    overLimit: false,
    icon: 'tag' as IconName,
    iconTone: 'textSecondary' as ThemeColor,
    amountTone: 'text' as ThemeColor,
    // Guarded, not assigned: an empty опис is no опис, and the row must stay compact.
    ...(t.description ? { description: t.description } : {}),
  };
  if (t.type === 'transfer') {
    return {
      ...common,
      amount: transferAmount(t),
      icon: 'transfer',
      accounts: `${accountNameOf(t.fromAccountId, accountsById)} → ${accountNameOf(t.toAccountId, accountsById)}`,
    };
  }
  const line: TransactionLine = {
    ...common,
    amount: directionalAmount(t),
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
  if (t.type === 'expense' || t.type === 'refund') {
    const icon = categoryIconDefinition(resolveCategoryIcon({
      id: t.categoryId,
      name: categoryNames.get(t.categoryId) ?? t.categoryId,
      iconKey: categoryIconKeys.get(t.categoryId),
    })).glyph;
    return { ...line, icon, iconTone: line.overLimit ? 'textDanger' : 'textSecondary' };
  }
  if (t.type === 'income') return { ...line, icon: 'income', iconTone: 'textPositive', amountTone: 'textPositive' };
  if (t.type === 'correction') return { ...line, icon: 'plusMinus' };
  return line;
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

export function feedSubtitle(line: TransactionLine, now: Date): string {
  const labelled = line.category !== undefined || line.source !== undefined;
  return `${line.type === 'повернення' ? 'повернення' : labelled ? line.accounts : line.type} · ${dayLabel(line.date, now)}`;
}

/** What one line inside a рахунок's рухи reads — see `accountSideLine`. */
export interface AccountSideLine {
  readonly title: string;
  readonly subtitle: string;
  readonly amount: string;
  readonly amountTone: ThemeColor;
}

/**
 * A line of a рахунок's рухи, told from that рахунок's side (accounts-screen, "Tapping a рахунок
 * opens its рухи"): the screen already names the рахунок, so no line repeats it, and a переказ
 * says whether money came *in* («з …», «+») or went *out* («на …», «−») with this рахунок's own
 * leg — the feed's «A → B» arrow is the whole-app view and leaves the owner to work out which end
 * they are standing on.
 *
 * A переказ keeps the plain text tone either way: money arriving from the owner's own рахунок is
 * not дохід, and the green belongs to дохід. Everything else keeps the feed's own title, сума and
 * tone; only the subtitle loses the рахунок — the day alone, or «повернення · …»/«переказ · …»
 * where the type is not already the title.
 */
export function accountSideLine(
  t: Transaction,
  line: TransactionLine,
  accountId: string,
  byId: ReadonlyMap<string, Account>,
  now: Date,
): AccountSideLine {
  const day = dayLabel(line.date, now);
  if (t.type === 'transfer') {
    // The leg and its sign are the balance rule's own — the same `transactionEffect` that folds
    // this переказ into the рахунок's баланс — so a line can never read differently from the
    // balance it moved.
    const effect = transactionEffect(accountId, t);
    const leaving = t.fromAccountId === accountId;
    return {
      title: leaving
        ? `на ${accountNameOf(t.toAccountId, byId)}`
        : `з ${accountNameOf(t.fromAccountId, byId)}`,
      subtitle: `переказ · ${day}`,
      amount: effect ? formatSignedMoney(effect) : line.amount,
      amountTone: 'text',
    };
  }
  if (t.type === 'correction') {
    return { title: 'Коригування', subtitle: day, amount: line.amount, amountTone: line.amountTone };
  }
  return {
    title: feedTitle(line),
    subtitle: t.type === 'refund' ? `повернення · ${day}` : day,
    amount: line.amount,
    amountTone: line.amountTone,
  };
}

export function accountsById(accounts: readonly Account[]): ReadonlyMap<string, Account> {
  return new Map(accounts.map((a) => [a.id, a]));
}
