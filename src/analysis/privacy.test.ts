import { readFileSync } from 'node:fs';

import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { BACKUP_TABLES } from '../backup/format';
import { account, type Account } from '../domain/account';
import type { Category, Source } from '../domain/category';
import type { Goal } from '../domain/goals';
import type { CategoryLimit } from '../domain/limits';
import { money } from '../domain/money';
import { expenseByDefault, transfer, type Transaction } from '../domain/transaction';
import { buildAnalysisPackage, type AnalysisInput, type AnalysisPackage } from './package';

/**
 * What must never reach a пакет для аналізу, proven over the serialised text rather than over the
 * shape of a type.
 *
 * The fixture below marks every identifier and every рахунок назва with a sentinel that has no
 * business appearing in a file the owner hands to another app. If any mapper ever passes an id
 * through — a категорія named by its row id, a переказ that kept its рахунок, a ціль that carried
 * its account — the sentinel appears in the JSON and this file fails, whatever the types say.
 *
 * The secrets the phone also holds — the monobank token, a баланс банку, the text of a captured
 * notification, a cursor — are excluded a stronger way: the builder's input type has no field to
 * put them in, and the `@ts-expect-error` below is the assertion that it still has none.
 */

const SENTINEL = 'ZZ-SENTINEL-';

/** `true` only while the builder's input has no such field — the type-level half of the proof. */
type Excludes<K extends string> = K extends keyof AnalysisInput ? false : true;

const accounts: readonly Account[] = [
  account({
    id: `${SENTINEL}acc-card`,
    name: `${SENTINEL}mono black`,
    kind: 'spending',
    currency: 'UAH',
  }),
  account({
    id: `${SENTINEL}acc-jar`,
    name: `${SENTINEL}Банка на авто`,
    kind: 'savings',
    currency: 'UAH',
  }),
  account({
    id: `${SENTINEL}acc-bonds`,
    name: `${SENTINEL}Військові облігації`,
    kind: 'investment',
    currency: 'UAH',
  }),
];

// Назви are what the пакет is *for* — a категорія an assistant can name back to the owner — so they
// carry no sentinel. Their ids do.
const categories: readonly Category[] = [
  { id: `${SENTINEL}cat-cafe`, name: 'Кафе', archived: false },
  { id: `${SENTINEL}cat-groceries`, name: 'Продукти', archived: false },
];

const sources: readonly Source[] = [{ id: `${SENTINEL}src-salary`, name: 'Зарплата', archived: false }];

const limits: readonly CategoryLimit[] = [
  { categoryId: `${SENTINEL}cat-cafe`, amount: money(80000, 'UAH') },
];

const goals: readonly Goal[] = [
  {
    id: `${SENTINEL}goal-car`,
    name: 'Авто',
    target: money(20_000_000, 'UAH'),
    deadline: '2026-12-31',
    accountId: `${SENTINEL}acc-jar`,
  },
];

/** The опис a confirmed чернетка left on its транзакція — the bank's own words about the owner. */
const DRAFT_TEXT = 'Оплата ATB 350.00 UAH';

const transactions: readonly Transaction[] = [
  expenseByDefault({
    id: `${SENTINEL}t1`,
    date: '2026-07-10',
    accountId: `${SENTINEL}acc-card`,
    amount: money(100000, 'UAH'),
    categoryId: `${SENTINEL}cat-cafe`,
    description: 'СІЛЬПО',
  }),
  expenseByDefault({
    id: `${SENTINEL}t2`,
    date: '2026-08-10',
    accountId: `${SENTINEL}acc-card`,
    amount: money(35000, 'UAH'),
    categoryId: `${SENTINEL}cat-groceries`,
    description: DRAFT_TEXT,
  }),
  {
    type: 'income',
    id: `${SENTINEL}t3`,
    date: '2026-08-01',
    accountId: `${SENTINEL}acc-card`,
    amount: money(500000, 'UAH'),
    sourceId: `${SENTINEL}src-salary`,
    description: 'ТОВ «Ромашка» зарплата',
  },
  transfer({
    id: `${SENTINEL}t4`,
    date: '2026-08-12',
    fromAccountId: `${SENTINEL}acc-card`,
    toAccountId: `${SENTINEL}acc-bonds`,
    left: money(200000, 'UAH'),
    arrived: money(200000, 'UAH'),
  }),
];

