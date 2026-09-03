import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { IsoDate, Month } from '../domain/transaction';
import { evaluate, type EvaluateInput } from './achievements';
import {
  activeMonthsOfFixture,
  firstTransferOntoKindOfFixture,
  nthTransactionDateOfFixture,
  ownerShapedSummary,
  TOTAL_TRANSACTIONS,
} from './fixtures';
import type { MonthRow, ProgressSummary } from './summary';

const TODAY: IsoDate = '2026-09-30';
const NOW_MS = Date.parse('2026-09-30T09:00:00.000Z');

function monthRow(month: Month, over: Partial<MonthRow> = {}): MonthRow {
  return {
    month,
    currency: 'UAH',
    spent: 0,
    income: 0,
    invested: 0,
    saved: 0,
    transactions: 1,
    uncategorised: 0,
    unsourced: 0,
    ...over,
  };
}

function summary(over: Partial<ProgressSummary> = {}): ProgressSummary {
  return {
    months: [],
    balances: [],
    limitedCategories: [],
    history: { count: 0 },
    drafts: [],
    ...over,
  };
}

function input(over: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    summary: summary(),
    today: TODAY,
    nowMs: NOW_MS,
    earned: new Set<string>(),
    goals: [],
    norms: new Map(),
    nthTransactionDate: () => undefined,
    firstTransferOntoKind: () => undefined,
    ...over,
  };
}

describe('evaluating', () => {
  it('Scenario: Evaluating twice earns nothing twice', () => {
    const held = summary({ history: { count: 120, earliest: '2026-01-05', latest: '2026-03-05' } });
    const at = (earned: ReadonlySet<string>) =>
      evaluate(
        input({ summary: held, earned, nthTransactionDate: (n) => (n <= 120 ? '2026-02-01' : undefined) }),
      );

    const first = at(new Set());
    expect(first.map((one) => one.key)).toContain('ledger.transactions:100');

    const second = at(new Set(first.map((one) => one.key)));
    expect(second).toEqual([]);
  });

  it('Scenario: Deleting history does not unearn', () => {
    const earned = new Set(['ledger.first-transaction', 'ledger.transactions:100']);
    const shrunk = summary({ history: { count: 95, earliest: '2026-01-05', latest: '2026-03-05' } });

    const newly = evaluate(input({ summary: shrunk, earned }));

    // The engine only ever adds: it says nothing at all about a key already stored.
    expect(newly.map((one) => one.key)).not.toContain('ledger.transactions:100');
    expect(newly).toEqual([]);

    // And when the count passes 100 again, the key is still not earned a second time.
    const regrown = summary({ history: { count: 130, earliest: '2026-01-05', latest: '2026-03-05' } });
    expect(
      evaluate(input({ summary: regrown, earned, nthTransactionDate: () => '2026-02-01' })),
    ).toEqual([]);
  });

  it('Scenario: A retroactive count is dated in the history', () => {
    const old = summary({ history: { count: 120, earliest: '2024-10-05', latest: '2026-09-01' } });

    const newly = evaluate(
      input({
        summary: old,
        today: '2026-09-02',
        nthTransactionDate: (n) => (n === 100 ? '2024-12-03' : undefined),
      }),
    );

    expect(newly.find((one) => one.key === 'ledger.transactions:100')?.achievedOn).toBe(
      '2024-12-03',
    );
    // The moment it was written is today; the дата it happened is not.
    expect(newly.find((one) => one.key === 'ledger.transactions:100')?.recordedAtMs).toBe(NOW_MS);
  });

  it('Scenario: A retroactive місяць count is dated at the month`s end', () => {
    const months: Month[] = [
      '2024-10',
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
      '2025-03',
      '2025-04',
    ];
    const held = summary({
      months: months.map((month) => monthRow(month)),
      history: { count: 7, earliest: '2024-10-05', latest: '2025-04-20' },
    });

    const newly = evaluate(input({ summary: held, today: '2026-09-02' }));

    // The sixth активний місяць is 2025-03, and the fact happened when it ended.
    expect(newly.find((one) => one.key === 'ledger.active-months:6')?.achievedOn).toBe('2025-03-31');
  });

  it('Scenario: A balance condition is dated the day it was recorded', () => {
    const newly = evaluate(
      input({
        today: '2026-09-02',
        goals: [
          {
            goal: {
              id: 'auto',
              name: 'Авто',
              target: money(1_000_000, 'UAH'),
              accountIds: ['jar'],
            },
            // 60 % already, on a рахунок that has held money for a year.
            progress: money(600_000, 'UAH'),
          },
        ],
      }),
    );

    const half = newly.find((one) => one.key === 'goal.progress:auto:50');
    expect(half?.achievedOn).toBe('2026-09-02');
    // No earlier date is claimed for it, however long the money has been there.
    expect(newly.filter((one) => one.template.startsWith('goal.')).every((one) => one.achievedOn === '2026-09-02')).toBe(true);
  });

  it('Scenario: Editing an old транзакція earns nothing new by itself', () => {
    const before = summary({
      months: [monthRow('2026-05', { transactions: 30, uncategorised: 1 })],
      history: { count: 30, earliest: '2026-05-01', latest: '2026-05-31' },
    });
    const earned = new Set(evaluate(input({ summary: before })).map((one) => one.key));

    // The owner changes one транзакція's категорія; nothing about the counts moves.
    const afterEdit = summary({
      months: [monthRow('2026-05', { transactions: 30, uncategorised: 1 })],
      history: { count: 30, earliest: '2026-05-01', latest: '2026-05-31' },
    });
    expect(evaluate(input({ summary: afterEdit, earned }))).toEqual([]);

    // Answering the last «Без категорії» makes the місяць чистий, and only that is newly earned.
    const answered = summary({
      months: [monthRow('2026-05', { transactions: 30 })],
      history: { count: 30, earliest: '2026-05-01', latest: '2026-05-31' },
    });
    expect(evaluate(input({ summary: answered, earned })).map((one) => one.key)).toEqual([
      'quality.clean-month',
    ]);
  });
});

