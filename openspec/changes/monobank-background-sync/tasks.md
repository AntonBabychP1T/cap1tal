## 1. The engine: a run that yields

- [x] 1.1 Add the `postponed` outcome to `AccountOutcome` and the optional `postponed?: () =>
      boolean` port to `SyncPorts` in `src/monobank/coordinator.ts`, asked at every point
      `cancelled` is asked — after each wait, before each request, at the top of each account and
      window — with `cancelled` asked first (design D3, D5, D6). A yes ends the run as a
      cancellation does, under the word `postponed`, in both shapes the spec states. Verify:
      `src/monobank/coordinator.test.ts` covers monobank-sync's «A postponed рахунок moves no
      moment», «An answer in flight when the budget passes is still stored whole», «A рахунок
      stopped between its windows keeps its pages and its turn», «The owner's stop still reads as
      cancelled» and «A рахунок never asked about keeps its place in the order» — the last by
      running a second coordinator over the turns the first left.
- [x] 1.2 Create `src/monobank/yielding.ts` with `budgetedRun({ nowMs, setTimer, deadlineMs })`
      — a `wait` that declines a wait ending past the deadline and a `postponed` that remembers
      it — `foregroundRun({ setTimer, inForeground, onLeaveForeground })` — a `wait` that ends on
      the timer or on leaving the foreground, unsubscribing the other, and a `postponed` that is
      «not in front» — and `withRequestTimeout(fetch, { setTimer, timeoutMs })` over
      `AuthFetchLike` (design D3, D5, D8). Verify: `src/monobank/yielding.test.ts` covers
      monobank-sync's «The budget stops the run before a wait it cannot hold», «A run without a
      budget postpones nothing», «Leaving the app stops the run at its next request», «An answer
      in flight is kept», «A request the bank never answers ends unavailable» and «A request that
      answers in time is unaffected», each by driving `syncLinkedAccounts` with the ports over fake
      timers, a fake foreground and a fetch that never resolves.
- [x] 1.3 In `src/monobank/auto.ts`, add `postponed` to `BY_URGENCY` between `cancelled` and
      `complete`, make `needsOwner` answer nothing for it, give `syncDue` an optional `outcome`
      that makes a postponed attempt due at once, and add `followUpDue({ attempt, inForeground })`
      — true only for an attempt remembered as `postponed` while the app is in front (design D6).
      Verify: `src/monobank/auto.test.ts` covers monobank-sync's «A postponed рахунок outranks a
      completed one», «A failure outranks a postponed рахунок», «A cancelled рахунок outranks a
      postponed one», «A postponed attempt needs nobody», «Opening after a postponed run syncs at
      once», «A completed run still holds the interval», «A run the background began finishes in
      front of the owner», «The follow-up is not a loop», «A run that never reached the bank is not
      followed up» (a withdrawn attempt is not followed) and «A run that yields in the background
      is not followed up».
- [x] 1.4 In `src/ui/monobank-sync.ts`, raise a сповіщення про збій only for a failure —
      invalid-token, rate-limited, unavailable — and nothing for `cancelled` or `postponed`; a
      completed run still clears (design D6). Verify: `src/ui/monobank-sync.test.ts` covers
      monobank-sync's «A run that yielded raises no сповіщення про збій» and «A run the owner
      stopped raises no сповіщення про збій», and the existing «a failure nobody is watching does
      post one» still passes.

## 2. One background run

- [x] 2.1 Create `src/ui/monobank-background.ts` with `backgroundTurnsWanted({ links })` and
      `runBackgroundTurn(ports)`: `syncDue` over the links and the attempt; the budgeted ports
      built from the `budgetMs` and `nowMs` inputs and put over the sync ports handed in,
      replacing their `wait` and `postponed`; `startSync` with no `alerts` and `attended: false`;
      then `needsOwner` over the attempt and `syncCoverage(links)` deciding `raise` — with the
      caller's `attended` port and only when `monobank-sync` is not already outstanding — or
      `clear`, and a typed outcome the task can act on (design D7). The module imports nothing
      from `src/platform/*-device.ts` or `src/platform/background-turn.ts`. Verify:
      `src/ui/monobank-background.test.ts` covers monobank-sync's «A background run after the
      quiet interval syncs without the app being opened», «A chance inside the quiet interval
      sends nothing», «A chance while a run is going on starts no second one», «A chance with
      nothing linked sends nothing and leaves no attempt», «A chance without a token sends nothing
      and leaves no attempt», «Unreadable token storage on a chance sends nothing and leaves no
      attempt» and «Chances are wanted exactly while a рахунок is linked», against the in-memory
      token store, a scripted bank and a real database — driving it with sync ports whose own
      `postponed` answers yes and asserting requests are still sent.
