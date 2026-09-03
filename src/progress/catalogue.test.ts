import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { AccumulationGoal } from '../domain/goals';
import { money } from '../domain/money';
import type { IsoDate, Month } from '../domain/transaction';
import { candidates, plural, type Candidate, type CatalogueInput } from './catalogue';
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
    history: { count: 0 },
    drafts: [],
    ...over,
  };
}

function input(over: Partial<CatalogueInput> = {}): CatalogueInput {
  return {
    summary: summary(),
    today: TODAY,
    nthTransactionDate: () => undefined,
    goals: [],
    norms: new Map(),
    firstTransferOntoKind: () => undefined,
    ...over,
  };
}

const earnedKeys = (list: Candidate[]) => list.filter((one) => one.earned).map((one) => one.key);
const byKey = (list: Candidate[], key: string) => list.find((one) => one.key === key)!;

describe('the облік досягнення', () => {
  it('Scenario: The count tiers are crossed in order', () => {
    const dates: Record<number, IsoDate> = {
      100: '2024-12-03',
      500: '2025-04-18',
      1000: '2025-11-20',
    };
    const at = (count: number) =>
      candidates(
        input({
          summary: summary({ history: { count, earliest: '2024-10-05', latest: '2026-09-01' } }),
          nthTransactionDate: (n) => (n <= count ? dates[n] : undefined),
        }),
      );

    expect(earnedKeys(at(100))).toContain('ledger.transactions:100');
    expect(earnedKeys(at(100))).not.toContain('ledger.transactions:500');
    expect(earnedKeys(at(500))).toEqual(
      expect.arrayContaining(['ledger.transactions:100', 'ledger.transactions:500']),
    );
    expect(earnedKeys(at(1000))).toEqual(
      expect.arrayContaining([
        'ledger.transactions:100',
        'ledger.transactions:500',
        'ledger.transactions:1000',
      ]),
    );
    expect(earnedKeys(at(1000))).not.toContain('ledger.transactions:2000');

    // Each dated at its own Nth транзакція, not at the day the app looked.
    expect(byKey(at(1000), 'ledger.transactions:100').achievedOn).toBe('2024-12-03');
    expect(byKey(at(1000), 'ledger.transactions:500').achievedOn).toBe('2025-04-18');
    expect(byKey(at(1000), 'ledger.transactions:1000').achievedOn).toBe('2025-11-20');
  });

  it('names its tiers in Ukrainian, and states a condition the owner can check', () => {
    const list = candidates(input({ summary: summary({ history: { count: 600 } }) }));

    expect(byKey(list, 'ledger.transactions:100').name).toBe('100 транзакцій');
    expect(byKey(list, 'ledger.transactions:500').condition).toContain('500 транзакцій');
    expect(byKey(list, 'ledger.first-transaction').name).toBe('Перша транзакція');
  });

  it('asks for no дата for a tier the history has not reached', () => {
    const asked: number[] = [];
    candidates(
      input({
        summary: summary({ history: { count: 150 } }),
        nthTransactionDate: (n) => {
          asked.push(n);
          return '2024-12-03';
        },
      }),
    );

    expect(asked).toEqual([100]);
  });

  it('Scenario: Активні місяці need not be consecutive', () => {
    const gapped = summary({
      months: [
        monthRow('2025-01'),
        monthRow('2025-02'),
        monthRow('2025-03'),
        monthRow('2025-06'),
        monthRow('2025-07'),
        monthRow('2025-08'),
      ],
      history: { count: 6, earliest: '2025-01-05', latest: '2025-08-20' },
    });

    const list = candidates(input({ summary: gapped }));

    expect(earnedKeys(list)).toEqual(
      expect.arrayContaining(['ledger.active-months:3', 'ledger.active-months:6']),
    );
    expect(earnedKeys(list)).not.toContain('ledger.active-months:12');
    // Dated at the end of the sixth активний місяць.
    expect(byKey(list, 'ledger.active-months:6').achievedOn).toBe('2025-08-31');
    expect(byKey(list, 'ledger.active-months:6').name).toBe('6 активних місяців');
    expect(byKey(list, 'ledger.active-months:3').name).toBe('3 активні місяці');
  });

  it('Scenario: A gapped year still spans a year', () => {
    const gapped = summary({
      months: [monthRow('2024-10'), monthRow('2025-11')],
      history: { count: 300, earliest: '2024-10-05', latest: '2025-11-02' },
    });

    const list = candidates(input({ summary: gapped }));

    expect(earnedKeys(list)).toContain('ledger.history-span');
    expect(earnedKeys(list)).not.toContain('ledger.active-months:12');
    // Dated at the транзакція that carried the span over a year.
    expect(byKey(list, 'ledger.history-span').achievedOn).toBe('2025-11-02');
    expect(byKey(list, 'ledger.history-span').name).toBe('Рік історії');
    expect(byKey(list, 'ledger.history-span').condition).not.toMatch(/відкрив|застосунок/);
  });
});

