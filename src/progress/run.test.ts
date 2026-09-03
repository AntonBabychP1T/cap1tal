import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { account, computeBalance, type Account } from '../domain/account';
import { money } from '../domain/money';
import { monthlyPicture } from '../domain/monthly-picture';
import {
  expenseByDefault,
  transfer,
  type IsoDate,
  type Transaction,
} from '../domain/transaction';
import type { EarnedAchievement, SpendingNorms } from './earned';
import {
  firstTransferOntoKindOfFixture,
  nthTransactionDateOfFixture,
  ownerShapedSummary,
} from './fixtures';
import { runEvaluation, type RunPorts } from './run';
import { EMPTY_SUMMARY, type ProgressSummary } from './summary';

const TODAY: IsoDate = '2026-09-30';
const NOW_MS = Date.parse('2026-09-30T09:00:00.000Z');

/**
 * A device: what storage would hand `run`, and what `run` writes back. Counting the readings is
 * how «Opening Головний repeatedly evaluates once» is proved — the evaluation is a call, and a
 * call that did not happen read nothing.
 */
function device(summary: ProgressSummary = EMPTY_SUMMARY) {
  const stored = new Map<string, EarnedAchievement>();
  let reads = 0;
  let norms: SpendingNorms = new Map();
  let current = summary;

  const ports: RunPorts = {
    readProgressSummary: () => {
      reads += 1;
      return current;
    },
    nthTransactionDate: nthTransactionDateOfFixture,
    firstTransferOntoKind: firstTransferOntoKindOfFixture,
    goals: () => [],
    norms: () => norms,
    earnedKeys: () => new Set(stored.keys()),
    earn: (achievement) => {
      // Insert-if-absent, exactly as storage does it: the first row written is the one that stays.
      if (!stored.has(achievement.key)) {
        stored.set(achievement.key, achievement);
      }
    },
    exactGoalProgress: () => null,
    today: () => TODAY,
    nowMs: () => NOW_MS,
  };

  return {
    ports,
    stored,
    reads: () => reads,
    setSummary: (next: ProgressSummary) => {
      current = next;
    },
    setNorms: (next: SpendingNorms) => {
      norms = next;
    },
  };
}

const owner = () => ownerShapedSummary();

describe('when the evaluation runs', () => {
  it('Scenario: Recording a транзакція evaluates', () => {
    const phone = device({
      ...EMPTY_SUMMARY,
      history: { count: 99, earliest: '2024-10-01', latest: '2026-09-01' },
    });
    expect(runEvaluation(phone.ports).map((one) => one.key)).not.toContain(
      'ledger.transactions:100',
    );

    // The 100th транзакція is stored, and the call that follows the store earns it.
    phone.setSummary({
      ...EMPTY_SUMMARY,
      history: { count: 100, earliest: '2024-10-01', latest: '2026-09-01' },
    });

    expect(runEvaluation(phone.ports).map((one) => one.key)).toContain('ledger.transactions:100');
  });

  it('Scenario: Opening Головний repeatedly evaluates once', () => {
    const phone = device(owner());
    runEvaluation(phone.ports);
    const afterStart = phone.reads();

    // Four openings of Головний. Nothing calls `run`, so nothing reads and nothing is earned.
    const earnedAtStart = new Set(phone.stored.keys());
    expect(phone.reads()).toBe(afterStart);
    expect(new Set(phone.stored.keys())).toEqual(earnedAtStart);
    expect(afterStart).toBe(1);
  });

  it('Scenario: A Saldo імпорт earns what it brought', () => {
    const phone = device({
      ...EMPTY_SUMMARY,
      history: { count: 40, earliest: '2026-08-01', latest: '2026-08-30' },
    });
    runEvaluation(phone.ports);
    expect([...phone.stored.keys()]).not.toContain('ledger.transactions:2000');

    // The імпорт commits two years of history; the evaluation that follows earns what it proves.
    phone.setSummary(owner());
    const newly = runEvaluation(phone.ports);

    expect(newly.map((one) => one.key)).toEqual(
      expect.arrayContaining([
        'ledger.transactions:100',
        'ledger.transactions:2000',
        'ledger.active-months:18',
        'ledger.history-span',
      ]),
    );
    // Each dated from the history the імпорт brought, not from the day of the імпорт.
    expect(newly.find((one) => one.key === 'ledger.transactions:2000')?.achievedOn).toBe(
      nthTransactionDateOfFixture(2000),
    );
  });

  it('Scenario: A відновлення earns what the бекап holds', () => {
    // The бекап brought its own earned set; the device holds nothing else.
    const phone = device(owner());
    phone.stored.set('ledger.first-transaction', {
      key: 'ledger.first-transaction',
      template: 'ledger.first-transaction',
      achievedOn: '2024-10-01',
      recordedAtMs: 1,
      seenAtMs: 2,
      evidence: { kind: 'count', count: 1 },
    });

    const newly = runEvaluation(phone.ports);

    // What the бекап carried is untouched, moment and seen state included.
    expect(phone.stored.get('ledger.first-transaction')?.recordedAtMs).toBe(1);
    expect(phone.stored.get('ledger.first-transaction')?.seenAtMs).toBe(2);
    // And what the restored history still proves is earned on top of it.
    expect(newly.map((one) => one.key)).toContain('ledger.transactions:2000');
    expect(newly.map((one) => one.key)).not.toContain('ledger.first-transaction');
  });

  it('Scenario: A closed app with working import loses nothing', () => {
    // Six weeks in which the owner never opened the app while sync and чернетки kept the record
    // complete. The зведення is what it is; nothing about a run of місяці was broken by absence.
    const phone = device(owner());

    const newly = runEvaluation(phone.ports);

    expect(newly.map((one) => one.key)).toEqual(
      expect.arrayContaining([
        'quality.clean-month',
        'quality.clean-months-streak:3',
        'quality.clean-months-streak:6',
      ]),
    );
  });

  it('re-running at a moment where nothing changed writes nothing', () => {
    const phone = device(owner());
    const first = runEvaluation(phone.ports);
    const held = new Map(phone.stored);

    expect(runEvaluation(phone.ports)).toEqual([]);
    expect(phone.stored).toEqual(held);
    expect(first.length).toBeGreaterThan(0);
  });

  it('earns the норма milestones at the moment the норма is confirmed', () => {
    const phone = device(owner());
    runEvaluation(phone.ports);
    expect([...phone.stored.keys()].some((key) => key.startsWith('reserve.norm'))).toBe(false);

    phone.setNorms(new Map([['UAH', { amount: money(3_000_000, 'UAH'), confirmedAtMs: 0 }]]));
    const newly = runEvaluation(phone.ports);

    expect(newly.map((one) => one.key)).toEqual(
      expect.arrayContaining(['reserve.norm:25:UAH', 'reserve.norm:50:UAH', 'reserve.norm:100:UAH']),
    );
  });
});

