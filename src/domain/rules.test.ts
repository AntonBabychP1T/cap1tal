import { describe, expect, it } from 'vitest';

import { account } from './account';
import { NO_MERCHANTS, merchant, merchantIndex, type Merchant } from './merchants';
import { activeCategories, type Category } from './category';
import { money } from './money';
import {
  checkMerchantCriterion,
  countUncategorisedExpenses,
  matchCategory,
  matchRule,
  matchSource,
  proposeMerchantPattern,
  resolveCategory,
  resolveTarget,
  sweepUncategorised,
  sweepUnsourced,
  templateRules,
  type Rule,
} from './rules';
import { TEMPLATE_GROUPS } from './rule-template';
import {
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  expenseByDefault,
  refund,
  transfer,
  type Correction,
  type Expense,
  type Income,
} from './transaction';

/** Rules the owner created in this order; the ids stand in for what a repo would generate. */
function rule(input: {
  id: string;
  merchant?: string;
  mcc?: number;
  categoryId: string;
  createdAt?: string;
}): Rule {
  return {
    id: input.id,
    merchant: input.merchant,
    mcc: input.mcc,
    target: { kind: 'category', categoryId: input.categoryId },
    createdAt: new Date(input.createdAt ?? '2026-01-01T00:00:00.000Z'),
  };
}

/** A правило-переказ, the same shape otherwise. */
function transferRule(input: {
  id: string;
  merchant?: string;
  mcc?: number;
  toAccountId: string;
  createdAt?: string;
}): Rule {
  return {
    id: input.id,
    merchant: input.merchant,
    mcc: input.mcc,
    target: { kind: 'transfer', toAccountId: input.toAccountId },
    createdAt: new Date(input.createdAt ?? '2026-01-01T00:00:00.000Z'),
  };
}

const platinum = account({ id: 'platinum', name: 'platinum', kind: 'spending', currency: 'UAH' });
const reserve = account({ id: 'reserve', name: 'РЕЗЕРВ', kind: 'savings', currency: 'UAH' });
const usdCard = account({ id: 'usd-card', name: 'usd', kind: 'spending', currency: 'USD' });
const accounts = [platinum, reserve, usdCard];

