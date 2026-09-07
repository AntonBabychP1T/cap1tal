import { describe, expect, it } from 'vitest';

import { account } from './account';
import { contributed, gainLoss } from './investments';
import { money } from './money';
import { monthlyPicture } from './monthly-picture';
import { transfer, type Transaction } from './transaction';

const card = account({ id: 'card', name: 'mono black', kind: 'spending', currency: 'UAH' });

const bonds = account({
  id: 'bonds',
  name: 'ОВДП',
  kind: 'investment',
  currency: 'UAH',
});

describe('contributed', () => {
  it('Scenario: Money back out reduces вкладено', () => {
    const transactions: Transaction[] = [
      transfer({
        id: 't1',
        date: '2026-03-10',
        fromAccountId: 'card',
        toAccountId: 'bonds',
        left: money(500000, 'UAH'),
        arrived: money(500000, 'UAH'),
      }),
      transfer({
        id: 't2',
        date: '2026-05-20',
        fromAccountId: 'bonds',
        toAccountId: 'card',
        left: money(100000, 'UAH'),
        arrived: money(100000, 'UAH'),
      }),
    ];

    expect(contributed(bonds, transactions)).toEqual(money(400000, 'UAH'));
  });

  it('Scenario: Money that was there before the app is вкладено too', () => {
    const held = account({
      id: 'bonds',
      name: 'ОВДП',
      kind: 'investment',
      currency: 'UAH',
      openingBalance: money(1000000, 'UAH'),
    });
    const transactions: Transaction[] = [
      transfer({
        id: 't1',
        date: '2026-03-10',
        fromAccountId: 'card',
        toAccountId: 'bonds',
        left: money(200000, 'UAH'),
        arrived: money(200000, 'UAH'),
      }),
    ];

    expect(contributed(held, transactions)).toEqual(money(1200000, 'UAH'));
  });

  it('Scenario: Вкладено is the whole history, інвестовано is one month', () => {
    const transactions: Transaction[] = [
      transfer({
        id: 't1',
        date: '2026-03-10',
        fromAccountId: 'card',
        toAccountId: 'bonds',
        left: money(300000, 'UAH'),
        arrived: money(300000, 'UAH'),
      }),
      transfer({
        id: 't2',
        date: '2026-04-10',
        fromAccountId: 'card',
        toAccountId: 'bonds',
        left: money(200000, 'UAH'),
        arrived: money(200000, 'UAH'),
      }),
    ];

    expect(contributed(bonds, transactions)).toEqual(money(500000, 'UAH'));

    const accounts = [card, bonds];
    const march = monthlyPicture({ month: '2026-03', accounts, transactions });
    const april = monthlyPicture({ month: '2026-04', accounts, transactions });
    expect(march.get('UAH')?.invested).toEqual(money(300000, 'UAH'));
    expect(april.get('UAH')?.invested).toEqual(money(200000, 'UAH'));
  });

  it("Scenario: A cross-currency переказ is вкладено in the рахунок's own currency", () => {
    const brokerage = account({ id: 'ibkr', name: 'IBKR', kind: 'investment', currency: 'USD' });
    const transactions: Transaction[] = [
      transfer({
        id: 't1',
        date: '2026-03-10',
        fromAccountId: 'card',
        toAccountId: 'ibkr',
        left: money(410000, 'UAH'),
        arrived: money(10000, 'USD'),
      }),
    ];

    // The leg that arrived, in the рахунок's own currency. The UAH that left is the картка's side
    // of the same переказ, and no rate is derived to make the two one number.
    expect(contributed(brokerage, transactions)).toEqual(money(10000, 'USD'));
  });

  it('Scenario: A рахунок of another вид has no вкладено', () => {
    expect(() => contributed(card, [])).toThrow(/investment/);
  });
});

describe('gainLoss', () => {
  it('Scenario: A вартість above вкладено is a прибуток', () => {
    expect(gainLoss(money(560000, 'UAH'), money(500000, 'UAH'))).toEqual(money(60000, 'UAH'));
  });

  it('Scenario: A вартість below вкладено is a збиток', () => {
    expect(gainLoss(money(450000, 'UAH'), money(500000, 'UAH'))).toEqual(money(-50000, 'UAH'));
  });

  it('Scenario: Equal amounts are zero, not absent', () => {
    const same = gainLoss(money(500000, 'UAH'), money(500000, 'UAH'));
    expect(same).toEqual(money(0, 'UAH'));
    expect(same).not.toBeUndefined();
  });

  it('Scenario: Without a вартість there is no прибуток', () => {
    const put = contributed(bonds, [
      transfer({
        id: 't1',
        date: '2026-03-10',
        fromAccountId: 'card',
        toAccountId: 'bonds',
        left: money(500000, 'UAH'),
        arrived: money(500000, 'UAH'),
      }),
    ]);

    expect(gainLoss(undefined, put)).toBeUndefined();
    expect(put).toEqual(money(500000, 'UAH'));
  });

  it('Scenario: Two рахунки in different currencies keep separate figures', () => {
    const hryvnia = gainLoss(money(560000, 'UAH'), money(500000, 'UAH'));
    const dollars = gainLoss(money(398000, 'USD'), money(400000, 'USD'));

    expect(hryvnia).toEqual(money(60000, 'UAH'));
    expect(dollars).toEqual(money(-2000, 'USD'));
    // No total across the two exists — the domain refuses to make one.
    expect(() => gainLoss(money(560000, 'UAH'), money(400000, 'USD'))).toThrow(/UAH.*USD/);
  });
});
