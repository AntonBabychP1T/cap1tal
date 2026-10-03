import { describe, expect, it } from 'vitest';

import { money } from '../domain/money';
import type { Transaction } from '../domain/transaction';
import { completedMonthsIn } from '../progress/norm';
import { EMPTY_SUMMARY, type MonthRow, type ProgressSummary } from '../progress/summary';
import { ledgerBuilder, monthsFrom } from './test-fixtures';
import {
  baselineOf,
  currenciesOfTransaction,
  finishedActiveMonths,
  ledgerOf,
  noticeableOf,
  typicalOf,
  typicalSpentOf,
  windowOf,
} from './window';

const TODAY = '2026-10-02';

describe('the window a month is read against', () => {
  it('Scenario: Six finished months make the window', () => {
    const b = ledgerBuilder();
    const history = monthsFrom('2026-01', '2026-10').map((month) =>
      b.expense(`${month}-01`, 'food', 100000),
    );
    const ledger = ledgerOf(history, TODAY);

    expect(windowOf(ledger, '2026-09', 'UAH')).toEqual(monthsFrom('2026-03', '2026-08'));
    expect(windowOf(ledger, '2026-10', 'UAH')).toEqual(monthsFrom('2026-04', '2026-09'));
  });

  it('Scenario: A month without the категорія counts as zero', () => {
    const b = ledgerBuilder();
    const history = monthsFrom('2026-03', '2026-08').map((month) =>
      b.expense(`${month}-05`, 'food', 1000000),
    );
    history.push(b.expense('2026-04-10', 'travel', 800000), b.expense('2026-07-10', 'travel', 1200000));
    const ledger = ledgerOf(history, TODAY);
    const window = windowOf(ledger, '2026-09', 'UAH')!;

    expect(window).toHaveLength(6);
    expect(typicalOf(ledger, window, 'UAH', 'travel')).toEqual(money(0, 'UAH'));
  });

  it('Scenario: A повернення lowers the month it lands in', () => {
    const b = ledgerBuilder();
    const ledger = ledgerOf(
      [
        b.expense('2026-06-03', 'food', 1100000),
        b.refund('2026-06-20', 'food', 100000),
        b.expense('2026-07-03', 'food', 900000),
        b.expense('2026-08-03', 'food', 1200000),
      ],
      TODAY,
    );
    const window = windowOf(ledger, '2026-09', 'UAH')!;

    expect(ledger.breakdown('2026-06', 'UAH').get('food')).toEqual(money(1000000, 'UAH'));
    // The middle of 1 000 000, 900 000 and 1 200 000 — not of 1 100 000, which ignoring the
    // повернення would give.
    expect(typicalOf(ledger, window, 'UAH', 'food')).toEqual(money(1000000, 'UAH'));
  });

  it('Scenario: Two finished months are not enough', () => {
    const b = ledgerBuilder();
    const ledger = ledgerOf(
      [
        ...monthsFrom('2026-01', '2026-10').map((month) => b.expense(`${month}-02`, 'food', 50000)),
        b.expense('2026-08-02', 'food', 5000, { currency: 'USD', accountId: 'usd' }),
        b.expense('2026-09-02', 'food', 7000, { currency: 'USD', accountId: 'usd' }),
        b.expense('2026-10-01', 'food', 9000, { currency: 'USD', accountId: 'usd' }),
      ],
      TODAY,
    );

    expect(windowOf(ledger, '2026-10', 'USD')).toBeNull();
    expect(baselineOf(ledger, '2026-10', 'USD')).toBeNull();
    // UAH, beside it, has its six.
    expect(baselineOf(ledger, '2026-10', 'UAH')?.window).toHaveLength(6);
  });

  it('Scenario: The поріг is three per cent of the typical month', () => {
    expect(noticeableOf(money(6000000, 'UAH'))).toEqual(money(180000, 'UAH'));

    const b = ledgerBuilder();
    const ledger = ledgerOf(
      [
        b.expense('2026-06-03', 'food', 5000000),
        b.expense('2026-07-03', 'food', 6000000),
        b.expense('2026-08-03', 'food', 7000000),
      ],
      TODAY,
    );
    const baseline = baselineOf(ledger, '2026-09', 'UAH')!;
    expect(baseline.typicalSpent).toEqual(money(6000000, 'UAH'));
    expect(baseline.noticeable).toEqual(money(180000, 'UAH'));
  });

  it('rounds the поріг half away from zero, and an even median the same way', () => {
    // 3 % of 50 is 1.5 → 2.
    expect(noticeableOf(money(50, 'UAH'))).toEqual(money(2, 'UAH'));
    const b = ledgerBuilder();
    const ledger = ledgerOf(
      monthsFrom('2026-03', '2026-08').map((month, i) => b.expense(`${month}-03`, 'food', 1000 + i)),
      TODAY,
    );
    // 1000…1005: the two middle values are 1002 and 1003, and their mean 1002.5 rounds to 1003.
    expect(typicalSpentOf(ledger, windowOf(ledger, '2026-09', 'UAH')!, 'UAH')).toEqual(money(1003, 'UAH'));
  });

  it('has no типова сума when the typical витрачено is not positive', () => {
    const b = ledgerBuilder();
    const ledger = ledgerOf(
      monthsFrom('2026-06', '2026-08').map((month) => b.income(`${month}-01`, 5000000)),
      TODAY,
    );
    expect(windowOf(ledger, '2026-09', 'UAH')).toHaveLength(3);
    expect(baselineOf(ledger, '2026-09', 'UAH')).toBeNull();
  });
});

