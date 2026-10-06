import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { NO_MERCHANTS, merchant, merchantIndex } from '../domain/merchants';

import { money } from '../domain/money';
import { templateRules, type Rule } from '../domain/rules';
import { TEMPLATE_GROUPS } from '../domain/rule-template';
import {
  UNCATEGORISED_CATEGORY_ID,
  UNSOURCED_SOURCE_ID,
  type Transaction,
} from '../domain/transaction';
import { MAX_STATEMENT_WINDOW_MS, STATEMENT_PAGE_SIZE, type StatementItem } from './api';
import {
  CLIENT_INFO_FRESH_MS,
  priorityOf,
  shownLinks,
  TURN_OVERDUE_MS,
  continueWindow,
  isFullAnswer,
  mapStatement,
  planWindows,
  syncOrder,
  usableAccounts,
} from './sync';

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
  target: { kind: 'category', categoryId: 'groceries' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const context = (over: Partial<Parameters<typeof mapStatement>[1]> = {}) => ({
  accountId: 'card',
  currency: 'UAH',
  rules: [groceries],
  merchants: NO_MERCHANTS,
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
        mcc: 5411,
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

  it('Scenario: A правило-переказ makes the item a переказ', () => {
    const roundUp: Rule = {
      id: 'r-round-up',
      merchant: 'округлення балансу',
      target: { kind: 'transfer', toAccountId: 'reserve' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'Округлення балансу «Резерв»', amount: money(-479, 'UAH') })],
      context({
        accountId: 'platinum',
        rules: [roundUp],
        accounts: [
          { id: 'platinum', currency: 'UAH' },
          { id: 'reserve', currency: 'UAH' },
        ],
      }),
    );
    expect(transactions).toEqual([
      {
        type: 'transfer',
        id: 't1',
        date: '2026-08-26',
        fromAccountId: 'platinum',
        toAccountId: 'reserve',
        left: money(479, 'UAH'),
        arrived: money(479, 'UAH'),
        description: 'Округлення балансу «Резерв»',
        mcc: 5411,
        awaitingCounterpartIncome: true,
      },
    ]);
  });

  it("a USD рахунок's item under a UAH destination stays a витрата", () => {
    const roundUp: Rule = {
      id: 'r-round-up',
      merchant: 'округлення балансу',
      target: { kind: 'transfer', toAccountId: 'reserve' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const { transactions } = mapStatement(
      [
        item({
          id: 'a1',
          description: 'Округлення балансу «Резерв»',
          amount: money(-479, 'USD'),
        }),
      ],
      context({
        accountId: 'usd-card',
        currency: 'USD',
        rules: [roundUp],
        accounts: [
          { id: 'usd-card', currency: 'USD' },
          { id: 'reserve', currency: 'UAH' },
        ],
      }),
    );
    expect(transactions[0]).toMatchObject({
      type: 'expense',
      amount: money(479, 'USD'),
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
  });

  const sourceRule = (id: string, over: Partial<Rule> & { sourceId: string }): Rule => ({
    id,
    ...over,
    target: { kind: 'source', sourceId: over.sourceId },
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });

  it('Scenario: A правило-джерело gives arriving money its джерело', () => {
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'Зарахування зарплати', mcc: 4829, amount: money(5_000_000, 'UAH') })],
      context({ rules: [groceries, sourceRule('r-salary', { merchant: 'зарахування зарплати', sourceId: 'salary' })] }),
    );
    expect(transactions[0]).toMatchObject({
      type: 'income',
      amount: money(5_000_000, 'UAH'),
      sourceId: 'salary',
      description: 'Зарахування зарплати',
    });
  });

  it('Scenario: A правило-джерело never matches money leaving', () => {
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'Відсотки сервіс', mcc: 7399, amount: money(-2000, 'UAH') })],
      context({ rules: [sourceRule('r-interest', { merchant: 'відсотки', sourceId: 'interest' })] }),
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ type: 'expense', amount: money(2000, 'UAH'), categoryId: UNCATEGORISED_CATEGORY_ID });
    expect(transactions[0]).not.toHaveProperty('sourceId');
  });

  it('Scenario: An MCC-only правило-джерело sources a statement item that carries the MCC', () => {
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'Від: Олена П.', mcc: 4829, amount: money(20_000, 'UAH') })],
      context({ rules: [sourceRule('r-people', { mcc: 4829, sourceId: 'from-people' })] }),
    );
    expect(transactions[0]).toMatchObject({ type: 'income', amount: money(20_000, 'UAH'), sourceId: 'from-people' });
  });

  it('Scenario: A правило-джерело naming a продавець follows recognition', () => {
    const monobank = merchant({
      id: 'mono',
      name: 'Monobank',
      spellings: [{ id: 'm-s0', spelling: 'monobank', addedAt: new Date(0) }],
      createdAt: new Date(0),
    });
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'Monobank відсотки на залишок', amount: money(1234, 'UAH') })],
      context({ rules: [sourceRule('r-mono', { merchantId: 'mono', sourceId: 'interest' })], merchants: merchantIndex([monobank]) }),
    );
    expect(transactions[0]).toMatchObject({ type: 'income', amount: money(1234, 'UAH'), sourceId: 'interest' });
  });

  it('Scenario: Cashback is not silently finalised as income', () => {
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'Кешбек за вересень', mcc: 0, amount: money(1250, 'UAH') })],
      context(),
    );
    expect(transactions).toEqual([expect.objectContaining({ type: 'income', sourceId: UNSOURCED_SOURCE_ID })]);
  });

  it('Scenario: A правило-джерело never turns cashback into a повернення', () => {
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'Кешбек за вересень', mcc: 0, amount: money(1250, 'UAH') })],
      context({ rules: [sourceRule('r-salary', { merchant: 'зарплата', sourceId: 'salary' })] }),
    );
    expect(transactions).toEqual([
      expect.objectContaining({ type: 'income', amount: money(1250, 'UAH'), sourceId: UNSOURCED_SOURCE_ID }),
    ]);
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
      mcc: 4829,
    });
  });

  it('An arriving повернення is a дохід «Без джерела» too — a starting state, not a verdict', () => {
    // Cashback and refunds arrive as money in and nothing here reclassifies them: a повернення is
    // never income, so the owner retypes it through витрата, and the «Без джерела» mark is what
    // keeps it visible until they do.
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'Кешбек', mcc: 4829, amount: money(25000, 'UAH') })],
      context({ rules: [{ ...groceries, merchant: 'кешбек' }], merchants: NO_MERCHANTS }),
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
    // Nothing carries an original-currency сума: the statement does name one, but the sync does
    // not read it yet, so the hryvnia the bank charged is the only сума recorded.
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

