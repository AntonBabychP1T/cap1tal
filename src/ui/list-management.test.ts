import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { Category, Source } from '../domain/category';
import { NO_MERCHANTS, merchant, merchantIndex } from '../domain/merchants';
import type { Rule } from '../domain/rules';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  INTEREST_SOURCE_ID,
  UNCATEGORISED_CATEGORY_ID,
} from '../domain/transaction';
import { bindTestJournal } from './journal';
import {
  NO_MERCHANT_TO_PICK,
  manageCategories,
  manageSources,
  mccText,
  ruleFromDraft,
  ruleLine,
  ruleDraftFromOffer,
  ruleOffer,
  ruleOfferView,
  storeRule,
  type ManagedRow,
} from './list-management';

const category = (id: string, name: string, archived = false): Category => ({ id, name, archived });
const source = (id: string, name: string, archived = false): Source => ({ id, name, archived });

/** The screen finds a row by id; the tests do the same, and say so when it is not there. */
function rowFor(rows: readonly ManagedRow[], id: string): ManagedRow {
  const row = rows.find((r) => r.id === id);
  if (!row) {
    throw new Error(`the list does not hold "${id}"`);
  }
  return row;
}

const RESERVED = [
  category(UNCATEGORISED_CATEGORY_ID, 'Без категорії'),
  category(FEES_CATEGORY_ID, 'Комісія'),
  category(CORRECTION_CATEGORY_ID, 'Коригування'),
];

describe('manageCategories', () => {
  it('Scenario: An archived row is set apart, not gone', () => {
    const rows = manageCategories([
      category('home', 'Home'),
      category('pets', 'Pets', true),
      category('groceries', 'Groceries'),
    ]);

    // Pets is still listed — archiving hides it from pickers, not from Налаштування — and it sits
    // after the rows still in use, flagged, offering the way back instead of the way out.
    expect(rows.map((r) => r.id)).toEqual(['groceries', 'home', 'pets']);
    expect(rowFor(rows, 'pets')).toMatchObject({
      name: 'Pets',
      archived: true,
      canUnarchive: true,
      canArchive: false,
      canRename: true,
    });
    expect(rowFor(rows, 'home')).toMatchObject({ archived: false, canUnarchive: false });
  });

  it('Scenario: A reserved row offers no editing', () => {
    const rows = manageCategories([...RESERVED, category('home', 'Home')]);

    // «Без категорії» is shown like any other row…
    expect(rowFor(rows, UNCATEGORISED_CATEGORY_ID)).toMatchObject({
      name: 'Без категорії',
      reserved: true,
      canRename: false,
      canArchive: false,
      canUnarchive: false,
    });
    // …and so are the other two the domain fixes.
    expect(rows.filter((r) => r.reserved).map((r) => r.name)).toEqual(
      expect.arrayContaining(['Без категорії', 'Комісія', 'Коригування']),
    );
    expect(rows.filter((r) => r.canRename || r.canArchive).map((r) => r.id)).toEqual(['home']);
  });

  it('Unarchived rows come first, each group by name', () => {
    const rows = manageCategories([
      category('habits', 'habits', true),
      category('transport', 'Transport'),
      category('book', 'book', true),
      category('bills', 'Bills'),
    ]);

    expect(rows.map((r) => r.name)).toEqual(['Bills', 'Transport', 'book', 'habits']);
    expect(rows.map((r) => r.archived)).toEqual([false, false, true, true]);
  });

  it('An empty list manages nothing', () => {
    expect(manageCategories([])).toEqual([]);
  });
});

describe('manageSources', () => {
  it('Every ordinary джерело can be renamed and archived', () => {
    const rows = manageSources([
      source('freelance', 'Freelance', true),
      source('salary', 'Salary'),
      source('batky', 'батьки'),
    ]);

    // The uk collation puts Ukrainian names ahead of Latin ones — the owner's own list first.
    expect(rows.map((r) => r.name)).toEqual(['батьки', 'Salary', 'Freelance']);
    expect(rows.every((r) => !r.reserved && r.canRename)).toBe(true);
    expect(rowFor(rows, 'freelance')).toMatchObject({ canArchive: false, canUnarchive: true });
    expect(rowFor(rows, 'salary')).toMatchObject({ canArchive: true, canUnarchive: false });
  });

  it('Scenario: The reserved джерело may be neither renamed nor archived', () => {
    const rows = manageSources([
      source('salary', 'Salary'),
      source(INTEREST_SOURCE_ID, 'Відсотки'),
    ]);

    // Shown like any other row — the owner records interest by hand too — and editable by none.
    expect(rowFor(rows, INTEREST_SOURCE_ID)).toMatchObject({
      name: 'Відсотки',
      archived: false,
      reserved: true,
      canRename: false,
      canArchive: false,
      canUnarchive: false,
    });
    expect(rowFor(rows, 'salary')).toMatchObject({ reserved: false, canRename: true });
  });
});