describe('a device that already holds two years of history', () => {
  const fixture = () =>
    input({
      summary: ownerShapedSummary(),
      nthTransactionDate: nthTransactionDateOfFixture,
      firstTransferOntoKind: firstTransferOntoKindOfFixture,
    });

  it('Scenario: An existing history earns everything it proves at once', () => {
    const newly = evaluate(fixture());
    const keys = newly.map((one) => one.key);

    expect(ownerShapedSummary().history.count).toBe(2459);
    expect(activeMonthsOfFixture()).toHaveLength(23);
    expect(keys).toEqual(
      expect.arrayContaining([
        'ledger.first-transaction',
        'ledger.transactions:100',
        'ledger.transactions:500',
        'ledger.transactions:1000',
        'ledger.transactions:2000',
        'ledger.active-months:3',
        'ledger.active-months:6',
        'ledger.active-months:12',
        'ledger.active-months:18',
        'ledger.history-span',
      ]),
    );
    // In one evaluation, not ten — and each dated where the history dates it.
    expect(newly.find((one) => one.key === 'ledger.transactions:2000')?.achievedOn).toBe(
      nthTransactionDateOfFixture(2000),
    );
    expect(newly.find((one) => one.key === 'ledger.active-months:18')?.achievedOn).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it('earns the резерв milestones only once a норма is confirmed', () => {
    const withoutNorm = evaluate(fixture()).map((one) => one.key);
    expect(withoutNorm.some((key) => key.startsWith('reserve.norm'))).toBe(false);

    const withNorm = evaluate({
      ...fixture(),
      norms: new Map([['UAH', { amount: money(3_000_000, 'UAH'), confirmedAtMs: 0 }]]),
    }).map((one) => one.key);

    expect(withNorm).toEqual(
      expect.arrayContaining([
        'reserve.norm:25:UAH',
        'reserve.norm:50:UAH',
        'reserve.norm:100:UAH',
      ]),
    );
  });

  it('dates the перше відкладення and the перший внесок at their own переказ', () => {
    const newly = evaluate(fixture());

    expect(newly.find((one) => one.key === 'reserve.first')?.achievedOn).toBe('2024-11-08');
    expect(newly.find((one) => one.key === 'invest.first')?.achievedOn).toBe('2025-02-12');
  });

  it('re-evaluating the same history a second time earns nothing', () => {
    const first = evaluate(fixture());

    expect(evaluate({ ...fixture(), earned: new Set(first.map((one) => one.key)) })).toEqual([]);
  });

  it('carries nothing personal: no назва, no опис, no категорія, no real сума', () => {
    const source = readFileSync(new URL('./fixtures.ts', import.meta.url), 'utf8');
    const summaryOfIt = ownerShapedSummary();

    // A зведення holds no text at all beyond місяці, currency codes and вид рахунку — there is
    // nowhere for a назва or an опис to be, and this asserts it of the generated value itself.
    const text = JSON.stringify(summaryOfIt);
    expect(text).not.toMatch(/[А-Яа-яЄєІіЇїҐґ]/);
    expect(summaryOfIt.limitedCategories).toEqual([]);
    // And the module itself names no категорія and no merchant.
    expect(source.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/categoryId:|merchant|опис/);
    expect(TOTAL_TRANSACTIONS).toBe(2459);
  });

  it('is test-only: nothing under `src/app/` imports it, so Metro never bundles it', () => {
    // expo-router bundles every file under `src/app/` through `require.context`, so an import of
    // a fixture from there would ship two and a half thousand generated rows into the app.
    const screens = (dir: URL): URL[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? screens(new URL(`./${entry.name}/`, dir))
          : [new URL(`./${entry.name}`, dir)],
      );

    const importers = screens(new URL('../app/', import.meta.url)).filter((file) =>
      /from '[^']*progress\/fixtures'/.test(readFileSync(file, 'utf8')),
    );

    expect(importers).toEqual([]);
  });
});
