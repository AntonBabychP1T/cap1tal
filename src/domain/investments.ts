import { computeBalance, type Account } from './account';
import { subtract, type Money } from './money';
import type { IsoDate, Transaction } from './transaction';

/**
 * What an інвестиційний рахунок is worth, against what was put into it. Two numbers and the
 * difference between them: вкладено, read from the рахунок's own транзакції, and the поточна
 * вартість the owner types in — the one figure in the app that is an observation of the outside
 * world rather than a consequence of the owner's money moving.
 *
 * Nothing here writes a транзакція or reaches a monthly number: a прибуток is not дохід, it is not
 * available money, and no month moves because a market did.
 */

/**
 * The поточна вартість of one інвестиційний рахунок: a сума in that рахунок's own currency, and
 * the дата it was entered.
 *
 * The дата is deliberately not part of any arithmetic below — a вартість is as old as the day it
 * was typed, and every screen that shows one shows when that was, so a figure entered in June
 * cannot present itself as today's worth.
 */
export interface CurrentValue {
  readonly amount: Money;
  readonly asOf: IsoDate;
}

/**
 * Вкладено: the рахунок's розрахунковий баланс — its початковий залишок plus the effect of every
 * транзакція touching it. For a рахунок of вид `investment` those транзакції are перекази, so this
 * is exactly «what went in minus what came back out», with the money that was already there before
 * the app counted as put in too — it is, and the owner edits it where every other початковий
 * залишок is edited.
 *
 * There is no second, separately kept total of what was contributed: a number beside the
 * транзакції could disagree with them, which is the drift `goals` already refused for progress.
 *
 * A рахунок of any other вид is rejected rather than answered with its balance: вкладено is a
 * statement about an інвестиція, and a картка has none.
 */
export function contributed(account: Account, transactions: readonly Transaction[]): Money {
  if (account.kind !== 'investment') {
    throw new Error(
      `вкладено exists only for an investment account; "${account.id}" is ${account.kind}`,
    );
  }
  return computeBalance(account, transactions);
}

/**
 * Прибуток / збиток: поточна вартість minus вкладено, in the one currency both stand in —
 * `subtract` refuses to combine two, so a вартість that reached here in another currency is a bug
 * caught rather than a number invented.
 *
 * Absence propagates: no вартість, no прибуток. That is not zero — «worth exactly what went in»
 * and «we do not know what it is worth» are different answers, and only one of them is a number.
 */
export function gainLoss(value: Money | undefined, contributed: Money): Money | undefined {
  return value === undefined ? undefined : subtract(value, contributed);
}
