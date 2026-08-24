import { account, type Account, type AccountKind } from '../domain/account';
import { money, type Money } from '../domain/money';
import { isoDate, type Transaction } from '../domain/transaction';

import type { AccountRow, NewAccountRow, NewTransactionRow, TransactionRow } from './schema';

/**
 * Row ↔ domain mapping, total in both directions. Storage row types never leave src/db/:
 * repositories take and return domain values only. See design.md §9.
 */

const ACCOUNT_KINDS: readonly AccountKind[] = [
  'spending',
  'savings',
  'investment',
  'cash',
  'debt',
];

function accountKind(value: string): AccountKind {
  const kind = ACCOUNT_KINDS.find((candidate) => candidate === value);
  if (!kind) {
    throw new Error(`stored account kind is not a domain AccountKind: "${value}"`);
  }
  return kind;
}

function required<T>(value: T | null | undefined, column: string, row: { id: string }): T {
  if (value === null || value === undefined) {
    throw new Error(`stored transaction "${row.id}" is missing ${column}`);
  }
  return value;
}

export function toAccountRow(a: Account): NewAccountRow {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    currency: a.currency,
    openingAmount: a.openingBalance.amount,
    archived: a.archived,
  };
}

export function toAccount(row: AccountRow): Account {
  return account({
    id: row.id,
    name: row.name,
    kind: accountKind(row.kind),
    currency: row.currency,
    openingBalance: money(row.openingAmount, row.currency),
    archived: row.archived,
  });
}

/** Every column a transaction does not use is written as NULL, so no stale value can survive. */
const EMPTY_TRANSACTION: Omit<NewTransactionRow, 'id' | 'type' | 'date'> = {
  accountId: null,
  amount: null,
  currency: null,
  categoryId: null,
  sourceId: null,
  originalAmount: null,
  originalCurrency: null,
  fromAccountId: null,
  toAccountId: null,
  leftAmount: null,
  leftCurrency: null,
  arrivedAmount: null,
  arrivedCurrency: null,
};

export function toTransactionRow(t: Transaction): NewTransactionRow {
  const common = { ...EMPTY_TRANSACTION, id: t.id, type: t.type, date: t.date };
  switch (t.type) {
    case 'expense':
      return {
        ...common,
        accountId: t.accountId,
        amount: t.amount.amount,
        currency: t.amount.currency,
        categoryId: t.categoryId,
        originalAmount: t.originalAmount?.amount ?? null,
        originalCurrency: t.originalAmount?.currency ?? null,
      };
    case 'income':
      return {
        ...common,
        accountId: t.accountId,
        amount: t.amount.amount,
        currency: t.amount.currency,
        sourceId: t.sourceId,
      };
    case 'refund':
      return {
        ...common,
        accountId: t.accountId,
        amount: t.amount.amount,
        currency: t.amount.currency,
        categoryId: t.categoryId,
      };
    case 'correction':
      return {
        ...common,
        accountId: t.accountId,
        amount: t.amount.amount,
        currency: t.amount.currency,
      };
    case 'transfer':
      return {
        ...common,
        fromAccountId: t.fromAccountId,
        toAccountId: t.toAccountId,
        leftAmount: t.left.amount,
        leftCurrency: t.left.currency,
        arrivedAmount: t.arrived.amount,
        arrivedCurrency: t.arrived.currency,
      };
  }
}

function amountOf(row: TransactionRow): Money {
  return money(required(row.amount, 'amount', row), required(row.currency, 'currency', row));
}

export function toTransaction(row: TransactionRow): Transaction {
  const date = isoDate(row.date);
  switch (row.type) {
    case 'expense': {
      const originalAmount =
        row.originalAmount === null || row.originalCurrency === null
          ? undefined
          : money(row.originalAmount, row.originalCurrency);
      return {
        type: 'expense',
        id: row.id,
        date,
        accountId: required(row.accountId, 'account_id', row),
        amount: amountOf(row),
        categoryId: required(row.categoryId, 'category_id', row),
        ...(originalAmount ? { originalAmount } : {}),
      };
    }
    case 'income':
      return {
        type: 'income',
        id: row.id,
        date,
        accountId: required(row.accountId, 'account_id', row),
        amount: amountOf(row),
        sourceId: required(row.sourceId, 'source_id', row),
      };
    case 'refund':
      return {
        type: 'refund',
        id: row.id,
        date,
        accountId: required(row.accountId, 'account_id', row),
        amount: amountOf(row),
        categoryId: required(row.categoryId, 'category_id', row),
      };
    case 'correction':
      return {
        type: 'correction',
        id: row.id,
        date,
        accountId: required(row.accountId, 'account_id', row),
        amount: amountOf(row),
      };
    case 'transfer':
      return {
        type: 'transfer',
        id: row.id,
        date,
        fromAccountId: required(row.fromAccountId, 'from_account_id', row),
        toAccountId: required(row.toAccountId, 'to_account_id', row),
        left: money(
          required(row.leftAmount, 'left_amount', row),
          required(row.leftCurrency, 'left_currency', row),
        ),
        arrived: money(
          required(row.arrivedAmount, 'arrived_amount', row),
          required(row.arrivedCurrency, 'arrived_currency', row),
        ),
      };
    default:
      throw new Error(`stored transaction "${row.id}" has an unknown type "${row.type}"`);
  }
}