- [x] 2.2 Prove what a background run announces, in the same file: «A rejected token in the
      background is announced once» (including that the second run writes no журнал line), «A
      phone offline for one run stays silent», «A day without a sync is announced», «A bank never
      wholly heard from is stale», «A postponed run announces nothing», «A failure the owner is
      already looking at is announced nowhere but on the screen» and «A completed run clears what
      an earlier one raised», over `inMemoryLocalNotifications`, the reminders repository and the
      test journal; and that the attempt a budgeted run leaves is one `followUpDue` answers yes
      for while the app is in front and no for while it is not.

## 3. What the screen says

- [x] 3.1 In `src/ui/monobank-screen.ts`, add «перенесено» to `OUTCOME_LABELS`, exclude
      `postponed` in `syncFailed` beside `cancelled`, and add `BACKGROUND_SYNC_NOTE` with
      `backgroundNote(links)` answering it only when a link exists (design D6, D10). Verify:
      `src/ui/monobank-screen.test.ts` covers monobank-sync-screen's «A run that yielded reads as
      postponed and offers the retry», «A linked bank is told about the background», «Nothing
      linked, nothing said about the background» and «Every outcome is named on the screen» — the
      last reading `src/app/manage/monobank.tsx` by path, as testing.md allows, and asserting the
      legend line calls `outcomeLabel` for every `AccountOutcome`.

## 4. The platform: the tasks and the entry

- [x] 4.1 Create `src/platform/background-turn.ts` exporting `BACKGROUND_TURN_INTERVAL_MINUTES =
      15`, `BACKGROUND_TURN_BUDGET_MS` behind `Platform.select` with the Android value
      `8 * 60_000`, and `prepareBackgroundStorage()` — `migrate` from
      `drizzle-orm/expo-sqlite/migrator` over `drizzle/migrations`, then `bindJournal` — and make
      `src/platform/drive-backup-task.ts` register with the shared interval and await the
      preparation first (design D2, D3, D4). Verify: `npm run typecheck`; the «what verify may
      load» guards in `src/platform/*.test.ts` still pass, since neither file is imported by a
      test.
- [x] 4.2 Create `src/platform/monobank-sync-task.ts`: `defineTask('cap1tal.monobank-sync.v1')`
      awaiting `prepareBackgroundStorage()`, then `runBackgroundTurn` handed `syncPorts()`,
      `BACKGROUND_TURN_BUDGET_MS`, the clock, `monobankRepo`, `ALERT_PORTS` and `attended` from
      `AppState` — the budgeted ports are built inside `runBackgroundTurn`, never here — mapping
      the outcome to `BackgroundTaskResult` (`storage-unavailable` and a thrown run are `Failed`,
      everything else `Success`) and calling `evaluateProgress()` when anything was imported; and
      `syncMonobankSyncTask()` registering or unregistering by `backgroundTurnsWanted` through
      `background-turn.ts`'s shared `reconcileTask`, which both tasks use so the shared interval is
      passed in exactly one place (design D7, D9). Verify: `npm run typecheck`.
- [x] 4.3 Create `index.ts` at the root importing the two task modules and then
      `expo-router/entry`; point `package.json`'s `main` at it; add `index.ts` to
      `app.config.js`'s `BUILD_SOURCES` and to `scripts/fingerprint.sh`'s `WATCH`; `_layout.tsx`
      keeps only its named `syncDriveBackupTask` import, which is the registration call — there is
      no definition-only import there to drop (design D4). Verify: `npm run typecheck`,
      `npm run lint`, and `npx expo-doctor` reports nothing about the entry.
