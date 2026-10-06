import type { Account } from '../domain/account';
import {
  isReservedCategory,
  isReservedSource,
  type Category,
  type Source,
} from '../domain/category';
import type { CurrencyCode } from '../domain/money';
import { resolveCategoryIcon } from '../domain/category-icon';
import { foldCase } from '../domain/fold';
import type { MerchantIndex } from '../domain/merchants';
import { matchRule, proposeMerchantPattern, type Rule, type RuleTarget } from '../domain/rules';
import { UNCATEGORISED_CATEGORY_ID, UNSOURCED_SOURCE_ID, type Transaction } from '../domain/transaction';
import type { SweepCounts } from '../db/rules-repo';
import { accountChoicesFor } from './account-choices';
import { categoryChoicesFor, sourceChoicesFor } from './category-choices';
import { journal } from './journal';
import {
  accountChoiceLabel,
  accountLabel,
  byName,
  categoryLabel,
  expenseCount,
  incomeCount,
  plural,
  sourceLabel,
} from './labels';
import type { Named } from './shortlist';
import { categoryIconDefinition } from './category-icons';
import type { IconName } from './icons';
import { Refusal } from '../domain/refusal';

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
  /** The pattern as typed; read only while `criterion` is the pattern. */
  readonly merchant: string;
  /**
   * What the rule matches by — a pattern typed by hand, or a продавець picked — absent meaning the
   * pattern. The other one's value is dropped when this is saved, so a rule never names both.
   */
  readonly criterion?: 'pattern' | 'merchant';
  readonly merchantId?: string;
  /** As typed; empty means the rule has no MCC. */
  readonly mcc: string;
  /** Which target the form is filling in — the other one's id is dropped when this is saved. */
  readonly target: 'category' | 'transfer' | 'source';
  readonly categoryId?: string;
  readonly toAccountId?: string;
  /** A правило-джерело's джерело; never «Без джерела», which the picker does not offer. */
  readonly sourceId?: string;
}

/** What «Нове правило» opens on — and so what an untouched one is compared against. */
export const EMPTY_RULE_DRAFT: RuleDraft = {
  merchant: '',
  criterion: 'pattern',
  mcc: '',
  target: 'category',
  categoryId: undefined,
};

/**
 * «Категорія» of a правило as the picker draws it: what a витрата's категорія picker offers, plus
 * the one an edited правило already names, so it is not silently retargeted.
 */
export function ruleCategoryRows(categories: readonly Category[], currentId: string | undefined): Named[] {
  return categoryChoicesFor(categories, currentId).map((c) => ({ id: c.id, name: c.name }));
}

/** «Переказ на» of a правило as the picker draws it: every вид, each рахунок wearing its currency. */
export function ruleAccountRows(accounts: readonly Account[], currentId: string | undefined): Named[] {
  return accountChoicesFor(accounts, currentId).map((a) => ({ id: a.id, name: accountChoiceLabel(a) }));
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
  // A merchant pattern is what is left of it after trimming, so spaces alone are no criterion. Only
  // the criterion the form is on is read: switching to a продавець drops the typed pattern, and
  // switching back drops the продавець picked.
  const byMerchant = draft.criterion === 'merchant';
  const merchant = byMerchant ? '' : draft.merchant.trim();
  const merchantId = byMerchant && draft.merchantId ? draft.merchantId : undefined;
  const typed = draft.mcc.trim();
  // Exactly four digits and nothing else: `Number` would take '0x15', '1e3' and '-5' for whole
  // numbers, and a merchant category code is four digits (ISO 18245) — '999999' or '541' is no
  // code the bank ever sends. An MCC that is not one the bank can send is a rule that never
  // matches what the owner meant, so it is refused rather than saved.
  if (typed !== '' && !/^\d{4}$/.test(typed)) {
    throw new Refusal('MCC — це чотири цифри, напр. 5411');
  }
  const mcc = typed === '' ? undefined : Number(typed);
  if (merchant === '' && merchantId === undefined && mcc === undefined) {
    throw new Refusal('Правило потребує продавця або MCC');
  }
  let target: RuleTarget;
  if (draft.target === 'transfer') {
    if (draft.toAccountId === undefined || draft.toAccountId === '') {
      throw new Refusal('Правило потребує рахунку призначення');
    }
    target = { kind: 'transfer', toAccountId: draft.toAccountId };
  } else if (draft.target === 'source') {
    if (draft.sourceId === undefined || draft.sourceId === '') {
      throw new Refusal('Правило потребує джерела');
    }
    target = { kind: 'source', sourceId: draft.sourceId };
  } else {
    if (draft.categoryId === undefined || draft.categoryId === '') {
      throw new Refusal('Правило потребує категорії');
    }
    target = { kind: 'category', categoryId: draft.categoryId };
  }
  return {
    id: context.id,
    ...(merchant === '' ? {} : { merchant }),
    ...(merchantId === undefined ? {} : { merchantId }),
    ...(mcc === undefined ? {} : { mcc }),
    target,
    createdAt: context.createdAt,
  };
}

