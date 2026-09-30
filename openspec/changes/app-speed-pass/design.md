## Context

See proposal.md for why. The facts below shape how.

- **Every read is synchronous on the JS thread.** `openDatabaseSync` feeds drizzle's expo-sqlite
  session, which prepares and runs each statement with `prepareSync`/`getAllSync` and caches no
  statements. A read blocks input, rendering and the navigation transition for as long as it takes.
- **Screens read through `useReloadOnFocus`** (`src/hooks/use-reload-on-focus.ts`): at mount, on
  every later focus, and after their own writes. Its doc and `src/db/repos.ts` record the standing
  decision "there is no store and no cache … so no screen can show a stale balance" (design §6 of
  the persistence change). Earlier changes repeat it: no stored totals and no cache table
  (`daily-usability`, `goals-scope-and-caps`, `achievements-and-financial-challenges`). What they
  rule out is a *stored* number that a write could forget to update. They do not rule out a
  memory-only memo whose key is storage's own change counter, taken so that no write can slip
  between the key and the value (D1).
- **The expensive primitive is `transactionsRepo.listAll()`.** It reads the whole table in
  newest-first order (only `date` is indexed, so SQLite builds a temporary sort), maps every row
  through `toTransaction`, and binds every переказ id into one `IN (…)` list. Callers:
  - Головний (then `computeBalances`, then `currentNetWorth`, which calls `computeBalance` again
    per рахунок)
  - Рахунки
  - Звіти
  - `goal/[id]`
  - `transactions.tsx` (for month names only)
  - AI-аналіз
  - the Saldo import
  - `rules-repo` inside its sweep transaction
