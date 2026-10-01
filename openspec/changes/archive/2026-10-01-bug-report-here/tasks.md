# bug-report-here — tasks

## 1. The capture, behind a port

- [x] 1.1 Create `src/platform/screen-capture.ts` — `ScreenCapturePort` with one
      `capture(): Promise<CaptureOutcome>` where the outcome is
      `{ kind: 'captured'; uri; mime; width; height } | { kind: 'unavailable' } | { kind: 'failed'; reason }`,
      plus `discard(uri): Promise<void>` and `discardAll(): Promise<void>`, and an
      `inMemoryScreenCapture()` double beside it whose `captured()` reports every file it has
      handed out and not yet discarded (design D2, D5); verify with
      `src/platform/screen-capture.test.ts` that the double reports a captured file, that
      `discard` removes exactly one and `discardAll` empties it, and that a configured failure is
      a value and never a throw. Nothing outside `src/platform/` imports the adapter.
- [x] 1.2 Create `modules/screen-capture/` — a local Expo module (Kotlin, Android) with one
      `AsyncFunction("capture")` that reads the current activity's window with `PixelCopy`,
      downscales so the longer edge is at most 1280 px, writes a PNG into
      `cacheDir/bug-report-capture/`, and returns its uri and size; plus `discard`/`discardAll`
      over that directory (design D2). No permission, no config plugin, no `android/` hand edit.
      Verify: `npx expo-doctor` is clean and `npm run verify` stays green and Node-only — nothing
      under `src/` imports the module yet.
      **Done.** `scripts/android.sh build` → `BUILD SUCCESSFUL` (this is the check that matters —
      `verify` cannot compile Kotlin, and the first draft used a suspending `PixelCopy` call inside
      an `AsyncFunction`, which is not a coroutine scope; it is written against a `Promise` now).
      `npx expo-doctor`: 20/21 checks pass. The one failure is «packages match versions
      required by installed Expo SDK» — patch drift across 14 Expo packages that predates this
      change and has nothing to do with the module; every module- and config-related check passes.
      `npm run verify` green (128 files, 2165 tests).
- [x] 1.3 Create `src/platform/screen-capture-device.ts` — the adapter over that module, answering
      `{ kind: 'unavailable' }` on any platform where it is absent so an iOS build stays possible
      (design D2, vision §14.15); verify by `npm run typecheck` and by grepping that no test file
      and no file under `src/domain`, `src/reporting` or `src/ui` imports it.

## 2. The репорт's new facts

- [x] 2.1 Add to `src/reporting/report.ts`: `ReportOrigin = 'here' | 'dialog' | 'crash' |
      'section'` and `origin`, nullable on `BugReport`; `captureFailure: string | null`, the
      Ukrainian reason a скріншот could not be taken, which the репорт **stores** rather than
      merely shows once, because the saved репорт is rendered again after a restart; and
      `routeTrail(journal, limit = 20)` folding the stored журнал's `screen` entries into the last
      20 routes (design D7). Verify with `src/reporting/report.test.ts` covering the `bug-report`
      scenarios "The route trail is routes and nothing else" and "A репорт filed from the screen
      writes its own «Що я робив»" — the trail holds routes only, in order, and is empty on a
      журнал with no screen entry.
- [x] 2.2 Add the migration: `origin` (nullable TEXT) and `capture_failure` (nullable TEXT) on
      `bug_reports`, and a one-row `bug_report_capture` table with the two switches, in
      `src/db/schema.ts`, generated with `npm run db:generate` (design D9, D10); committed
      migrations untouched. Verify with `src/db/migrations.test.ts` covering the `persistence`
      scenarios "Pre-migration rows survive unchanged" and "A fresh database from migrations alone
      holds both".
- [x] 2.3 Teach `src/db/reporting-repo.ts` to write and read `origin`, `captureFailure` and the two
      switches (`captureSettings()` / `setCaptureSettings()`), defaulting to gesture on and handle
      off; verify with `src/db/reporting-repo.test.ts` covering the `persistence` scenarios "The
      origin comes back", "Each origin round-trips", "The reason a скріншот could not be taken
      comes back", "A репорт that has its скріншот holds no such reason", "A репорт stored before
      the origin existed loads without one", "The switches come back" and "A fresh database has the
      defaults".
