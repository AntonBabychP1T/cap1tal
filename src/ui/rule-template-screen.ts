import { activeCategories, isReservedCategory, type Category } from '../domain/category';
import { TEMPLATE_GROUPS, templateTargetOf } from '../domain/rule-template';
import type { SweepCounts } from '../db/categorisation';
import type { TemplateChoice } from '../db/rule-template-repo';
import { withCurrent } from './account-choices';
import { byName } from './labels';
import { sweepSaid, sweepStep } from './list-management';
import type { Named } from './shortlist';

/**
 * What «Базові категорії» shows and does (settings-screen, "The «Базові категорії» section maps the
 * шаблон onto this device's категорії"). Pure, so `verify` proves every row without JSX.
 */

/** Where a базова категорія lands, and why. */
export type TemplateRowState =
  /** Untouched: it follows its типова категорія. */
  | 'default'
  /** The owner pointed it at a категорія of their own choosing. */
  | 'chosen'
  /** The owner switched it off: it matches nothing. */
  | 'off';

export interface TemplateRow {
  readonly groupId: string;
  /** «Продукти» — the базова категорія's name. */
  readonly name: string;
  readonly state: TemplateRowState;
  /** The категорія it lands in; absent when off, or when that категорія is not on this device. */
  readonly categoryId?: string;
  readonly categoryName?: string;
  /** The типова категорія's name as this device calls it, for «типова: …». */
  readonly defaultCategoryName?: string;
  /** What it covers — shown as it is, never editable. */
  readonly merchants: readonly string[];
  readonly mcc: readonly number[];
}

/**
 * Every базова категорія of the шаблон, in the шаблон's order, with where it lands now. A
 * switched-off one stays in the list, marked off, so nothing the шаблон covers disappears; a
 * target this device does not hold names no категорія, which is what "matches nothing" looks like.
 */
export function templateRows(input: {
  readonly choices: ReadonlyMap<string, TemplateChoice>;
  readonly categories: readonly Category[];
}): readonly TemplateRow[] {
  const names = new Map(input.categories.map((c) => [c.id, c.name]));
  return TEMPLATE_GROUPS.map((group) => {
    const choice = input.choices.get(group.id);
    const state: TemplateRowState =
      choice === undefined ? 'default' : choice.kind === 'off' ? 'off' : 'chosen';
    const categoryId = templateTargetOf(
      group,
      choice === undefined ? undefined : choice.kind === 'category' ? choice.categoryId : null,
    );
    const categoryName = categoryId === undefined ? undefined : names.get(categoryId);
    const defaultCategoryName = names.get(group.defaultCategoryId);
    return {
      groupId: group.id,
      name: group.name,
      state,
      ...(categoryId !== undefined && categoryName !== undefined ? { categoryId, categoryName } : {}),
      ...(defaultCategoryName === undefined ? {} : { defaultCategoryName }),
      merchants: group.merchants,
      mcc: group.mcc,
    };
  });
}

/** The line each row carries under its name: where it lands, and whose decision that is. */
export function templateRowLine(row: TemplateRow): string {
  if (row.state === 'off') return 'Вимкнено — нічого не категоризує';
  if (row.categoryName === undefined) return 'Категорії немає на цьому пристрої — нічого не категоризує';
  return row.state === 'chosen' ? `→ ${row.categoryName} · ваш вибір` : `→ ${row.categoryName} · типова`;
}

/**
 * The категорії a базова категорія may be pointed at: every unarchived expense категорія of this
 * device, by name — never a reserved one, which only the app itself puts a транзакція into.
 */
export function templateTargetChoices(categories: readonly Category[]): readonly Category[] {
  return activeCategories(categories)
    .filter((c) => !isReservedCategory(c.id))
    .sort(byName);
}

/**
 * The same targets as the picker draws them, plus whatever the opened базова категорія already
 * sends its продавці to (`currentId`), so the chosen chip always stands among the shown few.
 */
export function templateTargetRows(categories: readonly Category[], currentId: string | undefined): Named[] {
  return withCurrent([...templateTargetChoices(categories)], categories, currentId).map((c) => ({
    id: c.id,
    name: c.name,
  }));
}

/** Said above the list, so nobody mistakes the шаблон for the last word. */
export const TEMPLATE_PRECEDENCE_NOTE =
  'Ваше власне правило завжди сильніше за базову категорію. Якщо шаблон помиляється щодо продавця — додайте правило.';

/**
 * Stores a choice through the caller's `ruleTemplateRepo.choose` and runs its розбір as one
 * журнал operation with its counts, exactly as storing a правило does; answers the sentence to
 * show, or nothing when the розбір moved nothing.
 */
export async function chooseTemplateTarget(
  groupId: string,
  choice: TemplateChoice,
  choose: (groupId: string, choice: TemplateChoice) => SweepCounts,
): Promise<string | undefined> {
  return sweepSaid(await sweepStep('rules/sweep', () => choose(groupId, choice)));
}

/**
 * The launch chore (categorisation-rules, "A newly arrived шаблон sweeps «Без категорії» once"):
 * when the шаблон this app carries has not been swept under, sweep as one журнал operation with
 * its counts; otherwise do nothing and record nothing. It says nothing to the owner — no screen
 * triggered it.
 */
export async function sweepNewTemplate(ports: {
  readonly due: () => boolean;
  readonly sweep: () => SweepCounts | undefined;
}): Promise<void> {
  if (!ports.due()) return;
  await sweepStep('rules/template-sweep', ports.sweep);
}