/**
 * The джерела the rule form offers a правило-джерело (settings-screen, "The джерело picker offers
 * no «Без джерела»"): the unarchived ones, and the archived one an edited правило already names so
 * it is not silently retargeted — but never «Без джерела», which is no target, whatever is stored.
 */
export function ruleSourceChoices(
  all: readonly Source[],
  currentSourceId: string | undefined,
): Source[] {
  return sourceChoicesFor(all, currentSourceId).filter((s) => s.id !== UNSOURCED_SOURCE_ID);
}

/** «Джерело» of a правило as the picker draws it: `ruleSourceChoices`, as rows of the picker. */
export function ruleSourceRows(all: readonly Source[], currentSourceId: string | undefined): Named[] {
  return ruleSourceChoices(all, currentSourceId).map((s) => ({ id: s.id, name: s.name }));
}

/** What the rule form says when no продавець is stored to pick: where продавці are named. */
export const NO_MERCHANT_TO_PICK = 'Продавців ще немає — їх називають у «Продавці» в Налаштуваннях.';

/**
 * A `RuleTarget`'s own label: the category's name, «переказ на <назва>» for a правило-переказ, or
 * «джерело <назва>» for a правило-джерело.
 * A rule keeps working into an archived категорія or рахунок, so both names are resolved the same
 * way — and an id either map misses shows itself rather than leaving the line blank.
 */
export function ruleTargetLabel(
  target: RuleTarget,
  categoryNames: ReadonlyMap<string, string>,
  accountNames: ReadonlyMap<string, string>,
  sourceNames: ReadonlyMap<string, string> = new Map(),
): string {
  if (target.kind === 'category') return categoryLabel(target.categoryId, categoryNames);
  if (target.kind === 'source') return `джерело ${sourceLabel(target.sourceId, sourceNames)}`;
  return `переказ на ${accountLabel(target.toAccountId, accountNames)}`;
}

/**
 * A stored MCC as the owner reads and types it: four digits, the leading zero put back. The rule
 * keeps the bank's number (0742 is stored as 742, the way monobank sends it), so the text is
 * padded wherever it is shown — the list line and the edit form alike; an edit form refilled with
 * «742» would refuse its own untouched правило.
 */
export function mccText(mcc: number): string {
  return String(mcc).padStart(4, '0');
}

/** How the «Правила» list shows one rule: its criteria and the target's own label. */
export function ruleLine(
  rule: Rule,
  categoryNames: ReadonlyMap<string, string>,
  accountNames: ReadonlyMap<string, string>,
  /** The продавці by id, for a rule that names one — «продавець АТБ» (settings-screen). */
  merchantNames: ReadonlyMap<string, string> = new Map(),
  /** The джерела by id, for a правило-джерело — «джерело Зарплата» (settings-screen). */
  sourceNames: ReadonlyMap<string, string> = new Map(),
): { readonly id: string; readonly criteria: string; readonly category: string } {
  const criteria: string[] = [];
  if (rule.merchant) {
    criteria.push(rule.merchant);
  }
  if (rule.merchantId !== undefined) {
    criteria.push(`продавець ${merchantNames.get(rule.merchantId) ?? rule.merchantId}`);
  }
  if (rule.mcc !== undefined) {
    criteria.push(`MCC ${mccText(rule.mcc)}`);
  }
  return {
    id: rule.id,
    // Both criteria read as one line, joined the way an account choice joins its currency.
    criteria: criteria.join(' · '),
    category: ruleTargetLabel(rule.target, categoryNames, accountNames, sourceNames),
  };
}