describe('syncOrder — whose turn a run takes first', () => {
  const link = (monobankAccountId: string, lastAttemptedAtMs: number | null) => ({
    monobankAccountId,
    lastAttemptedAtMs,
  });
  const order = (
    links: readonly { monobankAccountId: string; owedSinceMs?: number | null }[],
    nowMs?: number,
  ) => syncOrder(links as never, nowMs).map((l) => l.monobankAccountId);

  it('Scenario: An account that has never had a turn goes first among those not позачергові', () => {
    // An hour is not long, but «never» is longer than any moment there is. The ids are chosen so
    // that alphabetical order says the opposite: this fails under the sort this replaced.
    expect(order([link('a-turned', NOW - 60 * 60 * 1000), link('z-never', null)])).toEqual([
      'z-never',
      'a-turned',
    ]);
  });

  it('Scenario: The longest-waiting account goes first', () => {
    // Ids again in the reverse of the expected order, so nothing but the moments can produce it.
    expect(
      order([
        link('a-minute', NOW - 60 * 1000),
        link('z-days', NOW - 3 * DAY_MS),
        link('m-hour', NOW - 60 * 60 * 1000),
      ]),
    ).toEqual(['z-days', 'm-hour', 'a-minute']);
  });

  it('Scenario: Accounts that have waited equally are ordered reproducibly', () => {
    const links = [link('mono-c', null), link('mono-a', null), link('mono-b', null)];

    // Two links that have waited exactly as long are ordered by their monobank account id, and a
    // second run over the same state repeats it — a run's order is not a coin flip.
    expect(order(links)).toEqual(['mono-a', 'mono-b', 'mono-c']);
    expect(order(links)).toEqual(order(links));

    // Same again for two links whose turns fall in the same millisecond.
    const together = [link('mono-z', NOW), link('mono-y', NOW)];
    expect(order(together)).toEqual(['mono-y', 'mono-z']);
  });

  it('Scenario: A позачерговий рахунок goes before one that has waited longer', () => {
    // Позачерговий ten minutes ago, its last turn an hour ago — before it became so.
    const owed = { ...link('a-owed', NOW - 60 * 60 * 1000), owedSinceMs: NOW - 10 * 60 * 1000 };
    expect(order([link('z-days', NOW - 3 * DAY_MS), owed])).toEqual(['a-owed', 'z-days']);
  });

  it('Scenario: A позачерговий рахунок that keeps failing does not hold the queue', () => {
    // It became позачерговий, had its turn a minute ago, and the statement failed: it is still
    // позачерговий, but the turn it has had since puts it back among the rest, last of them.
    const failing = { ...link('a-failing', NOW - 60 * 1000), owedSinceMs: NOW - 10 * 60 * 1000 };
    expect(order([failing, link('m-hour', NOW - 60 * 60 * 1000), link('z-never', null)])).toEqual([
      'z-never',
      'm-hour',
      'a-failing',
    ]);
  });

  it('Позачергові рахунки are ordered among themselves by the turn rule', () => {
    const owed = (id: string, turned: number | null) => ({ ...link(id, turned), owedSinceMs: NOW - 1000 });
    expect(
      order([owed('a-minute', NOW - 60 * 1000), link('x-plain', null), owed('z-never', null), owed('m-hour', NOW - 60 * 60 * 1000)]),
    ).toEqual(['z-never', 'm-hour', 'a-minute', 'x-plain']);
  });

  it('A link that is not позачерговий is ordered exactly as before', () => {
    // `owedSinceMs` absent and `null` are the same: nothing is owed.
    expect(
      order([{ ...link('b', NOW - 1000), owedSinceMs: null }, link('a', NOW - 2000)]),
    ).toEqual(['a', 'b']);
  });

  it('Scenario: A рахунок the busy ones keep passing over is reached within three hours', () => {
    // The black card moved before this chance (позачерговий, no turn since); the white card never
    // moves and had its turn three hours ago; a jar had its turn an hour ago.
    const black = { ...link('a-black', NOW - 16 * 60 * 1000), owedSinceMs: NOW - 60 * 1000 };
    const white = link('m-white', NOW - TURN_OVERDUE_MS);
    const jar = link('b-jar', NOW - 60 * 60 * 1000);
    expect(order([jar, white, black], NOW)).toEqual(['a-black', 'm-white', 'b-jar']);
    // Without the clock nothing is overdue, so the jar and the white card keep the turn order.
    expect(order([jar, white, black])).toEqual(['a-black', 'm-white', 'b-jar']);
    expect(order([jar, link('m-white', NOW - 2 * 60 * 60 * 1000), black], NOW)).toEqual([
      'a-black',
      'm-white',
      'b-jar',
    ]);
  });

  it('A boundary set in the future owes nothing yet', () => {
    const ahead = { ...link('ahead', null), owedSinceMs: NOW + 24 * 60 * 60 * 1000 };
    // Never turned, so overdue — but not позачерговий until the clock reaches its boundary.
    expect(priorityOf(ahead, NOW)).toBe(1);
    expect(priorityOf({ ...ahead, lastAttemptedAtMs: NOW - 1000 }, NOW)).toBe(2);
  });

  it('An overdue рахунок goes before one merely waiting, and after the позачергові', () => {
    const overdue = link('z-overdue', NOW - TURN_OVERDUE_MS - 1);
    const waiting = link('a-waiting', NOW - TURN_OVERDUE_MS + 60 * 1000);
    const owed = { ...link('m-owed', NOW - 60 * 1000), owedSinceMs: NOW - 30 * 1000 };
    expect(order([waiting, overdue, owed], NOW)).toEqual(['m-owed', 'z-overdue', 'a-waiting']);
    expect(priorityOf(owed, NOW)).toBe(0);
    expect(priorityOf(overdue, NOW)).toBe(1);
    expect(priorityOf(waiting, NOW)).toBe(2);
    // Never turned is overdue once there is a clock to measure it by.
    expect(priorityOf(link('never', null), NOW)).toBe(1);
    expect(priorityOf(link('never', null))).toBe(2);
  });

  it('A turn of zero is a turn, not the absence of one', () => {
    // 1970 is a moment; `null` is not. Ordering them the other way round would put a link that
    // was asked about at the epoch ahead of one that has never been asked about at all.
    expect(order([link('epoch', 0), link('never', null)])).toEqual(['never', 'epoch']);
  });

  it('The input is left alone', () => {
    const links = [link('mono-b', 2), link('mono-a', 1)];
    syncOrder(links);
    expect(links.map((l) => l.monobankAccountId)).toEqual(['mono-b', 'mono-a']);
  });

  it('Every link comes back exactly once, whatever the moments are', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            monobankAccountId: fc.string({ minLength: 1, maxLength: 6 }),
            lastAttemptedAtMs: fc.option(fc.integer({ min: 0, max: NOW }), { nil: null }),
          }),
          { selector: (l) => l.monobankAccountId, maxLength: 12 },
        ),
        (links) => {
          const ordered = syncOrder(links);
          expect(ordered).toHaveLength(links.length);
          expect([...ordered].sort(byId)).toEqual([...links].sort(byId));
          // Never-turned links first, then non-decreasing moments: the order is total.
          const moments = ordered.map((l) => l.lastAttemptedAtMs);
          const firstMoment = moments.findIndex((m) => m !== null);
          if (firstMoment >= 0) {
            expect(moments.slice(0, firstMoment).every((m) => m === null)).toBe(true);
            const rest = moments.slice(firstMoment) as number[];
            expect(rest.every((m, i) => i === 0 || rest[i - 1]! <= m)).toBe(true);
          }
        },
      ),
    );
  });
});

