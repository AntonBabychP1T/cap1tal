import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import type { Observation } from '../observations/observation';
import { observationsOf } from '../observations/observations';
import { ledgerBuilder, monthsFrom } from '../observations/test-fixtures';
import {
  BANNED_WORDS,
  noObservationsSentence,
  observationLine,
  observationLines,
  observationsWidgetModel,
  ordinalMonth,
  ratioPhrase,
  type ObservationNames,
} from './observations';

/** The app groups thousands with a no-break space; the expectations below are written with a plain one. */
const NBSP = new RegExp(String.fromCharCode(0xa0), 'g');
const plain = (text: string) => text.replace(NBSP, ' ');

const NAMES: ObservationNames = {
  categoryNames: new Map([
    ['food', 'Продукти'],
    ['cafe', 'Кафе'],
    ['travel', 'Подорожі'],
    ['subscriptions', 'Підписки'],
  ]),
  accountNames: new Map([['black', 'mono black']]),
  now: new Date(2026, 9, 10, 12),
};

const ref = (id: string, date: string, amount: number, description?: string) => ({
  id,
  date,
  accountId: 'black',
  amount: money(amount, 'UAH'),
  categoryId: 'cafe',
  ...(description ? { description } : {}),
});

/** One of every kind, with the design's own numbers. */
const EVERY_KIND: readonly Observation[] = [
  {
    kind: 'possible-duplicate',
    month: '2026-10',
    currency: 'UAH',
    key: 'd',
    amount: money(12500, 'UAH'),
    accountId: 'black',
    first: ref('bank', '2026-10-03', 12500, 'Aroma Kava'),
    second: ref('hand', '2026-10-04', 12500),
  },
  {
    kind: 'price-change',
    month: '2026-10',
    currency: 'UAH',
    key: 'p',
    transaction: ref('netflix', '2026-10-05', 34900, 'Netflix'),
    usual: money(29900, 'UAH'),
    changePercent: 17,
  },
  {
    kind: 'merchant-outlier',
    month: '2026-10',
    currency: 'UAH',
    key: 'm',
    transaction: ref('silpo', '2026-10-12', 294000, 'Сільпо'),
    usual: money(70000, 'UAH'),
    ratioTenths: 42,
  },
  {
    kind: 'category-early',
    month: '2026-10',
    currency: 'UAH',
    key: 'e',
    categoryId: 'cafe',
    daysElapsed: 10,
    soFar: money(420000, 'UAH'),
    previousWhole: money(390000, 'UAH'),
  },
  {
    kind: 'category-vs-typical',
    month: '2026-09',
    currency: 'UAH',
    key: 'v',
    categoryId: 'food',
    amount: money(1380000, 'UAH'),
    typical: money(1000000, 'UAH'),
    changePercent: 38,
  },
  {
    kind: 'category-run',
    month: '2026-09',
    currency: 'UAH',
    key: 'r',
    categoryId: 'cafe',
    run: 3,
    series: [210000, 260000, 305000, 390000].map((a) => money(a, 'UAH')),
  },
];

