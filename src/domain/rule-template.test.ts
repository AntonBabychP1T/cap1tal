import { describe, expect, it } from 'vitest';

import { foldCase } from './fold';
import { TEMPLATE_GROUPS, TEMPLATE_VERSION, templateTargetOf } from './rule-template';
import {
  CORRECTION_CATEGORY_ID,
  FEES_CATEGORY_ID,
  UNCATEGORISED_CATEGORY_ID,
} from './transaction';

/**
 * The spec's table, restated here rather than read back from the data: базова категорія →
 * типова категорія, by the starter row's slug (categorisation-rules, "The app ships a шаблон of
 * базові категорії"). Display names in the spec, slugs here, because a rename must not move them.
 */
const SPEC_TABLE: readonly (readonly [string, string])[] = [
  ['Продукти', 'groceries'],
  ['Пекарня', 'bulka'],
  ['Кафе і ресторани', 'eating-out'],
  ['Кава', 'coffee'],
  ['Доставка їжі', 'food-delivery'],
  ['Транспорт', 'transport'],
  ['Подорожі', 'travel'],
  ['Дім', 'home'],
  ['Одяг і взуття', 'clothing'],
  ['Здоровʼя', 'health'],
  ['Електроніка', 'electronics'],
  ['Цифрове', 'digital'],
  ['Комунальні й звʼязок', 'bills'],
  ['Розваги', 'entertainment'],
  ['Спорт', 'entertainment'],
  ['Тварини', 'pets'],
  ['Книги', 'book'],
  ['Освіта', 'education'],
  ['Краса й догляд', 'services'],
  ['Подарунки й квіти', 'gifts'],
  ['Благодійність', 'charity'],
  ['Алкоголь і тютюн', 'habits'],
];

/**
 * The only places one базова категорія's pattern sits inside another's, each settled by the
 * longest-pattern rung of the ladder on purpose (design T1). Any other overlap would hand an опис
 * to whichever group happens to carry the longer text — a decision nobody made.
 */
const KNOWN_OVERLAPS: readonly string[] = [
  'bolt ⊂ bolt food',
  'clinic ⊂ vetclinic',
  'uber ⊂ uber eats',
  'uber ⊂ ubereats',
  'metro ⊂ metropoliten',
  'metro ⊂ kyiv metro',
];

const allMerchants = TEMPLATE_GROUPS.flatMap((g) => g.merchants.map((m) => ({ group: g.id, m })));
const allMcc = TEMPLATE_GROUPS.flatMap((g) => g.mcc);

describe('the шаблон категоризації', () => {
  it('carries every базова категорія of the spec with its типова категорія, in the spec order', () => {
    expect(TEMPLATE_GROUPS.map((g) => [g.name, g.defaultCategoryId])).toEqual(SPEC_TABLE);
  });

  it('The шаблон never names a reserved категорія', () => {
    const reserved = [CORRECTION_CATEGORY_ID, FEES_CATEGORY_ID, UNCATEGORISED_CATEGORY_ID];
    expect(TEMPLATE_GROUPS.filter((g) => reserved.includes(g.defaultCategoryId))).toEqual([]);
  });

  it('gives every базова категорія a unique id and something to match', () => {
    const ids = TEMPLATE_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of TEMPLATE_GROUPS) {
      expect(group.merchants.length + group.mcc.length, group.id).toBeGreaterThan(0);
    }
  });

  it('stores every merchant pattern folded, trimmed and at least three characters long', () => {
    const malformed = allMerchants.filter(
      ({ m }) => m !== foldCase(m) || m !== m.trim() || [...m].length < 3,
    );
    expect(malformed).toEqual([]);
  });

  it('carries every pattern and every MCC once across the whole шаблон', () => {
    const patterns = allMerchants.map(({ m }) => m);
    expect(patterns.filter((p, i) => patterns.indexOf(p) !== i)).toEqual([]);
    expect(allMcc.filter((c, i) => allMcc.indexOf(c) !== i)).toEqual([]);
  });

  it('carries only whole-number MCC codes', () => {
    expect(allMcc.filter((c) => !Number.isInteger(c) || c < 0 || c > 9999)).toEqual([]);
  });

  it('lets one group’s pattern sit inside another’s only where the ladder is meant to decide', () => {
    const overlaps: string[] = [];
    for (const a of allMerchants) {
      for (const b of allMerchants) {
        if (a.group !== b.group && a.m !== b.m && b.m.includes(a.m)) {
          overlaps.push(`${a.m} ⊂ ${b.m}`);
        }
      }
    }
    expect(overlaps.sort()).toEqual([...KNOWN_OVERLAPS].sort());
  });

  it('The longest шаблон pattern wins inside the шаблон — «bolt food» is longer than «bolt»', () => {
    const transport = TEMPLATE_GROUPS.find((g) => g.id === 'transport')!;
    const delivery = TEMPLATE_GROUPS.find((g) => g.id === 'food-delivery')!;
    expect(transport.merchants).toContain('bolt');
    expect(delivery.merchants).toContain('bolt food');
    expect('bolt food'.length).toBeGreaterThan('bolt'.length);
  });

  it('Both spellings of one merchant are covered — «uklon» and «уклон» are both Транспорт', () => {
    const transport = TEMPLATE_GROUPS.find((g) => g.id === 'transport')!;
    expect(transport.merchants).toEqual(expect.arrayContaining(['uklon', 'уклон']));
  });
});

/**
 * FNV-1a over the groups' content, in order. Not a security hash — a tripwire: any change to what
 * the шаблон covers changes it.
 */
function fingerprint(): string {
  const text = JSON.stringify(TEMPLATE_GROUPS);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Every version the шаблон has shipped under, with the fingerprint of what it covered then. A
 * change to `TEMPLATE_GROUPS` fails the test below until a *new* line is added here and
 * `TEMPLATE_VERSION` raised to it — that raise is what makes the first open after the update sweep
 * «Без категорії» once more (design T5). Editing an existing line instead would ship new knowledge
 * that never reaches the pile.
 */
const SHIPPED: Readonly<Record<number, string>> = {
  1: 'c02c13c6',
};

describe('the шаблон version', () => {
  it('moves together with what the шаблон covers', () => {
    expect({ version: TEMPLATE_VERSION, fingerprint: fingerprint() }).toEqual({
      version: Math.max(...Object.keys(SHIPPED).map(Number)),
      fingerprint: SHIPPED[TEMPLATE_VERSION],
    });
  });

  it('never ships two versions with the same content', () => {
    const prints = Object.values(SHIPPED);
    expect(new Set(prints).size).toBe(prints.length);
  });
});

describe('templateTargetOf', () => {
  const groceries = TEMPLATE_GROUPS.find((g) => g.id === 'groceries')!;

  it('Scenario: An untouched базова категорія uses its типова категорія', () => {
    expect(templateTargetOf(groceries, undefined)).toBe('groceries');
  });

  it('Scenario: A remapped базова категорія lands somewhere else', () => {
    expect(templateTargetOf(groceries, 'yizha')).toBe('yizha');
  });

  it('Scenario: A switched-off базова категорія matches nothing', () => {
    expect(templateTargetOf(groceries, null)).toBeUndefined();
  });
});
