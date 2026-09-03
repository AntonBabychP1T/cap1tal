import type { AccountKind } from '../domain/account';
import type { AccumulationGoal } from '../domain/goals';
import type { CategoryLimit } from '../domain/limits';
import { overLimit } from '../domain/limits';
import { money, type CurrencyCode, type Money } from '../domain/money';
import type { IsoDate, Month } from '../domain/transaction';
import type { ChallengeDecision, SpendingNorms } from './earned';
import { plural } from './plural';
import type { GoalStanding } from './catalogue';
import {
  completedMonths,
  limitedCategorySpend,
  reserve,
  unansweredIn,
  waitingDraftsIn,
  type ProgressSummary,
} from './summary';

/**
 * The **виклики**: at most three things worth doing now, each with the reason it was proposed, a
 * measurable progress, an unambiguous finish and one action to start from.
 *
 * Everything here is decided from the stored data alone, by ordinary code in a fixed order — two
 * devices holding the same data offer the same виклики in the same sequence. No language model
 * chooses, ranks, words or scores one; a suggestion the owner cannot check against their own
 * numbers is not a suggestion this app makes.
 *
 * **Nothing but the owner's decision is stored.** Every progress below is recomputed from the
 * зведення each time it is asked for, and «Закрий <місяць>» therefore counts *down* from what is
 * there now rather than against a total remembered from when it was proposed — a remembered total
 * would be stored state that the challenges capability forbids (design D9).
 *
 * A виклик never blocks, never warns and never scolds. Dismissing one costs nothing, is counted
 * nowhere, and reduces nothing.
 */

/** The five, in the fixed order of priority the capability names. */
export type ChallengeTemplate =
  | 'close-month'
  | 'reserve-cushion'
  | 'goal-next-quarter'
  | 'limit-hold'
  | 'invest-habit';

export const TEMPLATE_ORDER: readonly ChallengeTemplate[] = [
  'close-month',
  'reserve-cushion',
  'goal-next-quarter',
  'limit-hold',
  'invest-habit',
];

/** At most this many stand at a time. */
export const AT_MOST = 3;
/** How many завершені місяці «Втримай ліміт» and «Інвестиційна звичка» are measured over. */
export const LIMIT_RUN = 3;
export const INVEST_WINDOW = 4;
export const INVEST_TARGET = 3;

/**
 * How far a виклик has come. Two shapes, because two honest kinds of answer exist: a number
 * against a target, and a count of what is still left to do. The second exists so «Закрий
 * <місяць>» can state its progress without a stored denominator.
 */
export type ChallengeProgress =
  | {
      readonly kind: 'against';
      readonly reached: number;
      readonly target: number;
      /** Both numbers are in this currency, when the progress is money rather than a count. */
      readonly currency?: CurrencyCode;
    }
  | { readonly kind: 'remaining'; readonly remaining: number };

/** Where the виклик's one action leads — the screen where the work is actually done. */
export type ChallengeAction =
  | { readonly kind: 'answer-month'; readonly month: Month }
  | { readonly kind: 'record-transfer'; readonly accountKind: AccountKind }
  | { readonly kind: 'open-goal'; readonly goalId: string }
  | { readonly kind: 'open-category-month'; readonly categoryId: string; readonly month: Month }
  | { readonly kind: 'confirm-norm'; readonly currency: CurrencyCode };

export interface Challenge {
  /** `template:parameters`, so a dismissal binds only the виклик it was about. */
  readonly key: string;
  readonly template: ChallengeTemplate;
  readonly name: string;
  /** Why it was proposed, in the owner's own numbers. */
  readonly reason: string;
  readonly progress: ChallengeProgress;
  /** One sentence stating exactly when it is finished. */
  readonly criterion: string;
  readonly action: ChallengeAction;
  /** Derived every time, never stored: the criterion holds, or it does not. */
  readonly finished: boolean;
  /**
   * What must be settled before the виклик can begin — today only the місячна норма витрат of the
   * «Фінансова подушка», where the currency has none.
   */
  readonly firstStep?: { readonly kind: 'confirm-norm'; readonly currency: CurrencyCode };
}

