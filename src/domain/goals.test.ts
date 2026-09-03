import { describe, expect, it } from 'vitest';

import { account } from './account';
import {
  composition,
  compositionProblem,
  contribution,
  isOverdue,
  isReached,
  spendingGoalSpent,
  spendingGoalState,
  sumContributions,
  type AccumulationGoal,
} from './goals';
import type { CategoryLimit } from './limits';
import { money } from './money';
import { categoryBreakdown } from './monthly-picture';
import { expenseByDefault, refund, transfer, type Transaction } from './transaction';

const jar = account({
  id: 'jar',
  name: 'Подушка',
  kind: 'savings',
  currency: 'UAH',
  openingBalance: money(5000000, 'UAH'),
});

const car: AccumulationGoal = {
  id: 'g-car',
  name: 'Авто',
  target: money(20000000, 'UAH'),
  deadline: '2026-12-31',
  accountIds: ['jar'],
};

const today = '2026-08-28';

describe('contribution', () => {
  it('Scenario: A переказ into a рахунок of the склад moves the progress', () => {
    const card = account({ id: 'card', name: 'mono', kind: 'spending', currency: 'UAH' });
    const arrival: Transaction = transfer({
      id: 't1',
      date: '2026-08-20',
      fromAccountId: 'card',
      toAccountId: 'jar',
      left: money(1000000, 'UAH'),
      arrived: money(1000000, 'UAH'),
    });

    expect(contribution(jar, [])).toEqual(money(5000000, 'UAH'));
    expect(contribution(jar, [arrival])).toEqual(money(6000000, 'UAH'));
    // The money left the card, so the card's own внесок moved the other way.
    expect(contribution(card, [arrival])).toEqual(money(-1000000, 'UAH'));
  });

  it('Scenario: Money moved between two рахунки of one склад does not move the progress', () => {
    const cash = account({
      id: 'cash',
      name: 'Готівка',
      kind: 'cash',
      currency: 'UAH',
      openingBalance: money(4000000, 'UAH'),
    });
    const within: Transaction = transfer({
      id: 't2',
      date: '2026-08-21',
      fromAccountId: 'cash',
      toAccountId: 'jar',
      left: money(1000000, 'UAH'),
      arrived: money(1000000, 'UAH'),
    });
    const progressOf = (transactions: readonly Transaction[]) =>
      sumContributions('UAH', [contribution(jar, transactions), contribution(cash, transactions)]);

    // One внесок fell by the сума and the other rose by it: a переказ is not money from outside.
    expect(progressOf([])).toEqual(money(9000000, 'UAH'));
    expect(progressOf([within])).toEqual(money(9000000, 'UAH'));
  });

  it('Scenario: An archived рахунок still feeds its ціль', () => {
    const archived = account({ ...jar, archived: true });

    expect(contribution(archived, [])).toEqual(contribution(jar, []));
  });

  it('Scenario: An інвестиційний рахунок contributes its поточна вартість', () => {
    const bonds = account({
      id: 'bonds',
      name: 'ОВДП',
      kind: 'investment',
      currency: 'UAH',
      openingBalance: money(500000, 'UAH'),
    });

    expect(contribution(bonds, [], money(560000, 'UAH'))).toEqual(money(560000, 'UAH'));
  });

  it('Scenario: An інвестиційний рахунок without a вартість contributes its баланс', () => {
    const bonds = account({
      id: 'bonds',
      name: 'ОВДП',
      kind: 'investment',
      currency: 'UAH',
      openingBalance: money(500000, 'UAH'),
    });

    expect(contribution(bonds, [])).toEqual(money(500000, 'UAH'));
    expect(contribution(bonds, [], undefined)).toEqual(money(500000, 'UAH'));
  });

  it('Scenario: An інвестиційний рахунок worth nothing contributes nothing', () => {
    const bonds = account({
      id: 'bonds',
      name: 'ОВДП',
      kind: 'investment',
      currency: 'UAH',
      openingBalance: money(500000, 'UAH'),
    });

    // Presence, not truthiness: a вартість of 0 is one the owner entered — an інвестиція may be
    // worth nothing — and falling back to the баланс here would answer the one question wrong.
    expect(contribution(bonds, [], money(0, 'UAH'))).toEqual(money(0, 'UAH'));
  });

  it('A вартість is read only for an інвестиційний рахунок', () => {
    // A банка with a вартість passed by mistake still contributes its баланс: the вартість is a
    // property of an інвестиційний рахунок and of nothing else.
    expect(contribution(jar, [], money(999, 'UAH'))).toEqual(money(5000000, 'UAH'));
  });

  it('Scenario: A negative баланс reduces the progress', () => {
    const overdrawn = account({
      id: 'card',
      name: 'mono',
      kind: 'spending',
      currency: 'UAH',
      openingBalance: money(1000000, 'UAH'),
    });
    const other = account({
      id: 'other',
      name: 'Готівка',
      kind: 'cash',
      currency: 'UAH',
      openingBalance: money(-200000, 'UAH'),
    });

    expect(
      sumContributions('UAH', [contribution(overdrawn, []), contribution(other, [])]),
    ).toEqual(money(800000, 'UAH'));
  });
});

