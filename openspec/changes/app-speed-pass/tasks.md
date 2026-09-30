## 1. Measurement baseline

- [x] 1.1 Add `scripts/make-big-backup.ts`: a deterministic synthetic бекап built through the
  existing `src/backup/` writer. It holds 27 рахунки in UAH, USD and EUR and 10 000 транзакції over
  4 years (витрати, доходи, перекази across currencies, повернення, 30 ліміти, 5 цілі). Verify: the
  file restores on the emulator through Налаштування → Бекап and «Транзакції» reaches the last row.
- [x] 1.2 Record a baseline on the emulator with that бекап restored, and with the журнал bound as in
  the app, in
  `openspec/changes/app-speed-pass/baseline.md`. Measure with the Hermes sampling profiler or
  `performance.now()` logs in a dev build:
  - cold launch to interactive
  - tab switch Головний → Рахунки → Звіти
  - back swipe from a транзакція to Головний
  - tapping a Звіти month column
  - typing «сільпо» in «Транзакції»
  - opening the largest рахунок

## 2. Stamp-keyed memo and stored history (persistence)

- [x] 2.1 Add the `inTransaction(db)` seam in `src/db/prepare.ts` (expo-sqlite
  `isInTransactionSync`, better-sqlite3 `inTransaction`), and `storageStamp` and
  `stampedMemo(db, read, extraKey?)` and `outsideStamp(db, write)` in `src/db/stored-history.ts`:
  bypass inside a transaction, stamp first, excluded журнал rows, and readonly answers deep-frozen in
  every build (design D1). Tests in
  `src/db/stored-history.test.ts`:
  - "Scenario: A second read with nothing written in between reads nothing again"
  - "Scenario: A write that was rolled back changes nothing"
  - "Scenario: A read taken inside a write that is then rolled back is not remembered"
  - "Scenario: One caller cannot change another caller's answer" (push, element mutation and
    `Map.set` on an answer all throw)
  - "Scenario: A журнал entry between two reads does not cause a re-read" (`reportingRepo.append`
    goes through `outsideStamp`, a change in `reporting-repo.ts` with its own test there)
- [x] 2.2 Two-connection tests in `stored-history.test.ts`, over two better-sqlite3 connections to
  one temporary file database, asserting through `storedHistory.read()` on the first:
  - "Scenario: A write committed by the background opening is seen on the next read"
  - "Scenario: A write committed by the background opening during a read is seen on the next read".
    Test `stampedMemo` directly with an injected read that runs its SELECT, then commits a
    транзакція on the second connection, then returns the pre-commit rows. The next call must
    contain the row. A variant that takes the stamp after the read must make this test fail,
    checked once by hand while writing it.
- [x] 2.3 Add `storedHistory.read()` with `accounts`, `transactions`, `months`, a lazy `byMonth()`
  in `listMonth` order and a lazy `balances()`, and export `storedHistory` from `src/db/repos.ts`.
  Tests:
  - "Scenario: A транзакція saved in between is in the next answer"
  - "Scenario: A removal, a recategorisation and a restore are all seen" (through
    `transactionsRepo.remove`, `setCategory`, `mergeAccounts` and `backupRepo.replaceAll`)
  - "Scenario: A balance beyond the safe range is refused only to readers of balances"
- [x] 2.4 Property test in `stored-history.test.ts` with fast-check, "Scenario: Served balances agree
  with a fresh computation over any history". Generated рахунки include archived ones and a
  рахунок-борг. Generated транзакції cover every type, cross-currency перекази, many перекази onto
  the same рахунок, and комісії. Storage's CHECK refuses a переказ onto the рахунок it leaves, so
  that one case is asserted on `computeBalances` directly. Add the fixed case "Scenario: A переказ between currencies moves each
  leg in its own currency".
- [x] 2.5 Change `withAwaiting` to read `counterpart_income_awaits` whole for full-history reads
  (design D2). Write the failing test first, in `src/db/transactions-repo.test.ts`: "Scenario: More
  перекази than one query can name are still read" (33 000 перекази inserted in one transaction,
  one awaiting).
- [x] 2.6 Wrap `countUncategorised`, the four `netWorthRepo` reads and `readProgressSummary` in
  `stampedMemo`, passing the day as `extraKey` where `now` is an input. Test in
  `stored-history.test.ts`: "Scenario: The «Без категорії» count and the статок reads follow a
  write". Each wrapped read also gets a test in its own `*-repo.test.ts` that its memoized answer
  equals the direct read before and after a write.

## 3. Indexes (persistence)

- [x] 3.1 Add `transactions_category_idx` and `transactions_order_idx` to `src/db/schema.ts` and run
  `npm run db:generate`. Test in `src/db/migrations.test.ts`:
  - "Scenario: The migration keeps every stored транзакція"
  - "Scenario: The «Без категорії» count uses the категорія index"
  - "Scenario: The latest транзакції are listed without a sort pass" (the last two through
    `EXPLAIN QUERY PLAN`)