export interface ChallengeInput {
  readonly summary: ProgressSummary;
  readonly today: IsoDate;
  /** The цілі-накопичення with their already-resolved progress; `null` where it is not exact. */
  readonly goals: readonly GoalStanding[];
  readonly limits: readonly CategoryLimit[];
  /** id → назва, for the категорії that carry a ліміт. Display only; nothing is decided from it. */
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly norms: SpendingNorms;
  readonly decisions: readonly ChallengeDecision[];
  /**
   * «Серпень 2026» from '2026-08'. Passed in rather than imported: the Ukrainian month names are
   * a display concern and live in `src/ui/months.ts`, which sits *above* this module — importing
   * them here would turn the layering of design D14 into a cycle.
   */
  readonly monthLabel: (month: Month) => string;
  /**
   * «9 000,00 UAH» from a `Money` — `src/ui/amount-input.ts`'s `formatMoney`, passed in for
   * `monthLabel`'s reason. A виклик states сум to the owner, and «900000 мінорних одиниць» is the
   * register of a debugger, not of a financial app.
   */
  readonly formatMoney: (amount: Money) => string;
}

function decisionFor(input: ChallengeInput, key: string): ChallengeDecision | undefined {
  return input.decisions.find((one) => one.key === key);
}

/** The most recent завершений активний місяць — the one «Закрий <місяць>» is ever about. */
function latestCompletedMonth(input: ChallengeInput): Month | undefined {
  const months = completedMonths(input.summary, input.today);
  return months[months.length - 1];
}

function closeMonth(input: ChallengeInput): Challenge | undefined {
  const month = latestCompletedMonth(input);
  if (month === undefined) {
    return undefined;
  }
  const left = unansweredIn(input.summary, month) + waitingDraftsIn(input.summary, month);
  const label = input.monthLabel(month);
  return {
    key: `close-month:${month}`,
    template: 'close-month',
    name: `Закрий ${label}`,
    reason:
      left === 0
        ? `${label} закрито: жодного запису без відповіді не лишилось.`
        : `У ${label} ще ${left} ${plural(left, 'запис', 'записи', 'записів')} без відповіді — витрати «Без категорії», доходи «Без джерела» та чернетки, які чекають на слово.`,
    // A countdown, and never «7 з 12»: only the owner's decision is stored, so there is no
    // remembered total to read this against. The number only ever falls.
    progress: { kind: 'remaining', remaining: left },
    criterion: `У ${label} не лишилось витрат «Без категорії», доходів «Без джерела» й чернеток, що чекають.`,
    action: { kind: 'answer-month', month },
    finished: left === 0,
  };
}

/**
 * The currency «Фінансова подушка» is about: the first, by code, whose резерв is below its own
 * норма. When no currency has a confirmed норма at all, the currency the owner's record knows best
 * — the one with the most завершені активні місяці, ties broken by the code — and the виклик's
 * first step is confirming that currency's норма.
 */
function cushionCurrency(input: ChallengeInput): CurrencyCode | undefined {
  const short = [...input.norms.keys()]
    .sort()
    .find((currency) => reserve(input.summary, currency).amount < input.norms.get(currency)!.amount.amount);
  if (short !== undefined) {
    return short;
  }
  if (input.norms.size > 0) {
    // Every currency the owner has measured is covered; there is nothing to propose.
    return undefined;
  }
  const completed = completedMonths(input.summary, input.today);
  const monthsPer = new Map<CurrencyCode, number>();
  for (const row of input.summary.months) {
    if (row.transactions > 0 && completed.includes(row.month)) {
      monthsPer.set(row.currency, (monthsPer.get(row.currency) ?? 0) + 1);
    }
  }
  return [...monthsPer.entries()].sort((a, b) =>
    b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1,
  )[0]?.[0];
}

function reserveCushion(input: ChallengeInput): Challenge | undefined {
  const currency = cushionCurrency(input);
  if (currency === undefined) {
    return undefined;
  }
  const norm = input.norms.get(currency);
  const held = reserve(input.summary, currency);
  const criterion = `Резерв у ${currency} — щонайменше одна місячна норма витрат.`;
  if (norm === undefined) {
    return {
      key: `reserve-cushion:${currency}`,
      template: 'reserve-cushion',
      name: 'Фінансова подушка',
      reason: `Щоб виміряти подушку, треба спершу знати, скільки коштує місяць у ${currency}.`,
      // One step left: the number the whole виклик is measured against does not exist yet.
      progress: { kind: 'remaining', remaining: 1 },
      criterion,
      action: { kind: 'confirm-norm', currency },
      finished: false,
      firstStep: { kind: 'confirm-norm', currency },
    };
  }
  return {
    key: `reserve-cushion:${currency}`,
    template: 'reserve-cushion',
    name: 'Фінансова подушка',
    reason: `Резерв у ${currency} — ${input.formatMoney(held)} з ${input.formatMoney(norm.amount)} місячної норми витрат.`,
    progress: { kind: 'against', reached: held.amount, target: norm.amount.amount, currency },
    criterion,
    action: { kind: 'record-transfer', accountKind: 'savings' },
    finished: held.amount >= norm.amount.amount,
  };
}

