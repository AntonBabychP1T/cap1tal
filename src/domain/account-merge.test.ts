import { describe, expect, it } from 'vitest';

import { account } from './account';
import { isBetween, mergePreview, mergeRefusal, repoint } from './account-merge';
import { money } from './money';
import { expenseByDefault, transfer, type Correction } from './transaction';

/**
 * The owner's own case (report 2026-09-23): the monobank банка «На облігацію» linked on a рахунок
 * of its own, while «облігація $» had held the same банка by hand since February — the same
 * dollars counted twice in «Усього грошей».
 */
const jar = account({ id: 'jar', name: 'На облігацію', kind: 'savings', currency: 'USD' });
const bond = account({ id: 'bond', name: 'облігація $', kind: 'investment', currency: 'USD' });
const hryvnia = account({ id: 'uah', name: 'mono white', kind: 'spending', currency: 'UAH' });

const topUp = transfer({
  id: 't1',
  date: '2026-02-09',
  fromAccountId: 'card',
  toAccountId: 'bond',
  left: money(1100_00, 'USD'),
  arrived: money(1100_00, 'USD'),
});
const reconciled: Correction = {
  type: 'correction',
  id: 't2',
  date: '2026-09-23',
  accountId: 'jar',
  amount: money(2086_99, 'USD'),
};

describe('mergeRefusal', () => {
  it('refuses two currencies, the рахунок itself, and two linked рахунки', () => {
    expect(mergeRefusal({ from: jar, into: hryvnia, fromLinked: false, intoLinked: false })).toBe(
      'валюти різні: USD і UAH',
    );
    expect(mergeRefusal({ from: jar, into: jar, fromLinked: false, intoLinked: false })).toBe(
      'рахунок не можна обʼєднати сам із собою',
    );
    expect(mergeRefusal({ from: jar, into: bond, fromLinked: true, intoLinked: true })).toContain(
      'обидва рахунки приєднано до monobank',
    );
  });

  it('allows the linked банка to be folded into the hand-kept рахунок, and the other way', () => {
    expect(mergeRefusal({ from: jar, into: bond, fromLinked: true, intoLinked: false })).toBeUndefined();
    expect(mergeRefusal({ from: bond, into: jar, fromLinked: false, intoLinked: true })).toBeUndefined();
  });
});

describe('mergePreview', () => {
  it('names the merged balance as both histories and both opening balances together', () => {
    const preview = mergePreview({
      from: account({ ...jar, openingBalance: money(10_00, 'USD') }),
      into: bond,
      fromTransactions: [reconciled],
      intoTransactions: [topUp],
    });
    expect(preview).toMatchObject({ moved: 1, dropped: 0, balance: money(1100_00 + 2086_99 + 10_00, 'USD') });
  });

  it('counts the коригування that would move, and the balance if they are left behind', () => {
    // The owner's report: «Звірити» on the банка added the 2 086,99 USD «облігація $» already held.
    const preview = mergePreview({
      from: jar,
      into: bond,
      fromTransactions: [reconciled],
      intoTransactions: [topUp],
    });
    expect(preview.corrections).toBe(1);
    expect(preview.balance).toEqual(money(1100_00 + 2086_99, 'USD'));
    expect(preview.balanceWithoutCorrections).toEqual(money(1100_00, 'USD'));
  });

  it('drops a переказ between the two, which moved no money once they are one', () => {
    const between = transfer({
      id: 't3',
      date: '2026-09-12',
      fromAccountId: 'bond',
      toAccountId: 'jar',
      left: money(50_00, 'USD'),
      arrived: money(50_00, 'USD'),
    });
    const preview = mergePreview({
      from: jar,
      into: bond,
      fromTransactions: [between],
      intoTransactions: [topUp, between],
    });
    expect(preview).toMatchObject({ moved: 0, dropped: 1, balance: money(1100_00, 'USD') });
  });
});

describe('isBetween and repoint', () => {
  it('a переказ is between the two in either direction, and nothing else is', () => {
    expect(isBetween(topUp, 'card', 'bond')).toBe(true);
    expect(isBetween(topUp, 'bond', 'card')).toBe(true);
    expect(isBetween(topUp, 'jar', 'bond')).toBe(false);
    expect(isBetween(reconciled, 'jar', 'bond')).toBe(false);
  });

  it('moves every leg on the folded рахунок and no other', () => {
    expect(repoint(topUp, 'card', 'other')).toMatchObject({ fromAccountId: 'other', toAccountId: 'bond' });
    const spent = expenseByDefault({ id: 't4', date: '2026-09-01', accountId: 'jar', amount: money(1_00, 'USD') });
    expect(repoint(spent, 'jar', 'bond')).toMatchObject({ accountId: 'bond' });
    expect(repoint(spent, 'card', 'bond')).toMatchObject({ accountId: 'jar' });
  });
});
