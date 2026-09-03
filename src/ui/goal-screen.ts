import type { Account } from '../domain/account';
import { contribution, isOverdue, type AccumulationGoal } from '../domain/goals';
import type { Money } from '../domain/money';
import type { IsoDate, Transaction } from '../domain/transaction';
import { formatMoney } from './amount-input';
import { todayIso } from './dates';
import {
  accumulationReadout,
  goalProgress,
  type AccumulationReadout,
  type Contribution,
} from './goal-progress';

/**
 * The screen behind one ціль-накопичення: its progress with the mark it earned, and the внесок of
 * every рахунок of its склад — so «why does cap1tal think there is already 487 300 for the car» is
 * answered on one screen instead of in the owner's head.
 *
 * It reads and records nothing. A ціль витрат has no model here at all: choosing one opens the
 * existing категорія-month screen, where its транзакції already are, and a second listing of the
 * same транзакції under the ціль's name is exactly what this change refuses to build.
 */

/** The поточна вартість of one інвестиційний рахунок, with the дата that вартість describes. */
export interface CurrentValue {
  readonly amount: Money;
  /**
   * The day the owner entered it. Display-only, and deliberately not part of `contribution`: the
   * domain computes a сума, and a дата is not one. It is here because a hand-entered вартість is as
   * old as the day it was typed, and a progress resting on one should say when that was.
   */
  readonly asOf: IsoDate;
}

/** One рахунок of the склад, and what it brought. */
export interface GoalAccountRow {
  readonly accountId: string;
  readonly name: string;
  /** The внесок in the рахунок's **own** currency — the truth, never replaced by a conversion. */
  readonly own: string;
  /**
   * «≈ 123 750,00 UAH» — what it contributed in the ціль's currency, shown beside the native сума.
   * `null` for a рахунок already in the ціль's currency: one сума needs no second line.
   */
  readonly approximateInGoalCurrency: string | null;
  /** The rate to convert this рахунок's currency is unknown, so its внесок could not be counted. */
  readonly rateUnknown: boolean;
  /** The рахунок is archived. It is listed, marked, and still counted. */
  readonly archived: boolean;
  /**
   * «поточна вартість на 2026-08-28» — set only where the внесок **is** an інвестиційний рахунок's
   * поточна вартість, so the owner can see the розрахунковий баланс was not what was counted.
   */
  readonly valueAsOf: IsoDate | null;
}

export type GoalScreenModel =
  | { readonly kind: 'gone'; readonly message: string }
  | {
      readonly kind: 'goal';
      readonly name: string;
      readonly deadline: IsoDate | null;
      readonly overdue: boolean;
      readonly readout: AccumulationReadout;
      readonly accounts: readonly GoalAccountRow[];
    };

export function goalScreenModel(input: {
  /** The ціль, or `undefined` when it was deleted while this screen was open. */
  readonly goal: AccumulationGoal | undefined;
  readonly accounts: readonly Account[];
  /** The whole stored history — `transactionsRepo.listAll()`, as «Звіти» reads it. */
  readonly transactions: readonly Transaction[];
  readonly rates: readonly { readonly currency: string; readonly rateMillionths: number }[];
  /** The поточні вартості by рахунок id; empty until `investments-value` lands. */
  readonly currentValues?: ReadonlyMap<string, CurrentValue>;
  readonly now: Date;
}): GoalScreenModel {
  if (!input.goal) {
    return { kind: 'gone', message: 'Цієї цілі більше немає.' };
  }
  const goal = input.goal;
  const byId = new Map(input.accounts.map((a) => [a.id, a]));
  const values = input.currentValues ?? new Map<string, CurrentValue>();

  const held = goal.accountIds.flatMap((id) => {
    const account = byId.get(id);
    return account ? [account] : [];
  });
  const contributions: Contribution[] = held.map((account) => ({
    accountId: account.id,
    // The вартість's сума alone reaches the domain; its дата travels beside it, to the row below.
    amount: contribution(account, input.transactions, values.get(account.id)?.amount),
  }));

  const progress = goalProgress({
    currency: goal.target.currency,
    contributions,
    rates: input.rates,
  });
  const readout = accumulationReadout(goal, progress);

  const accounts: GoalAccountRow[] = progress.parts.map((part, index) => {
    const account = held[index]!;
    const value = account.kind === 'investment' ? values.get(account.id) : undefined;
    return {
      accountId: part.accountId,
      name: account.name,
      own: formatMoney(part.own),
      // Only for a рахунок in another currency: one already in the ціль's gets no second line.
      approximateInGoalCurrency:
        part.converted && part.inGoalCurrency ? `≈ ${formatMoney(part.inGoalCurrency)}` : null,
      rateUnknown: part.inGoalCurrency === null,
      archived: account.archived,
      valueAsOf: value ? value.asOf : null,
    };
  });

  return {
    kind: 'goal',
    name: goal.name,
    deadline: goal.deadline ?? null,
    // An unknown progress is no verdict, so a ціль whose rate is missing is not called overdue.
    overdue:
      progress.kind === 'unknown'
        ? false
        : isOverdue(goal, progress.total, todayIso(input.now)),
    readout,
    accounts,
  };
}
