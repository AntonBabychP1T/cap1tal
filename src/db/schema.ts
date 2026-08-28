import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
 * The owner's flat vocabulary for "where did the money go": one editable row per expense
 * category. No hierarchy and no tags — the vision keeps the list flat.
 *
 * There is deliberately no `reserved` column: reservedness is "the id is one of the domain's
 * three constants", decided in `src/domain/transaction.ts`, and a column could drift from them.
 * Names are unique among unarchived rows, which is enforced in the repository — a partial unique
 * index cannot express "unarchived only" and the repository is the only writer.
 */
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Archived rows keep their history; they are offered in no picker. */
  archived: integer('archived', { mode: 'boolean' }).notNull().default(sql`0`),
});

/** The other half of the vocabulary: where money came from. Same shape as `categories`. */
export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(sql`0`),
});

/**
 * A правило автокатегоризації: "merchant and/or MCC → one category". Nothing applies these yet —
 * the importers of steps 6–8 do; this change stores and edits them.
 *
 * `createdAt` is domain data here, not storage metadata: the matching order uses it as the
 * tie-break between two rules that are equally specific.
 */
export const rules = sqliteTable(
  'rules',
  {
    id: text('id').primaryKey(),
    /** A substring of the merchant description; NULL when the rule matches on MCC alone. */
    merchant: text('merchant'),
    /** ISO-18245 merchant category code; NULL when the rule matches on the merchant alone. */
    mcc: integer('mcc'),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    check('rules_criterion_present', sql`${t.merchant} IS NOT NULL OR ${t.mcc} IS NOT NULL`),
    check('rules_merchant_not_blank', sql`${t.merchant} IS NULL OR length(trim(${t.merchant})) > 0`),
  ],
);

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

    /** expense | refund. */
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    /** income. */
    sourceId: text('source_id').references(() => sources.id, { onDelete: 'restrict' }),

    /** expense only, informational: what the merchant charged in its own currency. */
    originalAmount: integer('original_amount'),
    originalCurrency: text('original_currency'),

    /**
     * The опис: the text the bank sent with an imported транзакція. Informational for every one of
     * the five types — no total, balance or classification reads it — so it sits outside the shape
     * CHECK, and a транзакція without one stores NULL rather than an empty string.
     */
    description: text('description'),

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

// No `CategoryRow` / `SourceRow` aliases: `named-list-repo.ts` is the only reader of those two
// tables and it takes the table itself, so an alias would be a name nothing says.
export type RuleRow = typeof rules.$inferSelect;
export type NewRuleRow = typeof rules.$inferInsert;

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;
export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;

/**
 * The cached monobank rate, one row per currency — a cache, not a record of anything the owner
 * did. Losing it loses only the approximate UAH figure until a rate is obtained again.
 *
 * A rate is a ratio, not money, so the amount-plus-currency pairing rule does not apply — but
 * `real` stays banned all the same: the rate is stored as integer millionths, exactly as
 * `src/monobank/currency.ts` produces it, so nothing downstream ever sees a float.
 */