describe('the якість досягнення', () => {
  it('Scenario: Three consecutive чисті місяці earn the run', () => {
    const run = summary({
      months: [monthRow('2026-04'), monthRow('2026-05'), monthRow('2026-06')],
      history: { count: 3, earliest: '2026-04-01', latest: '2026-06-30' },
    });

    const list = candidates(input({ summary: run }));

    expect(earnedKeys(list)).toEqual(
      expect.arrayContaining(['quality.clean-month', 'quality.clean-months-streak:3']),
    );
    expect(byKey(list, 'quality.clean-months-streak:3').achievedOn).toBe('2026-06-30');
    expect(byKey(list, 'quality.clean-months-streak:3').name).toBe('3 чисті місяці поспіль');
    expect(byKey(list, 'quality.clean-months-streak:3').evidence).toEqual({
      kind: 'months',
      months: 3,
      from: '2026-04',
      to: '2026-06',
    });
    expect(earnedKeys(list)).not.toContain('quality.clean-months-streak:6');
  });

  it('Scenario: An empty місяць breaks the run', () => {
    const broken = summary({
      months: [monthRow('2026-03'), monthRow('2026-04'), monthRow('2026-06'), monthRow('2026-07')],
      history: { count: 4, earliest: '2026-03-01', latest: '2026-07-31' },
    });

    const list = candidates(input({ summary: broken }));

    expect(earnedKeys(list)).toContain('quality.clean-month');
    expect(earnedKeys(list)).not.toContain('quality.clean-months-streak:3');
    expect(byKey(list, 'quality.clean-months-streak:3').progress).toEqual({
      reached: 2,
      target: 3,
    });
  });

  it('Scenario: One «Без категорії» is enough to spoil a місяць', () => {
    const spoiled = summary({
      months: [monthRow('2026-05', { transactions: 180, uncategorised: 1 })],
      history: { count: 180, earliest: '2026-05-01', latest: '2026-05-31' },
    });

    expect(earnedKeys(candidates(input({ summary: spoiled })))).not.toContain(
      'quality.clean-month',
    );
  });

  it('a чистий місяць has no progress to show, so it is never listed «У процесі»', () => {
    const list = candidates(input());

    expect(byKey(list, 'quality.clean-month').progress).toBeUndefined();
    expect(byKey(list, 'ledger.first-transaction').progress).toBeUndefined();
  });
});

describe('what the catalogue refuses to reward', () => {
  it('Scenario: A month of heavy spending earns nothing', () => {
    const frugal = summary({
      months: [monthRow('2026-06', { spent: 2_000_000 }), monthRow('2026-07', { spent: 500_000 })],
      history: { count: 2, earliest: '2026-06-01', latest: '2026-07-31' },
    });
    const lavish = summary({
      months: [monthRow('2026-06', { spent: 2_000_000 }), monthRow('2026-07', { spent: 8_000_000 })],
      history: { count: 2, earliest: '2026-06-01', latest: '2026-07-31' },
    });

    // Four times the previous місяць's витрачено changes nothing about what is earned.
    expect(earnedKeys(candidates(input({ summary: lavish })))).toEqual(
      earnedKeys(candidates(input({ summary: frugal }))),
    );
  });

  it('names no досягнення about a витрата, a покупка, a категорія or a картка', () => {
    for (const one of candidates(input())) {
      expect(`${one.name} ${one.condition}`).not.toMatch(/покуп|картк|витратил|кредит/i);
    }
  });
});

describe('Ukrainian counts', () => {
  it('picks the form the number takes', () => {
    expect(plural(1, 'місяць', 'місяці', 'місяців')).toBe('місяць');
    expect(plural(2, 'місяць', 'місяці', 'місяців')).toBe('місяці');
    expect(plural(3, 'місяць', 'місяці', 'місяців')).toBe('місяці');
    expect(plural(5, 'місяць', 'місяці', 'місяців')).toBe('місяців');
    expect(plural(11, 'місяць', 'місяці', 'місяців')).toBe('місяців');
    expect(plural(12, 'місяць', 'місяці', 'місяців')).toBe('місяців');
    expect(plural(18, 'місяць', 'місяці', 'місяців')).toBe('місяців');
    expect(plural(21, 'місяць', 'місяці', 'місяців')).toBe('місяць');
    expect(plural(100, 'транзакція', 'транзакції', 'транзакцій')).toBe('транзакцій');
  });
});

