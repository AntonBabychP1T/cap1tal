import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

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
    /**
     * When a sync last *completed* for this link, or nothing at all for a link that has never
     * synced — which is what every existing row reads back as, and what is true of what the device
     * can prove. Nullable rather than defaulted: a moment of zero is 1970, and a link that has
     * never synced has no moment, not an ancient one.
     *
     * Not `monobank_accounts.obtained_at`, which a client-info fetch moves as well and therefore
     * answers "when the bank last told us a баланс". On the link, so unlinking takes it away: a
     * link is the thing that syncs, and a relinked account has not synced under its new boundary.
     */
    lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }),
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

/**
 * A category's ліміт: the optional monthly ceiling the limits capability defines. Its own table
 * rather than two nullable columns on `categories` — the primary key *is* "at most one ліміт per
 * category", setting is an upsert and clearing a delete, and a half-set pair (a сума without its
 * currency) is not representable. The same argument shaped `rules`: a thing that points at a
 * category is its own table (design D1).
 *
 * `onDelete: 'restrict'` like every other reference to a категорія: категорії archive rather than
 * delete, and archiving keeps the ліміт (limits: "Archiving keeps the ліміт").
 */
export const categoryLimits = sqliteTable(
  'category_limits',
  {
    categoryId: text('category_id')
      .primaryKey()
      .references(() => categories.id, { onDelete: 'restrict' }),
    /** Integer minor units, beside the currency code it is measured in — never one without the other. */
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
  },
  (t) => [check('category_limits_amount_positive', sql`${t.amount} > 0`)],
);

/**
 * A ціль: «відкласти N до дати» on one рахунок. No progress column — progress is the linked
 * рахунок's розрахунковий баланс, read when the ціль is shown, so no second number can drift from
 * the stored truth (goals: "Progress is the linked рахунок's розрахунковий баланс").
 *
 * The currency column stays even though the рахунок has one: an amount without its currency code
 * would be the first such amount in the schema. That the two agree is `goals-repo`'s check — a
 * read-and-compare, not a trigger — since SQLite cannot express it as a constraint (design D2).
 *
 * `deadline` is the domain's `IsoDate` verbatim, TEXT 'YYYY-MM-DD', exactly as a транзакція's date
 * is: a calendar date, not an instant, so no device timezone can move it.
 */