describe('how an спостереження states itself', () => {
  it('states each kind in one sentence with its own сум', () => {
    expect(observationLines(EVERY_KIND, NAMES).map((line) => plain(line.sentence))).toEqual([
      'Схоже на дубль: 125,00 UAH на mono black',
      'Netflix: 349,00 UAH замість звичних 299,00 UAH (+17 %)',
      'Сільпо, 12 жовтня: 2 940,00 UAH — у 4,2 раза більше, ніж зазвичай там (700,00 UAH)',
      'За 10 днів жовтня на Кафе пішло 4 200,00 UAH — уже більше, ніж за весь вересень (3 900,00 UAH)',
      'Продукти: 13 800,00 UAH — на 38 % більше за типові 10 000,00 UAH',
      'Кафе: третій місяць поспіль більше — 2 100,00 UAH → 2 600,00 UAH → 3 050,00 UAH → 3 900,00 UAH',
    ]);
  });

  it('An спостереження states itself in one sentence, with no advice, praise, blame or forecast', () => {
    const equal = {
      ...EVERY_KIND[3]!,
      soFar: money(390000, 'UAH'),
    } as Observation;
    const less = { ...EVERY_KIND[4]!, amount: money(0, 'UAH'), changePercent: -100 } as Observation;
    for (const line of observationLines([...EVERY_KIND, equal, less], NAMES)) {
      const text = line.sentence.toLowerCase();
      for (const word of BANNED_WORDS) expect(text).not.toContain(word);
      // One sentence: no full stop inside it.
      expect(line.sentence).not.toMatch(/\.\s/);
    }
    expect(observationLine(equal, NAMES).sentence).toContain('уже стільки ж, скільки за весь вересень');
    expect(plain(observationLine(less, NAMES).sentence)).toBe('Продукти: 0,00 UAH — на 100 % менше за типові 10 000,00 UAH');
  });

  it('writes the ratio with its plural: «4,2 раза», «3 рази», «5 разів»', () => {
    expect(ratioPhrase(42)).toBe('у 4,2 раза');
    expect(ratioPhrase(30)).toBe('у 3 рази');
    expect(ratioPhrase(50)).toBe('у 5 разів');
    expect(ratioPhrase(210)).toBe('у 21 раз');
    expect(ratioPhrase(115)).toBe('у 11,5 раза');
    expect(ordinalMonth(3)).toBe('третій');
    expect(ordinalMonth(5)).toBe('пʼятий');
    expect(ordinalMonth(13)).toBe('13-й');
  });

  it('names a транзакція without an опис by its категорія, as its transaction line does', () => {
    const plain = { ...EVERY_KIND[1]!, transaction: ref('x', '2026-10-05', 34900) } as Observation;
    expect(observationLine(plain, NAMES).sentence).toMatch(/^Кафе: 349,00 UAH/);
  });

  it('says a quiet month in one sentence', () => {
    expect(noObservationsSentence('2026-10', '2026-10-10')).toBe('Цього місяця поки нічого незвичного');
    expect(noObservationsSentence('2026-09', '2026-10-10')).toBe('У вересні нічого незвичного');
  });
});

describe('where an спостереження leads', () => {
  /** September above typical in Продукти, in UAH and in USD. */
  function september(): Transaction[] {
    const b = ledgerBuilder();
    const rows: Transaction[] = [];
    for (const month of monthsFrom('2026-03', '2026-08')) {
      rows.push(b.expense(`${month}-05`, 'food', 1000000), b.expense(`${month}-06`, 'other', 5000000));
      rows.push(
        b.expense(`${month}-05`, 'food', 10000, { currency: 'USD', accountId: 'usd' }),
        b.expense(`${month}-06`, 'other', 50000, { currency: 'USD', accountId: 'usd' }),
      );
    }
    rows.push(
      b.expense('2026-09-05', 'food', 1380000),
      b.expense('2026-09-06', 'other', 5000000),
      b.expense('2026-09-05', 'food', 13800, { currency: 'USD', accountId: 'usd' }),
      b.expense('2026-09-06', 'other', 50000, { currency: 'USD', accountId: 'usd' }),
    );
    return rows;
  }
  const lines = () =>
    observationLines(
      observationsOf({ month: '2026-09', today: '2026-10-02', transactions: september(), categories: [], answers: [] }),
      NAMES,
    );

  it('Scenario: A категорія leads to its month', () => {
    const [first] = lines();
    expect(plain(first!.sentence)).toMatch(/^Продукти: 13 800,00 UAH — на 38 % більше за типові/);
    expect(first!.route).toBe('/category/2026-09/food');
  });

  it('Scenario: A дубль opens either транзакція', () => {
    const line = observationLine(EVERY_KIND[0]!, NAMES);
    expect(line.route).toBeUndefined();
    expect(line.halves!.map((h) => [h.label, h.route])).toEqual([
      ['3 жовтня · Aroma Kava', '/transaction/bank'],
      ['4 жовтня · без опису', '/transaction/hand'],
    ]);
    expect(line.halves![1].accessibilityLabel).toContain('без опису');
    expect(line.answer).toEqual({ first: 'bank', second: 'hand' });
  });

  it('leads a price change and a purchase to the транзакція', () => {
    expect(observationLine(EVERY_KIND[1]!, NAMES).route).toBe('/transaction/netflix');
    expect(observationLine(EVERY_KIND[2]!, NAMES).route).toBe('/transaction/silpo');
  });

  it('Scenario: Two currencies are two sentences', () => {
    const stated = lines();
    expect(stated.map((line) => plain(line.sentence))).toEqual([
      'Продукти: 13 800,00 UAH — на 38 % більше за типові 10 000,00 UAH',
      'Продукти: 138,00 USD — на 38 % більше за типові 100,00 USD',
    ]);
  });
});

