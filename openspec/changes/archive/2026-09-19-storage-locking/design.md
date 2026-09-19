## Context

See proposal.md — Why, and the four facts under it. What the code looks like today:

- `src/db/client.ts` opens the one connection the app uses and runs `PRAGMA foreign_keys = ON` on
  it at module load. Nothing else in `src/` names the database file, and nothing copies it — the
  бекап, the snapshot and the imports all go through rows.
- `src/db/test-db.ts` opens `better-sqlite3` over `:memory:` (`openTestDb`) or a path
  (`openFileDb`), and runs the same one pragma by hand. `better-sqlite3` waits up to 5 seconds on a
  lock by default; `expo-sqlite` does not wait at all. The tests are therefore kinder than the app,
  which is part of why nothing caught this.
- `expo-sqlite` sets neither the journal mode nor a busy timeout (`SQLiteOptions.kt` has no field
  for either): SQLite's `DELETE` journalling and a timeout of zero.
- The 13 `db.transaction(...)` call sites use drizzle's default, a deferred `BEGIN`.
- Two places apply migrations: `useMigrations` in `src/app/_layout.tsx` and
  `prepareBackgroundStorage()` in `src/platform/background-turn.ts`. drizzle's sync migrator reads
  the last applied migration *before* its `BEGIN`
  (`node_modules/drizzle-orm/sqlite-core/dialect.js`, `SQLiteSyncDialect.migrate`).

What was measured in Node before this design was written, with `better-sqlite3` over a real file:

| Situation | Today (`DELETE`, no wait) | Prepared (wait, then WAL) |
| --- | --- | --- |
| A commit while another connection is reading | commit fails at once (a raw `BEGIN … COMMIT` then stays open and refuses every later reader; drizzle's wrappers roll back) | commit succeeds, new readers answered |
| A read while another connection has an uncommitted write | answered | answered |
| Switching to WAL while another connection holds a lock | throws `database is locked` | waits for the bound, then throws |
| A deferred transaction that read, then writes while another connection holds a write | — | fails at once with `SQLITE_BUSY`; the wait does not apply to a reader upgrading |
| A deferred transaction that read, then writes after another connection committed | — | fails at once with `SQLITE_BUSY_SNAPSHOT` |
| Either, with `BEGIN IMMEDIATE` | — | waits at `BEGIN`, then succeeds |
| Two migrators on a database whose `__drizzle_migrations` table already exists, one holding a write | — | the second waits, then fails (``Failed to run the query 'CREATE TABLE `accounts` …'``, cause ``table `accounts` already exists``); run again, it finds nothing pending and succeeds with one row. On a file with no such table the migrator's own `CREATE TABLE IF NOT EXISTS` is a real write, queues the two, and no race occurs |

The constraint on everything below: `npm run verify` is Node-only and under a minute.

## Goals / Non-Goals

**Goals**

- One preparation step for every connection, whichever driver opened it, which cannot itself fail
  a launch.
- Write transactions that honour the wait instead of bypassing it.
- One migration history however many callers reach it at once.
- Each of the above proven over a real file, with a real second thread where a wait must be seen.

**Non-Goals**

- Reproducing the app's second JS runtime in `verify`. From SQLite's side two runtimes are two
  connections to one file, each with its own lock state — which a second connection in Node
  reproduces exactly. The runtime arrangement itself is the emulator smoke's to exercise.
- Changing how many connections the app ends up with.

## Decisions

### D1. One `prepareConnection` over a statement runner

The two drivers share no type, so the shared step takes the narrowest thing both offer: a function
that runs one SQL statement. `src/db/prepare.ts` exports `prepareConnection(exec, options?)`; both
`client.ts` and `test-db.ts` call it instead of running pragmas by hand.

The order is the design, not a detail:

1. `busy_timeout` — first, because every later statement can meet a lock and must be able to wait.
2. `journal_mode = WAL` — inside a `try`. If another connection holds storage busy past the bound,
   the switch throws; the preparation swallows that one failure and carries on in the mode the file
   already has. A launch must never die on the step that exists to stop launches dying — and
   `client.ts` runs at module load, outside every ErrorBoundary. The next opening tries again.
3. `foreign_keys = ON` — as today, now in the one place.

*Alternative rejected:* preparing through drizzle's `db.run`. The pragmas must run on the raw
connection before drizzle wraps it, and `PRAGMA journal_mode` returns a row the two dialects hand
back differently.

### D2. WAL, for what actually locked the app

Under `DELETE` journalling a reader does not stop a writer from *writing*, but it stops the writer
from *committing*: the commit needs every reader gone, and while it commits no new reader is let
in. With no wait, either side fails the moment it meets the other. Which statement on the owner's
phone held the lock long enough to outlive the app is not established (proposal, Why) — a raw
transaction whose commit failed would, but the app's transactions roll back on failure.

Under WAL a commit never needs readers to leave, and a reader never waits for a writer. The
setting is a property of the file, written once and carried by it; an older build opens a WAL file
and reads it normally.

*Alternative rejected:* the wait alone. Readers and commits would still exclude each other; the
wait only turns a collision into a delay of up to the bound, and any read or commit lasting longer
than the bound — including whatever held the owner's lock — still fails. WAL removes the
collision between them instead of timing it.

### D3. A bound of 3 seconds

WAL still admits one writer at a time, so a write that meets another write has to wait, and zero
makes that meeting fatal.

**The floor** is the longest write a chance the phone gives makes while the owner may be opening
the app: a monobank page commit (`commitStatementAnswer`: one page of транзакції and imported ids)
or the Drive бекап's state writes. Those are a handful of rows, not measured, but orders of
magnitude below a second. The бекап's *restore* is not the floor — it runs in front of the owner,
and what waits on it is the background, which loses nothing by waiting for the next chance.

**The ceiling** is how long the owner will look at a frozen screen. `runSync` blocks React
Native's JS thread, not Android's main thread, so a wait does not by itself raise an ANR — but
nothing on screen answers while it lasts. Three seconds is long enough that a real background write
never trips it and short enough that a genuinely stuck lock surfaces as an error the owner can see
and report, rather than an app that simply stops responding.

The value is an exported constant carrying this reasoning; `prepareConnection` takes it as an
option so a test can prove the bound with a bound worth waiting for.

### D4. Every write transaction is immediate

A deferred transaction starts as a reader and upgrades when it first writes. That upgrade does not
wait: if another connection is holding a write it fails at once with `SQLITE_BUSY` (SQLite will not
let a reader wait for a lock whose holder may be waiting on it), and if another connection
committed since the read it fails with `SQLITE_BUSY_SNAPSHOT`. Today's transactions mostly write
before they read, so nothing fails yet; nothing keeps it that way.

All 13 call sites pass `{ behavior: 'immediate' }`, which both drizzle drivers support: the write
lock is taken at `BEGIN`, where the wait does apply. A test in `src/db/` reads every non-test
source file under it, finds each `.transaction(` call's matching closing parenthesis (the body can
run to dozens of lines, so a line-by-line match would pass or fail by accident), and fails unless
that call's last argument names `behavior: 'immediate'`. The rule goes into `database.md` as
well.

*Alternative rejected:* only the transactions that read first. The distinction is invisible at the
call site, and a future edit that adds a read at the top of one would reopen the gap silently.

### D5. `applyMigrations`: run, and on failure run once more

`src/db/apply-migrations.ts` exports `applyMigrations(migrate)`, taking the migrate call to make.
It runs it; if it throws, it runs it exactly once more and lets a second failure propagate.

Why that is correct and not a hopeful retry: drizzle's migrator applies every pending migration in
one transaction and rolls back on failure. A caller that lost the race failed *because* the winner
committed; its retry re-reads the migration table, finds nothing pending and returns. A migration
that is genuinely broken fails twice, rolled back both times, and reaches the owner as today's
«Не вдалося підготувати сховище». Reproduced in Node before this was written (see Context).