const context = { id: 'r1', createdAt: new Date('2026-08-24T09:00:00.000Z') };
const groceries = new Map([['groceries', 'Groceries']]);
const accountNames = new Map([['reserve', 'РЕЗЕРВ']]);

describe('ruleFromDraft', () => {
  it('Scenario: A created rule appears in the list', () => {
    // The owner types "сільпо → Groceries"; the trailing space they left is not part of it.
    const rule = ruleFromDraft(
      { merchant: ' сільпо ', mcc: '', target: 'category', categoryId: 'groceries' },
      context,
    );

    expect(rule).toEqual({
      id: 'r1',
      merchant: 'сільпо',
      target: { kind: 'category', categoryId: 'groceries' },
      createdAt: context.createdAt,
    });
    expect(ruleLine(rule, groceries, accountNames)).toEqual({
      id: 'r1',
      criteria: 'сільпо',
      category: 'Groceries',
    });
  });

  it('Scenario: A правило-переказ is stored', () => {
    const rule = ruleFromDraft(
      { merchant: 'округлення балансу', mcc: '', target: 'transfer', toAccountId: 'reserve' },
      context,
    );

    expect(rule).toEqual({
      id: 'r1',
      merchant: 'округлення балансу',
      target: { kind: 'transfer', toAccountId: 'reserve' },
      createdAt: context.createdAt,
    });
    expect(ruleLine(rule, groceries, accountNames)).toEqual({
      id: 'r1',
      criteria: 'округлення балансу',
      category: 'переказ на РЕЗЕРВ',
    });
  });

  it('Scenario: Switching the target drops the other choice', () => {
    // The form may still carry a category id from before the owner switched — ruleFromDraft reads
    // only the one `target` names.
    const rule = ruleFromDraft(
      {
        merchant: 'округлення балансу',
        mcc: '',
        target: 'transfer',
        categoryId: 'groceries',
        toAccountId: 'reserve',
      },
      context,
    );

    expect(rule.target).toEqual({ kind: 'transfer', toAccountId: 'reserve' });
    expect('categoryId' in rule).toBe(false);
  });

  it('Scenario: A rule with no criterion is rejected', () => {
    expect(() =>
      ruleFromDraft({ merchant: '   ', mcc: '  ', target: 'category', categoryId: 'groceries' }, context),
    ).toThrow('Правило потребує продавця або MCC');
  });

  it('Scenario: An MCC that is not a whole number is rejected', () => {
    // '0x15', '1e3' and '-5' are here because `Number` would take all three for whole numbers,
    // and the MCC stored would then not be the one the owner typed.
    for (const mcc of ['54.11', '5411 грн', 'MCC', '0x15', '1e3', '-5', '+5411']) {
      expect(() =>
        ruleFromDraft({ merchant: 'сільпо', mcc, target: 'category', categoryId: 'groceries' }, context),
      ).toThrow('MCC — це чотири цифри, напр. 5411');
    }
    // A whole number is taken as the integer it is, beside the merchant.
    expect(
      ruleFromDraft(
        { merchant: 'сільпо', mcc: ' 5411 ', target: 'category', categoryId: 'groceries' },
        context,
      ),
    ).toMatchObject({ merchant: 'сільпо', mcc: 5411 });
  });

  it('An MCC is exactly four digits', () => {
    // ISO 18245: a merchant category code is four digits. `999999` used to be saved — a правило
    // that can never match anything the bank sends, with nothing on the form saying so.
    for (const mcc of ['999999', '54110', '541', '1']) {
      expect(
        () => ruleFromDraft({ merchant: 'сільпо', mcc, target: 'category', categoryId: 'groceries' }, context),
        `"${mcc}" was accepted`,
      ).toThrow('MCC — це чотири цифри, напр. 5411');
    }
    // A leading zero is part of the code (0742 — ветеринари), and the stored number is still it.
    expect(
      ruleFromDraft({ merchant: '', mcc: '0742', target: 'category', categoryId: 'groceries' }, context),
    ).toMatchObject({ mcc: 742 });
  });

  it('A stored MCC is shown as its four digits, so the edit form takes it back', () => {
    // The number keeps no leading zero; the text the form is refilled with must, or re-saving an
    // untouched 0742 правило would be refused as «742».
    expect(mccText(742)).toBe('0742');
    expect(mccText(5411)).toBe('5411');
    const stored = ruleFromDraft(
      { merchant: '', mcc: '0742', target: 'category', categoryId: 'groceries' },
      context,
    );
    expect(
      ruleFromDraft(
        { merchant: '', mcc: mccText(stored.mcc ?? 0), target: 'category', categoryId: 'groceries' },
        context,
      ),
    ).toEqual(stored);
    expect(ruleLine(stored, groceries, accountNames).criteria).toBe('MCC 0742');
  });

  it('A rule with no category is rejected', () => {
    expect(() => ruleFromDraft({ merchant: 'сільпо', mcc: '', target: 'category' }, context)).toThrow(
      'Правило потребує категорії',
    );
    expect(() =>
      ruleFromDraft({ merchant: 'сільпо', mcc: '', target: 'category', categoryId: '' }, context),
    ).toThrow('Правило потребує категорії');
  });

  it('A правило-переказ with no рахунок is rejected', () => {
    expect(() => ruleFromDraft({ merchant: 'сільпо', mcc: '', target: 'transfer' }, context)).toThrow(
      'Правило потребує рахунку призначення',
    );
  });

  it('An MCC alone is criterion enough', () => {
    expect(
      ruleFromDraft({ merchant: '', mcc: '5411', target: 'category', categoryId: 'groceries' }, context),
    ).toEqual({
      id: 'r1',
      mcc: 5411,
      target: { kind: 'category', categoryId: 'groceries' },
      createdAt: context.createdAt,
    });
  });
});