## 4. Domain takes computed balances

- [x] 4.1 Give `currentNetWorth` (`src/domain/net-worth.ts`) and the goal contribution functions
  (`src/domain/goals.ts`) a `balances` parameter in place of the per-рахунок `computeBalance`, and
  update `src/ui/net-worth.ts` and `src/ui/goal-screen.ts`. The existing tests stay green without
  changing what they expect. Add one test per function asserting the same result with precomputed
  balances.

## 5. Read policy and deferred work (app-shell)

- [x] 5.1 Add the pure `src/ui/read-policy.ts` (design D4). Tests in `src/ui/read-policy.test.ts`:
  - "Scenario: Launch reads only the shown tab"
  - "Scenario: A tab opened for the first time shows current data" (as a policy: the first focus
    reads)
  - "Scenario: A sync finishing behind a pushed screen does not re-read Головний until return"
  - "Scenario: A sync starting reads nothing"
  - a changed `read` while focused (`read-changed`) reads at once
- [x] 5.2 Apply the policy in `useReloadOnFocus`: the `whileUnseen` placeholder and
  `reloadWhenSeen()`. Pass the placeholder from Місяць, Рахунки, Звіти and Налаштування. Switch the
  `onSyncState` and `onCapturesStored` subscriptions to `reloadWhenSeen`, and drop the reload at
  sync start. Rewrite the hook's doc and the `repos.ts` doc. Source tests in
  `src/ui/read-policy.test.ts` assert that no `onSyncState` handler calls `reload(` directly, and
  ("Scenario: Launch reads only the shown tab") that `month.tsx`, `accounts.tsx`, `reports.tsx`
  and `settings.tsx` each pass `whileUnseen` and make no other storage read while rendering.
- [x] 5.3 Move Головний's day-rollover interval into `useFocusEffect` (behaviour-neutral, design D9),
  covered by a source test in `src/ui/home-screen.test.ts`.
- [x] 5.4 Add the `src/platform/idle.ts` port, its `idle-device.ts` adapter (`requestIdleCallback`
  with a 500 ms timeout) and a queueing in-memory double with `flush()`. Add the pure
  `src/progress/deferred-judgement.ts` (`judgeAfterSettle`). Tests in
  `src/progress/deferred-judgement.test.ts`, with the queueing double:
  - "Scenario: Saving a транзакція returns to the previous screen before прогрес is judged" (nothing
    judged before the flush, then judged exactly once with the same verdict)
  - "Scenario: A досягнення earned by a save appears on the screen in sight" (`announce` fires when
    judging earned something, and not otherwise)
- [x] 5.5 Bind `judgeProgressLater` and the `onProgressJudged` event in
  `src/hooks/progress-ports.ts`. Replace every `evaluateProgress()` call under `src/app/` with
  `judgeProgressLater()` (the call sites listed in design D5; the launch evaluation moves into 5.6),
  and subscribe Головний, Рахунки, Звіти, `progress.tsx` and `challenge/[key].tsx` to
  `onProgressJudged` through `reloadWhenSeen`. A source test in `src/ui/read-policy.test.ts`
  asserts no file under `src/app/` calls `evaluateProgress(`. Verify on the
  emulator: categorising the last «Без категорії» витрата shows the earned досягнення on Головний
  without leaving it.
- [x] 5.6 Start the launch chores in `src/app/_layout.tsx` from one `afterScreenSettles` callback,
  through the pure `src/ui/launch-chores.ts` (design D5), the launch прогрес evaluation among them. Test in `src/ui/launch-chores.test.ts`:
  "Scenario: Launch chores run after the first screen is drawn" (nothing starts before the flush,
  the order is kept, each starts exactly once, and the async ones are started, not awaited in
  sequence).

## 6. Screens read the stored history

- [x] 6.1 Головний (`src/app/(tabs)/index.tsx`):
  - read `storedHistory` instead of `listAll` + `computeBalances`
  - `feed = latest.slice(0, FEED_SIZE)`
  - `overLimitByMonth` over `byMonth()`
  - pass `balances()` to the net-worth model

  Verify by `npm run verify` and a source test in `src/ui/stored-history-usage.test.ts` that the
  screen no longer calls `transactionsRepo.listAll`.
- [x] 6.2 Рахунки, Звіти, `goal/[id]`, AI-аналіз and the Saldo import read `storedHistory`. Рахунки
  and `account/[id]` read monobank links in one query (behaviour-neutral, design D9, with a repo
  test). Extend `src/ui/stored-history-usage.test.ts` to assert no file under `src/app/` calls
  `listAll(`.
- [x] 6.3 In the `rules-repo` sweep, build a `Map` by id before the loop (behaviour-neutral). The
  existing sweep tests stay green, and one new test covers a sweep over 5 000 транзакції.