function byId(
  a: { monobankAccountId: string },
  b: { monobankAccountId: string },
): number {
  return a.monobankAccountId < b.monobankAccountId ? -1 : a.monobankAccountId > b.monobankAccountId ? 1 : 0;
}

describe('usableAccounts — the client-info answer a run may use instead of fetching one', () => {
  const HOUR_MS = 60 * 60 * 1000;
  const MINUTE_MS = 60 * 1000;
  const row = (id: string, obtainedAtMs: number) => ({
    id,
    kind: 'card' as const,
    name: `card ${id}`,
    currency: 'UAH' as const,
    bankBalance: money(1000, 'UAH'),
    obtainedAt: new Date(obtainedAtMs),
  });
  /** Links that have synced before, so only the answer's own freshness is under test. */
  const links = (...ids: readonly string[]) =>
    ids.map((monobankAccountId) => ({
      monobankAccountId,
      cursorMs: NOW - 24 * 60 * 60 * 1000,
      lastSyncedAtMs: NOW - 24 * 60 * 60 * 1000,
    }));

  it('Scenario: A stored answer from seconds ago sends the allowance to the statement', () => {
    const answer = usableAccounts(
      [row('mono-a', NOW - 20 * 1000), row('mono-b', NOW - 20 * 1000)],
      links('mono-a', 'mono-b'),
      NOW,
    );

    // Every link named by one answer inside the межа свіжості: the run uses it and sends nothing.
    expect(answer).toBeDefined();
    expect([...answer!.accounts.keys()].sort()).toEqual(['mono-a', 'mono-b']);
    expect(answer!.obtainedAt.getTime()).toBe(NOW - 20 * 1000);
    expect(answer!.accounts.get('mono-a')?.bankBalance).toEqual(money(1000, 'UAH'));
  });

  it('Scenario: A stored answer older than a minute is refetched', () => {
    expect(usableAccounts([row('mono-a', NOW - 2 * HOUR_MS)], links('mono-a'), NOW)).toBeUndefined();
    expect(usableAccounts([row('mono-a', NOW - 10 * MINUTE_MS)], links('mono-a'), NOW)).toBeUndefined();
    // The bound itself is the edge: an answer exactly a minute old no longer serves — which is
    // what makes every background chance, a quarter of an hour apart, read the balances first.
    expect(usableAccounts([row('mono-a', NOW - MINUTE_MS)], links('mono-a'), NOW)).toBeUndefined();
    expect(
      usableAccounts([row('mono-a', NOW - MINUTE_MS + 1)], links('mono-a'), NOW),
    ).toBeDefined();
  });

  it('Scenario: An answer dated in the future is refetched', () => {
    // The clock-moved-forward hazard `syncDue` and `paced` already guard, answered the same way:
    // one extra request, and the answer it brings heals the rows.
    expect(usableAccounts([row('mono-a', NOW + 60 * 1000)], links('mono-a'), NOW)).toBeUndefined();
  });

  it('Scenario: A phone that has never read client-info asks the bank', () => {
    expect(usableAccounts([], links('mono-a'), NOW)).toBeUndefined();
  });

  it('Rows from an older answer are not in the map, so a link only they name reads as unnamed', () => {
    // The point of deciding freshness per *answer* rather than per row. `upsertAccounts` never
    // deletes, so a рахунок the token stopped showing keeps a row no answer will ever refresh; a
    // per-row rule would call it stale, refetch, still not find it named, and spend every прогін's
    // allowance on client-info for ever.
    const answer = usableAccounts(
      [row('mono-gone', NOW - 3 * HOUR_MS), row('mono-a', NOW - 20 * 1000)],
      links('mono-a', 'mono-gone'),
      NOW,
    );

    expect(answer).toBeDefined();
    expect([...answer!.accounts.keys()]).toEqual(['mono-a']);
    // And `mono-gone` is therefore a link the newest answer does not name — the coordinator's
    // «the token no longer shows this рахунок», not a reason to ask the bank again.
    expect(answer!.accounts.has('mono-gone')).toBe(false);
  });

  it('The newest moment is the answer, however the rows are ordered', () => {
    const rows = [row('mono-b', NOW - 20 * 1000), row('mono-a', NOW - 3 * HOUR_MS)];

    expect([...usableAccounts(rows, links('mono-b'), NOW)!.accounts.keys()]).toEqual(['mono-b']);
    expect([...usableAccounts([...rows].reverse(), links('mono-b'), NOW)!.accounts.keys()]).toEqual([
      'mono-b',
    ]);
  });

  it('A link no row names at all leaves the rest usable', () => {
    // A рахунок linked before this phone ever read client-info about it: the answer still serves
    // every other link, and that one gets the same verdict a fetched answer would give it.
    const answer = usableAccounts([row('mono-a', NOW - 20 * 1000)], links('mono-a', 'mono-new'), NOW);

    expect(answer).toBeDefined();
    expect([...answer!.accounts.keys()]).toEqual(['mono-a']);
  });

  it('An answer older than a рахунок the owner has just linked cannot serve the run', () => {
    // The рахунок's вікна all lie after this answer, so a run working from it would have nothing to
    // ask about that рахунок and nothing to report but «finished without asking» — while the screen
    // goes on saying «Ще не синхронізовано», because nothing was. Asking the bank costs one request
    // and heals it: the answer that comes back is dated now, past the boundary the owner set.
    const answer = usableAccounts(
      [row('mono-a', NOW - 20 * 1000)],
      [
        { monobankAccountId: 'mono-a', cursorMs: NOW - 24 * HOUR_MS, lastSyncedAtMs: NOW - 24 * HOUR_MS },
        { monobankAccountId: 'mono-new', cursorMs: NOW - 10 * 1000, lastSyncedAtMs: null },
      ],
      NOW,
    );

    expect(answer).toBeUndefined();
  });

  it('A boundary in the future of the clock does not force a request every run', () => {
    // No answer heals that one, so demanding a fresh one for it would spend the allowance on
    // client-info for ever — the very shape of the defect this function exists to remove.
    const answer = usableAccounts(
      [row('mono-a', NOW - 20 * 1000)],
      [{ monobankAccountId: 'mono-a', cursorMs: NOW + HOUR_MS, lastSyncedAtMs: null }],
      NOW,
    );

    expect(answer).toBeDefined();
  });

  it('A рахунок that has synced before does not force a request when its cursor has caught up', () => {
    // The ordinary steady state: the cursor stands exactly where the last run left it, which is
    // the moment of the answer this run is about to use again.
    const answer = usableAccounts(
      [row('mono-a', NOW - 20 * 1000)],
      [{ monobankAccountId: 'mono-a', cursorMs: NOW - 20 * 1000, lastSyncedAtMs: NOW - 20 * 1000 }],
      NOW,
    );

    expect(answer).toBeDefined();
  });

  it('An answer that names none of the links leaves the run to ask the bank', () => {
    // A token whose accounts are all gone. Nothing is stored for such an answer, so the newest
    // moment does not move and a never-synced link goes on refusing it — knowingly: every link is
    // `unavailable` under it anyway, so the allowance had no statement request to go to.
    const answer = usableAccounts(
      [row('mono-gone', NOW - 20 * 1000)],
      [{ monobankAccountId: 'mono-new', cursorMs: NOW - 10 * 1000, lastSyncedAtMs: null }],
      NOW,
    );

    expect(answer).toBeUndefined();
  });

  it('The bound is overridable, and defaults to CLIENT_INFO_FRESH_MS', () => {
    expect(CLIENT_INFO_FRESH_MS).toBe(60 * 1000);
    expect(usableAccounts([row('mono-a', NOW - 120)], links('mono-a'), NOW, 60)).toBeUndefined();
    expect(usableAccounts([row('mono-a', NOW - 30)], links('mono-a'), NOW, 60)).toBeDefined();
  });
});

