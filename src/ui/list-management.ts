import {
  isReservedCategory,
  isReservedSource,
  type Category,
  type Source,
} from '../domain/category';
import { matchRule, proposeMerchantPattern, type Rule } from '../domain/rules';
import { UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import type { SweepCounts } from '../db/rules-repo';
import { journal } from './journal';
import { byName, categoryLabel, expenseCount } from './labels';

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
  return manage(all, isReservedCategory);
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
  readonly categoryId?: string;
}

/**
 * The rule form's one decision: either the draft is a rule, or it is refused in the owner's own
 * language (`failureMessage` puts these in an Alert verbatim). The id and the creation moment
 * come from the caller because this stays pure — and `createdAt` is domain data here, the
 * tie-breaker matching falls back on, not storage metadata (design.md §5).
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
  if (draft.categoryId === undefined || draft.categoryId === '') {
    throw new Error('Правило потребує категорії');
  }
  return {
    id: context.id,
    ...(merchant === '' ? {} : { merchant }),
    ...(mcc === undefined ? {} : { mcc }),
    categoryId: draft.categoryId,
    createdAt: context.createdAt,
  };
}

/** How the «Правила» list shows one rule: its criteria and the target category's name. */
export function ruleLine(
  rule: Rule,
  categoryNames: ReadonlyMap<string, string>,
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
    // A rule keeps working into an archived category, so the name is resolved like any other —
    // and an id the map misses shows itself rather than leaving the line blank.
    category: categoryLabel(rule.categoryId, categoryNames),
  };
}

/** What the offer to remember a правило proposes: the pattern, editable, and the target it names. */
export interface RuleOffer {
  readonly merchant: string;
  readonly categoryId: string;
}

/**
 * Whether setting a категорія on a stored витрата or повернення should offer to remember it as a
 * правило, and what that offer would say (design D5).
 *
 * Nothing is offered for a транзакція with no опис — there is no pattern to propose, and a
 * правило with neither a merchant nor an MCC is rejected — nor for «Без категорії», which is not a
 * категорія a правило may target. Nor is anything offered when the owner's правила already give
 * that опис this same категорія: the правило that would be written already exists, under whatever
 * pattern it carries.
 */
export function ruleOffer(input: {
  readonly description?: string;
  readonly categoryId: string;
  readonly rules: readonly Rule[];
}): RuleOffer | undefined {
  if (input.categoryId === UNCATEGORISED_CATEGORY_ID) {
    return undefined;
  }
  const merchant = proposeMerchantPattern(input.description);
  if (merchant === undefined) {
    return undefined;
  }
  if (matchRule(input.rules, { description: input.description ?? '' }) === input.categoryId) {
    return undefined;
  }
  return { merchant, categoryId: input.categoryId };
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
    ending: (c) => ({ counts: { examined: c.examined, moved: c.moved } }),
  });
  return counts.moved > 0 ? `${expenseCount(counts.moved)} перекатегоризовано.` : undefined;
}
