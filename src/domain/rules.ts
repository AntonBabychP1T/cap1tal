import {
  UNCATEGORISED_CATEGORY_ID,
  type Transaction,
} from './transaction';

/**
 * A правило автокатегоризації: "merchant / MCC → category", the owner's own mapping that every
 * витрата is run through before it falls back to «Без категорії» (glossary, "Rule (правило)") —
 * the three import sources, and the entry form when the owner records one by hand.
 *
 * Nothing here reads or writes storage: the callers load the правила once and call `matchRule`,
 * and `sweepUncategorised` below decides a розбір without performing it.
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
  const folded = fold(description ?? '').trim();
  if (folded === '') return undefined;
  const leading = /^\p{L}[\p{L}\s]*/u.exec(folded)?.[0]?.trim();
  if (leading === undefined || leading === '') return folded;
  return leading.split(/\s+/).slice(0, 2).join(' ');
}

/** One витрата the розбір moves, and the категорія it moves onto. */
export interface CategoryMove {
  readonly id: string;
  readonly categoryId: string;
}

/**
 * The розбір: which stored витрати in «Без категорії» the правила now recognise, and where each
 * one goes. It decides and returns; nothing here writes (design decision 1).
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
 */
export function sweepUncategorised(
  rules: readonly Rule[],
  transactions: readonly Transaction[],
): readonly CategoryMove[] {
  const moves: CategoryMove[] = [];
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    if (transaction.categoryId !== UNCATEGORISED_CATEGORY_ID) continue;
    if (transaction.description === undefined) continue;
    const categoryId = matchRule(rules, { description: transaction.description });
    if (categoryId === undefined || categoryId === UNCATEGORISED_CATEGORY_ID) continue;
    moves.push({ id: transaction.id, categoryId });
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
