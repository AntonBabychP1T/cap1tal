import type { Account } from './account';
import { foldCase, occursAtWordStart } from './fold';
import { proposeMerchant, type MerchantIndex, type Recognition } from './merchants';
import { Refusal } from './refusal';
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
  /**
   * A pattern of the merchant description, matched as `match` says; absent when the rule matches on
   * MCC alone or names a продавець instead. A rule never carries both this and `merchantId`.
   */
  readonly merchant?: string;
  /**
   * The продавець the rule names instead of a pattern: it matches whatever опис is recognised as
   * that продавець (design M3), and ranks as long as the написання that recognised it.
   */
  readonly merchantId?: string;
  /** ISO-18245 merchant category code; absent when the rule matches on the merchant alone. */
  readonly mcc?: number;
  readonly target: RuleTarget;
  /** The tie-break between two equally specific rules — domain data, not storage metadata. */
  readonly createdAt: Date;
  /**
   * How `merchant` is matched: where a word of the опис begins — every правило the owner stores, and
   * what absent means — or anywhere inside it, set only by `templateRules`, because the шаблон's
   * patterns are fragments written to occur inside words (design D7).
   */
  readonly match?: 'word-start' | 'substring';
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

/** Whether the rule names a merchant at all — by a pattern or by a продавець. */
function hasMerchantCriterion(rule: Rule): boolean {
  return patternOf(rule) !== undefined || rule.merchantId !== undefined;
}

/**
 * `recognised` is what the description is recognised as, worked out once by the caller that decides
 * (design M3): a продавець-правило matches exactly when it names that продавець, so a description
 * recognised as «Bolt Food» is never matched by the правило naming «Bolt», though "bolt" occurs in
 * it — recognition gives one answer to one опис, and the rule follows it.
 */
function matches(
  rule: Rule,
  transaction: { readonly description: string; readonly mcc?: number },
  recognised: Recognition | undefined,
): boolean {
  const merchant = patternOf(rule);
  // A rule with neither criterion is rejected at creation ("A rule with no criterion is
  // rejected"); should one ever reach here it matches nothing rather than everything.
  if (!hasMerchantCriterion(rule) && rule.mcc === undefined) return false;
  // Both criteria present means both must hold — the tiers below rank rules, they never relax them.
  if (merchant !== undefined) {
    const folded = foldCase(transaction.description);
    const pattern = foldCase(merchant);
    const occurs = rule.match === 'substring' ? folded.includes(pattern) : occursAtWordStart(folded, pattern);
    if (!occurs) return false;
  }
  if (rule.merchantId !== undefined && recognised?.merchantId !== rule.merchantId) return false;
  if (rule.mcc !== undefined && rule.mcc !== transaction.mcc) return false;
  return true;
}

/** Both criteria beat a merchant-only rule, which beats an MCC-only one; a продавець is a merchant. */
function specificity(rule: Rule): number {
  if (hasMerchantCriterion(rule)) return rule.mcc !== undefined ? 2 : 1;
  return 0;
}

/**
 * Length after folding, so the comparison is over the same text the match was made on. A
 * продавець-правило counts as long as the написання that recognised the description: it ranks
 * exactly as the pattern-правило of that написання would (design M3).
 */
function patternLength(rule: Rule, recognised: Recognition | undefined): number {
  if (rule.merchantId !== undefined) return recognised?.spelling.length ?? 0;
  const merchant = patternOf(rule);
  return merchant === undefined ? 0 : foldCase(merchant).length;
}

/**
 * Ranks two matching rules: specificity, then the longest merchant pattern, then the most
 * recently created. Two rules created in the same millisecond fall through to the greater id —
 * without that last step the answer would depend on the order the rules were loaded in
 * (design decision 7).
 */
function beats(candidate: Rule, best: Rule, recognised: Recognition | undefined): boolean {
  const bySpecificity = specificity(candidate) - specificity(best);
  if (bySpecificity !== 0) return bySpecificity > 0;
  const byLength = patternLength(candidate, recognised) - patternLength(best, recognised);
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
  merchants: MerchantIndex,
  transaction: {
    readonly description: string;
    readonly mcc?: number;
    readonly from?: FromAccount;
  },
  accounts: readonly Pick<Account, 'id' | 'currency'>[] = [],
): RuleTarget | undefined {
  return bestTarget(rules, merchants.recognise(transaction.description), transaction, accounts);
}