export const goals = sqliteTable(
  'goals',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull(),
    deadline: text('deadline').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
  },
  (t) => [
    check('goals_amount_positive', sql`${t.amount} > 0`),
    check('goals_name_not_blank', sql`length(trim(${t.name})) > 0`),
    check('goals_deadline_iso', sql`${t.deadline} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  ],
);

export type CategoryLimitRow = typeof categoryLimits.$inferSelect;
export type NewCategoryLimitRow = typeof categoryLimits.$inferInsert;
export type GoalRow = typeof goals.$inferSelect;
export type NewGoalRow = typeof goals.$inferInsert;

/**
 * One app the owner opted into reading, and the рахунок its notifications land on. The package
 * name is the key: one app maps to exactly one рахунок, and a second watch on it would leave a
 * notification with two places it could land (`addWatch` says the same in the domain's words).
 *
 * No currency column, deliberately. A watch's currency is the рахунок's, and the repository joins
 * `accounts` on read — so the `Watch.currency` the engine decides сума in cannot drift from the
 * рахунок the money actually sits on. `onDelete: 'restrict'` like every other reference to a
 * рахунок: рахунки archive rather than delete, and an archived one keeps its watch.
 */
export const notificationWatches = sqliteTable('notification_watches', {
  packageName: text('package_name').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'restrict' }),
});

/**
 * Every captured notification this device has already decided, by the engine's fingerprint — the
 * plain joined string `fingerprintOf` builds, stored verbatim (bank-notifications design D3).
 *
 * It is the whole of "this notification never yields twice", and it deliberately references
 * nothing: not the чернетка it drafted, not the транзакція it became. Confirming, dismissing,
 * editing or deleting what came of it leaves the row exactly where it is, so Android re-posting
 * an updated notification can never double the owner's money.
 */
export const notificationFingerprints = sqliteTable('notification_fingerprints', {
  fingerprint: text('fingerprint').primaryKey(),
});

/**
 * A чернетка awaiting the owner's word: what a captured notification proposed, on the рахунок its
 * watch names. Only pending ones are ever stored — confirming or dismissing deletes the row, and
 * the fingerprint above is what makes a settled чернетка stay settled.
 *
 * `currency` is the рахунок's, carried on the row like every other amount's currency, so a сума
 * the owner supplies for a raw чернетка can land in no other money. The `original` pair is the
 * amount a foreign notification named, information a confirmed витрата keeps.
 */
export const notificationDrafts = sqliteTable(
  'notification_drafts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    currency: text('currency').notNull(),
    /** The domain's `IsoDate` verbatim, TEXT 'YYYY-MM-DD', as every other calendar date column. */
    date: text('date').notNull(),
    /** The parse input: the notification's title and text joined, whitespace collapsed. */
    text: text('text').notNull(),
    /** 'expense' | 'income' | 'raw' — the DraftProposal's own three shapes. */
    kind: text('kind').notNull(),
    /** Minor units in `currency`; NULL exactly when the proposal is raw. */
    amount: integer('amount'),
    /** What a foreign notification named, in its own currency. Only a raw чернетка carries one. */
    originalAmount: integer('original_amount'),
    originalCurrency: text('original_currency'),
    /**
     * Storage metadata, not domain: when the чернетка was drafted. It is what "newest first" on
     * Головний orders by — a чернетка's own date is the day the money moved, which a bank can
     * post about a day late.
     */
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [
    check('notification_drafts_kind_known', sql`${t.kind} IN ('expense', 'income', 'raw')`),
    check(
      'notification_drafts_date_iso',
      sql`${t.date} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'notification_drafts_original_paired',
      sql`(${t.originalAmount} IS NULL) = (${t.originalCurrency} IS NULL)`,
    ),
    check(
      'notification_drafts_shape',
      sql`CASE ${t.kind}
        WHEN 'raw' THEN ${t.amount} IS NULL
        ELSE ${t.amount} IS NOT NULL AND ${t.originalAmount} IS NULL
      END`,
    ),
  ],
);

export type NotificationWatchRow = typeof notificationWatches.$inferSelect;
export type NotificationDraftRow = typeof notificationDrafts.$inferSelect;
export type NewNotificationDraftRow = typeof notificationDrafts.$inferInsert;

/**
 * Whether the daily нагадування is on and the time of day the owner set it for. One row, keyed
 * `'reminder'` — the single-row shape `saldo_import` already keeps, CHECK and all.
 *
 * No row means «never asked»: off, and with no time the owner chose. That is why `hour` and
 * `minute` are `NOT NULL` rather than nullable — a row exists only once the owner has set one, so
 * there is no state where the setting exists and the time does not, and the section's 21:00 is a
 * suggestion in `src/reminders/time.ts` rather than a value on the device.
 *
 * A wall-clock hour and minute, never an instant: the нагадування must arrive at the hour the
 * owner chose in whatever zone the phone is in, so storing a moment would be storing the wrong
 * thing (design D12).
 */
