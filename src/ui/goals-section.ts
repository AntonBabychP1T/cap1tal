import { activeAccounts, type Account, type AccountKind } from '../domain/account';
import type { Category } from '../domain/category';
import {
  composition,
  compositionProblem,
  type AccumulationGoal,
  type CompositionProblem,
} from '../domain/goals';
import type { CategoryLimit } from '../domain/limits';
import type { CurrencyCode } from '../domain/money';
import type { IsoDate } from '../domain/transaction';
import { withCurrent } from './account-choices';
import { formatMoney, parseAmount } from './amount-input';
import { parseTypedDate } from './dates';
import { byName, categoryLabel, OFFERED_CURRENCIES } from './labels';
import { limitFromDraft } from './limits-section';

/**
 * What the «Цілі» section of Налаштування shows and accepts. Pure, because the section itself is
 * JSX and `verify` never runs JSX — so what a row says, which рахунки are offered and what a
 * filled form becomes are all provable here.
 *
 * Progress is deliberately not part of a row: the section manages цілі, «Звіти» reads them. The
 * one place progress is defined is `ui/goal-progress.ts`, over the внески `domain/goals.ts`
 * produces.
 *
 * The section lists **both** kinds, and the ціль витрат among them is not a second stored thing:
 * it is a категорія's ліміт read as a ціль (design D1), which is why the rows below are built from
 * `goals` **and** `limits`, and why creating one writes through `limitsRepo` rather than here.
 */

/** Which kind a form is about. Asked first, and never asked again of an existing ціль. */
export type GoalKind = 'accumulation' | 'spending';

export const GOAL_KIND_CHOICES: readonly { readonly value: GoalKind; readonly label: string }[] = [
  { value: 'accumulation', label: 'Накопичити' },
  { value: 'spending', label: 'Не перевищити витрати' },
];

/** One ціль-накопичення as the section lists it. */
export interface AccumulationGoalRow {
  readonly kind: 'accumulation';
  readonly id: string;
  readonly name: string;
  /** «700 000,00 UAH» — the target in the ціль's own currency. */
  readonly target: string;
  /** The дата, or `null` where the ціль has none. */
  readonly deadline: IsoDate | null;
  /** The рахунки of the склад by назва while they are few enough to name. */
  readonly accountNames: readonly string[];
  /** «4 рахунки» — what is shown instead when they are too many to name. */
  readonly accountSummary: string | null;
  /** Some рахунок of the склад is archived; the ціль keeps it and says so. */
  readonly hasArchivedAccount: boolean;
}

/** One ціль витрат as the section lists it — the ліміт of its категорія, under its other name. */
export interface SpendingGoalRow {
  readonly kind: 'spending';
  readonly categoryId: string;
  readonly name: string;
  /** «2 000,00 UAH» — the ceiling, which is the ліміт. */
  readonly ceiling: string;
  /** Always the calendar month: the period a ліміт is already judged over. */
  readonly period: string;
  /** The категорія is archived. The ціль stays listed, set apart, so its ceiling can be cleared. */
  readonly archived: boolean;
}

export type GoalRow = AccumulationGoalRow | SpendingGoalRow;

/** Beyond this many рахунки the склад is summarised rather than spelled out. */
const NAMEABLE = 3;

