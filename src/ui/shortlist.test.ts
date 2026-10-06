import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { NO_MERCHANTS } from '../domain/merchants';
import { resolveCategory, templateRules } from '../domain/rules';
import {
  allOffer,
  COLLAPSE_LABEL,
  narrow,
  NOTHING_FOUND,
  PICKER_SIZE,
  shortlist,
} from './shortlist';

/**
 * The picker rule, proven where `verify` can reach it. The screens themselves are JSX and never
 * run under the gate, so everything they decide has to be decidable here — how many chips are
 * drawn, which ones, in what order, whether the «Всі …» offer appears and what it says, and what a
 * typed search leaves standing.
 */

const named = (...ids: string[]) => ids.map((id) => ({ id, name: id }));

/** Twenty-seven категорії, «Без категорії» leading them, as `expenseCategoryChoices` orders them. */
const categories = [
  { id: 'uncategorised', name: 'Без категорії' },
  { id: 'bills', name: 'Bills' },
  { id: 'coffee', name: 'COFFEE ☕' },
  { id: 'eating-out', name: 'Eating out' },
  { id: 'groceries', name: 'Groceries' },
  { id: 'health', name: 'Health' },
  { id: 'transport', name: 'Transport' },
  { id: 'produkty', name: 'Продукти' },
];