describe('ruleLine', () => {
  const rule = (of: Partial<Rule>): Rule => ({
    id: 'r1',
    target: { kind: 'category', categoryId: 'groceries' },
    createdAt: context.createdAt,
    merchant: 'сільпо',
    ...of,
  });

  it('A rule holding both criteria shows both', () => {
    expect(ruleLine(rule({ mcc: 5411 }), groceries, accountNames).criteria).toBe('сільпо · MCC 5411');
  });

  it('Scenario: A правило-переказ appears in the list', () => {
    const line = ruleLine(
      rule({ merchant: 'округлення балансу', target: { kind: 'transfer', toAccountId: 'reserve' } }),
      groceries,
      new Map([['reserve', 'РЕЗЕРВ']]),
    );
    expect(line).toMatchObject({ criteria: 'округлення балансу', category: 'переказ на РЕЗЕРВ' });
  });

  it('Scenario: A deleted rule leaves the list', () => {
    // The list is `rulesRepo.list()` read again after the confirmed delete — nothing is kept aside.
    const screen = readFileSync(new URL('../app/manage/rules.tsx', import.meta.url), 'utf8');
    const remove = screen.slice(screen.indexOf('const remove = useCallback'));
    expect(remove.slice(0, remove.indexOf('[reload]'))).toMatch(/rulesRepo\.remove\(rule\.id\);[\s\S]*reload\(\);/);
    expect(screen).toContain('rules: rulesRepo.list(),');
  });

  it('Scenario: A rule naming a продавець appears in the list', () => {
    const line = ruleLine(rule({ merchant: undefined, merchantId: 'atb' }), groceries, accountNames, new Map([['atb', 'АТБ']]));
    expect(line.criteria).toBe('продавець АТБ');
    expect(line.category).toBe('Groceries');
  });

  it('the rule form offers the pattern and names where продавці are made when there is none', () => {
    const screen = readFileSync(new URL('../app/manage/rules.tsx', import.meta.url), 'utf8');
    expect(screen).toContain('choices={CRITERION_CHOICES}');
    expect(screen).toContain('{NO_MERCHANT_TO_PICK}');
    expect(screen).toContain('noun="merchants"');
    expect(NO_MERCHANT_TO_PICK).toContain('«Продавці»');
  });

  it('An MCC-only rule shows just the MCC', () => {
    expect(ruleLine(rule({ merchant: undefined, mcc: 5411 }), groceries, accountNames).criteria).toBe(
      'MCC 5411',
    );
  });

  it('A target the loaded names miss shows its raw id', () => {
    // Only a half-loaded screen can reach this — every stored rule targets a real row — but the
    // line stays readable instead of blank.
    expect(
      ruleLine(rule({ target: { kind: 'category', categoryId: 'repair' } }), groceries, accountNames),
    ).toEqual({
      id: 'r1',
      criteria: 'сільпо',
      category: 'repair',
    });
  });

  it('a правило-переказ whose рахунок the loaded names miss shows its raw id', () => {
    expect(
      ruleLine(rule({ target: { kind: 'transfer', toAccountId: 'ghost' } }), groceries, accountNames),
    ).toEqual({
      id: 'r1',
      criteria: 'сільпо',
      category: 'переказ на ghost',
    });
  });
});

