import { describe, expect, it } from 'vitest';

import type { AccumulationGoal } from '../domain/goals';
import { money } from '../domain/money';
import type { MonobankRate } from '../monobank/currency';
import {
  accumulationReadout,
  goalProgress,
  percentageOf,
  spendingReadout,
  type Contribution,
} from './goal-progress';

const usdRate: MonobankRate = { currency: 'USD', rateMillionths: 41_250_000 };

const machine: AccumulationGoal = {
  id: 'g-machine',
  name: 'Машина',
  target: money(70000000, 'UAH'),
  deadline: '2027-06-30',
  accountIds: ['jar', 'usd'],
};

const gave = (accountId: string, amount: number, currency: string): Contribution => ({
  accountId,
  amount: money(amount, currency),
});

describe('goalProgress', () => {
  it('Scenario: A single-currency progress is exact', () => {
    const progress = goalProgress({
      currency: 'UAH',
      contributions: [gave('a', 15000000, 'UAH'), gave('b', 4000000, 'UAH'), gave('c', 1000000, 'UAH')],
      rates: [],
    });

    expect(progress).toMatchObject({ kind: 'exact', total: money(20000000, 'UAH') });
  });

  it('Scenario: A foreign внесок makes the progress approximate', () => {
    const progress = goalProgress({
      currency: 'UAH',
      contributions: [gave('jar', 15000000, 'UAH'), gave('usd', 300000, 'USD')],
      rates: [usdRate],
    });

    expect(progress.kind).toBe('approximate');
    expect(progress.kind !== 'unknown' && progress.total).toEqual(money(27375000, 'UAH'));
    expect(progress.parts[1]).toEqual({
      accountId: 'usd',
      own: money(300000, 'USD'),
      inGoalCurrency: money(12375000, 'UAH'),
      converted: true,
    });
  });

  it('Scenario: The USD рахунок’s own баланс is untouched', () => {
    const progress = goalProgress({
      currency: 'UAH',
      contributions: [gave('jar', 15000000, 'UAH'), gave('usd', 300000, 'USD')],
      rates: [usdRate],
    });

    // The native сума is the truth; the conversion is the second line beside it, never a
    // replacement, and nothing here writes anything anywhere.
    expect(progress.parts[1]?.own).toEqual(money(300000, 'USD'));
    expect(progress.parts[0]?.own).toEqual(money(15000000, 'UAH'));
    expect(progress.parts[0]?.converted).toBe(false);
  });

  it('Scenario: A foreign інвестиційний рахунок converts its вартість, not its баланс', () => {
    // `contribution` already chose the вартість over the баланс; what arrives here is that сума in
    // the рахунок's own currency, and it is that сума which is converted.
    const progress = goalProgress({
      currency: 'UAH',
      contributions: [gave('ibkr', 500000, 'USD')],
      rates: [usdRate],
    });

    expect(progress.kind !== 'unknown' && progress.total).toEqual(money(20625000, 'UAH'));
    // The баланс of 400000 USD would have converted to 16 500 000 — the number that must not appear.
    expect(progress.kind !== 'unknown' && progress.total).not.toEqual(money(16500000, 'UAH'));
  });

  it('Scenario: An unknown rate leaves the ціль without a progress', () => {
    const progress = goalProgress({
      currency: 'UAH',
      contributions: [gave('jar', 15000000, 'UAH'), gave('eur', 200000, 'EUR')],
      rates: [usdRate],
    });

    expect(progress.kind).toBe('unknown');
    expect(progress.kind === 'unknown' && progress.missingCurrencies).toEqual(['EUR']);
  });

  it('Scenario: The known внески are still readable', () => {
    const progress = goalProgress({
      currency: 'UAH',
      contributions: [gave('jar', 15000000, 'UAH'), gave('eur', 200000, 'EUR')],
      rates: [],
    });

    expect(progress.parts).toEqual([
      {
        accountId: 'jar',
        own: money(15000000, 'UAH'),
        inGoalCurrency: money(15000000, 'UAH'),
        converted: false,
      },
      { accountId: 'eur', own: money(200000, 'EUR'), inGoalCurrency: null, converted: false },
    ]);
  });

  it('Scenario: A missing rate never becomes a zero', () => {
    const progress = goalProgress({
      currency: 'UAH',
      contributions: [gave('jar', 15000000, 'UAH'), gave('eur', 200000, 'EUR')],
      rates: [],
    });

    // No total at all — and in particular not the sum of the readable внески, which would be the
    // ціль's progress with EUR silently counted as nothing.
    expect('total' in progress).toBe(false);
  });

  it('Scenario: Two рахунки of one foreign currency are each rounded', () => {
    const progress = goalProgress({
      currency: 'UAH',
      contributions: [gave('u1', 1, 'USD'), gave('u2', 1, 'USD')],
      rates: [{ currency: 'USD', rateMillionths: 41_253_450 }],
    });

    // Each внесок rounds to 41, so the листед внески add up to the 82 shown above them — a single
    // conversion of 2 minor units USD would have given 83.
    expect(progress.parts.map((part) => part.inGoalCurrency)).toEqual([
      money(41, 'UAH'),
      money(41, 'UAH'),
    ]);
    expect(progress.kind !== 'unknown' && progress.total).toEqual(money(82, 'UAH'));
  });

  it('Scenario: A progress too large to hold exactly is absent, and names no currency', () => {
    const progress = goalProgress({
      currency: 'UAH',
      contributions: [
        gave('a', Number.MAX_SAFE_INTEGER, 'UAH'),
        gave('b', Number.MAX_SAFE_INTEGER, 'UAH'),
      ],
      rates: [],
    });

    expect(progress.kind).toBe('unknown');
    // Every внесок was readable; it is their sum that is not, so no currency is to blame.
    expect(progress.kind === 'unknown' && progress.missingCurrencies).toEqual([]);
  });
});

