import { describe, expect, it } from 'vitest';

import { activeCategories, type Category } from './category';
import { matchRule, type Rule } from './rules';

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
    categoryId: input.categoryId,
    createdAt: new Date(input.createdAt ?? '2026-01-01T00:00:00.000Z'),
  };
}

describe('matchRule', () => {
  it('Scenario: A merchant pattern matches case-insensitively inside the description', () => {
    const rules = [rule({ id: 'r1', merchant: 'сільпо', categoryId: 'groceries' })];
    expect(matchRule(rules, { description: 'СІЛЬПО Київ вул. Хрещатик' })).toBe('groceries');
  });

  it('Scenario: An MCC matches exactly', () => {
    const rules = [rule({ id: 'r1', mcc: 5411, categoryId: 'groceries' })];
    expect(matchRule(rules, { description: 'новий магазин', mcc: 5411 })).toBe('groceries');
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
    expect(matchRule(rules, { description: 'Uklon', mcc: 4121 })).toBe('travel');
    // Without the MCC only the merchant-only rule matches, so the tier below takes over.
    expect(matchRule(rules, { description: 'Uklon' })).toBe('transport');
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
    expect(matchRule(rules, { description: 'Аптека 24', mcc: 5411 })).toBe('health');
  });

  it('Scenario: The longest merchant pattern wins', () => {
    // The longer pattern is the older rule with the smaller id, so length alone decides.
    const rules = [
      rule({ id: 'r2', merchant: 'кава', categoryId: 'coffee', createdAt: '2026-02-01T09:00:00.000Z' }),
      rule({ id: 'r1', merchant: 'кавамашина', categoryId: 'home', createdAt: '2026-01-01T09:00:00.000Z' }),
    ];
    expect(matchRule(rules, { description: 'КАВАМАШИНА Rozetka' })).toBe('home');
    // The shorter pattern still wins where the longer one does not occur at all.
    expect(matchRule(rules, { description: 'кава з собою' })).toBe('coffee');
  });

  it('Scenario: An exact tie goes to the newest rule', () => {
    // The newer rule carries the smaller id, so the answer can only come from `createdAt`.
    const rules = [
      rule({ id: 'r2', merchant: 'атб', categoryId: 'groceries', createdAt: '2026-01-01T09:00:00.000Z' }),
      rule({ id: 'r1', merchant: 'атб', categoryId: 'eating-out', createdAt: '2026-02-01T09:00:00.000Z' }),
    ];
    expect(matchRule(rules, { description: 'АТБ Маркет' })).toBe('eating-out');
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
    expect(matchRule(rules, { description: 'СІЛЬПО Київ' })).toBe(groceries.id);
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
    expect(matchRule([earlierId, laterId], transaction)).toBe('eating-out');
    expect(matchRule([laterId, earlierId], transaction)).toBe('eating-out');
  });

  it('A rule with neither criterion is inert rather than a wildcard', () => {
    // Storage rejects such a rule ("A rule with no criterion is rejected"); should one reach
    // matching anyway, it must not swallow every transaction.
    const rules = [rule({ id: 'r1', categoryId: 'groceries' })];
    expect(matchRule(rules, { description: 'СІЛЬПО Київ', mcc: 5411 })).toBeUndefined();
  });
});

describe('matchRule — what the tiers rest on', () => {
  it('A pattern matches anywhere in the description, not only at its start', () => {
    // Real monobank descriptions put the merchant after the operation, so "starts with" would
    // silently stop matching the rules the owner wrote against them.
    const rules = [rule({ id: 'r1', merchant: 'сільпо', categoryId: 'groceries' })];
    expect(matchRule(rules, { description: 'Оплата картою СІЛЬПО' })).toBe('groceries');
    expect(matchRule(rules, { description: 'СІЛЬПО Київ' })).toBe('groceries');
    expect(matchRule(rules, { description: 'Оплата картою' })).toBeUndefined();
  });

  it('Both sides are folded, so an upper-case pattern matches a lower-case description', () => {
    // The owner may type the pattern in any case; only folding both sides makes that irrelevant.
    const rules = [rule({ id: 'r1', merchant: 'СІЛЬПО', categoryId: 'groceries' })];
    expect(matchRule(rules, { description: 'оплата картою сільпо' })).toBe('groceries');
  });

  it('A blank merchant pattern is no criterion, not a wildcard', () => {
    // The form and the repository both refuse one; if a degenerate rule ever reached matching, an
    // empty pattern occurs in every description and would outrank every real MCC rule.
    const blank = rule({ id: 'r1', merchant: '   ', categoryId: 'groceries' });
    const byMcc = rule({ id: 'r2', mcc: 5411, categoryId: 'health' });
    expect(matchRule([blank], { description: 'будь-що' })).toBeUndefined();
    expect(matchRule([blank, byMcc], { description: 'будь-що', mcc: 5411 })).toBe('health');
  });

  it('A merchant-only rule beats an MCC-only rule of the same standing', () => {
    // The tier, not the pattern length: both rules are the same age, and the merchant-only one is
    // the one with the greater id, so neither of the lower tie-breaks can be what decides it.
    const rules = [
      rule({ id: 'a', mcc: 5411, categoryId: 'groceries', createdAt: '2026-01-01T09:00:00.000Z' }),
      rule({ id: 'b', merchant: 'аптека', categoryId: 'health', createdAt: '2026-01-01T09:00:00.000Z' }),
    ];
    expect(matchRule(rules, { description: 'Аптека 24', mcc: 5411 })).toBe('health');
  });
});