/**
 * What the offer to remember a правило proposes, and the target it names. When the опис is
 * recognised as a продавець, that продавець is the proposed criterion and `merchant` is the pattern
 * the owner may switch to instead; otherwise `merchant` is the criterion, editable either way.
 */
export interface RuleOffer {
  /** The pattern proposed from the опис (`proposeMerchantPattern`). */
  readonly merchant: string;
  /** The продавець the опис is recognised as, proposed ahead of the pattern. */
  readonly recognised?: { readonly merchantId: string; readonly name: string };
  readonly target: RuleTarget;
}

/** What the owner accepts an offer with: the продавець it proposed, or a pattern. */
export type RuleCriterion =
  | { readonly kind: 'merchant'; readonly merchantId: string }
  | { readonly kind: 'pattern'; readonly pattern: string };

/**
 * How the offer reads while it is showing (main-screen, "Categorising a транзакція offers to
 * remember it as a правило"): what the правило will do, said by its target's kind
 * (categorisation-rules, "The offer to remember a правило says what that правило will do"; design
 * D17), «продавець <назва>» with a way to switch to the pattern, or the pattern field, and what the
 * accept button stores in either state. `usePattern` is the owner's switch; an offer with no
 * продавець is always on the pattern.
 */
export function ruleOfferView(
  offer: RuleOffer,
  usePattern: boolean,
  pattern: string,
  names: {
    readonly categoryNames: ReadonlyMap<string, string>;
    readonly accountNames: ReadonlyMap<string, string>;
    readonly sourceNames?: ReadonlyMap<string, string>;
  },
): {
  readonly sentence: string;
  readonly targetLabel: string;
  readonly merchantLabel?: string;
  readonly showsPattern: boolean;
  readonly canSwitchToPattern: boolean;
  readonly criterion: RuleCriterion;
} {
  const { target } = offer;
  const sourceNames = names.sourceNames ?? new Map<string, string>();
  const said = {
    sentence:
      target.kind === 'category'
        ? `Наступного разу такий опис одразу піде в «${categoryLabel(target.categoryId, names.categoryNames)}».`
        : target.kind === 'source'
          ? `Гроші з таким описом отримають джерело «${sourceLabel(target.sourceId, sourceNames)}».`
          : `Наступного разу такий опис одразу стане переказом на «${accountLabel(target.toAccountId, names.accountNames)}».`,
    targetLabel: ruleTargetLabel(target, names.categoryNames, names.accountNames, sourceNames),
  };
  if (offer.recognised !== undefined && !usePattern) {
    return {
      ...said,
      merchantLabel: `продавець ${offer.recognised.name}`,
      showsPattern: false,
      canSwitchToPattern: true,
      criterion: { kind: 'merchant', merchantId: offer.recognised.merchantId },
    };
  }
  return { ...said, showsPattern: true, canSwitchToPattern: false, criterion: { kind: 'pattern', pattern } };
}

/** The draft an accepted offer is stored through, so it is refused in the same words as the form. */
export function ruleDraftFromOffer(offer: RuleOffer, criterion: RuleCriterion): RuleDraft {
  return {
    ...(criterion.kind === 'merchant'
      ? { criterion: 'merchant', merchant: '', merchantId: criterion.merchantId }
      : { criterion: 'pattern', merchant: criterion.pattern }),
    mcc: '',
    target: offer.target.kind,
    ...(offer.target.kind === 'category'
      ? { categoryId: offer.target.categoryId }
      : offer.target.kind === 'source'
        ? { sourceId: offer.target.sourceId }
        : { toAccountId: offer.target.toAccountId }),
  };
}

function sameTarget(a: RuleTarget, b: RuleTarget): boolean {
  if (a.kind === 'category' && b.kind === 'category') return a.categoryId === b.categoryId;
  if (a.kind === 'source' && b.kind === 'source') return a.sourceId === b.sourceId;
  return a.kind === 'transfer' && b.kind === 'transfer' && a.toAccountId === b.toAccountId;
}

/**
 * The pattern offered for a правило-джерело (categorisation-rules, "A правило is proposed from a
 * транзакція that carries an опис"): a дохід whose folded опис begins with «від:» is a payment from
 * a person, and the leading word the merchants capability would propose names every person who ever
 * paid — so the whole folded, trimmed опис is proposed, naming that one sender.
 */