describe('percentageOf', () => {
  it('floors, and never reaches 100 before the whole is reached', () => {
    expect(percentageOf(69999999, 70000000)).toBe(99);
    expect(percentageOf(70000000, 70000000)).toBe(100);
    expect(percentageOf(-50000, 70000000)).toBe(0);
    expect(percentageOf(0, 70000000)).toBe(0);
  });
});

describe('accumulationReadout', () => {
  const exact = (amount: number) =>
    goalProgress({ currency: 'UAH', contributions: [gave('jar', amount, 'UAH')], rates: [] });

  it('Scenario: A ціль under way reads its three numbers', () => {
    const readout = accumulationReadout(machine, exact(48730000));

    expect(readout.progress).toBe('487 300,00 UAH');
    expect(readout.target).toBe('700 000,00 UAH');
    expect(readout.percentage).toBe(69);
    expect(readout.leftToAccumulate).toBe('212 700,00 UAH');
    expect(readout.reached).toBe(false);
    expect(readout.approximate).toBe(false);
  });

  it('Scenario: An approximate progress is marked', () => {
    const readout = accumulationReadout(
      machine,
      goalProgress({
        currency: 'UAH',
        contributions: [gave('jar', 15000000, 'UAH'), gave('usd', 300000, 'USD')],
        rates: [usdRate],
      }),
    );

    expect(readout.approximate).toBe(true);
    expect(readout.progress).toBe('273 750,00 UAH');
    expect(readout.percentage).toBe(39);
  });

  it('Scenario: A percentage never rounds up to a ціль that is not reached', () => {
    const readout = accumulationReadout(machine, exact(69999999));

    expect(readout.percentage).toBe(99);
    expect(readout.reached).toBe(false);
  });

  it('Scenario: A reached ціль says so instead of a remainder', () => {
    const readout = accumulationReadout(machine, exact(71000000));

    expect(readout.reached).toBe(true);
    expect(readout.leftToAccumulate).toBeNull();
    expect(readout.percentage).toBe(101);
  });

  it('Scenario: A negative progress reads zero per cent', () => {
    const readout = accumulationReadout(machine, exact(-50000));

    expect(readout.percentage).toBe(0);
    expect(readout.reached).toBe(false);
  });

  it('Scenario: A progress that cannot be counted says so', () => {
    const readout = accumulationReadout(
      machine,
      goalProgress({ currency: 'UAH', contributions: [gave('eur', 200000, 'EUR')], rates: [] }),
    );

    expect(readout.progress).toBeNull();
    expect(readout.percentage).toBeNull();
    expect(readout.leftToAccumulate).toBeNull();
    // Neither reached nor overdue: an unknown progress is not a verdict.
    expect(readout.reached).toBe(false);
    expect(readout.uncountable).toContain('EUR');
  });

  it('An uncountable sum names no currency as the reason', () => {
    const readout = accumulationReadout(
      machine,
      goalProgress({
        currency: 'UAH',
        contributions: [
          gave('a', Number.MAX_SAFE_INTEGER, 'UAH'),
          gave('b', Number.MAX_SAFE_INTEGER, 'UAH'),
        ],
        rates: [],
      }),
    );

    expect(readout.uncountable).toBe('Прогрес неможливо порахувати зараз');
  });
});

