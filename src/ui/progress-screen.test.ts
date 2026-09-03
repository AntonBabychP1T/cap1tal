import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money } from '../domain/money';
import { expenseByDefault } from '../domain/transaction';
import { homeViewModel } from './home-screen';
import type { Candidate } from '../progress/catalogue';
import type { Challenge } from '../progress/challenges';
import type { EarnedAchievement } from '../progress/earned';
import {
  achievementDetail,
  achievementsCount,
  challengeDetail,
  homeProgressSection,
  normRefusal,
  normStep,
  progressViewModel,
  NORM_QUESTION,
  NOTHING_EARNED,
  NOTHING_IN_PROGRESS,
  NOTHING_TO_DO,
  NOTHING_YET,
  type ProgressInput,
} from './progress-screen';

const NOW = new Date('2026-09-02T09:00:00');

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    key: 'ledger.transactions:500',
    template: 'ledger.transactions',
    group: 'ledger',
    name: '500 транзакцій',
    condition: 'Збережено щонайменше 500 транзакцій.',
    earned: false,
    dating: 'history',
    evidence: { kind: 'count', count: 500 },
    progress: { reached: 300, target: 500 },
    ...over,
  };
}

function earned(over: Partial<EarnedAchievement> = {}): EarnedAchievement {
  return {
    key: 'ledger.transactions:500',
    template: 'ledger.transactions',
    achievedOn: '2025-04-18',
    recordedAtMs: NOW.getTime(),
    evidence: { kind: 'count', count: 500 },
    ...over,
  };
}

function challenge(over: Partial<Challenge> = {}): Challenge {
  return {
    key: 'reserve-cushion:UAH',
    template: 'reserve-cushion',
    name: 'Фінансова подушка',
    reason: 'Резерв у UAH — 9\u00A0000,00 UAH з 30\u00A0000,00 UAH місячної норми витрат.',
    progress: { kind: 'against', reached: 900_000, target: 3_000_000, currency: 'UAH' },
    criterion: 'Резерв у UAH — щонайменше одна місячна норма витрат.',
    action: { kind: 'record-transfer', accountKind: 'savings' },
    finished: false,
    ...over,
  };
}

function input(over: Partial<ProgressInput> = {}): ProgressInput {
  return {
    candidates: [],
    earned: [],
    offered: [],
    accepted: [],
    hasHistory: true,
    now: NOW,
    ...over,
  };
}

