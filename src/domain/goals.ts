import { computeBalance, type Account } from './account';
import { overLimit, type CategoryLimit } from './limits';
import { add, money, type CurrencyCode, type Money } from './money';
import type { IsoDate, Transaction } from './transaction';

/**
 * The цілі of the glossary, of two kinds — and only one of them is stored here.
 *
 * A **ціль-накопичення** is «накопичити N»: a назва, a target in the ціль's own currency, an
 * optional дата and a склад — the рахунки whose money counts toward it. A **ціль витрат** is
 * «витратити не більше N цього місяця», and it *is* the ліміт of its категорія (design D1): one
 * stored сума read under two names, so there is no `SpendingGoal` type and no second ceiling that
 * could disagree with a ліміт. What this module gives it is the reading — its state, and the spent
 * it is judged by — both taken from `limits.ts` and `monthly-picture.ts` rather than recomputed.
 *
 * There is still no progress field anywhere, and that is the decision the capability rests on:
 * progress is read from балансі and вартості at the moment the ціль is shown. A second,
 * hand-maintained number could drift from the stored truth, and then two answers to "how much is
 * there" would both be in the app — so money reaches a ціль only the way money reaches its рахунки.
 *
 * This module stays **rate-free**, like the rest of `src/domain`. A progress whose склад mixes
 * currencies needs a rate, so summing it lives in `src/ui/goal-progress.ts` beside `approx-uah.ts`;
 * what is here is the exact sum, which needs none.
 */
export interface AccumulationGoal {
  readonly id: string;
  readonly name: string;
  /** The target, in the ціль's **own** currency — chosen by the owner, not taken from a рахунок. */
  readonly target: Money;
  /** The дата, where the ціль has one. Absent is a first-class answer, not a sentinel date. */
  readonly deadline?: IsoDate;
  /** The склад: the ids of the рахунки whose money counts, one or more, each of them once. */
  readonly accountIds: readonly string[];
}

/**
 * The внесок of one рахунок: its розрахунковий баланс — except for an інвестиційний рахунок, whose
 * внесок is its поточна вартість where the app holds one.
 *
 * The вартість is an **argument**, not a lookup, so this stays pure and so `investments-value` and
 * this change are independent in either order (design D7): until that change lands no вартість
 * exists, every caller passes none, and an інвестиційний рахунок contributes its баланс — which is
 * its вкладено, the number that change itself defines.
 *
 * Presence decides, not truthiness. A вартість of 0 is a вартість the owner entered — an
 * інвестиція may be worth nothing — and falling back to the баланс for exactly the рахунок whose
 * worth the owner has just said is nothing would be the one wrong answer.
 *
 * The дата a вартість carries is deliberately not here: this computes a сума, and a дата is not
 * one. It travels beside the вартість to the screens that state it.
 */
export function contribution(
  account: Account,
  transactions: readonly Transaction[],
  currentValue?: Money,
): Money {
  return account.kind === 'investment' && currentValue !== undefined
    ? currentValue
    : computeBalance(account, transactions);
}

/**
 * The exact progress: the внески added up in the ціль's own currency.
 *
 * Only for a склад every рахунок of which is already in that currency — `add` refuses anything
 * else, which is the point. A склад that mixes currencies has an approximate progress, and that
 * one is `src/ui/goal-progress.ts`'s, because it needs a rate this module may not have.
 */
export function sumContributions(
  currency: CurrencyCode,
  contributions: readonly Money[],
): Money {
  return contributions.reduce((total, one) => add(total, one), money(0, currency));
}

/**
 * Reached: the progress is at the target or above it. At the target counts — a ціль is «накопичити
 * N», and N is N. Both amounts are in the ціль's **own** currency now, not a рахунок's: a склад may
 * hold several currencies, so the progress is converted into the ціль's before it ever gets here.
 */
export function isReached(goal: AccumulationGoal, progress: Money): boolean {
  if (progress.currency !== goal.target.currency) {
    throw new Error(
      `cannot judge ${progress.currency} progress against a ${goal.target.currency} target`,
    );
  }
  return progress.amount >= goal.target.amount;
}

/**
 * Overdue: the ціль has a дата, it has passed, and the ціль is not reached. A reached ціль is never
 * overdue, a ціль whose дата is today is not overdue yet — the day is not over — and a ціль with
 * **no** дата is never overdue at all: there is no deadline to be past.
 *
 * `today` is an argument and never a clock read here: the domain reads no clock, and a test that
 * has to pin the date is the only kind that can prove "last year" means anything.
 */
export function isOverdue(goal: AccumulationGoal, progress: Money, today: IsoDate): boolean {
  return goal.deadline !== undefined && goal.deadline < today && !isReached(goal, progress);
}

/** What the склад of a ціль needs of each рахунок to be judged: its identity and its currency. */
export interface CompositionMember {
  readonly id: string;
  readonly currency: CurrencyCode;
}