describe('spendingReadout', () => {
  const ceiling = money(200000, 'UAH');

  it('Scenario: Within the ceiling reads used and remaining', () => {
    const readout = spendingReadout({ spent: money(132000, 'UAH'), ceiling, monthEnded: false });

    expect(readout.spent).toBe('1 320,00 UAH');
    expect(readout.ceiling).toBe('2 000,00 UAH');
    expect(readout.percentageUsed).toBe(66);
    expect(readout.mayStillSpend).toBe('680,00 UAH');
    expect(readout.exceededBy).toBeNull();
    expect(readout.state).toBe('within');
  });

  it('Scenario: Exceeded reads the excess and no percentage', () => {
    const readout = spendingReadout({ spent: money(248000, 'UAH'), ceiling, monthEnded: false });

    expect(readout.exceededBy).toBe('480,00 UAH');
    expect(readout.percentageUsed).toBeNull();
    expect(readout.mayStillSpend).toBeNull();
    expect(readout.state).toBe('exceeded');
  });

  it('Scenario: An exceeded ціль is never called reached', () => {
    const readout = spendingReadout({ spent: money(248000, 'UAH'), ceiling, monthEnded: false });

    // The type has no `reached` and no `leftToAccumulate` at all — the guard §6 asks for.
    expect('reached' in readout).toBe(false);
    expect('leftToAccumulate' in readout).toBe(false);
    expect(readout.percentageUsed).toBeNull();
  });

  it('Scenario: A negative spent reads zero per cent', () => {
    const readout = spendingReadout({ spent: money(-50000, 'UAH'), ceiling, monthEnded: false });

    expect(readout.percentageUsed).toBe(0);
    expect(readout.mayStillSpend).toBe('2 500,00 UAH');
    expect(readout.state).toBe('within');
  });

  it('Exactly at the ceiling is 100 % used and within', () => {
    const readout = spendingReadout({ spent: money(200000, 'UAH'), ceiling, monthEnded: false });

    expect(readout.percentageUsed).toBe(100);
    expect(readout.mayStillSpend).toBe('0,00 UAH');
    expect(readout.state).toBe('within');
  });

  it('A month that ended within the ceiling is settled', () => {
    const readout = spendingReadout({ spent: money(180000, 'UAH'), ceiling, monthEnded: true });

    expect(readout.state).toBe('completedWithin');
    expect(readout.exceededBy).toBeNull();
  });
});

describe('the conversion refuses what no rate can reach', () => {
  it('A ціль in a currency monobank quotes no rate in is refused, not approximated', () => {
    // Upstream `compositionProblem` already forbids this in the form, the repo and the бекап; the
    // guard is here too so the invariant is local to the one function that converts.
    expect(() =>
      goalProgress({
        currency: 'EUR',
        contributions: [gave('usd', 100000, 'USD')],
        rates: [usdRate],
      }),
    ).toThrow(/EUR/);
  });

  it('A ціль in its own single currency needs no rate and is exact', () => {
    const progress = goalProgress({
      currency: 'EUR',
      contributions: [gave('eur', 100000, 'EUR')],
      rates: [],
    });

    expect(progress).toMatchObject({ kind: 'exact', total: money(100000, 'EUR') });
  });
});
