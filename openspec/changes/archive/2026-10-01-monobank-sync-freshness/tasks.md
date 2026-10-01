# Tasks

Baseline: `npm run verify` green on commit `7a3a3ac` (4067 tests). Every behaviour below gets its
failing test first; every new прогін test uses a non-zero `minRequestGapMs`.

## 1. Storage: the позачерговий moment

- [x] 1.1 Add `owedSince: integer('owed_since', { mode: 'timestamp_ms' })` to `monobankLinks` in
      `src/db/schema.ts`, run `npm run db:generate` (→ `drizzle/0006_*`), expose `owedSinceMs:
      number | null` on `StoredMonobankLink`, bump `BACKUP_SCHEMA_VERSION` and name the column
      among the ones a бекап leaves out. Tests in `src/db/migrations.test.ts` for «The migration
      keeps what the links held», in `src/db/monobank-repo.test.ts` for «A позачерговий link is still
      позачерговий after a restart», in `src/db/backup-repo.test.ts` for «A бекап does not carry it».
      Verify with `npx vitest run src/db src/backup`.
- [x] 1.2 In `src/db/monobank-repo.ts`: `upsertAccounts` marks a linked account whose stored
      `bank_balance_amount` differs (the later moment wins); `insertLink` sets `owed_since =
      cursorMs`; new `oweAll(at)`; `markSynced(id, at)` clears `owed_since` where `owed_since <= at`.
      Add `oweAll` to `SyncStorage`. Tests in `src/db/monobank-repo.test.ts` for «A balance that
      moved makes its рахунок позачерговий», «A new link is позачерговий from its boundary», «A
      completed sync clears it», «A later movement is not lost to a sync over an older answer», «An
      unchanged balance changes nothing», «Asking for a sync makes every рахунок позачерговий» (repo
      half). Verify with `npx vitest run src/db/monobank-repo.test.ts` and `npm run typecheck`.

## 2. The order and the межа свіжості (pure)

- [x] 2.1 `src/monobank/sync.ts`: `CLIENT_INFO_FRESH_MS = 60_000`; `OrderableLink.owedSinceMs?`;
      `TURN_OVERDUE_MS`, `priorityOf`/`hasPriority`, `syncOrder(links, nowMs?)` by group (design D2);
      new `shownLinks(links, rows)` (design D4). Tests in `src/monobank/sync.test.ts` for «A stored
      answer from seconds ago sends the allowance to the statement», «A stored answer older than a
      minute is refetched», «A позачерговий рахунок goes before one that has waited longer», «A
      рахунок the busy ones keep passing over is reached within three hours», «A позачерговий
      рахунок that keeps failing does not hold the queue», «Accounts that have waited equally are
      ordered reproducibly», and `shownLinks` for a named/unnamed/none-named answer. Verify with
      `npx vitest run src/monobank/sync.test.ts`.
- [x] 2.2 `src/monobank/coordinator.ts`: an asked run calls `storage.oweAll(now)` after the token
      read; the order is computed from `listLinks()` re-read after the client-info step, with
      `nowMs`; the «not shown» branch is decided first in the loop and finishes with reason
      `not-shown` (widen `AccountResult.reason`). Tests in `src/monobank/coordinator.test.ts` for «A
      рахунок the balances show moved goes first in the run that saw it», «The screen's own refresh
      is not lost», «Asking for a sync makes every рахунок позачерговий», «The balances do not cost
      the statement its minute» / «A client-info request does not move the gap», «A set-aside
      рахунок takes no turn and is never перенесено». Verify with
      `npx vitest run src/monobank/coordinator.test.ts`.

## 3. Remembered outcome, due-ness and дочитування (pure)

- [x] 3.1 `src/monobank/auto.ts`: `worstOutcome` ignores `not-shown` results unless all are;
      `syncDue` takes optional `nudgedAtMs`; new `continuationDelayMs(...)` (design D5). Tests in
      `src/monobank/auto.test.ts` (renaming the test that quoted «A run that yields in the
      background is not followed up», and the coordinator tests that quoted the cadence scenarios
      this change replaces, to what they now prove) for «A vanished card does not make a working
      прогін unavailable»,
      «A token that shows nothing linked is still a failure», «A поштовх is due inside the тихий
      інтервал», «A background chance that reads the one moved рахунок asks for nothing more», «A
      failure does not start a chain», «A рахунок already given its turn does not keep the chain
      going», «Nothing is asked while the owner is watching», «A phone that gave no chance for hours
      catches up in minutes», and the delay (gap minus elapsed, at least 5 s). Verify with
      `npx vitest run src/monobank/auto.test.ts`.
