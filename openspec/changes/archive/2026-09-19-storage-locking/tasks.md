## 1. The defects, reproduced first

- [x] 1.1 `src/db/test-db.ts`: open every connection — in-memory and `openFileDb` — with
  `timeout: 0`, so a test waits on a lock exactly as `expo-sqlite` does: not at all (design D6).
  Verify: `npx vitest run src/db/` stays green; existing suites use one connection at a time.
- [x] 1.2 A lock-holding worker for the threaded scenarios: a plain `.mjs` worker module beside the tests
  that opens the given file, takes a write (or applies a migration by hand, as in design Context's
  table), signals through `Atomics` once it holds the lock, and commits after the given delay
  (design D6). Verify: `npm run lint` and `npm run typecheck` accept it, and a throwaway run shows
  the signal arrives before the commit.
- [x] 1.3 `src/db/concurrency.test.ts`: the persistence scenarios "A commit that meets a reader
  leaves storage readable" (one thread), "A second writer waits and lands" (worker) and "A change
  that reads before it stores still waits for its turn" (worker holding the write; this thread
  running a repository-style `db.transaction` that reads, then stores), over `openFileDb` in a
  temporary directory. Verify: `npx vitest run src/db/concurrency.test.ts` **fails on all three**
  with `SQLITE_BUSY` — quote the failures. A fix whose test did not first fail proves nothing.
- [x] 1.4 `src/db/apply-migrations.test.ts`: the persistence scenario "Two openings migrate the
  same storage at once" — a file holding an **empty `__drizzle_migrations` table**, as on a phone
  an earlier version already migrated (without it drizzle's own `CREATE TABLE IF NOT EXISTS` is a
  real write that queues the two callers and no race occurs; the committed history has one
  migration, so this is how "a migration pending on an installed database" is built), the worker
  applying the migration by hand and holding its commit, this thread applying the committed
  migrations meanwhile — against an `applyMigrations` that calls `migrate` once and nothing more.
  This thread's connection is a plain `better-sqlite3` one — not `openFileDb`, whose own `migrate`
  would bypass `applyMigrations` — with `journal_mode = WAL` and a busy timeout well above the
  worker's hold set by hand, since `prepareConnection` does not exist until 2.1: without the wait
  the losing statement fails with `SQLITE_BUSY` instead of the race, and 4.1's retry would meet the
  lock again.
  Verify: the test **fails** with drizzle's ``Failed to run the query 'CREATE TABLE `accounts` …'``,
  whose `cause` is ``table `accounts` already exists`` — quote both.

## 2. The one preparation every connection gets

- [x] 2.1 `src/db/prepare.ts`: `prepareConnection(exec, options?)` — `busy_timeout`, then
  `journal_mode = WAL` with that one failure swallowed, then `foreign_keys = ON` (design D1) — and
  the 3-second bound as an exported constant carrying design D3's reasoning. Verify:
  `src/db/prepare.test.ts` asserts, against a recording runner, the three statements in exactly
  that order; that a runner throwing on the journal statement still receives `foreign_keys` and
  raises nothing; and that an explicit bound replaces the default.
- [x] 2.2 `src/db/test-db.ts`: prepare every opening through `prepareConnection`, replacing the
  hand-written pragma (design D1). Verify: of task 1.3's scenarios, "A commit that meets a reader"
  and "A second writer waits" now pass, and "A change that reads before it stores" still fails at
  once with `SQLITE_BUSY` despite the bound — quote it; that is design D4's gap, closed in §3.
- [x] 2.3 `src/db/concurrency.test.ts`: the scenarios "A wait that outlasts the bound fails and
  changes nothing" (worker holding 200 ms; this thread a plain connection put through
  `prepareConnection` with a 100 ms bound, design D6), "References are enforced on a second
  opening" (one thread) and "Storage opened while another opening is busy is usable" (one thread:
  a file migrated by a connection that was *not* prepared, so it is still in its old journal mode;
  that connection mid-read; the second a plain connection put through `prepareConnection` with a
  100 ms bound — not `openFileDb`, whose migrate would itself meet the lock). Verify:
  `npx vitest run src/db/concurrency.test.ts` — these three pass.
- [x] 2.4 `src/db/client.ts`: prepare the app's connection through `prepareConnection`, replacing
  its hand-written pragma, and say in the docblock that the app is not the only opening of this
  file. Verify: `npm run typecheck` (the file imports `expo-sqlite`, so no Node test loads it; §5's
  smoke exercises it).

## 3. Write transactions take their lock at the start