describe('sumContributions', () => {
  it('Adds the внески in the ціль’s own currency', () => {
    expect(
      sumContributions('UAH', [
        money(15000000, 'UAH'),
        money(4000000, 'UAH'),
        money(1000000, 'UAH'),
      ]),
    ).toEqual(money(20000000, 'UAH'));
    expect(sumContributions('USD', [])).toEqual(money(0, 'USD'));
  });

  it('A внесок in another currency is refused, not converted', () => {
    expect(() => sumContributions('UAH', [money(300000, 'USD')])).toThrow(/USD/);
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
    // The ціль's currency is its own now, not a рахунок's — a progress arrives converted into it
    // or it does not arrive at all.
    expect(() => isReached(car, money(20000000, 'USD'))).toThrow(/USD/);
  });
});

describe('isOverdue', () => {
  it('Scenario: A past дата without the target is overdue', () => {
    const lastYear: AccumulationGoal = { ...car, deadline: '2025-12-31' };

    expect(isOverdue(lastYear, money(5000000, 'UAH'), today)).toBe(true);
  });

  it('Scenario: A reached ціль is never overdue', () => {
    const lastYear: AccumulationGoal = { ...car, deadline: '2025-12-31' };

    expect(isReached(lastYear, money(20000000, 'UAH'))).toBe(true);
    expect(isOverdue(lastYear, money(20000000, 'UAH'), today)).toBe(false);
  });

  it('Scenario: A ціль without a дата is never overdue', () => {
    const undated: AccumulationGoal = { id: 'g', name: 'Резерв', target: car.target, accountIds: ['jar'] };

    expect(undated.deadline).toBeUndefined();
    expect(isOverdue(undated, money(0, 'UAH'), today)).toBe(false);
    // Not even years later: there is no deadline to be past.
    expect(isOverdue(undated, money(0, 'UAH'), '2099-01-01')).toBe(false);
  });

  it('A дата still ahead — or today — is not overdue', () => {
    expect(isOverdue(car, money(0, 'UAH'), today)).toBe(false);
    // The day the ціль is due is not a day it is late: the дата has not passed yet.
    expect(isOverdue({ ...car, deadline: today }, money(0, 'UAH'), today)).toBe(false);
    expect(isOverdue({ ...car, deadline: '2026-08-27' }, money(0, 'UAH'), today)).toBe(true);
  });
});

describe('compositionProblem', () => {
  const uah = { id: 'jar', currency: 'UAH' };
  const usd = { id: 'usd', currency: 'USD' };
  const eur = { id: 'eur', currency: 'EUR' };
  const usd2 = { id: 'usd2', currency: 'USD' };

  it('Scenario: A mixed склад in UAH is accepted', () => {
    expect(compositionProblem('UAH', [uah, usd, eur])).toBeNull();
  });

  it('Scenario: A single-currency склад may keep its own currency', () => {
    expect(compositionProblem('USD', [usd, usd2])).toBeNull();
    // …and may equally be held in UAH, which is converted and marked приблизний.
    expect(compositionProblem('UAH', [usd, usd2])).toBeNull();
  });

  it('Scenario: A mixed склад in another currency is rejected', () => {
    expect(compositionProblem('USD', [usd, uah])).toEqual({
      kind: 'mixed',
      currencies: ['USD', 'UAH'],
    });
  });

  it('Scenario: A currency neither UAH nor the склад’s is rejected', () => {
    expect(compositionProblem('EUR', [usd, usd2])).toEqual({ kind: 'foreign', shared: 'USD' });
  });

  it('Scenario: An empty склад is rejected', () => {
    expect(compositionProblem('UAH', [])).toEqual({ kind: 'empty' });
  });

  it('Scenario: A рахунок-борг may stand in a склад', () => {
    // Any вид may: what backs a ціль is the owner's judgement, not the app's.
    expect(compositionProblem('UAH', [{ id: 'debt-oleh', currency: 'UAH' }])).toBeNull();
  });

  it('Scenario: Adding a рахунок of another currency to a non-UAH ціль is refused', () => {
    expect(compositionProblem('USD', [usd])).toBeNull();
    expect(compositionProblem('USD', [usd, uah])).not.toBeNull();
  });

  it('A склад naming one рахунок twice is a mistake, not a set', () => {
    expect(compositionProblem('UAH', [uah, uah])).toEqual({ kind: 'duplicate', accountId: 'jar' });
  });
});

