import { describe, expect, it } from 'vitest';

import type { AccumulationGoal } from '../domain/goals';
import { money } from '../domain/money';
import type { IsoDate, Month } from '../domain/transaction';
import {
  accepted,
  allChallenges,
  offered,
  type ChallengeInput,
} from './challenges';
import type { MonthRow, ProgressSummary } from './summary';

const TODAY: IsoDate = '2026-09-02';

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
    history: { count: 1 },
    drafts: [],
    ...over,
  };
}

function input(over: Partial<ChallengeInput> = {}): ChallengeInput {
  return {
    summary: summary(),
    today: TODAY,
    goals: [],
    limits: [],
    categoryNames: new Map(),
    norms: new Map(),
    decisions: [],
    monthLabel: (month) => month,
    ...over,
  };
}

const keys = (list: { key: string }[]) => list.map((one) => one.key);

describe('what a виклик carries', () => {
  it('Scenario: A proposed виклик carries all four', () => {
    const cushion = offered(
      input({
        summary: summary({
          months: [monthRow('2026-08')],
          balances: [{ kind: 'savings', currency: 'UAH', balance: 900_000 }],
        }),
        norms: new Map([['UAH', { amount: money(3_000_000, 'UAH'), confirmedAtMs: 0 }]]),
      }),
    ).find((one) => one.template === 'reserve-cushion')!;

    expect(cushion.reason).toContain('900000');
    expect(cushion.reason).toContain('3000000');
    expect(cushion.progress).toEqual({
      kind: 'against',
      reached: 900_000,
      target: 3_000_000,
      currency: 'UAH',
    });
    expect(cushion.criterion).toContain('одна місячна норма витрат');
    expect(cushion.action).toEqual({ kind: 'record-transfer', accountKind: 'savings' });
  });

  it('Scenario: Закрий місяць counts down from what is there now', () => {
    const withThree = summary({
      months: [monthRow('2026-08', { transactions: 40, uncategorised: 3 })],
      history: { count: 40 },
    });
    const proposed = offered(input({ summary: withThree }))[0]!;
    expect(proposed.progress).toEqual({ kind: 'remaining', remaining: 3 });

    const withTwo = summary({
      months: [monthRow('2026-08', { transactions: 40, uncategorised: 2 })],
      history: { count: 40 },
    });
    const later = offered(input({ summary: withTwo }))[0]!;

    expect(later.progress).toEqual({ kind: 'remaining', remaining: 2 });
    // No denominator anywhere: nothing remembers that there were three.
    expect(JSON.stringify(later.progress)).not.toContain('3');
  });

  it('counts waiting чернетки among what a місяць still leaves open', () => {
    const held = summary({
      months: [monthRow('2026-08', { transactions: 40, uncategorised: 1 })],
      drafts: [{ month: '2026-08', waiting: 2 }],
      history: { count: 40 },
    });

    expect(offered(input({ summary: held }))[0]!.progress).toEqual({
      kind: 'remaining',
      remaining: 3,
    });
  });

  it('Scenario: Закрий місяць is offered ahead of the rest', () => {
    const busy = input({
      summary: summary({
        months: [
          monthRow('2026-05'),
          monthRow('2026-06'),
          monthRow('2026-07'),
          monthRow('2026-08', { transactions: 40, uncategorised: 2 }),
        ],
        balances: [{ kind: 'savings', currency: 'UAH', balance: 100_000 }],
        history: { count: 43 },
      }),
      norms: new Map([['UAH', { amount: money(3_000_000, 'UAH'), confirmedAtMs: 0 }]]),
    });

    const list = offered(busy);

    expect(list[0]!.key).toBe('close-month:2026-08');
    expect(keys(list)).toEqual(
      expect.arrayContaining(['reserve-cushion:UAH', 'invest-habit']),
    );
  });

  it('Scenario: The подушка asks for the норма first', () => {
    const noNorm = offered(
      input({
        summary: summary({
          months: [monthRow('2026-07'), monthRow('2026-08')],
          history: { count: 2 },
        }),
      }),
    ).find((one) => one.template === 'reserve-cushion')!;

    expect(noNorm.firstStep).toEqual({ kind: 'confirm-norm', currency: 'UAH' });
    expect(noNorm.action).toEqual({ kind: 'confirm-norm', currency: 'UAH' });
    expect(noNorm.progress).toEqual({ kind: 'remaining', remaining: 1 });
  });

  it('picks the currency the record knows best when no норма is confirmed at all', () => {
    const twoCurrencies = summary({
      months: [
        monthRow('2026-06'),
        monthRow('2026-07'),
        monthRow('2026-08'),
        monthRow('2026-08', { currency: 'USD' }),
      ],
      history: { count: 4 },
    });

    const cushion = offered(input({ summary: twoCurrencies })).find(
      (one) => one.template === 'reserve-cushion',
    )!;

    expect(cushion.key).toBe('reserve-cushion:UAH');
  });

  it('is not offered at all once every measured currency is covered', () => {
    const covered = input({
      summary: summary({
        months: [monthRow('2026-08')],
        balances: [{ kind: 'savings', currency: 'UAH', balance: 5_000_000 }],
      }),
      norms: new Map([['UAH', { amount: money(3_000_000, 'UAH'), confirmedAtMs: 0 }]]),
    });

    expect(keys(offered(covered))).not.toContain('reserve-cushion:UAH');
  });
});

