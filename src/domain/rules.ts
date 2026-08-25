/**
 * A правило автокатегоризації: "merchant / MCC → category", the owner's own mapping that every
 * import source runs a transaction through before it falls back to «Без категорії» (glossary,
 * "Rule (правило)"). A rule acts at import time and never retroactively, so nothing here reads
 * or writes a transaction — importers (steps 6–8) load the rules once and call `matchRule`.
 */
export interface Rule {
  readonly id: string;
  /** A substring of the merchant description; absent when the rule matches on MCC alone. */
  readonly merchant?: string;
  /** ISO-18245 merchant category code; absent when the rule matches on the merchant alone. */
  readonly mcc?: number;
  readonly categoryId: string;
  /** The tie-break between two equally specific rules — domain data, not storage metadata. */
  readonly createdAt: Date;
}

/**
 * Case-insensitivity with the Ukrainian casing rules on both sides, so «СІЛЬПО» in a bank
 * description meets the pattern «сільпо» the owner typed (design decision 7).
 */
function fold(text: string): string {
  return text.toLocaleLowerCase('uk');
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
  if (merchant !== undefined && !fold(transaction.description).includes(fold(merchant))) {
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
  return merchant === undefined ? 0 : fold(merchant).length;
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

/**
 * The target category of the best-matching rule, or nothing when no rule matches. Archiving is
 * not consulted — it is not even on `Rule`: archiving hides a category from pickers, not from
 * rules, so a rule keeps matching into an archived category until the owner retargets or deletes
 * it in Налаштування.
 */
export function matchRule(
  rules: readonly Rule[],
  transaction: { readonly description: string; readonly mcc?: number },
): string | undefined {
  let best: Rule | undefined;
  for (const rule of rules) {
    if (!matches(rule, transaction)) continue;
    if (best === undefined || beats(rule, best)) best = rule;
  }
  return best?.categoryId;
}
