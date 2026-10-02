import { money, type CurrencyCode } from '../domain/money';
import type {
  Correction,
  Expense,
  Income,
  IsoDate,
  Month,
  Refund,
  Transfer,
} from '../domain/transaction';

/**
 * Plain транзакції for the detector tests — test-only, like `src/progress/fixtures.ts`: imported by
 * tests and by nothing under `src/app/`, so Metro never bundles it. Ids are given or counted per
 * builder, so one test's history is the same on every run.
 */
export function ledgerBuilder() {
  let n = 0;
  const idOf = (prefix: string, given?: string) => given ?? `${prefix}-${String(++n).padStart(4, '0')}`;
  return {
    expense(
      date: IsoDate,
      categoryId: string,
      amount: number,
      opts: { id?: string; currency?: CurrencyCode; accountId?: string; description?: string } = {},
    ): Expense {
      return {
        type: 'expense',
        id: idOf('e', opts.id),
        date,
        accountId: opts.accountId ?? 'black',
        amount: money(amount, opts.currency ?? 'UAH'),
        categoryId,
        ...(opts.description ? { description: opts.description } : {}),
      };
    },
    refund(
      date: IsoDate,
      categoryId: string,
      amount: number,
      opts: { id?: string; currency?: CurrencyCode; accountId?: string } = {},
    ): Refund {
      return {
        type: 'refund',
        id: idOf('r', opts.id),
        date,
        accountId: opts.accountId ?? 'black',
        amount: money(amount, opts.currency ?? 'UAH'),
        categoryId,
      };
    },
    income(
      date: IsoDate,
      amount: number,
      opts: { id?: string; currency?: CurrencyCode; accountId?: string; sourceId?: string } = {},
    ): Income {
      return {
        type: 'income',
        id: idOf('i', opts.id),
        date,
        accountId: opts.accountId ?? 'black',
        amount: money(amount, opts.currency ?? 'UAH'),
        sourceId: opts.sourceId ?? 'salary',
      };
    },
    correction(
      date: IsoDate,
      amount: number,
      opts: { id?: string; currency?: CurrencyCode; accountId?: string } = {},
    ): Correction {
      return {
        type: 'correction',
        id: idOf('c', opts.id),
        date,
        accountId: opts.accountId ?? 'black',
        amount: money(amount, opts.currency ?? 'UAH'),
      };
    },
    transfer(
      date: IsoDate,
      from: string,
      to: string,
      left: number,
      opts: { id?: string; currency?: CurrencyCode; arrived?: number; arrivedCurrency?: CurrencyCode } = {},
    ): Transfer {
      return {
        type: 'transfer',
        id: idOf('t', opts.id),
        date,
        fromAccountId: from,
        toAccountId: to,
        left: money(left, opts.currency ?? 'UAH'),
        arrived: money(opts.arrived ?? left, opts.arrivedCurrency ?? opts.currency ?? 'UAH'),
      };
    },
  };
}

/** Every calendar month from `first` through `last`, oldest first. */
export function monthsFrom(first: Month, last: Month): Month[] {
  const months: Month[] = [];
  let [year, month] = first.split('-').map(Number) as [number, number];
  for (;;) {
    const current = `${year}-${String(month).padStart(2, '0')}`;
    months.push(current);
    if (current === last) return months;
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
}
