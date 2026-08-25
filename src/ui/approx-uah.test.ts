import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { money, type CurrencyCode, type Money } from '../domain/money';
import type { MonthlyNumbers } from '../domain/monthly-picture';
import type { MonobankRate } from '../monobank/currency';
import {
  approximatePicture,
  approximateUah,
  RATE_MAX_AGE_MS,
  shouldRefreshRates,
  staleCurrencies,
} from './approx-uah';

/** 41.25345 UAH per USD, as the parser stores it. */
const USD_RATE: MonobankRate = { currency: 'USD', rateMillionths: 41_253_450 };
const EUR_RATE: MonobankRate = { currency: 'EUR', rateMillionths: 51_880_000 };

/** A month's numbers where only `spent` is interesting; the rest are zero in the same currency. */
const spentOnly = (amount: number, currency: CurrencyCode): MonthlyNumbers => ({
  spent: money(amount, currency),
  invested: money(0, currency),
  saved: money(0, currency),
  lent: money(0, currency),
  income: money(0, currency),
  left: money(-amount, currency),
});

const pictureOf = (...rows: [CurrencyCode, MonthlyNumbers][]) =>
  new Map<CurrencyCode, MonthlyNumbers>(rows);

describe('approximateUah', () => {
  it('Scenario: Conversion rounds to whole kopiykas', () => {
    // 10000 × 41.25345 = 412534.5 kopiykas exactly — the half goes away from zero.
    expect(approximateUah(10000, USD_RATE.rateMillionths)).toBe(412535);
  });

  it('Scenario: A negative amount rounds away from zero', () => {
    // Integer division would truncate to −412534 and Math.round would round toward +∞ to the
    // same −412534. Neither is this rule.
    expect(approximateUah(-10000, USD_RATE.rateMillionths)).toBe(-412535);
    expect(Math.round(-412534.5)).toBe(-412534);
  });

  it('An exact product needs no rounding at all', () => {
    expect(approximateUah(10000, 41_250_000)).toBe(412500);
    expect(approximateUah(-10000, 41_250_000)).toBe(-412500);
  });

  it('Below half rounds down, above half rounds up, in both directions', () => {
    // 1 minor unit at a rate of x millionths is x/1e6 — a direct handle on the fraction.
    expect(approximateUah(1, 499_999)).toBe(0);
    expect(approximateUah(1, 500_000)).toBe(1);
    expect(approximateUah(1, 500_001)).toBe(1);
    expect(approximateUah(-1, 499_999)).toBe(0);
    expect(approximateUah(-1, 500_000)).toBe(-1);
    expect(approximateUah(-1, 500_001)).toBe(-1);
  });

  it('Nothing rounds to a negative zero — there is no such amount of money', () => {
    // BigInt has no signed zero, which is why this holds; `Math.round(-0.4)` would give −0.
    expect(Object.is(approximateUah(-1, 499_999), 0)).toBe(true);
    expect(Object.is(approximateUah(-0, 500_000), 0)).toBe(true);
    expect(Object.is(Math.round(-0.4), -0)).toBe(true);
  });

  it('Zero converts to zero at any rate', () => {
    expect(approximateUah(0, USD_RATE.rateMillionths)).toBe(0);
  });

  it('A product past 2^53 is still exact — the reason this is BigInt', () => {
    // 1e9 minor units (10 million UAH-worth) × 41.25345: the product is ~4.1e16, well past the
    // safe-integer range, while the result is not.
    expect(10_000_000_00 * USD_RATE.rateMillionths).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(approximateUah(1_000_000_000, USD_RATE.rateMillionths)).toBe(41_253_450_000);
  });

  it('Conversion is symmetric about zero, for any amount and rate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 100_000_000 }),
        (amount, rateMillionths) => {
          const positive = approximateUah(amount, rateMillionths);
          // Zero has one sign here, so it is spelled out rather than negated.
          expect(approximateUah(-amount, rateMillionths)).toBe(positive === 0 ? 0 : -positive);
        },
      ),
    );
  });

  it('The result is never more than half a minor unit from the true value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000_000, max: 100_000_000 }),
        fc.integer({ min: 1, max: 100_000_000 }),
        (amount, rateMillionths) => {
          const exact = (amount * rateMillionths) / 1_000_000;
          expect(Math.abs(approximateUah(amount, rateMillionths) - exact)).toBeLessThanOrEqual(0.5);
        },
      ),
    );
  });
});