export const dailyReminder = sqliteTable(
  'daily_reminder',
  {
    /** Always `'reminder'`; the CHECK is what keeps the table to one row. */
    id: text('id').primaryKey(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    hour: integer('hour').notNull(),
    minute: integer('minute').notNull(),
  },
  (t) => [
    check('daily_reminder_single_row', sql`${t.id} = 'reminder'`),
    check('daily_reminder_hour_of_day', sql`${t.hour} BETWEEN 0 AND 23`),
    check('daily_reminder_minute_of_hour', sql`${t.minute} BETWEEN 0 AND 59`),
  ],
);

/**
 * The сповіщення про збій standing right now: one row per action that failed, with the moment it
 * was first raised. The primary key *is* «одна невдача — одне сповіщення»: raising an action
 * already outstanding writes nothing, and clearing one deletes only its own row.
 *
 * `kind` deliberately carries no CHECK, against this schema's usual habit and for one stated
 * reason: committed migrations are immutable, the set of kinds grows (the Drive backup of step 12
 * adds one), and widening a CHECK in SQLite means rebuilding the table in a new migration for the
 * sake of one string. The enumeration lives in `src/reminders/notices.ts`, where the words and the
 * route already are, and `reminders-repo` refuses a kind that is not in it (design D7).
 *
 * Nothing else is stored. Not the message, not a сума, not a line of a captured notification — the
 * action that failed and the moment it did is the whole row, which is also why this table cannot
 * leak anything into a бекап even if it travelled in one. It does not: see `src/backup/format.ts`.
 */
export const alerts = sqliteTable('alerts', {
  /** One of `src/reminders/notices.ts`'s `AlertKind` values; see above for why SQL does not know. */
  kind: text('kind').primaryKey(),
  raisedAt: integer('raised_at', { mode: 'timestamp_ms' }).notNull(),
});

/**
 * What the entry form on Головний opens on: the рахунок of the owner's most recent hand-recorded
 * транзакція. One row, `'entry'`, the same single-row idiom `daily_reminder` and `saldo_import`
 * keep, CHECK and all — remembering a second рахунок replaces the first rather than adding to it.
 *
 * A preference, not money. Nothing derives a balance or a monthly number from it, and no row at
 * all is the ordinary state of a device that has never recorded by hand: the form then opens with
 * nothing chosen and refuses to record until the owner picks a рахунок, exactly as before.
 *
 * `onDelete: 'restrict'` like every other reference to a рахунок — рахунки archive rather than
 * disappear, so nothing here can be orphaned. An archived one is still a valid row: it is the
 * screen that stops offering it as the default, not storage that forgets it.
 */
export const entryDefaults = sqliteTable(
  'entry_defaults',
  {
    /** Always `'entry'`; the CHECK is what keeps the table to one row. */
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
  },
  (t) => [check('entry_defaults_single_row', sql`${t.id} = 'entry'`)],
);

export type DailyReminderRow = typeof dailyReminder.$inferSelect;
export type NewDailyReminderRow = typeof dailyReminder.$inferInsert;
export type AlertRow = typeof alerts.$inferSelect;
export type EntryDefaultsRow = typeof entryDefaults.$inferSelect;
export type NewEntryDefaultsRow = typeof entryDefaults.$inferInsert;

/**
 * A фіскальний чек: the composition of a purchase, beneath the транзакція that paid for it.
 *
 * `transaction_id` is UNIQUE — «a транзакція carries at most one чек» is the constraint, not a
 * rule a repository remembers — and it is the one place `.claude/rules/database.md` allows
 * `onDelete: 'cascade'`: a чек without its транзакція means nothing, and the spec says outright
 * that deleting the транзакція deletes the чек with it. Every other reference in this schema is
 * `restrict`, because everything else it points at archives rather than disappears.
 *
 * The identity — реєстратор, фіскальний номер чека and the date issued — is UNIQUE for the reason
 * the spec gives: two чеки with those three values are one чек, so storage refuses the second
 * rather than leaving the app to notice. The date is part of it because a registrar restarts its
 * numbering; without it, чек 45 of two different days would collide.
 *
 * `snapshot` is the decoded document, kept whole and never rewritten (design D7): the tax service
 * is undocumented and a чек findable today may be gone tomorrow, so what it served is what makes
 * a stored чек independent of it, and re-parsable offline by a later, better parser.
 */
export const fiscalReceipts = sqliteTable(
  'fiscal_receipts',
  {
    id: text('id').primaryKey(),
    transactionId: text('transaction_id')
      .notNull()
      .unique()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    /** `fn` — the фіскальний номер реєстратора, from the реквізити the чек was looked up with. */
    registrarNumber: text('registrar_number').notNull(),
    /** `id` — the фіскальний номер чека, likewise from the реквізити (design D2a). */
    fiscalNumber: text('fiscal_number').notNull(),
    /** The domain's `IsoDate` verbatim, as every other calendar-date column. */
    issuedDate: text('issued_date').notNull(),
    /** 'HH:mm:ss' — the time of day the document states, beside the calendar date it belongs to. */
    issuedTime: text('issued_time').notNull(),
    /** 'prro' | 'rro' — which dialect the tax service served, so a re-parse knows what to read. */
    dialect: text('dialect').notNull(),
    /** 'sale' | 'return'. A service or shift document is neither and never becomes a чек. */
    kind: text('kind').notNull(),
    totalAmount: integer('total_amount').notNull(),
    totalCurrency: text('total_currency').notNull(),
    sellerName: text('seller_name'),
    pointName: text('point_name'),
    /** How the чек arrived. One value today; a later change adds its own with its own migration. */
    acquisition: text('acquisition').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
    /** The decoded document, immutable. No screen reads it; see the module comment above. */
    snapshot: text('snapshot').notNull(),
  },
  (t) => [
    check('fiscal_receipts_dialect_known', sql`${t.dialect} IN ('prro', 'rro')`),
    check('fiscal_receipts_kind_known', sql`${t.kind} IN ('sale', 'return')`),
    check('fiscal_receipts_acquisition_known', sql`${t.acquisition} IN ('qr_scan')`),
    check(
      'fiscal_receipts_issued_date_iso',
      sql`${t.issuedDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'fiscal_receipts_issued_time_of_day',
      sql`${t.issuedTime} GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]'`,
    ),
    unique('fiscal_receipts_identity').on(t.registrarNumber, t.fiscalNumber, t.issuedDate),
  ],
);