- [x] 2.4 Sort all three new things out of the бекап in `src/backup/format.ts` — `bug_reports`
      is already named among the exclusions, so in practice only `bug_report_capture` is added to
      the list and the comment gains the two new columns. Move `BACKUP_SCHEMA_VERSION` to one more
      than it is — the absolute number is whatever
      `drizzle/meta/_journal.json` holds once 2.2's migration exists, and `format.test.ts:33`
      already asserts exactly that — with the one-line reason (design D9); verify with
      `src/backup/format.test.ts` and `src/db/backup-repo.test.ts` covering the `persistence`
      scenarios "A бекап carries none of them" and "A restore leaves them in place".

## 3. The rendering, restructured

- [x] 3.1 Restructure `renderReport` in `src/reporting/report.ts` into the ten sections of the
      `bug-report` delta, in that order, with English headings glossed in Ukrainian after a `·`
      (design D8), including «Relevant failures/errors» folding the prompting entry whole plus
      every `failure`/`crash` entry of the журнал, «Reproduction context» carrying the route trail
      and the counts, and every section present even when empty. **Its signature becomes
      `renderReport(report, images: readonly ReportImage[] = [])`** so one renderer produces both
      texts in one order (design D8) — the screen and the clipboard pass nothing. Verify with
      `src/reporting/report.test.ts` covering the `bug-report` scenarios "The sections are the ones
      the reader looks for", "An empty section says it is empty" and "Rendering is deterministic".
- [x] 3.2 Make `renderReportFile` call `renderReport(report, images)` rather than appending a
      second section after it — appending would put a second «Screenshots» after «Reproduction
      context» and leave section 9 empty. Section 9 keeps the embedded base64, gains the two-line
      extraction hint, and names a скріншот that could not be captured with the reason the репорт
      stored (design D8); verify with `src/reporting/report.test.ts` covering the `bug-report`
      scenarios "The rendered text is the репорт" and "A скріншот that could not be taken is
      named", that `renderReport` called with no images still carries no image data, and that both
      texts hold «Screenshots» exactly once and in position 9 of 10.
- [x] 3.3 Extend `src/reporting/privacy.test.ts` with the `bug-report-here` scenario "The diagnostic
      text carries no money": build a репорт filed by the gesture on a phone that has recorded
      транзакції, renamed a рахунок and had one rename refused, render it whole, and assert no
      сума, no назва, no опис and no bank text appear outside that one refusal entry.

## 4. What the sheet decides

- [x] 4.1 Create `src/ui/bug-report-here.ts` — the gesture's parameters as one exported value
      (`GESTURE = { pointers: 2, minDurationMs: 1200, maxDistanceDp: 24 }`), every word the sheet
      says (title, «Що не так?», «Чого я очікував?», «Зберегти», «Зберегти й передати»,
      «Скасувати», the refusal for an empty «Що не так?», the sentence for a failed capture and
      the two the sheet says when a hand-over is unavailable or failed), and `didLineFor(route)`
      writing the app's own «Що я робив» (design D6); verify with
      `src/ui/bug-report-here.test.ts` covering the `bug-report-here` scenarios "What the owner was
      doing is written by the app" and "The owner is told before they save".
- [x] 4.2 Add `submitHere({ id, fields, capture, context, save })` to the same file — fills `did`
      from the route, refuses an empty «Що не так?», sets `origin: 'here'`, carries the capture's
      reason into `captureFailure` when there is one, and returns the репорт plus what must happen
      to the captured file (design D5, D6); verify with `src/ui/bug-report-here.test.ts` covering
      the `bug-report-here` scenarios "One line is enough", "The empty question is refused",
      "A refused save keeps the скріншот for the next attempt" and "Ten cancelled reports leave ten
      nothings".
- [x] 4.3 Add `activate({ capture, hideHandle, openSheet })` to the same file — the ordering of
      design D3 as a pure sequence over injected effects: hide the handle, wait, capture, open the
      sheet with the outcome, and do nothing at all while one is already in flight; verify with
      `src/ui/bug-report-here.test.ts` covering the `bug-report-here` scenarios "The скріншот is
      the screen, not the sheet", "The sheet waits for the capture", "No capture, still a репорт"
      and "A second activation while the first is still working starts nothing".