describe('the ліміт виклик', () => {
  const limits = [{ categoryId: 'food', amount: money(800_000, 'UAH') }];
  const names = new Map([['food', 'Продукти']]);

  const monthsWith = (spendByMonth: Record<Month, number>) =>
    summary({
      months: Object.keys(spendByMonth).map((month) => monthRow(month, { transactions: 20 })),
      limitedCategories: Object.entries(spendByMonth).map(([month, spent]) => ({
        month,
        currency: 'UAH',
        categoryId: 'food',
        spent,
      })),
      history: { count: 100 },
    });

  it('Scenario: The ліміт виклик counts завершені місяці only', () => {
    const held = input({
      summary: monthsWith({
        '2026-05': 900_000,
        '2026-06': 700_000,
        '2026-07': 700_000,
        // The current місяць is already over, and takes no part.
        '2026-09': 950_000,
      }),
      limits,
      categoryNames: names,
    });

    const challenge = allChallenges(held).find((one) => one.template === 'limit-hold')!;

    expect(challenge.progress).toEqual({ kind: 'against', reached: 2, target: 3 });
    expect(challenge.finished).toBe(false);
    expect(challenge.name).toBe('Втримай ліміт «Продукти»');
  });

  it('Scenario: The window is the data`s, not the acceptance`s', () => {
    const never = input({
      summary: monthsWith({ '2026-05': 900_000, '2026-06': 700_000, '2026-07': 700_000 }),
      limits,
      categoryNames: names,
      decisions: [],
    });
    const alsoAccepted = input({
      summary: monthsWith({ '2026-05': 900_000, '2026-06': 700_000, '2026-07': 700_000 }),
      limits,
      categoryNames: names,
      decisions: [{ key: 'limit-hold:food', decision: 'accepted', decidedAtMs: 0 }],
    });

    const a = allChallenges(never).find((one) => one.template === 'limit-hold')!;
    const b = allChallenges(alsoAccepted).find((one) => one.template === 'limit-hold')!;
    expect(a.progress).toEqual(b.progress);
  });

  it('is finished after three завершені місяці under the ліміт', () => {
    const held = input({
      summary: monthsWith({
        '2026-04': 900_000,
        '2026-05': 700_000,
        '2026-06': 700_000,
        '2026-07': 700_000,
      }),
      limits,
      categoryNames: names,
    });

    const challenge = allChallenges(held).find((one) => one.template === 'limit-hold')!;
    expect(challenge.finished).toBe(true);
    expect(keys(offered(held))).not.toContain('limit-hold:food');
  });

  it('is not offered for a ліміт that has never been exceeded', () => {
    const held = input({
      summary: monthsWith({ '2026-06': 100_000, '2026-07': 100_000 }),
      limits,
      categoryNames: names,
    });

    expect(allChallenges(held).some((one) => one.template === 'limit-hold')).toBe(false);
  });
});

