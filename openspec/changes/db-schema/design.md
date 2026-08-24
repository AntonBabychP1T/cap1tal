# db-schema — design

## Context

See proposal.md — Why. domain-core exists as pure TypeScript: `Account` (id, name, kind,
currency), the five-type `Transaction` union, `Money` (integer minor units + ISO-4217 code) and
`IsoDate` (`'YYYY-MM-DD'` strings — no `Date` objects in the domain). `drizzle.config.ts` is
already committed with `dialect: 'sqlite'`, `driver: 'expo'`. Constraints from
`.claude/rules/database.md` and `domain.md`: append-only migrations, integer money next to a
currency column, app-generated text ids, real foreign keys with explicit `onDelete`, the domain
computes what it can from loaded rows, and `npm run verify` stays Node-only under a minute.

## Goals / Non-Goals

**Goals:**

- A schema that is a faithful projection of the domain types — no shape invented in the DB layer.
- One generated first migration; the official Drizzle migrators apply it both at app startup and
  in tests, so tests exercise the exact SQL the app runs.
- Repositories that speak domain types only; storage row types never leak out of `src/db/`.
- Computed balance as a pure domain fold, fed by a repository listing.

**Non-Goals:**

- No categories/sources tables (change 5), no archiving column or behaviour (change 3), no
  indices tuned beyond the obvious until something is measured slow, no data-migration machinery
  (the first migration meets only empty databases).

## Decisions

### 1. One `transactions` table with a `type` discriminator

The domain's `Transaction` is a tagged union; the table mirrors it: one row per transaction,
`type TEXT NOT NULL CHECK (type IN (...))`, per-type columns nullable, guarded by CHECK
constraints so a row is exactly one valid shape (a transfer has both account refs and both legs
and no category; an expense has `account_id`, `amount`, `currency`, `category_id`; an income has
`source_id`; `original_*` are both set or both null). *Alternative — a table per type* — was
rejected: month and account listings read all five types together, which would force five-way
UNIONs, and the id space is shared anyway (retyping an expense into a transfer keeps the id).

### 2. Transaction date is TEXT `'YYYY-MM-DD'`, not epoch milliseconds

`database.md`'s epoch-ms rule is about instants; a transaction's date is a calendar date, and
domain-core already fixed its representation as the `IsoDate` string. Storing exactly that string
keeps the round-trip trivial and honest. Month listing filters by lexicographic range
(`date >= '2026-03-01' AND date <= '2026-03-31'`) — no `strftime`, which is what the rule actually
forbids. A `CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')` keeps garbage out.
*Alternative — epoch ms* — rejected: it would invent a time-of-day and a timezone the domain does
not have, and month boundaries would depend on the device timezone. This diverges from
`database.md`'s [PROPOSED] instants rule, so this change also appends the calendar-date
convention to that rule (tasks §5) — instants stay epoch ms; calendar dates are TEXT
`'YYYY-MM-DD'`.

### 3. Money is paired columns on the same row

`amount INTEGER` + `currency TEXT` for expense/income/refund/correction; a transfer carries two
pairs (`left_amount`/`left_currency`, `arrived_amount`/`arrived_currency`); an expense optionally
carries `original_amount`/`original_currency`. No `REAL` anywhere.

The columns themselves are nullable — in one table holding five types a transfer row has no
`amount` and an expense row has no `left_amount`, so a column-level `NOT NULL` is unrepresentable
(decision §1). The pairing is enforced instead by the `transactions_shape` CHECK: for the type a
row declares, its money pair is NOT NULL and every other type's columns are NULL, and
`transactions_original_amount_paired` keeps `original_amount`/`original_currency` both set or both
null. An amount can therefore never exist in storage without its currency code beside it, which is
what the money rule protects. This narrows `.claude/rules/database.md`'s "both NOT NULL" money
bullet, which assumed a table per type; tasks §5 amends that bullet to the same wording.

### 4. Ids are app-generated TEXT primary keys

Repositories take complete domain objects that already carry ids; id generation
(`Crypto.randomUUID` / `crypto.randomUUID`) happens at the call site, never inside the domain and
never by SQLite autoincrement — export/import and the Saldo import must be able to preserve ids.

### 5. Account references are real FKs; category and source ids are not yet

