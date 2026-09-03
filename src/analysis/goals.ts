import type { Account } from '../domain/account';
import {
  contribution,
  isOverdue,
  isReached,
  sumContributions,
  type AccumulationGoal,
} from '../domain/goals';
import { money, type Money } from '../domain/money';
import { monthOf, type IsoDate, type Month, type Transaction } from '../domain/transaction';
import { decimalOf, type Amount } from './decimal';

/**
 * Every ціль-накопичення as the пакет carries it: what it is for, how far it has come, what
 * remains, and the pace that would reach it by its own дата.
 *
 * Only цілі-накопичення. A **ціль витрат** is the ліміт of its категорія, and the пакет already
 * carries the ліміти with the сума and the months each was exceeded — a second row for one ceiling
 * would let the assistant read one ліміт as two (design D13).
 *
 * The progress is the sum of the внески, and it is carried **only when it is exact**: when every
 * рахунок of the склад is already in the ціль's currency. That is a pure question over the stored
 * rows, so this module needs no rate and imports nothing from `src/ui`. A ціль whose progress would
 * rest on a conversion is carried with its назва, target and дата and no progress at all — the
 * пакет's own contract is that every сума in it is exact and in one currency, and an approximate
 * one would break it while a partial one would wear a total's name.
 *
 * The рахунки behind a ціль are deliberately absent: not their назви, not their виды, not their
 * number. Which рахунки the money sits on is the owner's arrangement, not something an assistant
 * needs to explain the pace.
 */

export interface GoalReport {
  readonly name: string;
  readonly target: Amount;
  /** Absent for a ціль with no дата: there is no deadline, so there is nothing to name. */
  readonly deadline?: IsoDate;
  /** Absent when the progress would rest on a conversion. */
  readonly progress?: Amount;
  readonly remaining?: Amount;
  readonly reached?: boolean;
  readonly overdue?: boolean;
  /** Calendar months from the month the пакет is built in through the дата's month, both counted. */
  readonly monthsLeft?: number;
  /** `remaining / monthsLeft`; absent when the ціль is reached or no month is left. */
  readonly perMonth?: Amount;
  /**
   * Set only when the progress is not in the пакет, so the файл can say so rather than leaving a
   * gap the assistant would fill with a guess.
   */
  readonly progressNotInPackage?: true;
  // deliberately: no рахунок — not its назва, not its вид, not its id, not their number
}

/**
 * The months left to a дата, counting the month the пакет is built in and the month of the дата
 * themselves.
 *
 * A month that has started still counts. On the 15th of September there are four months to a
 * 31 December дата, exactly as there were on the 1st: the owner still has September to put money
 * aside in, and a pace that dropped the current month would tell them to save a fifth more than
 * they need for no reason. A дата that has already passed leaves 0 — no arithmetic makes a
 * deadline come back.
 */
export function monthsLeft(builtOn: IsoDate, deadline: IsoDate): number {
  if (deadline < builtOn) {
    return 0;
  }
  return monthsBetween(monthOf(builtOn), monthOf(deadline)) + 1;
}

function monthsBetween(from: Month, to: Month): number {
  const parts = (month: Month) => [Number(month.slice(0, 4)), Number(month.slice(5, 7))] as const;
  const [fromYear, fromMonth] = parts(from);
  const [toYear, toMonth] = parts(to);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/**
 * `remaining ÷ monthsLeft`, rounded **up**. A pace is a floor under what has to be put aside, not
 * an average of it: rounding down would name a сума that, followed exactly, misses the target by
 * a few kopiykas — and a ціль that is «almost reached» on its дата is not reached.
 */
function paceOf(remaining: Money, months: number): Money {
  const per = (BigInt(remaining.amount) + BigInt(months) - 1n) / BigInt(months);
  return money(Number(per), remaining.currency);
}

export function goalReports(input: {
  readonly goals: readonly AccumulationGoal[];
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly builtOn: IsoDate;
  /**
   * The поточна вартість of each інвестиційний рахунок that has one, by рахунок id — from the same
   * repo the screens read, so the пакет's progress for a ціль is the identical number «Звіти»
   * shows. Empty until `investments-value` lands, and every caller passes none until then.
   */
  readonly currentValues?: ReadonlyMap<string, Money>;
}): GoalReport[] {
  const accountsById = new Map(input.accounts.map((a) => [a.id, a]));
  const values = input.currentValues ?? new Map<string, Money>();

  const reports = input.goals.map((goal): GoalReport => {
    const held = goal.accountIds.map((id) => {
      const account = accountsById.get(id);
      if (!account) {
        // The same refusal `monthlyPicture` makes: a ціль whose рахунок is not in the list is a
        // broken state, not a ціль with an unknown progress.
        throw new Error(`goal "${goal.name}" references unknown account`);
      }
      return account;
    });

    const target = decimalOf(goal.target);
    const dated = goal.deadline === undefined ? {} : { deadline: goal.deadline };

    // «Is this progress exact» is «is every рахунок of the склад in the ціль's currency» — a pure
    // question over the stored rows, needing no rate and no conversion.
    if (held.some((account) => account.currency !== goal.target.currency)) {
      return { name: goal.name, target, ...dated, progressNotInPackage: true };
    }

    const progress = sumContributions(
      goal.target.currency,
      held.map((account) => contribution(account, input.transactions, values.get(account.id))),
    );
    const reached = isReached(goal, progress);
    // What remains of a reached ціль is nothing — never a negative сума, which would read as a
    // debt where the owner has in fact overshot.
    const remaining = money(
      reached ? 0 : goal.target.amount - progress.amount,
      goal.target.currency,
    );
    // No дата means no pace: there is no deadline to be behind, and the ціль is never overdue.
    const months = goal.deadline === undefined ? undefined : monthsLeft(input.builtOn, goal.deadline);

    return {
      name: goal.name,
      target,
      ...dated,
      progress: decimalOf(progress),
      remaining: decimalOf(remaining),
      reached,
      overdue: isOverdue(goal, progress, input.builtOn),
      ...(months === undefined
        ? {}
        : {
            monthsLeft: months,
            ...(reached || months === 0 ? {} : { perMonth: decimalOf(paceOf(remaining, months)) }),
          }),
    };
  });

  // The цілі with a дата first, by that дата and then by назва; the дата-less ones after, by назва.
  //
  // Stated rather than left to a comparison against `undefined` — every such comparison is false,
  // which would make the comparator non-transitive and the пакет's order depend on the order the
  // stored rows happened to be read in. The пакет's own contract is that it does not.
  return reports.sort((a, b) => {
    if ((a.deadline === undefined) !== (b.deadline === undefined)) {
      return a.deadline === undefined ? 1 : -1;
    }
    if (a.deadline !== undefined && b.deadline !== undefined && a.deadline !== b.deadline) {
      return a.deadline < b.deadline ? -1 : 1;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}