- [x] 3.1 Pass `{ behavior: 'immediate' }` at all 13 `db.transaction(...)` call sites in
  `src/db/` (design D4), and add `src/db/immediate-transactions.test.ts`, which reads every
  non-test source file under `src/db/`, finds each `.transaction(` call's matching closing
  parenthesis, and fails unless that call's last argument names `behavior: 'immediate'` (a
  line-by-line match would pass or fail by accident across a long body). Give the transaction in
  task 1.3's "A change that reads before it stores" test `{ behavior: 'immediate' }` as well — the
  structural test skips test files. The two tests prove different halves: the behaviour test that an
  immediate transaction waits and lands, the structural test that all 13 use it. Verify: the
  structural test fails before the 13 edits and passes after, and the behaviour scenario now passes
  — `npx vitest run src/db/`.

## 4. Migrations are applied once, however many callers

- [x] 4.1 `src/db/apply-migrations.ts`: run `migrate`; on a throw, run it exactly once more and let
  a second throw propagate (design D5). Verify: task 1.4's scenario passes, and a second test in
  `src/db/apply-migrations.test.ts` shows a `migrate` that always throws is attempted twice and its
  error reaches the caller.
- [x] 4.2 `src/hooks/use-storage-migrations.ts` with `useMigrations`' `{ success, error }` shape
  over `applyMigrations`, used by `src/app/_layout.tsx` in place of drizzle's `useMigrations`; and
  `prepareBackgroundStorage()` in `src/platform/background-turn.ts` migrating through
  `applyMigrations` (design D5). Verify: `npm run typecheck` and `npm run lint`, and
  `grep -rn "useMigrations" src/` finds no import from `drizzle-orm`.

## 5. The rules that let the defect be written

- [x] 5.1 `.claude/rules/database.md` and the docblock of `src/platform/background-turn.ts`: replace
  the claim that the two callers of `migrate` cannot interleave with what is true and what makes it
  safe; bring the Tests section up to date — `prepareConnection`, `timeout: 0`, file-backed and
  threaded tests for anything about two connections — and add that write transactions are
  immediate (design D7). Verify: neither text still offers the old reason, and each rule named here
  points at the file that enforces it.

## 6. The emulator

- [x] 6.1 Smoke on the emulator via the `smoke-runner` subagent (`.claude/rules/android.md`),
  on a debug build with a рахунок linked to monobank so a chance has work to do:
  (a) put the app in the background, force a chance with
  `adb shell cmd jobscheduler run -f com.antonbabychp1t.cap1tal <id>` (the id from
  `adb shell dumpsys jobscheduler | grep cap1tal`), and open the app while `logs` shows the chance
  running — expect Головний, not «Екран не намалювався»;
  (b) `run-as` the app and list its SQLite directory — expect `cap1tal.db-wal` beside
  `cap1tal.db`;
  (c) open «Репорти про помилки» and save one — expect it saved.
  Record each result. A chance has work only with a рахунок linked by a real monobank token, and
  opening the app during a фоновий прогін that ends in seconds is a race: whatever could not be
  arranged is recorded as **not run**, with the reason — never as a pass.

  **Result (2026-09-16, Pixel_10_Pro emulator):** (a) not run — no рахунок in this environment is
  linked to a real monobank token (Налаштування → monobank: «ТОКЕН ЩЕ НЕ ВВЕДЕНО»), so a chance
  has no work; a normal launch was confirmed clean instead (Головний draws with real data, no
  errors in `logs`). (b) pass — `run-as` + `ls` showed `cap1tal.db-wal` beside `cap1tal.db` right
  after launch, and the `-wal` file grew (57 KB → 193 KB) after a live write, confirming WAL is
  actually engaged via `prepareConnection`, not a stale leftover file. (c) pass — a bug report was
  filled in, saved, and appears in «Репорти про помилки»'s list. No defects found. Screenshots:
  `.cache/android/smoke/storage-locking/`.

## 7. The gate

- [x] 7.1 Run `npm run verify` and paste the final lines

  ```
  Totals: 55 passed, 0 failed (55 items)
  Test Files  170 passed (170)
       Tests  3410 passed (3410)
  ✔ verify passed (17b969487ad24708d904ae2db89ebc13129a2b6e)
  ```

- [x] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

  **Result:** PASS (0 critical, 3 warning) on first pass. Warnings: (1) a harmless-in-practice but
  worth-hardening race between the worker's `sqlite.close()` and the parent's `terminate()` on
  message — fixed by closing before posting the message, re-verified green; (2) the working tree
  also carries unrelated uncommitted work for `receipt-qr-prro-requisites` — noted for commit
  staging, not this change's concern; (3) task 6.1 was unchecked at review time — since resolved.