`account_id`, `from_account_id`, `to_account_id` → `accounts.id` with `onDelete: 'restrict'`: an
account with history must not silently vanish (deleting accounts is not a v1 behaviour; archiving
arrives with change 3). `category_id` and `source_id` stay plain TEXT with no FK — the categories
and sources tables arrive with categories-rules (change 5), and until then the reserved ids
`fees` / `correction` / `uncategorised` are plain identifiers; categories-rules owns mapping them
onto seeded rows. Adding those FKs later is a new migration (SQLite table rebuild, generated by
drizzle-kit), which is acceptable and append-only.

### 6. Opening balance lives on the accounts row

`opening_amount INTEGER NOT NULL DEFAULT 0` in the account's own currency — no second currency
column, so a mismatched opening-balance currency is unrepresentable in storage. In the domain,
`Account` gains `openingBalance: Money` and a new `account()` factory enforces
`openingBalance.currency === currency` (the spec's rejection scenario).

### 7. Computed balance is a domain fold, not SQL

Pure `computeBalance(account, transactions)` in `src/domain/account.ts`: opening balance, then
expense −, income +, refund +, correction ± (signed), transfer − `left` on the source / + `arrived`
on the destination. The repository supplies `listByAccount`; per `database.md` the domain computes
from loaded rows, and ~5k rows load well inside the performance budget. A SQL aggregate is a
later optimisation if ever measured slow.

### 8. Two drivers, one migration history

- Runtime: `drizzle-orm/expo-sqlite` over the installed `expo-sqlite`; migrations applied at app
  startup with Drizzle's Expo migrator (`useMigrations` + the `drizzle/migrations.js` bundle that
  `db:generate` emits under `driver: 'expo'`).
- Tests: `drizzle-orm/better-sqlite3` over in-memory `better-sqlite3` (new dev dependency), with
  `migrate({ migrationsFolder: 'drizzle' })` applying the same committed SQL files. No mocks.

Both client factories enable foreign-key enforcement (`PRAGMA foreign_keys = ON`): SQLite defaults
it OFF per connection in both drivers, and without it every FK and the `onDelete: 'restrict'` of
decision §5 is inert. The persistence spec's unknown-account rejection scenario exercises it.

Expo config changes (named explicitly per rules): new `babel.config.js` (default Expo preset +
`babel-plugin-inline-import` for `.sql`, new dev dependency) and new `metro.config.js` (default
config + `sql` in `resolver.sourceExts`). No new native modules and no new permissions —
`expo-sqlite` is already installed.

### 9. Repositories return domain types

`src/db/` holds the client factories, the schema, row↔domain mappers and two repositories:
`accountsRepo` (save, get, list) and `transactionsRepo` (save = insert-or-replace to cover the
retype-under-same-id scenario, remove, get, listMonth, listByAccount). `accountsRepo.save`
upserts via `onConflictDoUpdate`, never `INSERT OR REPLACE` — SQLite's REPLACE is delete+insert,
which would trip the restrict FK the moment an account has history (bites at change 3's rename).
Mapping is total in both directions and property-tested by round-tripping all five types. Domain code imports nothing from
`src/db/` (enforced rule); repositories import domain types, never the reverse.

## Risks / Trade-offs

- [`better-sqlite3` is a native Node module] → prebuilt binaries cover Node 24 on macOS/Linux CI;
  it is a dev dependency only, so the app bundle is untouched. If a future Node bump breaks
  prebuilds, tests can move to `node:sqlite` behind the same repository interface.
- [Runtime Expo wiring is not exercised by `npm run verify` (Node-only, no emulator)] → keep the
  wiring a thin module (client + `useMigrations`); lint/typecheck cover it now, and change 3's
  first real screen exercises it on the emulator.
- [Single-table CHECK constraints can drift from domain invariants] → the round-trip tests store
  and load every type through the real migrations; a drifted CHECK fails them immediately.
- [`onDelete: 'restrict'` makes account deletion impossible while history exists] → intended;
  the product archives accounts (change 3) rather than deleting history.

## Migration Plan

First migration ever, applied only to empty databases; the app applies it at startup, tests apply
it per suite. No rollback path is needed — there is no released build and no user data yet.