- [x] 4.4 Add the unsaved репорт's cleanup — `keepCapture(reportId, …)` on save and
      `discardCapture(uri)` when the sheet closes without a stored репорт — to the same file, over
      the `screen-capture` and `bug-report-files` doubles. **A refused save is not an exit**: it
      keeps the sheet, what was typed and the capture, so the next attempt carries the same
      picture. Verify with `src/ui/bug-report-here.test.ts` covering the `bug-report-here`
      scenarios "Cancelling stores nothing and keeps nothing", "The back gesture is the same as
      cancelling", "A refused save keeps the скріншот for the next attempt" and the `bug-report`
      scenarios "A captured скріншот is kept like a picked one" and "A скріншот captured for a
      репорт that was never stored is removed".
- [x] 4.5 Add the скріншот warning to `src/ui/bug-report-screen.ts` — the confirmation's words
      beside `REMOVE_CONFIRMATION`, and `handOver` gated on it whenever the репорт holds at least
      one скріншот (design D11); verify with `src/ui/bug-report-screen.test.ts` covering the
      `bug-report` scenarios "The скріншот is seen before it can leave", "Backing out of the
      warning hands over nothing", "A репорт with no скріншот is not warned about" and "Handing
      over gives the system one file", and the `bug-report-screen` scenario "The скріншот warning
      stands between the репорт and the chooser".
- [x] 4.6 Record `origin` on the three existing paths by threading it through `ReportContext` and
      `submitForm` — `attachContext` has exactly one call site, inside `submitForm`, so the origin
      travels with the rest of the attached context rather than being set at a second door. The
      three are decided in `src/app/manage/bug-reports/new.tsx` (`prompt` present = `'dialog'`,
      absent = `'section'`) and `src/components/crash-fallback.tsx` (`'crash'`), which calls
      `submitForm` itself. Verify with `src/ui/bug-report-screen.test.ts` covering the `bug-report`
      scenarios "A репорт from a failure dialog carries that failure", "A репорт from a crash
      carries the crash" and "A репорт filed on its own carries the context anyway"; re-run
      `src/ui/screens.test.ts`, which asserts on the source text of `new.tsx`.
- [x] 4.7 Add the sheet's own hand-over outcome to `src/ui/bug-report-here.ts` — «Зберегти й
      передати» stores the репорт first, so an `unavailable` or a `failed` chooser must leave it
      stored and say which happened in Ukrainian; verify with `src/ui/bug-report-here.test.ts`
      covering the `bug-report-here` scenario "A hand-over that cannot happen still leaves the
      репорт stored".

## 5. The shell, the gesture and the sheet

- [x] 5.1 Wrap the app in `GestureHandlerRootView` in `src/app/_layout.tsx` and empty
      `cacheDir/bug-report-capture/` once at launch beside the other launch work (design D1, D5);
      verify `npm run verify` stays green with a test over the double for the `bug-report-here`
      scenario "A capture that outlived the app is gone at the next launch", then confirm on the
      emulator (task 8.1) that tapping, scrolling and the tab bar behave exactly as before.
- [x] 5.2 Create `src/components/bug-report-here.tsx` — the `GestureDetector` carrying
      `Gesture.LongPress().numberOfPointers(GESTURE.pointers).minDuration(GESTURE.minDurationMs)
      .maxDistance(GESTURE.maxDistanceDp).runOnJS(true)`, the opt-in handle with its
      `accessibilityRole` and Ukrainian label, and the overlay sheet with its two fields, the
      скріншот thumbnail and the three actions, answering the back gesture with `BackHandler`
      (design D1, D1a, D4); it decides nothing — every word, refusal and ordering comes from
      `src/ui/bug-report-here.ts`. Verify with `npm run lint` and `npm run typecheck`, and on the
      emulator in §8.
- [x] 5.3 Mount it in `src/app/_layout.tsx` above the `Stack`, reading the two switches from
      storage after the migrations and **re-reading them when the owner leaves the section**, so a
      switch lands without a restart (design D10); verify `npm run verify` stays green and the
      `bug-report-screen` scenario "A switch takes effect without a restart" and the
      `bug-report-here` scenario "The handle is not there until it is turned on" hold on the
      emulator (tasks 8.2, 8.6).
- [x] 5.4 Add the two switches and the section's sentence about the скріншот to
      `src/app/manage/bug-reports/index.tsx`, and the скріншот warning to
      `src/app/manage/bug-reports/[id].tsx`'s «Передати» (design D10, D11); verify with
      `src/ui/bug-report-screen.test.ts` covering the `bug-report-screen` scenarios "The switches
      are in the section", "A switch takes effect without a restart", "A switch survives a restart"
      and "Turning both off leaves the section working".

