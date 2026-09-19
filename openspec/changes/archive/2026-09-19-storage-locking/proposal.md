## Why

The owner cannot open the app. The release APK on their phone shows «Екран не намалювався» with
`Call to function 'NativeStatement.runSync' has been rejected. → Caused by: Error code : database
is locked`, and the crash fallback cannot even save the репорт про помилку — for the same reason.
Force-stopping the app clears it, which was confirmed on the device: the lock was held by a
process that had outlived the last time the app was on screen.

Storage that refuses to answer is the whole app: every screen reads it during a draw, so a locked
database is a dead app, and neither «куди пішли гроші» nor «скільки лишилось» can be answered.

## What Changes

- Every connection to the database is prepared in one place both drivers call (`expo-sqlite` in
  the app, `better-sqlite3` in the tests): a busy timeout **first**, then WAL journalling, then the
  `foreign_keys = ON` already there. An opening whose journal mode cannot be switched stays usable.
- Every write transaction the repositories run begins by taking the write lock, so a transaction
  that reads before it writes waits for its turn instead of failing outright.
- Applying migrations tolerates a second caller doing the same at the same moment: each migration
  is applied once, and neither caller fails because the other got there first.
- Tests reproduce each defect over a real database file, with the second connection on a second
  thread where a wait has to be observed. Each fails before its fix.
- `.claude/rules/database.md` is corrected where it misled: the claim that the two callers of
  `migrate` cannot interleave, and the Tests section that still describes hand-set pragmas and
  in-memory databases only.

### Why the app ends up with two connections at once, and why that locked it

Nothing in this app opens the database twice on purpose. Four facts make it happen anyway:

1. A chance the phone gives — for the фоновий прогін of monobank or for the Drive бекап —
   delivered to a process with no Activity is served by a second JS runtime, and `expo-sqlite`
   caches its connections per runtime. That chance opens its own connection to the same file, on
   its own thread.
2. `CaptureListenerService` keeps the process bound and alive after the owner has swiped the app
   away, so that second connection outlives the app's own.
3. `expo-sqlite` sets no busy timeout, so every collision fails at once instead of waiting.
4. Under SQLite's default journalling a commit needs every reader on the other connections gone,
   and with no wait it fails the moment one is present; a read, in turn, is refused while another
   connection is committing. Measured in Node.

What is **not** established is which statement held the lock that outlived the app until the
force-stop. A raw `BEGIN … COMMIT` whose commit fails stays open and refuses every later reader —
reproduced — but both drizzle drivers and the migrator roll a failed transaction back, and no path
in the app was found that leaves one open. The fix does not depend on the answer: under WAL a
reader never waits for a commit and a commit never waits for a reader, whichever statement it is.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `persistence`: storage serves two openings of it at once; a write waits for its turn rather
  than failing; migrations applied from two places at once are applied once.

## Impact

- New: `src/db/prepare.ts` (the one preparation), `src/db/apply-migrations.ts` (the tolerant
  migration step), and their tests; `src/db/concurrency.test.ts` over a file-backed database.
- `src/db/client.ts` — the app's connection, prepared through the shared step.
- `src/db/test-db.ts` — every opening, in-memory or `openFileDb`, starts from the app driver's
  defaults (no implicit wait) and is prepared through the shared step.
- The 13 `db.transaction(...)` call sites in `src/db/*-repo.ts` and `seed.ts` — immediate.
- `src/app/_layout.tsx` and `src/platform/background-turn.ts` — both migrate through
  `apply-migrations`; `_layout.tsx` stops using drizzle's `useMigrations` for it.
- `.claude/rules/database.md`.
- No schema migration, no native module, no Expo config, no new dependency. WAL is a property of
  the database file; nothing in the бекап, the snapshot or the imports reads the file rather than
  its rows.

## Non-goals

- **Making screens tolerate a storage read that fails.** The root ErrorBoundary already shows a
  fallback, never a dead app. Papering over a failed read with defaults would make a broken
  database look like an empty one, which for a money tracker is worse than a visible crash. Once
  contention no longer fails a read, a read that still fails is a real defect and should be seen.
- **Retrying or queueing a репорт про помилку that could not be saved.** The same argument; the
  busy timeout already covers the case that produced it.
- **Keeping a chance from overlapping with a launch at all.** Overlap is normal, and handling it
  is what a database is for.
- Nothing here touches vision §14.
