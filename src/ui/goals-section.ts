import { activeAccounts, type Account } from '../domain/account';
import type { Goal } from '../domain/goals';
import type { IsoDate } from '../domain/transaction';
import { isoDate } from '../domain/transaction';
import { withCurrent } from './account-choices';
import { formatMoney, parseAmount } from './amount-input';

/**
 * What the «Цілі» section of Налаштування shows and accepts. Pure, because the section itself is
 * JSX and `verify` never runs JSX — so what a row says, which рахунки are offered and what a
 * filled form becomes are all provable here.
 *
 * Progress is deliberately not part of a row: the section manages цілі, «Звіти» reads them. The
 * one place progress is defined is `domain/goals.ts`, and it is the рахунок's розрахунковий
 * баланс wherever it is shown.
 */

/** One ціль as the section lists it. */
export interface GoalRow {
  readonly id: string;
  readonly name: string;
  /** «200 000,00 UAH» — the target with its currency, which is the рахунок's currency. */
  readonly target: string;
  readonly deadline: IsoDate;
  /** The рахунок's назва; its id when the row is gone, so the ціль never shows an empty gap. */
  readonly accountName: string;
  /** The linked рахунок is archived. The ціль stays listed and editable all the same. */
  readonly accountArchived: boolean;
}

export function goalRows(goals: readonly Goal[], accounts: readonly Account[]): GoalRow[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return goals.map((goal) => {
    const account = byId.get(goal.accountId);
    return {
      id: goal.id,
      name: goal.name,
      target: formatMoney(goal.target),
      deadline: goal.deadline,
      accountName: account?.name ?? goal.accountId,
      accountArchived: account?.archived ?? false,
    };
  });
}

/**
 * The рахунки a ціль may be linked to: the unarchived ones. A ціль already linked to a since-
 * archived рахунок keeps it — the same rule every other picker has, stated once in
 * `account-choices.ts` — so editing such a ціль never silently moves it onto another рахунок.
 */
export function goalAccountChoices(
  accounts: readonly Account[],
  currentAccountId: string | undefined,
): Account[] {
  return withCurrent(activeAccounts(accounts), accounts, currentAccountId);
}

/**
 * Re-linking a ціль onto a рахунок of another currency clears the typed target: the target is
 * entered in the рахунок's own currency, and keeping the digits would reinterpret 200 000 UAH as
 * 200 000 USD. The same move the recording form makes when an account choice changes currency —
 * nothing is converted, the question is simply asked again.
 */
export function targetAfterRelink(
  typed: string,
  current: Account | undefined,
  next: Account | undefined,
): string {
  return next && current && next.currency !== current.currency ? '' : typed;
}

/** What the form holds. The target is in major units, in the linked рахунок's currency. */
export interface GoalDraft {
  readonly name: string;
  readonly target: string;
  readonly deadline: string;
  readonly accountId?: string;
}

/**
 * The form's one decision: either the draft is a ціль, or it is refused in the owner's own
 * language (`failureMessage` puts these sentences into an Alert verbatim). The id comes from the
 * caller, as it does for a правило — editing passes the id it already has, creating a new one.
 *
 * The target is parsed in the linked рахунок's currency and nowhere else, which is what makes the
 * currency invariant true before storage ever has to refuse it.
 */
export function goalFromDraft(
  draft: GoalDraft,
  context: { readonly id: string; readonly accounts: readonly Account[] },
): Goal {
  const name = draft.name.trim();
  if (name === '') {
    throw new Error('Ціль потребує назви');
  }
  if (draft.accountId === undefined || draft.accountId === '') {
    throw new Error('Ціль потребує рахунку');
  }
  const account = context.accounts.find((a) => a.id === draft.accountId);
  if (!account) {
    throw new Error('Такого рахунку немає');
  }
  const deadline = isoDate(draft.deadline.trim());
  return {
    id: context.id,
    name,
    target: parseAmount(draft.target, account.currency),
    deadline,
    accountId: account.id,
  };
}

/** Deleting a ціль is confirmed first, and the sentence says what is — and is not — removed. */
export function deleteGoalConfirmation(name: string): string {
  return `Видалити ціль «${name}»? Рахунок і його транзакції лишаться недоторканими.`;
}
