import type { Account } from './account';
import { foldCase } from './fold';
import { TEMPLATE_GROUPS } from './rule-template';
import {
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from './transaction';

/**
 * A правило автокатегоризації: "merchant / MCC → category, or → переказ на рахунок Z", the
 * owner's own mapping that every витрата is run through before it falls back to «Без категорії»
 * (glossary, "Rule (правило)") — the three import sources, and the entry form when the owner
 * records one by hand. A **правило-переказ** targets a destination рахунок instead: money leaving
 * a linked рахунок it matches is a переказ to that destination, not a витрата (glossary,
 * "Transfer rule").
 *
 * Nothing here reads or writes storage: the callers load the правила once and call `matchRule` or
 * `matchCategory`, and `sweepUncategorised` below decides a розбір without performing it.
 */
export type RuleTarget =
  | { readonly kind: 'category'; readonly categoryId: string }
  | { readonly kind: 'transfer'; readonly toAccountId: string };

export interface Rule {
  readonly id: string;
  /** A substring of the merchant description; absent when the rule matches on MCC alone. */
  readonly merchant?: string;
  /** ISO-18245 merchant category code; absent when the rule matches on the merchant alone. */
  readonly mcc?: number;
  readonly target: RuleTarget;
  /** The tie-break between two equally specific rules — domain data, not storage metadata. */
  readonly createdAt: Date;
}

/**
 * The pattern a rule actually matches on: trimmed, and `undefined` when nothing is left. Both the
 * form and the repository refuse a blank pattern, but a blank one reaching here would otherwise be
 * a wildcard — `''` occurs in every description — and a wildcard would outrank every real MCC rule
 * on the specificity ladder. Treating it as no criterion at all is what keeps a degenerate rule
 * harmless instead of dominant.
 */
function patternOf(rule: Rule): string | undefined {
  const merchant = rule.merchant?.trim();
  return merchant ? merchant : undefined;
}

function matches(
  rule: Rule,
  transaction: { readonly description: string; readonly mcc?: number },
): boolean {
  const merchant = patternOf(rule);
  // A rule with neither criterion is rejected at creation ("A rule with no criterion is
  // rejected"); should one ever reach here it matches nothing rather than everything.
  if (merchant === undefined && rule.mcc === undefined) return false;
  // Both criteria present means both must hold — the tiers below rank rules, they never relax them.
  if (merchant !== undefined && !foldCase(transaction.description).includes(foldCase(merchant))) {
    return false;
  }
  if (rule.mcc !== undefined && rule.mcc !== transaction.mcc) return false;
  return true;
}

/** Both criteria beat a merchant-only rule, which beats an MCC-only one. */
function specificity(rule: Rule): number {
  if (patternOf(rule) !== undefined) return rule.mcc !== undefined ? 2 : 1;
  return 0;
}

/** Length after folding, so the comparison is over the same text the match was made on. */
function patternLength(rule: Rule): number {
  const merchant = patternOf(rule);
  return merchant === undefined ? 0 : foldCase(merchant).length;
}

/**
 * Ranks two matching rules: specificity, then the longest merchant pattern, then the most
 * recently created. Two rules created in the same millisecond fall through to the greater id —
 * without that last step the answer would depend on the order the rules were loaded in
 * (design decision 7).
 */
function beats(candidate: Rule, best: Rule): boolean {
  const bySpecificity = specificity(candidate) - specificity(best);
  if (bySpecificity !== 0) return bySpecificity > 0;
  const byLength = patternLength(candidate) - patternLength(best);
  if (byLength !== 0) return byLength > 0;
  const byAge = candidate.createdAt.getTime() - best.createdAt.getTime();
  if (byAge !== 0) return byAge > 0;
  return candidate.id > best.id;
}

/** The рахунок money is leaving — what a правило-переказ needs to decide it is eligible at all. */
export interface FromAccount {
  readonly accountId: string;
  readonly currency: Account['currency'];
}

/**
 * A правило-переказ is eligible only when the рахунок the money left is known, its destination
 * exists, differs from that рахунок, and is in its currency — a переказ from a рахунок to itself,
 * or across currencies with no сума to state, is not what a rule can decide (categorisation-rules,
 * "Matching is deterministic and most-specific-first"). A rule targeting a категорія is always
 * eligible: only a правило-переказ depends on knowing the source at all.
 */
function eligible(
  rule: Rule,
  from: FromAccount | undefined,
  accounts: readonly Pick<Account, 'id' | 'currency'>[],
): boolean {
  const target = rule.target;
  if (target.kind === 'category') return true;
  if (from === undefined) return false;
  const destination = accounts.find((a) => a.id === target.toAccountId);
  if (destination === undefined) return false;
  if (destination.id === from.accountId) return false;
  return destination.currency === from.currency;
}

/**
 * The target of the best-matching rule — a категорія or a переказ to a destination рахунок — or
 * nothing when no rule matches. `from` is the рахунок the money is leaving, when it is known; a
 * правило-переказ ineligible for it (design D2's eligibility above) takes no part in the match at
 * all, so the next best rule decides, exactly as if the ineligible rule did not exist.
 *
 * Archiving is not consulted — it is not even on `Rule`: archiving hides a category or a рахунок
 * from pickers, not from rules, so a rule keeps matching until the owner retargets or deletes it in
 * Налаштування.
 */
export function matchRule(
  rules: readonly Rule[],
  transaction: {
    readonly description: string;
    readonly mcc?: number;
    readonly from?: FromAccount;
  },
  accounts: readonly Pick<Account, 'id' | 'currency'>[] = [],
): RuleTarget | undefined {
  let best: Rule | undefined;
  for (const rule of rules) {
    if (!eligible(rule, transaction.from, accounts)) continue;
    if (!matches(rule, transaction)) continue;
    if (best === undefined || beats(rule, best)) best = rule;
  }
  return best?.target;
}

/**
 * `matchRule` for the callers that only ever decide a категорія — the entry form and a чернетка
 * from a bank сповіщення, neither of which knows a рахунок the money left in the sense a
 * правило-переказ needs (categorisation-rules, "Правила decide the категорія... a правило-переказ
 * SHALL take no part"). Passing no `from` makes every правило-переказ ineligible by construction,
 * so this ranks category rules only and keeps `matchRule`'s ladder as the one place ranking lives.
 */
export function matchCategory(
  rules: readonly Rule[],
  transaction: { readonly description: string; readonly mcc?: number },
): string | undefined {
  const target = matchRule(rules, transaction);
  return target?.kind === 'category' ? target.categoryId : undefined;
}

/**
 * The two tiers a категорія is decided by: the owner's own правила, then — only when none of them
 * eligible there matches — the шаблон категоризації (categorisation-rules, "The owner's правила
 * decide before the шаблон is consulted"). `templateRules` absent is a шаблон that takes no part;
 * production always passes it, from `categorisationContext()` (design T4).
 */
export interface RuleTiers {
  readonly rules: readonly Rule[];
  readonly templateRules?: readonly Rule[];
}

/** The fixed tie-break date of every шаблон rule: the шаблон has no history to rank by. */
const TEMPLATE_EPOCH = new Date(0);

/**
 * The шаблон as ordinary правила, so the one ladder in `matchRule` ranks it (design T2): one rule
 * per merchant pattern and one per MCC of every базова категорія that `targets` maps to a
 * категорія. A базова категорія absent from `targets` — switched off, or resolved to a категорія
 * this device lacks — yields nothing and therefore matches nothing.
 *
 * Ids are `tpl:<group>:m<n>` / `tpl:<group>:c<n>` and `createdAt` is fixed, so ties inside the
 * шаблон fall to the id and the answer never depends on load order.
 */
export function templateRules(targets: ReadonlyMap<string, string>): readonly Rule[] {
  const rules: Rule[] = [];
  for (const group of TEMPLATE_GROUPS) {
    const categoryId = targets.get(group.id);
    if (categoryId === undefined) continue;
    const target = { kind: 'category', categoryId } as const;
    group.merchants.forEach((merchant, n) => {
      rules.push({ id: `tpl:${group.id}:m${n}`, merchant, target, createdAt: TEMPLATE_EPOCH });
    });
    group.mcc.forEach((mcc, n) => {
      rules.push({ id: `tpl:${group.id}:c${n}`, mcc, target, createdAt: TEMPLATE_EPOCH });
    });
  }
  return rules;
}

/**
 * What the two tiers give a транзакція: the best eligible правило's target, or — when no правило
 * eligible there matches — the best шаблон match. The tiers never mix: an owner's MCC-only правило
 * beats the most specific шаблон merchant pattern, because the owner's tier answered at all. An
 * ineligible правило-переказ takes no part (see `matchRule`), so it does not silence the шаблон.
 */
export function resolveTarget(
  tiers: RuleTiers,
  transaction: {
    readonly description: string;
    readonly mcc?: number;
    readonly from?: FromAccount;
  },
  accounts: readonly Pick<Account, 'id' | 'currency'>[] = [],
): RuleTarget | undefined {
  return (
    matchRule(tiers.rules, transaction, accounts) ??
    matchRule(tiers.templateRules ?? [], transaction)
  );
}

/**
 * `resolveTarget` for the callers that only ever decide a категорія — the entry form and a
 * чернетка: the category правила alone (as `matchCategory`), then the шаблон.
 */
export function resolveCategory(
  tiers: RuleTiers,
  transaction: { readonly description: string; readonly mcc?: number },
): string | undefined {
  return (
    matchCategory(tiers.rules, transaction) ??
    matchCategory(tiers.templateRules ?? [], transaction)
  );
}

/**
 * The merchant pattern a правило is offered with when the owner categorises a транзакція that
 * carries an опис — «СІЛЬПО 123 Київ, вул. Хрещатик» → «сільпо».
 *
 * A bank's опис is `NAME [branch] [city] [street]`, and everything that identifies the one shop
 * starts at the first digit or punctuation. So the pattern is the leading run of letters, and at
 * most the first two words of it: merchant names arrive as one word or two — «СІЛЬПО», «Нова
 * Пошта», «Lviv Croissants» — and a third word is almost always the qualifier the branch is named
 * by («відділення», «маркет», a city). Taking the first word alone would keep half of «Нова
 * Пошта»; taking the whole опис would produce a pattern matching that one shop on that one street,
 * which never fires again (design decision 3).
 *
 * An опис that does not begin with a letter — «7-Eleven Kyiv» — has no name to cut out of it, so
 * the whole folded опис is proposed instead. Nothing is proposed for an опис that is blank or
 * absent: a правило with neither a merchant nor an MCC is refused, and there is no pattern here to
 * refuse it with.
 *
 * Every case of it is a guess, which is why the owner sees it in an editable field before it is
 * stored: «Оплата послуг АТБ» proposes «оплата послуг» and is simply wrong.
 *
 * Folded with the same `fold` the matcher uses, so what the owner accepts is the text that will be
 * compared, and its length ranks on the ladder exactly as it reads.
 */
export function proposeMerchantPattern(description: string | undefined): string | undefined {
  const folded = foldCase(description ?? '').trim();
  if (folded === '') return undefined;
  const leading = /^\p{L}[\p{L}\s]*/u.exec(folded)?.[0]?.trim();
  if (leading === undefined || leading === '') return folded;
  return leading.split(/\s+/).slice(0, 2).join(' ');
}

/** One витрата the розбір moves: onto a категорія, or into a переказ to a destination рахунок. */
export type SweepMove =
  | { readonly kind: 'category'; readonly id: string; readonly categoryId: string }
  | { readonly kind: 'transfer'; readonly id: string; readonly toAccountId: string };

/**
 * The розбір: which stored витрати in «Без категорії» the two tiers now recognise — the owner's
 * правила, then the шаблон where none of them answers — and where each one goes. It decides and returns; nothing here writes (design decision 1). Turning a витрата
 * into a переказ is only the move — keeping its identity, сума, date and опис on both legs, and
 * absorbing its зустрічний дохід — is the repository's write, using the same shared step every
 * other переказ a правило makes goes through (design D5).
 *
 * Only витрати in «Без категорії» are considered. A категорія the owner chose — or an earlier
 * правило gave — is a decision, not a gap, so it is never revisited; a повернення is left alone
 * whatever its категорія, because it returns to the категорія of what was bought and not to
 * whatever its text resembles; and a дохід, a переказ and a коригування carry no expense категорія
 * to move at all.
 *
 * Matching runs on the опис with no MCC. A stored транзакція keeps none — the bank's code is not
 * carried past import — so a правило whose only criterion is an MCC moves nothing, the same
 * restriction a чернетка from a bank сповіщення already carries. A витрата with no опис matches
 * nothing.
 *
 * A move onto «Без категорії» is dropped rather than made. Creating such a правило is refused at
 * the only write path the app has, but a restore writes the `rules` table directly, so a бекап
 * written elsewhere can land one — and a розбір that moved a витрата from the gap into the gap
 * would change nothing while outranking the правило that would have filled it.
 *
 * A правило-переказ that matches a витрата on its own destination, or on a рахунок in another
 * currency, is ineligible there (design D2) and gives that витрата nothing, so it stays.
 */
export function sweepUncategorised(
  tiers: RuleTiers,
  transactions: readonly Transaction[],
  accounts: readonly Pick<Account, 'id' | 'currency'>[],
): readonly SweepMove[] {
  const moves: SweepMove[] = [];
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    if (transaction.categoryId !== UNCATEGORISED_CATEGORY_ID) continue;
    if (transaction.description === undefined) continue;
    const target = resolveTarget(
      tiers,
      {
        description: transaction.description,
        from: { accountId: transaction.accountId, currency: transaction.amount.currency },
      },
      accounts,
    );
    if (target === undefined) continue;
    if (target.kind === 'category') {
      if (target.categoryId === UNCATEGORISED_CATEGORY_ID) continue;
      moves.push({ kind: 'category', id: transaction.id, categoryId: target.categoryId });
    } else {
      moves.push({ kind: 'transfer', id: transaction.id, toAccountId: target.toAccountId });
    }
  }
  return moves;
}

/**
 * How many витрати a розбір considered, and how many it moved — the two numbers the журнал carries
 * and the owner is told afterwards. `examined` counts the «Без категорії» витрати the pass looked
 * at, not every транзакція stored, so the сентенція the owner reads is about the pile they have.
 */
export function countUncategorisedExpenses(transactions: readonly Transaction[]): number {
  return transactions.filter(
    (t) => t.type === 'expense' && t.categoryId === UNCATEGORISED_CATEGORY_ID,
  ).length;
}