describe('composition', () => {
  it('Scenario: Choosing a рахунок twice counts it once', () => {
    // Ticked by hand, then covered by a вид shortcut: one рахунок, once, in the order first ticked.
    expect(composition(['jar', 'cash', 'jar'])).toEqual(['jar', 'cash']);
    expect(composition([])).toEqual([]);
  });
});

describe('spendingGoalState', () => {
  const ceiling = money(200000, 'UAH');

  it('Scenario: Below the ceiling is within', () => {
    expect(spendingGoalState({ spent: money(132000, 'UAH'), ceiling, monthEnded: false })).toBe(
      'within',
    );
  });

  it('Scenario: Exactly at the ceiling is within', () => {
    expect(spendingGoalState({ spent: money(200000, 'UAH'), ceiling, monthEnded: false })).toBe(
      'within',
    );
  });

  it('Scenario: Above the ceiling is exceeded', () => {
    expect(spendingGoalState({ spent: money(230000, 'UAH'), ceiling, monthEnded: false })).toBe(
      'exceeded',
    );
    // A month that has ended over the ceiling is still exceeded — ending settles it, not forgives it.
    expect(spendingGoalState({ spent: money(230000, 'UAH'), ceiling, monthEnded: true })).toBe(
      'exceeded',
    );
  });

  it('Scenario: A month that ended within the ceiling is settled', () => {
    expect(spendingGoalState({ spent: money(180000, 'UAH'), ceiling, monthEnded: true })).toBe(
      'completedWithin',
    );
  });
});

describe('spendingGoalSpent', () => {
  const restaurants: CategoryLimit = { categoryId: 'restaurants', amount: money(200000, 'UAH') };
  const spend = (id: string, date: string, amount: number, currency: string) =>
    expenseByDefault({
      id,
      date,
      accountId: 'card',
      amount: money(amount, currency),
      categoryId: 'restaurants',
    });

  const spentIn = (month: string, transactions: readonly Transaction[]) =>
    spendingGoalSpent({
      breakdown: categoryBreakdown({ month, transactions }),
      limit: restaurants,
    });

  it('Scenario: Spending shows against the ceiling', () => {
    expect(spentIn('2026-08', [spend('e1', '2026-08-03', 132000, 'UAH')])).toEqual(
      money(132000, 'UAH'),
    );
  });

  it('Scenario: A повернення pulls the ціль back exactly as it pulls the ліміт', () => {
    const august: Transaction[] = [
      spend('e1', '2026-08-03', 230000, 'UAH'),
      refund({
        id: 'r1',
        date: '2026-08-10',
        accountId: 'card',
        amount: money(50000, 'UAH'),
        categoryId: 'restaurants',
      }),
    ];
    const spent = spentIn('2026-08', august);

    // The same number the ліміт is judged by, because it is the same number.
    expect(spent).toEqual(money(180000, 'UAH'));
    expect(
      spendingGoalState({ spent, ceiling: restaurants.amount, monthEnded: false }),
    ).toBe('within');
  });

  it('Scenario: Another currency’s spending never counts', () => {
    const spent = spentIn('2026-08', [
      spend('e1', '2026-08-03', 150000, 'UAH'),
      spend('e2', '2026-08-04', 5000, 'USD'),
    ]);

    expect(spent).toEqual(money(150000, 'UAH'));
  });

  it('Scenario: A new month starts the ціль over', () => {
    const august: Transaction[] = [spend('e1', '2026-08-03', 230000, 'UAH')];

    expect(spendingGoalState({ spent: spentIn('2026-08', august), ceiling: restaurants.amount, monthEnded: true })).toBe(
      'exceeded',
    );
    // September holds none of August's спент: a категорія that moved nothing is at zero.
    expect(spentIn('2026-09', august)).toEqual(money(0, 'UAH'));
    expect(
      spendingGoalState({
        spent: spentIn('2026-09', august),
        ceiling: restaurants.amount,
        monthEnded: false,
      }),
    ).toBe('within');
  });
});