describe('the інвестиційна звичка', () => {
  it('Scenario: The інвестиційна звичка reads the last four завершені місяці', () => {
    const held = input({
      summary: summary({
        months: [
          monthRow('2026-04', { invested: 200_000 }),
          monthRow('2026-05'),
          monthRow('2026-06'),
          monthRow('2026-07'),
          monthRow('2026-08'),
        ],
        history: { count: 5 },
      }),
    });

    const habit = allChallenges(held).find((one) => one.template === 'invest-habit')!;

    // 2026-04 is outside the window of four; one of the last four holds an інвестиція... none.
    expect(habit.progress).toEqual({ kind: 'against', reached: 0, target: 3 });

    const one = input({
      summary: summary({
        months: [
          monthRow('2026-05', { invested: 200_000 }),
          monthRow('2026-06'),
          monthRow('2026-07'),
          monthRow('2026-08'),
        ],
        history: { count: 4 },
      }),
    });
    expect(allChallenges(one).find((c) => c.template === 'invest-habit')!.progress).toEqual({
      kind: 'against',
      reached: 1,
      target: 3,
    });
  });

  it('is finished once three of the last four hold an інвестиція', () => {
    const held = input({
      summary: summary({
        months: [
          monthRow('2026-05', { invested: 200_000 }),
          monthRow('2026-06', { invested: 200_000 }),
          monthRow('2026-07', { invested: 200_000 }),
          monthRow('2026-08'),
        ],
        history: { count: 4 },
      }),
    });

    expect(allChallenges(held).find((c) => c.template === 'invest-habit')!.finished).toBe(true);
  });
});

