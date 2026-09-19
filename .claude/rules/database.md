---
paths:
  - "src/db/**"
  - "drizzle/**"
  - "drizzle.config.ts"
---

# Database and migrations (Drizzle ORM + SQLite)

## Where things live
- Schema: `src/db/schema.ts` (one file; split into `src/db/schema/*.ts` only when it exceeds
  ~300 lines, re-exported from `schema.ts`). Queries and repositories: `src/db/**`.
- Migrations: `drizzle/` (SQL files + `drizzle/meta/`), produced by `npm run db:generate` — see
  the one hand-editing clause below.
  The app applies them at startup through `useStorageMigrations` (`src/hooks/`, called from the
  root layout), and `prepareBackgroundStorage()` (`src/platform/background-turn.ts`, which every
  background task awaits first) applies them the same way for a WorkManager chance that lands on a
  process with no Activity — which renders no route and therefore never mounts the root layout.
  Both go through `applyMigrations` (`src/db/apply-migrations.ts`) over the same generated
  `drizzle/migrations.js`, so there is still one migration history. The two callers *can* run at
  the same time — a chance the phone gives runs in its own JS runtime, on its own thread, against a
  connection of its own, so nothing at the JS level keeps them apart. What makes it safe: drizzle's
  migrator wraps every pending migration in one write transaction, so `prepareConnection`'s busy
  timeout (below) makes the loser's `BEGIN` wait for the winner's `COMMIT` rather than fail at
  once, and `applyMigrations`'s retry then re-reads the migration table — by then already updated —
  and finds nothing pending. Nothing else applies migrations.

## Migrations are append-only
- **The v1 baseline reset (2026-09-11).** Every migration up to that point was squashed into one
  — `drizzle/0000_aberrant_albert_cleary.sql`, plain DDL straight off `schema.ts`, no committed
  install to preserve history for. `BACKUP_SCHEMA_VERSION` in `src/backup/format.ts` restarted at
  1 with it. A one-time reset, not a change of policy: from this migration on, the rule below is
  exactly what it was before the reset — append-only, immutable once committed. (Owner's decision.)
- Never edit, rename, reorder or delete a migration or `drizzle/meta/*` entry that is already
  committed. A hook blocks it. Fix the schema and generate a new migration instead.
- Never run `drizzle-kit push`, `drop` or `migrate` here; they bypass the migration history.
- DDL is generated, never hand-written. **Data** statements may be added by hand to a migration
  that is not committed yet, and only when the schema change cannot land without them — the case
  that earned this clause: turning a column into a foreign key needs the rows it points at to
  exist before the table is recreated, and the migrator's own `BEGIN` makes the generated
  `PRAGMA foreign_keys=OFF` a no-op, so nothing outside the migration can put them there in time.
  Such a statement needs a comment saying why it is there and a test that fails without it. Once
  the migration is committed it is immutable like any other. (Owner's decision, 2026-08-24.)
- Every schema change = schema edit + generated migration + a test that runs all migrations on an
  empty in-memory database and asserts the resulting shape (or the behaviour that needs it).
- A migration that moves data needs a test with representative rows before and after.
- Renames and type changes are a new column/table plus a data copy, never a destructive rewrite,
  until the owner explicitly accepts data loss.

## Progress a run leaves behind
- A рахунок whose вікно needs more pages than one прогін affords carries its place between
  прогони: `monobank_links.paging_window_to_ms` and `paging_request_to_ms` hold the window being
  paged and the end the next request should ask for, written in the same transaction as the
  транзакції and imported ids of the answer that produced them (`commitStatementAnswer`). So
  «перенесено» on such a рахунок means progress rather than repetition — without them every прогін
  re-read the same pages and the рахунок could never finish. A position whose window end is not
  after the cursor is discarded, not trusted: a boundary the owner moved, or a restore, can leave
  one behind.
- They are this phone's own progress, so they stay out of a бекап beside
  `monobank_links.last_attempted_at` — `src/db/backup-repo.ts` names the link columns it carries
  one by one, and `src/backup/format.ts` says why these three are not among them.

## Column conventions
- Money: `integer` minor units + `text` currency (ISO-4217), on the same row, always as a pair.
  No `real` for money anywhere. [PROPOSED, matches domain rule]
- Prefer column-level `NOT NULL` on both halves. Where one table holds several row shapes and a
  column-level `NOT NULL` is therefore unrepresentable, the pair is held together by a CHECK
  constraint instead: for the shape a row declares, its money pair is NOT NULL and the other
  shapes' columns are NULL. An amount without its currency beside it must be impossible either
  way — that, not the keyword, is the rule.
- Instants: `integer` epoch milliseconds (`{ mode: 'timestamp_ms' }`); the transaction's
  calendar month is derived in the domain, not stored. [PROPOSED]
- Calendar dates: `text` `'YYYY-MM-DD'`, the domain's `IsoDate` stored verbatim — a transaction's
  date is a calendar date, not an instant, so it invents no time of day and no timezone. Month
  filters are lexicographic ranges over that column (`date >= '2026-03-01' AND date <=
  '2026-03-31'`), never `strftime`. A `CHECK (... GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')`
  keeps garbage out.
- Ids: `text` primary keys generated by the app (no autoincrement), so export/import and future
  sync do not collide. [PROPOSED]
- Every reference is a real foreign key with an explicit `onDelete` policy; cascading deletes
  only where the spec says the child has no meaning without the parent.
- Soft-delete only when the spec asks for undo; otherwise rows are deleted.

## Queries
- Use the Drizzle query builder; no string-built SQL with interpolated values.
- Monthly aggregates filter by a range computed in the domain — an instant range for instant
  columns, a lexicographic `'YYYY-MM-DD'` range for calendar-date columns; do not `strftime`.
- Anything the domain can compute from loaded rows is computed in the domain, not in SQL, unless
  measured to be too slow.

## Tests
- DB tests run under Vitest against an in-memory SQLite with the real migrations applied; no
  mocks of the database layer. `better-sqlite3` in tests, `expo-sqlite` at runtime, both through
  the official Drizzle migrator over the same committed SQL, and both prepared the same way
  through `prepareConnection` (`src/db/prepare.ts`): `busy_timeout`, then `journal_mode = WAL`,
  then `PRAGMA foreign_keys = ON` — SQLite disables it per connection, which would make every
  `onDelete` inert. `test-db.ts` opens every connection with `timeout: 0` first, so a test meets a
  lock exactly as `expo-sqlite` does — not at all — before `prepareConnection` gives it the wait
  back.
- A test about two connections at once uses a file-backed database (`openFileDb`, a temporary
  directory — `:memory:` cannot be shared) and, where a wait must genuinely be *seen* rather than
  merely fail at once, holds one connection open on a real `worker_threads` thread
  (`src/db/concurrency-worker.mjs`, spawned through `src/db/hold-lock.ts`): a synchronous
  connection that waits blocks its own thread, so nothing on one thread could hold a lock open
  across a wait of its own. See `src/db/concurrency.test.ts` and `src/db/apply-migrations.test.ts`.
- Every write transaction takes its write lock at `BEGIN`, not on its first write statement:
  `{ behavior: 'immediate' }` at every `db.transaction(...)` call, enforced structurally by
  `src/db/immediate-transactions.test.ts` rather than by review, so a future call site cannot add
  a deferred one back silently.
- Run one file: `npx vitest run src/db/<file>.test.ts`. The gate is `npm run verify`.