describe('matchRule', () => {
  it('Scenario: A merchant pattern matches case-insensitively inside the description', () => {
    const rules = [rule({ id: 'r1', merchant: 'сільпо', categoryId: 'groceries' })];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'СІЛЬПО Київ вул. Хрещатик' })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
  });

  it('Scenario: A merchant pattern inside a word does not match', () => {
    const rules = [rule({ id: 'r1', merchant: 'коло', categoryId: 'habits' })];
    // «навколо» holds «коло», inside the word.
    expect(matchRule(rules, NO_MERCHANTS, { description: 'НАВКОЛО маркет' })).toBeUndefined();
    // A word that begins further along the опис still matches.
    expect(matchRule(rules, NO_MERCHANTS, { description: 'НАВКОЛО коло' })).toEqual({
      kind: 'category',
      categoryId: 'habits',
    });
  });

  it('Scenario: A merchant pattern after punctuation matches', () => {
    const rules = [rule({ id: 'r1', merchant: 'megogo', categoryId: 'subscriptions' })];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'WFP*MEGOGO.NET' })).toEqual({
      kind: 'category',
      categoryId: 'subscriptions',
    });
  });

  it('Scenario: A pattern that starts with punctuation matches wherever it occurs', () => {
    const rules = [rule({ id: 'r1', merchant: '*megogo', categoryId: 'subscriptions' })];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'WFP*MEGOGO.NET' })).toEqual({
      kind: 'category',
      categoryId: 'subscriptions',
    });
  });

  it('Scenario: An MCC matches exactly', () => {
    const rules = [rule({ id: 'r1', mcc: 5411, categoryId: 'groceries' })];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'новий магазин', mcc: 5411 })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
    // Equality, not proximity — and a transaction carrying no MCC matches no MCC rule.
    expect(matchRule(rules, NO_MERCHANTS, { description: 'новий магазин', mcc: 5412 })).toBeUndefined();
    expect(matchRule(rules, NO_MERCHANTS, { description: 'новий магазин' })).toBeUndefined();
  });

  it('Scenario: Both-criteria beats merchant-only', () => {
    // The spec's own input: the pattern and the description are both Latin, because that is the
    // alphabet Uklon's descriptions arrive in. Folding is case, not transliteration — the
    // requirement says so — so a Cyrillic «уклон» would match none of this, and the scenario is
    // written to be the case the owner would actually create.
    // The both-criteria rule is the older one with the smaller id, so only its tier can win it.
    const rules = [
      rule({ id: 'r2', merchant: 'uklon', categoryId: 'transport', createdAt: '2026-02-01T09:00:00.000Z' }),
      rule({ id: 'r1', merchant: 'uklon', mcc: 4121, categoryId: 'travel', createdAt: '2026-01-01T09:00:00.000Z' }),
    ];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'Uklon', mcc: 4121 })).toEqual({
      kind: 'category',
      categoryId: 'travel',
    });
    // Without the MCC only the merchant-only rule matches, so the tier below takes over.
    expect(matchRule(rules, NO_MERCHANTS, { description: 'Uklon' })).toEqual({
      kind: 'category',
      categoryId: 'transport',
    });
    // And the alphabet is not folded away: a Cyrillic pattern does not reach a Latin description.
    expect(
      matchRule([rule({ id: 'r3', merchant: 'уклон', categoryId: 'transport' })], NO_MERCHANTS, {
        description: 'Uklon',
      }),
    ).toBeUndefined();
  });

  it('Scenario: Merchant beats MCC', () => {
    // The merchant rule is again the older one with the smaller id, so its tier is what wins.
    const rules = [
      rule({ id: 'r2', mcc: 5411, categoryId: 'groceries', createdAt: '2026-02-01T09:00:00.000Z' }),
      rule({ id: 'r1', merchant: 'аптека', categoryId: 'health', createdAt: '2026-01-01T09:00:00.000Z' }),
    ];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'Аптека 24', mcc: 5411 })).toEqual({
      kind: 'category',
      categoryId: 'health',
    });
  });

  it('Scenario: The longest merchant pattern wins', () => {
    // The longer pattern is the older rule with the smaller id, so length alone decides.
    const rules = [
      rule({ id: 'r2', merchant: 'кава', categoryId: 'coffee', createdAt: '2026-02-01T09:00:00.000Z' }),
      rule({ id: 'r1', merchant: 'кавамашина', categoryId: 'home', createdAt: '2026-01-01T09:00:00.000Z' }),
    ];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'КАВАМАШИНА Rozetka' })).toEqual({
      kind: 'category',
      categoryId: 'home',
    });
    // The shorter pattern still wins where the longer one does not occur at all.
    expect(matchRule(rules, NO_MERCHANTS, { description: 'кава з собою' })).toEqual({
      kind: 'category',
      categoryId: 'coffee',
    });
  });

  it('Scenario: An exact tie goes to the newest rule', () => {
    // The newer rule carries the smaller id, so the answer can only come from `createdAt`.
    const rules = [
      rule({ id: 'r2', merchant: 'атб', categoryId: 'groceries', createdAt: '2026-01-01T09:00:00.000Z' }),
      rule({ id: 'r1', merchant: 'атб', categoryId: 'eating-out', createdAt: '2026-02-01T09:00:00.000Z' }),
    ];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'АТБ Маркет' })).toEqual({
      kind: 'category',
      categoryId: 'eating-out',
    });
  });

  it('Scenario: No matching rule returns nothing', () => {
    const rules = [
      rule({ id: 'r1', merchant: 'сільпо', categoryId: 'groceries' }),
      rule({ id: 'r2', mcc: 5411, categoryId: 'groceries' }),
    ];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'Невідомий продавець', mcc: 7999 })).toBeUndefined();
    expect(matchRule([], NO_MERCHANTS, { description: 'СІЛЬПО Київ', mcc: 5411 })).toBeUndefined();
  });

  it('Scenario: A rule keeps matching into an archived category', () => {
    const groceries: Category = { id: 'groceries', name: 'Groceries', archived: true };
    const rules = [rule({ id: 'r1', merchant: 'сільпо', categoryId: groceries.id })];
    // Archiving takes the category out of every picker…
    expect(activeCategories([groceries])).toEqual([]);
    // …and leaves matching untouched: `Rule` does not even carry the flag.
    expect(matchRule(rules, NO_MERCHANTS, { description: 'СІЛЬПО Київ' })).toEqual({
      kind: 'category',
      categoryId: groceries.id,
    });
  });

  it('Two rules created in the same millisecond resolve independently of the input order', () => {
    const sameMoment = '2026-03-01T12:00:00.000Z';
    const earlierId = rule({
      id: 'r1',
      merchant: 'атб',
      categoryId: 'groceries',
      createdAt: sameMoment,
    });
    const laterId = rule({
      id: 'r2',
      merchant: 'атб',
      categoryId: 'eating-out',
      createdAt: sameMoment,
    });
    const transaction = { description: 'АТБ Маркет' };
    expect(matchRule([earlierId, laterId], NO_MERCHANTS, transaction)).toEqual({
      kind: 'category',
      categoryId: 'eating-out',
    });
    expect(matchRule([laterId, earlierId], NO_MERCHANTS, transaction)).toEqual({
      kind: 'category',
      categoryId: 'eating-out',
    });
  });

  it('A rule with neither criterion is inert rather than a wildcard', () => {
    // Storage rejects such a rule ("A rule with no criterion is rejected"); should one reach
    // matching anyway, it must not swallow every transaction.
    const rules = [rule({ id: 'r1', categoryId: 'groceries' })];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'СІЛЬПО Київ', mcc: 5411 })).toBeUndefined();
  });

  it('Scenario: A правило-переказ wins by the same ladder', () => {
    const rules = [
      rule({ id: 'r1', merchant: 'округлення', categoryId: 'bills' }),
      transferRule({ id: 'r2', merchant: 'округлення балансу', toAccountId: reserve.id }),
    ];
    expect(
      matchRule(
        rules,
        NO_MERCHANTS,
        {
          description: 'Округлення балансу «Резерв»',
          from: { accountId: platinum.id, currency: platinum.currency },
        },
        accounts,
      ),
    ).toEqual({ kind: 'transfer', toAccountId: reserve.id });
  });

  it('Scenario: A правило-переказ does not match money leaving its destination', () => {
    const rules = [
      rule({ id: 'r1', merchant: 'округлення', categoryId: 'bills' }),
      transferRule({ id: 'r2', merchant: 'округлення балансу', toAccountId: reserve.id }),
    ];
    expect(
      matchRule(
        rules,
        NO_MERCHANTS,
        {
          description: 'Округлення балансу «Резерв»',
          from: { accountId: reserve.id, currency: reserve.currency },
        },
        accounts,
      ),
    ).toEqual({ kind: 'category', categoryId: 'bills' });
  });

  it('Scenario: A правило-переказ does not match across currencies', () => {
    const rules = [transferRule({ id: 'r1', merchant: 'округлення балансу', toAccountId: reserve.id })];
    expect(
      matchRule(
        rules,
        NO_MERCHANTS,
        {
          description: 'Округлення балансу «Резерв»',
          from: { accountId: usdCard.id, currency: usdCard.currency },
        },
        accounts,
      ),
    ).toBeUndefined();
  });

  it('Scenario: A правило-переказ keeps matching into an archived рахунок', () => {
    // Archiving a рахунок does not appear on `Rule` or on `matchRule`'s inputs at all — it hides a
    // рахунок from pickers, not from a rule already targeting it — so the archived account here is
    // simply passed among the eligible accounts, exactly as an unarchived one would be.
    const rules = [transferRule({ id: 'r1', merchant: 'округлення балансу', toAccountId: reserve.id })];
    expect(
      matchRule(
        rules,
        NO_MERCHANTS,
        {
          description: 'Округлення балансу «Резерв»',
          from: { accountId: platinum.id, currency: platinum.currency },
        },
        accounts,
      ),
    ).toEqual({ kind: 'transfer', toAccountId: reserve.id });
  });

  it('A правило-переказ takes no part with no `from` and no `accounts`', () => {
    const rules = [transferRule({ id: 'r1', merchant: 'округлення', toAccountId: reserve.id })];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'округлення' })).toBeUndefined();
  });
});

