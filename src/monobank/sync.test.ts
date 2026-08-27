import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { Rule } from '../domain/rules';
import {
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Transaction,
} from '../domain/transaction';
import { MAX_STATEMENT_WINDOW_MS, STATEMENT_PAGE_SIZE, type StatementItem } from './api';
import { continueWindow, isFullAnswer, mapStatement, planWindows } from './sync';

const DAY_MS = 24 * 60 * 60 * 1000;
/** An arbitrary "now" — the planner has no clock of its own, so every test hands it one. */
const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);

/** Ids that say which call made them, so a chained sync is readable in a failure message. */
function ids(): () => string {
  let n = 0;
  return () => `t${++n}`;
}

const item = (over: Partial<StatementItem> & Pick<StatementItem, 'id'>): StatementItem => ({
  timeMs: Date.UTC(2026, 7, 26, 9, 0, 0),
  date: '2026-08-26',
  description: 'СІЛЬПО Київ',
  mcc: 5411,
  amount: money(-12550, 'UAH'),
  hold: false,
  ...over,
});

const groceries: Rule = {
  id: 'r1',
  merchant: 'сільпо',
  categoryId: 'groceries',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const context = (over: Partial<Parameters<typeof mapStatement>[1]> = {}) => ({
  accountId: 'card',
  currency: 'UAH',
  rules: [groceries],
  seenIds: new Set<string>(),
  newId: ids(),
  ...over,
});

describe('planWindows', () => {
  it('Scenario: A short span is one window', () => {
    const from = NOW - 3 * DAY_MS;
    expect(planWindows(from, NOW)).toEqual([{ fromMs: from, toMs: NOW }]);
  });

  it('Scenario: A long span becomes consecutive windows', () => {
    const from = NOW - 90 * DAY_MS;
    const windows = planWindows(from, NOW);

    expect(windows.length).toBeGreaterThan(1);
    // Each within the API's limit, and together exactly the 90 days asked for.
    for (const w of windows) {
      expect(w.toMs - w.fromMs).toBeLessThanOrEqual(MAX_STATEMENT_WINDOW_MS);
    }
    expect(windows[0]?.fromMs).toBe(from);
    expect(windows[windows.length - 1]?.toMs).toBe(NOW);
    // Oldest first, no overlap, no gap: each starts the millisecond after the one before ends.
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i]!.fromMs).toBe(windows[i - 1]!.toMs + 1);
    }
  });

  it('Scenario: A long span becomes consecutive windows — over any span at all', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 4000 * DAY_MS }),
        fc.integer({ min: 0, max: 1_800_000_000_000 }),
        (span, nowMs) => {
          const fromMs = nowMs - span;
          const windows = planWindows(fromMs, nowMs);

          expect(windows.length).toBeGreaterThan(0);
          expect(windows[0]!.fromMs).toBe(fromMs);
          expect(windows[windows.length - 1]!.toMs).toBe(nowMs);
          for (const w of windows) {
            expect(w.toMs - w.fromMs).toBeLessThanOrEqual(MAX_STATEMENT_WINDOW_MS);
            expect(w.toMs).toBeGreaterThanOrEqual(w.fromMs);
          }
          for (let i = 1; i < windows.length; i += 1) {
            expect(windows[i]!.fromMs).toBe(windows[i - 1]!.toMs + 1);
          }
        },
      ),
    );
  });

  it('A span of nothing plans nothing', () => {
    // Syncing twice in the same millisecond asks for no window rather than an empty one; both
    // window ends are inclusive, so the next sync's first window still covers that moment.
    expect(planWindows(NOW, NOW)).toEqual([]);
    expect(planWindows(NOW + 1, NOW)).toEqual([]);
    expect(planWindows(NOW - 1, NOW)).toEqual([{ fromMs: NOW - 1, toMs: NOW }]);
  });
});

