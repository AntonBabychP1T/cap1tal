# bug-report-here — proposal

## Why

The репорт про помилку exists and works, but it is only reachable from a section of Налаштування —
and that is the wrong place for the moment it is meant to serve. Manual testing looks like this:
the owner is standing on a screen, sees a wrong number, a broken layout or an action that did not
do what it said, and needs to fix *that* — the screen, the moment, the pixels — before it is gone.
Today they must leave the screen, walk to Налаштування, open the section, and then describe from
memory a screen they can no longer see; the screenshot is a separate errand with the phone's own
buttons and the phone's own gallery, and it has to be found again and attached by hand afterwards.
The result is that the honest answer to «що саме ти бачив?» is usually «вже не пам'ятаю».

This change does not add a second diagnostic system. It adds the missing door to the one that
exists: a gesture the owner can reach from any screen without leaving it, which captures the screen
before anything of the app's own is drawn over it, attaches it to an unsaved репорт that
already carries the route, the build, the device, the журнал and the counts, and asks for one line.
Everything after that — the storage, the privacy contract, the rendering, the hand-over — is the
existing `bug-report` capability, unchanged in substance.

This serves neither of the vision's two money questions directly; it serves the owner's ability to
report that the app answered one of them wrongly. Vision §12 grants the репорт its shape and its
privacy contract, and this change **widens that contract in exactly one place, deliberately**: §12
names «any screenshots they attached», and a скріншот the app takes by itself when the репорт is
filed from a screen is not one of those. Everything the app *writes* is unchanged — no сума, no
назва, no опис, no bank text, no token — but the picture is a new kind of thing in a репорт, and it
shows whatever was on the screen, which on this app is usually money. So §12 is amended by this
change rather than quietly stretched (task 7.1), the owner is shown the скріншот and told what it
carries before anything is handed over, and nothing still leaves the phone without the owner's hand.

## What Changes

- **New capability `bug-report-here`** — filing a репорт from where the problem is:
  - **A two-finger long press, held about 1.2 s, anywhere in the app.** Two fingers and a hold,
    because one finger is every button and every scroll in the app, and because it is not a gesture
    Android or its OEMs have taken. It does not fire from a tap, a scroll, a swipe or a one-finger
    hold, and it can be turned off.
  - **A visible handle as the second way in**, off by default, which draws a small «⚑» over every
    screen and does exactly what the gesture does. It exists because a multi-finger gesture is not
    guaranteed to reach the app while TalkBack is on, and because an emulator smoke run cannot
    press two fingers — so it is both the accessible path and the testable one.
  - **The screen is captured before any of the app's own UI moves.** The скріншот is taken first,
    and the form is opened only once the capture has settled, so what the репорт carries is the
    screen the owner was complaining about and not the sheet they complained in.
  - **A short sheet, not a form**: «Що не так?» (required) and «Чого я очікував?» (optional), the
    скріншот shown beside them, and three actions — «Зберегти», «Зберегти й передати»,
    «Скасувати». «Що я робив» is not asked for: the route, the скріншот and the журнал already
    answer it, and that line is filled in automatically with the route the репорт was filed from.
  - **A cancelled репорт leaves nothing behind** — no row, no скріншот, no file in the cache.
  - **A capture that fails is not a refusal.** The sheet still opens, the репорт is still filed,
    and it says in Ukrainian that the скріншот could not be taken and why.
- **Modified capability `bug-report`** — the same репорт, three additions and one revision:
  - A репорт records **how it was opened** — the gesture, a failure dialog, the crash fallback, or
    the section — so the file says whether a human was standing in front of the screen.
  - A скріншот may be **attached by the app at the moment of filing**, not only picked by the owner
    afterwards. The privacy contract is unchanged and one line is added to it: a скріншот shows
    whatever was on the screen, including сума and назва, so the owner is shown the скріншот and
    told exactly that before anything is handed over.
  - **The rendered text is restructured for its second reader.** It is read twice — once on the
    phone by the owner before it leaves, once at the laptop by whoever will fix the bug, which in
    practice is a coding agent. Its sections become the ones such a reader looks for
    (`## User observation`, `## Expected behaviour`, `## Context`, `## App/build/device`,
    `## Current route`, `## Recent journal`, `## Relevant failures/errors`, `## Screenshots`,
    `## Reproduction context`), each glossed in Ukrainian so the owner still reads their own
    language, and it gains the route trail the журнал already holds. It stays one Markdown file
    with the скріншоти embedded in it: still one text, still what the owner read, still one
    hand-over.
- **Modified capability `bug-report-screen`** — the section keeps every entry point it has (the
  failure dialogs, the crash fallback, the list, «Повідомити про помилку», the saved репорт with
  its «Додати скріншот», «Скопіювати», «Передати», «Видалити») and gains the two switches that
  govern the gesture and the handle, plus the скріншот preview and its warning before a hand-over.
- **Modified capability `persistence`** — how a репорт was opened, and the two switches, survive a
  restart, through one new append-only migration.

Non-goals:

- **No second journal, no second report, no second store.** Everything filed by the gesture is a
  `bug_reports` row read by the same screens; if this change added a diagnostic path of its own it
  would have failed.
- **No shake gesture.** It collides with the Expo dev menu in exactly the builds this is for.
- **No screen recording, no video, no continuous capture, no buffer of past frames.** One скріншот,
  taken when the owner asked for one.
