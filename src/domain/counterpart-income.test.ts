import { describe, expect, it } from 'vitest';

import {
  isCounterpartIncome,
  pickAwaitingTransfer,
  pickCounterpartIncome,
  type Dated,
} from './counterpart-income';
import { money } from './money';
import { transfer, UNSOURCED_SOURCE_ID, type Income, type Transfer } from './transaction';

function income(input: {
  id: string;
  accountId: string;
  amount: number;
  currency?: string;
  date: string;
  sourceId?: string;
}): Income {
  return {
    type: 'income',
    id: input.id,
    date: input.date,
    accountId: input.accountId,
    amount: money(input.amount, input.currency ?? 'UAH'),
    sourceId: input.sourceId ?? UNSOURCED_SOURCE_ID,
  };
}

function dated<T>(transaction: T, storedAt = '2026-01-01T00:00:00.000Z'): Dated<T> {
  return { transaction, storedAt: new Date(storedAt) };
}

const roundUp: Transfer = transfer({
  id: 'tr1',
  date: '2026-09-12',
  fromAccountId: 'platinum',
  toAccountId: 'reserve',
  left: money(616, 'UAH'),
  arrived: money(616, 'UAH'),
});

describe('isCounterpartIncome', () => {
  it('Scenario: A дохід with a chosen джерело is never absorbed', () => {
    const withSource = income({
      id: 'i1',
      accountId: 'reserve',
      amount: 616,
      date: '2026-09-12',
      sourceId: 'gifts',
    });
    expect(isCounterpartIncome(roundUp, withSource)).toBe(false);
  });

  it('Scenario: A дохід two days away is not the зустрічний дохід', () => {
    const twoDaysAway = income({ id: 'i1', accountId: 'reserve', amount: 616, date: '2026-09-10' });
    expect(isCounterpartIncome(roundUp, twoDaysAway)).toBe(false);
  });

  it('Scenario: A different сума is not the зустрічний дохід', () => {
    const differentSum = income({ id: 'i1', accountId: 'reserve', amount: 617, date: '2026-09-12' });
    expect(isCounterpartIncome(roundUp, differentSum)).toBe(false);
  });

  it('Scenario: A cross-currency переказ absorbs a дохід of its arrived сума', () => {
    const crossCurrency: Transfer = transfer({
      id: 'tr2',
      date: '2026-09-12',
      fromAccountId: 'platinum',
      toAccountId: 'usd-account',
      left: money(410000, 'UAH'),
      arrived: money(10000, 'USD'),
    });
    const usdIncome = income({
      id: 'i1',
      accountId: 'usd-account',
      amount: 10000,
      currency: 'USD',
      date: '2026-09-12',
    });
    expect(isCounterpartIncome(crossCurrency, usdIncome)).toBe(true);
  });

  it('a дохід on another рахунок is never a candidate', () => {
    const elsewhere = income({ id: 'i1', accountId: 'platinum', amount: 616, date: '2026-09-12' });
    expect(isCounterpartIncome(roundUp, elsewhere)).toBe(false);
  });

  it('a date exactly one day away still counts', () => {
    const dayBefore = income({ id: 'i1', accountId: 'reserve', amount: 616, date: '2026-09-11' });
    const dayAfter = income({ id: 'i2', accountId: 'reserve', amount: 616, date: '2026-09-13' });
    expect(isCounterpartIncome(roundUp, dayBefore)).toBe(true);
    expect(isCounterpartIncome(roundUp, dayAfter)).toBe(true);
  });
});

