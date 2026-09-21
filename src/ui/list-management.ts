import type { Account } from '../domain/account';
import {
  isReservedCategory,
  isReservedSource,
  type Category,
  type Source,
} from '../domain/category';
import type { CurrencyCode } from '../domain/money';
import { resolveCategoryIcon } from '../domain/category-icon';
import { matchRule, proposeMerchantPattern, type Rule, type RuleTarget } from '../domain/rules';
import { UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import type { SweepCounts } from '../db/rules-repo';
import { journal } from './journal';
import { accountLabel, byName, categoryLabel, expenseCount } from './labels';
import { categoryIconDefinition } from './category-icons';
import type { IconName } from './icons';

/**
 * What the «Категорії», «Джерела» and «Правила» sections of Налаштування show, and what the rule
 * form accepts. Pure, because the sections themselves are JSX and `verify` never runs JSX
 * (design.md §8) — every decision about which action a row offers is provable here.
 */

export interface ManagedRow {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  /** A reserved row is shown but offers neither rename nor archive. */
  readonly reserved: boolean;
  readonly canRename: boolean;
  readonly canArchive: boolean;
  readonly canUnarchive: boolean;
  /** Present for categories only; sources intentionally have no visual vocabulary. */
  readonly icon?: IconName;
  readonly iconKey?: string;
}

/**
 * One management list: the rows still in use, then the archived ones after them. Archived rows
 * are set apart rather than dropped — the spec keeps them visible so the owner can find what they
 * put away — and each row carries the actions it offers rather than the screen deciding again.
 */
function manage(
  all: readonly { id: string; name: string; archived: boolean }[],
  reserved: (id: string) => boolean,
): ManagedRow[] {
  const managed = (row: { id: string; name: string; archived: boolean }): ManagedRow => {
    const isReserved = reserved(row.id);
    return {
      id: row.id,
      name: row.name,
      archived: row.archived,
      reserved: isReserved,
      canRename: !isReserved,
      // A row already put away offers the way back instead, so archive and unarchive are never
      // both on offer — and a reserved row offers neither, since it can never get archived.
      canArchive: !isReserved && !row.archived,
      canUnarchive: row.archived,
    };
  };
  return [
    ...all.filter((row) => !row.archived).sort(byName).map(managed),
    ...all.filter((row) => row.archived).sort(byName).map(managed),
  ];
}

/**
 * The «Категорії» section. Reservedness is the domain's, not a flag the screen invents: «Без
 * категорії», «Комісія» and «Коригування» are shown like any other row and offer no editing,
 * because default recording, the комісія proposal and коригування attribution depend on them.
 */
export function manageCategories(all: readonly Category[]): ManagedRow[] {
  const icons = new Map(all.map((row) => [row.id, row]));
  return manage(all, isReservedCategory).map((row) => {
    const category = icons.get(row.id)!;
    const iconKey = resolveCategoryIcon(category);
    return { ...row, iconKey, icon: categoryIconDefinition(iconKey).glyph };
  });
}

/**
 * The «Джерела» section. One джерело is reserved: «Відсотки», which the відсотки proposal picks
 * by id when a repayment exceeds the principal — so it is shown and offered like any other row,
 * and offers neither rename nor archive.
 */
export function manageSources(all: readonly Source[]): ManagedRow[] {
  return manage(all, isReservedSource);
}

export interface RuleDraft {
  readonly merchant: string;
  /** As typed; empty means the rule has no MCC. */
  readonly mcc: string;
  /** Which target the form is filling in — the other one's id is dropped when this is saved. */
  readonly target: 'category' | 'transfer';
  readonly categoryId?: string;
  readonly toAccountId?: string;
}

/**
 * The rule form's one decision: either the draft is a rule, or it is refused in the owner's own
 * language (`failureMessage` puts these in an Alert verbatim). The id and the creation moment
 * come from the caller because this stays pure — and `createdAt` is domain data here, the
 * tie-breaker matching falls back on, not storage metadata (design.md §5).
 *
 * `draft.target` decides which of `categoryId` / `toAccountId` is read; the other is dropped even
 * when the form still carries it from before the owner switched — switching the target SHALL drop
 * the choice made for the other (categorisation-rules, settings-screen).
 */
export function ruleFromDraft(
  draft: RuleDraft,
  context: { readonly id: string; readonly createdAt: Date },
): Rule {
  // A merchant pattern is what is left of it after trimming, so spaces alone are no criterion.
  const merchant = draft.merchant.trim();
  const typed = draft.mcc.trim();
  // Digits and nothing else: `Number` would take '0x15', '1e3' and '-5' for whole numbers, and an
  // MCC that is not the one the owner typed is a rule that never matches what they meant.
  if (typed !== '' && !/^\d+$/.test(typed)) {
    throw new Error('MCC — це число з цифр, напр. 5411');
  }
  const mcc = typed === '' ? undefined : Number(typed);
  if (merchant === '' && mcc === undefined) {
    throw new Error('Правило потребує продавця або MCC');
  }
  let target: RuleTarget;
  if (draft.target === 'transfer') {
    if (draft.toAccountId === undefined || draft.toAccountId === '') {
      throw new Error('Правило потребує рахунку призначення');
    }
    target = { kind: 'transfer', toAccountId: draft.toAccountId };
  } else {
    if (draft.categoryId === undefined || draft.categoryId === '') {
      throw new Error('Правило потребує категорії');
    }
    target = { kind: 'category', categoryId: draft.categoryId };
  }
  return {
    id: context.id,
    ...(merchant === '' ? {} : { merchant }),
    ...(mcc === undefined ? {} : { mcc }),
    target,
    createdAt: context.createdAt,
  };
}

/**
 * A `RuleTarget`'s own label: the category's name, or «переказ на <назва>» for a правило-переказ.
 * A rule keeps working into an archived категорія or рахунок, so both names are resolved the same
 * way — and an id either map misses shows itself rather than leaving the line blank.
 */
export function ruleTargetLabel(
  target: RuleTarget,
  categoryNames: ReadonlyMap<string, string>,
  accountNames: ReadonlyMap<string, string>,
): string {
  return target.kind === 'category'
    ? categoryLabel(target.categoryId, categoryNames)
    : `переказ на ${accountLabel(target.toAccountId, accountNames)}`;
}

/** How the «Правила» list shows one rule: its criteria and the target's own label. */
export function ruleLine(
  rule: Rule,
  categoryNames: ReadonlyMap<string, string>,
  accountNames: ReadonlyMap<string, string>,
): { readonly id: string; readonly criteria: string; readonly category: string } {
  const criteria: string[] = [];
  if (rule.merchant) {
    criteria.push(rule.merchant);
  }
  if (rule.mcc !== undefined) {
    criteria.push(`MCC ${rule.mcc}`);
  }
  return {
    id: rule.id,
    // Both criteria read as one line, joined the way an account choice joins its currency.
    criteria: criteria.join(' · '),
    category: ruleTargetLabel(rule.target, categoryNames, accountNames),
  };
}

/** What the offer to remember a правило proposes: the pattern, editable, and the target it names. */
export interface RuleOffer {
  readonly merchant: string;
  readonly target: RuleTarget;
}

function sameTarget(a: RuleTarget, b: RuleTarget): boolean {
  return a.kind === 'category' && b.kind === 'category'
    ? a.categoryId === b.categoryId
    : a.kind === 'transfer' && b.kind === 'transfer' && a.toAccountId === b.toAccountId;
}

/**
 * Whether setting a категорія on a stored витрата or повернення — or retyping one into a переказ —
 * should offer to remember it as a правило, and what that offer would say (design D5, D6).
 *
 * Nothing is offered for a транзакція with no опис — there is no pattern to propose, and a
 * правило with neither a merchant nor an MCC is rejected — nor for «Без категорії», which is not a
 * категорія a правило may target. Nor is anything offered when the owner's правила already give
 * that опис the same target: the правило that would be written already exists, under whatever
 * pattern it carries. For a переказ, `fromAccount` and `accounts` are what let that check run at
 * all — with no source known (recording by hand), and for a destination in another currency than
 * the source, no offer is made either, since such a правило would never match it.
 */
export function ruleOffer(input: {
  readonly description?: string;
  readonly target: RuleTarget;
  readonly fromAccount?: { readonly accountId: string; readonly currency: CurrencyCode };
  readonly accounts?: readonly Pick<Account, 'id' | 'currency'>[];
  readonly rules: readonly Rule[];
}): RuleOffer | undefined {
  const target = input.target;
  if (target.kind === 'category' && target.categoryId === UNCATEGORISED_CATEGORY_ID) {
    return undefined;
  }
  const merchant = proposeMerchantPattern(input.description);
  if (merchant === undefined) {
    return undefined;
  }
  if (target.kind === 'transfer') {
    const destination = input.accounts?.find((a) => a.id === target.toAccountId);
    if (
      input.fromAccount === undefined ||
      destination === undefined ||
      destination.currency !== input.fromAccount.currency
    ) {
      return undefined;
    }
  }
  const existing = matchRule(
    input.rules,
    {
      description: input.description ?? '',
      ...(input.fromAccount ? { from: input.fromAccount } : {}),
    },
    input.accounts ?? [],
  );
  if (existing !== undefined && sameTarget(existing, input.target)) {
    return undefined;
  }
  return { merchant, target: input.target };
}

/**
 * The one seam every screen stores a правило through: «Правила», the offer from the feed and the
 * offer from editing alike (design D6). Wraps the save in `journal.step`, so the журнал carries
 * one operation per pass with its counts and nothing else, and returns the sentence to show when
 * the sweep moved anything — or nothing when it moved nothing ("A pass that moved nothing says
 * nothing").
 *
 * `save` is the caller's `rulesRepo.save`, taken as a port rather than imported here: this module
 * stays plain TypeScript with no dependency on `src/db`, which is what lets `verify` run it with
 * no database at all.
 */
export async function storeRule(
  rule: Rule,
  save: (rule: Rule) => SweepCounts,
): Promise<string | undefined> {
  const counts = await journal.step('rules/sweep', async () => save(rule), {
    ending: (c) => ({
      counts: {
        examined: c.examined,
        moved: c.moved,
        transferred: c.transferred,
        absorbed: c.absorbed,
      },
    }),
  });
  const said: string[] = [];
  if (counts.moved > 0) said.push(`${expenseCount(counts.moved)} перекатегоризовано.`);
  if (counts.transferred > 0) said.push(`${expenseCount(counts.transferred)} стали переказами.`);
  return said.length > 0 ? said.join(' ') : undefined;
}