describe('approximatePicture', () => {
  it('Scenario: UAH joins the approximation unchanged', () => {
    const approximate = approximatePicture(
      pictureOf(['UAH', spentOnly(100000, 'UAH')], ['USD', spentOnly(10000, 'USD')]),
      [{ currency: 'USD', rateMillionths: 41_250_000 }],
    );

    // 100000 UAH + 10000 USD × 41.25 = 100000 + 412500.
    expect(approximate?.spent).toEqual(money(512500, 'UAH'));
  });

  it('Scenario: One unknown rate withholds the whole approximation', () => {
    const picture = pictureOf(
      ['UAH', spentOnly(100000, 'UAH')],
      ['USD', spentOnly(10000, 'USD')],
      ['EUR', spentOnly(5000, 'EUR')],
    );

    expect(approximatePicture(picture, [USD_RATE])).toBeNull();
    // With both rates it is produced, so it really is the missing EUR rate that withheld it.
    // 100000 UAH + 10000 USD × 41.25345 + 5000 EUR × 51.88 = 100000 + 412535 + 259400.
    expect(approximatePicture(picture, [USD_RATE, EUR_RATE])?.spent).toEqual(
      money(771935, 'UAH'),
    );
  });

  it('Scenario: A UAH-only month has nothing to approximate', () => {
    expect(approximatePicture(pictureOf(['UAH', spentOnly(100000, 'UAH')]), [USD_RATE])).toBeNull();
  });

  it('An empty month has nothing to approximate either', () => {
    expect(approximatePicture(pictureOf(), [USD_RATE])).toBeNull();
  });

  it('All six numbers are approximated, each in UAH', () => {
    const usd: MonthlyNumbers = {
      spent: money(10000, 'USD'),
      invested: money(20000, 'USD'),
      saved: money(30000, 'USD'),
      lent: money(40000, 'USD'),
      income: money(100000, 'USD'),
      left: money(0, 'USD'),
    };
    const approximate = approximatePicture(pictureOf(['USD', usd]), [
      { currency: 'USD', rateMillionths: 41_250_000 },
    ]);

    expect(approximate).toEqual({
      spent: money(412500, 'UAH'),
      invested: money(825000, 'UAH'),
      saved: money(1237500, 'UAH'),
      lent: money(1650000, 'UAH'),
      income: money(4125000, 'UAH'),
      left: money(0, 'UAH'),
    });
    for (const value of Object.values(approximate as unknown as Record<string, Money>)) {
      expect(value.currency).toBe('UAH');
    }
  });

  it('Scenario: Each number is approximated on its own', () => {
    // 3 minor USD of дохід against витрачено, інвестовано and позичено of 1 each. Every number is
    // rounded separately: 3 × 41.25345 = 123.76 → 124, while 1 × 41.25345 = 41.25 → 41 three
    // times over. The parts come to 123 — one kopiyka short of the whole, and that is accepted.
    const usd: MonthlyNumbers = {
      spent: money(1, 'USD'),
      invested: money(1, 'USD'),
      saved: money(0, 'USD'),
      lent: money(1, 'USD'),
      income: money(3, 'USD'),
      left: money(0, 'USD'),
    };
    const approximate = approximatePicture(pictureOf(['USD', usd]), [USD_RATE]);

    expect(approximate?.income).toEqual(money(124, 'UAH'));
    expect(approximate?.spent).toEqual(money(41, 'UAH'));
    expect(approximate?.invested).toEqual(money(41, 'UAH'));
    expect(approximate?.lent).toEqual(money(41, 'UAH'));
    expect(approximate?.saved).toEqual(money(0, 'UAH'));
    expect(approximate?.left).toEqual(money(0, 'UAH'));

    const parts = [
      approximate!.spent.amount,
      approximate!.invested.amount,
      approximate!.saved.amount,
      approximate!.lent.amount,
      approximate!.left.amount,
    ].reduce((a, b) => a + b, 0);
    expect(parts).toBe(123);
    expect(approximate!.income.amount - parts).toBe(1);

    // The per-currency numbers behind them still hold the identity exactly.
    expect(usd.income.amount).toBe(
      usd.spent.amount + usd.invested.amount + usd.saved.amount + usd.lent.amount + usd.left.amount,
    );
  });

  it('A rate for a currency the month never touched changes nothing', () => {
    const picture = pictureOf(['UAH', spentOnly(100000, 'UAH')], ['USD', spentOnly(10000, 'USD')]);

    expect(approximatePicture(picture, [USD_RATE, EUR_RATE])).toEqual(
      approximatePicture(picture, [USD_RATE]),
    );
  });

  it('A negative monthly number keeps its sign through the approximation', () => {
    // A jar emptied in USD: saved is negative, and so is its approximation.
    const usd = { ...spentOnly(0, 'USD'), saved: money(-10000, 'USD') };
    const approximate = approximatePicture(pictureOf(['USD', usd]), [USD_RATE]);

    expect(approximate?.saved).toEqual(money(-412535, 'UAH'));
  });

  it('A sum past the safe-integer range withholds the approximation rather than lying', () => {
    const absurd = { ...spentOnly(0, 'USD'), spent: money(Number.MAX_SAFE_INTEGER, 'USD') };

    expect(approximatePicture(pictureOf(['USD', absurd]), [USD_RATE])).toBeNull();
  });
});