describe('the «Спостереження» widget on Головний', () => {
  const ACTIVE = new Set(['2026-08', '2026-09', '2026-10']);

  it('Scenario: Three of five', () => {
    const model = observationsWidgetModel({
      observations: EVERY_KIND.slice(0, 5),
      today: '2026-10-10',
      activeMonths: ACTIVE,
      names: NAMES,
    });
    expect(model.lines.map((l) => l.key)).toEqual(['d', 'p', 'm']);
    expect(model.more).toEqual({ label: 'Усі (5)', route: '/month?month=2026-10' });
    expect(model.empty).toBeNull();
  });

  it('Scenario: Nothing notable yet', () => {
    expect(
      observationsWidgetModel({ observations: [], today: '2026-10-10', activeMonths: ACTIVE, names: NAMES }),
    ).toEqual({ summary: null, lines: [], more: null, empty: 'Цього місяця поки нічого незвичного' });
  });

  it('Scenario: September’s підсумок in the first week of October', () => {
    const model = observationsWidgetModel({ observations: [], today: '2026-10-02', activeMonths: ACTIVE, names: NAMES });
    expect(model.summary).toMatchObject({ month: '2026-09', label: 'Підсумок вересня', route: '/month-summary/2026-09' });
    // A previous month with nothing in it offers none.
    expect(
      observationsWidgetModel({ observations: [], today: '2026-10-02', activeMonths: new Set(['2026-10']), names: NAMES })
        .summary,
    ).toBeNull();
  });

  it('Scenario: The підсумок row leaves after the seventh day', () => {
    const on = (today: string) =>
      observationsWidgetModel({ observations: [], today, activeMonths: ACTIVE, names: NAMES }).summary;
    expect(on('2026-10-07')).not.toBeNull();
    expect(on('2026-10-08')).toBeNull();
  });

  it('Scenario: «Не дубль» on Головний', () => {
    const b = ledgerBuilder();
    const rows: Transaction[] = [];
    for (const month of ['2026-07', '2026-08', '2026-09']) {
      for (const name of ['Netflix', 'Spotify', 'iCloud']) {
        rows.push(b.expense(`${month}-05`, 'subscriptions', 10000, { description: name }));
      }
    }
    rows.push(
      b.expense('2026-10-05', 'subscriptions', 13000, { description: 'Netflix' }),
      b.expense('2026-10-05', 'subscriptions', 14000, { description: 'Spotify' }),
      b.expense('2026-10-05', 'subscriptions', 15000, { description: 'iCloud' }),
      b.expense('2026-10-03', 'cafe', 12500, { id: 'bank', description: 'Aroma Kava' }),
      b.expense('2026-10-04', 'cafe', 12500, { id: 'hand' }),
    );
    const widget = (answers: { first: string; second: string }[]) =>
      observationsWidgetModel({
        observations: observationsOf({ month: '2026-10', today: '2026-10-06', transactions: rows, categories: [], answers }),
        today: '2026-10-06',
        activeMonths: ACTIVE,
        names: NAMES,
      });

    const before = widget([]);
    expect(before.lines.map((l) => l.kind)).toEqual(['possible-duplicate', 'price-change', 'price-change']);
    // Three price changes and Підписки already above September's whole, beside the дубль.
    expect(before.more?.label).toBe('Усі (5)');
    const answer = before.lines[0]!.answer!;

    // The answer is stored and the list re-derived: the pair is gone, the next takes its place.
    const after = widget([answer]);
    expect(after.lines.map((l) => l.kind)).toEqual(['price-change', 'price-change', 'price-change']);
    expect(after.more?.label).toBe('Усі (4)');
  });
});
