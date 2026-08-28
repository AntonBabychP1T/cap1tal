import { describe, expect, it } from 'vitest';

import { account } from './account';
import { goalProgress, isOverdue, isReached, type Goal } from './goals';
import { money } from './money';
import { transfer, type Transaction } from './transaction';

const jar = account({
  id: 'jar',
  name: 'Подушка',
  kind: 'savings',
  currency: 'UAH',
  openingBalance: money(5000000, 'UAH'),
});

const car: Goal = {
  id: 'g-car',
  name: 'Авто',
  target: money(20000000, 'UAH'),
  deadline: '2026-12-31',
  accountId: 'jar',
};

const today = '2026-08-28';

describe('goalProgress', () => {
  it('Scenario: A transfer into the рахунок moves the progress', () => {
    const card = account({ id: 'card', name: 'mono', kind: 'spending', currency: 'UAH' });
    const arrival: Transaction = transfer({
      id: 't1',
      date: '2026-08-20',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(1000000, 'UAH'),
      arrived: money(1000000, 'UAH'),
    });

    expect(goalProgress(jar, [])).toEqual(money(5000000, 'UAH'));
    expect(goalProgress(jar, [arrival])).toEqual(money(6000000, 'UAH'));
    // The money left the card, so the card's own progress would have moved the other way.
    expect(goalProgress(card, [arrival])).toEqual(money(-1000000, 'UAH'));
  });

  it('Scenario: An archived рахунок still feeds its ціль', () => {
    const archived = account({ ...jar, archived: true });

    expect(goalProgress(archived, [])).toEqual(goalProgress(jar, []));
  });
});

describe('isReached', () => {
  it('Scenario: Progress equal to the target reaches the ціль', () => {
    expect(isReached(car, money(20000000, 'UAH'))).toBe(true);
    expect(isReached(car, money(20000001, 'UAH'))).toBe(true);
  });

  it('Scenario: Progress below the target is not reached', () => {
    expect(isReached(car, money(19999999, 'UAH'))).toBe(false);
    expect(isReached(car, money(-1, 'UAH'))).toBe(false);
  });

  it('Progress in another currency is refused, not converted', () => {
    expect(() => isReached(car, money(20000000, 'USD'))).toThrow(/USD/);
  });
});

describe('isOverdue', () => {
  it('Scenario: A past дата without the target is overdue', () => {
    const lastYear: Goal = { ...car, deadline: '2025-12-31' };

    expect(isOverdue(lastYear, money(5000000, 'UAH'), today)).toBe(true);
  });

  it('Scenario: A reached ціль is never overdue', () => {
    const lastYear: Goal = { ...car, deadline: '2025-12-31' };

    expect(isReached(lastYear, money(20000000, 'UAH'))).toBe(true);
    expect(isOverdue(lastYear, money(20000000, 'UAH'), today)).toBe(false);
  });

  it('A дата still ahead — or today — is not overdue', () => {
    expect(isOverdue(car, money(0, 'UAH'), today)).toBe(false);
    // The day the ціль is due is not a day it is late: the дата has not passed yet.
    expect(isOverdue({ ...car, deadline: today }, money(0, 'UAH'), today)).toBe(false);
    expect(isOverdue({ ...car, deadline: '2026-08-27' }, money(0, 'UAH'), today)).toBe(true);
  });
});
