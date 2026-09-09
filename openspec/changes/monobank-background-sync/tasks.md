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
      D9). Verify: `npm run typecheck` and the smoke of §9.
- [x] 5.2 In `src/app/manage/monobank.tsx`: render `backgroundNote(stored.links)` in the sync
      section, name every outcome in the legend line — «скасовано» and «перенесено» join the four
      — and re-assert `syncMonobankSyncTask()` whenever the number of links changes (design D9,
      D10). Verify: `npm run typecheck`, the legend test of task 3.1, and the smoke of §9.

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

## 7. The defect the owner's phone found

The report of 2026-09-09 (commit `3c296ab`): `platinum ··6628` has never synced, and the other
рахунки had not moved since 2026-09-07 across five openings, with no monobank failure in the
журнал — the signature of runs ending `postponed`, the one outcome that says nothing. Two causes,
and both have to be closed for the рахунок to finish (design D11, and the corrected D5 risk).

- [x] 7.1 Remember where paging got to. Add a migration giving `monobank_links` two nullable
      columns — the end of the window being paged and the end the next request should ask for —
      and carry them through `src/db/schema.ts` and `src/db/monobank-repo.ts`
      (`StoredMonobankLink`, `commitStatementAnswer`), leaving them out of `src/db/backup-repo.ts`
      and `src/backup/format.ts` for `last_attempted_at`'s reason (design D11) — `format.ts`'s own
      prose says `last_attempted_at` «is the one column excluded», which after this is three, so
      that sentence is corrected where it stands. Verify: the migrations test runs every committed
      migration on an empty database, and a repository test stores and reads the pair back and
      proves a бекап carries none of the three. Also covers persistence's «A half-paged window
      survives a restart», «A link with no window in progress remembers no position», «Existing
      links survive gaining the paging position» — links, cursors, imported ids and balances
      written under the previously committed migrations alone, then brought to the current shape —
      and «A бекап carries no paging position».
- [x] 7.2 Resume from it. In `src/monobank/coordinator.ts`, write the pair after each full answer
      and clear it when a window answers short; when a рахунок starts with a pair recorded, work
      that window first — resumed at the remembered request end — and move the cursor to the
      remembered *window* end when it finishes, then plan the rest from there. A remembered window
      end at or below the cursor is discarded. Verify: `src/monobank/coordinator.test.ts` covers
      monobank-sync's «Paging stopped in the middle of a window continues in the next run», «An
      account larger than one run finishes over several runs», «The cursor moves to the paged
      window's end, not the run's», «A failure over a half-paged window keeps the position», «A
      position that no longer describes work left is discarded» and «A finished window leaves no
      position» — the resume ones by running a second coordinator over what the first left, and
      each of them written to fail against today's code before the code moves.
- [x] 7.3 Do not spend a whole run on the answer. In `src/monobank/yielding.ts`, `foregroundRun`
      answers `postponed` no while the run has been asked for no wait yet — the wait is the only
      thing the coordinator tells the port, and the pace calls one before every request but the
      first, *unless the device already owes the bank the minute between requests*, in which case a
      wait precedes the first request too and the run stops having sent nothing. That case is not a
      miss and the spec names it: such a run has nothing it may send. `budgetedRun` is left exactly
      as it is (design D12). `src/hooks/monobank-ports.ts` and its
      `AppState` reading are unchanged **by this change**: Android offers no finer answer, and the
      design says so rather than the code pretending otherwise. (The file is modified in the shared
      tree by `journal-diagnostics`, which adds journaling and touches neither port.) Verify: `src/monobank/yielding.test.ts` covers
      monobank-sync's «A run that has sent nothing does not yield» and «A run that owes the bank a
      minute sends nothing while the app is away», and the existing «Leaving the app stops the run
      at its next request», «The budget stops the run before a wait it cannot hold» and «A run
      without a budget postpones nothing» must all still pass unchanged.