/**
 * One позиція чека, as the document printed it.
 *
 * Its own `id` rather than `(receipt_id, line)` as the key, deliberately: the next change
 * (`product-classification`) hangs a classification off a позиція, and a stable id is what it will
 * reference. `UNIQUE(receipt_id, line)` keeps document order honest all the same.
 *
 * The money pairs follow the schema's rule: `line_total` is NOT NULL on both halves, and the two
 * optional pairs — the unit price and the line discount — are held together by CHECKs, since an
 * amount without its currency beside it must be impossible even where the column may be NULL.
 * `unit_price` is absent, not zero, when the document names none: the parsers invent nothing, and
 * a zero here would be a price the seller never printed.
 */
export const receiptItems = sqliteTable(
  'receipt_items',
  {
    id: text('id').primaryKey(),
    receiptId: text('receipt_id')
      .notNull()
      .references(() => fiscalReceipts.id, { onDelete: 'cascade' }),
    /** The document's own row number, which is not always 1..n — a till numbers its free text too. */
    line: integer('line').notNull(),
    /** The product name verbatim. Nothing renames, cleans, groups or classifies it. */
    rawName: text('raw_name').notNull(),
    /** Quantity × 1000; 1000 when the document names none. */
    quantityThousandths: integer('quantity_thousandths').notNull(),
    unit: text('unit'),
    unitPriceAmount: integer('unit_price_amount'),
    unitPriceCurrency: text('unit_price_currency'),
    lineTotalAmount: integer('line_total_amount').notNull(),
    lineTotalCurrency: text('line_total_currency').notNull(),
    discountAmount: integer('discount_amount'),
    discountCurrency: text('discount_currency'),
    barcode: text('barcode'),
    uktzed: text('uktzed'),
    /** The seller's internal code for the product. */
    code: text('code'),
  },
  (t) => [
    check(
      'receipt_items_unit_price_paired',
      sql`(${t.unitPriceAmount} IS NULL) = (${t.unitPriceCurrency} IS NULL)`,
    ),
    check(
      'receipt_items_discount_paired',
      sql`(${t.discountAmount} IS NULL) = (${t.discountCurrency} IS NULL)`,
    ),
    check('receipt_items_quantity_positive', sql`${t.quantityThousandths} > 0`),
    unique('receipt_items_line').on(t.receiptId, t.line),
    // For `product-classification`, which will look позиції up by what the packet printed on them.
    index('receipt_items_barcode_idx').on(t.barcode),
  ],
);