## 6. The smoke driver

- [ ] 6.1 Add to `scripts/android.sh`: `twofinger X1 Y1 X2 Y2 [ms]` — two `sendevent` tracking
      slots down, a hold of `ms` (default 1400), both up (design D12) — and the two drivers §8
      needs and the script does not have: `swipe X1 Y1 X2 Y2 [ms]` (one finger, for the scrolling
      in 8.1/8.4) and a two-finger *drag* variant for 8.5. Verify by running `twofinger` on the
      emulator against a screen with a list and confirming from `shot` that the list did not
      scroll, then against the app with the gesture on and confirming the sheet opened. If the AVD
      will not take `sendevent`, say so in this task and record the gesture-only scenarios of §8 as
      manually verified instead.

## 7. Docs

- [x] 7.1 Amend `docs/product-vision.md` §12 — the репорт's privacy contract today names only «any
      screenshots they attached», and this change makes the app attach one by itself. Say so: the
      скріншот is the one thing a репорт carries that can show the owner's money, the app never
      reads, redacts or transmits it, and the owner is shown it and told what it carries before any
      hand-over. Everything the app *writes* is unchanged. (The owner ratified this amendment
      before implementation began; without it the change would contradict the vision it claims to
      obey.)
- [x] 7.2 Update `docs/glossary.md` — **репорт про помилку** gains the скріншот the app takes by
      itself when the репорт is filed from a screen, and the record of how it was opened; and the
      four nouns this change introduces get entries with their Ukrainian terms fixed once (the
      gesture, the handle, the sheet, the origin), so hard rule 7 has something to be verbatim
      against. Verify by grepping that every term is used verbatim in the specs and in the code.
- [x] 7.3 Update `docs/app-overview.md` §4.9 — the gesture, the handle, the sheet and the new shape
      of the file, with a screenshot from §8 added under `docs/screens/`.

## 8. Emulator smoke (run after the suite is green, before archiving)

