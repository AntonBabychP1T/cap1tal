# bug-report — tasks

No task adds a dependency, a permission or a native module; task 1.3 is the one Expo config
change (`app.config.js`), task 3.1 the one migration. Nothing here adds an emulator run or a
network call to `npm run verify`. Batches of ≤ 3 adjacent tasks are safe to hand to
`task-builder`; group 6 (the catch sites) touches eleven screens and is one batch on its own.

Two ordering dependencies, both outside this change. **Group 6 needs `fiscal-receipts` and
`home-daily-overview` in the tree**: `transaction/scan.tsx`, `transaction/new.tsx` and the
«Не підтверджено» dialog in `(tabs)/index.tsx` are theirs and are still uncommitted, so the «21
uses in 11 files» count below is the count in an integrated tree, not on a lane branched from
`main` — take that count from `grep` at the time of the task, as 6.2 already says. And
**`reminders-and-alerts` archives before this change** (proposal, «Modified capability
settings-screen»), because its delta modifies the same requirement without naming «Репорти про
помилки».

## 1. Vocabulary, docs and the build's name

- [x] 1.1 Add to `docs/glossary.md` a section «Keeping the app honest» with «Журнал» (the app's
      own bounded record of what it did: screens opened by route, failures with the text the
      owner saw, сповіщення про збій raised, crashes with message and stack — never a сума,
      назва, опис, bank text or the token) and «Репорт про помилку» (what the owner wrote after
      something went wrong plus what the app attaches — build, device, screen, the журнал, the
      prompting failure, counts — and the screenshots they add; stored on the phone, leaves it
      only by «Передати» or the clipboard, never in a бекап). Add the distinction row
      «Репорт про помилку | Сповіщення про збій | the репорт is what the owner writes for the
      developer; the сповіщення is what the app posts to the owner». Widen «Передати» so it
      covers any file the app hands to the chooser — a файл для аналізу or a репорт — with the
      same claim afterwards. Verify by reading the two delta specs against the glossary: no
      undefined term, no synonym.
- [x] 1.2 Add to `docs/app-overview.md` §4 a subsection «Репорти про помилки» (what the section
      offers, where a репорт comes from, what leaves and how) and a row in §6. Verify by reading
      it against `bug-report-screen/spec.md`.
- [x] 1.3 Add `app.config.js` beside `app.json` that returns the merged config with
      `extra.build = { commit, dirty, builtAt }` read from git at bundle time, `unknown` without
      git (design D10). Verify with `npx expo config --type public | grep -A3 build` showing the
      current short commit, `npx expo-doctor` clean (`.claude/rules/android.md`), and `npm run
      verify` unchanged. Note in the file that `scripts/android.sh up` watches `app.json` for its
      rebuild trigger, not this file — harmless, since only `extra` changes here.

## 2. The pure module (`src/reporting/`)

- [x] 2.1 Add `src/reporting/journal.ts`: `JournalEntry` (design D1), `appendBounded(entries,
      entry, limit = 500)`, `entryLine(entry)` (one line per entry for the rendering). Tests in
      `src/reporting/journal.test.ts`: "Scenario: A screen opening is an entry", "Scenario: The
      журнал is bounded" (500 + 1 → 500, oldest gone, newest last), and a fast-check property
      that order is preserved for any sequence.
- [x] 2.2 Add `src/reporting/report.ts`: `BugReport` (design D5's shape as plain values —
      `did`, `happened`, `expected`, `route`, `createdAt`, `build`, `device`,
      `migrationsApplied`, `counts`, `journal`, `prompting`, `screenshots`, `handedOverAt`),
      `renderReport(report): string` with the Ukrainian headings in design D7's order, and
      `renderReportFile(report, images): string` appending «## Скріншоти» with one base64 block
      each. Tests in `src/reporting/report.test.ts`: "Scenario: The rendered text is the репорт"
      (every value present, ten entries in order, image data only in the file), "Scenario:
      Rendering is deterministic", "Scenario: Copying gives the text without image data" (the
      plain rendering names two screenshots and contains no `data:image`).