- [x] 7.4 `.claude/rules/database.md` and `docs/app-overview.md` §4.4: a рахунок whose вікно needs
      more pages than one прогін affords now carries its place between прогони, so «перенесено» on
      such a рахунок means progress rather than repetition.

## 8. The gate

- [x] 8.1 Run `npm run verify` and paste the final lines

      ```
       Test Files  164 passed (164)
            Tests  3234 passed (3234)
      ✔ verify passed (a92fbe5cb49bfa3264cfce479cb7cf28fc2d6541)
      ```

      The fingerprint is of the tree as it stood the instant before this paste was written into
      this file, which is the closest a record kept inside a watched file can come to its own
      subject. The run after the paste is the same 164 files and 3234 tests.
- [x] 8.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

      **PASS on the third pass.** The first found the `BACKUP_SCHEMA_VERSION` entanglement with
      `journal-diagnostics` (closed by recording both answers in `format.ts` and by task 10.2),
      the untested atomicity of the paging write, an unreachable guard in `resumedWindow` and an
      inexact comment about the window's start. The second found that «A run SHALL NOT yield before
      it has sent its first request» was not what the code does — `paced` waits before the *first*
      request too when the device owes the bank the gap, so a run starting away sends nothing. The
      code was judged right and the spec narrowed to match: the exception is now named in the
      requirement, in design D12 and in a scenario of its own. The third pass found no CRITICAL;
      its three warnings are the spec wording (fixed), and tasks 9.2 and 10.2, which stay open.

## 9. Smoke

- [x] 9.1 Run the `smoke-runner` subagent on the emulator for the plumbing, which needs no token:
      after `scripts/android.sh up`, link nothing and confirm `logs` shows no task registered;
      seed one link as `monobank-sync-fairness` §8 did and confirm the registration and the new
      sentence in the sync section; send the app to the background (`key home`), force the
      WorkManager job with `adb shell cmd jobscheduler run -f com.antonbabychp1t.cap1tal <id>`
      (the id from `adb shell dumpsys jobscheduler | grep cap1tal`), and confirm `logs` shows the
      task executed and finished with the run answering `not-configured`; then kill the process
      (`adb shell am force-stop`) and force the job again to prove the headless start defines the
      task. Fix what it finds.

      **Seen on the emulator, 2026-09-08 (commit a12b764).** All four scenarios pass; no defect
      found, nothing fixed.

      - *Nothing linked → nothing asked for.* Unlinking the last рахунок on the screen left
        `shared_prefs/TaskManagerModule.xml` an empty `<map />` and `dumpsys jobscheduler` with no
        job for the package — the re-assert of task 5.2 fired without leaving the screen. The
        sync section then says only «Приєднайте хоча б один рахунок, щоб синхронізувати.»: no
        sentence about the background, as monobank-sync-screen requires.
      - *One link → registered, and the screen says so.* `TaskManagerModule.xml` held exactly
        `cap1tal.monobank-sync.v1` with `minimumInterval: 15` (and nothing for the бекап, which is
        not connected). The sync section carried «Синхронізація також відбувається у фоні —
        приблизно раз на чверть години, коли телефон це дозволяє.», and the legend named all six
        states, «скасовано» and «перенесено» included.
      - *A forced chance runs the task.* `cmd jobscheduler run -f` with the app backgrounded:
        `BackgroundTaskConsumer: Executing task 'cap1tal.monobank-sync.v1'` →
        `TaskService: Finished task` → `WM-WorkerWrapper: Worker result SUCCESS` →
        `Enqueuing worker … '15' minutes delay`. The run answered `not-configured`: no request to
        `api.monobank.ua`, no attempt row left, `last_attempted_at` still null, no сповіщення.
      - *A headless start defines the task.* With the process killed (`am kill`, which unlike
        `force-stop` leaves the job scheduled), the forced chance started a process **for the bound
        `SystemJobService`** — no Activity, no route — and that process logged
        `TaskService: Registered task with name 'cap1tal.monobank-sync.v1'`, then executed and
        finished it, with `Started headless task 1 to keep JS timers alive`. That registration line
        is the entry file doing its job: the definition was reached without a screen. Metro
        confirms the entry moved — it now bundles `index.ts`, not `expo-router/entry`.

      One thing worth knowing for later smokes, not a defect: on a **development** build the very
      first forced chance after a cold start does nothing, because the JS bundle is still being
      fetched from Metro when the worker fires — the process starts, WorkManager initialises, and
      `doWork` never runs. The next chance on that same headless process runs the task normally. A
      release build embeds the bundle and has no such window. `am force-stop` is also the wrong
      tool for this scenario: Android cancels a force-stopped app's jobs, so there is nothing left
      to force; `am kill` is what leaves the job and empties the process.