- **No automatic redaction of the скріншот** — no blurring, no masking, no OCR. The app cannot know
  which pixels are a сума, and a promise it cannot keep is worse than the plain warning it can. The
  owner looks at the скріншот and decides.
- **No sending anything anywhere** (vision §12, §14.9). No upload, no service, no endpoint, no
  clipboard-by-itself. «Передати» is the phone's own chooser, exactly as it is today.
- **No new automatically collected fact about the owner's money.** The counts stay counts; the
  журнал's rules do not move; the route trail is routes the журнал already holds.
- **No dev-only behaviour split.** The gesture behaves the same in a release build as in a
  development one, so what is smoke-tested is what ships. (The dev-only `crash` route stays as it
  is; nothing here replaces it.)
- **iOS is not implemented, and is not made impossible** (vision §14.15): the capture sits behind a
  port whose iOS side answers «unavailable» honestly until someone writes it.

## Capabilities

### New Capabilities

- `bug-report-here`: filing a репорт from the screen the problem is on — what activates it and what
  must not, that the скріншот is taken before any of the app's own UI is drawn over the screen, what
  the sheet asks and what it fills in by itself, the three actions, what a cancelled репорт must
  leave behind (nothing), and what a failed capture does (not a refusal).

### Modified Capabilities

- `bug-report`: a репорт records how it was opened; a скріншот may be attached by the app at the
  moment of filing and not only picked afterwards; the скріншот's own privacy line — it carries
  whatever was on the screen, so the owner sees it and is warned before any hand-over; and the
  rendered text's sections are restructured for the reader who will fix the bug, gaining the route
  trail, while staying one file the owner reads whole before it leaves.
- `bug-report-screen`: every existing entry point is unchanged; the section gains the switch for
  the gesture and the switch for the handle; a hand-over of a репорт that holds скріншоти shows them
  and warns about them first.
- `persistence`: how a репорт was opened, and the two capture switches, SHALL survive a restart and
  SHALL arrive through an append-only migration; neither exists today.

## Impact

- **New native code: a local Expo module `modules/screen-capture/`** (Kotlin, Android), which
  copies the current window's pixels with `PixelCopy` and writes one PNG into the app's cache. A
  local module rather than a third-party dependency, for `.claude/rules/android.md`'s reason:
  `modules/notification-capture/` already establishes the shape, it carries its own Gradle and
  needs no config plugin, no `android/` hand edit and no new permission, and it is ~60 lines of the
  platform's own documented API rather than a dependency whose New-Architecture support this repo
  cannot verify offline. design D2 records `react-native-view-shot` as the alternative and what
  would make it the better answer.
- **New npm dependency: none.** `react-native-gesture-handler` is already a dependency (2.32.x) and
  is what recognises the gesture; this change is the first thing in the app to use it, so the root
  layout gains a `GestureHandlerRootView`. design D1 records what that costs and the RN-touch
  fallback if it costs more than it should.
- **New code**: `src/platform/screen-capture.ts` (port + in-memory double) and
  `-device.ts` (the adapter `verify` never loads); `src/reporting/` gains the route trail and the
  restructured rendering; `src/ui/bug-report-here.ts` for everything the gesture and the sheet
  decide, as pure values; `src/components/bug-report-here.tsx` for the detector, the handle and the
  sheet; `src/db/reporting-repo.ts` gains the origin and the two switches.
- **Touched code**: `src/app/_layout.tsx` (the root view and the overlay above the Stack),
  `src/reporting/report.ts` (the rendering), `src/ui/bug-report-screen.ts` (the origin, the
  hand-over warning), `src/app/manage/bug-reports/*.tsx` (the switches, the preview) — `new.tsx`
  and `src/components/crash-fallback.tsx` are where the three existing origins are actually decided,
  and `src/ui/screens.test.ts` asserts on the source text of the first — `src/db/
  schema.ts` and `src/backup/format.ts` (the new table and column sorted into what a бекап holds —
  which is nothing: репорти, their скріншоти, the журнал and this phone's own testing switches all
  stay out, and `BACKUP_SCHEMA_VERSION` moves with the migration).
- **Database**: one append-only migration — one nullable column on `bug_reports` and one one-row
  table for the switches. Committed migrations stay untouched.
- **`npm run verify` stays Node-only and under a minute**: the gesture's parameters, the ordering
  (capture, then UI), the sheet's refusals and its auto-filled line, the rendering, the route
  trail, the cleanup of an unsaved репорт and every word any of it says are pure functions over
  injected values; the port's double is the only implementation the suite ever loads.
- **Smoke**: `scripts/android.sh` gains a two-finger driver so the gesture itself can be exercised
  on the emulator; everything after activation is smoke-tested through the handle, which `tap`
  can press. The change carries its own emulator plan (tasks §8) and is not archived without it.
- **Docs**: `docs/product-vision.md` §12 — the privacy contract admits the скріншот the app takes
  by itself, since it is the one thing a репорт carries that can show the owner's money;
  `docs/glossary.md` — **репорт про помилку** gains that скріншот and the record of how the репорт
  was opened, and **жест**, **маркер**, **аркуш** and **походження репорту** get entries of their
  own; `docs/app-overview.md` §4.9 gains the gesture and a screenshot.