describe('continueWindow', () => {
  it('Scenario: A full answer continues the window', () => {
    const window = { fromMs: NOW - 31 * DAY_MS, toMs: NOW };
    const oldest = NOW - 5 * DAY_MS;
    const full = Array.from({ length: STATEMENT_PAGE_SIZE }, (_, i) =>
      item({ id: `a${i}`, timeMs: NOW - i * 1000 }),
    );

    expect(isFullAnswer(full)).toBe(true);
    // Continued at the oldest item's own moment: same start, a nearer end.
    expect(continueWindow(window, oldest)).toEqual({ fromMs: window.fromMs, toMs: oldest });

    // A later short answer ends the continuation — nothing more is planned.
    const short = full.slice(0, 12);
    expect(isFullAnswer(short)).toBe(false);
  });

  it('A continuation that has reached the window start is over', () => {
    const window = { fromMs: NOW - 31 * DAY_MS, toMs: NOW };
    expect(continueWindow(window, window.fromMs)).toBeUndefined();
    expect(continueWindow(window, window.fromMs - 1)).toBeUndefined();
  });

  it('A continuation always makes progress, so a caller looping until short cannot loop forever', () => {
    // The URL carries seconds, so "narrower" has to mean a different second — otherwise the next
    // request is byte-identical to the last and the loop never ends.
    // A window ending mid-second, which is what a continuation at an item's moment produces.
    const window = { fromMs: NOW - 31 * DAY_MS, toMs: NOW + 700 };
    expect(continueWindow(window, window.toMs)).toBeUndefined();
    expect(continueWindow(window, window.toMs + 5000)).toBeUndefined();
    // Narrower in milliseconds, the same second in the URL: the identical request, refused.
    expect(continueWindow(window, NOW + 200)).toBeUndefined();
    // A different second is real progress.
    expect(continueWindow(window, NOW - 300)).toEqual({ fromMs: window.fromMs, toMs: NOW - 300 });

    // Followed to its end — each answer full, its oldest item five days older — the continuation
    // terminates rather than repeating itself, and every step is strictly narrower.
    let current: typeof window | undefined = window;
    let steps = 0;
    while (current && steps < 100) {
      const next: typeof window | undefined = continueWindow(current, current.toMs - 5 * DAY_MS);
      if (next) {
        expect(Math.floor(next.toMs / 1000)).toBeLessThan(Math.floor(current.toMs / 1000));
        expect(next.fromMs).toBe(window.fromMs);
      }
      current = next;
      steps += 1;
    }
    expect(current).toBeUndefined();
    expect(steps).toBeLessThan(100);
  });
});