describe('shownLinks — the linked рахунки the token still shows', () => {
  const row = (id: string, obtainedAtMs: number) => ({ id, obtainedAt: new Date(obtainedAtMs) });
  const link = (monobankAccountId: string) => ({ monobankAccountId, lastSyncedAtMs: NOW });
  const ids = (links: readonly { monobankAccountId: string }[]) => links.map((l) => l.monobankAccountId);

  it('Scenario: A vanished card does not keep Головний stale — it is left out', () => {
    // The newest answer (NOW) names two of the three; the card it no longer names kept a row from
    // an older answer, which no answer will ever refresh.
    const rows = [row('mono-a', NOW), row('mono-b', NOW), row('mono-gone', NOW - DAY_MS)];

    expect(ids(shownLinks([link('mono-a'), link('mono-gone'), link('mono-b')], rows))).toEqual([
      'mono-a',
      'mono-b',
    ]);
  });

  it('Scenario: A token that shows nothing linked is still a failure — nothing is left out', () => {
    const rows = [row('mono-other', NOW), row('mono-a', NOW - DAY_MS)];

    expect(ids(shownLinks([link('mono-a'), link('mono-b')], rows))).toEqual(['mono-a', 'mono-b']);
  });

  it('A phone that holds no answer cannot tell, so it leaves nothing out', () => {
    expect(ids(shownLinks([link('mono-a')], []))).toEqual(['mono-a']);
  });
});