describe('shortlist', () => {
  it('Scenario: The last used категорія is one tap away', () => {
    const shown = shortlist(categories, { recentIds: ['groceries', 'eating-out'] });

    expect(shown.slice(0, 2).map((c) => c.id)).toEqual(['groceries', 'eating-out']);
    expect(shown).toHaveLength(PICKER_SIZE);
  });

  it('Scenario: A fresh device is topped up from the head of the list, and Scenario: A fresh device still shows five choices', () => {
    const shown = shortlist(categories, { recentIds: [] });

    // «Без категорії» first, then the four after it in the order the list already has.
    expect(shown.map((c) => c.id)).toEqual([
      'uncategorised',
      'bills',
      'coffee',
      'eating-out',
      'groceries',
    ]);
    // And the same four on the next opening: the top-up is an order, not a sample.
    expect(shortlist(categories, { recentIds: [] })).toEqual(shown);
  });

  it('The top-up never repeats a row the recents already named', () => {
    const shown = shortlist(categories, { recentIds: ['groceries'] });

    expect(shown.map((c) => c.id)).toEqual([
      'groceries',
      'uncategorised',
      'bills',
      'coffee',
      'eating-out',
    ]);
  });

  it('An id in the recents that the picker does not offer contributes nothing', () => {
    // «Pets» is archived, so `expenseCategoryChoices` never handed it over; having been used
    // does not resurrect it.
    const shown = shortlist(categories, { recentIds: ['pets', 'groceries'] });

    expect(shown.map((c) => c.id)).not.toContain('pets');
    expect(shown[0]?.id).toBe('groceries');
  });

  it('Scenario: A short list of рахунки is drawn whole', () => {
    const shown = shortlist(named('hamanets', 'card', 'jar'), { recentIds: [] });

    expect(shown.map((a) => a.id)).toEqual(['hamanets', 'card', 'jar']);
  });

  it('Scenario: A pre-chosen рахунок outside the five is the sixth chip, and Scenario: The рахунок the form opens on is visible', () => {
    const accounts = named('a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7');

    const shown = shortlist(accounts, { recentIds: [], chosenIds: ['a7'] });

    // Five offered choices, and then the chosen one — it is not an offer, it is what is there.
    expect(shown.map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a7']);
  });

  it('Scenario: An archived рахунок a stored транзакція sits on stays visible', () => {
    // `accountChoicesFor` appended the archived рахунок the транзакція carries; it is chosen, so
    // it is drawn — and nothing else about the picker changes.
    const offered = [...named('a1', 'a2', 'a3', 'a4', 'a5'), { id: 'old', name: 'старий' }];

    expect(shortlist(offered, { recentIds: [], chosenIds: ['old'] }).map((a) => a.id)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
      'a5',
      'old',
    ]);
  });

  it('A chosen row already among the five is not drawn twice', () => {
    const shown = shortlist(categories, { recentIds: ['groceries'], chosenIds: ['groceries'] });

    expect(shown.filter((c) => c.id === 'groceries')).toHaveLength(1);
    expect(shown).toHaveLength(PICKER_SIZE);
  });

  it('A chosen id the picker does not offer adds no chip', () => {
    const shown = shortlist(categories, { recentIds: [], chosenIds: ['correction'] });

    expect(shown).toHaveLength(PICKER_SIZE);
    expect(shown.map((c) => c.id)).not.toContain('correction');
  });

  it('Scenario: Picking does not move the chips', () => {
    // The screen opens on «Без категорії» and the owner picks the third chip. The shortlist is
    // computed from what was loaded and from what the screen opened on, so it is the same list.
    const opened = shortlist(categories, {
      recentIds: ['groceries', 'eating-out'],
      chosenIds: ['uncategorised'],
    });
    const afterPicking = shortlist(categories, {
      recentIds: ['groceries', 'eating-out'],
      chosenIds: ['uncategorised', 'bills'],
    });

    // «Bills» was already among the five, so picking it drew no new chip and moved none.
    expect(afterPicking).toEqual(opened);
  });

  it('Scenario: A рахунок found through the offer does not have to be found twice', () => {
    const accounts = named('a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7');

    // The form opened on «a7», then the owner reached «a6» through the offer.
    const shown = shortlist(accounts, { recentIds: [], chosenIds: ['a7', 'a6'] });

    // Both stand there, in the order they were chosen: going back to «a7» is one tap.
    expect(shown.map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a7', 'a6']);
  });

  it('Scenario: Picking does not move the chips — however many rows are appended behind them', () => {
    const accounts = named('a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8');
    const five = ['a1', 'a2', 'a3', 'a4', 'a5'];

    expect(
      shortlist(accounts, { recentIds: [], chosenIds: ['a8', 'a7', 'a6'] }).map((a) => a.id),
    ).toEqual([...five, 'a8', 'a7', 'a6']);
  });

  it('A row chosen twice is appended once', () => {
    const accounts = named('a1', 'a2', 'a3', 'a4', 'a5', 'a6');

    expect(
      shortlist(accounts, { recentIds: [], chosenIds: ['a6', 'a1', 'a6'] }).map((a) => a.id),
    ).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  });

  it('An empty list stays empty', () => {
    expect(shortlist([], { recentIds: ['groceries'], chosenIds: ['groceries'] })).toEqual([]);
  });
});

describe('allOffer', () => {
  it('Scenario: A long list of рахунки is five chips and an offer', () => {
    const accounts = named(...Array.from({ length: 28 }, (_, i) => `a${i}`));

    expect(shortlist(accounts, { recentIds: [] })).toHaveLength(PICKER_SIZE);
    expect(allOffer(accounts, 'accounts')).toBe('Всі рахунки (28)');
  });

  it('Scenario: A short list of рахунки is drawn whole', () => {
    expect(allOffer(named('a1', 'a2', 'a3'), 'accounts')).toBeUndefined();
  });

  it('Exactly the shortlist size is still drawn whole', () => {
    expect(allOffer(named('a1', 'a2', 'a3', 'a4', 'a5'), 'accounts')).toBeUndefined();
    expect(allOffer(named('a1', 'a2', 'a3', 'a4', 'a5', 'a6'), 'accounts')).toBe(
      'Всі рахунки (6)',
    );
  });

  it('Each picker names its own list', () => {
    const many = named(...Array.from({ length: 27 }, (_, i) => `r${i}`));

    expect(allOffer(many, 'categories')).toBe('Всі категорії (27)');
    expect(allOffer(many.slice(0, 14), 'sources')).toBe('Всі джерела (14)');
  });

  it('The count is the whole list, not what is hidden', () => {
    // What the owner is deciding is whether to open a place of that size.
    expect(allOffer(named(...Array.from({ length: 9 }, (_, i) => `r${i}`)), 'accounts')).toBe(
      'Всі рахунки (9)',
    );
  });

  it('The words the collapsed and empty states use are the app’s own', () => {
    expect(COLLAPSE_LABEL).toBe('Згорнути');
    expect(NOTHING_FOUND).toBe('Нічого не знайдено');
  });
});

describe('narrow', () => {
  it('Scenario: The full list is searched by name', () => {
    expect(narrow(categories, 'прод').map((c) => c.id)).toEqual(['produkty']);
  });

  it('The search folds Ukrainian, not only ASCII', () => {
    // `toLowerCase()` would fold «COFFEE» and leave «Продукти» alone.
    expect(narrow(categories, 'ПРОДУКТИ').map((c) => c.id)).toEqual(['produkty']);
    expect(narrow(categories, 'coffee').map((c) => c.id)).toEqual(['coffee']);
  });

  it('It matches anywhere in the name, not only at its start', () => {
    expect(narrow(categories, 'ing').map((c) => c.id)).toEqual(['eating-out']);
  });

  it('Scenario: A search that matches nothing says so', () => {
    expect(narrow(categories, 'нічого такого')).toEqual([]);
  });

  it('An empty search narrows nothing', () => {
    expect(narrow(categories, '')).toEqual(categories);
    expect(narrow(categories, '   ')).toEqual(categories);
  });

  it('The narrowed list keeps the order it already has', () => {
    // Not re-sorted by how well each row matched: a picker is a place to find one known thing.
    expect(narrow(categories, 'o').map((c) => c.id)).toEqual([
      'coffee',
      'eating-out',
      'groceries',
      'transport',
    ]);
  });
});


/**
 * That the screens actually use the rule above. `verify` never runs JSX, so every decision this
 * change makes is proven in this file — but nothing here would notice a screen that went on
 * handing a full list to `Choices`. These assertions are structural, in the style
 * `src/ui/entry-form.test.ts` already uses: they read the screen and ask what it wires.
 *
 * They live under `src/ui/` and not beside the screens because a test file under `src/app/` ships
 * into the bundle through expo-router's `require.context` and kills the app on launch
 * (`.claude/rules/testing.md`).
 */
describe('the picker itself is wired to the rule', () => {
  const form = readFileSync(new URL('../components/form.tsx', import.meta.url), 'utf8');
  // To the end of the file, so `Picker` is assumed last in it. Adding a component after it makes
  // the single-`onSelect(` count below go red rather than quietly pass — it fails safe.
  const picker = form.slice(form.indexOf('export function Picker('), form.length);

  it('Scenario: A picker shows at most a few choices and names what is behind the rest', () => {
    // The collapsed branch draws `shortlist` and gates the offer on `allOffer` — it may not
    // count, slice or filter on its own.
    expect(picker).toContain(
      'shortlist(rows, { recentIds, chosenIds, selectedId: selected, suggestedId })',
    );
    expect(picker).toContain('allOffer(rows, noun)');
    expect(picker).toContain('{offer ? (');
  });

  it('Scenario: The full list is searched by name', () => {
    // The expanded branch draws the whole offered list through `narrow`, never `rows` raw.
    expect(picker).toContain('narrow(rows, query)');
    expect(picker).toContain('asChoices(narrowed)');
  });

  it('Scenario: A search that matches nothing says so', () => {
    expect(picker).toContain('narrowed.length === 0');
    expect(picker).toContain('{NOTHING_FOUND}');
    expect(picker).toContain('title={COLLAPSE_LABEL}');
  });

  it('Scenario: A choice made through the offer is stored like any other', () => {
    // One handler for both paths — the chip of the short list and the chip of the full list call
    // the same `choose`, so a choice reached through the offer cannot take a different route to
    // the screen. That is also what makes the currency question, the confirmation and the
    // remembered рахунок behave identically either way: they all hang off this one `onSelect`.
    expect([...picker.matchAll(/onSelect\(/g)]).toHaveLength(1);
    expect(picker).toContain('const choose = (id: string) => {');
    expect([...picker.matchAll(/onPress=\{\(\) => choose\(/g)]).toHaveLength(1);
    expect(picker).toContain('onSelect={choose}');
  });

  it('Scenario: Picking from the full list collapses it', () => {
    const choose = picker.slice(picker.indexOf('const choose ='), picker.indexOf('const collapse'));
    expect(choose).toContain('onExpandedChange(false)');
    expect(choose).toContain('setQuery(\'\')');
    // And the picked row is kept, so it stands among the few afterwards.
    expect(choose).toContain('setChosenIds(');
  });

  it('Scenario: Closing the full list changes nothing', () => {
    const collapse = picker.slice(picker.indexOf('const collapse ='), picker.indexOf('if (!expanded)'));
    expect(collapse).toContain('onExpandedChange(false)');
    expect(collapse).not.toContain('onSelect');
    expect(collapse).not.toContain('setChosenIds');
  });
});

describe('the screens are wired to the rule', () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const entryScreen = source('../app/transaction/new.tsx');
  const editScreen = source('../app/transaction/[id].tsx');
  const homeScreen = source('../app/(tabs)/index.tsx');
  const recordingPath = [
    ['«Нова транзакція»', entryScreen],
    ['editing', editScreen],
    ['Головний', homeScreen],
  ] as const;

  it('Scenario: Editing a stored транзакція offers the same short pickers', () => {
    for (const [where, screen] of recordingPath) {
      // Every picker of a long list goes through `Picker`, which is `shortlist` plus `allOffer`.
      // Recording and editing reach it the same way, so neither can drift into its own rule.
      expect(screen, where).toContain('<Picker');
      expect(screen, where).toContain('noun=');
    }
  });

  it('No screen hands a whole list of рахунки, категорії or джерела to `Choices`', () => {
    // What may still use `Choices` is the short, fixed row — «Тип» on the two transaction
    // screens — and nothing on Головний at all.
    expect(entryScreen).toContain('<Choices label="Тип"');
    expect(entryScreen.match(/<Choices/g)).toHaveLength(1);
    expect(editScreen.match(/<Choices/g)).toHaveLength(1);
    expect(homeScreen).not.toContain('<Choices');
  });

  it('The «Нещодавні» row is gone: one picker answers one question', () => {
    for (const [where, screen] of recordingPath) {
      expect(screen, where).not.toContain('"Нещодавні"');
      expect(screen, where).not.toContain('«Нещодавні»');
    }
  });

  it('Each picker is fed the recents of its own list', () => {
    expect(entryScreen).toContain('recentIds={recent.accounts}');
    expect(entryScreen).toContain('recentIds={recent.categories}');
    expect(entryScreen).toContain('recentIds={recent.sources}');
    expect(editScreen).toContain('recentIds={recent.accounts}');
    expect(editScreen).toContain('recentIds={recent.categories}');
    expect(editScreen).toContain('recentIds={recent.sources}');
    expect(homeScreen).toContain('recentIds={recent.categories}');
  });

  it('Scenario: Both legs of a переказ are shortened', () => {
    for (const [where, screen] of [
      ['«Нова транзакція»', entryScreen],
      ['editing', editScreen],
    ] as const) {
      expect(screen, where).toContain("expanded={open === 'from'}");
      expect(screen, where).toContain("expanded={open === 'to'}");
    }
  });

  it('One module owns the рахунок order, so two forms cannot answer the same question twice', () => {
    // The emulator found the рахунок picker in SQLite's BINARY sort while the категорія picker two
    // fields below it was in Ukrainian order. The order is also what the short list is topped up
    // from, so a recording form and an editing form sorting differently would show a different
    // five chips for the same question on a fresh phone.
    //
    // `accountChoicesFor` is where that order lives (`account-choices.test.ts` proves it). What is
    // pinned here is that no screen reaches around it to the raw storage order.
    for (const [where, screen] of [
      ['«Нова транзакція»', entryScreen],
      ['editing', editScreen],
    ] as const) {
      expect(screen, where).toContain('accountChoicesFor(');
      expect(screen, where).not.toContain('activeAccounts(');
    }
  });

  it('Scenario: A рахунок of another currency picked through the offer asks the сума anew', () => {
    // `Picker` proves there is one `onSelect` for both paths; this proves what that one handler
    // is on each screen. Together: a рахунок reached through «Всі рахунки» runs exactly the
    // currency-clearing the chip row runs, so no сума typed in UAH can land on a USD рахунок.
    for (const [where, screen] of [
      ['«Нова транзакція»', entryScreen],
      ['editing', editScreen],
    ] as const) {
      expect(screen, where).toContain('onSelect={chooseFrom}');
      expect(screen, where).toContain('onSelect={chooseTo}');
      // And those handlers are the ones that clear the сума when the currency changes.
      expect(screen, where).toMatch(/next\.currency !== from\.currency/);
      expect(screen, where).toMatch(/next\.currency !== to\.currency/);
    }
  });

  it('Scenario: A категорія behind the offer still categorises in the feed', () => {
    // Same argument on Головний: one handler for both paths, and that handler is the one that
    // stores the категорія on the транзакція without the editing screen opening.
    expect(homeScreen).toContain('onSelect={(picked: string) => categorise(t, picked)}');
  });

  it('Scenario: The feed’s picker is short too', () => {
    // Through the same `Picker`, so the cap and the offer are the ones proven above — and over a
    // list «Без категорії» is filtered out of, because that is what the line is being moved off.
    expect(homeScreen).toContain('<Picker');
    expect(homeScreen).toContain('c.id !== UNCATEGORISED_CATEGORY_ID');
    // Read one deeper than the picker draws, so dropping «Без категорії» cannot cost a recent.
    expect(homeScreen).toContain('recentlyUsed(stored.latest, PICKER_SIZE + 1)');
  });
});

describe('shortlist — a choice the form made, not the owner', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `Категорія ${i}` }));

  it('Scenario: The proposed категорія is one tap from being changed — a proposal outside the five is drawn', () => {
    // The form proposed c9 from the typed опис (a правило or the шаблон): it was never tapped and
    // the picker did not open on it, yet it is the chosen категорія and must be visible.
    const shown = shortlist(rows, { recentIds: [], chosenIds: [], selectedId: 'c9' });
    expect(shown.map((r) => r.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c9']);
  });

  it('draws a proposal already among the five only once, and nothing for none', () => {
    expect(shortlist(rows, { recentIds: [], selectedId: 'c2' }).map((r) => r.id)).toEqual([
      'c0', 'c1', 'c2', 'c3', 'c4',
    ]);
    expect(shortlist(rows, { recentIds: [], chosenIds: ['c7'], selectedId: 'c7' })).toHaveLength(6);
  });
});

describe('shortlist — what a правило or the шаблон would give, offered first', () => {
  /** Twelve категорії after «Без категорії» is filtered out, «Підписки» far down the list. */
  const rows = [
    ...Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, name: `Категорія ${i}` })),
    { id: 'pidpysky', name: 'Підписки' },
  ];
  /** The owner mapped the шаблон's «Цифрове» onto their «Підписки». */
  const tiers = {
    rules: [],
    templateRules: templateRules(new Map([['digital', 'pidpysky']])),
    merchants: NO_MERCHANTS,
  };

  it("Scenario: The шаблон's категорія is one tap away", () => {
    const suggestedId = resolveCategory(tiers, { description: 'Oplata poslug MEGOGO KYIV' });
    expect(suggestedId).toBe('pidpysky');

    // Recents and the head of the list would fill all five without it.
    const shown = shortlist(rows, { recentIds: ['c3', 'c1', 'c7', 'c0', 'c5'], suggestedId });
    expect(shown.map((r) => r.name)[0]).toBe('Підписки');
    expect(shown.map((r) => r.id)).toEqual(['pidpysky', 'c3', 'c1', 'c7', 'c0']);
    expect(shown).toHaveLength(PICKER_SIZE);
  });

  it('A suggestion that is already a recent is drawn once, first', () => {
    const shown = shortlist(rows, { recentIds: ['c3', 'pidpysky'], suggestedId: 'pidpysky' });
    expect(shown.map((r) => r.id)).toEqual(['pidpysky', 'c3', 'c0', 'c1', 'c2']);
  });

  it('A suggestion the picker does not offer adds nothing, and no suggestion changes nothing', () => {
    const plain = shortlist(rows, { recentIds: ['c3'] });
    expect(shortlist(rows, { recentIds: ['c3'], suggestedId: 'archived' })).toEqual(plain);
    expect(shortlist(rows, { recentIds: ['c3'], suggestedId: undefined })).toEqual(plain);
  });

  it('The suggestion is marked, and nothing is stored until it is picked', () => {
    const form = readFileSync(new URL('../components/form.tsx', import.meta.url), 'utf8');
    const picker = form.slice(form.indexOf('export function Picker('), form.length);
    // Shortlisted first by the rule above; marked only on the collapsed row, and never selected —
    // only `choose`, the owner's tap, reaches `onSelect`.
    expect(picker).toContain('suggestedId?: string;');
    expect(picker).toContain('shortlist(rows, { recentIds, chosenIds, selectedId: selected, suggestedId })');
    expect(picker).toContain('suggested: row.id === suggestedId && row.id !== selected');
    expect(form).toContain('suggested={choice.suggested}');

    // Both screens hand the quick категорія picker what `resolveCategory` gives the line's опис and
    // MCC, and keep `selected` empty; the джерело picker of «Обрати джерело» is left as it was.
    for (const path of ['../app/(tabs)/index.tsx', '../app/transactions.tsx']) {
      const screen = readFileSync(new URL(path, import.meta.url), 'utf8');
      const category = screen.slice(screen.indexOf('{line.uncategorised && categorising === line.id ? ('));
      const categoryBlock = category.slice(0, category.indexOf(') : null}'));
      expect(categoryBlock, path).toContain('suggestedId={suggestedCategory(t)}');
      expect(categoryBlock, path).toContain('selected={undefined}');
      const suggest = screen.slice(screen.indexOf('const suggestedCategory = (t: Transaction)'));
      const suggestBody = suggest.slice(0, suggest.indexOf(';'));
      expect(suggestBody, path).toContain('resolveCategory(tiers, {');
      expect(suggestBody, path).toContain("description: t.description ?? ''");
      expect(suggestBody, path).toContain("mcc: 'mcc' in t ? t.mcc : undefined");
      const source = screen.slice(screen.indexOf('{line.unsourced && sourcing === line.id ? ('));
      const sourceBlock = source.slice(0, source.indexOf(') : null}'));
      expect(sourceBlock, path).toContain('noun="sources"');
      expect(sourceBlock, path).not.toContain('suggestedId');
    }
  });
});