/** The names the offer's sentence is written with, as the screens hand them to the sheet. */
const offerNames = {
  categoryNames: new Map([
    ['groceries', 'Groceries'],
    ['subscriptions', 'Підписки'],
  ]),
  accountNames: new Map([['reserve', 'РЕЗЕРВ']]),
};

describe('ruleOffer', () => {
  const noRules: readonly Rule[] = [];
  const silpoToGroceries: Rule = {
    id: 'r-silpo',
    merchant: 'сільпо',
    target: { kind: 'category', categoryId: 'groceries' },
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
  };
  const category = (categoryId: string): { kind: 'category'; categoryId: string } => ({
    kind: 'category',
    categoryId,
  });

  const platinum = { accountId: 'platinum', currency: 'UAH' };
  const reserveAccount = { id: 'reserve', currency: 'UAH' };
  const usdAccount = { id: 'usd', currency: 'USD' };

  it('Scenario: Categorising an imported витрата offers the правило', () => {
    expect(
      ruleOffer({
        description: 'СІЛЬПО 123 Київ, вул. Хрещатик',
        target: category('groceries'),
        rules: noRules,
        merchants: NO_MERCHANTS,
      }),
    ).toEqual({ merchant: 'сільпо', target: category('groceries') });
  });

  it('Scenario: A шаблон match still offers the правило', () => {
    // The шаблон already lands «АТБ» in Groceries, but the offer looks at the owner's правила
    // alone: a правило of their own outlives a later change to the шаблон or its mapping.
    expect(
      ruleOffer({ description: 'АТБ 421', target: category('groceries'), rules: noRules, merchants: NO_MERCHANTS }),
    ).toEqual({ merchant: 'атб', target: category('groceries') });
    // …and the hook that raises the offer reads the правила, never the two-tier context.
    const hook = readFileSync(new URL('../hooks/use-rule-offer.ts', import.meta.url), 'utf8');
    expect(hook).toContain('rules: rulesRepo.list()');
    expect(hook).not.toContain('categorisationContext');
  });

  it('Scenario: An опис that starts with no letter proposes the whole of itself', () => {
    expect(
      ruleOffer({ description: '7-Eleven Kyiv', target: category('groceries'), rules: noRules, merchants: NO_MERCHANTS }),
    ).toEqual({ merchant: '7-eleven kyiv', target: category('groceries') });
  });

  it('Scenario: A повернення is offered the правило too', () => {
    // ruleOffer takes no transaction type at all — the caller decides which types call it, per
    // "Setting a джерело on a дохід offers nothing" and "Editing a переказ offers nothing" below.
    expect(
      ruleOffer({ description: 'СІЛЬПО 123 Київ', target: category('groceries'), rules: noRules, merchants: NO_MERCHANTS }),
    ).toEqual({ merchant: 'сільпо', target: category('groceries') });
  });

  it('Scenario: A витрата with no опис is offered nothing', () => {
    expect(ruleOffer({ target: category('groceries'), rules: noRules, merchants: NO_MERCHANTS })).toBeUndefined();
  });

  it('Scenario: Moving a витрата back into «Без категорії» offers nothing', () => {
    expect(
      ruleOffer({
        description: 'СІЛЬПО 123 Київ',
        target: category(UNCATEGORISED_CATEGORY_ID),
        rules: noRules,
        merchants: NO_MERCHANTS,
      }),
    ).toBeUndefined();
  });

  it('Scenario: Nothing is offered for a правило that already covers it', () => {
    expect(
      ruleOffer({
        description: 'СІЛЬПО 123',
        target: category('groceries'),
        rules: [silpoToGroceries],
        merchants: NO_MERCHANTS,
      }),
    ).toBeUndefined();
  });

  it('Scenario: A different категорія than the правила give is still offered', () => {
    expect(
      ruleOffer({
        description: 'СІЛЬПО 123',
        target: category('eating-out'),
        rules: [silpoToGroceries],
        merchants: NO_MERCHANTS,
      }),
    ).toEqual({ merchant: 'сільпо', target: category('eating-out') });
  });

  it('Scenario: Retyping a витрата into a переказ offers the правило-переказ', () => {
    expect(
      ruleOffer({
        description: 'Округлення балансу «Резерв»',
        target: { kind: 'transfer', toAccountId: 'reserve' },
        fromAccount: platinum,
        accounts: [reserveAccount, usdAccount],
        rules: noRules,
        merchants: NO_MERCHANTS,
      }),
    ).toEqual({ merchant: 'округлення балансу', target: { kind: 'transfer', toAccountId: 'reserve' } });
  });

  it('Scenario: A cross-currency переказ offers no правило', () => {
    expect(
      ruleOffer({
        description: 'Купівля валюти',
        target: { kind: 'transfer', toAccountId: 'usd' },
        fromAccount: platinum,
        accounts: [reserveAccount, usdAccount],
        rules: noRules,
        merchants: NO_MERCHANTS,
      }),
    ).toBeUndefined();
  });

  it('Scenario: A переказ an existing правило-переказ already gives offers nothing', () => {
    const roundUp: Rule = {
      id: 'r-round-up',
      merchant: 'округлення балансу',
      target: { kind: 'transfer', toAccountId: 'reserve' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    expect(
      ruleOffer({
        description: 'Округлення балансу «Резерв»',
        target: { kind: 'transfer', toAccountId: 'reserve' },
        fromAccount: platinum,
        accounts: [reserveAccount, usdAccount],
        rules: [roundUp],
        merchants: NO_MERCHANTS,
      }),
    ).toBeUndefined();
  });

  describe('when the опис is recognised as a продавець', () => {
    const atb = merchant({
      id: 'atb',
      name: 'АТБ',
      spellings: [
        { id: 's1', spelling: 'атб', addedAt: new Date('2026-01-01T00:00:00Z') },
        { id: 's2', spelling: 'atb', addedAt: new Date('2026-01-02T00:00:00Z') },
      ],
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const reserve = merchant({
      id: 'reserve-m',
      name: 'Резерв',
      spellings: [{ id: 's3', spelling: 'округлення балансу', addedAt: new Date('2026-01-01T00:00:00Z') }],
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const merchants = merchantIndex([atb, reserve]);

    it('Scenario: A recognised опис offers its продавець', () => {
      const offer = ruleOffer({ description: 'ATB MARKET', target: category('groceries'), rules: noRules, merchants });
      expect(offer).toEqual({
        merchant: 'atb market',
        recognised: { merchantId: 'atb', name: 'АТБ' },
        target: category('groceries'),
      });
      const view = ruleOfferView(offer!, false, offer!.merchant, offerNames);
      expect(view.merchantLabel).toBe('продавець АТБ');
      expect(view.canSwitchToPattern).toBe(true);
      // The sheet names «продавець АТБ» and offers the switch to the pattern (main-screen).
      const sheet = readFileSync(new URL('../components/rule-offer-sheet.tsx', import.meta.url), 'utf8');
      expect(sheet).toContain('{view.merchantLabel}');
      expect(sheet).toMatch(/view\?\.canSwitchToPattern \? \(\s*<Action[^>]*onPress=\{\(\) => setUsePattern\(true\)\}/);
      expect(ruleFromDraft(ruleDraftFromOffer(offer!, view.criterion), { id: 'r1', createdAt: new Date(0) })).toEqual({
        id: 'r1',
        merchantId: 'atb',
        target: category('groceries'),
        createdAt: new Date(0),
      });
    });

    it('Scenario: The продавець can be replaced by a pattern', () => {
      const offer = ruleOffer({ description: 'ATB MARKET', target: category('groceries'), rules: noRules, merchants })!;
      const view = ruleOfferView(offer, true, offer.merchant, offerNames);
      expect(view.showsPattern).toBe(true);
      expect(ruleFromDraft(ruleDraftFromOffer(offer, view.criterion), { id: 'r1', createdAt: new Date(0) })).toEqual({
        id: 'r1',
        merchant: 'atb market',
        target: category('groceries'),
        createdAt: new Date(0),
      });
    });

    it('Scenario: A recognised опис offers a правило-переказ naming its продавець', () => {
      expect(
        ruleOffer({
          description: 'Округлення балансу «Резерв»',
          target: { kind: 'transfer', toAccountId: 'reserve' },
          fromAccount: platinum,
          accounts: [reserveAccount, usdAccount],
          rules: noRules,
          merchants,
        })?.recognised,
      ).toEqual({ merchantId: 'reserve-m', name: 'Резерв' });
    });

    it('Scenario: A правило naming the продавець already covers it', () => {
      const atbToGroceries: Rule = {
        id: 'r-atb',
        merchantId: 'atb',
        target: category('groceries'),
        createdAt: new Date('2026-03-01T10:00:00.000Z'),
      };
      expect(
        ruleOffer({ description: 'ATB MARKET', target: category('groceries'), rules: [atbToGroceries], merchants }),
      ).toBeUndefined();
    });

    it('an offer with no продавець is the pattern field', () => {
      const offer = ruleOffer({ description: 'СІЛЬПО 123', target: category('groceries'), rules: noRules, merchants })!;
      expect(ruleOfferView(offer, false, 'сільпо 123', offerNames)).toEqual({
        sentence: 'Наступного разу такий опис одразу піде в «Groceries».',
        targetLabel: 'Groceries',
        showsPattern: true,
        canSwitchToPattern: false,
        criterion: { kind: 'pattern', pattern: 'сільпо 123' },
      });
    });
  });
});

describe('ruleFromDraft and the merchant criterion', () => {
  it('Scenario: Switching the criterion drops the other choice', () => {
    const rule = ruleFromDraft(
      { merchant: 'атб', criterion: 'merchant', merchantId: 'atb', mcc: '', target: 'category', categoryId: 'groceries' },
      { id: 'r1', createdAt: new Date(0) },
    );
    expect(rule.merchantId).toBe('atb');
    expect(rule.merchant).toBeUndefined();
    const back = ruleFromDraft(
      { merchant: 'атб', criterion: 'pattern', merchantId: 'atb', mcc: '', target: 'category', categoryId: 'groceries' },
      { id: 'r1', createdAt: new Date(0) },
    );
    expect(back.merchant).toBe('атб');
    expect(back.merchantId).toBeUndefined();
  });

  it('a продавець not picked is no criterion', () => {
    expect(() =>
      ruleFromDraft(
        { merchant: 'атб', criterion: 'merchant', mcc: '', target: 'category', categoryId: 'groceries' },
        { id: 'r1', createdAt: new Date(0) },
      ),
    ).toThrow('Правило потребує продавця або MCC');
  });
});

describe('storeRule', () => {
  const silpo: Rule = {
    id: 'r-silpo',
    merchant: 'сільпо',
    target: { kind: 'category', categoryId: 'groceries' },
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
  };

  it('Scenario: The owner is told how many moved', async () => {
    bindTestJournal();

    const message = await storeRule(silpo, () => ({
      examined: 40,
      moved: 8,
      transferred: 3,
      absorbed: 1,
    }));

    expect(message).toBe('8 витрат перекатегоризовано. 3 витрати стали переказами.');
  });

  it('Scenario: A pass that moved nothing says nothing', async () => {
    bindTestJournal();

    const message = await storeRule(silpo, () => ({
      examined: 40,
      moved: 0,
      transferred: 0,
      absorbed: 0,
    }));

    expect(message).toBeUndefined();
  });

  it('Scenario: The pass is in the журнал as counts alone', async () => {
    const tail = bindTestJournal();

    await storeRule(silpo, () => ({ examined: 40, moved: 2, transferred: 1, absorbed: 1 }));

    const steps = tail().filter((entry) => entry.name === 'rules/sweep');
    // Both ends of the step, and both carry only what a розбір may carry: four numbers, never an
    // опис, a сума or a назва.
    expect(steps).toHaveLength(2);
    expect(steps[1]?.counts).toEqual({ examined: 40, moved: 2, transferred: 1, absorbed: 1 });
    for (const entry of steps) {
      expect(Object.keys(entry)).not.toContain('merchant');
      expect(JSON.stringify(entry)).not.toMatch(/сільпо/i);
      // …and no MCC, now that a розбір reads the one a витрата carries.
      expect(JSON.stringify(entry)).not.toMatch(/mcc|5411/i);
    }
    // The MCC-only правило of the same pass is no different: its code never reaches the entry.
    await storeRule({ ...silpo, id: 'r-mcc', merchant: undefined, mcc: 5411 }, () => ({
      examined: 40,
      moved: 1,
      transferred: 0,
      absorbed: 0,
    }));
    for (const entry of tail().filter((e) => e.name === 'rules/sweep')) {
      expect(JSON.stringify(entry)).not.toMatch(/mcc|5411/i);
    }
  });

  it('A refusal from save propagates and stores nothing about the pass', async () => {
    const tail = bindTestJournal();
    const refusal = new Error('«Без категорії» не може бути метою правила');

    await expect(
      storeRule(silpo, () => {
        throw refusal;
      }),
    ).rejects.toBe(refusal);

    const steps = tail().filter((entry) => entry.name === 'rules/sweep');
    expect(steps).toHaveLength(2);
    expect(steps[1]?.detail).toBe('не вдалось');
  });
});

/**
 * Who raises the offer, who answers it, and where "no offer" and "editing a переказ" leave the
 * screen — wiring `verify` never runs, so the assertions are structural, reading the source the
 * same way `entry-form.test.ts`'s "who may remember a рахунок" does.
 */
describe('who raises and answers the offer to remember a правило', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const hook = source('../hooks/use-rule-offer.ts');
  const sheet = source('../components/rule-offer-sheet.tsx');
  const home = source('../app/(tabs)/index.tsx');
  const transactionsScreen = source('../app/transactions.tsx');
  const editScreen = source('../app/transaction/[id].tsx');

  it('Scenario: One tap in the feed, then the offer', () => {
    // On both screens that carry the «Без категорії» mark, the offer is raised only after the
    // save that just set the категорія — never before it (design D5).
    for (const screen of [home, transactionsScreen]) {
      const categorise = screen.slice(screen.indexOf('const categorise = useCallback'));
      const saved = categorise.indexOf('transactionsRepo.save(recategorise(');
      const raised = categorise.indexOf('ruleOffer.raise(');
      expect(saved).toBeGreaterThanOrEqual(0);
      expect(raised).toBeGreaterThan(saved);
    }
  });

  it('Scenario: Setting a джерело on a дохід offers nothing', () => {
    // ruleOffer itself takes no transaction type — the guard is every caller's, and none raises
    // the offer for anything but a витрата or a повернення.
    for (const screen of [home, transactionsScreen]) {
      const categorise = screen.slice(screen.indexOf('const categorise = useCallback'));
      const guard = categorise.slice(0, categorise.indexOf('ruleOffer.raise('));
      expect(guard).toContain("t.type === 'expense' || t.type === 'refund'");
    }
  });

  it('Scenario: Editing a переказ offers nothing', () => {
    // The transfer branch returns before the offer code is even reached.
    const apply = editScreen.slice(editScreen.indexOf('const apply = useCallback'));
    const transferBranch = apply.slice(
      apply.indexOf("built.type === 'transfer'"),
      apply.indexOf('ruleOffer.raise('),
    );
    expect(transferBranch).toContain('return;');
    expect(transferBranch).not.toContain('ruleOffer');
  });

  it('Scenario: The editing screen offers it too', () => {
    const apply = editScreen.slice(editScreen.indexOf('const apply = useCallback'));
    const persistedAt = apply.indexOf('persist(built);');
    const raisedAt = apply.indexOf('ruleOffer.raise(');
    // The категорія is already stored (design D5) before the offer is even considered.
    expect(persistedAt).toBeGreaterThanOrEqual(0);
    expect(raisedAt).toBeGreaterThan(persistedAt);
    // Offered only when the категорія this screen shows actually changed.
    expect(apply).toContain('built.categoryId !== before');
  });

  it('No offer leaves the editing screen exactly where saving always left it', () => {
    // The regression this guards: `ruleOffer.raise` legitimately answers "no offer" — no опис,
    // «Без категорії», a правило that already covers it — and the screen must still navigate back
    // rather than sit on «Зберегти» with nothing on screen left to answer.
    const apply = editScreen.slice(editScreen.indexOf('const apply = useCallback'));
    const afterRaise = apply.slice(apply.indexOf('ruleOffer.raise('));
    expect(afterRaise).toMatch(/if \(offered\) \{\s*return;\s*\}\s*router\.back\(\);/);
  });

  it('Scenario: The proposed pattern can be changed before it is stored', () => {
    // The sheet's own edited state is what `onAccept` is called with — never the offer's original
    // pattern — and the hook builds the правило from exactly that argument.
    expect(sheet).toContain('ruleOfferView(offer, usePattern, pattern, { categoryNames, accountNames })');
    expect(sheet).toContain('onPress={() => view && onAccept(view.criterion)}');
    const accept = hook.slice(hook.indexOf('const accept = useCallback'));
    expect(accept).toContain('async (criterion: RuleCriterion) => {');
    expect(accept).toMatch(/ruleFromDraft\(ruleDraftFromOffer\(offer, criterion\)/);
    const offer = ruleOffer({
      description: 'СІЛЬПО 123 Київ',
      target: { kind: 'category', categoryId: 'groceries' },
      rules: [],
      merchants: NO_MERCHANTS,
    })!;
    const edited = ruleOfferView(offer, false, 'сільпо 123', offerNames).criterion;
    expect(ruleFromDraft(ruleDraftFromOffer(offer, edited), { id: 'r1', createdAt: new Date(0) }).merchant).toBe(
      'сільпо 123',
    );
  });

  it('Scenario: Accepting the offer stores the правило', () => {
    const accept = hook.slice(hook.indexOf('const accept = useCallback'));
    expect(accept).toContain('await storeRule(rule, rulesRepo.save)');
  });

  it('Scenario: A declined offer stores nothing', () => {
    // Declining only closes the offer: nothing is written, and the категорія stored before it stands.
    expect(hook).toContain('const decline = useCallback(() => setOffer(undefined), []);');
    const decline = hook.slice(hook.indexOf('const decline'), hook.indexOf('const accept'));
    expect(decline).not.toMatch(/rulesRepo|storeRule|save/);
  });

  it('Scenario: Retyping into a переказ offers the правило-переказ', () => {
    // The editing screen raises the offer once the переказ is stored, onto the рахунок just chosen;
    // what it proposes is `ruleOffer`'s (above, "Retyping a витрата into a переказ offers the
    // правило-переказ").
    const editor = source('../app/transaction/[id].tsx');
    const storeTransfer = editor.slice(editor.indexOf('const storeTransfer = useCallback'));
    expect(storeTransfer.indexOf('persist(...written);')).toBeLessThan(storeTransfer.indexOf('ruleOffer.raise({'));
    expect(storeTransfer).toContain("target: { kind: 'transfer', toAccountId: transferred.toAccountId }");
  });

  it('Scenario: An emptied pattern stores nothing', () => {
    // ruleFromDraft's own refusal is proven above; here only that the hook catches it and shows
    // the failure rather than leaving it unhandled.
    const accept = hook.slice(hook.indexOf('const accept = useCallback'));
    expect(accept).toContain('try {');
    expect(accept).toContain('catch (error)');
    expect(accept).toContain('failureAlert(');
  });

  it('Scenario: Declining keeps the категорія — no правило is stored', () => {
    const decline = hook.slice(hook.indexOf('const decline ='), hook.indexOf('const accept ='));
    expect(decline).toContain('setOffer(undefined)');
    expect(decline).not.toContain('storeRule');
    expect(decline).not.toContain('rulesRepo.save');
  });
});

describe('the offer to remember a правило says what that правило will do', () => {
  it('Scenario: A правило-переказ is offered as a переказ', () => {
    const offer = ruleOffer({
      description: 'Double tap',
      target: { kind: 'transfer', toAccountId: 'reserve' },
      fromAccount: { accountId: 'platinum', currency: 'UAH' },
      accounts: [{ id: 'reserve', currency: 'UAH' }],
      rules: [],
      merchants: NO_MERCHANTS,
    })!;
    const view = ruleOfferView(offer, false, offer.merchant, offerNames);
    expect(view.sentence).toBe('Наступного разу такий опис одразу стане переказом на «РЕЗЕРВ».');
    expect(view.sentence).not.toContain('категорі');
    expect(view.targetLabel).toBe('переказ на РЕЗЕРВ');
  });

  it('Scenario: A категорія правило is offered as a категорія', () => {
    const offer = ruleOffer({
      description: 'Megogo',
      target: { kind: 'category', categoryId: 'subscriptions' },
      rules: [],
      merchants: NO_MERCHANTS,
    })!;
    const view = ruleOfferView(offer, false, offer.merchant, offerNames);
    expect(view.sentence).toBe('Наступного разу такий опис одразу піде в «Підписки».');
    expect(view.targetLabel).toBe('Підписки');
  });

  it('the sheet holds no sentence of its own', () => {
    const sheet = readFileSync(new URL('../components/rule-offer-sheet.tsx', import.meta.url), 'utf8');
    expect(sheet).toContain('{view?.sentence}');
    expect(sheet).toContain('{view?.targetLabel}');
    expect(sheet).not.toContain('Наступного разу');
    expect(sheet).not.toContain('категорію');
  });
});