- [x] 4.4 In `src/hooks/monobank-ports.ts`, build the foreground `wait` and `postponed` from
      `foregroundRun` over `setTimeout` and `AppState`, and the `fetch` from `withRequestTimeout`
      over the device `fetch` with an `AbortController` (design D5, D8). Verify: `npm run
      typecheck`; the behaviour is proven in task 1.2 through the pure helpers.

## 5. The app shell and the monobank screen

- [x] 5.1 In `src/app/_layout.tsx`: pass the attempt's `outcome` to `syncDue`; call
      `syncMonobankSyncTask()` after the migrations and on every return to the foreground; subscribe
      to `onSyncState` and, when a run ends, start a full run only if `followUpDue` over the
      attempt just written and `AppState` says so — never by asking `syncDue` again (design D6,
      D9). Verify: `npm run typecheck` and the smoke of §8.
- [x] 5.2 In `src/app/manage/monobank.tsx`: render `backgroundNote(stored.links)` in the sync
      section, name every outcome in the legend line — «скасовано» and «перенесено» join the four
      — and re-assert `syncMonobankSyncTask()` whenever the number of links changes (design D9,
      D10). Verify: `npm run typecheck`, the legend test of task 3.1, and the smoke of §8.

## 6. The documents

- [x] 6.1 `docs/product-vision.md` §12: the owner's decision of 2026-09-07 that the monobank sync
      also runs in the background, best-effort, promising no cadence. `docs/glossary.md`: a
      «monobank sync» section defining прогін, хід, тихий інтервал, фоновий прогін, поступитися
      and перенесено, the last two chosen because «відкладено» and «передати» are taken (design
      D10).
- [x] 6.2 `docs/app-overview.md` §4.4 — replace «Нічого не працює у фоні» with the chance, the
      budget and the yielding; `docs/tech-task.md` — a row for this change under «Зміни поза
      нумерацією»; `.claude/rules/android.md` — the background capabilities in scope are
      notification access and the WorkManager chances of the бекап and the monobank sync;
      `.claude/rules/database.md` — `prepareBackgroundStorage` is the one other caller of the same
      migrator, and why the two cannot interleave; `openspec/changes/google-drive-backup/design.md`
      D9 — one sentence that the interval is now the app's shared one and the definition lives at
      the entry (design D2, D4, D10).

## 7. The gate

- [x] 7.1 Run `npm run verify` and paste the final lines
- [ ] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

## 8. Smoke

- [ ] 8.1 Run the `smoke-runner` subagent on the emulator for the plumbing, which needs no token:
      after `scripts/android.sh up`, link nothing and confirm `logs` shows no task registered;
      seed one link as `monobank-sync-fairness` §8 did and confirm the registration and the new
      sentence in the sync section; send the app to the background (`key home`), force the
      WorkManager job with `adb shell cmd jobscheduler run -f com.antonbabychp1t.cap1tal <id>`
      (the id from `adb shell dumpsys jobscheduler | grep cap1tal`), and confirm `logs` shows the
      task executed and finished with the run answering `not-configured`; then kill the process
      (`adb shell am force-stop`) and force the job again to prove the headless start defines the
      task. Fix what it finds.
- [ ] 8.2 The money path is the owner's, on the phone with the token, as `monobank-connect-flow`
      records it: link the рахунки, leave the app, come back after half an hour and read the
      monobank screen — «Синхронізовано N з M рахунків» grown, or «Остання синхронізація» moved;
      start «Синхронізувати» on the monobank screen, leave the app mid-run and come back — the
      result names the unfinished рахунки «перенесено» and a full run starts by itself; open the
      app while a background run is going on — Головний says «Синхронізація…» and, when it ends
      postponed, a full run follows at once; and, with the token deliberately revoked in the
      bank's app, one «Не вдалося синхронізувати monobank» in the shade and no second one on the
      next chance. Record what was seen here.

## 9. Blocking: the archive order

- [ ] 9.1 **Do not archive this change before `qa-sweep-2026-09` is archived.** Both MODIFY the
      monobank-sync-screen requirement «Sync progress and every terminal outcome are
      understandable and retryable»; this change's block is the union of the two, so it must be
      the one that lands last. Verify before archiving: `openspec list` shows `qa-sweep-2026-09`
      archived and `openspec/specs/monobank-sync-screen/spec.md` already carries «Sync without a
      token offers the token, not a retry».