describe('the full list of a picker', () => {
  it('Scenario: The full list is read before it is searched', () => {
    const form = readFileSync(new URL('../components/form.tsx', import.meta.url), 'utf8');
    const picker = form.slice(form.indexOf('export function Picker('), form.length);
    const expanded = picker.slice(picker.indexOf('const narrowed = narrow(rows, query);'));
    const field = expanded.slice(expanded.indexOf('<Field'), expanded.indexOf('/>'));
    // The search field is drawn with the list, but the keyboard waits for the owner's tap on it.
    expect(field).toContain('placeholder="почніть вводити назву"');
    expect(field).not.toContain('autoFocus');
    expect(picker).not.toContain('autoFocus');
  });

  it('Scenario: The full list is read before it is searched — and stays in sight while typed into', () => {
    // The emulator: with the search field above the chips, the keyboard the field raises covered
    // every chip and only the field stayed in sight. The quick pickers of the стрічка draw the
    // chips above the field, so the field sits on the keyboard and what it narrows sits above it.
    const form = readFileSync(new URL('../components/form.tsx', import.meta.url), 'utf8');
    const picker = form.slice(form.indexOf('export function Picker('), form.length);
    expect(picker).toContain('searchBelow?: boolean;');
    const expanded = picker.slice(picker.indexOf('const narrowed = narrow(rows, query);'));
    expect(expanded).toContain('{searchBelow ? list : search}');
    expect(expanded).toContain('{searchBelow ? search : list}');
    for (const path of ['../app/(tabs)/index.tsx', '../app/transactions.tsx']) {
      const screen = readFileSync(new URL(path, import.meta.url), 'utf8');
      for (const gate of [
        '{line.uncategorised && categorising === line.id ? (',
        '{line.unsourced && sourcing === line.id ? (',
      ]) {
        const from = screen.slice(screen.indexOf(gate));
        const block = from.slice(0, from.indexOf(') : null}'));
        expect(block, `${path} ${gate}`).toContain('searchBelow');
      }
    }
  });
});