## 7. «Транзакції» (transaction-search)

- [x] 7.1 `transactionsRepo.search`: `limit`/`offset` in SQL when there is no `match`, and the
  `match` path unchanged. Add the stamped distinct-months read. Test in `transactions-repo.test.ts`:
  "Scenario: The unsearched listing reads one page from storage" (the rows read, counted through a
  wrapper over the test db). The existing search tests stay green.
- [x] 7.2 Add `searchDelayMs` and `SEARCH_PAUSE_MS` in `src/ui/transaction-search.ts`. Tests:
  "Scenario: Fast typing searches once" and "Scenario: Clearing the field is immediate", as pure
  timing over a scripted keystroke sequence.
- [x] 7.3 Add the pure page accumulator in `src/ui/transaction-search.ts` (design D6). Tests in
  `src/ui/transaction-search.test.ts`, run against a real test db through `search`:
  - "Scenario: The third page reads one page"
  - "Scenario: More of a search reads nothing already read" (the memoized matches, keyed on the
    criteria, are sliced without a storage read)
  - "Scenario: A транзакція stored between pages is neither repeated nor lost"
  - "Scenario: Coming back from a транзакція keeps the pages shown"
  - a race variant of "A транзакція stored between pages is neither repeated nor lost": a second
    connection commits during the page read, and the next «Показати ще» still repeats and skips
    nothing (the stamp is taken before the read)
- [x] 7.4 Wire `transactions.tsx`: local search text with the paused `criteria`, the page
  accumulator, months from the stamped read, and over-ліміт marks from `byMonth()`. Test in
  `src/ui/transaction-line.test.ts`: "Scenario: Rows spanning two years are marked as the
  month-by-month reading marks them". It compares `overLimitByMonth` fed by `byMonth()` with the
  same function fed by `listMonth`, over 24 months including one ceiling month.

## 8. Long lists and redraw scope (app-shell)

- [x] 8.1 Add a list variant of `Screen` in `src/components/surfaces.tsx`: a `FlatList` keeping
  padding, `RefreshControl` and keyboard insets. Move «Транзакції» onto it. Verify on the emulator
  that the search header, the filters and «Показати ще» behave as before.
- [x] 8.2 Move `account/[id].tsx` and `category/[month]/[categoryId].tsx` onto the list variant.
  Source test in `src/ui/stored-history-usage.test.ts`: "Scenario: A рахунок with a thousand
  транзакції opens without drawing them all" (these screens render through the list variant, not
  `.map` in a `ScrollView`).
- [x] 8.3 Compute `TransactionRow` lines once per feed with `useMemo`, and hoist `Icon` path data
  per key (behaviour-neutral). Check the compiler status of `TransactionRow`, `Icon`,
  `NetWorthWidget` and `CategoryWidget` in a dev build, and add `React.memo` only where it bailed
  out. Record the finding in design D7.
- [x] 8.4 Головний: add the `DraftRow` child owning its amount state (`renderWidget` stays a
  function, design D7). Source test in `src/ui/home-screen.test.ts`: "Scenario: Typing into a чернетка redraws
  only that чернетка" (the amount state is not held by the screen). Confirm with the React DevTools
  profiler on the emulator.
- [x] 8.5 AI-аналіз «показати файл» as a `FlatList` of lines (behaviour-neutral). Verify on the
  emulator with the big бекап: the panel opens and scrolls without a freeze.

## 9. Звіти (reports-screen)

- [x] 9.1 Split `reportsViewModel` in `src/ui/reports-screen.ts` into `reportsHistory(stored)` and
  `reportsSelection(history, choice)`. In `reports.tsx`, derive `reportsHistory` inside a
  `rememberedRead` (a `stampedMemo` over the device `db`, exported from `repos.ts`) keyed on the day,
  and `reportsSelection` in a `useMemo` (design D7). Tests in `src/ui/reports-screen.test.ts`:
  - a second focus with nothing written re-derives nothing (a `stampedMemo` over
    `reportsHistory` with a spy, over a test db)
  - "Scenario: Tapping a month column does not rebuild the history" (`reportsSelection` takes only
    the history value, and a spy history shows no re-derivation)
  - "Scenario: A choice shows the same numbers a full derivation would" (fast-check over choices,
    compared with the old composition)

## 10. Proof on the device

- [ ] 10.1 Repeat the task 1.2 measurements into `baseline.md` beside the originals. Each measured
  path must meet the design Goals; any that does not is reported, not ticked.
  Measured on 2026-09-30, results in `baseline.md`; **left unticked**: the tab and back paths read almost
  nothing now, but a search still blocks the JS thread for 20–50 s and "under one frame" could not be
  established with the probe (its floor is 120 ms).
- [x] 10.2 Run `npm run verify` and paste the final lines
- [x] 10.3 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