describe('mapStatement', () => {
  it('Scenario: A recognised merchant lands in its category', () => {
    const { transactions } = mapStatement([item({ id: 'a1' })], context());
    expect(transactions).toEqual([
      {
        type: 'expense',
        id: 't1',
        date: '2026-08-26',
        accountId: 'card',
        amount: money(12550, 'UAH'),
        categoryId: 'groceries',
        description: 'СІЛЬПО Київ',
      },
    ]);
  });

  it('Scenario: An unrecognised merchant is «Без категорії»', () => {
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'НОВИЙ ЗАКЛАД', mcc: 5812, amount: money(-8000, 'UAH') })],
      context(),
    );
    expect(transactions[0]).toMatchObject({
      type: 'expense',
      amount: money(8000, 'UAH'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
      // The bank's text still comes along: it is what the owner recognises the витрата by.
      description: 'НОВИЙ ЗАКЛАД',
    });
  });

  it('Scenario: Arriving money is a дохід «Без джерела»', () => {
    const { transactions } = mapStatement(
      [
        item({
          id: 'a1',
          description: 'Зарахування зарплати',
          mcc: 4829,
          amount: money(5_000_000, 'UAH'),
        }),
      ],
      context(),
    );
    expect(transactions[0]).toEqual({
      type: 'income',
      id: 't1',
      date: '2026-08-26',
      accountId: 'card',
      amount: money(5_000_000, 'UAH'),
      sourceId: UNSOURCED_SOURCE_ID,
      description: 'Зарахування зарплати',
    });
  });

  it('An arriving повернення is a дохід «Без джерела» too — a starting state, not a verdict', () => {
    // Cashback and refunds arrive as money in and nothing here reclassifies them: a повернення is
    // never income, so the owner retypes it through витрата, and the «Без джерела» mark is what
    // keeps it visible until they do.
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'Кешбек', mcc: 4829, amount: money(25000, 'UAH') })],
      context({ rules: [{ ...groceries, merchant: 'кешбек', categoryId: 'groceries' }] }),
    );
    expect(transactions[0]).toMatchObject({ type: 'income', sourceId: UNSOURCED_SOURCE_ID });
    // Not even a matching правило turns arriving money into a categorised anything.
    expect('categoryId' in transactions[0]!).toBe(false);
  });

  it('Scenario: A foreign purchase is a витрата of what the bank charged', () => {
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'AMZN Mktp', mcc: 5942, amount: money(-420000, 'UAH') })],
      context(),
    );
    expect(transactions[0]).toMatchObject({ type: 'expense', amount: money(420000, 'UAH') });
    // Nothing carries an original-currency сума: a monobank statement never names the currency of
    // the operation's own amount, so there is none to record (design D12).
    expect(Object.keys(transactions[0]!)).not.toContain('originalAmount');
  });

  it('Scenario: A hold maps like anything else', () => {
    const { transactions } = mapStatement(
      [item({ id: 'a1', hold: true, amount: money(-30000, 'UAH') })],
      context(),
    );
    expect(transactions[0]).toMatchObject({ type: 'expense', amount: money(30000, 'UAH') });
    // Nothing about the stored транзакція says hold — there is no field for it, by design.
    expect(JSON.stringify(transactions[0])).not.toContain('hold');
  });

  it('Scenario: A zero amount maps to nothing', () => {
    const { transactions } = mapStatement(
      [item({ id: 'a1', amount: money(0, 'UAH') })],
      context(),
    );
    expect(transactions).toEqual([]);
  });

  it('An item the bank sent no text with makes a транзакція of the same shape as its neighbour', () => {
    const { transactions } = mapStatement(
      [
        item({ id: 'a1', description: '' }),
        item({ id: 'a2', description: '', amount: money(5000, 'UAH') }),
      ],
      context(),
    );
    expect('description' in transactions[0]!).toBe(false);
    expect('description' in transactions[1]!).toBe(false);
  });

  it('A statement in another currency than the рахунок is a wiring mistake, not a conversion', () => {
    expect(() =>
      mapStatement([item({ id: 'a1', amount: money(-1000, 'USD') })], context()),
    ).toThrow();
  });
});

describe('an item imports at most once, forever', () => {
  it('Scenario: The same item does not import twice', () => {
    const arrival = item({ id: 'a1' });
    const first = mapStatement([arrival], context());
    expect(first.transactions).toHaveLength(1);
    expect(first.seenNow.has('a1')).toBe(true);

    // The second answer, chained through the returned set exactly as the caller stores it.
    const second = mapStatement([arrival], context({ seenIds: first.seenNow }));
    expect(second.transactions).toEqual([]);
    expect(second.seenNow.has('a1')).toBe(true);

    // And an id repeated inside one answer imports once, not twice.
    const twiceAtOnce = mapStatement([arrival, arrival], context());
    expect(twiceAtOnce.transactions).toHaveLength(1);
  });

  it('Scenario: A deleted транзакція stays deleted', () => {
    // The seen set is the only memory: no транзакція exists anywhere, and the item still does not
    // come back. Deleting what an import created never resurrects it on the next sync.
    const stored: readonly Transaction[] = [];
    expect(stored).toHaveLength(0);
    const { transactions } = mapStatement(
      [item({ id: 'a1' })],
      context({ seenIds: new Set(['a1']) }),
    );
    expect(transactions).toEqual([]);
  });

  it("Scenario: A zero item's id is still remembered", () => {
    const { transactions, seenNow } = mapStatement(
      [item({ id: 'a1', amount: money(0, 'UAH') })],
      context(),
    );
    expect(transactions).toEqual([]);
    // Remembered all the same, so it is not examined again on every sync forever.
    expect(seenNow.has('a1')).toBe(true);
  });

  it('The returned set is the whole set, so chaining calls needs no union at the call site', () => {
    const first = mapStatement([item({ id: 'a1' })], context());
    const second = mapStatement([item({ id: 'a2' })], context({ seenIds: first.seenNow }));
    expect([...second.seenNow].sort()).toEqual(['a1', 'a2']);
    // What came in is not mutated: the caller's set is theirs.
    expect([...first.seenNow]).toEqual(['a1']);
  });
});