- [x] 3.2 `SyncPorts` gains optional `continueLater(delayMs)` and `inForeground()`; `startSync`
      (`src/ui/monobank-sync.ts`) asks `continuationDelayMs` after a run that reached the bank, calls
      `continueLater` and journals `background-continuation`. Tests in `src/ui/monobank-sync.test.ts`
      for ««Оновити» finishes with the app closed» (the first run's half), «Nothing is asked while the
      owner is watching», and the журнал entry. Verify with `npx vitest run src/ui/monobank-sync.test.ts`.
- [x] 3.3 `src/ui/monobank-background.ts`: `runBackgroundTurn` takes optional `nudgedAtMs()` into
      `syncDue`, is due while a shown link is in group 0/1, and the announce reads
      `syncCoverage(shownLinks(...))`. Tests in `src/ui/monobank-background.test.ts` for «A purchase
      on the black card is read within about two minutes», «A поштовх is due inside the тихий
      інтервал», «A failure in the middle of a chain does not end it», «A vanished card does not
      keep Головний stale» (no сповіщення), and «A chance inside the quiet interval sends nothing»
      over a read, unowed рахунок. Verify with `npx vitest run src/ui/monobank-background.test.ts`.

## 4. Screens (pure first)

- [x] 4.1 `src/ui/monobank-screen.ts`: coverage over shown links, a `notShown` row line «monobank
      більше не показує цей рахунок», `REFRESH_LIST_LABEL = 'Оновити список рахунків'` (and the
      not-configured sentence), and `backgroundNote(restriction)` → words and offered action for
      allowed / optimised / restricted / unknown, replacing the single background sentence. Tests in
      `src/ui/monobank-screen.test.ts` for «A closed card is named, not blamed», «A linked bank is
      told about the background», «An optimised phone is offered the exemption», «A restriction set
      by hand points to the settings», «Nothing linked, nothing said about the background», «The two
      actions read differently». Verify with `npx vitest run src/ui/monobank-screen.test.ts`.
- [x] 4.2 Головний's freshness reads `shownLinks` (`src/app/(tabs)/index.tsx`, and whichever pure
      module owns the reading). Test in that module's `*.test.ts` for «A closed card does not age the
      whole bank» and «A token that shows nothing linked still reads stale». Verify with the targeted
      vitest run.

## 5. Device ports and native module (Android)

- [x] 5.1 Port `src/platform/background-sync.ts` (types + an in-memory fake) and
      `background-sync-device.ts` over `requireOptionalNativeModule('BackgroundSync')`, every call a
      no-op / `unknown` without it; `src/platform/background-sync.test.ts` proves the fake. A pure
      `backgroundTurnsWanted(links)` answers both «chances wanted» and «поштовхи wanted» (test:
      «Chances are wanted exactly while a рахунок is linked»). Wire
      `continueLater`/`inForeground` into `syncPorts()` (`src/hooks/monobank-ports.ts`), `nudgedAtMs`
      into `src/platform/monobank-sync-task.ts`, and `setNudgesWanted` into `syncMonobankSyncTask`.
      Verify with `npm run typecheck` and the targeted vitest run.
- [x] 5.2 Kotlin in `modules/notification-capture`: `NudgeRule` — pure `route(packageName, flags,
      wanted, watched)` → `NUDGE`/`IGNORE`/`CAPTURE`/`DROP` and `shouldEnqueue(states)` for the
      pending check — with a JVM unit test for «Only the moment is noted» (monobank → `NUDGE`, never
      `CAPTURE`, even when a stored watched set names it), «An ongoing monobank notification is
      ignored», «Nothing is noted when no рахунок is linked», «A burst of notifications costs one
      дочитування» / «A second request while one is pending changes nothing» (`shouldEnqueue` false
      while one is ENQUEUED or BLOCKED); `CaptureListenerService` reads `extras` only on `CAPTURE`;
      `SyncContinuation` (schedule through `shouldEnqueue`, nudge flag and moment in
      SharedPreferences); `SyncContinuationWork` (runs the registered `BackgroundTaskConsumer`s,
      bounded, never reschedules); `BackgroundSyncModule` (`continueLater`, `nudgedAtMs`,
      `setNudgesWanted`, `restriction`, `openRestrictionFix`) listed in `expo-module.config.json`;
      `CaptureListenerService` routes the monobank package before the watched check and reads no
      extras of it; Gradle deps per design D5. Verify with the module's unit test and a clean
      `scripts/android.sh up` build.
- [x] 5.3 `app.json`: `android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`. Monobank screen
      (`src/app/manage/monobank.tsx`): the background note from 4.1, re-read on focus and on return
      to the foreground, its action calling `openRestrictionFix`; the list refresh reads
      `REFRESH_LIST_LABEL`; a set-aside row shows its line. Verify with `npm run typecheck` and the
      smoke run in 7.1.

## 6. Words and rules

- [x] 6.1 `docs/glossary.md`: add позачерговий рахунок (owed), прострочений рахунок (overdue),
      дочитування (continuation), поштовх (nudge), відкладений рахунок (set aside) with their English
      code names; update прогін («Оновити» on Головний is asked-for), хід, межа свіжості (a minute),
      тихий інтервал, фоновий прогін, відстежуваний застосунок (the monobank exception).
      `docs/product-vision.md` §12 and `.claude/rules/android.md` per design D8.
      `docs/app-overview.md`: the background note and the renamed action. Verify by reading the diff
      against the spec terms.

## 7. Device check and hand-off

- [x] 7.1 Smoke on the emulator (`smoke-runner`): the renamed action; the background note reads
      «optimised», «Дозволити роботу у фоні» opens the system dialog, after allowing it reads
      «allowed»; `adb shell dumpsys deviceidle whitelist` confirms the exemption; an `adb shell cmd
      notification post` from a non-monobank package leaves no поштовх. Record what could not be
      exercised there (a real monobank notification, a real token).
      Smoke 2026-09-30 (emulator-5554, API 37): PASS — label, optimised → system dialog → allowed,
      re-read on return, restricted → app settings, no crash without a token, a shell notification
      noted no поштовх. Not exercisable there: a monobank notification (shell cannot post as
      `com.ftband.mono`), a set-aside card and every bank-facing path (no token on the emulator).
- [ ] 7.2 **Do not archive this change before `monobank-auto-sync`, `monobank-sync-fairness`,
      `monobank-background-sync` and `monobank-sync-cadence` are archived** — it MODIFIES six of
      their requirements.
- [x] 7.3 Run `npm run verify` and paste the final lines
      ```
            Tests  4135 passed (4135)
      ✔ verify passed (f05fc761f87e0489da74d2f4be094ee481913884)
      ```
- [x] 7.4 Run the diff-reviewer subagent; fix CRITICAL findings until PASS (second pass: PASS, 0 critical)