describe('matchRule — what the tiers rest on', () => {
  it('A pattern matches anywhere in the description, not only at its start', () => {
    // Real monobank descriptions put the merchant after the operation, so "starts with" would
    // silently stop matching the rules the owner wrote against them.
    const rules = [rule({ id: 'r1', merchant: 'сільпо', categoryId: 'groceries' })];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'Оплата картою СІЛЬПО' })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
    expect(matchRule(rules, NO_MERCHANTS, { description: 'СІЛЬПО Київ' })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
    expect(matchRule(rules, NO_MERCHANTS, { description: 'Оплата картою' })).toBeUndefined();
  });

  it('Both sides are folded, so an upper-case pattern matches a lower-case description', () => {
    // The owner may type the pattern in any case; only folding both sides makes that irrelevant.
    const rules = [rule({ id: 'r1', merchant: 'СІЛЬПО', categoryId: 'groceries' })];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'оплата картою сільпо' })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
  });

  it('A blank merchant pattern is no criterion, not a wildcard', () => {
    // The form and the repository both refuse one; if a degenerate rule ever reached matching, an
    // empty pattern occurs in every description and would outrank every real MCC rule.
    const blank = rule({ id: 'r1', merchant: '   ', categoryId: 'groceries' });
    const byMcc = rule({ id: 'r2', mcc: 5411, categoryId: 'health' });
    expect(matchRule([blank], NO_MERCHANTS, { description: 'будь-що' })).toBeUndefined();
    expect(matchRule([blank, byMcc], NO_MERCHANTS, { description: 'будь-що', mcc: 5411 })).toEqual({
      kind: 'category',
      categoryId: 'health',
    });
  });

  it('A merchant-only rule beats an MCC-only rule of the same standing', () => {
    // The tier, not the pattern length: both rules are the same age, and the merchant-only one is
    // the one with the greater id, so neither of the lower tie-breaks can be what decides it.
    const rules = [
      rule({ id: 'a', mcc: 5411, categoryId: 'groceries', createdAt: '2026-01-01T09:00:00.000Z' }),
      rule({ id: 'b', merchant: 'аптека', categoryId: 'health', createdAt: '2026-01-01T09:00:00.000Z' }),
    ];
    expect(matchRule(rules, NO_MERCHANTS, { description: 'Аптека 24', mcc: 5411 })).toEqual({
      kind: 'category',
      categoryId: 'health',
    });
  });
});

describe('matchCategory', () => {
  it('ranks category rules exactly as matchRule does', () => {
    const rules = [rule({ id: 'r1', merchant: 'сільпо', categoryId: 'groceries' })];
    expect(matchCategory(rules, NO_MERCHANTS, { description: 'СІЛЬПО Київ' })).toBe('groceries');
    expect(matchCategory(rules, NO_MERCHANTS, { description: 'невідомо' })).toBeUndefined();
  });

  it("Scenario: A правило-переказ proposes nothing by hand", () => {
    const rules = [
      rule({ id: 'r1', merchant: 'округлення', categoryId: 'bills' }),
      transferRule({ id: 'r2', merchant: 'округлення балансу', toAccountId: reserve.id }),
    ];
    // No `from` at all: exactly what the entry form and a чернетка's категорія have.
    expect(matchCategory(rules, NO_MERCHANTS, { description: 'Округлення балансу' })).toBe('bills');
  });

  it('proposes nothing when only a правило-переказ would match', () => {
    const rules = [transferRule({ id: 'r1', merchant: 'округлення', toAccountId: reserve.id })];
    expect(matchCategory(rules, NO_MERCHANTS, { description: 'округлення' })).toBeUndefined();
  });
});

describe('proposeMerchantPattern', () => {
  it('Scenario: Categorising an imported витрата offers the правило', () => {
    // The bank's опис is NAME [branch] [city] [street]; only the name survives.
    expect(proposeMerchantPattern('СІЛЬПО 123 Київ, вул. Хрещатик')).toBe('сільпо');
  });

  it('A two-word merchant keeps both words', () => {
    // The first word alone would be «нова», which matches half the descriptions a bank sends.
    expect(proposeMerchantPattern('Нова Пошта відділення 5')).toBe('нова пошта');
  });

  it('Scenario: An опис that starts with no letter proposes the whole of itself', () => {
    expect(proposeMerchantPattern('7-Eleven Kyiv')).toBe('7-eleven kyiv');
  });

  it('An опис that is blank or absent proposes nothing', () => {
    // A правило with neither a merchant nor an MCC is refused; there is no pattern to refuse with.
    expect(proposeMerchantPattern(undefined)).toBeUndefined();
    expect(proposeMerchantPattern('   ')).toBeUndefined();
  });

  it('The proposed pattern is folded, so it matches the опис it came from', () => {
    const pattern = proposeMerchantPattern('УКЛОН');
    expect(pattern).toBe('уклон');
    const proposed = [rule({ id: 'r1', merchant: pattern, categoryId: 'transport' })];
    expect(matchRule(proposed, NO_MERCHANTS, { description: 'УКЛОН' })).toEqual({
      kind: 'category',
      categoryId: 'transport',
    });
  });
});