const QUARTERS: readonly number[] = [25, 50, 75, 100];

function goalNextQuarter(input: ChallengeInput): Challenge | undefined {
  const standing = input.goals
    .filter(
      (one): one is { goal: AccumulationGoal; progress: NonNullable<GoalStanding['progress']> } =>
        one.progress !== null && one.progress.currency === one.goal.target.currency,
    )
    .map(({ goal, progress }) => {
      // The next quarter the progress has not reached, as integer arithmetic: a percentage of
      // money is a comparison, never a division. `reached * 100 < target * q` is exactly
      // `floor(reached * 100 / target) < q`, so this needs no rounding rule of its own — and
      // therefore cannot drift from `percentageOf`'s, which is what «до наступних 25 %» is
      // judged by everywhere else.
      const next = QUARTERS.find(
        (quarter) => progress.amount * 100 < goal.target.amount * quarter,
      );
      if (next === undefined) {
        return undefined;
      }
      // How far short of that quarter it stands, in the ціль's own currency — the number the
      // reason states — and, scaled by the target, the ordering.
      //
      // The **share** still missing, never the сума. Comparing сум would order by the smaller
      // absolute gap, which is a different question: a ціль of 100 000 that needs 10 000 more
      // would beat one of 10 000 000 that needs 100 000 more, even though the first has a tenth
      // of its target to go and the second a hundredth. Scaling by the target is what makes two
      // цілі of different sizes comparable at all.
      //
      // `gap` is a ratio and not a сума: it is never stored, never shown and never added to
      // anything. Its only job is to order, and a double holds the ratio of two integers of this
      // size to about one part in 10^16 — far finer than any two цілі this ordering can separate,
      // with the ціль's id making the order total where it cannot.
      const target = Math.ceil((goal.target.amount * next) / 100);
      return { goal, progress, next, target, gap: (target - progress.amount) / goal.target.amount };
    })
    .filter((one): one is NonNullable<typeof one> => one !== undefined)
    // The ціль closest to its next quarter; the id breaks a tie so two devices agree.
    .sort((a, b) => (a.gap !== b.gap ? a.gap - b.gap : a.goal.id < b.goal.id ? -1 : 1))[0];
  if (standing === undefined) {
    return undefined;
  }
  const { goal, progress, next, target } = standing;
  // Through the domain's own constructor like every other сума in this change, even though it is
  // display-only and non-negative by construction: a сума that skips it is a habit, not an
  // exception.
  const left = money(target - progress.amount, goal.target.currency);
  return {
    key: `goal-next-quarter:${goal.id}`,
    template: 'goal-next-quarter',
    name: `Ціль «${goal.name}» — до наступних 25 %`,
    reason: `Ціль «${goal.name}»: ${input.formatMoney(progress)} з ${input.formatMoney(goal.target)} — до ${next} % лишилось ${input.formatMoney(left)}.`,
    progress: {
      kind: 'against',
      reached: progress.amount,
      target,
      currency: goal.target.currency,
    },
    criterion: `Прогрес цілі «${goal.name}» дійшов до ${next} % її суми.`,
    action: { kind: 'open-goal', goalId: goal.id },
    finished: progress.amount >= target,
  };
}

function limitHold(input: ChallengeInput): Challenge | undefined {
  const completed = completedMonths(input.summary, input.today);
  const wentOver = input.limits
    .map((limit) => {
      const over = completed.filter((month) =>
        overLimit(
          limitedCategorySpend(input.summary, month, limit.amount.currency, limit.categoryId),
          limit.amount,
        ),
      );
      const last = over[over.length - 1];
      return last === undefined ? undefined : { limit, last };
    })
    .filter((one): one is NonNullable<typeof one> => one !== undefined)
    // The категорія that went over most recently; the id breaks a tie.
    .sort((a, b) =>
      a.last !== b.last
        ? a.last < b.last
          ? 1
          : -1
        : a.limit.categoryId < b.limit.categoryId
          ? -1
          : 1,
    )[0];
  if (wentOver === undefined) {
    return undefined;
  }
  const { limit, last } = wentOver;
  const name = input.categoryNames.get(limit.categoryId) ?? limit.categoryId;
  // The window is the data's, never the owner's acceptance: the завершені місяці after the most
  // recent one that went over. Every one of them stayed under, or it would be the latest instead.
  const since = completed.filter((month) => month > last).length;
  const held = Math.min(since, LIMIT_RUN);
  return {
    key: `limit-hold:${limit.categoryId}`,
    template: 'limit-hold',
    name: `Втримай ліміт «${name}»`,
    reason: `Ліміт «${name}» востаннє перевищено у ${input.monthLabel(last)}; відтоді під ним ${held} з ${LIMIT_RUN} завершених місяців.`,
    progress: { kind: 'against', reached: held, target: LIMIT_RUN },
    criterion: `Три завершені місяці поспіль витрати категорії «${name}» не перевищують ліміт.`,
    action: { kind: 'open-category-month', categoryId: limit.categoryId, month: last },
    finished: held >= LIMIT_RUN,
  };
}