describe('«Прогрес»', () => {
  it('Scenario: The three sections are shown in order', () => {
    const model = progressViewModel(
      input({
        offered: [challenge(), challenge({ key: 'invest-habit', name: 'Інвестиційна звичка' })],
        candidates: [
          candidate({ key: 'a' }),
          candidate({ key: 'b' }),
          candidate({ key: 'c' }),
          candidate({ key: 'earned-one', earned: true }),
        ],
        earned: Array.from({ length: 12 }, (_, i) =>
          earned({ key: `e${i}`, achievedOn: `2026-0${(i % 9) + 1}-01` }),
        ),
      }),
    );

    expect([model.challengesTitle, model.inProgressTitle, model.earnedTitle]).toEqual([
      'Виклики',
      'У процесі',
      'Отримані',
    ]);
    expect(model.challenges).toHaveLength(2);
    expect(model.inProgress).toHaveLength(3);
    expect(model.earned).toHaveLength(12);
  });

  it('Scenario: Отримані are newest first', () => {
    const model = progressViewModel(
      input({
        earned: [
          earned({ key: 'a', achievedOn: '2024-12-03' }),
          earned({ key: 'b', achievedOn: '2025-03-31' }),
          earned({ key: 'c', achievedOn: '2026-09-02' }),
        ],
      }),
    );

    expect(model.earned.map((row) => row.key)).toEqual(['c', 'b', 'a']);
  });

  it('Scenario: An empty section says so', () => {
    const model = progressViewModel(input());

    expect(model.challengesEmpty).toBe(NOTHING_TO_DO);
    expect(model.inProgressEmpty).toBe(NOTHING_IN_PROGRESS);
    expect(model.earnedEmpty).toBe(NOTHING_EARNED);
    expect(model.challenges).toEqual([]);
  });

  it('Scenario: A досягнення with no measurable progress is not listed as in progress', () => {
    const model = progressViewModel(
      input({
        candidates: [
          // «Ціль досягнута вчасно» with no ціль: nothing to measure, so nothing to list.
          candidate({ key: 'goal.reached-in-time:x', progress: undefined }),
          candidate({ key: 'measurable' }),
        ],
      }),
    );

    expect(model.inProgress.map((row) => row.key)).toEqual(['measurable']);
  });

  it('an already-earned досягнення is not also listed «У процесі»', () => {
    const model = progressViewModel(
      input({
        candidates: [candidate({ key: 'k', earned: true })],
        earned: [earned({ key: 'k' })],
      }),
    );

    expect(model.inProgress).toEqual([]);
    expect(model.earned).toHaveLength(1);
  });

  it('Scenario: No score exists to show', () => {
    const model = progressViewModel(
      input({ earned: Array.from({ length: 20 }, (_, i) => earned({ key: `e${i}` })) }),
    );

    const text = JSON.stringify(model);
    for (const word of ['score', 'level', 'points', 'бали', 'рівень', 'очки', 'XP']) {
      expect(text.toLowerCase()).not.toContain(word.toLowerCase());
    }
    expect(Object.keys(model)).not.toContain('total');
  });

  it('Scenario: Two currencies read as two amounts', () => {
    const model = progressViewModel(
      input({
        candidates: [
          candidate({
            key: 'reserve.norm:100:UAH',
            name: 'Місяць витрат у резерві (UAH)',
            progress: { reached: 1_800_000, target: 3_000_000, currency: 'UAH' },
          }),
          candidate({
            key: 'reserve.norm:100:USD',
            name: 'Місяць витрат у резерві (USD)',
            progress: { reached: 24_000, target: 40_000, currency: 'USD' },
          }),
        ],
      }),
    );

    expect(model.inProgress.map((row) => row.progress)).toEqual([
      '18\u00A0000,00 UAH з 30\u00A0000,00 UAH',
      '240,00 USD з 400,00 USD',
    ]);
    // No combined figure anywhere.
    expect(JSON.stringify(model)).not.toContain('UAH з 400,00 USD');
  });

  it('Scenario: A fresh install shows one sentence', () => {
    const model = progressViewModel(input({ hasHistory: false, candidates: [candidate()] }));

    expect(model.nothingYet).toBe(NOTHING_YET);
    expect(model.challenges).toEqual([]);
    expect(model.inProgress).toEqual([]);
    expect(model.earned).toEqual([]);
    // No empty-state sentences either: there is one sentence, and no list, bar or placeholder.
    expect(model.challengesEmpty).toBeNull();
    expect(model.inProgressEmpty).toBeNull();
    expect(model.earnedEmpty).toBeNull();
  });
});

