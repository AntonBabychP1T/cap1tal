import { describe, expect, it } from 'vitest';

import type { AccumulationGoal } from '../domain/goals';
import type { GoalStanding } from './catalogue';
import { money } from '../domain/money';
import type { IsoDate, Month } from '../domain/transaction';
import {
  accepted,
  allChallenges,
  dismissed,
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
    accounts: [],
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
    formatMoney: (amount) => `${amount.amount} ${amount.currency}`,
    ...over,
  };
}

const keys = (list: { key: string }[]) => list.map((one) => one.key);

describe('what a виклик carries', () => {
  it('Scenario: A виклик opens the місяць it is about', () => {
    const closing = offered(
      input({
        summary: summary({
          months: [monthRow('2026-08', { transactions: 40, uncategorised: 2 })],
          history: { count: 40 },
        }),
      }),
    )[0]!;

    // The action names the місяць, so the screen it leads to can open narrowed to it rather than
    // to the whole history.
    expect(closing.action).toEqual({ kind: 'answer-month', month: '2026-08' });
  });

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

    // Сум, not raw minor units: the виклик speaks the register the rest of the app does.
    expect(cushion.reason).toContain('900000 UAH');
    expect(cushion.reason).toContain('3000000 UAH');
    expect(cushion.reason).not.toContain('мінорних одиниць');
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

describe('which ціль the виклик is about', () => {
  const goal = (id: string, target: number, percent: number): GoalStanding => ({
    goal: {
      id,
      name: id,
      target: money(target, 'UAH'),
      accountIds: ['jar'],
    } satisfies AccumulationGoal,
    progress: money(Math.floor((target * percent) / 100), 'UAH'),
  });

  const offeredFor = (goals: GoalStanding[]) =>
    allChallenges(
      input({
        summary: summary({ months: [monthRow('2026-08')], history: { count: 5 } }),
        goals,
      }),
    ).find((one) => one.template === 'goal-next-quarter')?.key;

  it('Scenario: The nearest ціль is the one nearest in share, not in сума', () => {
    // The one case where the two rules disagree, which is the only case worth naming: the small
    // ціль is 15 000 short and the large one 100 000 short, so comparing **сум** would offer the
    // small one — but the small one still has 15 % of its target to go and the large one 1 %.
    const small = goal('small', 100_000, 10);
    const large = goal('large', 10_000_000, 24);

    expect(offeredFor([small, large])).toBe('goal-next-quarter:large');
    // Order of the input must not decide it.
    expect(offeredFor([large, small])).toBe('goal-next-quarter:large');
  });

  it('offers the smaller ціль when it really is the nearer one', () => {
    // 3 % short against 5 % short: here share and сума agree, and so must the answer.
    expect(offeredFor([goal('small', 100_000, 22), goal('large', 10_000_000, 20)])).toBe(
      'goal-next-quarter:small',
    );
  });

  it('breaks a tie by the ціль`s identifier, so two devices agree', () => {
    const a = goal('a', 1_000_000, 20);
    const b = goal('b', 1_000_000, 20);

    expect(offeredFor([b, a])).toBe('goal-next-quarter:a');
  });

  it('passes over a ціль whose progress is not exact', () => {
    const inexact = { ...goal('near', 100_000, 24), progress: null };

    expect(offeredFor([inexact, goal('far', 1_000_000, 5)])).toBe('goal-next-quarter:far');
  });

  it('passes over a ціль that is already reached', () => {
    expect(offeredFor([goal('done', 100_000, 100), goal('going', 1_000_000, 5)])).toBe(
      'goal-next-quarter:going',
    );
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

  it('counts місяці and записи the way Ukrainian counts them', () => {
    const four = input({
      summary: summary({
        months: [
          monthRow('2026-05'),
          monthRow('2026-06'),
          monthRow('2026-07'),
          monthRow('2026-08'),
        ],
        history: { count: 4 },
      }),
    });
    const one = input({
      summary: summary({ months: [monthRow('2026-08')], history: { count: 1 } }),
    });

    expect(allChallenges(four).find((c) => c.template === 'invest-habit')!.reason).toContain(
      '4 завершені місяці',
    );
    expect(allChallenges(one).find((c) => c.template === 'invest-habit')!.reason).toContain(
      '1 завершений місяць',
    );

    // And «Закрий <місяць>» counts its own records the same way.
    const five = input({
      summary: summary({
        months: [monthRow('2026-08', { transactions: 20, uncategorised: 5 })],
        history: { count: 20 },
      }),
    });
    expect(allChallenges(five)[0]!.reason).toContain('5 записів');
    const two = input({
      summary: summary({
        months: [monthRow('2026-08', { transactions: 20, uncategorised: 2 })],
        history: { count: 20 },
      }),
    });
    expect(allChallenges(two)[0]!.reason).toContain('2 записи');
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

  it('a dismissed виклик is still readable, so it can be brought back', () => {
    const gone = crowded({
      decisions: [{ key: 'invest-habit', decision: 'dismissed', decidedAtMs: 0 }],
    });

    // Not offered — and not gone: `dismissed` is how the screen that carries «Повернути» is
    // reached at all.
    expect(keys(offered(gone))).not.toContain('invest-habit');
    expect(keys(dismissed(gone))).toEqual(['invest-habit']);
    // Accepting it again removes it from the dismissed ones, under the same key.
    const back = crowded({
      decisions: [{ key: 'invest-habit', decision: 'accepted', decidedAtMs: 1 }],
    });
    expect(keys(dismissed(back))).toEqual([]);
    expect(keys(accepted(back))).toEqual(['invest-habit']);
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
