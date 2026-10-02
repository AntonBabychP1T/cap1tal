import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import type { Category } from '../domain/category';
import { TEMPLATE_GROUPS } from '../domain/rule-template';
import { UNCATEGORISED_CATEGORY_ID } from '../domain/transaction';
import type { TemplateChoice } from '../db/rule-template-repo';
import { bindTestJournal, resetJournalForTests } from './journal';
import {
  TEMPLATE_PRECEDENCE_NOTE,
  chooseTemplateTarget,
  sweepNewTemplate,
  templateRowLine,
  templateRows,
  templateTargetChoices,
} from './rule-template-screen';

const category = (id: string, name: string, archived = false): Category => ({ id, name, archived });

/** A device holding every типова категорія under its starter name, plus the owner's «Їжа». */
const starter: readonly Category[] = [
  category('groceries', 'Groceries'),
  category('bulka', 'булка'),
  category('eating-out', 'Eating out'),
  category('coffee', 'COFFEE ☕'),
  category('food-delivery', 'Food Delivery'),
  category('transport', 'Transport'),
  category('travel', 'Travel'),
  category('home', 'Home'),
  category('clothing', 'Clothing'),
  category('health', 'Health'),
  category('electronics', 'Electronics'),
  category('digital', 'Digital'),
  category('bills', 'Bills'),
  category('entertainment', 'Entertainment'),
  category('pets', 'Pets'),
  category('book', 'book'),
  category('education', 'Education'),
  category('services', 'Services'),
  category('gifts', 'Gifts'),
  category('charity', 'Charity'),
  category('habits', 'habits'),
  category('yizha', 'Їжа'),
  category('old', 'Старе', true),
  category(UNCATEGORISED_CATEGORY_ID, 'Без категорії'),
];

afterEach(() => resetJournalForTests());

describe('the «Базові категорії» rows', () => {
  it('Scenario: The section lists every базова категорія with where it lands', () => {
    const rows = templateRows({ choices: new Map(), categories: starter });

    expect(rows.map((r) => r.name)).toEqual(TEMPLATE_GROUPS.map((g) => g.name));
    for (const row of rows) {
      expect(row.state).toBe('default');
      expect(row.categoryName).toBe(row.defaultCategoryName);
      expect(templateRowLine(row)).toMatch(/· типова$/);
    }
    expect(rows.find((r) => r.groupId === 'groceries')).toMatchObject({
      categoryId: 'groceries',
      categoryName: 'Groceries',
    });
  });

  it('Scenario: Pointing one at another категорія', () => {
    const choices = new Map<string, TemplateChoice>([
      ['groceries', { kind: 'category', categoryId: 'yizha' }],
    ]);
    const row = templateRows({ choices, categories: starter }).find((r) => r.groupId === 'groceries')!;

    expect(row).toMatchObject({ state: 'chosen', categoryName: 'Їжа', defaultCategoryName: 'Groceries' });
    expect(templateRowLine(row)).toBe('→ Їжа · ваш вибір');
  });

  it('Scenario: A switched-off базова категорія stays in the list', () => {
    const choices = new Map<string, TemplateChoice>([['habits', { kind: 'off' }]]);
    const rows = templateRows({ choices, categories: starter });
    const row = rows.find((r) => r.groupId === 'habits')!;

    expect(rows).toHaveLength(TEMPLATE_GROUPS.length);
    expect(row.state).toBe('off');
    expect(row.categoryId).toBeUndefined();
    expect(row.categoryName).toBeUndefined();
    expect(templateRowLine(row)).toMatch(/^Вимкнено/);
  });

  it('Scenario: What a базова категорія covers is visible and not editable', () => {
    const row = templateRows({ choices: new Map(), categories: starter }).find(
      (r) => r.groupId === 'groceries',
    )!;
    expect(row.merchants).toEqual(expect.arrayContaining(['атб', 'сільпо']));
    expect(row.mcc).toContain(5411);
    // The screen shows them as text and offers no field over them.
    const screen = readFileSync(new URL('../app/manage/rule-template.tsx', import.meta.url), 'utf8');
    expect(screen).toContain('row.merchants');
    expect(screen).toContain('row.mcc');
    expect(screen).not.toMatch(/<TextInput/);
    expect(screen).toContain('TEMPLATE_PRECEDENCE_NOTE');
    expect(TEMPLATE_PRECEDENCE_NOTE).toMatch(/правило завжди сильніше/);
  });

  it('names no категорія for a target this device does not hold', () => {
    const row = templateRows({
      choices: new Map(),
      categories: starter.filter((c) => c.id !== 'travel'),
    }).find((r) => r.groupId === 'travel')!;
    expect(row.categoryName).toBeUndefined();
    expect(templateRowLine(row)).toMatch(/немає на цьому пристрої/);
  });

  it('offers every unarchived, unreserved категорія as a target, by name', () => {
    const offered = templateTargetChoices(starter).map((c) => c.id);
    expect(offered).toContain('yizha');
    expect(offered).not.toContain('old');
    expect(offered).not.toContain(UNCATEGORISED_CATEGORY_ID);
  });
});

describe('a choice and its розбір', () => {
  it('Scenario: Changing a mapping sweeps «Без категорії» — and the menu says so', async () => {
    const tail = bindTestJournal();
    const said = await chooseTemplateTarget('groceries', { kind: 'category', categoryId: 'groceries' }, () => ({
      examined: 3,
      moved: 1,
      transferred: 0,
      absorbed: 0,
    }));

    expect(said).toBe('1 витрата перекатегоризовано.');
    const steps = tail().filter((entry) => entry.name === 'rules/sweep');
    expect(steps).toHaveLength(2);
    expect(steps[1]?.counts).toEqual({ examined: 3, moved: 1, transferred: 0, absorbed: 0 });
  });

  it('a choice that moved nothing says nothing', async () => {
    bindTestJournal();
    expect(
      await chooseTemplateTarget('habits', { kind: 'off' }, () => ({
        examined: 3,
        moved: 0,
        transferred: 0,
        absorbed: 0,
      })),
    ).toBeUndefined();
  });
});

describe('the open-time розбір', () => {
  it('Scenario: The first open after an update clears what it can — one журнал operation with its counts', async () => {
    const tail = bindTestJournal();

    await sweepNewTemplate({
      due: () => true,
      sweep: () => ({ examined: 40, moved: 11, transferred: 0, absorbed: 0 }),
    });

    const steps = tail().filter((entry) => entry.name === 'rules/template-sweep');
    expect(steps).toHaveLength(2);
    expect(steps[1]?.counts).toEqual({ examined: 40, moved: 11, transferred: 0, absorbed: 0 });
  });

  it('Scenario: Opening again sweeps nothing — and records no operation', async () => {
    const tail = bindTestJournal();
    let swept = false;

    await sweepNewTemplate({
      due: () => false,
      sweep: () => {
        swept = true;
        return undefined;
      },
    });

    expect(swept).toBe(false);
    expect(tail().filter((entry) => entry.name === 'rules/template-sweep')).toEqual([]);
  });

  it('runs as a launch chore right after the seed', () => {
    const layout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
    const seed = layout.indexOf("name: 'seed'");
    const sweep = layout.indexOf("name: 'rule-template-sweep'");
    const next = layout.indexOf("name: 'progress-evaluate'");
    expect(seed).toBeGreaterThan(-1);
    expect(sweep).toBeGreaterThan(seed);
    expect(sweep).toBeLessThan(next);
    expect(layout).toContain('sweepNewTemplate({');
  });
});