function proposeSourcePattern(description: string | undefined): string | undefined {
  const whole = foldCase(description ?? '').trim();
  if (whole.startsWith('від:')) return whole;
  return proposeMerchantPattern(description);
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
  /** The продавці as stored: a recognised опис offers its продавець, and a правило naming it covers it. */
  readonly merchants: MerchantIndex;
}): RuleOffer | undefined {
  const target = input.target;
  if (target.kind === 'category' && target.categoryId === UNCATEGORISED_CATEGORY_ID) {
    return undefined;
  }
  if (target.kind === 'source' && target.sourceId === UNSOURCED_SOURCE_ID) {
    return undefined;
  }
  const merchant =
    target.kind === 'source' ? proposeSourcePattern(input.description) : proposeMerchantPattern(input.description);
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
    input.merchants,
    {
      description: input.description ?? '',
      ...(input.fromAccount ? { from: input.fromAccount } : {}),
    },
    input.accounts ?? [],
    // A правило-джерело is checked against the правила-джерела alone, as money arriving matches.
    target.kind === 'source' ? 'in' : 'out',
  );
  if (existing !== undefined && sameTarget(existing, input.target)) {
    return undefined;
  }
  const recognised = input.merchants.recognise(input.description);
  return {
    merchant,
    ...(recognised ? { recognised: { merchantId: recognised.merchantId, name: recognised.name } } : {}),
    target: input.target,
  };
}

/**
 * What a plain save of an edited транзакція offers to remember, if anything (main-screen,
 * "Categorising a транзакція offers to remember it as a правило"): the категорія just set on a
 * витрата or повернення, or the джерело just set on a дохід — only when saving actually changed
 * it and the транзакція carries an опис. Editing any other field, or a переказ, offers nothing;
 * `ruleOffer` still decides whether that target is worth offering at all.
 */
export function savedRuleTarget(before: Transaction, after: Transaction): RuleTarget | undefined {
  if (!after.description) return undefined;
  if (after.type === 'expense' || after.type === 'refund') {
    const was = before.type === 'expense' || before.type === 'refund' ? before.categoryId : undefined;
    return after.categoryId !== was ? { kind: 'category', categoryId: after.categoryId } : undefined;
  }
  if (after.type === 'income') {
    const was = before.type === 'income' ? before.sourceId : undefined;
    return after.sourceId !== was ? { kind: 'source', sourceId: after.sourceId } : undefined;
  }
  return undefined;
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
  return sweepSaid(await sweepStep('rules/sweep', () => save(rule)));
}

/**
 * One розбір as one журнал operation carrying its four counts and nothing else — no опис, no сума,
 * no назва. Every trigger of a розбір goes through it: storing a правило, changing the шаблон's
 * mapping, and the open-time розбір (which may answer nothing when another run swept first).
 */
export async function sweepStep<T extends SweepCounts | undefined>(
  name: string,
  run: () => T,
): Promise<T> {
  return journal.step(name, async () => run(), {
    ending: (c) =>
      c === undefined
        ? { detail: 'already-swept' }
        : {
            counts: {
              examined: c.examined,
              moved: c.moved,
              transferred: c.transferred,
              absorbed: c.absorbed,
              incomesExamined: c.incomesExamined,
              incomesSourced: c.incomesSourced,
            },
          },
  });
}

/**
 * What a розбір the owner triggered says afterwards: how many витрати it recategorised and how many
 * became перекази — or nothing at all when it moved nothing ("A pass that moved nothing says
 * nothing"). One sentence for every trigger the owner has: storing a правило and changing the
 * шаблон's mapping alike.
 */
export function sweepSaid(counts: SweepCounts): string | undefined {
  const said: string[] = [];
  if (counts.moved > 0) said.push(`${expenseCount(counts.moved)} перекатегоризовано.`);
  if (counts.transferred > 0) said.push(`${expenseCount(counts.transferred)} стали переказами.`);
  if (counts.incomesSourced > 0) {
    const n = counts.incomesSourced;
    said.push(`${incomeCount(n)} ${plural(n, 'отримав', 'отримали', 'отримали')} джерело.`);
  }
  return said.length > 0 ? said.join(' ') : undefined;
}
