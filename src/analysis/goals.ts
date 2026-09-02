import type { Account } from '../domain/account';
import { goalProgress, isOverdue, isReached, type Goal } from '../domain/goals';
import { money, type Money } from '../domain/money';
import { monthOf, type IsoDate, type Month, type Transaction } from '../domain/transaction';
import { decimalOf, type Amount } from './decimal';

/**
 * Every ціль as the пакет carries it: what it is for, how far it has come, what remains, and the
 * pace that would reach it by its own дата.
 *
 * The progress is `goalProgress`'s and nothing else — the linked рахунок's розрахунковий баланс,
 * read the one way the app reads it — so a ціль in the пакет can never disagree with the ціль on
 * «Звіти».
 *
 * The рахунок behind it is deliberately absent: not its назва, not its вид, not its id. A ціль is
 * «відкласти N до дати», and which рахунок the money sits on is the owner's arrangement, not
 * something an assistant needs to explain the pace.
 */

export interface GoalReport {
  readonly name: string;
  readonly target: Amount;
  readonly progress: Amount;
  readonly remaining: Amount;
  readonly deadline: IsoDate;
  readonly reached: boolean;
  readonly overdue: boolean;
  /** Calendar months from the month the пакет is built in through the дата's month, both counted. */
  readonly monthsLeft: number;
  /** `remaining / monthsLeft`; null when the ціль is reached or no month is left. */
  readonly perMonth: Amount | null;
  // deliberately: no рахунок — not its назва, not its вид, not its id
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
  readonly goals: readonly Goal[];
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly builtOn: IsoDate;
}): GoalReport[] {
  const accountsById = new Map(input.accounts.map((a) => [a.id, a]));

  const reports = input.goals.map((goal) => {
    const account = accountsById.get(goal.accountId);
    if (!account) {
      // The same refusal `monthlyPicture` makes: a ціль whose рахунок is not in the list is a
      // broken state, not a ціль with an unknown progress.
      throw new Error(`goal "${goal.name}" references unknown account`);
    }
    const progress = goalProgress(account, input.transactions);
    const reached = isReached(goal, progress);
    // What remains of a reached ціль is nothing — never a negative сума, which would read as a
    // debt where the owner has in fact overshot.
    const remaining = money(
      reached ? 0 : goal.target.amount - progress.amount,
      goal.target.currency,
    );
    const months = monthsLeft(input.builtOn, goal.deadline);

    return {
      name: goal.name,
      target: decimalOf(goal.target),
      progress: decimalOf(progress),
      remaining: decimalOf(remaining),
      deadline: goal.deadline,
      reached,
      overdue: isOverdue(goal, progress, input.builtOn),
      monthsLeft: months,
      perMonth: reached || months === 0 ? null : decimalOf(paceOf(remaining, months)),
    };
  });

  // By дата, then by назва: the nearest ціль first, and never the order the rows were read in.
  return reports.sort((a, b) =>
    a.deadline !== b.deadline
      ? a.deadline < b.deadline
        ? -1
        : 1
      : a.name < b.name
        ? -1
        : a.name > b.name
          ? 1
          : 0,
  );
}
