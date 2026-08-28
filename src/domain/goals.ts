import { computeBalance, type Account } from './account';
import type { Money } from './money';
import type { IsoDate, Transaction } from './transaction';

/**
 * The ціль of the glossary: «відкласти N до дати», on one рахунок.
 *
 * There is no progress field, and that is the decision the capability rests on: progress is the
 * linked рахунок's розрахунковий баланс, read at the moment the ціль is shown. A second,
 * hand-maintained number could drift from the stored truth, and then two answers to "how much is
 * there" would both be in the app — so money reaches a ціль only the way money reaches its
 * рахунок.
 */
export interface Goal {
  readonly id: string;
  readonly name: string;
  /** The target, in the linked рахунок's own currency — nothing here is ever converted. */
  readonly target: Money;
  /** The дата: a calendar date, like every other date in the domain. */
  readonly deadline: IsoDate;
  readonly accountId: string;
}

/**
 * A ціль's progress: the linked рахунок's розрахунковий баланс, and nothing else. Said once here
 * so no screen can arrive at it another way — a переказ into the рахунок moves the progress
 * because it moves the баланс, and an archived рахунок keeps feeding its ціль because archiving
 * does not touch a баланс either.
 *
 * The транзакції are the рахунок's own, as `computeBalance` wants them; giving it more is harmless
 * — it takes only what touches the account.
 */
export function goalProgress(account: Account, transactions: readonly Transaction[]): Money {
  return computeBalance(account, transactions);
}

/**
 * Reached: the progress is at the target or above it. At the target counts — a ціль is «відкласти
 * N», and N is N. The two amounts are in the рахунок's currency, which is the ціль's currency too;
 * anything else is a ціль that should never have been stored (`goals-repo` refuses it).
 */
export function isReached(goal: Goal, progress: Money): boolean {
  if (progress.currency !== goal.target.currency) {
    throw new Error(
      `cannot judge ${progress.currency} progress against a ${goal.target.currency} target`,
    );
  }
  return progress.amount >= goal.target.amount;
}

/**
 * Overdue: the дата has passed and the ціль is not reached. A reached ціль is never overdue, and a
 * ціль whose дата is today is not overdue yet — the day is not over.
 *
 * `today` is an argument and never a clock read here: the domain reads no clock, and a test that
 * has to pin the date is the only kind that can prove "last year" means anything.
 */
export function isOverdue(goal: Goal, progress: Money, today: IsoDate): boolean {
  return goal.deadline < today && !isReached(goal, progress);
}