describe('the «Прогрес» section of Головний', () => {
  it('Scenario: Nothing waiting, no section', () => {
    expect(
      homeProgressSection({
        earned: [earned({ seenAtMs: 1 }), earned({ key: 'b', seenAtMs: 2 })],
        accepted: [],
        candidates: [],
      }),
    ).toBeNull();
  });

  it('Scenario: One new досягнення is named', () => {
    const section = homeProgressSection({
      earned: [earned({ key: 'k', seenAtMs: undefined })],
      accepted: [],
      candidates: [candidate({ key: 'k', name: '500 транзакцій' })],
    })!;

    expect(section.achievements).toBe('500 транзакцій');
    expect(section.challenge).toBeNull();
  });

  it('Scenario: Twelve retroactive досягнення are one line', () => {
    const section = homeProgressSection({
      earned: Array.from({ length: 12 }, (_, i) => earned({ key: `e${i}` })),
      accepted: [],
      candidates: [],
    })!;

    expect(section.achievements).toBe('Ви вже маєте 12 досягнень');
    // One line, not twelve — and nothing that has to be dismissed.
    expect(section.achievements!.split('\n')).toHaveLength(1);
  });

  it('Scenario: Seen is seen', () => {
    const seen = Array.from({ length: 12 }, (_, i) => earned({ key: `e${i}`, seenAtMs: 5 }));

    expect(homeProgressSection({ earned: seen, accepted: [], candidates: [] })).toBeNull();
    // Unless a виклик is accepted, in which case that is all the section holds.
    const withChallenge = homeProgressSection({
      earned: seen,
      accepted: [challenge()],
      candidates: [],
    })!;
    expect(withChallenge.achievements).toBeNull();
    expect(withChallenge.challenge?.name).toBe('Фінансова подушка');
  });

  it('Scenario: One accepted виклик is shown', () => {
    const section = homeProgressSection({
      earned: [],
      accepted: [
        challenge({ key: 'a', name: 'Далеко', progress: { kind: 'against', reached: 1, target: 10 } }),
        challenge({ key: 'b', name: 'Близько', progress: { kind: 'against', reached: 8, target: 10 } }),
        challenge({ key: 'c', name: 'Середньо', progress: { kind: 'against', reached: 4, target: 10 } }),
      ],
      candidates: [],
    })!;

    expect(section.challenge?.name).toBe('Близько');
    expect(section.challenge?.progress).toBe('8 з 10');
  });

  it('ranks a countdown by how little is left', () => {
    const section = homeProgressSection({
      earned: [],
      accepted: [
        challenge({ key: 'a', name: 'Багато', progress: { kind: 'remaining', remaining: 9 } }),
        challenge({ key: 'b', name: 'Мало', progress: { kind: 'remaining', remaining: 1 } }),
      ],
      candidates: [],
    })!;

    expect(section.challenge?.name).toBe('Мало');
    expect(section.challenge?.progress).toBe('залишилось 1 запис');
  });

  it('counts досягнення the way Ukrainian counts them', () => {
    expect(achievementsCount(1)).toBe('1 досягнення');
    expect(achievementsCount(3)).toBe('3 досягнення');
    expect(achievementsCount(12)).toBe('12 досягнень');
    expect(achievementsCount(21)).toBe('21 досягнення');
  });
});

describe('what Головний shows beside it', () => {
  it('Scenario: Nothing waiting leaves Головний as it was', () => {
    // Two halves. First: with nothing waiting there is no section at all — no heading, no empty
    // state, no placeholder.
    expect(
      homeProgressSection({ earned: [earned({ seenAtMs: 1 })], accepted: [], candidates: [] }),
    ).toBeNull();

    // Second, and the one that matters: everything else the tab shows is unchanged. Proven by
    // computing `homeViewModel` over one world twice — once as the tab does, and once again — and
    // asserting the two agree, while `homeProgressSection` over the same досягнення returns
    // nothing. The two models share no input and no output: this capability cannot reach
    // «Усього грошей», «Потребує уваги», the місяць or the monobank section, because none of them
    // is an argument it takes or a value it returns.
    const card = account({
      id: 'card',
      name: 'картка',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(500_000, 'UAH'),
    });
    const world = {
      month: '2026-08',
      accounts: [card],
      transactions: [
        expenseByDefault({
          id: 'e1',
          date: '2026-08-03',
          accountId: 'card',
          amount: money(120_000, 'UAH'),
          categoryId: 'food',
        }),
      ],
      balances: new Map([['card', money(380_000, 'UAH')]]),
      rates: [],
      uncategorised: 0,
      pendingDrafts: 0,
      now: NOW,
    } as const;

    const before = homeViewModel({ ...world });
    // Twelve earned досягнення, every one of them seen, and three accepted виклики.
    homeProgressSection({
      earned: Array.from({ length: 12 }, (_, i) => earned({ key: `e${i}`, seenAtMs: 1 })),
      accepted: [],
      candidates: [],
    });
    const after = homeViewModel({ ...world });

    expect(after).toEqual(before);
    expect(Object.keys(after)).not.toContain('progress');
  });
});