Both callers go through it. `prepareBackgroundStorage()` wraps its `migrate` call. `_layout.tsx`
stops using drizzle's `useMigrations` hook, which calls `migrate` itself and offers no seam, and
uses a small `useStorageMigrations` hook in `src/hooks/` with the same `{ success, error }` shape
over `applyMigrations`. The hook is untested by design — it is the effect and two state updates;
everything it decides is `applyMigrations`', which is.

*Alternative rejected:* re-reading the migration table inside an immediate transaction before
drizzle's own `BEGIN`. drizzle's migrator opens its own transaction, which cannot nest in ours, so
this would mean re-implementing the migrator — a second migration history in all but name.

### D6. The tests: file-backed, driver-faithful, and threaded only where a wait is the subject

- **Driver-faithful.** `test-db.ts` opens every connection with `timeout: 0` before preparing it,
  so a test sees what `expo-sqlite` sees rather than `better-sqlite3`'s silent 5-second grace. This
  is what makes the concurrency tests fail before the fix. Existing suites run on one connection at
  a time and are unaffected.
- **File-backed.** Two connections cannot meet over `:memory:`, so the concurrency tests use
  `openFileDb` over a path in a temporary directory, as `rates-repo.test.ts` already does.
  `openTestDb()` stays in-memory; WAL there is a no-op (it answers `memory`).
- **Threaded where a wait is observed.** A synchronous connection that waits blocks its only thread,
  so the connection it waits on can never finish there. The writer-waits, read-then-store, bound
  and migration scenarios put the connection holding the write in a `worker_threads` worker — a
  plain `.mjs` module, so it needs neither type stripping nor the `@/` alias — which signals through
  `Atomics` once it holds the lock and commits after a fixed delay. Everything else runs on one
  thread. Holds stay at a fifth of a second; a worker starts in tens of milliseconds, so the
  threaded tests add about two seconds to `verify` at most.
- **Bounds other than the default** are set on a plain `better-sqlite3` connection put through
  `prepareConnection` directly; `openFileDb` keeps no options, since its migrate would itself meet
  the lock in those scenarios.

### D7. The rules are corrected where they misled

`.claude/rules/database.md` says the two callers of `migrate` cannot interleave because the sync
migrator never yields the JS thread. That is true within one runtime and false across two. The
correction says what is true — a chance the phone gives can run in its own runtime, on its own
thread, against its own connection, so the two callers *can* run at once, and `applyMigrations` is
what makes that safe. Its Tests section is brought up to date: preparation through
`prepareConnection`, the driver-faithful `timeout: 0`, file-backed and threaded tests for anything
about two connections, and immediate transactions. `background-turn.ts`'s docblock repeats the old
claim and is corrected with it.

## Risks / Trade-offs

- **A tap that stores something can now take up to 3 seconds** → Only when a chance is writing at
  that exact moment, and the alternative it replaces is the app dying (D3).
- **WAL leaves `-wal` and `-shm` files beside the database** → Nothing in the app reads the
  database as a file. Worth knowing for anyone who later reaches for the file itself.
- **The switch to WAL can fail on a busy first launch** → It is swallowed and the opening works in
  its old mode (D1); the next opening switches it. Proven by the "opened while busy" scenario.
- **A genuinely broken migration is now attempted twice** → Both attempts roll back; the cost is
  one extra failed transaction on a launch that was failing anyway.
- **The threaded tests depend on timing** → Only in one direction: the worker signals when it
  holds the lock, so the order is fixed, and a delay that is too short makes a test wait less, not
  fail. The bound test uses a bound well under the worker's hold.
- **Node proves two connections; the app's two are in two runtimes** → Identical from SQLite's
  side. The emulator smoke (tasks §6) exercises the arrangement itself, within its limits: a chance
  has work only with a рахунок linked by a real token, and opening the app during a фоновий прогін
  that ends in seconds is a race — a smoke that could not arrange it is recorded as not run.

## Migration Plan

No schema migration and no data movement. The journal mode switches on the first opening that runs
the preparation and is carried by the file thereafter. Rolling back is reverting the code; an older
build reads a WAL database normally.