describe('the ціль-накопичення досягнення', () => {
  const goal = (over: Partial<AccumulationGoal> = {}): AccumulationGoal => ({
    id: 'g1',
    name: 'Авто',
    target: money(1_000_000, 'UAH'),
    accountIds: ['jar'],
    ...over,
  });

  it('Scenario: A ціль at 60 % earns two quarters at once', () => {
    const list = candidates(
      input({ goals: [{ goal: goal(), progress: money(600_000, 'UAH') }] }),
    );

    expect(earnedKeys(list)).toEqual(
      expect.arrayContaining(['goal.progress:g1:25', 'goal.progress:g1:50']),
    );
    expect(earnedKeys(list)).not.toContain('goal.progress:g1:75');
    expect(byKey(list, 'goal.progress:g1:50').name).toBe('Ціль «Авто» — 50 %');
  });

  it('Scenario: Each ціль earns its own', () => {
    const list = candidates(
      input({
        goals: [
          { goal: goal(), progress: money(300_000, 'UAH') },
          {
            goal: goal({ id: 'g2', name: 'Ноутбук', target: money(80_000, 'UAH') }),
            progress: money(30_000, 'UAH'),
          },
        ],
      }),
    );

    expect(earnedKeys(list)).toEqual(
      expect.arrayContaining(['goal.progress:g1:25', 'goal.progress:g2:25']),
    );
    expect(byKey(list, 'goal.progress:g2:25').evidence).toEqual({
      kind: 'goal',
      goalId: 'g2',
      name: 'Ноутбук',
    });
  });

  it('Scenario: No досягнення at five per cent', () => {
    const at = (amount: number) =>
      earnedKeys(candidates(input({ goals: [{ goal: goal(), progress: money(amount, 'UAH') }] })));

    const quarter = at(250_000);
    for (const amount of [300_000, 350_000, 400_000]) {
      expect(at(amount)).toEqual(quarter);
    }
    expect(at(500_000)).toContain('goal.progress:g1:50');
  });

  it('Scenario: A ціль reached after its дата is not reached in time', () => {
    const late = candidates(
      input({
        today: '2026-07-04',
        goals: [
          { goal: goal({ deadline: '2026-06-30' }), progress: money(1_000_000, 'UAH') },
        ],
      }),
    );

    expect(earnedKeys(late)).toContain('goal.reached:g1');
    expect(earnedKeys(late)).not.toContain('goal.reached-in-time:g1');

    const onTime = candidates(
      input({
        today: '2026-06-30',
        goals: [
          { goal: goal({ deadline: '2026-06-30' }), progress: money(1_000_000, 'UAH') },
        ],
      }),
    );
    expect(earnedKeys(onTime)).toContain('goal.reached-in-time:g1');
  });

  it('Scenario: A ціль with no дата is never reached in time', () => {
    const list = candidates(
      input({ goals: [{ goal: goal(), progress: money(1_000_000, 'UAH') }] }),
    );

    expect(earnedKeys(list)).toContain('goal.reached:g1');
    // Not merely unearned — not listed at all, so «У процесі» cannot show it at 0 %.
    expect(list.some((one) => one.key === 'goal.reached-in-time:g1')).toBe(false);
  });

  it('Scenario: A приблизний progress earns nothing', () => {
    const approximate = candidates(input({ goals: [{ goal: goal(), progress: null }] }));

    expect(approximate.filter((one) => one.template.startsWith('goal.progress'))).toEqual([]);
    expect(earnedKeys(approximate)).not.toContain('goal.reached:g1');
    // The ціль still exists, so «Перша ціль-накопичення» is earned by its existence alone.
    expect(earnedKeys(approximate)).toContain('goal.first');
  });

  it('Scenario: An unknown progress earns nothing and unearns nothing', () => {
    // The catalogue never says «unearn»: an unknown progress simply produces no candidate, and
    // `evaluate` only ever adds. What is already stored is untouched by this list being shorter.
    const unknown = candidates(input({ goals: [{ goal: goal(), progress: null }] }));

    expect(unknown.every((one) => one.template !== 'goal.reached')).toBe(true);
  });

  it('Scenario: A ліміт earns no ціль досягнення', () => {
    // A ліміт is a ціль витрат and never reaches this list: `run.ts` hands over
    // цілі-накопичення only, and the зведення's limited-категорія rows are for a виклик.
    const withLimit = candidates(
      input({
        goals: [],
        summary: summary({
          limitedCategories: [
            { month: '2026-05', currency: 'UAH', categoryId: 'food', spent: 800_000 },
          ],
        }),
      }),
    );

    expect(earnedKeys(withLimit)).not.toContain('goal.first');
  });

  it('Scenario: A ціль reached on a вартість is reached', () => {
    // The progress arrives already resolved; whether a поточна вартість carried it there is the
    // goals capability's business, and a досягнення that disagreed with the ціль screen would be
    // the app contradicting itself.
    const list = candidates(
      input({ goals: [{ goal: goal(), progress: money(1_200_000, 'UAH') }] }),
    );

    expect(earnedKeys(list)).toContain('goal.reached:g1');
    expect(earnedKeys(list).some((key) => key.startsWith('invest.'))).toBe(false);
  });

  it('dates every ціль досягнення by the day it was recorded, never by the history', () => {
    for (const one of candidates(
      input({ goals: [{ goal: goal(), progress: money(1_000_000, 'UAH') }] }),
    ).filter((c) => c.group === 'goal')) {
      expect(one.dating).toBe('recorded');
      expect(one.achievedOn).toBeUndefined();
    }
  });

  it('knows nothing of рахунки: `src/progress/` imports nothing from `src/ui/`', () => {
    const modules = readdirSync(new URL('.', import.meta.url))
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));

    expect(modules.length).toBeGreaterThan(0);
    for (const name of modules) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]!);
      expect(imports.filter((one) => one.includes('/ui/'))).toEqual([]);
      expect(imports.filter((one) => one.includes('/db/'))).toEqual([]);
    }
  });
});