> **Run of 2026-09-03 — incomplete, emulator contended.** A `smoke-runner` pass reached the sheet
> and stopped at its turn limit because a second smoke run (`saldo-import-compact-map`) was driving
> the same AVD. What it did establish, from `docs/screens/31-bug-report-sheet.png` looked at
> directly: the sheet opens over Головний; its thumbnail shows Головний **whole and without any
> part of the sheet, the backdrop or the handle in it**; the title, both field labels with their
> hints and all three actions render in Ukrainian as specified. So `PixelCopy` returns the real
> screen on this AVD rather than a black rectangle, and the capture-before-draw ordering of D3
> holds on a device — the two technical unknowns the design named. **Not** yet established: which
> driver opened that sheet (so 8.2's `twofinger` is unproven), and every scenario below. None is
> ticked.

Driven by `scripts/android.sh` (`up`, `reset`, `shot`, `tap`, `text`, `key`, `swipe`, `twofinger`).
Every scenario is a screenshot that was looked at, not a build that compiled.

- [ ] 8.1 **The shell still behaves.** Walk all five tabs, push «Транзакції», a транзакція's form
      with the keyboard up, a рахунок's рухи and «Репорти про помилки»; scroll a long list; press
      the tab bar. Screenshot each and confirm `GestureHandlerRootView` changed nothing about
      tapping, scrolling or the keyboard.
- [ ] 8.2 **The gesture on Головний.** With the gesture on, `twofinger` in the middle of Головний;
      screenshot and confirm the sheet opened and its thumbnail shows Головний **without** the
      sheet in it. (`bug-report-here`: "The gesture works on the screen the owner is on", "The
      скріншот is the screen, not the sheet".)
- [ ] 8.3 **The gesture inside a transaction edit.** Open a транзакція, type into a field, then
      `twofinger`; confirm the sheet opened, its thumbnail shows the form with what was typed, and
      «Скасувати» returns to the form with the typing still there. (`bug-report-here`: "The gesture
      works inside a form".)
- [ ] 8.4 **The gesture in a scrolled list.** Open «Транзакції», scroll well down, then
      `twofinger`; confirm the sheet opened, the thumbnail shows the scrolled position, and closing
      it leaves the list where it was. (`bug-report-here`: "The gesture works part-way down a long
      list".)
- [ ] 8.5 **Ordinary use starts nothing.** Tap rows, long-press one finger for three seconds, drag
      two fingers across the screen, and flick-scroll a long list; screenshot after each and
      confirm no sheet ever appeared. (`bug-report-here`: "A tap is a tap", "A scroll is a scroll",
      "A one-finger hold is not the gesture", "Two fingers released too early start nothing", "Two
      fingers that travel start nothing".)
- [ ] 8.6 **The handle is the tap-driven door.** Turn the handle on in the section, confirm it is
      drawn over Головний **without a restart**, `tap` it, and confirm the sheet opens with a
      thumbnail that shows **no handle**; turn it off and confirm it is gone. (`bug-report-here`:
      "The handle does the same thing", "The handle is not there until it is turned on";
      `bug-report-screen`: "A switch takes effect without a restart".)
- [ ] 8.7 **A cancelled репорт leaves nothing.** Open the sheet through the handle, type, cancel;
      repeat three times; then check «Репорти про помилки» is unchanged and
      `adb shell run-as … ls cache/bug-report-capture` is empty. Kill the app between a capture and
      a save and confirm the next launch empties it too. (`bug-report-here`: "Cancelling stores
      nothing and keeps nothing", "Ten cancelled reports leave ten nothings", "A capture that
      outlived the app is gone at the next launch".)
- [ ] 8.8 **A saved репорт survives a restart.** Save one with one line, force-stop the app,
      relaunch, open «Репорти про помилки» and confirm the репорт is there with its route, its
      скріншот thumbnail and everything the app attached. (`bug-report-here`: "A stored репорт is
      still there after a restart".)
- [ ] 8.9 **The hand-over gives one whole artifact.** Choose «Зберегти й передати», confirm the
      скріншот warning appears with the picture, hand the file to a chooser, then open the file at
      the laptop and confirm it holds all ten sections in order, «Screenshots» exactly once, the
      route trail, the журнал, the failures and one base64 block that decodes to the screen from
      before the sheet. (`bug-report-here`: "Saving and handing over gives the system one file",
      "The скріншот is shown and named before it can leave"; `bug-report`: "The sections are the
      ones the reader looks for".)
- [ ] 8.10 **No money in the diagnostic text.** On a phone holding several рахунки with суми and
      renamed категорії, file a репорт by the gesture and read the whole rendered text on the
      screen; confirm no сума, no назва, no опис and no bank text is in it outside a refusal the
      owner was shown. (`bug-report-here`: "The diagnostic text carries no money".)
- [ ] 8.11 **The old doors still work.** Force a refusal (save a транзакція with no рахунок) and
      file from its dialog; open `cap1tal://crash` and file from the crash fallback; file from
      «Повідомити про помилку» in the section. Confirm all three still produce a репорт, each
      naming the right prompting failure and the right origin. (`bug-report`: "A репорт from a
      failure dialog carries that failure", "A репорт from a crash carries the crash", "A репорт
      filed on its own carries the context anyway".)
- [ ] 8.12 **A capture that fails.** Force the capture to fail (deny the module its window, or run
      the build with the module removed) and confirm the sheet still opens, says in Ukrainian that
      the скріншот could not be taken, and still files a репорт that says the same — including
      after a force-stop and relaunch, since the reason is stored and not merely shown.
      (`bug-report-here`: "No capture, still a репорт", "The owner is told before they save";
      `persistence`: "The reason a скріншот could not be taken comes back".)

## 9. Verification

- [x] 9.1 Run `npm run verify` and paste the final lines
      ```
       Test Files  130 passed (130)
            Tests  2342 passed (2342)
      ✔ verify passed (811eb441706844f69e660b006dc33d1edc319247)
      ```
- [x] 9.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
      First pass: **FAIL** — 3 critical. (a) task 4.7 was ticked with no test behind it;
      (b) `confirmScreenshots` was optional, so a screenshot-bearing репорт could reach the chooser
      unwarned — two of this change's own tests were exercising that bypass; (c) the title did not
      carry the «Bug report» anchor §1 names, and the test had been written to the code rather than
      the scenario. All three fixed, plus two real bugs the warnings found: the route trail numbered
      a revisited screen by its first appearance, and a failed hand-over left the sheet able to
      store a second, pictureless репорт. Second pass: **PASS** (0 critical).
- [ ] 9.3 At archive: `openspec/specs/bug-report-screen/spec.md`'s Purpose still says a репорт is
      filed «from the failure dialog, from the crash fallback, or on their own from Налаштування».
      A fourth door exists now, and a delta carries no Purpose — so it is corrected by hand when
      the specs are synced.