- [ ] 9.2 The money path is the owner's, on the phone with the token, as `monobank-connect-flow`
      records it: link the рахунки, leave the app, come back after half an hour and read the
      monobank screen — «Синхронізовано N з M рахунків» grown, or «Остання синхронізація» moved;
      the рахунок with the most транзакції — the one that has never completed a sync — reaches
      «Синхронізовано» after a few chances instead of standing at «Ще не синхронізовано» for ever,
      which is the defect §7 exists for;
      start «Синхронізувати» on the monobank screen, leave the app mid-run and come back — the
      result names the unfinished рахунки «перенесено» and a full run starts by itself; open the
      app while a background run is going on — Головний says «Синхронізація…» and, when it ends
      postponed, a full run follows at once; and, with the token deliberately revoked in the
      bank's app, one «Не вдалося синхронізувати monobank» in the shade and no second one on the
      next chance. Record what was seen here.

      **Run on 2026-09-09, and it failed** — репорт `cap1tal-report-2026-09-09-1747` (commit
      3c296ab, SM-S921B, android 16). Nine рахунки linked; the whole журнал held thirteen
      `GET /personal/client-info`, two `GET /bank/currency` and **not one**
      `GET /personal/statement`, over two days and both in front of the owner and behind them.
      Every прогін spent the bank's one-request-a-minute allowance on the client-info request that
      opens it and then owed a full minute before its first statement request; one chance sat inside
      that wait for 1,199,579 ms because Android stops JS timers along with the Activity, holding
      the one-run lock, and the two chances that followed answered `already-running`. Because no
      statement request was ever sent, no хід was ever taken, so `syncOrder` returned the same order
      every time and the same рахунок headed every прогін.

      What it found is `monobank-sync-cadence`, and the two are read together: this change's budget
      requirement is the one that could not work, and that change REMOVES it. §9.2 is re-run there
      as its own §9.2, against the журнал rather than against a finished sync.

## 10. Blocking: the archive order

- [ ] 10.1 **Do not archive this change before `qa-sweep-2026-09` is archived.** Both MODIFY the
      monobank-sync-screen requirement «Sync progress and every terminal outcome are
      understandable and retryable»; this change's block is the union of the two, so it must be
      the one that lands last. Verify before archiving: `openspec list` shows `qa-sweep-2026-09`
      archived and `openspec/specs/monobank-sync-screen/spec.md` already carries «Sync without a
      token offers the token, not a retry».

- [ ] 10.2 **Integrate `journal-diagnostics` before this change.** §7's migration was generated on
      top of that change's `0021` and is therefore `0022`, and `BACKUP_SCHEMA_VERSION` counts
      migrations rather than changes: on a tree carrying this change alone the constant is 23
      against 22 migrations and `format.test.ts` — the tripwire that makes every migration a
      deliberate answer — goes red. `src/db/migrations.test.ts`'s `BEFORE_THE_PAGING = 22` is the
      same fact from the other side, and `drizzle/meta/_journal.json` and `drizzle/migrations.js`
      carry both changes' hunks in lines that cannot be split. `src/backup/format.ts` records both
      answers, so whichever lands second finds the history whole. Verify before integrating:
      `npm run verify` green on a tree that carries `journal-diagnostics` and then this change,
      in that order.