function investHabit(input: ChallengeInput): Challenge | undefined {
  const completed = completedMonths(input.summary, input.today);
  if (completed.length === 0) {
    return undefined;
  }
  const window = completed.slice(-INVEST_WINDOW);
  const contributed = window.filter((month) =>
    input.summary.months.some((row) => row.month === month && row.invested > 0),
  ).length;
  return {
    key: 'invest-habit',
    template: 'invest-habit',
    name: 'Інвестиційна звичка',
    reason: `За останні ${window.length} ${plural(window.length, 'завершений місяць', 'завершені місяці', 'завершених місяців')} внески в інвестиції були у ${contributed} з них.`,
    progress: { kind: 'against', reached: contributed, target: INVEST_TARGET },
    criterion: 'У трьох із чотирьох останніх завершених місяців є внесок в інвестиції.',
    action: { kind: 'record-transfer', accountKind: 'investment' },
    finished: contributed >= INVEST_TARGET,
  };
}

const BUILDERS: Readonly<Record<ChallengeTemplate, (input: ChallengeInput) => Challenge | undefined>> =
  {
    'close-month': closeMonth,
    'reserve-cushion': reserveCushion,
    'goal-next-quarter': goalNextQuarter,
    'limit-hold': limitHold,
    'invest-habit': investHabit,
  };

/**
 * Every виклик the data can state right now, in the fixed order of priority — finished ones
 * included, because whether a виклик is finished is something the owner may want to read.
 *
 * A device holding no транзакція states none at all: «Перші кроки» is where a phone with nothing
 * is told what to do, and a виклик must not repeat it.
 */
export function allChallenges(input: ChallengeInput): Challenge[] {
  if (input.summary.history.count === 0) {
    return [];
  }
  return TEMPLATE_ORDER.map((template) => BUILDERS[template](input)).filter(
    (one): one is Challenge => one !== undefined,
  );
}

/**
 * The виклики to offer: unfinished, not dismissed, in the catalogue's order, at most three.
 *
 * A finished виклик stops being proposed — there is nothing left to suggest — and a dismissed one
 * stays away until the owner brings it back **or its parameters change**, which they do the moment
 * the key does: dismissing «Закрий 2026-07» says nothing about «Закрий 2026-08».
 */
export function offered(input: ChallengeInput): Challenge[] {
  return allChallenges(input)
    .filter((one) => !one.finished)
    .filter((one) => decisionFor(input, one.key)?.decision !== 'dismissed')
    .slice(0, AT_MOST);
}

/**
 * The виклики the owner accepted and which are not finished — shown whatever their position, and
 * never capped: the owner chose them, and the cap of three is about what the app *proposes*.
 */
export function accepted(input: ChallengeInput): Challenge[] {
  return allChallenges(input).filter(
    (one) => !one.finished && decisionFor(input, one.key)?.decision === 'accepted',
  );
}

/**
 * The виклики the owner dismissed and which are still unfinished — **not** proposed, and shown
 * only so that «bring a dismissed one back» is something they can actually do.
 *
 * Without this the capability's own «SHALL be able … to bring a dismissed one back» is
 * unreachable: dismissing takes a виклик out of what is offered, and the screen that could undo it
 * was reached only from what is offered. Listing them is not proposing them — they carry no offer
 * and no action, and nothing counts them.
 */
export function dismissed(input: ChallengeInput): Challenge[] {
  return allChallenges(input).filter(
    (one) => !one.finished && decisionFor(input, one.key)?.decision === 'dismissed',
  );
}

/** Whether one виклик's criterion holds — derived, never read from storage. */
export function isFinished(input: ChallengeInput, key: string): boolean {
  return allChallenges(input).find((one) => one.key === key)?.finished ?? false;
}