/**
 * Why a склад and a currency cannot stand together — the one place that rule is written.
 *
 * Structured rather than phrased, because the three callers say it three ways: the form refuses in
 * Ukrainian while the owner types, `goals-repo` refuses so the state is not representable in
 * storage, and `backup/format` refuses so a hand-edited бекап cannot smuggle one in (design D5).
 */
export type CompositionProblem =
  | { readonly kind: 'empty' }
  | { readonly kind: 'duplicate'; readonly accountId: string }
  /** The склад holds several currencies, so the ціль must be in UAH — and is not. */
  | { readonly kind: 'mixed'; readonly currencies: readonly CurrencyCode[] }
  /** The склад shares one currency, and the ціль is in neither it nor UAH. */
  | { readonly kind: 'foreign'; readonly shared: CurrencyCode };

/** UAH — the only currency monobank quotes a rate in, and so the only one the app converts into. */
export const CONVERTIBLE_INTO: CurrencyCode = 'UAH';

/**
 * The rule, stated once: a склад holds one or more рахунки, each of them once, and a ціль's
 * currency is UAH or the single currency every рахунок of that склад is in.
 *
 * UAH is not privileged by taste. Every monobank rate is UAH per one unit of a currency, so UAH is
 * the only currency the app can convert *into*; a EUR ціль backed by USD рахунки would need a cross
 * rate, which is a second rounding, a second direction question and a number no one can check
 * against a bank screen (design D5). It is refused with a reason rather than approximated.
 *
 * `null` means the two stand together. Order of the checks is the order the owner meets them.
 */
export function compositionProblem(
  currency: CurrencyCode,
  composition: readonly CompositionMember[],
): CompositionProblem | null {
  if (composition.length === 0) {
    return { kind: 'empty' };
  }
  const seen = new Set<string>();
  for (const member of composition) {
    if (seen.has(member.id)) {
      return { kind: 'duplicate', accountId: member.id };
    }
    seen.add(member.id);
  }
  const currencies = [...new Set(composition.map((member) => member.currency))];
  if (currency === CONVERTIBLE_INTO) {
    return null;
  }
  return currencies.length > 1
    ? { kind: 'mixed', currencies }
    : currencies[0] === currency
      ? null
      : { kind: 'foreign', shared: currencies[0]! };
}

/**
 * The склад as the form builds it: the ticked ids, each once, in the order they were first ticked.
 *
 * A рахунок picked by hand and then covered by a вид shortcut is one рахунок, counted once — the
 * склад is a set. The form deduplicates here so a duplicate never reaches storage, where it is
 * treated as the bug it would be rather than quietly swallowed (design D2).
 */
export function composition(accountIds: readonly string[]): string[] {
  return [...new Set(accountIds)];
}

/**
 * A ціль витрат's state for one month. There is no `reached` and no `overdue` among them: a ceiling
 * is not an achievement, and the words of the two kinds never cross (design D8).
 */
export type SpendingGoalState = 'within' | 'exceeded' | 'completedWithin';

/**
 * Which of the three a ціль витрат is in — decided by `overLimit` and nothing else, so «is the
 * ліміт exceeded» and «is the ціль exceeded» are one question with one answer.
 *
 * Spent equal to the ceiling is within, never exceeded: the ліміт's own rule, and the reason
 * `overLimit` is asked instead of a fresh comparison. A month that has ended at or below the
 * ceiling is `completedWithin` — its verdict decided by that month's транзакції alone, which is
 * what «final» means here and all it can honestly mean.
 */
export function spendingGoalState(input: {
  readonly spent: Money;
  readonly ceiling: Money;
  /** The shown month is earlier than the current one. */
  readonly monthEnded: boolean;
}): SpendingGoalState {
  if (overLimit(input.spent, input.ceiling)) {
    return 'exceeded';
  }
  return input.monthEnded ? 'completedWithin' : 'within';
}

/**
 * The spent a ціль витрат is judged by: its категорія's own сума for the month, in the **ліміт's**
 * currency, straight out of `categoryBreakdown` — витрати minus повернення, negative коригування
 * under the correction категорія.
 *
 * No second count is made here, and that is the whole point: a повернення pulls the ціль back by
 * exactly as much as it pulls the ліміт because it is the same number. Spending of that категорія
 * in any other currency is not in this map under this currency, so it neither counts toward the
 * ціль nor is converted toward it; a категорія that moved nothing in the ліміт's currency this
 * month is at zero, which is within any positive ceiling.
 */
export function spendingGoalSpent(input: {
  readonly breakdown: ReadonlyMap<CurrencyCode, ReadonlyMap<string, Money>>;
  readonly limit: CategoryLimit;
}): Money {
  const currency = input.limit.amount.currency;
  return input.breakdown.get(currency)?.get(input.limit.categoryId) ?? money(0, currency);
}
