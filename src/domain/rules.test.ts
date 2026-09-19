import { describe, expect, it } from 'vitest';

import { account } from './account';
import { activeCategories, type Category } from './category';
import { money } from './money';
import {
  countUncategorisedExpenses,
  matchCategory,
  matchRule,
  proposeMerchantPattern,
  sweepUncategorised,
  type Rule,
} from './rules';
import {
  UNCATEGORISED_CATEGORY_ID,
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
    expect(matchRule(rules, { description: 'СІЛЬПО Київ вул. Хрещатик' })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
  });

  it('Scenario: An MCC matches exactly', () => {
    const rules = [rule({ id: 'r1', mcc: 5411, categoryId: 'groceries' })];
    expect(matchRule(rules, { description: 'новий магазин', mcc: 5411 })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
    // Equality, not proximity — and a transaction carrying no MCC matches no MCC rule.
    expect(matchRule(rules, { description: 'новий магазин', mcc: 5412 })).toBeUndefined();
    expect(matchRule(rules, { description: 'новий магазин' })).toBeUndefined();
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
    expect(matchRule(rules, { description: 'Uklon', mcc: 4121 })).toEqual({
      kind: 'category',
      categoryId: 'travel',
    });
    // Without the MCC only the merchant-only rule matches, so the tier below takes over.
    expect(matchRule(rules, { description: 'Uklon' })).toEqual({
      kind: 'category',
      categoryId: 'transport',
    });
    // And the alphabet is not folded away: a Cyrillic pattern does not reach a Latin description.
    expect(
      matchRule([rule({ id: 'r3', merchant: 'уклон', categoryId: 'transport' })], {
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
    expect(matchRule(rules, { description: 'Аптека 24', mcc: 5411 })).toEqual({
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
    expect(matchRule(rules, { description: 'КАВАМАШИНА Rozetka' })).toEqual({
      kind: 'category',
      categoryId: 'home',
    });
    // The shorter pattern still wins where the longer one does not occur at all.
    expect(matchRule(rules, { description: 'кава з собою' })).toEqual({
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
    expect(matchRule(rules, { description: 'АТБ Маркет' })).toEqual({
      kind: 'category',
      categoryId: 'eating-out',
    });
  });

  it('Scenario: No matching rule returns nothing', () => {
    const rules = [
      rule({ id: 'r1', merchant: 'сільпо', categoryId: 'groceries' }),
      rule({ id: 'r2', mcc: 5411, categoryId: 'groceries' }),
    ];
    expect(matchRule(rules, { description: 'Невідомий продавець', mcc: 7999 })).toBeUndefined();
    expect(matchRule([], { description: 'СІЛЬПО Київ', mcc: 5411 })).toBeUndefined();
  });

  it('Scenario: A rule keeps matching into an archived category', () => {
    const groceries: Category = { id: 'groceries', name: 'Groceries', archived: true };
    const rules = [rule({ id: 'r1', merchant: 'сільпо', categoryId: groceries.id })];
    // Archiving takes the category out of every picker…
    expect(activeCategories([groceries])).toEqual([]);
    // …and leaves matching untouched: `Rule` does not even carry the flag.
    expect(matchRule(rules, { description: 'СІЛЬПО Київ' })).toEqual({
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
    expect(matchRule([earlierId, laterId], transaction)).toEqual({
      kind: 'category',
      categoryId: 'eating-out',
    });
    expect(matchRule([laterId, earlierId], transaction)).toEqual({
      kind: 'category',
      categoryId: 'eating-out',
    });
  });

  it('A rule with neither criterion is inert rather than a wildcard', () => {
    // Storage rejects such a rule ("A rule with no criterion is rejected"); should one reach
    // matching anyway, it must not swallow every transaction.
    const rules = [rule({ id: 'r1', categoryId: 'groceries' })];
    expect(matchRule(rules, { description: 'СІЛЬПО Київ', mcc: 5411 })).toBeUndefined();
  });

  it('Scenario: A правило-переказ wins by the same ladder', () => {
    const rules = [
      rule({ id: 'r1', merchant: 'округлення', categoryId: 'bills' }),
      transferRule({ id: 'r2', merchant: 'округлення балансу', toAccountId: reserve.id }),
    ];
    expect(
      matchRule(
        rules,
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
    expect(matchRule(rules, { description: 'округлення' })).toBeUndefined();
  });
});

describe('matchRule — what the tiers rest on', () => {
  it('A pattern matches anywhere in the description, not only at its start', () => {
    // Real monobank descriptions put the merchant after the operation, so "starts with" would
    // silently stop matching the rules the owner wrote against them.
    const rules = [rule({ id: 'r1', merchant: 'сільпо', categoryId: 'groceries' })];
    expect(matchRule(rules, { description: 'Оплата картою СІЛЬПО' })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
    expect(matchRule(rules, { description: 'СІЛЬПО Київ' })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
    expect(matchRule(rules, { description: 'Оплата картою' })).toBeUndefined();
  });

  it('Both sides are folded, so an upper-case pattern matches a lower-case description', () => {
    // The owner may type the pattern in any case; only folding both sides makes that irrelevant.
    const rules = [rule({ id: 'r1', merchant: 'СІЛЬПО', categoryId: 'groceries' })];
    expect(matchRule(rules, { description: 'оплата картою сільпо' })).toEqual({
      kind: 'category',
      categoryId: 'groceries',
    });
  });

  it('A blank merchant pattern is no criterion, not a wildcard', () => {
    // The form and the repository both refuse one; if a degenerate rule ever reached matching, an
    // empty pattern occurs in every description and would outrank every real MCC rule.
    const blank = rule({ id: 'r1', merchant: '   ', categoryId: 'groceries' });
    const byMcc = rule({ id: 'r2', mcc: 5411, categoryId: 'health' });
    expect(matchRule([blank], { description: 'будь-що' })).toBeUndefined();
    expect(matchRule([blank, byMcc], { description: 'будь-що', mcc: 5411 })).toEqual({
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
    expect(matchRule(rules, { description: 'Аптека 24', mcc: 5411 })).toEqual({
      kind: 'category',
      categoryId: 'health',
    });
  });
});

describe('matchCategory', () => {
  it('ranks category rules exactly as matchRule does', () => {
    const rules = [rule({ id: 'r1', merchant: 'сільпо', categoryId: 'groceries' })];
    expect(matchCategory(rules, { description: 'СІЛЬПО Київ' })).toBe('groceries');
    expect(matchCategory(rules, { description: 'невідомо' })).toBeUndefined();
  });

  it("Scenario: A правило-переказ proposes nothing by hand", () => {
    const rules = [
      rule({ id: 'r1', merchant: 'округлення', categoryId: 'bills' }),
      transferRule({ id: 'r2', merchant: 'округлення балансу', toAccountId: reserve.id }),
    ];
    // No `from` at all: exactly what the entry form and a чернетка's категорія have.
    expect(matchCategory(rules, { description: 'Округлення балансу' })).toBe('bills');
  });

  it('proposes nothing when only a правило-переказ would match', () => {
    const rules = [transferRule({ id: 'r1', merchant: 'округлення', toAccountId: reserve.id })];
    expect(matchCategory(rules, { description: 'округлення' })).toBeUndefined();
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
    expect(matchRule(proposed, { description: 'УКЛОН' })).toEqual({
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
}): Expense {
  return expenseByDefault({
    id: input.id,
    date: '2026-09-01',
    accountId: input.accountId ?? platinum.id,
    amount: money(12550, 'UAH'),
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.description ? { description: input.description } : {}),
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
    expect(sweepUncategorised([atb], stored, accounts)).toEqual([
      { kind: 'category', id: 't1', categoryId: 'groceries' },
      { kind: 'category', id: 't2', categoryId: 'groceries' },
    ]);
  });

  it('Scenario: A категорія the owner chose is never taken away', () => {
    const stored = [storedExpense({ id: 't1', categoryId: 'eating-out', description: 'АТБ 421' })];
    expect(sweepUncategorised([atb], stored, accounts)).toEqual([]);
  });

  it('Scenario: A more specific правило keeps the last word during the sweep', () => {
    // The категорія a swept витрата lands on is what the whole set gives its опис, not the target
    // of whatever правило was written last.
    const longer = rule({ id: 'r2', merchant: 'атб 421', categoryId: 'eating-out' });
    const stored = [storedExpense({ id: 't1', description: 'АТБ 421' })];
    expect(sweepUncategorised([atb, longer], stored, accounts)).toEqual([
      { kind: 'category', id: 't1', categoryId: 'eating-out' },
    ]);
  });

  it('Scenario: An MCC-only правило moves nothing', () => {
    // A stored транзакція keeps no MCC, so there is nothing for such a правило to match on.
    const byMcc = rule({ id: 'r2', mcc: 5411, categoryId: 'groceries' });
    const stored = [storedExpense({ id: 't1', description: 'АТБ 421' })];
    expect(sweepUncategorised([byMcc], stored, accounts)).toEqual([]);
  });

  it('Scenario: A витрата with no опис is not swept', () => {
    const stored = [storedExpense({ id: 't1' })];
    expect(sweepUncategorised([atb], stored, accounts)).toEqual([]);
  });

  it('Scenario: A правило targeting «Без категорії» moves nothing', () => {
    // Creating one is refused, but a restore writes the rules table directly.
    const intoTheGap = rule({ id: 'r2', merchant: 'атб', categoryId: UNCATEGORISED_CATEGORY_ID });
    const stored = [storedExpense({ id: 't1', description: 'АТБ 421' })];
    expect(sweepUncategorised([intoTheGap], stored, accounts)).toEqual([]);
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
    expect(sweepUncategorised([atb], [returned], accounts)).toEqual([]);
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
    expect(sweepUncategorised([atb], [income, moved, correction], accounts)).toEqual([]);
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
    expect(sweepUncategorised([roundUp], stored, accounts)).toEqual([
      { kind: 'transfer', id: 't1', toAccountId: reserve.id },
    ]);
  });

  it('Scenario: A правило-переказ leaves a витрата on its own destination where it is', () => {
    const roundUp = transferRule({ id: 'r1', merchant: 'округлення балансу', toAccountId: reserve.id });
    const stored = [
      storedExpense({ id: 't1', accountId: reserve.id, description: 'Округлення балансу «Резерв»' }),
    ];
    expect(sweepUncategorised([roundUp], stored, accounts)).toEqual([]);
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
    expect(sweepUncategorised([roundUp], stored, accounts)).toEqual([]);
  });

  it('a transfer move keeps id and toAccountId; date, опис and сума come from the original витрата', () => {
    const roundUp = transferRule({ id: 'r1', merchant: 'округлення', toAccountId: reserve.id });
    const original = storedExpense({
      id: 't1',
      accountId: platinum.id,
      description: 'округлення 479',
    });
    const [move] = sweepUncategorised([roundUp], [original], accounts);
    expect(move).toEqual({ kind: 'transfer', id: original.id, toAccountId: reserve.id });
    // The rest of the leg — date, опис and сума on both legs — is the repository's job, built from
    // the original транзакція this move names; the domain decision carries only the destination.
  });
});