export const monobankRates = sqliteTable(
  'monobank_rates',
  {
    /** ISO-4217 letters, the same vocabulary as every other currency column. */
    currency: text('currency').primaryKey(),
    /** UAH per one unit of `currency`, ×1e6. */
    rateMillionths: integer('rate_millionths').notNull(),
    obtainedAt: integer('obtained_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [check('monobank_rates_rate_positive', sql`${t.rateMillionths} > 0`)],
);

export type MonobankRateRow = typeof monobankRates.$inferSelect;
export type NewMonobankRateRow = typeof monobankRates.$inferInsert;

/**
 * That the one-time Saldo import has been committed, and when. Exactly one row, under a fixed id,
 * because the fact is about the device and not about any particular import.
 *
 * It exists to make committing a second plan a deliberate act: a second commit silently doubles
 * the whole history, and nothing else on the device could tell the difference — the owner
 * legitimately records транзакції by hand before importing, so "storage is not empty" says
 * nothing. It is written inside the import's own transaction, so a commit that fails leaves no
 * marker behind.
 */
export const saldoImport = sqliteTable(
  'saldo_import',
  {
    /** Always `'saldo'`; the CHECK is what keeps the table to one row. */
    id: text('id').primaryKey(),
    committedAt: integer('committed_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [check('saldo_import_single_row', sql`${t.id} = 'saldo'`)],
);

export type SaldoImportRow = typeof saldoImport.$inferSelect;
export type NewSaldoImportRow = typeof saldoImport.$inferInsert;

/**
 * The monobank accounts a validated token has shown us — bank identity, cached and kept apart
 * from any link (design D3). Unlinking deletes the link, never this row: the last known баланс
 * банку, the name the bank gave and — through `monobank_imported_items` — the memory of what has
 * already been imported all survive it, so relinking can never import an item twice.
 *
 * There is no row and no column here for the token. It lives in the device's secure storage and
 * in nothing else — see `src/platform/monobank-token.ts`.
 */
export const monobankAccounts = sqliteTable(
  'monobank_accounts',
  {
    /** monobank's own opaque id for the card or банка. */
    id: text('id').primaryKey(),
    /** 'card' | 'jar' — the two shapes client-info returns. */
    kind: text('kind').notNull(),
    /** What the bank calls it: `black ··1234` for a card, its title for a банка. */
    name: text('name').notNull(),
    currency: text('currency').notNull(),
    /**
     * Баланс банку — the owner's own money, the credit limit already subtracted, in integer minor
     * units of `currency` beside it. A cache of an observation, never the розрахунковий баланс:
     * that one stays "opening balance plus транзакції" in the domain.
     */
    bankBalanceAmount: integer('bank_balance_amount').notNull(),
    /** When that balance was fetched, so a stale figure can say how stale it is. */
    obtainedAt: integer('obtained_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [check('monobank_accounts_kind_known', sql`${t.kind} IN ('card', 'jar')`)],
);

/**
 * One monobank account *is* one рахунок. Both directions are unique — the primary key on the
 * monobank side, the unique index on the app side — because two statements into one рахунок would
 * double every витрата and one statement into two would put the same money in two places
 * (`src/monobank/link.ts` says the same thing in the domain's words).
 *
 * `onDelete: 'restrict'` on both: no path deletes a monobank identity, and рахунки archive rather
 * than delete, so neither reference can be left dangling.
 */
export const monobankLinks = sqliteTable(
  'monobank_links',
  {
    monobankAccountId: text('monobank_account_id')
      .primaryKey()
      .references(() => monobankAccounts.id, { onDelete: 'restrict' }),
    accountId: text('account_id')
      .notNull()
      .unique()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    /**
     * The inclusive calendar date the owner confirmed as the first day sync may import — an
     * `IsoDate` stored verbatim, as every other date column is, so it invents no time of day.
     */
    syncStartDate: text('sync_start_date').notNull(),
    /**
     * The high-water mark: everything up to and including this instant has been imported *and*
     * committed. It starts at the device-local midnight of `sync_start_date` and moves only when
     * a whole planned window has been stored (design D4). Both ends of a window are inclusive, so
     * the next run may see the item exactly here again — the imported ids make that harmless.
     */
    cursorMs: integer('cursor_ms', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    check(
      'monobank_links_start_date_iso',
      sql`${t.syncStartDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
  ],
);

/**
 * Every monobank item id this device has ever imported, per bank account. The one memory that
 * makes "at most once, forever" true: it references the *bank* account, never the транзакція, so
 * editing, retyping or deleting a транзакція — or unlinking and linking again — cannot bring an
 * item back. The pair is the key because two accounts may legitimately see the same id.
 *
 * An item that produced no транзакція (a zero-amount row) is remembered too, so it is not
 * re-examined forever.
 */
export const monobankImportedItems = sqliteTable(
  'monobank_imported_items',
  {
    monobankAccountId: text('monobank_account_id')
      .notNull()
      .references(() => monobankAccounts.id, { onDelete: 'restrict' }),
    itemId: text('item_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.monobankAccountId, t.itemId] })],
);

export type MonobankAccountRow = typeof monobankAccounts.$inferSelect;
export type NewMonobankAccountRow = typeof monobankAccounts.$inferInsert;
export type MonobankLinkRow = typeof monobankLinks.$inferSelect;
export type NewMonobankLinkRow = typeof monobankLinks.$inferInsert;
export type MonobankImportedItemRow = typeof monobankImportedItems.$inferSelect;