describe('the boundaries the evaluation keeps', () => {
  it('Scenario: An earned досягнення moves no money', () => {
    const card = account({
      id: 'card',
      name: 'картка',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(500_000, 'UAH'),
    });
    const jar = account({ id: 'jar', name: 'банка', kind: 'savings', currency: 'UAH' });
    const accounts: Account[] = [card, jar];
    const transactions: Transaction[] = [
      expenseByDefault({
        id: 'e1',
        date: '2026-08-03',
        accountId: 'card',
        amount: money(120_000, 'UAH'),
        categoryId: 'food',
      }),
      transfer({
        id: 't1',
        date: '2026-08-10',
        fromAccountId: 'card',
        toAccountId: 'jar',
        left: money(200_000, 'UAH'),
        arrived: money(200_000, 'UAH'),
      }),
    ];

    const balancesBefore = accounts.map((one) => computeBalance(one, transactions));
    const pictureBefore = monthlyPicture({ month: '2026-08', accounts, transactions });

    const phone = device(owner());
    const newly = runEvaluation(phone.ports);
    expect(newly.length).toBeGreaterThanOrEqual(12);

    // Nothing the engine did touched a рахунок, a транзакція or a місячна картина: the numbers are
    // computed from the same values, and they are the same values.
    expect(accounts.map((one) => computeBalance(one, transactions))).toEqual(balancesBefore);
    expect(monthlyPicture({ month: '2026-08', accounts, transactions })).toEqual(pictureBefore);
    expect(transactions).toHaveLength(2);
  });

  it('Scenario: Nothing is pushed to the phone', () => {
    // The module imports no notification port, so there is no code path by which earning a
    // досягнення could post anything to the phone's notification shade.
    const here = new URL('.', import.meta.url).pathname;
    for (const name of readdirSync(here).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    )) {
      const source = readFileSync(join(here, name), 'utf8');
      expect(source).not.toMatch(/local-notifications|notification-access|notification-capture/);
      expect(source).not.toMatch(/scheduleNotification|presentNotification/);
    }
  });

  it('no view model under `src/ui/` imports the runner', () => {
    // «Drawing a screen SHALL NOT evaluate»: a view model that could reach `run` would be one
    // render away from earning something, so none of them can.
    const ui = new URL('../ui/', import.meta.url).pathname;
    for (const name of readdirSync(ui).filter(
      (file) => file.endsWith('.ts') && !file.endsWith('.test.ts'),
    )) {
      const source = readFileSync(join(ui, name), 'utf8');
      expect(source).not.toMatch(/from '.*progress\/run'/);
      expect(source).not.toMatch(/progress-ports/);
    }
  });
});