describe('the details', () => {
  it('Scenario: The detail explains why it was earned', () => {
    const detail = achievementDetail({
      key: 'ledger.transactions:500',
      candidates: [candidate({ earned: true, progress: { reached: 450, target: 500 } })],
      earned: [earned()],
      now: NOW,
    })!;

    expect(detail.condition).toBe('Збережено щонайменше 500 транзакцій.');
    // The свідчення as it was frozen, and the current count beside it — never one in the other's
    // place.
    expect(detail.evidence).toBe('500 транзакцій');
    expect(detail.current).toBe('450 з 500');
    expect(detail.when).toBe('досягнуто 18 квітня 2025');
  });

  it('Scenario: The свідчення keeps the number of its moment', () => {
    const detail = achievementDetail({
      key: 'ledger.transactions:1000',
      candidates: [
        candidate({
          key: 'ledger.transactions:1000',
          name: '1000 транзакцій',
          earned: true,
          progress: { reached: 950, target: 1000 },
        }),
      ],
      earned: [earned({ key: 'ledger.transactions:1000', evidence: { kind: 'count', count: 1000 } })],
      now: NOW,
    })!;

    expect(detail.evidence).toBe('1000 транзакцій');
    expect(detail.current).toBe('950 з 1000');
  });

  it('Scenario: A money свідчення carries its currency', () => {
    const detail = achievementDetail({
      key: 'reserve.norm:100:UAH',
      candidates: [],
      earned: [
        earned({
          key: 'reserve.norm:100:UAH',
          evidence: { kind: 'money', money: money(3_000_000, 'UAH') },
        }),
      ],
      now: NOW,
    })!;

    expect(detail.evidence).toBe('30\u00A0000,00 UAH');
  });

  it('Scenario: A balance-dated досягнення says «помічено»', () => {
    const detail = achievementDetail({
      key: 'goal.progress:auto:50',
      candidates: [
        candidate({
          key: 'goal.progress:auto:50',
          name: 'Ціль «Авто» — 50 %',
          dating: 'recorded',
          earned: true,
          evidence: { kind: 'goal', goalId: 'auto', name: 'Авто' },
          progress: { reached: 600_000, target: 500_000, currency: 'UAH' },
        }),
      ],
      earned: [
        earned({
          key: 'goal.progress:auto:50',
          achievedOn: '2026-09-02',
          evidence: { kind: 'goal', goalId: 'auto', name: 'Авто' },
        }),
      ],
      now: NOW,
    })!;

    expect(detail.when).toBe('помічено 2 вересня');
    expect(detail.when).not.toContain('досягнуто');
  });

  it('still names a досягнення whose ціль the owner has since deleted', () => {
    const detail = achievementDetail({
      key: 'goal.reached:gone',
      candidates: [],
      earned: [
        earned({
          key: 'goal.reached:gone',
          evidence: { kind: 'goal', goalId: 'gone', name: 'Ноутбук' },
        }),
      ],
      now: NOW,
    })!;

    expect(detail.name).toBe('Ціль «Ноутбук»');
    expect(detail.earned).toBe(true);
  });

  it('Scenario: A виклик`s detail names its finish', () => {
    const detail = challengeDetail({
      key: 'reserve-cushion:UAH',
      challenges: [challenge()],
      accepted: [],
      now: NOW,
    })!;

    expect(detail.reason).toContain('9\u00A0000,00 UAH');
    expect(detail.progress).toBe('9\u00A0000,00 UAH з 30\u00A0000,00 UAH');
    expect(detail.criterion).toBe('Резерв у UAH — щонайменше одна місячна норма витрат.');
    expect(detail.accepted).toBe(false);
  });
});

describe('the норма step of «Фінансова подушка»', () => {
  it('Scenario: The подушка asks for the норма first', () => {
    const step = normStep({
      currency: 'UAH',
      proposal: {
        amount: money(3_050_000, 'UAH'),
        months: ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'],
      },
    });

    expect(step.question).toBe(NORM_QUESTION);
    expect(step.proposal).toBe('30\u00A0500,00 UAH');
    expect(step.months).toHaveLength(6);
    expect(step.hint).toContain('6 завершених місяців');
  });

  it('asks the owner to type one where the history is too short', () => {
    const step = normStep({ currency: 'USD', proposal: null });

    expect(step.proposal).toBeNull();
    expect(step.months).toEqual([]);
    expect(step.hint).toContain('Замало історії');
  });

  it('refuses a non-positive сума in the owner`s own words', () => {
    expect(normRefusal(money(0, 'UAH'))).toBe('Норма має бути більшою за нуль.');
    expect(normRefusal(money(-1, 'UAH'))).toBe('Норма має бути більшою за нуль.');
    expect(normRefusal(money(1, 'UAH'))).toBeNull();
  });
});