- [x] 2.3 Add `src/reporting/privacy.test.ts`: a fixture whose every назва, опис and
      notification text carries `ZZ-SENTINEL-`; journal entries for screens, an ordinary
      refusal, a duplicate-назва refusal quoting the sentinel назва, a collection failure passed
      as its kind, an alert and a crash, with a monobank token `ZZ-TOKEN-` stored beside it; a
      rendered репорт; assert the sentinel occurs exactly once, on the duplicate-назва entry's
      line, and nowhere else, and the token nowhere (design D6). Names the
      scenarios "Scenario: The journal carries no money" and "Scenario: A collection failure
      carries no bank text".

## 3. Storage

- [x] 3.1 Add `journal`, `bug_reports` and `bug_report_screenshots` to `src/db/schema.ts` per
      design D5 (`prompting_json` and no foreign key to the journal, `cascade` from the
      screenshots, `timestamp_ms` instants, text ids),
      run `npm run db:generate` for the next migration — in the integration lane only, after
      whatever in-flight change lands first, since `0011_*` is uncommitted from another change
      and two lanes generating the same number collide — and extend `src/db/migrations.test.ts` to assert
      the three tables' shape after all migrations. Verify with `npx vitest run
      src/db/migrations.test.ts`.
- [x] 3.2 Add `src/db/reporting-repo.ts`: `JournalStorage` (`append` that prunes to 500 in the
      same batch — in `at`-then-`rowid` order, design D5, so a tie in the millisecond still drops
      the genuinely oldest — `tail`, `byId` — the shape design D2 names) and the репорт side (`create`, `get`, `list` newest first,
      `remove`, `addScreenshot`, `removeScreenshot`, `markHandedOver`), exported from
      `src/db/repos.ts` as `reporting`. Tests in `src/db/reporting-repo.test.ts` against the
      real migrations: "Scenario: The журнал is bounded" at the SQL level (including two entries
      sharing one millisecond: the earlier-inserted one goes), "Scenario: The list is
      newest first", "Scenario: Removing the репорт removes its screenshots" (cascade),
      "Scenario: A репорт from a crash carries the crash" (create the репорт, append 600 more
      entries so the crash entry is pruned from the live journal, read the репорт back: the
      crash is still its prompting failure and its `journal_json` still ends with it).
- [x] 3.3 Name the three tables among the untouched in `src/db/backup-repo.ts` and prove
      "Scenario: A restore leaves them in place" and "Scenario: A бекап carries no репорт" in
      `src/db/backup-repo.test.ts` and `src/backup/backup.test.ts` (a full journal and two
      репорти before; a restore; the same after; the бекап's text contains no journal line and
      no `did`).

## 4. The effectful journal and the ports

- [x] 4.1 Add `src/ui/journal.ts`: the singleton with `bind(storage)`, the pre-bind buffer,
      `record(kind, name, detail?)`, `tail()`, and `reportFailure(where, error): string` (design
      D2). Tests in `src/ui/journal.test.ts` with an in-memory `JournalStorage`: "Scenario: A
      refused save is an entry with the refusal text", entries recorded before `bind` land
      after it in order, and a second `bind` is a no-op.
- [x] 4.2 Add `src/platform/bug-report-files.ts` — the port and `inMemoryBugReportFiles()` with
      `handed()` and `kept()` (design D8) — and `bug-report-files-device.ts` over
      `expo-document-picker`, `expo-file-system` and `expo-sharing`, never imported from a test.
      Tests in `src/platform/bug-report-files.test.ts`: "Scenario: Backing out of the picker
      attaches nothing" (`cancelled` keeps nothing), "Scenario: Handing over gives the system one
      file" (`handed()` has exactly one entry), "Scenario: A phone without a chooser is told so"
      (`unavailable` hands nothing), and "Scenario: Removing the репорт removes its
      screenshots" for the file half — `removeAll` leaves `kept()` empty (the SQL half is task
      3.2's).
- [x] 4.3 Add `src/ui/failure-alert.ts`: `failureAlert({ title, where, error, report })` returning
      the `Alert.alert` arguments — the message from `reportFailure`, two buttons «Закрити» and
      «Повідомити про помилку», the second calling `report(entryId)` (design D11). Tests in
      `src/ui/failure-alert.test.ts`: "Scenario: A refused save offers the репорт" (the second
      button carries the journal entry's id), "Scenario: Closing the dialog files nothing" (the
      first button calls nothing and the entry is in the journal).

## 5. The screen model

- [x] 5.1 Add `src/ui/bug-report-screen.ts`: `formState` / `submitForm` with `attachContext`
      (build, device, counts, journal tail, prompting entry, now) with `routeOf(journal,
      prompting?)` deriving the screen from the journal (design D9), the Ukrainian refusal
      for an empty «Що я робив» and the one for a write that failed (design D9a — the storage
      write is a thunk, the failure is a value, and it is journaled through `reportFailure`);
      `listRows`; every label. Tests in
      `src/ui/bug-report-screen.test.ts`: "Scenario: A репорт without the required line is
      refused", "Scenario: A репорт from a failure dialog carries that failure" (the route is
      the screen entry before the prompting one, and the refusal is the last failure entry even
      though the form's own screen entry follows it; and a crash entry preceded by its own
      screen entry with no other between — the first-draw crash — names that route), "Scenario: A
      репорт filed on its own carries the context anyway", "Scenario: A save that fails says so
      and keeps the form" (nothing stored, the Ukrainian refusal names the reason, the failure is
      in the журнал), "Scenario: The list is newest first",
      "Scenario: The empty list says so", "Scenario: Filing on one's own" (no prompting failure,
      the section's route).
- [x] 5.2 Extend the model with the saved репорт: `savedReportState`, `handOver(report, files,
      storage)` (renders the file with the images read through the port, hands it over, marks
      the moment on `handed-over`, refuses a second start while `handing-over`), `copyText`,
      `addScreenshot`, `removeReport`. Tests: "Scenario: Handing over says it was handed over",
      "Scenario: A second hand-over waits for the first" (`handed()` stays at one), "Scenario:
      Nothing leaves without the owner" (`handed()` empty after save + screenshot), "Scenario: A
      picked image is kept with the репорт", "Scenario: Removing asks first" (remove is a
      two-step value, and confirming it calls `files.removeAll` as well as the storage's
      `remove` — the file half of "Scenario: Removing the репорт removes its screenshots").

## 6. Wiring the app

- [x] 6.1 Root layout: `bind` the journal to `reporting` after the migrations; journal every
      `usePathname` change (design D3); install the `ErrorUtils` global handler chained to the
      previous one and the Hermes rejection tracker, both journaling and nothing more (design
      D4 (b) — the rejection tracker installed under `__DEV__` only, its
      `onUnhandled`/`onHandled` journaling and then delegating to
      `react-native/Libraries/promiseRejectionTrackingOptions`'s own, never re-emitting a warn of
      their own) — declaring in `types/expo.d.ts` only what `react-native/types` does not; give
      `AnimatedSplashOverlay` its once-per-process flag (design D4a); add the three routes and
      the `crash` route to the Stack. Verify by `npm run typecheck` and by adding `src/ui/screens.test.ts`
      (reading the `.tsx` files by path, as `testing.md` prescribes) asserting that `_layout.tsx`
      contains `usePathname`, `setGlobalHandler` and
      `enablePromiseRejectionTracker`, and `animated-icon.tsx` its flag — proving "Scenario: An
      error in started work is remembered" and "Scenario: Returning from the fallback shows no
      launch view" as far as a Node test can.
- [x] 6.2 Replace every `failureMessage(` a screen can show — 21 uses in 11 files under `src/app/`
      **and the one in `src/components/manage-list.tsx`**, which draws «Категорії» and «Джерела»
      and so refuses every rename on both; `grep -rn 'failureMessage(' src/app src/components` at
      the time of the task, `manage/limits.tsx` among them — with `failureAlert` and the router's `report` where it feeds a dialog, and with
      `reportFailure` where it feeds state (`manage/saldo-import.tsx`'s `commitFailed`); route
      the two dialogs with a text of their own (`transaction/scan.tsx`'s «Не прикріплено»,
      `(tabs)/index.tsx`'s «Не підтверджено» with `answer.message`) through `failureAlert` with
      that text as the error; journal the two in-place failure states where the screen receives
      them (`manage/backup.tsx`'s `failed`, `manage/monobank.tsx`'s sync `failed`) with
      `journal.failure(where, text)`; journal at the top of `raise` and in `clear` in
      `src/ui/alerting.ts`. Rewrite `src/ui/alerting.test.ts`'s «changed none of the words those
      screens already said about a failure» assertion (lines ~310–317) to the new literals —
      `failureAlert({ title: 'Не записано', …` and the other four titles unchanged,
      `commitFailed(current, reportFailure('saldo-import', error))` — keeping its intent, never
      weakening it. Verify with a test in `src/ui/screens.test.ts` that no file under `src/app/`
      **or `src/components/`** contains `failureMessage(` — the sweep walks both trees, since a
      dialog the owner sees is not a directory — that both in-place files contain `journal.failure(`, and that
      `scan.tsx` and `index.tsx` contain `failureAlert(`; and `alerting.test.ts` proves
      "Scenario: A сповіщення про збій is an entry even when nothing is posted" (a raise while
      that kind is already outstanding writes an entry and posts nothing) and "Scenario: Taking a
      сповіщення back is an entry".
- [x] 6.3 Add `src/components/bug-report-form.tsx` (the three fields, the prompting failure
      above them, «Зберегти»; no navigation hook of its own, since the crash fallback renders it
      without a router — design D4) and the screens `src/app/manage/bug-reports/index.tsx`,
      `new.tsx` (reads `?prompt`, `useCloseOnBack` discarding, `router.replace` to the saved
      репорт after save), `[id].tsx` (the rendered text, thumbnails from the kept
      files, the four actions, the confirm on «Видалити»); add the section to
      `src/ui/settings-sections.ts` and prove "Scenario: The tab opens on its sections" and
      "Scenario: The bug-reports section opens the list" in its test. Verify by `npm run
      typecheck`, by `screens.test.ts` assertions named "Scenario: Saving opens the saved
      репорт" (`new.tsx` calls `router.replace`), "Scenario: The required line is enforced in
      Ukrainian" (the form shows the model's refusal), "Scenario: A save that fails says so and
      keeps the form" (the form renders the model's failed-write refusal and does not navigate),
      "Scenario: The back gesture discards the form" (`new.tsx` uses `useCloseOnBack`, the form
      does not) and "Scenario: The whole text is
      on the screen" (`[id].tsx` renders `renderReport`) — as far as a Node test can — and the
      emulator smoke in 7.1.
- [x] 6.4 Add `export function ErrorBoundary` to `src/app/_layout.tsx` rendering
      `src/components/crash-fallback.tsx`: journals the crash once, follows the system scheme
      from `Colors`, offers «Повідомити про помилку» (the shared form inline, then the return)
      and «Повернутися» (the return), and answers the back gesture through `BackHandler`, not
      `useCloseOnBack` (design D4). **The return is `router.replace('/')` and then `retry()` on
      the next tick, never `retry()` alone** — `retry` only clears the boundary's error state and
      the navigation still points at the route that threw, so a bare `retry` redraws the crash
      (design D4 (a)); add `src/app/crash.tsx`, the `__DEV__`-only route
      that throws while rendering and redirects to Головний in release, reached by deep link
      only (design D12). Verify by `npm run typecheck`, `screens.test.ts` assertions named "Scenario: A
      crashed screen is replaced by the fallback" (the export exists and renders
      `CrashFallback`, which records the pathname and then the crash), "Scenario: The fallback
      follows the system appearance" (it reads the scheme and `Colors`), "Scenario: Reporting
      from the fallback saves and returns" and "Scenario: Returning without reporting" (both
      buttons reach `retry`; only one saves), and that `crash.tsx` guards on `__DEV__`, and that `crash-fallback.tsx` calls `router.replace`
      before `retry` on both buttons — as far as a Node test can — and the smoke in 7.1.

## 7. Smoke and closing

- [x] 7.1 Run the `smoke-runner` subagent over: the section in Налаштування; a refused save
      (record with no рахунок) → the dialog's «Повідомити про помилку» → save → the saved репорт
      shows the refusal and the journal; «Додати скріншот» with a PNG pushed by `adb push` to
      `/sdcard/Pictures/`; «Скопіювати»; «Передати» opens the chooser; «Видалити» asks and
      removes; the crash fallback in dark appearance via `adb shell am start -d cap1tal://crash`
      — a non-initial route on purpose, so «lands on Головний» is an observation and not a
      tautology — «Повідомити про помилку» from it lands on Головний with the репорт saved and
      no launch view in between, and the fallback does not come back; «Повернутися» the same
      without a репорт. Fix what it finds.
- [x] 7.2 Run `npm run verify` and paste the final lines
- [x] 7.3 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