- **Every `evaluateProgress()` call is followed by `reload()` on the same screen.** Examples:
  `(tabs)/index.tsx:579-581, :611-612, :299-300`, `challenge/[key].tsx:109-111`,
  `accounts.tsx:141-143`. The reload is what makes a досягнення just earned show up (the Головний
  progress widget's unseen badge, the виклик screen after «підтвердити норму»).
- **«Транзакції» keeps every page the owner asked for across a focus.** It re-reads `pages × PAGE_SIZE`
  (`transactions.tsx:120-139`).
- **Native tabs render every tab's content at launch on Android**
  (`expo-router/build/native-tabs/NativeTabsView.android.js`). So Рахунки and Звіти run their whole
  reads during Головний's launch.
- **React Compiler is on** (`app.json` `experiments.reactCompiler`). Components it compiles already
  memoize their JSX and callbacks. Redraw storms therefore come from components the compiler bails
  out of, from props that are genuinely new each render (such as `new Date()` or fresh reads), and
  from state held too high. They do not come from a missing `React.memo` as such.
- **`InteractionManager` is deprecated in RN 0.86.** `requestIdleCallback` exists in the RN runtime.
- **Tests run in Node only** (better-sqlite3 over the same migrations). Screen code is tested by
  pure modules in `src/ui/` and by source inspection of `.tsx` files read by path.

## Goals / Non-Goals

**Goals:**
- Performance targets, measured on the emulator with the synthetic 10 000-транзакція бекап from
  task 1.1:
  - A tab switch or a back swipe onto Головний, Рахунки or Звіти with nothing written in between
    (журнал entries aside) shows its content with no whole-history read: under one frame of JS work
    beyond the render. It is measured with the журнал bound, as in the app.
  - A screen whose data changed re-reads the history at most once per write.
  - Typing in «Транзакції» never drops a character.
- Freshness exactly as today: no reachable state in which a screen in sight shows a number older
  than the last committed write, once the work that write triggered has run.

**Non-Goals:**
- Moving reads off the JS thread (async SQLite, workers).
- Replacing drizzle's statement handling.
- Any change to what a screen shows.

## Decisions

### D1. A stamp-keyed memo, not an invalidation-by-call cache

`src/db/stored-history.ts` exports `storageStamp(db)`, `stampedMemo(db, read)` (whose memoized
function takes the optional `extraKey`) and `outsideStamp(db, write)`. The primitives live in
`src/db/stamp.ts`, re-exported from there, so a repository can memoize its own reads without an
import cycle through the stored-history memo that reads through the repositories.

**The stamp** is the pair (`PRAGMA data_version`, `SELECT total_changes()`):
- `total_changes()` counts every row this connection has inserted, updated or deleted since it
  opened. Any write through any repository, a restore, a merge, a sweep or a seed moves it.
- `data_version` changes when *another* connection commits. That covers the фоновий прогін and the
  Drive бекап, which run in a second JS runtime with their own connection (`src/db/client.ts`
  doc). When the app's process is alive the фоновий прогін can instead run in the app's own
  runtime on the app's own connection (`src/platform/background-turn.ts`); its writes then move
  `total_changes()`, which covers that case the same way.

Both are read in one statement, through the table-valued `pragma_data_version()`.

**The protocol, in this order:**
1. **Inside a transaction, bypass.** If the connection is inside a transaction (expo-sqlite
   `isInTransactionSync()`, better-sqlite3 `inTransaction`, behind a tiny `inTransaction(db)` seam
   in `src/db/prepare.ts`), run `read` directly and remember nothing. A read inside a write
   transaction can see uncommitted rows, and a later rollback does not move either counter back.
2. **Stamp first.** Take the stamp `S` *before* running `read`.
3. **Reuse or read.** If `S` and `extraKey` equal the remembered key, return the remembered value.
   Otherwise run `read` and remember the value under `S`.

Because `S` is taken first, a commit by another connection that lands *during* `read` moves
`data_version` after `S`. The next call then sees a different stamp and reads again: a value can
only be remembered under a stamp at or before the state it saw. A commit that lands before `S` is
fully in the value.

**Writes nothing memoized depends on are taken out of the stamp.** The журнал writes to the same
file on every route change: `journal.record('screen', pathname)` in the root layout, plus app-state
moves, sync steps and requests. Each `reportingRepo.append` is an INSERT plus a prune DELETE
(`src/db/reporting-repo.ts:196-215`). Counted raw, that would move the stamp on every tab switch
and back swipe, and the memo would never hit.

So `stored-history.ts` also exports `outsideStamp(db, write)`. It reads `total_changes()` before and
after `write` and adds the difference to an in-memory `excluded` count for that connection. The
stamp becomes (`data_version`, `total_changes() − excluded`). JS is single-threaded and the
connection is ours, so the difference is exactly `write`'s own rows. `reportingRepo.append` is the
only caller: the журнал table feeds no memoized read (the bug report reads it directly, never
through a memo). Adding a caller means stating the same in its doc.

The background runtime's журнал entries still move `data_version`. That causes one extra rebuild
per фоновий прогін, which is rare and harmless.

`outsideStamp` relies on one invariant: nothing else writes on the device connection between its
two `total_changes()` reads. That holds because every access to the device connection is
synchronous (`openDatabaseSync`, drizzle's sync session); no asynchronous expo-sqlite API is ever
used on it. A change that introduces one must revisit `outsideStamp`.

Rate writes (`ratesRepo.upsert`, from `useCurrentRates`) do move the stamp. That is accepted, not
excluded: the Звіти history derivation (D7) takes rates as an input, so a rate refresh must
rebuild it; the stored-history memo rebuilds with it at most once per rate refresh.

A write that is rolled back outside a read still moves `total_changes()`. That only causes an
unnecessary rebuild; it can never make two different committed states share a stamp.

**Immutability.** Answers are typed `readonly` (`ReadonlyArray`, `ReadonlyMap`, `ReadonlySet`,
`Readonly<Transaction>`). `stampedMemo` also deep-freezes arrays, plain objects and their
elements, and seals maps and sets so that `set`/`add`/`delete`/`clear` throw. This holds in every
build, release included: the requirement is that a change to an answer is refused, and a
dev-only freeze would let a release build silently hand the next caller a corrupted answer, which
is worse than a visible failure. The freeze runs once per rebuild, which is small next to mapping
the rows.

**The stored-history memo** is the first user. `storedHistory.read()` returns
`{ accounts, transactions, months, byMonth(), balances() }`:
- `months` is the list of distinct months, built in the same pass as `transactions`.
- `byMonth()` is lazy: `Map<Month, readonly Transaction[]>`, each month in `listMonth`'s own order
  (`asc(date), asc(id)`), so `overLimitByMonth` sees exactly the rows it saw before, in the same
  order.
- `balances()` is lazy: the existing domain `computeBalances` over the same rows. That makes the
  "balances equal the whole-history balances" requirement true by construction, and the property
  test pins it. Being lazy, a safe-integer refusal reaches only readers of balances.

`repos.ts` exports `storedHistory` over the device `db`.

**The same wrapper memoizes the other reads Головний repeats per focus:**
- `countUncategorised`
- the four `netWorthRepo` reads
- `progressRepo.readProgressSummary`

Reads that also depend on `now` pass the ISO day as `extraKey`.

**Alternatives considered:**
- **A generation counter bumped in every write function.** The audit lists about twenty write paths
  across ten repositories plus the background runtime. One missed bump is a stale balance, which is
  exactly the failure the "no cache" rule exists to prevent. The stamp needs no cooperation from
  writers.
- **SQL aggregates for balances (`GROUP BY account_id`).** Faster for balances alone, but it
  duplicates `computeBalances` semantics in SQL (both legs, once for a same-рахунок переказ,
  safe-integer refusal) and still leaves Звіти and AI-аналіз needing the whole list. It may come
  later behind the same memo.
- **`expo-sqlite`'s change listener.** It is disabled on purpose (`enableChangeListener: false`)
  and would not see the other connection.

### D2. Rows are read once per stamp, whoever asks first

`listAll()` itself stays unmemoized. `rules-repo` calls it inside a write transaction, where D1
would bypass anyway. Screens switch to `storedHistory.read()`.

`withAwaiting` for `listAll` and `search` reads the whole `counterpart_income_awaits` table. It
holds one row per unresolved переказ, so it is tiny, and reading it whole replaces the `IN (…)`
list of every переказ id. That removes the bound-parameter ceiling (SQLite's 32 766) and one large
statement preparation per read. Reads of a few rows keep the `IN` form.

### D3. Two indexes by a generated migration

`schema.ts` gains `index('transactions_category_idx').on(t.categoryId)` and
`index('transactions_order_idx').on(t.date, t.createdAt, t.id)`. The migration comes from
`npm run db:generate`. `transactions_date_idx` stays: dropping it gains nothing measurable.

The migration test covers three things:
- It applies all migrations to an empty database with rows inserted at the previous migration.
- It asserts both indexes exist and the rows are unchanged.
- It asserts two query plans: `EXPLAIN QUERY PLAN` shows `USING INDEX transactions_category_idx`
  for the «Без категорії» count, and no `USE TEMP B-TREE FOR ORDER BY` for `listLatest`.

No backup-format change: indexes are not part of the бекап. `BACKUP_SCHEMA_VERSION` still moves
from 4 to 5: it is kept equal to the number of committed migrations (`src/backup/format.ts`), and
the tripwire test asks exactly the question answered here, whether a бекап still holds everything.
It does.

### D4. Tabs read lazily and screens defer while hidden

A pure `src/ui/read-policy.ts` decides one of `read-now` / `mark-stale` / `skip` from
`{ focused, everFocused, stale, event }`, where `event` is
`mount | focus | blur | changed | own-write | read-changed`. `blur` marks the screen stale, so
every later focus reads (cheaply, through D1); only the first focus of a screen that read when it
mounted in sight is skipped. `syncEvent(inFlight)` maps a прогін's state change to `changed` when it
finishes and to nothing when it starts.

**`useReloadOnFocus`** applies it:
- **Lazy tabs.** A screen mounted unfocused, which only a tab can be, skips its mount read and
  returns the placeholder the caller supplies. The hook gains an optional `whileUnseen` value; only
  the four non-initial tabs pass it, and they render an empty body until their first focus.
  `useFocusEffect` runs after that tab's first paint, so the first open of each tab shows one frame
  of empty body before its content. That is a visible change: one frame, once per tab per launch.
  `app-motion-pass`'s tab fade covers it. Reading during render on focus was rejected because
  expo-router gives no synchronous focus signal before paint for an already-mounted native tab.
- **A changed `read` while focused** (event `read-changed`: Місяць stepping months, «Транзакції»
  filters) reads at once, as today. The hook's effect already re-runs on a new `read` identity.
- **`reloadWhenSeen()`** replaces `reload()` in the event subscriptions (`onSyncState`,
  `onCapturesStored`, the pull-to-refresh aftermath) and in the new `onProgressJudged` (D5). When
  the screen is focused it reads; when it is hidden it marks the screen stale.
- **Focus** reads as today. Being cheap is now D1's job: an unchanged stamp returns the same
  memoized values.

The reload at sync start is removed: at that moment nothing has been written.

The day-rollover `setInterval` on Головний moves into `useFocusEffect`, so it runs only while the
tab is in sight.

**Alternative considered: `react-native-screens` `enableFreeze`.** It would stop hidden screens from
re-rendering at all, but its interaction with `NativeTabs` in expo-router 57 is untested, and a
frozen screen that misses an update is a stale balance. D4 gets the read savings without that risk.
See D8.

### D5. Deferred follow-up work that still reaches the screen

`src/platform/idle.ts` is a port `afterScreenSettles(fn)`. Its device adapter `idle-device.ts` calls
`requestIdleCallback(fn, { timeout: 500 })`, so the work runs at the latest half a second later even
on a busy thread. The in-memory double *queues* and exposes `flush()`, so tests can show that
nothing ran inline and that everything ran exactly once after the flush.

**Прогрес.** The decision logic lives in a pure `src/progress/deferred-judgement.ts`:

```ts
judgeAfterSettle({ schedule, judge, announce }): void
// schedule(() => { const earned = judge(); if (earned.length > 0) announce(); })
```

`src/hooks/progress-ports.ts` binds `schedule = afterScreenSettles`, `judge = evaluateProgress` and
`announce = emitProgressJudged` (an event like `onCapturesStored`).

Every `evaluateProgress()` call under `src/app/` becomes `judgeProgressLater()`. That is every
screen call site, whether or not a `reload()` follows it: `(tabs)/index.tsx`, `(tabs)/accounts.tsx`,
`transactions.tsx`, `transaction/new.tsx`, `transaction/[id].tsx`, `account/[id].tsx`,
`challenge/[key].tsx`, `manage/goals.tsx`, `manage/monobank.tsx`, `manage/backup.tsx`,
`manage/saldo-import.tsx`, `manage/drive-backup.tsx`, and the two post-sync evaluations in
`_layout.tsx`. The launch evaluation in `_layout.tsx` (after the migrations) becomes one of the
launch chores below. `src/platform/monobank-sync-task.ts` keeps calling `evaluateProgress()`
directly: it runs in the background with no screen to hold up. Where a pair exists
(`evaluateProgress(); reload();` becomes `judgeProgressLater(); reload();`):
- The immediate `reload()` shows the save itself.
- When judging changes anything, the screens subscribed through `reloadWhenSeen` re-read. The one
  in sight does so at once; hidden ones do so on their next focus.

That satisfies "A досягнення earned by a save appears on the screen in sight".

**Launch chores** in `_layout.tsx` (`seedStarterSet`, `fillMissingCategoryIcons`, the launch
прогрес evaluation, the capture drain, the monobank sync kick-off, `runBackup`) are started in
today's order from one `afterScreenSettles`
callback, through a pure `src/ui/launch-chores.ts` that takes the chores as functions. The
synchronous ones run in sequence. The asynchronous ones (the sync, the бекап) are *started* in order
and run concurrently exactly as today. None waits for another's completion that did not before. Only
the moment they start moves.

### D6. «Транзакції»: local text, paused search, stable pages

- **Paused search.** The `SearchBar` holds its own text state. A pure
  `searchDelayMs(previous, next)` in `src/ui/transaction-search.ts` returns 0 for an empty `next`
  and `SEARCH_PAUSE_MS = 250` otherwise. The screen applies that delay before the text becomes
  `criteria`.
- **Pages.** A pure page accumulator in `src/ui/transaction-search.ts` holds
  `{ rows, stamp, exhausted }` and decides each read:
  - **The stamp is taken before each page read**, exactly as in D1, and stored with the rows that
    read returned. A commit by another connection during the read therefore makes the stored stamp
    differ from the next one, and the next «Показати ще» takes the stamp-moved path below.
  - **«Показати ще» with the stamp unchanged** since `rows` were read: read `offset = rows.length`,
    `limit = PAGE_SIZE + 1`, and append. The extra row says whether more remain and is not shown.
  - **«Показати ще» with the stamp moved:** read `offset = 0`,
    `limit = rows.length + PAGE_SIZE + 1` in one read, and replace. A транзакція stored between
    pages is therefore neither repeated nor skipped, and FlatList keys stay unique.
  - **Focus or own write:** read `offset = 0`, `limit = rows.length + 1` in one read and replace.
    The pages shown are kept, as today, at the cost of one read instead of `pages` reads.

  Keyset paging on (date, createdAt, id) was considered. It needs `createdAt` on the domain
  `Transaction`, which deliberately has no room for storage metadata, and the stamp check gives the
  same guarantee.
- **Paging in storage.** In `transactionsRepo.search`, when there is no `match`, `limit` and `offset`
  go into the SQL (served by `transactions_order_idx`), since nothing is filtered after the read.
  With a `match`, the read-then-filter of design D12 (Ukrainian case folding) stays. Its matched
  rows are memoized with `stampedMemo(db, read, extraKey = the criteria and filters)`, so
  «Показати ще» on a search slices the remembered matches instead of reading storage again. The SQL
  narrowing by рахунок, місяць and «Без категорії» still runs in SQL and is not re-implemented in
  TypeScript.
- **Months** come from a stamped `SELECT DISTINCT substr(date, 1, 7)` over the date index, not from
  the stored-history memo. So opening «Транзакції» with nothing searched never forces a whole-history
  read. `.claude/rules/database.md` keeps in the domain what the domain can compute "unless measured
  to be too slow"; the task 1.2 baseline (opening «Транзакції» on the 10 000-транзакція бекап) is
  that measurement.
- **Over-ліміт marks** come from `storedHistory.read().byMonth()`, only when limits exist, as today.

### D7. Long lists and redraw scope

- **Virtualized lists.** «Транзакції», `account/[id]` and `category/[month]/[categoryId]` move from
  `ScrollView` + `.map` to `FlatList`:
  - `keyExtractor` by id
  - `initialNumToRender` ≈ 15, `windowSize` 7, `removeClippedSubviews` on Android
  - headers (search, filters, summaries) as `ListHeaderComponent`, so the page scroll feels the same

  `Screen` (`surfaces.tsx`) gains a list variant, so padding, pull-to-refresh and the keyboard rules
  of `app-shell` still apply.
- **Stable rows.** `TransactionRow` and `Icon` take only primitive or stable props: the line is
  computed once per row with `useMemo` over the feed, not per render with `new Date()`. `Icon`'s
  parsed paths are hoisted per icon key.
- **Головний.** The чернетка amount state moves into a `DraftRow` child. `renderWidget` stays a
  function inside the screen. Once the typed сума is `DraftRow`'s own state a keystroke no longer
  re-renders the screen at all, so the widgets are not redrawn by typing. Turning `renderWidget`
  into a component would take about twenty props from the screen's closures, and a prop object
  rebuilt on every render would defeat the memoization it is meant to buy. Revisit it only if the
  profiler shows widgets redrawing on a change that is not theirs (found while implementing 8.4). `feed` becomes `latest.slice(0, FEED_SIZE)` instead of a second `listLatest`.
  `netWorthWidgetModel` and `goal-screen` take `balances()` rather than recomputing `computeBalance`
  per рахунок: `currentNetWorth` and the goal contributions gain a `balances` parameter, so domain
  stays pure.
- **Compiler check first.** Before adding any `React.memo`, confirm the compiler compiled the
  component (the React DevTools "Memo ✨" badge on the emulator, or the compiler's Babel logger in a
  dev build). Add `React.memo` only where it bailed out.
  **Finding (task 8.3):** run through `babel-plugin-react-compiler` with its `logger`, all four
  compiled and none bailed out — `TransactionRow`, `Icon`, `NetWorthWidget` (and its
  `DisclosureChevron`) and `CategoryWidget` (and its `Swatch`). So no `React.memo` was added.
  `Icon`'s paths were already module constants (`ICON_PATHS`), so there was nothing to hoist.
- **AI-аналіз «показати файл»** renders the export as a `FlatList` of lines, not one `<Text>`.
- **Звіти's history derivation is memoized under the stamp, not per read.** `reports.tsx` builds a
  fresh `stored` object on every focus read, so a `useMemo` over it alone would re-derive the whole
  history on every focus. `repos.ts` therefore exports `rememberedRead(read)`, a `stampedMemo` over
  the device `db`, and `reports.tsx` derives `reportsHistory` inside one at module level, keyed on
  the day. Every input to it (the stored history, категорії, цілі, rates) is storage, so the stamp
  is its whole key. A second focus with nothing written re-derives nothing. `reportsSelection` stays
  a `useMemo` over that history value and the choice.

### D8. What is deliberately not done now

- `enableFreeze`. Revisit after D4 if the profiler still shows hidden tabs rendering.
- FlashList. It is a new dependency; `FlatList` with correct props is enough at these sizes.
- Async SQLite.
- A lowercase shadow column for search (design D12 of `transaction-search`).

### D9. Behaviour-neutral tasks

Tasks 5.3 (day-rollover), 6.2's monobank-link read, 6.3 (sweep map), 8.3 (row memo) and 8.5
(AI-аналіз file list) change no requirement. They are pure cost reductions, and their existing tests
must stay green unchanged.

## Risks / Trade-offs

- **[A memoized read depends on something outside storage]** → Only reads that are functions of
  storage are wrapped. `now`-dependent ones pass the day as `extraKey`. Rates, props and screen
  state are never inside a memoized read.
- **[Deep freeze breaks a caller that mutated an answer in place]** → The freeze holds in every
  build (D1), so such a caller fails visibly rather than corrupting the next caller's answer. The
  audit found no in-place sort on `listAll` results, and every consumer of a memoized read runs
  under `verify` against frozen answers first.
- **[Memory]** → 10 000 mapped транзакції are a few MB in Hermes. Only one generation per memo is
  kept.
- **[`data_version` or `isInTransactionSync` semantics differ on expo-sqlite's bundled SQLite]** →
  `data_version` is standard since SQLite 3.8.x. Task 2.2 proves the two-connection cases in Node
  against a temporary file database, and the emulator smoke repeats them with a real фоновий прогін.
- **[The deferred прогрес judgement lands after the owner navigated away]** → It announces itself.
  The screen it was triggered from marks itself stale if hidden, and the new screen reads on its own
  focus as always.
- **[One empty frame on a tab's first open]** → Accepted and stated in D4. Covered visually by
  `app-motion-pass`'s tab fade only if that change lands first or together with this one; landed
  alone, this change shows that frame once per tab per launch.

## Migration Plan

One generated migration adds two indexes. It is applied at startup by the existing
`applyMigrations`, needs no data movement, and is immutable once committed. Rollback is the
previous APK. SQLite ignores unknown indexes on downgrade, and the migration table entry is
harmless.