/** How many рахунки, in Ukrainian: «1 рахунок», «3 рахунки», «5 рахунків». */
export function accountCountLabel(n: number): string {
  const lastTwo = Math.abs(n) % 100;
  const last = lastTwo % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${n} рахунків`;
  if (last === 1) return `${n} рахунок`;
  if (last >= 2 && last <= 4) return `${n} рахунки`;
  return `${n} рахунків`;
}

export function goalRows(
  goals: readonly AccumulationGoal[],
  accounts: readonly Account[],
): AccumulationGoalRow[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return goals.map((goal) => {
    const held = goal.accountIds.map((id) => byId.get(id));
    return {
      kind: 'accumulation',
      id: goal.id,
      name: goal.name,
      target: formatMoney(goal.target),
      deadline: goal.deadline ?? null,
      accountNames:
        goal.accountIds.length <= NAMEABLE
          ? // The id where the row is gone, so a ціль never shows an empty gap.
            goal.accountIds.map((id, index) => held[index]?.name ?? id)
          : [],
      accountSummary:
        goal.accountIds.length > NAMEABLE ? accountCountLabel(goal.accountIds.length) : null,
      hasArchivedAccount: held.some((account) => account?.archived === true),
    };
  });
}

/**
 * Every ліміт read as a ціль витрат. Not a second list of ceilings: this **is** the ліміти list,
 * under the other name the owner knows it by, so the two can never disagree.
 *
 * An archived категорія's ціль витрат is listed and set apart, exactly as the «Ліміти» section
 * lists it — a leftover ceiling should be findable from every list that shows one.
 */
export function spendingGoalRows(input: {
  readonly limits: readonly CategoryLimit[];
  readonly categories: readonly Category[];
}): SpendingGoalRow[] {
  const names = new Map(input.categories.map((c) => [c.id, c.name]));
  const archived = new Set(input.categories.filter((c) => c.archived).map((c) => c.id));
  return input.limits
    .map((limit) => ({
      kind: 'spending' as const,
      categoryId: limit.categoryId,
      name: categoryLabel(limit.categoryId, names),
      ceiling: formatMoney(limit.amount),
      period: 'Календарний місяць',
      archived: archived.has(limit.categoryId),
    }))
    .sort((a, b) =>
      a.archived === b.archived
        ? byName({ name: a.name, id: a.categoryId }, { name: b.name, id: b.categoryId })
        : // The archived ones after the rest, set apart exactly as «Ліміти» sets them apart.
          a.archived
          ? 1
          : -1,
    );
}

/**
 * The рахунки the склад offers to tick: the unarchived ones, plus any the ціль already holds even
 * if it has since been archived — the rule stated once in `account-choices.ts`, extended to a set,
 * so editing a ціль never silently drops a рахунок from it.
 */
export function goalAccountChoices(
  accounts: readonly Account[],
  currentAccountIds: readonly string[] = [],
): Account[] {
  return currentAccountIds.reduce(
    (offered, id) => withCurrent(offered, accounts, id),
    [...activeAccounts(accounts)].sort(byName),
  );
}

/**
 * The вид shortcuts the склад offers. Three, because those are the three the owner reaches for —
 * not because a рахунок of another вид is forbidden from a склад; any may be ticked by hand.
 */
export const COMPOSITION_SHORTCUTS: readonly {
  readonly kind: AccountKind;
  readonly label: string;
}[] = [
  { kind: 'investment', label: 'Усі інвестиційні' },
  { kind: 'savings', label: 'Усі накопичувальні' },
  { kind: 'cash', label: 'Усі готівкові' },
];

/**
 * Taking a shortcut: the ticked ids plus the **unarchived** рахунки of that вид **as they stand at
 * this moment** (design D2, D11).
 *
 * It ticks boxes and stores nothing else, which is the whole difference between this and a live
 * scope: a рахунок created afterwards does not silently join the ціль, and archiving one does not
 * silently leave it. A shortcut is a way to tick what is current, not a way to resurrect an
 * archive, so an archived рахунок of that вид is not added — one already ticked stays ticked.
 */
export function tickKind(
  ticked: readonly string[],
  accounts: readonly Account[],
  kind: AccountKind,
): string[] {
  return composition([
    ...ticked,
    ...activeAccounts(accounts)
      .filter((account) => account.kind === kind)
      .map((account) => account.id),
  ]);
}

/** Ticking and unticking one рахунок. The склад is a set, so a second tick is not a second entry. */
export function toggleAccount(ticked: readonly string[], accountId: string): string[] {
  return ticked.includes(accountId)
    ? ticked.filter((id) => id !== accountId)
    : composition([...ticked, accountId]);
}

/** What the склад picker says under itself: how many рахунки are ticked. */
export function tickedLabel(ticked: readonly string[]): string {
  return ticked.length === 0 ? 'Жодного рахунку' : `Вибрано ${accountCountLabel(ticked.length)}`;
}

/** The currencies a ціль may be held in — the same ones a рахунок can be created in. */
export const GOAL_CURRENCIES = OFFERED_CURRENCIES;
export const DEFAULT_GOAL_CURRENCY: CurrencyCode = 'UAH';

/** What the «Накопичити» form holds. The target is in major units, in the ціль's own currency. */
export interface AccumulationDraft {
  readonly name: string;
  readonly target: string;
  readonly currency: CurrencyCode;
  /** May be left empty, and cleared later: a ціль without a дата is a ціль. */
  readonly deadline: string;
  readonly accountIds: readonly string[];
}

/** What the «Не перевищити витрати» form holds. No назва and no дата — neither is a ceiling's. */
export interface SpendingDraft {
  readonly categoryId?: string;
  readonly amount: string;
  readonly currency: CurrencyCode;
}

/**
 * The refusal a склад problem reads as, in the owner's own language — the same rule the repository
 * and the бекап keep, said here while the owner is still typing (design D5).
 */
export function compositionRefusal(problem: CompositionProblem): string {
  switch (problem.kind) {
    case 'empty':
      return 'Ціль потребує хоча б одного рахунку';
    case 'duplicate':
      return 'Рахунок може стояти в цілі лише раз';
    case 'mixed':
      return `Рахунки цілі — у різних валютах (${problem.currencies.join(', ')}), тож ціль може бути тільки в UAH`;
    case 'foreign':
      return `Рахунки цілі — у ${problem.shared}, тож ціль може бути тільки в ${problem.shared} або в UAH`;
  }
}

/**
 * The «Накопичити» form's one decision: either the draft is a ціль-накопичення, or it is refused
 * in the owner's own language (`failureMessage` puts these sentences into an Alert verbatim). The
 * id comes from the caller, as it does for a правило — editing passes the id it already has.
 *
 * The target is parsed in the **ціль's own** currency, which the owner chose: it is no longer taken
 * from a рахунок, because a ціль may stand on several of them.
 */
export function accumulationFromDraft(
  draft: AccumulationDraft,
  context: { readonly id: string; readonly accounts: readonly Account[] },
): AccumulationGoal {
  const name = draft.name.trim();
  if (name === '') {
    throw new Error('Ціль потребує назви');
  }
  if (!GOAL_CURRENCIES.includes(draft.currency as (typeof GOAL_CURRENCIES)[number])) {
    throw new Error(`валюта цілі — одна з ${GOAL_CURRENCIES.join(', ')}`);
  }
  const accountIds = composition(draft.accountIds);
  const held = accountIds.map((id) => {
    const account = context.accounts.find((a) => a.id === id);
    if (!account) {
      throw new Error('Такого рахунку немає');
    }
    return account;
  });
  const problem = compositionProblem(draft.currency, held);
  if (problem) {
    throw new Error(compositionRefusal(problem));
  }
  const trimmedDate = draft.deadline.trim();
  return {
    id: context.id,
    name,
    target: parseAmount(draft.target, draft.currency),
    // Empty means «no дата», not «today»: absence is what the owner asked for.
    ...(trimmedDate === '' ? {} : { deadline: parseTypedDate(trimmedDate) }),
    accountIds,
  };
}

/**
 * The «Не перевищити витрати» form's one decision: a ліміт, which **is** the ціль витрат. It is
 * written through `limitsRepo.set`, so there is one stored сума and no way for two to disagree.
 *
 * The ceiling itself is built by `limitFromDraft` and by nothing else — the same function the
 * «Ліміти» section uses. Two constructions of one row is exactly the second truth design D1 exists
 * to forbid, so this adds the one thing that form does not ask for (which категорія) and then hands
 * over. A ціль витрат has no назва, дата or period of its own to add.
 */
export function spendingFromDraft(draft: SpendingDraft): CategoryLimit {
  if (draft.categoryId === undefined || draft.categoryId === '') {
    throw new Error('Ціль витрат потребує категорії');
  }
  return limitFromDraft(draft.categoryId, { amount: draft.amount, currency: draft.currency });
}

/**
 * The категорії a **new** ціль витрат may be set on: the unarchived ones carrying no ліміт yet.
 *
 * A категорія that already has one is not offered, because its ціль витрат already exists — it is
 * edited where it stands, in either list, rather than created a second time.
 */
export function spendingGoalCategoryChoices(input: {
  readonly categories: readonly Category[];
  readonly limits: readonly CategoryLimit[];
}): Category[] {
  const taken = new Set(input.limits.map((limit) => limit.categoryId));
  return input.categories.filter((c) => !c.archived && !taken.has(c.id)).sort(byName);
}

/**
 * Changing the ціль's currency clears the typed target: the target is entered in that currency, and
 * keeping the digits would reinterpret 700 000 UAH as 700 000 USD. Nothing is converted — the
 * question is simply asked again, the same move the recording form makes.
 */
export function targetAfterCurrencyChange(
  typed: string,
  current: CurrencyCode,
  next: CurrencyCode,
): string {
  return next === current ? typed : '';
}

/** Deleting a ціль is confirmed first, and the sentence says what is — and is not — removed. */
export function deleteGoalConfirmation(row: GoalRow): string {
  return row.kind === 'accumulation'
    ? `Видалити ціль «${row.name}»? Рахунки і їхні транзакції лишаться недоторканими.`
    : `Видалити ціль витрат «${row.name}»? Це зніме ліміт цієї категорії. Категорія, її транзакції та всі місячні числа лишаться такими, як були.`;
}