/** A зведення прогресу's month rows, as `progress-repo` counts them, from the same транзакції. */
function summaryOf(transactions: readonly Transaction[]): ProgressSummary {
  const rows = new Map<string, MonthRow>();
  for (const t of transactions) {
    for (const currency of currenciesOfTransaction(t)) {
      const key = `${t.date.slice(0, 7)}:${currency}`;
      const row = rows.get(key) ?? {
        month: t.date.slice(0, 7),
        currency,
        spent: 0,
        income: 0,
        invested: 0,
        saved: 0,
        transactions: 0,
        uncategorised: 0,
        unsourced: 0,
      };
      rows.set(key, { ...row, transactions: row.transactions + 1 });
    }
  }
  return { ...EMPTY_SUMMARY, months: [...rows.values()] };
}

describe('one definition of a завершений активний місяць (design D2)', () => {
  it('names the same months as the місячна норма витрат, currency by currency', () => {
    const b = ledgerBuilder();
    const history: Transaction[] = [
      b.expense('2026-01-15', 'food', 1000),
      // A month of перекази alone is active in its currency.
      b.transfer('2026-02-10', 'black', 'jar', 50000),
      // A month of a дохід alone is active too.
      b.income('2026-03-01', 70000),
      // A переказ across currencies makes its month active in both.
      b.transfer('2026-04-05', 'black', 'usd', 410000, { arrived: 10000, arrivedCurrency: 'USD' }),
      b.expense('2026-05-20', 'food', 300, { currency: 'USD', accountId: 'usd' }),
      b.correction('2026-06-30', -2500),
      // The current month is never finished, and a month ahead of it is not either.
      b.expense('2026-10-01', 'food', 400),
      b.expense('2026-11-03', 'food', 400),
      b.expense('2026-09-30', 'food', 100, { currency: 'EUR', accountId: 'eur' }),
    ];
    const ledger = ledgerOf(history, TODAY);
    const summary = summaryOf(history);

    for (const currency of ['UAH', 'USD', 'EUR', 'PLN']) {
      expect(finishedActiveMonths(ledger, currency)).toEqual(completedMonthsIn(summary, currency, TODAY));
    }
    expect(finishedActiveMonths(ledger, 'UAH')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-06',
    ]);
    expect(finishedActiveMonths(ledger, 'USD')).toEqual(['2026-04', '2026-05']);
    expect(finishedActiveMonths(ledger, 'EUR')).toEqual(['2026-09']);
  });
});