/** A stored витрата, as the розбір finds it. */
function storedExpense(input: {
  id: string;
  accountId?: string;
  categoryId?: string;
  description?: string;
  mcc?: number;
}): Expense {
  return expenseByDefault({
    id: input.id,
    date: '2026-09-01',
    accountId: input.accountId ?? platinum.id,
    amount: money(12550, 'UAH'),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.mcc !== undefined ? { mcc: input.mcc } : {}),
  });
}

describe('sweepUncategorised', () => {
  const atb = rule({ id: 'r1', merchant: 'атб', categoryId: 'groceries' });

  it('Scenario: A new правило clears the matching витрати out of «Без категорії»', () => {
    const stored = [
      storedExpense({ id: 't1', description: 'АТБ 421' }),
      storedExpense({ id: 't2', description: 'АТБ 12' }),
      storedExpense({ id: 't3', description: 'НОВИЙ ЗАКЛАД' }),
    ];
    expect(sweepUncategorised({ rules: [atb], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([
      { kind: 'category', id: 't1', categoryId: 'groceries' },
      { kind: 'category', id: 't2', categoryId: 'groceries' },
    ]);
  });

  it('Scenario: A категорія the owner chose is never taken away', () => {
    const stored = [storedExpense({ id: 't1', categoryId: 'eating-out', description: 'АТБ 421' })];
    expect(sweepUncategorised({ rules: [atb], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([]);
  });

  it('Scenario: An опис never moves a транзакція out of the категорія it carries', () => {
    // The опис of a витрата in Clothing changed to «АТБ 421» while «атб → Groceries» exists: no
    // розбір reaches it, whatever продавець that опис is now recognised as.
    const changed = [storedExpense({ id: 't1', categoryId: 'clothing', description: 'АТБ 421' })];
    const recognising = merchantIndex([
      merchant({ id: 'atb-m', name: 'АТБ', spellings: [{ id: 's', spelling: 'атб', addedAt: new Date(0) }], createdAt: new Date(0) }),
    ]);
    expect(sweepUncategorised({ rules: [atb], merchants: recognising }, changed, accounts)).toEqual([]);
  });

  it('Scenario: A more specific правило keeps the last word during the sweep', () => {
    // The категорія a swept витрата lands on is what the whole set gives its опис, not the target
    // of whatever правило was written last.
    const longer = rule({ id: 'r2', merchant: 'атб 421', categoryId: 'eating-out' });
    const stored = [storedExpense({ id: 't1', description: 'АТБ 421' })];
    expect(sweepUncategorised({ rules: [atb, longer], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([
      { kind: 'category', id: 't1', categoryId: 'eating-out' },
    ]);
  });

  it('Scenario: An MCC-only правило moves nothing', () => {
    // A витрата that carries no MCC — recorded by hand, or imported before the MCC was kept — has
    // nothing for such a правило to match on.
    const byMcc = rule({ id: 'r2', mcc: 5411, categoryId: 'groceries' });
    const stored = [storedExpense({ id: 't1', description: 'НОВИЙ ЗАКЛАД 7' })];
    expect(sweepUncategorised({ rules: [byMcc], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([]);
  });

  it('Scenario: An MCC-only правило moves the витрати carrying that MCC', () => {
    const byMcc = rule({ id: 'r2', mcc: 7399, categoryId: 'services' });
    const stored = [
      storedExpense({ id: 't1', description: 'НОВИЙ ЗАКЛАД 7' }),
      storedExpense({ id: 't2', description: 'НОВИЙ ЗАКЛАД 8', mcc: 7399 }),
    ];
    expect(sweepUncategorised({ rules: [byMcc], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([
      { kind: 'category', id: 't2', categoryId: 'services' },
    ]);
  });

  it('a витрата with an MCC and no опис is matched on the MCC alone', () => {
    const byMcc = rule({ id: 'r2', mcc: 7399, categoryId: 'services' });
    const byPattern = rule({ id: 'r3', merchant: 'заклад', categoryId: 'groceries' });
    const stored = [storedExpense({ id: 't1', mcc: 7399 })];
    expect(sweepUncategorised({ rules: [byMcc, byPattern], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([
      { kind: 'category', id: 't1', categoryId: 'services' },
    ]);
  });

  it('Scenario: A витрата with no опис is not swept', () => {
    const stored = [storedExpense({ id: 't1' })];
    expect(sweepUncategorised({ rules: [atb], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([]);
  });

  it('Scenario: A правило targeting «Без категорії» moves nothing', () => {
    // Creating one is refused, but a restore writes the rules table directly.
    const intoTheGap = rule({ id: 'r2', merchant: 'атб', categoryId: UNCATEGORISED_CATEGORY_ID });
    const stored = [storedExpense({ id: 't1', description: 'АТБ 421' })];
    expect(sweepUncategorised({ rules: [intoTheGap], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([]);
  });

  it('Scenario: A повернення is not swept', () => {
    // A повернення returns to the категорія of what was bought, never to what its text resembles.
    const returned = refund({
      id: 't1',
      date: '2026-09-01',
      accountId: platinum.id,
      amount: money(12550, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
      description: 'АТБ 421',
    });
    expect(sweepUncategorised({ rules: [atb], merchants: NO_MERCHANTS }, [returned], accounts)).toEqual([]);
  });

  it('A дохід, a переказ and a коригування are never moved', () => {
    const income: Income = {
      type: 'income',
      id: 't1',
      date: '2026-09-01',
      accountId: platinum.id,
      amount: money(12550, 'UAH'),
      sourceId: 'salary',
      description: 'АТБ 421',
    };
    const moved = transfer({
      id: 't2',
      date: '2026-09-01',
      fromAccountId: platinum.id,
      toAccountId: reserve.id,
      left: money(12550, 'UAH'),
      arrived: money(12550, 'UAH'),
      description: 'АТБ 421',
    });
    const correction: Correction = {
      type: 'correction',
      id: 't3',
      date: '2026-09-01',
      accountId: platinum.id,
      amount: money(-12550, 'UAH'),
      description: 'АТБ 421',
    };
    expect(sweepUncategorised({ rules: [atb], merchants: NO_MERCHANTS }, [income, moved, correction], accounts)).toEqual([]);
  });

  it('countUncategorisedExpenses counts the pile, not everything stored', () => {
    // `examined` is what the owner is told about: the «Без категорії» витрати the pass looked at.
    const stored = [
      storedExpense({ id: 't1', description: 'АТБ 421' }),
      storedExpense({ id: 't2', categoryId: 'groceries', description: 'АТБ 12' }),
      storedExpense({ id: 't3' }),
    ];
    expect(countUncategorisedExpenses(stored)).toBe(2);
  });

  it('Scenario: A new правило-переказ turns matching витрати into перекази', () => {
    const roundUp = transferRule({ id: 'r1', merchant: 'округлення балансу', toAccountId: reserve.id });
    const stored = [
      storedExpense({ id: 't1', accountId: platinum.id, description: 'Округлення балансу «Резерв»' }),
    ];
    expect(sweepUncategorised({ rules: [roundUp], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([
      { kind: 'transfer', id: 't1', toAccountId: reserve.id },
    ]);
  });

  it('Scenario: A правило-переказ leaves a витрата on its own destination where it is', () => {
    const roundUp = transferRule({ id: 'r1', merchant: 'округлення балансу', toAccountId: reserve.id });
    const stored = [
      storedExpense({ id: 't1', accountId: reserve.id, description: 'Округлення балансу «Резерв»' }),
    ];
    expect(sweepUncategorised({ rules: [roundUp], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([]);
  });

  it('Scenario: A правило-переказ does not take a витрата out of a chosen категорія', () => {
    const roundUp = transferRule({ id: 'r1', merchant: 'округлення балансу', toAccountId: reserve.id });
    const stored = [
      storedExpense({
        id: 't1',
        accountId: platinum.id,
        categoryId: 'bills',
        description: 'Округлення балансу «Резерв»',
      }),
    ];
    expect(sweepUncategorised({ rules: [roundUp], merchants: NO_MERCHANTS }, stored, accounts)).toEqual([]);
  });

  it('a transfer move keeps id and toAccountId; date, опис and сума come from the original витрата', () => {
    const roundUp = transferRule({ id: 'r1', merchant: 'округлення', toAccountId: reserve.id });
    const original = storedExpense({
      id: 't1',
      accountId: platinum.id,
      description: 'округлення 479',
    });
    const [move] = sweepUncategorised({ rules: [roundUp], merchants: NO_MERCHANTS }, [original], accounts);
    expect(move).toEqual({ kind: 'transfer', id: original.id, toAccountId: reserve.id });
    // The rest of the leg — date, опис and сума on both legs — is the repository's job, built from
    // the original транзакція this move names; the domain decision carries only the destination.
  });
});

/** Every базова категорія at its типова категорія — an untouched device. */
const defaults = (): Map<string, string> =>
  new Map(TEMPLATE_GROUPS.map((g) => [g.id, g.defaultCategoryId]));

describe('templateRules', () => {
  it('turns every pattern and MCC of a mapped базова категорія into a rule on its target', () => {
    const rules = templateRules(new Map([['groceries', 'yizha']]));
    const groceries = TEMPLATE_GROUPS.find((g) => g.id === 'groceries')!;
    expect(rules).toHaveLength(groceries.merchants.length + groceries.mcc.length);
    expect(rules.every((r) => r.target.kind === 'category' && r.target.categoryId === 'yizha')).toBe(
      true,
    );
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });

  it('gives a базова категорія absent from the targets no rule at all', () => {
    expect(templateRules(new Map())).toEqual([]);
  });
});

describe('the two tiers', () => {
  const tiers = (rules: readonly Rule[] = [], targets = defaults()) => ({
    rules,
    templateRules: templateRules(targets),
    merchants: NO_MERCHANTS,
  });

  it('Scenario: A fresh device categorises a known merchant with no setup', () => {
    expect(resolveTarget(tiers(), { description: 'АТБ 421' })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
  });

  it('Scenario: A known MCC is enough on its own', () => {
    expect(resolveTarget(tiers(), { description: 'НОВИЙ ЗАКЛАД', mcc: 5411 })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
  });

  it('Scenario: Both spellings of one merchant are covered', () => {
    expect(resolveCategory(tiers(), { description: 'UKLON' })).toBe('transport');
    expect(resolveCategory(tiers(), { description: 'Уклон' })).toBe('transport');
  });

  it('Scenario: A правило beats the шаблон', () => {
    const atb = rule({ id: 'r1', merchant: 'атб', categoryId: 'eating-out' });
    expect(resolveCategory(tiers([atb]), { description: 'АТБ 421', mcc: 5411 })).toBe('eating-out');
  });

  it("Scenario: An owner's MCC rule beats a шаблон merchant match", () => {
    const byMcc = rule({ id: 'r1', mcc: 5411, categoryId: 'simeyniy-byudzhet' });
    expect(resolveTarget(tiers([byMcc]), { description: 'АТБ 421', mcc: 5411 })).toEqual({
      kind: 'category',
      categoryId: 'simeyniy-byudzhet',
    });
  });

  it('Scenario: The longest шаблон pattern wins inside the шаблон', () => {
    expect(resolveCategory(tiers(), { description: 'BOLT FOOD' })).toBe('food-delivery');
    expect(resolveCategory(tiers(), { description: 'BOLT' })).toBe('transport');
  });

  it('Scenario: A remapped базова категорія lands somewhere else', () => {
    const targets = defaults().set('groceries', 'yizha');
    expect(resolveCategory(tiers([], targets), { description: 'АТБ 421' })).toBe('yizha');
  });

  it('Scenario: A switched-off базова категорія matches nothing', () => {
    const targets = defaults();
    targets.delete('habits');
    expect(resolveTarget(tiers([], targets), { description: 'НОВИЙ ЗАКЛАД', mcc: 5921 })).toBe(
      undefined,
    );
  });

  it('Scenario: An untouched базова категорія uses its типова категорія', () => {
    const targets = defaults().set('groceries', 'yizha');
    expect(resolveCategory(tiers([], targets), { description: 'АВРОРА' })).toBe('home');
  });

  it('Scenario: An ineligible правило-переказ does not silence the шаблон', () => {
    const toReserve = transferRule({ id: 'r1', merchant: 'атб', toAccountId: reserve.id });
    expect(
      resolveTarget(
        tiers([toReserve]),
        { description: 'АТБ 421', from: { accountId: reserve.id, currency: 'UAH' } },
        accounts,
      ),
    ).toEqual({ kind: 'category', categoryId: 'groceries' });
  });

  it('an eligible правило-переказ answers before the шаблон', () => {
    const toReserve = transferRule({ id: 'r1', merchant: 'атб', toAccountId: reserve.id });
    expect(
      resolveTarget(
        tiers([toReserve]),
        { description: 'АТБ 421', from: { accountId: platinum.id, currency: 'UAH' } },
        accounts,
      ),
    ).toEqual({ kind: 'transfer', toAccountId: reserve.id });
  });

  it('resolveCategory ignores a правило-переказ and lets the шаблон answer', () => {
    const toReserve = transferRule({ id: 'r1', merchant: 'атб', toAccountId: reserve.id });
    expect(resolveCategory(tiers([toReserve]), { description: 'АТБ 421' })).toBe('groceries');
  });

  it('Scenario: Neither tier matches', () => {
    expect(resolveTarget(tiers(), { description: 'НОВИЙ ЗАКЛАД' })).toBe(undefined);
    expect(resolveCategory(tiers(), { description: 'НОВИЙ ЗАКЛАД' })).toBe(undefined);
  });

  it('a context with no шаблон decides by the правила alone', () => {
    expect(resolveCategory({ rules: [], merchants: NO_MERCHANTS }, { description: 'АТБ 421' })).toBe(undefined);
  });
});

describe('sweepUncategorised over both tiers', () => {
  const withTemplate = (rules: readonly Rule[]) => ({
    rules,
    templateRules: templateRules(defaults()),
    merchants: NO_MERCHANTS,
  });

  it('sweeps a витрата in «Без категорії» by the шаблон with no правило present', () => {
    const stored = [storedExpense({ id: 't1', description: 'АТБ 421' })];
    expect(sweepUncategorised(withTemplate([]), stored, accounts)).toEqual([
      { kind: 'category', id: 't1', categoryId: 'groceries' },
    ]);
  });

  it('Scenario: The шаблон fills what the new правило does not', () => {
    const fresh = rule({ id: 'r1', merchant: 'новий заклад', categoryId: 'eating-out' });
    const stored = [
      storedExpense({ id: 't1', description: 'АТБ 421' }),
      storedExpense({ id: 't2', description: 'НОВИЙ ЗАКЛАД 7' }),
    ];
    expect(sweepUncategorised(withTemplate([fresh]), stored, accounts)).toEqual([
      { kind: 'category', id: 't1', categoryId: 'groceries' },
      { kind: 'category', id: 't2', categoryId: 'eating-out' },
    ]);
  });

  it('Scenario: A категорія the owner chose is still never taken away', () => {
    const stored = [storedExpense({ id: 't1', categoryId: 'eating-out', description: 'АТБ 421' })];
    expect(sweepUncategorised(withTemplate([]), stored, accounts)).toEqual([]);
  });

  it('moves nothing by the шаблон’s MCC codes on a витрата that carries none', () => {
    const stored = [storedExpense({ id: 't1', description: 'НОВИЙ ЗАКЛАД 7' })];
    expect(sweepUncategorised(withTemplate([]), stored, accounts)).toEqual([]);
  });

  it('Scenario: An MCC the new шаблон adds reaches the витрати carrying it', () => {
    // Any MCC the шаблон carries stands in for "the code the new version added": the sweep is the
    // ordinary one, and only a витрата carrying the code moves by it.
    const group = TEMPLATE_GROUPS.find((g) => g.mcc.length > 0)!;
    const tiers = {
      rules: [],
      templateRules: templateRules(new Map([[group.id, 'beauty']])),
      merchants: NO_MERCHANTS,
    };
    const stored = [
      storedExpense({ id: 't1', description: 'НІЩО НЕ ЗБІГАЄТЬСЯ 1', mcc: group.mcc[0] }),
      storedExpense({ id: 't2', description: 'НІЩО НЕ ЗБІГАЄТЬСЯ 2' }),
    ];
    expect(sweepUncategorised(tiers, stored, accounts)).toEqual([
      { kind: 'category', id: 't1', categoryId: 'beauty' },
    ]);
  });

  it('a правило targeting «Без категорії» still answers, so the шаблон does not move the витрата', () => {
    const intoTheGap = rule({ id: 'r1', merchant: 'атб', categoryId: UNCATEGORISED_CATEGORY_ID });
    const stored = [storedExpense({ id: 't1', description: 'АТБ 421' })];
    expect(sweepUncategorised(withTemplate([intoTheGap]), stored, accounts)).toEqual([]);
  });
});

describe('a правило naming a продавець', () => {
  function named(id: string, name: string, spellings: readonly string[]): Merchant {
    const base = new Date('2026-01-01T00:00:00Z').getTime();
    return merchant({
      id,
      name,
      spellings: spellings.map((spelling, n) => ({ id: `${id}-s${n}`, spelling, addedAt: new Date(base + n) })),
      createdAt: new Date(base),
    });
  }

  function merchantRule(input: {
    id: string;
    merchantId: string;
    mcc?: number;
    categoryId: string;
    createdAt?: string;
  }): Rule {
    return {
      id: input.id,
      merchantId: input.merchantId,
      mcc: input.mcc,
      target: { kind: 'category', categoryId: input.categoryId },
      createdAt: new Date(input.createdAt ?? '2026-01-01T00:00:00.000Z'),
    };
  }

  const atb = named('atb', 'АТБ', ['атб', 'atb']);
  const groceries = { kind: 'category', categoryId: 'groceries' } as const;
  const eatingOut = { kind: 'category', categoryId: 'eating-out' } as const;

  it('Scenario: A продавець matches every spelling it is recognised by', () => {
    const index = merchantIndex([atb]);
    const rules = [merchantRule({ id: 'r1', merchantId: 'atb', categoryId: 'groceries' })];
    expect(matchRule(rules, index, { description: 'Оплата послуг АТБ-Маркет 1234' })).toEqual(groceries);
    expect(matchRule(rules, index, { description: 'ATB MARKET' })).toEqual(groceries);
    expect(matchRule(rules, index, { description: 'Сільпо' })).toBeUndefined();
  });

  it('Scenario: A продавець ranks as long as its recognising написання', () => {
    const index = merchantIndex([named('atb', 'АТБ', ['атб'])]);
    const rules = [
      merchantRule({ id: 'r1', merchantId: 'atb', categoryId: 'groceries', createdAt: '2026-02-01T00:00:00Z' }),
      rule({ id: 'r2', merchant: 'атб 421', categoryId: 'eating-out' }),
    ];
    expect(matchRule(rules, index, { description: 'АТБ 421' })).toEqual(eatingOut);
  });

  it('ranks exactly as the pattern-правило of its написання, so a tie goes to the newer rule', () => {
    const index = merchantIndex([named('atb', 'АТБ', ['атб'])]);
    const pattern = rule({ id: 'r1', merchant: 'атб', categoryId: 'groceries', createdAt: '2026-01-01T00:00:00Z' });
    const byMerchant = merchantRule({
      id: 'r2',
      merchantId: 'atb',
      categoryId: 'eating-out',
      createdAt: '2026-02-01T00:00:00Z',
    });
    expect(matchRule([pattern, byMerchant], index, { description: 'АТБ 12' })).toEqual(eatingOut);
    const newerPattern = { ...pattern, createdAt: new Date('2026-03-01T00:00:00Z') };
    expect(matchRule([newerPattern, byMerchant], index, { description: 'АТБ 12' })).toEqual(groceries);
  });

  it('Scenario: A продавець rule follows recognition, not a bare substring', () => {
    const index = merchantIndex([named('bolt', 'Bolt', ['bolt']), named('bolt-food', 'Bolt Food', ['bolt food'])]);
    const rules = [merchantRule({ id: 'r1', merchantId: 'bolt', categoryId: 'transport' })];
    expect(matchRule(rules, index, { description: 'BOLT FOOD 3411' })).toBeUndefined();
    expect(matchRule(rules, index, { description: 'BOLT 12' })).toEqual({ kind: 'category', categoryId: 'transport' });
  });

  it('a продавець and an MCC both have to hold, and together beat a merchant alone', () => {
    const index = merchantIndex([atb]);
    const rules = [
      merchantRule({ id: 'r1', merchantId: 'atb', mcc: 5812, categoryId: 'eating-out' }),
      rule({ id: 'r2', merchant: 'atb market', categoryId: 'groceries' }),
    ];
    expect(matchRule(rules, index, { description: 'ATB MARKET', mcc: 5812 })).toEqual(eatingOut);
    expect(matchRule(rules, index, { description: 'ATB MARKET', mcc: 5411 })).toEqual(groceries);
  });

  it('Scenario: A rule naming both a pattern and a продавець is rejected', () => {
    expect(() => checkMerchantCriterion({ merchant: 'атб', merchantId: 'atb' })).toThrow();
    expect(() => checkMerchantCriterion({ merchantId: 'atb' })).not.toThrow();
    expect(() => checkMerchantCriterion({ merchant: 'атб' })).not.toThrow();
  });

  it('decides wherever the tiers are read: resolveTarget, resolveCategory and the розбір', () => {
    const tiers = {
      rules: [merchantRule({ id: 'r1', merchantId: 'atb', categoryId: 'eating-out' })],
      templateRules: templateRules(new Map()),
      merchants: merchantIndex([atb]),
    };
    expect(resolveTarget(tiers, { description: 'ATB MARKET 23' })).toEqual(eatingOut);
    expect(resolveCategory(tiers, { description: 'ATB 12' })).toBe('eating-out');
    const stored = [storedExpense({ id: 'e1', description: 'ATB MARKET' })];
    expect(sweepUncategorised(tiers, stored, accounts)).toEqual([
      { kind: 'category', id: 'e1', categoryId: 'eating-out' },
    ]);
  });

  it('Scenario: Service words are skipped in the proposed pattern', () => {
    expect(proposeMerchantPattern('Оплата послуг АТБ-Маркет 1234 Київ')).toBe('атб');
  });

  it('Scenario: A transliterated service word is skipped in the proposed pattern', () => {
    expect(proposeMerchantPattern('Oplata poslug MEGOGO 1234')).toBe('megogo');
  });
});

describe('правила-джерела', () => {
  /** A правило-джерело, the same shape as `rule` otherwise. */
  function sourceRule(input: {
    id: string;
    merchant?: string;
    merchantId?: string;
    mcc?: number;
    sourceId: string;
    createdAt?: string;
  }): Rule {
    return {
      id: input.id,
      ...(input.merchant === undefined ? {} : { merchant: input.merchant }),
      ...(input.merchantId === undefined ? {} : { merchantId: input.merchantId }),
      ...(input.mcc === undefined ? {} : { mcc: input.mcc }),
      target: { kind: 'source', sourceId: input.sourceId },
      createdAt: new Date(input.createdAt ?? '2026-01-01T00:00:00.000Z'),
    };
  }

  function income(id: string, description: string | undefined, sourceId = UNSOURCED_SOURCE_ID): Income {
    return {
      type: 'income',
      id,
      date: '2026-09-12',
      accountId: platinum.id,
      amount: money(1250, 'UAH'),
      sourceId,
      ...(description === undefined ? {} : { description }),
    };
  }

  it('Scenario: Arriving money is matched by правила-джерела alone', () => {
    const rules = [
      rule({ id: 'r1', merchant: 'відсотки', categoryId: 'groceries' }),
      sourceRule({ id: 'r2', merchant: 'відсотки', sourceId: 'interest' }),
    ];
    expect(matchSource(rules, NO_MERCHANTS, { description: 'Відсотки за вересень' })).toBe('interest');
    expect(matchRule(rules, NO_MERCHANTS, { description: 'Відсотки за вересень' }, [], 'in')).toEqual({
      kind: 'source',
      sourceId: 'interest',
    });
  });

  it('Scenario: Leaving money ignores правила-джерела', () => {
    const rules = [
      rule({ id: 'r1', merchant: 'відсотки', categoryId: 'groceries' }),
      sourceRule({ id: 'r2', merchant: 'відсотки за', sourceId: 'interest', createdAt: '2026-02-01T00:00:00.000Z' }),
    ];
    const leaving = { description: 'Відсотки за підписку', from: { accountId: platinum.id, currency: 'UAH' as const } };
    expect(matchRule(rules, NO_MERCHANTS, leaving, accounts)).toEqual({ kind: 'category', categoryId: 'groceries' });
    expect(matchCategory(rules, NO_MERCHANTS, { description: 'Відсотки за підписку' })).toBe('groceries');
    expect(resolveCategory({ rules, merchants: NO_MERCHANTS }, { description: 'Відсотки за підписку' })).toBe('groceries');
  });

  it('Scenario: The longest правило-джерело wins', () => {
    const rules = [
      sourceRule({ id: 'r1', merchant: 'зарплата', sourceId: 'salary' }),
      sourceRule({ id: 'r2', merchant: 'зарплата аванс', sourceId: 'advance' }),
    ];
    expect(matchSource(rules, NO_MERCHANTS, { description: 'Зарплата аванс жовтень' })).toBe('advance');
  });

  it('Scenario: A правило-джерело naming a продавець follows recognition', () => {
    const monobank = merchant({
      id: 'mono',
      name: 'Monobank',
      spellings: [{ id: 'm-s0', spelling: 'monobank', addedAt: new Date(0) }],
      createdAt: new Date(0),
    });
    const rules = [sourceRule({ id: 'r1', merchantId: 'mono', sourceId: 'interest' })];
    expect(matchSource(rules, merchantIndex([monobank]), { description: 'Monobank відсотки на залишок' })).toBe('interest');
  });

  it('the шаблон is never consulted for money arriving, and «Без джерела» answers nothing', () => {
    const template = templateRules(new Map([[TEMPLATE_GROUPS[0]!.id, 'groceries']]));
    expect(matchRule(template, NO_MERCHANTS, { description: TEMPLATE_GROUPS[0]!.merchants[0]! }, [], 'in')).toBeUndefined();
    const restored = [sourceRule({ id: 'r1', merchant: 'відсотки', sourceId: UNSOURCED_SOURCE_ID })];
    expect(matchSource(restored, NO_MERCHANTS, { description: 'Відсотки' })).toBeUndefined();
  });

  it('Scenario: A new правило-джерело answers the доходи already waiting', () => {
    const rules = [sourceRule({ id: 'r1', merchant: 'відсотки', sourceId: 'interest' })];
    const stored = [
      income('i1', 'Відсотки 12.50 UAH'),
      income('i2', 'Відсотки 8.00 UAH'),
      income('i3', "Від: Міхаіл Кас'ян"),
    ];
    expect(sweepUnsourced({ rules, merchants: NO_MERCHANTS }, stored)).toEqual([
      { id: 'i1', sourceId: 'interest' },
      { id: 'i2', sourceId: 'interest' },
    ]);
  });

  it('Scenario: A more specific правило-джерело keeps the last word', () => {
    const rules = [
      sourceRule({ id: 'r1', merchant: 'зарплата аванс', sourceId: 'advance' }),
      sourceRule({ id: 'r2', merchant: 'зарплата', sourceId: 'salary', createdAt: '2026-03-01T00:00:00.000Z' }),
    ];
    expect(sweepUnsourced({ rules, merchants: NO_MERCHANTS }, [income('i1', 'Зарплата аванс жовтень')])).toEqual([
      { id: 'i1', sourceId: 'advance' },
    ]);
  });

  it('Scenario: A category правило moves no дохід', () => {
    const rules = [rule({ id: 'r1', merchant: 'атб', categoryId: 'groceries' })];
    const stored = [income('i1', 'АТБ повернення коштів')];
    expect(sweepUnsourced({ rules, merchants: NO_MERCHANTS }, stored)).toEqual([]);
    expect(sweepUncategorised({ rules, merchants: NO_MERCHANTS }, stored, accounts)).toEqual([]);
  });

  it('Scenario: A джерело the owner chose is never replaced', () => {
    const rules = [sourceRule({ id: 'r1', merchant: 'відсотки', sourceId: 'interest' })];
    expect(sweepUnsourced({ rules, merchants: NO_MERCHANTS }, [income('i1', 'Відсотки 12.50 UAH', 'gifts')])).toEqual([]);
  });

  it('a правило-джерело moves no витрата, and a дохід with neither опис nor MCC matches nothing', () => {
    const rules = [sourceRule({ id: 'r1', merchant: 'відсотки', sourceId: 'interest' })];
    const expense = expenseByDefault({
      id: 'e1',
      date: '2026-09-12',
      accountId: platinum.id,
      amount: money(2000, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
      description: 'Відсотки сервіс',
    });
    expect(sweepUncategorised({ rules, merchants: NO_MERCHANTS }, [expense], accounts)).toEqual([]);
    expect(sweepUnsourced({ rules, merchants: NO_MERCHANTS }, [expense, income('i1', undefined)])).toEqual([]);
  });
});