describe('pickCounterpartIncome', () => {
  it('Scenario: The nearest date wins among candidates', () => {
    const near = income({ id: 'i1', accountId: 'reserve', amount: 9, date: '2026-09-10' });
    const nearer = income({ id: 'i2', accountId: 'reserve', amount: 9, date: '2026-09-11' });
    const t: Transfer = transfer({
      id: 'tr1',
      date: '2026-09-11',
      fromAccountId: 'platinum',
      toAccountId: 'reserve',
      left: money(9, 'UAH'),
      arrived: money(9, 'UAH'),
    });
    expect(pickCounterpartIncome(t, [dated(near), dated(nearer)])).toEqual(nearer);
  });

  it('the earliest stored wins a tie of equal distance', () => {
    const first = income({ id: 'i1', accountId: 'reserve', amount: 616, date: '2026-09-12' });
    const second = income({ id: 'i2', accountId: 'reserve', amount: 616, date: '2026-09-12' });
    expect(
      pickCounterpartIncome(roundUp, [
        dated(second, '2026-09-12T10:00:00.000Z'),
        dated(first, '2026-09-12T09:00:00.000Z'),
      ]),
    ).toEqual(first);
  });

  it('the smaller id wins a further tie', () => {
    const a = income({ id: 'a', accountId: 'reserve', amount: 616, date: '2026-09-12' });
    const b = income({ id: 'b', accountId: 'reserve', amount: 616, date: '2026-09-12' });
    const sameMoment = '2026-09-12T09:00:00.000Z';
    expect(pickCounterpartIncome(roundUp, [dated(b, sameMoment), dated(a, sameMoment)])).toEqual(a);
  });

  it('a month boundary is still one day, not thirty', () => {
    const t: Transfer = transfer({
      id: 'tr1',
      date: '2026-10-01',
      fromAccountId: 'platinum',
      toAccountId: 'reserve',
      left: money(500, 'UAH'),
      arrived: money(500, 'UAH'),
    });
    const dayBefore = income({ id: 'i1', accountId: 'reserve', amount: 500, date: '2026-09-30' });
    expect(pickCounterpartIncome(t, [dated(dayBefore)])).toEqual(dayBefore);
  });

  it('a year boundary is still one day', () => {
    const t: Transfer = transfer({
      id: 'tr1',
      date: '2027-01-01',
      fromAccountId: 'platinum',
      toAccountId: 'reserve',
      left: money(500, 'UAH'),
      arrived: money(500, 'UAH'),
    });
    const dayBefore = income({ id: 'i1', accountId: 'reserve', amount: 500, date: '2026-12-31' });
    expect(pickCounterpartIncome(t, [dated(dayBefore)])).toEqual(dayBefore);
  });

  it('no candidates yields nothing', () => {
    expect(pickCounterpartIncome(roundUp, [])).toBeUndefined();
  });
});

describe('pickAwaitingTransfer', () => {
  it('Scenario: Two перекази never absorb the same дохід', () => {
    // Modelled at the picking level: two candidate перекази, one дохід — only the nearer is chosen.
    const earlier: Transfer = transfer({
      id: 'tr1',
      date: '2026-09-10',
      fromAccountId: 'platinum',
      toAccountId: 'reserve',
      left: money(9, 'UAH'),
      arrived: money(9, 'UAH'),
    });
    const later: Transfer = transfer({
      id: 'tr2',
      date: '2026-09-11',
      fromAccountId: 'platinum',
      toAccountId: 'reserve',
      left: money(9, 'UAH'),
      arrived: money(9, 'UAH'),
    });
    const arriving = income({ id: 'i1', accountId: 'reserve', amount: 9, date: '2026-09-11' });
    expect(pickAwaitingTransfer(arriving, [dated(earlier), dated(later)])).toEqual(later);
  });

  it('the mirror ordering: nearest date, then earliest stored, then smaller id', () => {
    const a: Transfer = transfer({
      id: 'a',
      date: '2026-09-12',
      fromAccountId: 'platinum',
      toAccountId: 'reserve',
      left: money(20, 'UAH'),
      arrived: money(20, 'UAH'),
    });
    const b: Transfer = transfer({
      id: 'b',
      date: '2026-09-12',
      fromAccountId: 'platinum',
      toAccountId: 'reserve',
      left: money(20, 'UAH'),
      arrived: money(20, 'UAH'),
    });
    const arriving = income({ id: 'i1', accountId: 'reserve', amount: 20, date: '2026-09-12' });
    const sameMoment = '2026-09-12T09:00:00.000Z';
    expect(pickAwaitingTransfer(arriving, [dated(b, sameMoment), dated(a, sameMoment)])).toEqual(a);
  });

  it('no awaiting candidates yields nothing', () => {
    const arriving = income({ id: 'i1', accountId: 'reserve', amount: 20, date: '2026-09-12' });
    expect(pickAwaitingTransfer(arriving, [])).toBeUndefined();
  });
});