describe('staleCurrencies / shouldRefreshRates', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);

  it('Scenario: Every rate fresh asks nothing', () => {
    const rates = [
      { currency: 'USD', obtainedAt: minutesAgo(5) },
      { currency: 'EUR', obtainedAt: minutesAgo(12) },
    ];

    expect(staleCurrencies(rates, now)).toEqual([]);
    expect(shouldRefreshRates(rates, now)).toBe(false);
  });

  it('Scenario: One stale currency is enough to ask again', () => {
    const rates = [
      { currency: 'USD', obtainedAt: minutesAgo(3) },
      { currency: 'EUR', obtainedAt: minutesAgo(60 * 24) },
    ];

    expect(staleCurrencies(rates, now)).toEqual(['EUR']);
    expect(shouldRefreshRates(rates, now)).toBe(true);
  });

  it('A fresh install, with nothing stored at all, asks', () => {
    expect(staleCurrencies([], now)).toEqual(['EUR', 'USD']);
    expect(shouldRefreshRates([], now)).toBe(true);
  });

  it('An hour old is not yet older than an hour', () => {
    const both = (obtainedAt: Date) => [
      { currency: 'USD', obtainedAt },
      { currency: 'EUR', obtainedAt },
    ];

    expect(shouldRefreshRates(both(new Date(now.getTime() - RATE_MAX_AGE_MS)), now)).toBe(false);
    expect(shouldRefreshRates(both(new Date(now.getTime() - RATE_MAX_AGE_MS - 1)), now)).toBe(true);
  });

  it('A rate stamped in the future counts as fresh — refetching would not fix a clock', () => {
    const ahead = new Date(now.getTime() + 60 * 60 * 1000);

    expect(
      shouldRefreshRates(
        [
          { currency: 'USD', obtainedAt: ahead },
          { currency: 'EUR', obtainedAt: ahead },
        ],
        now,
      ),
    ).toBe(false);
  });

  it('A partial answer leaves the other currency stale, however fresh what arrived is', () => {
    // monobank answered with USD alone — the endpoint dropped EUR, or the parser skipped a
    // malformed row. What was stored is as fresh as it gets, and the month is still not covered.
    //
    // This is why the month screen must not decide whether to ask from the cache it has just
    // written: doing so would re-arm the refresh on its own success and fetch forever. The screen
    // reads storage inside the effect and keeps this value out of its dependencies.
    const justStored = [{ currency: 'USD', obtainedAt: now }];

    expect(staleCurrencies(justStored, now)).toEqual(['EUR']);
    expect(shouldRefreshRates(justStored, now)).toBe(true);
  });

  it('A currency monobank never quotes for us cannot make anything stale', () => {
    // GBP is not in the whitelist, so storing one changes nothing either way.
    const rates = [
      { currency: 'USD', obtainedAt: minutesAgo(1) },
      { currency: 'EUR', obtainedAt: minutesAgo(1) },
      { currency: 'GBP', obtainedAt: minutesAgo(60 * 24 * 30) },
    ];

    expect(staleCurrencies(rates, now)).toEqual([]);
  });
});
