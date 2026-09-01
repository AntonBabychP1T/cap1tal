import { describe, expect, it } from 'vitest';

import { account } from '../domain/account';
import { money, type Money } from '../domain/money';
import { accountTotals, approximateTotals, totalsLine } from './account-totals';

const card = account({ id: 'card', name: 'Kartka', kind: 'spending', currency: 'UAH' });
const jar = account({ id: 'jar', name: 'Podushka', kind: 'savings', currency: 'UAH' });

const balances = (entries: Record<string, Money>) => new Map(Object.entries(entries));

describe('accountTotals', () => {
  it('Scenario: Two accounts of the same currency add up', () => {
    const totals = accountTotals(
      [card, jar],
      balances({ card: money(705000, 'UAH'), jar: money(600000, 'UAH') }),
    );

    expect(totals.total).toEqual([money(1305000, 'UAH')]);
    expect(totals.perKind.get('spending')).toEqual([money(705000, 'UAH')]);
    expect(totals.perKind.get('savings')).toEqual([money(600000, 'UAH')]);
  });

  it('Scenario: Currencies stay apart', () => {
    const dollars = account({ id: 'usd', name: 'долари', kind: 'cash', currency: 'USD' });

    const totals = accountTotals(
      [card, dollars],
      balances({ card: money(705000, 'UAH'), usd: money(20000, 'USD') }),
    );

    // Two numbers, UAH first, and no third combined one anywhere.
    expect(totals.total).toEqual([money(705000, 'UAH'), money(20000, 'USD')]);
    expect(totals.perKind.get('spending')).toEqual([money(705000, 'UAH')]);
    expect(totals.perKind.get('cash')).toEqual([money(20000, 'USD')]);
  });

  it('Scenario: An archived рахунок counts toward nothing', () => {
    const retired = account({
      id: 'old',
      name: 'стара картка',
      kind: 'cash',
      currency: 'UAH',
      archived: true,
    });

    const totals = accountTotals(
      [card, retired],
      balances({ card: money(705000, 'UAH'), old: money(100000, 'UAH') }),
    );

    expect(totals.total).toEqual([money(705000, 'UAH')]);
    // Its вид does not even appear: an archived рахунок leaves no heading behind.
    expect(totals.perKind.has('cash')).toBe(false);
  });

  it('Scenario: A рахунок-борг counts as what is still owed', () => {
    const lent = account({ id: 'debt', name: 'Петро', kind: 'debt', currency: 'UAH' });

    const totals = accountTotals(
      [card, lent],
      balances({ card: money(705000, 'UAH'), debt: money(200000, 'UAH') }),
    );

    expect(totals.total).toEqual([money(905000, 'UAH')]);
    expect(totals.perKind.get('debt')).toEqual([money(200000, 'UAH')]);
  });

  it('Scenario: A negative balance is counted with its sign', () => {
    const overdrawn = account({ id: 'over', name: 'кредитка', kind: 'spending', currency: 'UAH' });

    const totals = accountTotals(
      [card, overdrawn],
      balances({ card: money(705000, 'UAH'), over: money(-5000, 'UAH') }),
    );

    expect(totals.total).toEqual([money(700000, 'UAH')]);
    expect(totals.perKind.get('spending')).toEqual([money(700000, 'UAH')]);
  });

  it('No рахунок at all totals nothing', () => {
    expect(accountTotals([], new Map())).toEqual({ perKind: new Map(), total: [] });
  });

  it('A рахунок missing from the balances counts as zero in its own currency', () => {
    const totals = accountTotals([card, jar], balances({ card: money(705000, 'UAH') }));

    expect(totals.total).toEqual([money(705000, 'UAH')]);
    expect(totals.perKind.get('savings')).toEqual([money(0, 'UAH')]);
  });

  it('Currencies are listed UAH first, then alphabetically', () => {
    const usd = account({ id: 'usd', name: 'долари', kind: 'cash', currency: 'USD' });
    const eur = account({ id: 'eur', name: 'євро', kind: 'cash', currency: 'EUR' });

    const totals = accountTotals(
      [usd, eur, card],
      balances({
        usd: money(20000, 'USD'),
        eur: money(30000, 'EUR'),
        card: money(705000, 'UAH'),
      }),
    );

    expect(totals.total.map((m) => m.currency)).toEqual(['UAH', 'EUR', 'USD']);
  });
});

describe('approximateTotals', () => {
  const usdRate = { currency: 'USD', rateMillionths: 41_253_400 };

  it('Scenario: A known rate adds a marked approximation', () => {
    const approximate = approximateTotals(
      [money(705000, 'UAH'), money(20000, 'USD')],
      [usdRate],
    );

    // 20000 × 41,2534 = 825068 kopiykas, plus the 705000 already in UAH.
    expect(approximate).toBe('≈ 15300,68 грн');
  });

  it('Scenario: An unknown rate hides the approximation, not the totals', () => {
    expect(approximateTotals([money(705000, 'UAH'), money(20000, 'USD')], [])).toBeNull();
  });

  it('A UAH-only total has nothing to approximate', () => {
    expect(approximateTotals([money(705000, 'UAH')], [usdRate])).toBeNull();
  });

  it('One unknown rate withholds the whole figure', () => {
    const totals = [money(705000, 'UAH'), money(20000, 'USD'), money(30000, 'EUR')];

    expect(approximateTotals(totals, [usdRate])).toBeNull();
  });

  it('Nothing held approximates to nothing', () => {
    expect(approximateTotals([], [usdRate])).toBeNull();
  });

  it('A negative total keeps its sign', () => {
    expect(approximateTotals([money(-20000, 'USD')], [usdRate])).toBe('≈ -8250,68 грн');
  });
});

describe('totalsLine', () => {
  it('Two currencies read as two amounts, never as one', () => {
    expect(totalsLine([money(705000, 'UAH'), money(20000, 'USD')])).toBe(
      '7050,00 UAH · 200,00 USD',
    );
  });

  it('Nothing held is nothing to show', () => {
    expect(totalsLine([])).toBe('');
  });

  it('A negative total keeps its sign', () => {
    expect(totalsLine([money(-5000, 'UAH')])).toBe('−50,00 UAH');
  });
});
