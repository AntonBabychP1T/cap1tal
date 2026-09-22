import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import { homeViewModel } from './home-screen';
import type { Candidate } from '../progress/catalogue';
import type { Challenge } from '../progress/challenges';
import type { EarnedAchievement } from '../progress/earned';
import {
  achievementDetail,
  achievementsCount,
  challengeDetail,
  challengeStart,
  normRefusal,
  normStep,
  progressViewModel,
  progressWidgetPreview,
  unseenAchievementsBadge,
  NORM_QUESTION,
  NOTHING_EARNED,
  NOTHING_IN_PROGRESS,
  NOTHING_TO_DO,
  NOTHING_YET,
  type ProgressInput,
} from './progress-screen';

/** `true` only while `homeViewModel`'s input has no such field — the type-level half of the proof. */
type Excludes<K extends string> = K extends keyof Parameters<typeof homeViewModel>[0] ? false : true;

/** A no-op whose only job is to make the type parameter above load-bearing at runtime too. */
function expectTypeSatisfied<T>(): void {
  void (undefined as T | undefined);
}

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
    dismissed: [],
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

  it('lists a dismissed виклик so bringing it back is reachable, and never proposes it', () => {
    // The capability says the owner may «bring a dismissed one back». Dismissing takes a виклик
    // out of what is offered, and the screen carrying «Повернути» opens only from this list — so
    // a dismissed виклик that vanished from it would make that sentence unreachable.
    const cushion = challenge({ key: 'reserve-cushion:UAH' });
    const model = progressViewModel(input({ offered: [], dismissed: [cushion] }));

    expect(model.challenges.map((row) => row.key)).toEqual(['reserve-cushion:UAH']);
    expect(model.challenges[0]!.dismissed).toBe(true);
    expect(model.challenges[0]!.accepted).toBe(false);
    // Listed, not proposed: `offered` is what proposes, and it holds nothing.
    expect(model.challengesEmpty).toBeNull();
  });

  it('puts the accepted first, then what is offered, and the dismissed last', () => {
    const model = progressViewModel(
      input({
        accepted: [challenge({ key: 'accepted-one', name: 'Прийнятий' })],
        offered: [challenge({ key: 'offered-one', name: 'Запропонований' })],
        dismissed: [challenge({ key: 'dismissed-one', name: 'Відхилений' })],
      }),
    );

    expect(model.challenges.map((row) => row.key)).toEqual([
      'accepted-one',
      'offered-one',
      'dismissed-one',
    ]);
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

describe('the quiet badge beside Звіти → Прогрес', () => {
  it('Scenario: No unseen still navigable — nothing unseen is null, not an empty placeholder', () => {
    expect(
      unseenAchievementsBadge([earned({ seenAtMs: 1 }), earned({ key: 'b', seenAtMs: 2 })], []),
    ).toBeNull();
  });

  it('Scenario: One new досягнення is named', () => {
    const badge = unseenAchievementsBadge(
      [earned({ key: 'k', seenAtMs: undefined })],
      [candidate({ key: 'k', name: '500 транзакцій' })],
    );
    expect(badge).toBe('500 транзакцій');
  });

  it('Scenario: Twelve retroactive досягнення are one line', () => {
    const badge = unseenAchievementsBadge(
      Array.from({ length: 12 }, (_, i) => earned({ key: `e${i}` })),
      [],
    );
    expect(badge).toBe('Ви вже маєте 12 досягнень');
    // One line, not twelve — and nothing that has to be dismissed.
    expect(badge!.split('\n')).toHaveLength(1);
  });

  it('Scenario: Seen is seen', () => {
    const seen = Array.from({ length: 12 }, (_, i) => earned({ key: `e${i}`, seenAtMs: 5 }));
    expect(unseenAchievementsBadge(seen, [])).toBeNull();
  });

  it('counts досягнення the way Ukrainian counts them', () => {
    expect(achievementsCount(1)).toBe('1 досягнення');
    expect(achievementsCount(3)).toBe('3 досягнення');
    expect(achievementsCount(12)).toBe('12 досягнень');
    expect(achievementsCount(21)).toBe('21 досягнення');
  });
});

describe('the optional Прогрес widget on Головний', () => {
  it('Scenario: A deliberately visible Progress widget shows the same quiet badge, then loses it', () => {
    const candidates = [candidate({ key: 'k', name: '500 транзакцій' })];
    const unseen = [earned({ key: 'k', seenAtMs: undefined })];
    const model = progressViewModel(input({ earned: unseen, candidates }));
    const badge = unseenAchievementsBadge(unseen, candidates);

    const preview = progressWidgetPreview(model, badge);
    expect(preview.title).toBe('Прогрес');
    // The same quiet badge «Звіти» shows — one call, shared, never a second decision.
    expect(preview.badge).toBe('500 транзакцій');

    // Once seen, the same shape shows no badge — exactly as «Звіти» would show none either
    // (progress-screen, "Seen is seen").
    const seen = [earned({ key: 'k', seenAtMs: NOW.getTime() })];
    const seenBadge = unseenAchievementsBadge(seen, candidates);
    const seenModel = progressViewModel(input({ earned: seen, candidates }));
    expect(progressWidgetPreview(seenModel, seenBadge).badge).toBeNull();
  });

  it('shows the first row from whichever section has one, in progressViewModel`s own order', () => {
    const withChallenge = progressViewModel(input({ offered: [challenge()] }));
    expect(progressWidgetPreview(withChallenge, null).leadLabel).toBe('Фінансова подушка');

    const withEarnedOnly = progressViewModel(
      input({ earned: [earned()], candidates: [candidate({ earned: true })] }),
    );
    expect(progressWidgetPreview(withEarnedOnly, null).leadLabel).toBe('500 транзакцій');

    const withNothingYet = progressViewModel(input({ hasHistory: false }));
    expect(progressWidgetPreview(withNothingYet, null).leadLabel).toBeNull();
  });

  it('Scenario: A device with nothing yet says so plainly — the widget states the same sentence, verbatim', () => {
    // The full screen's own sentence, carried through unchanged — never a second, invented one
    // for the same state (progress-screen, "A device with nothing yet says so plainly").
    const withNothingYet = progressViewModel(input({ hasHistory: false }));
    expect(withNothingYet.nothingYet).toBe(NOTHING_YET);

    const preview = progressWidgetPreview(withNothingYet, null);
    expect(preview.nothingYet).toBe(NOTHING_YET);
    expect(preview.leadLabel).toBeNull();
    expect(preview.badge).toBeNull();

    // And it is null whenever history exists, whatever the lead row and badge say — the two
    // states are never conflated behind one placeholder.
    const withHistory = progressViewModel(input({ offered: [challenge()] }));
    expect(progressWidgetPreview(withHistory, null).nothingYet).toBeNull();
  });

  it('evaluates nothing and marks nothing seen: both arguments are already-read values', () => {
    // The type signature is the whole proof: `progressWidgetPreview` takes a `ProgressViewModel`
    // and a badge string, neither of which gives it a repository, a clock or an evaluator to
    // reach — only `progressRepo.markAllSeen`, called from opening «Прогрес» itself, ever writes.
    expect(progressWidgetPreview.length).toBe(2);
  });
});

describe('what Головний shows beside it', () => {
  it('Scenario: Home/Reports rendering earns nothing, and the financial view model reads none of it', () => {
    // The optional Прогрес widget (customizable-home-dashboard) is wired through its own
    // `progressViewModel`/`progressWidgetPreview` call, entirely separate from `homeViewModel` —
    // which still takes no прогрес-shaped input at all, whether or not the widget is visible.
    // Two claims, and neither can be made by calling a pure function twice — `homeViewModel` is
    // pure, so `toEqual` between two calls over one world would pass whatever this module did.
    //
    // (a) `homeViewModel` takes no прогрес at all. The type is the proof: `HomeInput` has no
    //     field for a досягнення, a виклик or a норма, so no value of this capability can reach
    //     «Усього грошей», «Потребує уваги», те місяць чи те monobank section.
    type HomeInput = Parameters<typeof homeViewModel>[0];
    expect({
      earned: true satisfies Excludes<'earned'>,
      achievements: true satisfies Excludes<'achievements'>,
      progress: true satisfies Excludes<'progress'>,
      challenges: true satisfies Excludes<'challenges'>,
      accepted: true satisfies Excludes<'accepted'>,
      norms: true satisfies Excludes<'norms'>,
    }).toBeTruthy();
    expectTypeSatisfied<HomeInput>();

    // (b) The screen passes it none either: the call site names the same arguments it always
    //     did, with no прогрес-shaped word anywhere in the call.
    const home = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
    const from = home.indexOf('homeViewModel({');
    // The arguments alone, up to the `useMemo` dependency array that closes the call.
    const call = home.slice(from, home.indexOf('    [configured', from));
    expect(call).toContain('month: stored.month');
    for (const word of ['progress', 'earned', 'achievement', 'challenge', 'норм']) {
      expect(call.toLowerCase()).not.toContain(word.toLowerCase());
    }
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

  it('Scenario: A stored future дата is not shown as one', () => {
    // The engine refuses to write one, but a бекап restores `achieved_on` verbatim and an earned
    // row is never re-dated — so the rule is kept again here, where the app opens its mouth.
    const stored = earned({ key: 'ledger.active-months:3', achievedOn: '2026-09-30' });

    const detail = achievementDetail({
      key: 'ledger.active-months:3',
      candidates: [candidate({ key: 'ledger.active-months:3', dating: 'history', earned: true })],
      earned: [stored],
      now: NOW,
    })!;

    expect(detail.when).toBe('досягнуто 2 вересня');
    expect(detail.when).not.toContain('30 вересня');
    // And the stored row is untouched: the record is the record.
    expect(stored.achievedOn).toBe('2026-09-30');

    // The same on the list.
    const model = progressViewModel(input({ earned: [stored] }));
    expect(model.earned[0]!.when).toBe('досягнуто 2 вересня');
  });

  it('leaves a дата in the past exactly as it is', () => {
    const model = progressViewModel(
      input({ earned: [earned({ achievedOn: '2025-04-18' })] }),
    );

    expect(model.earned[0]!.when).toBe('досягнуто 18 квітня 2025');
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

  it('a dismissed виклик`s detail does not read like a freshly proposed one', () => {
    const cushion = challenge();
    const asDismissed = challengeDetail({
      key: cushion.key,
      challenges: [cushion],
      accepted: [],
      dismissed: [cushion],
      now: NOW,
    })!;
    const asProposed = challengeDetail({
      key: cushion.key,
      challenges: [cushion],
      accepted: [],
      dismissed: [],
      now: NOW,
    })!;

    expect(asDismissed.dismissed).toBe(true);
    expect(asProposed.dismissed).toBe(false);
    expect(asDismissed.accepted).toBe(false);
  });

  it('Scenario: A виклик`s detail names its finish', () => {
    const detail = challengeDetail({
      key: 'reserve-cushion:UAH',
      challenges: [challenge()],
      accepted: [],
      dismissed: [],
      now: NOW,
    })!;

    expect(detail.reason).toContain('9\u00A0000,00 UAH');
    expect(detail.progress).toBe('9\u00A0000,00 UAH з 30\u00A0000,00 UAH');
    expect(detail.criterion).toBe('Резерв у UAH — щонайменше одна місячна норма витрат.');
    expect(detail.accepted).toBe(false);
  });
});

describe('where a виклик`s action leads', () => {
  const accounts = [
    { id: 'card', kind: 'spending', archived: false },
    { id: 'old-jar', kind: 'savings', archived: true },
    { id: 'jar', kind: 'savings', archived: false },
    { id: 'broker', kind: 'investment', archived: false },
  ];

  it('opens the entry form as the переказ the виклик names, onto a рахунок of that вид', () => {
    // «Recording a переказ onto a рахунок of вид savings» — not «open the entry form», which
    // lands on a витрата and is not the work the criterion measures.
    expect(
      challengeStart({ kind: 'record-transfer', accountKind: 'savings' }, accounts),
    ).toBe('/transaction/new?type=transfer&to=jar');
    expect(
      challengeStart({ kind: 'record-transfer', accountKind: 'investment' }, accounts),
    ).toBe('/transaction/new?type=transfer&to=broker');
  });

  it('passes over an archived рахунок of that вид', () => {
    expect(
      challengeStart({ kind: 'record-transfer', accountKind: 'savings' }, [accounts[1]!, accounts[2]!]),
    ).toBe('/transaction/new?type=transfer&to=jar');
  });

  it('still opens the form as a переказ when there is no рахунок of that вид yet', () => {
    expect(challengeStart({ kind: 'record-transfer', accountKind: 'savings' }, [accounts[0]!])).toBe(
      '/transaction/new?type=transfer',
    );
  });

  it('opens the місяць «Закрий <місяць>» is about, the ціль, and the категорія`s місяць', () => {
    expect(challengeStart({ kind: 'answer-month', month: '2026-08' }, accounts)).toBe(
      '/transactions?month=2026-08',
    );
    expect(challengeStart({ kind: 'open-goal', goalId: 'auto' }, accounts)).toBe('/goal/auto');
    expect(
      challengeStart({ kind: 'open-category-month', categoryId: 'food', month: '2026-07' }, accounts),
    ).toBe('/category/2026-07/food');
  });

  it('leads nowhere for the норма, which is asked on the виклик`s own screen', () => {
    expect(challengeStart({ kind: 'confirm-norm', currency: 'UAH' }, accounts)).toBeNull();
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