describe('choosing which виклики stand', () => {
  const crowded = (over: Partial<ChallengeInput> = {}) =>
    input({
      summary: summary({
        months: [
          monthRow('2026-05', { transactions: 20 }),
          monthRow('2026-06', { transactions: 20 }),
          monthRow('2026-07', { transactions: 20, spent: 900_000 }),
          monthRow('2026-08', { transactions: 20, uncategorised: 2 }),
        ],
        limitedCategories: [
          { month: '2026-07', currency: 'UAH', categoryId: 'food', spent: 900_000 },
        ],
        balances: [{ kind: 'savings', currency: 'UAH', balance: 100_000 }],
        history: { count: 80 },
      }),
      limits: [{ categoryId: 'food', amount: money(800_000, 'UAH') }],
      categoryNames: new Map([['food', 'Продукти']]),
      norms: new Map([['UAH', { amount: money(3_000_000, 'UAH'), confirmedAtMs: 0 }]]),
      goals: [
        {
          goal: {
            id: 'auto',
            name: 'Авто',
            target: money(1_000_000, 'UAH'),
            accountIds: ['jar'],
          } satisfies AccumulationGoal,
          progress: money(100_000, 'UAH'),
        },
      ],
      ...over,
    });

  it('Scenario: Four eligible виклики yield three', () => {
    const all = allChallenges(crowded());
    expect(all.length).toBeGreaterThanOrEqual(4);

    const list = offered(crowded());

    expect(list).toHaveLength(3);
    expect(keys(list)).toEqual([
      'close-month:2026-08',
      'reserve-cushion:UAH',
      'goal-next-quarter:auto',
    ]);
  });

  it('Scenario: The same data yields the same виклики', () => {
    expect(JSON.stringify(offered(crowded()))).toBe(JSON.stringify(offered(crowded())));
  });

  it('Scenario: A dismissed виклик stops being proposed', () => {
    const dismissed = crowded({
      decisions: [{ key: 'invest-habit', decision: 'dismissed', decidedAtMs: 0 }],
    });

    expect(keys(offered(dismissed))).not.toContain('invest-habit');
    // And nothing about the record changed because of it.
    expect(allChallenges(dismissed).map((one) => one.progress)).toEqual(
      allChallenges(crowded()).map((one) => one.progress),
    );
  });

  it('Scenario: A dismissal binds only its own parameters', () => {
    const dismissedJuly = input({
      summary: summary({
        months: [monthRow('2026-08', { transactions: 20, uncategorised: 1 })],
        history: { count: 20 },
      }),
      decisions: [{ key: 'close-month:2026-07', decision: 'dismissed', decidedAtMs: 0 }],
    });

    expect(keys(offered(dismissedJuly))).toContain('close-month:2026-08');
  });

  it('Scenario: The criterion decides, not the acceptance', () => {
    const answered = input({
      summary: summary({
        months: [monthRow('2026-08', { transactions: 20 })],
        history: { count: 20 },
      }),
      decisions: [],
    });

    const closed = allChallenges(answered).find((one) => one.template === 'close-month')!;
    expect(closed.finished).toBe(true);
    expect(keys(offered(answered))).not.toContain('close-month:2026-08');
  });

  it('Scenario: Finishing earns only the underlying fact', () => {
    // Nothing here produces a досягнення: `challenges.ts` exports no achievement of any kind, and
    // the engine that does never reads a decision.
    const finished = allChallenges(
      input({
        summary: summary({
          months: [monthRow('2026-08', { transactions: 20 })],
          history: { count: 20 },
        }),
      }),
    );

    for (const one of finished) {
      expect(Object.keys(one)).not.toContain('evidence');
      expect(Object.keys(one)).not.toContain('achievedOn');
    }
  });

  it('Scenario: A fresh install proposes nothing', () => {
    expect(allChallenges(input({ summary: summary({ history: { count: 0 } }) }))).toEqual([]);
    expect(offered(input({ summary: summary({ history: { count: 0 } }) }))).toEqual([]);
  });

  it('Scenario: An unfinished accepted виклик costs nothing', () => {
    const withAccepted = crowded({
      decisions: [{ key: 'invest-habit', decision: 'accepted', decidedAtMs: 0 }],
    });

    // Accepted виклики are shown whatever their position, and the cap of three is about what is
    // proposed. Nothing is deducted and no досягнення is touched by one standing unfinished.
    expect(keys(accepted(withAccepted))).toEqual(['invest-habit']);
    expect(offered(withAccepted)).toHaveLength(3);
  });

  it('Scenario: Nothing counts completed виклики', () => {
    // There is no total anywhere: a виклик is a value with a key, a progress and a criterion.
    for (const one of allChallenges(crowded())) {
      expect(Object.keys(one)).not.toContain('completed');
      expect(Object.keys(one)).not.toContain('score');
      expect(Object.keys(one)).not.toContain('points');
    }
  });

  it('Scenario: Progress is recomputed, not remembered', () => {
    const before = allChallenges(crowded()).find((one) => one.template === 'reserve-cushion')!;
    const after = allChallenges(
      crowded({
        summary: {
          ...crowded().summary,
          balances: [{ kind: 'savings', currency: 'UAH', balance: 2_000_000 }],
        },
      }),
    ).find((one) => one.template === 'reserve-cushion')!;

    expect(before.progress).toEqual({
      kind: 'against',
      reached: 100_000,
      target: 3_000_000,
      currency: 'UAH',
    });
    expect(after.progress).toEqual({
      kind: 'against',
      reached: 2_000_000,
      target: 3_000_000,
      currency: 'UAH',
    });
  });
});