function input(over: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    kind: 'monthly-picture',
    period: { from: '2026-07', to: '2026-08' },
    included: { descriptions: false, transactions: false },
    builtOn: '2026-09-01',
    accounts,
    transactions,
    categories,
    sources,
    limits,
    goals,
    rates: [],
    ...over,
  };
}

const serialise = (over: Partial<AnalysisInput> = {}): string =>
  JSON.stringify(buildAnalysisPackage(input(over)) as AnalysisPackage);

describe('what a пакет для аналізу never carries', () => {
  it('Scenario: Nothing secret and nothing overheard reaches the пакет', () => {
    // Everything on: the most a пакет can ever hold.
    const open = serialise({ included: { descriptions: true, transactions: true } });

    // No identifier and no рахунок назва — every one of them carries the sentinel.
    expect(open).not.toContain(SENTINEL);

    // And none of the four things the scenario names by hand: the token, the баланс банку, the
    // text of the чернетки waiting, and the відстежуваний застосунок. They cannot be passed —
    // the input type has no field for them (the test below) — so here they are forced past it,
    // and the пакет still carries none of them, because nothing reads them.
    const device = {
      ...input({ included: { descriptions: true, transactions: true } }),
      monobankToken: 'uJhRt5NsW1qE',
      bankBalance: money(1234567, 'UAH'),
      pendingDrafts: [
        { text: 'Оплата 350.00 UAH, баланс 4100.00 UAH', fingerprint: 'f1' },
        { text: 'Списання 120.00 UAH', fingerprint: 'f2' },
      ],
      watchedApps: ['ua.privatbank.ap24'],
    } as AnalysisInput;

    const withDevice = JSON.stringify(buildAnalysisPackage(device) as AnalysisPackage);
    for (const secret of [
      'uJhRt5NsW1qE',
      '1234567',
      'баланс 4100.00',
      'Списання 120.00',
      'f1',
      'ua.privatbank.ap24',
    ]) {
      expect(withDevice, `the пакет carries «${secret}»`).not.toContain(secret);
    }
  });

  it('has no field for a secret to arrive in at all', () => {
    // The strongest exclusion in this file, and it is at the type level: the screen cannot hand
    // over what the builder's input does not name. A cursor is the example the directive carries —
    // the day the field becomes real, the `@ts-expect-error` goes unused and `npm run typecheck`
    // fails, which is exactly the alarm that should sound.
    const withCursor: AnalysisInput = {
      ...input(),
      // @ts-expect-error the builder's input names no sync cursor
      cursor: '1756540800',
    };

    // The same claim for every other secret the phone holds: `Excludes<K>` is `true` only while
    // `K` is not a field of the input, so each line below stops compiling if one ever is.
    const excluded = {
      monobankToken: true satisfies Excludes<'monobankToken'>,
      bankBalance: true satisfies Excludes<'bankBalance'>,
      notificationText: true satisfies Excludes<'notificationText'>,
      drafts: true satisfies Excludes<'drafts'>,
      watchedApps: true satisfies Excludes<'watchedApps'>,
      backup: true satisfies Excludes<'backup'>,
    };
    expect(Object.values(excluded).every(Boolean)).toBe(true);

    // And, so the type-level claim is not the only one: a caller that forces such values past the
    // type still puts none of them in the пакет, because nothing reads them.
    const forced = {
      ...withCursor,
      monobankToken: 'uJhRt5NsW1qE',
      bankBalance: money(1234567, 'UAH'),
      notificationText: 'Оплата 350.00 UAH, баланс 4100.00 UAH',
      watchedApps: ['ua.privatbank.ap24'],
    } as AnalysisInput;

    const packaged = JSON.stringify(buildAnalysisPackage(forced) as AnalysisPackage);

    for (const secret of [
      'uJhRt5NsW1qE',
      '1234567',
      'баланс 4100.00',
      '1756540800',
      'ua.privatbank.ap24',
    ]) {
      expect(packaged).not.toContain(secret);
    }
  });

  it("Scenario: A confirmed чернетка's опис is an опис", () => {
    const closed = serialise({ included: { descriptions: false, transactions: false } });
    const open = serialise({ included: { descriptions: true, transactions: true } });

    // With «Продавці» off, no part of the bank's text leaves.
    expect(closed).not.toContain(DRAFT_TEXT);
    expect(closed).not.toContain('ATB');
    // With it on, it is an опис like any other — on its транзакція and in the merchants list.
    expect(open).toContain(DRAFT_TEXT);
    expect(open).toContain(DRAFT_TEXT.toLowerCase());
  });

  it('Scenario: Account names stay on the phone', () => {
    const open = serialise({ included: { descriptions: true, transactions: true } });

    for (const name of accounts.map((a) => a.name)) {
      expect(open).not.toContain(name);
    }
    // What is carried instead is the count by вид.
    expect((buildAnalysisPackage(input()) as AnalysisPackage).counts.accountsByKind).toEqual({
      spending: 1,
      savings: 1,
      investment: 1,
      cash: 0,
      debt: 0,
    });
  });

  it('Scenario: Описи are absent unless chosen', () => {
    const closed = serialise();

    for (const description of ['СІЛЬПО', 'сільпо', DRAFT_TEXT, 'ТОВ «Ромашка» зарплата']) {
      expect(closed).not.toContain(description);
    }
    // And no merchants list at all.
    expect(JSON.parse(closed).byCurrency[0].merchants).toBeUndefined();
  });

  it('carries no identifier out of any random history', () => {
    const day = fc.integer({ min: 1, max: 28 }).map((d) => String(d).padStart(2, '0'));
    const date = fc.tuple(fc.constantFrom('2026-07', '2026-08'), day).map(([m, d]) => `${m}-${d}`);
    const amount = fc.integer({ min: 1, max: 900_000 });
    const categoryId = fc.constantFrom(...categories.map((c) => c.id));
    const accountId = fc.constantFrom(...accounts.map((a) => a.id));

    const anyTransaction = fc.oneof(
      fc
        .tuple(date, amount, categoryId, fc.integer({ min: 0, max: 9999 }))
        .map(([d, a, c, n]) =>
          expenseByDefault({
            id: `${SENTINEL}p${n}`,
            date: d,
            accountId: accounts[0]!.id,
            amount: money(a, 'UAH'),
            categoryId: c,
            description: `${SENTINEL}shop-${n}`,
          }),
        ),
      fc.tuple(date, amount, fc.integer({ min: 0, max: 9999 })).map(
        ([d, a, n]): Transaction => ({
          type: 'income',
          id: `${SENTINEL}i${n}`,
          date: d,
          accountId: accounts[0]!.id,
          amount: money(a, 'UAH'),
          sourceId: sources[0]!.id,
        }),
      ),
      fc.tuple(date, amount, accountId, fc.integer({ min: 0, max: 9999 })).map(([d, a, to, n]) =>
        to === accounts[0]!.id
          ? ({
              type: 'correction',
              id: `${SENTINEL}c${n}`,
              date: d,
              accountId: accounts[0]!.id,
              amount: money(a, 'UAH'),
            } as Transaction)
          : transfer({
              id: `${SENTINEL}m${n}`,
              date: d,
              fromAccountId: accounts[0]!.id,
              toAccountId: to,
              left: money(a, 'UAH'),
              arrived: money(a, 'UAH'),
            }),
      ),
    );

    fc.assert(
      fc.property(fc.array(anyTransaction, { minLength: 1, maxLength: 20 }), (history) => {
        const packaged = buildAnalysisPackage(
          input({ transactions: history, included: { descriptions: false, transactions: true } }),
        );
        if ('kind' in packaged) {
          return;
        }
        // Ids, рахунок назви and — with «Продавці» off — the описи that carry the sentinel too.
        expect(JSON.stringify(packaged)).not.toContain(SENTINEL);
      }),
    );
  });

  it('Scenario: The бекап knows nothing of it', () => {
    const format = readFileSync(new URL('../backup/format.ts', import.meta.url), 'utf8');
    const schema = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');

    // Nothing about an AI-аналіз is stored, so the бекап has nothing of it to carry — and that is
    // a fact about the tables, not a promise about behaviour.
    for (const word of ['analysis', 'analysisPackage', 'analysis_package', 'ai_analysis', 'аналіз']) {
      expect(BACKUP_TABLES.join(' ')).not.toContain(word);
      expect(format).not.toContain(word);
      expect(schema).not.toContain(word);
    }
  });
});
