import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * A faithful projection of the domain types — no shape is invented here.
 * See openspec/changes/db-schema/design.md and .claude/rules/database.md.
 *
 * Money is always an integer minor-unit column next to its ISO-4217 currency column; never `real`.
 * Ids are app-generated TEXT so export/import can preserve them.
 */
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** 'spending' | 'savings' | 'investment' | 'cash' | 'debt' — the domain AccountKind. */
  kind: text('kind').notNull(),
  currency: text('currency').notNull(),
  /** The opening balance, always in the account's own currency — hence no second column. */
  openingAmount: integer('opening_amount').notNull().default(0),
  /** Archived accounts keep history and balance; they are offered for no new transaction. */
  archived: integer('archived', { mode: 'boolean' }).notNull().default(sql`0`),
});

/**
 * One row per transaction, all five types in one table with a `type` discriminator: month and
 * account listings read every type together, and the id space is shared (retyping an expense
 * into a transfer keeps the id). CHECK constraints keep each row to exactly one valid shape.
 *
 * The date is the domain's IsoDate verbatim — TEXT 'YYYY-MM-DD', a calendar date and not an
 * instant, so month listings are lexicographic ranges and never depend on a device timezone.
 */
export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    date: text('date').notNull(),

    /**
     * Storage metadata, not domain: when the row was first inserted. It breaks ties between
     * transactions of the same calendar date in the latest listing, and is deliberately left out
     * of the update set so replacing a transaction keeps its place.
     */
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(sql`0`),

    /** expense | income | refund | correction — the single account touched. */
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    amount: integer('amount'),
    currency: text('currency'),

    /** expense | refund. Plain TEXT: the categories table arrives with categories-rules. */
    categoryId: text('category_id'),
    /** income. Plain TEXT: the sources table arrives with categories-rules. */
    sourceId: text('source_id'),

    /** expense only, informational: what the merchant charged in its own currency. */
    originalAmount: integer('original_amount'),
    originalCurrency: text('original_currency'),

    /** transfer only: the two accounts and the two legs, each in its account's currency. */
    fromAccountId: text('from_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    toAccountId: text('to_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    leftAmount: integer('left_amount'),
    leftCurrency: text('left_currency'),
    arrivedAmount: integer('arrived_amount'),
    arrivedCurrency: text('arrived_currency'),
  },
  (t) => [
    check('transactions_type_known', sql`${t.type} IN ('expense', 'income', 'transfer', 'refund', 'correction')`),
    check('transactions_date_iso', sql`${t.date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
    check(
      'transactions_original_amount_paired',
      sql`(${t.originalAmount} IS NULL) = (${t.originalCurrency} IS NULL)`,
    ),
    check(
      'transactions_shape',
      sql`CASE ${t.type}
        WHEN 'transfer' THEN
          ${t.fromAccountId} IS NOT NULL AND ${t.toAccountId} IS NOT NULL
          AND ${t.fromAccountId} <> ${t.toAccountId}
          AND ${t.leftAmount} IS NOT NULL AND ${t.leftCurrency} IS NOT NULL
          AND ${t.arrivedAmount} IS NOT NULL AND ${t.arrivedCurrency} IS NOT NULL
          AND ${t.accountId} IS NULL AND ${t.amount} IS NULL AND ${t.currency} IS NULL
          AND ${t.categoryId} IS NULL AND ${t.sourceId} IS NULL
          AND ${t.originalAmount} IS NULL
        ELSE
          ${t.accountId} IS NOT NULL AND ${t.amount} IS NOT NULL AND ${t.currency} IS NOT NULL
          AND ${t.fromAccountId} IS NULL AND ${t.toAccountId} IS NULL
          AND ${t.leftAmount} IS NULL AND ${t.leftCurrency} IS NULL
          AND ${t.arrivedAmount} IS NULL AND ${t.arrivedCurrency} IS NULL
          AND (CASE ${t.type}
            WHEN 'income' THEN ${t.sourceId} IS NOT NULL AND ${t.categoryId} IS NULL
                                AND ${t.originalAmount} IS NULL
            WHEN 'correction' THEN ${t.sourceId} IS NULL AND ${t.categoryId} IS NULL
                                AND ${t.originalAmount} IS NULL
            WHEN 'refund' THEN ${t.categoryId} IS NOT NULL AND ${t.sourceId} IS NULL
                                AND ${t.originalAmount} IS NULL
            ELSE ${t.categoryId} IS NOT NULL AND ${t.sourceId} IS NULL
          END)
      END`,
    ),
    index('transactions_date_idx').on(t.date),
    index('transactions_account_idx').on(t.accountId),
    index('transactions_from_account_idx').on(t.fromAccountId),
    index('transactions_to_account_idx').on(t.toAccountId),
  ],
);

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;
export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