describe('the резерв and інвестиційні досягнення', () => {
  const norms = (over: Record<string, number>) =>
    new Map(
      Object.entries(over).map(([currency, amount]) => [
        currency,
        { amount: money(amount, currency), confirmedAtMs: 0 },
      ]),
    );

  const held = (kind: 'savings' | 'investment', currency: string, balance: number) => ({
    kind,
    currency,
    balance,
  });

  it('Scenario: Without a confirmed норма the milestones do not exist', () => {
    const list = candidates(
      input({ summary: summary({ balances: [held('savings', 'UAH', 4_000_000)] }) }),
    );

    // Not unearned — absent. Nothing is shown waiting, locked or greyed.
    expect(list.filter((one) => one.template === 'reserve.norm')).toEqual([]);
    expect(list.filter((one) => one.template === 'invest.norm-months')).toEqual([]);
  });

  it('Scenario: A confirmed норма earns what the резерв already covers', () => {
    const list = candidates(
      input({
        summary: summary({ balances: [held('savings', 'UAH', 4_000_000)] }),
        norms: norms({ UAH: 3_000_000 }),
      }),
    );

    expect(earnedKeys(list)).toEqual(
      expect.arrayContaining([
        'reserve.norm:25:UAH',
        'reserve.norm:50:UAH',
        'reserve.norm:100:UAH',
      ]),
    );
    expect(byKey(list, 'reserve.norm:100:UAH').evidence).toEqual({
      kind: 'money',
      money: money(4_000_000, 'UAH'),
    });
    expect(byKey(list, 'reserve.norm:100:UAH').name).toBe('Місяць витрат у резерві (UAH)');
  });

  it('Scenario: Перше відкладення needs no норма', () => {
    const list = candidates(
      input({ firstTransferOntoKind: (kind) => (kind === 'savings' ? '2025-03-02' : undefined) }),
    );

    expect(earnedKeys(list)).toContain('reserve.first');
    expect(byKey(list, 'reserve.first').achievedOn).toBe('2025-03-02');
    expect(byKey(list, 'reserve.first').evidence).toEqual({ kind: 'month', month: '2025-03' });
    expect(earnedKeys(list)).not.toContain('invest.first');
  });

  it('Scenario: Two currencies earn two досягнення', () => {
    const list = candidates(
      input({
        summary: summary({
          balances: [held('savings', 'UAH', 4_000_000), held('savings', 'USD', 50_000)],
        }),
        norms: norms({ UAH: 3_000_000, USD: 40_000 }),
      }),
    );

    expect(earnedKeys(list)).toEqual(
      expect.arrayContaining(['reserve.norm:100:UAH', 'reserve.norm:100:USD']),
    );
    expect(byKey(list, 'reserve.norm:100:USD').evidence).toEqual({
      kind: 'money',
      money: money(50_000, 'USD'),
    });
  });

  it('Scenario: Currencies are never added together to reach a milestone', () => {
    const list = candidates(
      input({
        summary: summary({
          balances: [held('savings', 'UAH', 1_800_000), held('savings', 'USD', 24_000)],
        }),
        norms: norms({ UAH: 3_000_000, USD: 40_000 }),
      }),
    );

    // 60 % of each норма: enough for the halves, and for no «місяць витрат» in either currency,
    // whatever a курс would say about the two together.
    expect(earnedKeys(list)).toEqual(
      expect.arrayContaining(['reserve.norm:50:UAH', 'reserve.norm:50:USD']),
    );
    expect(earnedKeys(list)).not.toContain('reserve.norm:100:UAH');
    expect(earnedKeys(list)).not.toContain('reserve.norm:100:USD');
  });

  it('Scenario: Contribution months count across currencies without summing money', () => {
    const three = summary({
      months: [
        monthRow('2026-01', { invested: 500_000 }),
        monthRow('2026-02', { currency: 'USD', invested: 10_000 }),
        monthRow('2026-03', { currency: 'USD', invested: 10_000 }),
      ],
      history: { count: 3, earliest: '2026-01-05', latest: '2026-03-05' },
    });

    const list = candidates(input({ summary: three }));

    expect(earnedKeys(list)).toContain('invest.months:3');
    expect(byKey(list, 'invest.months:3').name).toBe('Внески у 3 місяцях');
    expect(byKey(list, 'invest.months:3').achievedOn).toBe('2026-03-31');
    // The свідчення counts місяці, and holds no сума of the two currencies.
    expect(byKey(list, 'invest.months:3').evidence).toEqual({
      kind: 'months',
      months: 3,
      from: '2026-01',
      to: '2026-03',
    });
  });

  it('Scenario: A gain earns nothing', () => {
    // The інвестиційний капітал is the розрахунковий баланс — what the owner put in. A поточна
    // вартість is nowhere in this input, so a market that rose 40 % changes nothing here.
    const contributed = summary({ balances: [held('investment', 'UAH', 12_000_000)] });
    const list = candidates(input({ summary: contributed, norms: norms({ UAH: 3_000_000 }) }));

    expect(earnedKeys(list)).toEqual(
      expect.arrayContaining(['invest.norm-months:1:UAH', 'invest.norm-months:3:UAH']),
    );
    expect(earnedKeys(list)).not.toContain('invest.norm-months:6:UAH');
    // Nothing anywhere in the catalogue asks about a вартість, a прибуток or a збиток.
    const source = readFileSync(new URL('./catalogue.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(source).not.toMatch(/currentValue|вартіст|прибут|збит/i);
  });

  it('names the інвестиційні milestones in Ukrainian, per currency', () => {
    const list = candidates(input({ norms: norms({ UAH: 3_000_000 }) }));

    expect(byKey(list, 'invest.norm-months:1:UAH').name).toBe(
      'Інвестовано на 1 місяць витрат (UAH)',
    );
    expect(byKey(list, 'invest.norm-months:3:UAH').name).toBe(
      'Інвестовано на 3 місяці витрат (UAH)',
    );
    expect(byKey(list, 'invest.norm-months:12:UAH').name).toBe(
      'Інвестовано на 12 місяців витрат (UAH)',
    );
  });

  it('every key is distinct, so no two досягнення can collide in storage', () => {
    const list = candidates(
      input({
        summary: summary({
          months: [monthRow('2026-01', { invested: 1 })],
          balances: [held('savings', 'UAH', 1), held('investment', 'UAH', 1)],
          history: { count: 1, earliest: '2026-01-05', latest: '2026-01-05' },
        }),
        norms: norms({ UAH: 3_000_000, USD: 40_000 }),
        goals: [
          {
            goal: {
              id: 'g1',
              name: 'Авто',
              target: money(1_000_000, 'UAH'),
              deadline: '2026-12-31',
              accountIds: ['jar'],
            },
            progress: money(1, 'UAH'),
          },
        ],
        firstTransferOntoKind: () => '2026-01-05',
      }),
    );

    expect(new Set(list.map((one) => one.key)).size).toBe(list.length);
  });
});
