import {
  CONVERTIBLE_INTO,
  isReached,
  spendingGoalState,
  type AccumulationGoal,
  type SpendingGoalState,
} from '../domain/goals';
import type { CurrencyCode, Money } from '../domain/money';
import type { MonobankRate } from '../monobank/currency';
import { formatMoney } from './amount-input';
import { approximateUah } from './approx-uah';

/**
 * A ціль's progress, and the words each kind of ціль is read out in.
 *
 * It lives here and not in `src/domain` for one reason: a progress whose склад mixes currencies
 * needs a rate, and the domain is rate-free. So the domain produces the внески and this adds them
 * up, converting through `approximateUah` verbatim — same BigInt, same halves-away-from-zero, same
 * direction — and says plainly which of the three answers it arrived at (design D6).
 *
 * The two read-outs below share no field on purpose (design D8). A ціль-накопичення has
 * `leftToAccumulate` and `reached`; a ціль витрат has `mayStillSpend`, `exceededBy` and its month.
 * Neither type can be handed to the other's renderer, so «виконано на 124 %» about a ceiling the
 * owner did not want to cross cannot be written by accident — the type system refuses it.
 */

/** One рахунок's внесок, as the progress counted it. */
export interface ProgressPart {
  readonly accountId: string;
  /** The внесок in the рахунок's **own** currency — the truth, never replaced by a conversion. */
  readonly own: Money;
  /**
   * What it contributed in the ціль's currency: the same сума when the currencies agree, its
   * converted equivalent when they do not, and `null` when the rate to convert it is unknown.
   */
  readonly inGoalCurrency: Money | null;
  /** The внесок had to be converted, so the ціль's whole progress is приблизний. */
  readonly converted: boolean;
}

/**
 * What a progress came to. A discriminated union rather than a nullable number, so «no progress»
 * cannot be mistaken for «progress of zero» at a call site — the mistake that would silently count
 * a currency the app has no rate for as nothing.
 */
export type GoalProgress =
  | { readonly kind: 'exact'; readonly total: Money; readonly parts: readonly ProgressPart[] }
  | { readonly kind: 'approximate'; readonly total: Money; readonly parts: readonly ProgressPart[] }
  | {
      readonly kind: 'unknown';
      /** The currencies no rate reaches; empty when the sum itself is what cannot be held. */
      readonly missingCurrencies: readonly CurrencyCode[];
      readonly parts: readonly ProgressPart[];
    };

/** What the progress needs of one рахунок of the склад: its id, its currency and its внесок. */
export interface Contribution {
  readonly accountId: string;
  readonly amount: Money;
}

/**
 * The progress of a ціль-накопичення: the внески, in the ціль's currency.
 *
 * Each внесок is converted and rounded **on its own**, before the sum, so the внески the breakdown
 * screen lists add up to exactly the total above them. `approximatePicture` rounds once per
 * currency total instead, so a ціль and the Місяць tab may land a minor unit apart on the same
 * money; both are marked приблизний and the per-currency amounts neither touches are the truth.
 *
 * A missing rate withholds the whole progress — never a partial one wearing a total's name — and so
 * does a sum that leaves the safe-integer range, which is the same rule `approximatePicture` keeps.
 * The внески it *can* read are returned either way, because the owner is never left with nothing.
 */
export function goalProgress(input: {
  readonly currency: CurrencyCode;
  readonly contributions: readonly Contribution[];
  readonly rates: readonly MonobankRate[];
}): GoalProgress {
  const rateFor = new Map(input.rates.map((rate) => [rate.currency, rate.rateMillionths]));
  const missing = new Set<CurrencyCode>();
  let converted = false;
  let total = 0;
  let holds = true;

  const parts: ProgressPart[] = input.contributions.map(({ accountId, amount }) => {
    if (amount.currency === input.currency) {
      total += amount.amount;
      holds &&= Number.isSafeInteger(total);
      return { accountId, own: amount, inGoalCurrency: amount, converted: false };
    }
    // Every monobank rate is UAH per one unit, so UAH is the only currency the app converts into.
    // A ціль in anything else may hold only рахунки of that one currency — `compositionProblem` is
    // what makes sure of it upstream — but the invariant is asserted here too rather than trusted:
    // without it a EUR ціль holding a USD рахунок would produce a UAH number wearing a EUR code,
    // and every screen below would show it as the ціль's own currency.
    if (input.currency !== CONVERTIBLE_INTO) {
      throw new Error(
        `cannot convert ${amount.currency} into ${input.currency}: rates are quoted in ${CONVERTIBLE_INTO} only`,
      );
    }
    const rateMillionths = rateFor.get(amount.currency);
    if (rateMillionths === undefined) {
      missing.add(amount.currency);
      return { accountId, own: amount, inGoalCurrency: null, converted: false };
    }
    converted = true;
    const equivalent = {
      amount: approximateUah(amount.amount, rateMillionths),
      currency: input.currency,
    };
    total += equivalent.amount;
    holds &&= Number.isSafeInteger(total);
    return { accountId, own: amount, inGoalCurrency: equivalent, converted: true };
  });

  if (missing.size > 0) {
    return { kind: 'unknown', missingCurrencies: [...missing].sort(), parts };
  }
  if (!holds) {
    // Beyond the safe-integer range there is no honest number left, and no currency is to blame:
    // every внесок was readable and it is their sum that is not.
    return { kind: 'unknown', missingCurrencies: [], parts };
  }
  return converted
    ? { kind: 'approximate', total: { amount: total, currency: input.currency }, parts }
    : { kind: 'exact', total: { amount: total, currency: input.currency }, parts };
}