describe('mapStatement over the шаблон категоризації', () => {
  const defaults = () => new Map(TEMPLATE_GROUPS.map((g) => [g.id, g.defaultCategoryId]));
  const fresh = (targets = defaults()) =>
    context({ rules: [], merchants: NO_MERCHANTS, templateRules: templateRules(targets) });
  const categoryOf = (description: string, mcc?: number, ctx = fresh()) =>
    mapStatement([item({ id: 'a1', description, mcc })], ctx).transactions[0];

  it('Scenario: A fresh device categorises a known merchant with no setup', () => {
    expect(categoryOf('АТБ 421', 7399)).toMatchObject({ type: 'expense', categoryId: 'groceries' });
  });

  it('Scenario: A known MCC is enough on its own', () => {
    expect(categoryOf('НОВИЙ ЗАКЛАД', 5411)).toMatchObject({ categoryId: 'groceries' });
  });

  it('Scenario: Both spellings of one merchant are covered', () => {
    expect(categoryOf('UKLON', 4121)).toMatchObject({ categoryId: 'transport' });
    expect(categoryOf('Уклон', 4121)).toMatchObject({ categoryId: 'transport' });
  });

  it('Scenario: A remapped базова категорія lands somewhere else', () => {
    expect(categoryOf('АТБ 421', 5411, fresh(defaults().set('groceries', 'yizha')))).toMatchObject({
      categoryId: 'yizha',
    });
  });

  it('Scenario: A правило beats the шаблон', () => {
    const atb: Rule = {
      id: 'r-atb',
      merchant: 'атб',
      target: { kind: 'category', categoryId: 'eating-out' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const ctx = context({ rules: [atb], merchants: NO_MERCHANTS, templateRules: templateRules(defaults()) });
    expect(categoryOf('АТБ 421', 5411, ctx)).toMatchObject({ categoryId: 'eating-out' });
  });

  it('Scenario: The longest шаблон pattern wins inside the шаблон', () => {
    expect(categoryOf('BOLT FOOD', 5814)).toMatchObject({ categoryId: 'food-delivery' });
  });

  it('Scenario: A target that no longer exists matches nothing — the import is not refused', () => {
    // `templateTargets` leaves out a target this device lacks; what reaches the mapper is the
    // шаблон without that базова категорія.
    const targets = defaults();
    targets.delete('travel');
    expect(categoryOf('RYANAIR', 4511, fresh(targets))).toMatchObject({
      type: 'expense',
      categoryId: UNCATEGORISED_CATEGORY_ID,
    });
  });

  it('Scenario: Neither tier matches', () => {
    expect(categoryOf('НОВИЙ ЗАКЛАД', 7399)).toMatchObject({ categoryId: UNCATEGORISED_CATEGORY_ID });
  });
});

describe('mapStatement — the MCC and the продавці', () => {
  it('Scenario: A purchase keeps the code the bank gave it', () => {
    const { transactions } = mapStatement([item({ id: 'a1', mcc: 5411 })], context());
    expect(transactions[0]).toMatchObject({ type: 'expense', mcc: 5411 });
  });

  it('Scenario: A переказ made by a правило keeps it too', () => {
    const roundUp: Rule = {
      id: 'r-round-up',
      merchant: 'округлення балансу',
      target: { kind: 'transfer', toAccountId: 'reserve' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'Округлення балансу «Резерв»', mcc: 4829, amount: money(-479, 'UAH') })],
      context({
        accountId: 'platinum',
        rules: [roundUp],
        accounts: [
          { id: 'platinum', currency: 'UAH' },
          { id: 'reserve', currency: 'UAH' },
        ],
      }),
    );
    expect(transactions[0]).toMatchObject({ type: 'transfer', mcc: 4829 });
  });

  it('Scenario: An item already imported is not revisited', () => {
    // A витрата imported before the MCC was kept carries none, and the next sync reading the same
    // item makes nothing of it: no second транзакція, and nothing to write the code onto.
    const { transactions, seenNow } = mapStatement(
      [item({ id: 'a1', mcc: 5411 })],
      context({ seenIds: new Set(['a1']) }),
    );
    expect(transactions).toEqual([]);
    expect([...seenNow]).toEqual(['a1']);
  });

  it('Scenario: The monobank sync honours a продавець', () => {
    const atb = merchant({
      id: 'atb',
      name: 'АТБ',
      spellings: [{ id: 's1', spelling: 'atb', addedAt: new Date(0) }],
      createdAt: new Date(0),
    });
    const byMerchant: Rule = {
      id: 'r-atb',
      merchantId: 'atb',
      target: { kind: 'category', categoryId: 'eating-out' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const { transactions } = mapStatement(
      [item({ id: 'a1', description: 'ATB MARKET 23', amount: money(-8000, 'UAH') })],
      context({ rules: [byMerchant], merchants: merchantIndex([atb]) }),
    );
    expect(transactions[0]).toMatchObject({ type: 'expense', amount: money(8000, 'UAH'), categoryId: 'eating-out' });
  });
});
