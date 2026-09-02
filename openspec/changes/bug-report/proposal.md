# bug-report — proposal

## Why

The owner is about to make cap1tal the one app they track their budget in, on their own phone,
while the app is still young. Things will go wrong there that never went wrong on the emulator,
and today the app keeps no memory of them: a failure is an alert that closes, a crashed screen is
a dead app, and by the time the owner sits down at the laptop the only evidence is what they
remember. Reproducing such a bug in a Claude Code session then starts from a sentence — «щось не
записалося вчора» — and costs a round of questions before any code is read.

This change gives the app a standard way to say what happened. The owner files a **репорт про
помилку** on the phone the moment something goes wrong, in their own words, and the app attaches
the context it alone has: which build it is, which screen the owner was on, what the app had been
doing in the minutes before (its **журнал**), the failure or crash text, and any screenshot the
owner adds. The репорт stays on the phone until the owner hands it over — into a Claude Code chat,
where it is enough to reproduce the bug and fix it. It serves neither of the vision's two
questions directly; it serves the app's fitness to answer them at all, in the period where the
owner is its only tester.

## What Changes

- **New capability `bug-report`** — the репорт про помилку and the журнал. The журнал is the
  app's own bounded record of what it did recently: every screen opened, every action that
  failed with the text the owner saw, every crash — moments and names, never a сума, назва,
  опис, bank text or the monobank token. A репорт is what the owner writes (what they did, what
  happened, what they expected) plus what the app attaches by itself (the build, the device, the
  screen, the journal's tail, the failure or crash that prompted it, counts of what the phone
  holds) and the screenshots the owner adds. It is stored on the phone, rendered as one
  self-contained text the owner can read whole before anything leaves, and leaves only by the
  owner's «Передати» through the phone's own chooser, or as text on the clipboard. Neither the
  репорти nor the журнал are ever in a бекап, and a відновлення leaves them untouched.
- **New capability `bug-report-screen`** — the screens: «Репорти про помилки» under Налаштування
  (the list, «Повідомити про помилку»), the form (a few fields, in Ukrainian, nothing required
  but the first), the saved репорт (its whole text, «Додати скріншот», «Скопіювати»,
  «Передати», «Видалити»), the way every refusal dialog in the app offers «Повідомити про
  помилку» with that failure already attached, and the crash fallback that offers the same
  instead of a dead app.
- **Modified capability `app-shell`** — an uncaught error while drawing a screen no longer
  kills the app silently: what is shown names the failure in Ukrainian, records it in the
  журнал, and offers the репорт and a way back; an error in started work or an unanswered
  promise is remembered in the журнал and otherwise left to the platform (an added
  requirement).
- **Modified capability `settings-screen`** — «Налаштування» offers «Репорти про помилки»
  (the sections requirement, modified). The delta is written over the `reminders-and-alerts`
  delta's wording of the same requirement, which means the two must be **archived in that
  order**: `reminders-and-alerts` first, then this change. Archiving this one first would leave
  `reminders-and-alerts`'s delta — which names every section but «Репорти про помилки» — to
  overwrite the requirement later and silently drop the new section from the truth spec. Whoever
  archives either change checks the other first.
- **Documentation** — `docs/glossary.md` gains «Репорт про помилку» and «Журнал» (under a new
  heading «Keeping the app honest»); `docs/app-overview.md` gains the section; and
  `docs/product-vision.md` §12 gains one line. §12's «no analytics» stays exactly true — the
  журнал never leaves the phone on its own, and no server exists to receive it — but §12 is
  where the vision enumerates every way data does leave, one bullet per hand-off, and the репорт
  is a second owner-initiated hand-off carrying things the файл для аналізу never carries: the
  журнал and the owner's own screenshots. An enumeration that omits it is the kind of omission
  §12 exists to prevent.

**Scope.** One phone, one owner who is also the developer. Ukrainian on every screen. Android
first; nothing here depends on Android — the crash fallback, the journal and the file are
platform-neutral, and the picker and chooser are behind ports like every other device seam.

One thing ships that no requirement asks for: `src/app/crash.tsx`, a route that throws while
rendering under `__DEV__` and redirects to Головний in a release build, reachable only by deep
link and linked to from nowhere in the app. It is the lever the emulator smoke pulls to see the
crash fallback at all, here and in every later change — a fallback that can only be tested by
introducing a real bug is a fallback nobody tests twice. Read it as test equipment, not as dead
code (design D12).

**Non-goals.** No crash-reporting service, no analytics, no automatic sending of anything
(vision §12: there is no server and no channel out but the owner's own hand-off). No capture of a
screenshot by the app itself — the owner takes one with the phone and attaches it. No embedding
of the бекап in a репорт: when data is needed to reproduce, the owner hands over a бекап the way
they do today. No symbolication on the phone. No journal of successful money operations beyond
their kind and moment. Vision §14 is not touched: no remote push (item 14), no cloud service
(item 9).

## Capabilities

### New Capabilities

- `bug-report`: the журнал (what is recorded, its bound, what it never holds) and the репорт про
  помилку (what the owner writes, what the app attaches, the screenshots, the rendered text, its
  life on the phone, the hand-over and the clipboard, exclusion from the бекап).
- `bug-report-screen`: the «Репорти про помилки» section, the form, the saved репорт's screen
  with its actions, the offer on every failure dialog, and the crash fallback's offer.

### Modified Capabilities

- `app-shell`: an added requirement — an uncaught error in a screen shows a Ukrainian fallback
  that records the crash and offers the репорт and a way back.
- `settings-screen`: the sections requirement gains «Репорти про помилки», which opens the list.

## Impact

- **New code**: `src/reporting/` (pure: the journal's entry shapes and bound, the репорт's
  shape, the rendered text, the privacy invariant); `src/ui/journal.ts` (the effectful journal
  with its storage port, `reportFailure` for the catch sites), `src/ui/bug-report-screen.ts`
  (screen logic); `src/db/reporting-repo.ts` (three tables); `src/platform/bug-report-files.ts`
  (+ `-device.ts`: pick a screenshot, keep it, hand the file over, remove); the screens under
  `src/app/manage/bug-reports/`; a shared form component used by the screen and the crash
  fallback; `ErrorBoundary` in the root layout and the global error handler.
- **Touched code**: every use of `failureMessage` under `src/app/` (21 uses in 11 files, one
  line each) goes through `reportFailure`, the two dialogs with a text of their own (the чек
  scanner, the answer on Головний) through `failureAlert`, and the two failure states shown in
  place (бекап, monobank sync) are journaled where the screen receives them; `src/ui/alerting.ts` journals what it raises; the root layout journals
  route changes; `src/db/backup-repo.ts` names the three new tables among the untouched;
  `src/ui/settings-sections.ts` gains the section; `AnimatedSplashOverlay` plays once per
  process.
- **Schema**: one migration adding `journal` and `bug_reports` + `bug_report_screenshots`.
- **Dependencies**: none new. `expo-document-picker`, `expo-file-system`, `expo-sharing`,
  `expo-clipboard`, `expo-constants` and `expo-device` are already installed.
- **Expo config**: `app.config.js` beside `app.json`, adding `extra.build` (the short commit and
  whether the tree was dirty, read at bundle time) so a репорт names the exact build. No new
  permission, no new native module, no `app.json` change.
- **Verification**: everything decided is pure and under `npm run verify`; the picker, the
  chooser, the error boundary and the file system are behind ports with in-memory doubles. The
  screens are smoke-tested on the emulator (a screenshot pushed with `adb push` stands in for one
  the owner took).
