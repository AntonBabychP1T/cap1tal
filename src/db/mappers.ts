import { account, type Account, type AccountKind } from '../domain/account';
import { money, type Money } from '../domain/money';
import type { Rule } from '../domain/rules';
import { isoDate, type Transaction } from '../domain/transaction';

import type {
  AccountRow,
  NewAccountRow,
  NewTransactionRow,
  RuleRow,
  TransactionRow,
} from './schema';

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
    openingDate: a.openingDate ?? null,
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
    ...(row.openingDate !== null ? { openingDate: row.openingDate } : {}),
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
  description: null,
  mcc: null,
  fromAccountId: null,
  toAccountId: null,
  leftAmount: null,
  leftCurrency: null,
  arrivedAmount: null,
  arrivedCurrency: null,
};

export function toTransactionRow(t: Transaction): NewTransactionRow {
  // The опис belongs to all five types alike — the bank's text describes the money, not the shape
  // it was given — so it is written once here rather than in each branch. Absence is NULL, never
  // an empty string: a транзакція with no опис and one whose опис was cleared are the same thing.
  const common = {
    ...EMPTY_TRANSACTION,
    id: t.id,
    type: t.type,
    date: t.date,
    description: t.description ?? null,
    // The MCC rides beside the опис for the same reason: informational, on every type alike.
    mcc: t.mcc ?? null,
  };
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

/**
 * `awaiting` comes from a join with `counterpart_income_awaits` the caller already did — this
 * function does no query of its own. `true` only ever matters on a `transfer` row; every other
 * type ignores it, which is what "only a переказ ever awaits" means on the way out of storage.
 */
export function toTransaction(row: TransactionRow, awaiting?: boolean): Transaction {
  const date = isoDate(row.date);
  // Spread, never assigned: a row stored before the column existed loads with no `description`
  // property at all, exactly as a транзакція the owner recorded by hand does, so nothing
  // downstream can tell an old row from a new one without an опис.
  const description = {
    ...(row.description ? { description: row.description } : {}),
    ...(row.mcc === null || row.mcc === undefined ? {} : { mcc: row.mcc }),
  };
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
        ...description,
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
        ...description,
      };
    case 'refund':
      return {
        type: 'refund',
        id: row.id,
        date,
        accountId: required(row.accountId, 'account_id', row),
        amount: amountOf(row),
        categoryId: required(row.categoryId, 'category_id', row),
        ...description,
      };
    case 'correction':
      return {
        type: 'correction',
        id: row.id,
        date,
        accountId: required(row.accountId, 'account_id', row),
        amount: amountOf(row),
        ...description,
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
        ...(awaiting ? { awaitingCounterpartIncome: true } : {}),
        ...description,
      };
    default:
      throw new Error(`stored transaction "${row.id}" has an unknown type "${row.type}"`);
  }
}

/**
 * An absent criterion is NULL in the row and a missing key on the domain value — not a key set to
 * `undefined` — so a loaded rule is the value that was stored and not a lookalike. Storage's own
 * `rules_target_exactly_one` CHECK is what makes exactly one of `categoryId` / `toAccountId`
 * non-null true here; a row that violated it could never have been written.
 */
export function toRule(row: RuleRow): Rule {
  return {
    id: row.id,
    ...(row.merchant === null ? {} : { merchant: row.merchant }),
    ...(row.merchantId === null ? {} : { merchantId: row.merchantId }),
    ...(row.mcc === null ? {} : { mcc: row.mcc }),
    target:
      row.categoryId !== null
        ? { kind: 'category', categoryId: row.categoryId }
        : { kind: 'transfer', toAccountId: row.toAccountId! },
    createdAt: row.createdAt,
  };
}