/**
 * `floor(part × 100 / whole)`, clamped at 0 for a negative numerator.
 *
 * Floor is what keeps «99 %» honest: a ціль at 69 999 999 of 70 000 000 must not read 100 %. It
 * makes «100 %» mean exactly «reached» for a ціль-накопичення and exactly «the ceiling is used up
 * and not exceeded» for a ціль витрат, since equality is not over — the ліміт's own rule.
 */
export function percentageOf(part: number, whole: number): number {
  if (part <= 0) {
    return 0;
  }
  return Math.floor((part * 100) / whole);
}

/** How a ціль-накопичення reads. No `exceededBy`, no `mayStillSpend`: those are the other kind's. */
export interface AccumulationReadout {
  /** «48 730 000,00 UAH з 70 000 000,00 UAH», or `null` when the progress cannot be counted. */
  readonly progress: string | null;
  readonly target: string;
  /** `null` while the progress is unknown — a percentage of an unknown is not a number. */
  readonly percentage: number | null;
  /** «Залишилось накопичити …»; `null` once reached, and while the progress is unknown. */
  readonly leftToAccumulate: string | null;
  readonly reached: boolean;
  /** Every сума of this read-out was converted, so it is marked «≈». */
  readonly approximate: boolean;
  /** What to say in place of the progress: which currency cannot be counted, and that it cannot. */
  readonly uncountable: string | null;
}

export function accumulationReadout(
  goal: AccumulationGoal,
  progress: GoalProgress,
): AccumulationReadout {
  const target = formatMoney(goal.target);
  if (progress.kind === 'unknown') {
    return {
      progress: null,
      target,
      percentage: null,
      leftToAccumulate: null,
      // Not reached and not overdue: an unknown progress is not a verdict.
      reached: false,
      approximate: false,
      uncountable:
        progress.missingCurrencies.length > 0
          ? `Прогрес неможливо порахувати зараз: невідомий курс ${progress.missingCurrencies.join(', ')}`
          : 'Прогрес неможливо порахувати зараз',
    };
  }
  const reached = isReached(goal, progress.total);
  return {
    progress: formatMoney(progress.total),
    target,
    percentage: percentageOf(progress.total.amount, goal.target.amount),
    // A reached ціль says so rather than being given a «залишилось» of zero or less.
    leftToAccumulate: reached
      ? null
      : formatMoney({
          amount: goal.target.amount - progress.total.amount,
          currency: goal.target.currency,
        }),
    reached,
    approximate: progress.kind === 'approximate',
    uncountable: null,
  };
}

/** How a ціль витрат reads. No `reached`, no `leftToAccumulate`: those are the other kind's. */
export interface SpendingReadout {
  readonly spent: string;
  readonly ceiling: string;
  /** «Використано 66 %»; **absent once exceeded** — there is no honest percentage past a ceiling. */
  readonly percentageUsed: number | null;
  /** «Можна витратити ще …»; `null` once exceeded. */
  readonly mayStillSpend: string | null;
  /** «Перевищено на …»; `null` while within. */
  readonly exceededBy: string | null;
  readonly state: SpendingGoalState;
}

export function spendingReadout(input: {
  readonly spent: Money;
  readonly ceiling: Money;
  readonly monthEnded: boolean;
}): SpendingReadout {
  const state = spendingGoalState(input);
  const over = state === 'exceeded';
  return {
    spent: formatMoney(input.spent),
    ceiling: formatMoney(input.ceiling),
    // Nothing above 100 is ever produced for a ціль витрат, because past the ceiling there is no
    // percentage at all: «виконано на 124 %» is a lie about a thing the owner did not want.
    percentageUsed: over ? null : percentageOf(input.spent.amount, input.ceiling.amount),
    mayStillSpend: over
      ? null
      : // A negative spent — повернення outrunning витрати — leaves more than the ceiling to spend.
        formatMoney({
          amount: input.ceiling.amount - input.spent.amount,
          currency: input.ceiling.currency,
        }),
    exceededBy: over
      ? formatMoney({
          amount: input.spent.amount - input.ceiling.amount,
          currency: input.ceiling.currency,
        })
      : null,
    state,
  };
}