export type FiscalReceiptRow = typeof fiscalReceipts.$inferSelect;
export type NewFiscalReceiptRow = typeof fiscalReceipts.$inferInsert;
export type ReceiptItemRow = typeof receiptItems.$inferSelect;
export type NewReceiptItemRow = typeof receiptItems.$inferInsert;

/**
 * The журнал: the app's own bounded record of what it did, kept so a bug met on the phone can be
 * reproduced at the laptop. `src/reporting/journal.ts` owns what an entry may carry and why.
 *
 * There is deliberately no CHECK on `kind`. It is `alerts`'s trade, for `alerts`'s reason: the
 * enumeration lives in TypeScript (`JournalKind`), where the label and the rendering already are,
 * a fifth kind would otherwise cost a migration, and committed migrations are immutable. The
 * repository refuses an unknown kind instead.
 *
 * No index on `at`: the whole table is 500 rows, every read of it is the whole tail, and the only
 * write is one append. An index would be a second structure to keep true for no measured gain.
 *
 * Never in a бекап, and a відновлення leaves it alone — see `backup-repo.ts`, which names it among
 * the untouched.
 */
export const journal = sqliteTable('journal', {
  id: text('id').primaryKey(),
  at: integer('at', { mode: 'timestamp_ms' }).notNull(),
  /** One of `src/reporting/journal.ts`'s `JournalKind` values; see above for why SQL does not know. */
  kind: text('kind').notNull(),
  /** A route, an action's kind or an `AlertKind` — never anything the owner typed. */
  name: text('name').notNull(),
  /** The refusal text the owner was shown, or a crash's message and stack. */
  detail: text('detail'),
});

/**
 * One репорт про помилку: what the owner wrote, and what the app attached at the moment it was
 * created.
 *
 * **The attached context is JSON, and that is the point.** `build_json`, `device_json`,
 * `counts_json`, `journal_json` and `prompting_json` are snapshots, not references — the live
 * журнал keeps rolling (every screen change is an entry, and 500 is a day or two), so a репорт
 * that pointed at it would in time forget the very crash it was filed about. There is deliberately
 * no foreign key from `prompting_json` to `journal`: a pointer the pruning would null is a репорт
 * that forgets its own reason. The columns are read back through `src/reporting/report.ts`'s types
 * and by nothing else; no query filters or aggregates over them.
 *
 * `handed_over_at` is the only field that changes after creation — the moment the file was handed
 * to the phone's chooser, or NULL while it never has been.
 */
export const bugReports = sqliteTable('bug_reports', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  /** The route of the screen it was filed from, derived from the журнал (design D9). */
  route: text('route').notNull(),
  /** «Що я робив» — the one line the form requires. */
  did: text('did').notNull(),
  happened: text('happened'),
  expected: text('expected'),
  /** The `JournalEntry` that prompted it, as JSON; NULL when the owner filed it on their own. */
  promptingJson: text('prompting_json'),
  buildJson: text('build_json').notNull(),
  deviceJson: text('device_json').notNull(),
  countsJson: text('counts_json').notNull(),
  journalJson: text('journal_json').notNull(),
  migrationsApplied: integer('migrations_applied').notNull(),
  handedOverAt: integer('handed_over_at', { mode: 'timestamp_ms' }),
});

/**
 * One screenshot the owner attached to a saved репорт, kept on the phone beside it.
 *
 * The row is the name and the moment; the image itself is a file under
 * `<documentDirectory>/bug-reports/<report id>/`, reached through `bug-report-files.ts`. The key
 * is `(report_id, name)` because one репорт cannot hold two files of one name, and the cascade is
 * how «removing a репорт removes its screenshots» stops being a rule someone has to remember —
 * the same shape `receipt_items` hangs on its чек by.
 */
export const bugReportScreenshots = sqliteTable(
  'bug_report_screenshots',
  {
    reportId: text('report_id')
      .notNull()
      .references(() => bugReports.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    addedAt: integer('added_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.reportId, t.name] })],
);

export type JournalRow = typeof journal.$inferSelect;
export type BugReportRow = typeof bugReports.$inferSelect;
export type BugReportScreenshotRow = typeof bugReportScreenshots.$inferSelect;