/** `matchRule` with the recognition already made, so a caller deciding two tiers recognises once. */
function bestTarget(
  rules: readonly Rule[],
  recognised: Recognition | undefined,
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
    if (!matches(rule, transaction, recognised)) continue;
    if (best === undefined || beats(rule, best, recognised)) best = rule;
  }
  return best?.target;
}

function categoryOf(target: RuleTarget | undefined): string | undefined {
  return target?.kind === 'category' ? target.categoryId : undefined;
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
  merchants: MerchantIndex,
  transaction: { readonly description: string; readonly mcc?: number },
): string | undefined {
  return categoryOf(matchRule(rules, merchants, transaction));
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
  /**
   * The продавці as stored at the moment of deciding: every decision recognises the опис against
   * them, so a правило naming a продавець takes part wherever a категорія is decided (design M3).
   * Required, so no caller can build tiers that silently skip recognition.
   */
  readonly merchants: MerchantIndex;
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
      rules.push({ id: `tpl:${group.id}:m${n}`, merchant, match: 'substring', target, createdAt: TEMPLATE_EPOCH });
    });
    group.mcc.forEach((mcc, n) => {
      rules.push({ id: `tpl:${group.id}:c${n}`, mcc, match: 'substring', target, createdAt: TEMPLATE_EPOCH });
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
  // The шаблон tier never names a продавець, so it ignores what was recognised.
  const recognised = tiers.merchants.recognise(transaction.description);
  return (
    bestTarget(tiers.rules, recognised, transaction, accounts) ??
    bestTarget(tiers.templateRules ?? [], recognised, transaction)
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
  const recognised = tiers.merchants.recognise(transaction.description);
  return (
    categoryOf(bestTarget(tiers.rules, recognised, transaction)) ??
    categoryOf(bestTarget(tiers.templateRules ?? [], recognised, transaction))
  );
}

/**
 * A rule's merchant criterion is one of a pattern or a продавець (categorisation-rules, "A rule maps
 * merchant and/or MCC to one category"): a rule naming both is refused in words, before storage's
 * CHECK would refuse it by a constraint name.
 */
export function checkMerchantCriterion(rule: Pick<Rule, 'merchant' | 'merchantId'>): void {
  if (rule.merchant?.trim() && rule.merchantId !== undefined) {
    throw new Refusal('Правило називає або шаблон, або продавця — не обидва');
  }
}

/**
 * The merchant pattern a правило is offered with when the owner categorises a транзакція that
 * carries an опис — «СІЛЬПО 123 Київ, вул. Хрещатик» → «сільпо», «Оплата послуг АТБ-Маркет 1234» →
 * «атб».
 *
 * It is the написання `proposeMerchant` offers for a продавець from the same опис (design M4): one
 * leading service word of the bank's skipped, then the leading run of letters cut to two words, or
 * the whole of what remains when it does not start with a letter. One heuristic with two callers, so
 * the pattern offered for a правило and the написання offered for a продавець can never drift apart.
 *
 * Every case of it is a guess, which is why the owner sees it in an editable field before it is
 * stored. Nothing is proposed for an опис that is blank or absent: a правило with neither a merchant
 * nor an MCC is refused, and there is no pattern here to refuse it with.
 */
export function proposeMerchantPattern(description: string | undefined): string | undefined {
  return proposeMerchant(description)?.spelling;
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
 * Matching runs on the опис and on the MCC the витрата carries, when its import named one (design
 * M11): a правило whose only criterion is an MCC, and the шаблон's MCC codes, move exactly the
 * витрати that carry that code, and a витрата recorded by hand, by Saldo, from a чернетка or
 * imported before the MCC was kept is matched on its опис alone. A витрата with neither an опис
 * nor an MCC matches nothing. The опис is recognised against `tiers.merchants` once per витрата,
 * so a правило naming a продавець sweeps every spelling it recognises.
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
    if (transaction.description === undefined && transaction.mcc === undefined) continue;
    const target = resolveTarget(
      tiers,
      {
        // No опис is an empty one: a pattern occurs in nothing, and nothing is recognised.
        description: transaction.description ?? '',
        ...(transaction.mcc === undefined ? {} : { mcc: transaction.mcc }),
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
