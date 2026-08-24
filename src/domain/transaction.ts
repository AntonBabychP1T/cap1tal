import { money, type Money } from './money';

/**
 * Reserved category ids for categories the domain itself refers to. The
 * editable category list (and the mapping of these ids onto seeded rows)
 * arrives with the categories-rules change.
 */
export const FEES_CATEGORY_ID = 'fees';
export const CORRECTION_CATEGORY_ID = 'correction';
export const UNCATEGORISED_CATEGORY_ID = 'uncategorised';

/** A calendar date as 'YYYY-MM-DD'. No Date objects in the domain. */
export type IsoDate = string;

/** A calendar month as 'YYYY-MM'. */
export type Month = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isoDate(value: string): IsoDate {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new Error(`date must be YYYY-MM-DD, got "${value}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`not a calendar date: "${value}"`);
  }
  return value;
}

export function monthOf(date: IsoDate): Month {
  return date.slice(0, 7);
}

export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund' | 'correction';

/**
 * Money leaving an account to the outside world. For a foreign-currency
 * purchase from a UAH card the amount is the UAH the bank charged and
 * originalAmount keeps the merchant-currency figure for information only.
 */
export interface Expense {
  readonly type: 'expense';
  readonly id: string;
  readonly date: IsoDate;
  readonly accountId: string;
  readonly amount: Money;
  readonly categoryId: string;
  readonly originalAmount?: Money;
}

export interface Income {
  readonly type: 'income';
  readonly id: string;
  readonly date: IsoDate;
  readonly accountId: string;
  readonly amount: Money;
  readonly sourceId: string;
}

/**
 * Money moving between two of the owner's own accounts. `left` is the amount
 * that left the source account, `arrived` the amount that arrived at the
 * destination, each in its account's currency; no exchange rate exists.
 */
export interface Transfer {
  readonly type: 'transfer';
  readonly id: string;
  readonly date: IsoDate;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly left: Money;
  readonly arrived: Money;
}

/** A negative expense in the original category; amount stays positive here. */
export interface Refund {
  readonly type: 'refund';
  readonly id: string;
  readonly date: IsoDate;
  readonly accountId: string;
  readonly amount: Money;
  readonly categoryId: string;
}

/**
 * Absorbs a disagreement between reality and the app. Its category is fixed
 * (CORRECTION_CATEGORY_ID); the signed amount decides spent (< 0) vs income (> 0).
 */
export interface Correction {
  readonly type: 'correction';
  readonly id: string;
  readonly date: IsoDate;
  readonly accountId: string;
  readonly amount: Money;
}

export type Transaction = Expense | Income | Transfer | Refund | Correction;

/**
 * The one place the default lives: every transaction is an expense until
 * explicitly typed otherwise, and an expense no rule recognised lands in
 * "Uncategorised".
 */
export function expenseByDefault(input: {
  id: string;
  date: IsoDate;
  accountId: string;
  amount: Money;
  categoryId?: string;
  originalAmount?: Money;
}): Expense {
  return {
    type: 'expense',
    id: input.id,
    date: isoDate(input.date),
    accountId: input.accountId,
    amount: input.amount,
    categoryId: input.categoryId ?? UNCATEGORISED_CATEGORY_ID,
    ...(input.originalAmount ? { originalAmount: input.originalAmount } : {}),
  };
}

export function transfer(input: {
  id: string;
  date: IsoDate;
  fromAccountId: string;
  toAccountId: string;
  left: Money;
  arrived: Money;
}): Transfer {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('a transfer connects two distinct accounts');
  }
  if (input.left.amount <= 0 || input.arrived.amount <= 0) {
    throw new Error('transfer legs must be positive amounts');
  }
  return {
    type: 'transfer',
    id: input.id,
    date: isoDate(input.date),
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    left: input.left,
    arrived: input.arrived,
  };
}

/**
 * The difference of a same-currency transfer that arrived short, as a "Fees"
 * expense on the source account. A proposal only: it has no id, and recording
 * it is the caller's decision. Cross-currency transfers propose nothing — the
 * rate is whatever the bank gave.
 */
export function proposeFee(t: Transfer): Omit<Expense, 'id'> | null {
  if (t.left.currency !== t.arrived.currency) {
    return null;
  }
  const shortfall = t.left.amount - t.arrived.amount;
  if (shortfall <= 0) {
    return null;
  }
  return {
    type: 'expense',
    date: t.date,
    accountId: t.fromAccountId,
    amount: money(shortfall, t.left.currency),
    categoryId: FEES_CATEGORY_ID,
  };
}

export function refund(input: {
  id: string;
  date: IsoDate;
  accountId: string;
  amount: Money;
  categoryId: string;
}): Refund {
  if (input.amount.amount <= 0) {
    throw new Error('a refund amount is positive; it reduces spent by itself');
  }
  return {
    type: 'refund',
    id: input.id,
    date: isoDate(input.date),
    accountId: input.accountId,
    amount: input.amount,
    categoryId: input.categoryId,
  };
}
