# bug-report-here — design

## Context

See proposal.md — Why. What shapes every decision below:

- **The репорт про помилку already exists and works.** `src/reporting/` holds the журнал and the
  report as values plus the one rendering; `src/db/reporting-repo.ts` stores a репорт whole,
  journal snapshot and all; `src/platform/bug-report-files.ts` is the port for the picker, the kept
  screenshots and the one outgoing file; `src/ui/bug-report-screen.ts` decides everything the
  screens decide. This change adds a door, a camera and a new layout for the text. It adds no
  second store, no second journal and no second report type.
- **The route is already derived, never passed** (`routeOf` reads the last `screen` entry of the
  журнал). So is the whole «navigation history» the proposal asks for: the журнал holds one
  `screen` entry per route change, and a репорт stores a copy of the журнал. The route trail is a
  fold over data the репорт already carries — no new collection, no new column.
- **`npm run verify` is Node-only and under a minute.** It never loads React Native and never loads
  a native module. Anything that decides — what activates, what the sheet refuses, what the app
  writes for the owner, what the text says, what is cleaned up — must be a pure function over
  injected values, or it is not proven.
- **The platform idiom is settled**: a device capability sits behind a port in `src/platform/` with
  an in-memory double beside it and a `-device.ts` adapter `verify` never loads; failures are
  values, never exceptions. This change adds exactly one more port of that shape.
- **`android/` is generated and never hand-edited.** A native need is expressed in `app.json`, as a
  local Expo module under `modules/`, or as a config plugin — and `modules/notification-capture/`
  is the precedent for the middle one (`.claude/rules/android.md`).
- **Committed migrations are immutable** (`.claude/rules/database.md`), and `src/backup/format.ts`
  asserts `BACKUP_SCHEMA_VERSION` against `drizzle/meta/_journal.json`, so a new migration fails
  `verify` until this change sorts its table and its column into what a бекап holds.
- **`react-native-gesture-handler` 2.32 is already a dependency and is used by nothing.** No
  `GestureHandlerRootView` is mounted anywhere in `src/`. `expo-router`'s `Stack` here is the
  native stack, which does not mount one either.
- **The Expo config carries the build** (`app.config.js` reads git at bundle time), and
  `Constants.expoConfig` comes from the APK, not from Metro — a репорт from a development build
  names the commit the APK was built at.
- **`app.json` sets `experiments.reactCompiler: true`.** New components are compiled; refs and
  mutable module state have to be written for that.

## Goals / Non-Goals

**Goals:**

- One path from «I see a problem» to «one file that explains it», short enough that the owner
  actually takes it mid-test.
- Every decision on that path provable in Node: what activates and what must not, that the capture
  precedes the UI, what the sheet refuses, what the app writes for the owner, the whole rendered
  text, and that a cancelled репорт leaves nothing.
- One artifact for the second reader — the person or coding agent at the laptop — with the
  observation, the build, the route, the trail, the журнал, the failures and the picture in it.
- A second, always-available way in that TalkBack does not eat and that `adb tap` can press, so the
  emulator smoke covers everything after activation.
- No new dependency, no new permission, no `android/` hand edit.

**Non-Goals:**

- No abstraction over «capture backends». There is one platform that captures today; the port has
  one adapter and an honest `unavailable` everywhere else.
- No gesture framework, no configurable gestures, no gesture recorder. One gesture, one handle.
- No new journal kind. `JournalKind` stays `screen | failure | alert | crash`; a репорт filed from
  a screen is not a failure and does not pretend to be one.
- No image processing beyond «make the PNG smaller so one file stays one file».

## Decisions

### D1. The gesture is a two-finger long press, recognised by `react-native-gesture-handler`

`Gesture.LongPress().numberOfPointers(2).minDuration(1200).maxDistance(24)` composed under a single
`GestureDetector` that wraps the whole app, inside a `GestureHandlerRootView` added at the root of
`src/app/_layout.tsx`. `numberOfPointers` is a first-class part of the installed API
(`node_modules/react-native-gesture-handler/lib/typescript/handlers/gestures/longPressGesture.d.ts`
— "Determine exact number of points required to handle the long press gesture"), so this is the
library doing what it is for and not a hand-rolled pointer counter.

Why the parameters are what they are:

- **Two pointers.** Every interaction the app already has is one finger — a tap, a scroll, a
  long-press on a list row. A two-pointer recognizer cannot be reached by any of them, which is
  most of what the «not activated accidentally» requirement asks for.
- **1200 ms.** Long enough that a two-finger fumble on a scroll does not reach it, short enough
  that the owner is not standing there. RNGH's own default is 500, which is a tap-and-hold, not a
  deliberate act.
- **24 dp of travel.** A two-finger *drag* (a pinch the owner made by accident, a two-thumb scroll)
  cancels the recognizer rather than firing it.
- **`.runOnJS(true)`.** The callback captures the screen and touches React state; it must not be a
  worklet. Reanimated is installed but nothing here needs the UI thread.

Interaction with what is already on screen: a root-level recognizer competes with its descendants,
and a `Touchable` that has claimed a single pointer is cancelled when a two-pointer gesture
activates above it — which is the behaviour wanted (the owner meant to file a репорт, not to press
the button under their thumb). RN's own `ScrollView` tracks the first pointer and does not scroll
from a stationary two-finger touch, so the "part-way down a long list" scenario is a stationary
gesture over a scroll view that is not scrolling. Nothing needs `simultaneousWithExternalGesture`;
if the smoke shows otherwise, that is the knob, not a redesign.

**Adding `GestureHandlerRootView` is the real cost of this decision**, because nothing in the app
mounts one today: RNGH's Android root view intercepts and re-dispatches touches for the whole tree.
It is the library's documented, required setup and the app is a plain RN tree with no exotic touch
handling, so the risk is that it is boring; the mitigation is that tasks §8 walks all five tabs and
the pushed screens on the emulator before anything else is believed.

Alternatives considered:

- **A root `View` sniffing `onTouchStart`/`onTouchMove`/`onTouchEnd` and counting
  `nativeEvent.touches`.** No library, no root view, no interception — genuinely attractive, and it
  is the fallback if D1 disturbs the app's existing touch behaviour. Rejected as the first choice
  because pointer bookkeeping across `touchCancel` on a native `ScrollView` is exactly the kind of
  thing a purpose-built recognizer already gets right, and RNGH is already installed and paid for.
- **Shake.** Named as unwanted in the proposal, and correctly: it is the Expo dev menu's own gesture
  in precisely the development builds this feature is for.
- **An edge swipe.** Collides with the system back gesture and with `predictiveBackGestureEnabled`.
- **Hardware volume keys.** Not reachable from RN without native code, and captured by the system
  during media playback.
- **A permanent floating button.** Rejected as the *primary* — it sits on top of the app being
  tested and changes the screen under test. It survives as the opt-in handle (D2a).

### D1a. The handle, off by default, is the accessible and the testable way in

Two reasons the gesture cannot be the only way in:

1. **TalkBack.** With a screen reader on, Android's touch exploration consumes single-finger
   touches and reserves multi-finger gestures for itself; a two-finger hold is not guaranteed to
   reach the app at all. A feature whose only door is a multi-finger gesture is a feature a screen
   reader user cannot open.
2. **The emulator.** `adb shell input` has no multi-touch. `scripts/android.sh tap` can press a
   handle; it cannot hold two fingers. Without a tap-reachable door, every scenario after
   activation would be unsmokeable.

So: a small marker drawn above every screen, off until the owner turns it on, with `accessibilityRole="button"` and a Ukrainian label, doing exactly what the gesture does by calling the same
function. It is hidden for the duration of the capture (D3) so it never appears in its own
скріншот.

### D2. The capture is a local Expo module using `PixelCopy`

`modules/screen-capture/`, Android only, one `AsyncFunction("capture")`:

1. `appContext.currentActivity.window` → `PixelCopy.request(window, bitmap, listener, handler)`.
2. Downscale so the longer edge is at most 1280 px (a 1080×2400 phone screen becomes ~576×1280),
   compress as PNG, write into `cacheDir/bug-report-capture/<millis>.png`.
3. Resolve `{ uri, width, height }`, or reject with a message the port turns into a value.

`PixelCopy` is the platform's own documented way to read a window's pixels — the actual composited
surface, not a re-`draw()` of the view tree — and it is what makes «the скріншот is the screen»
true rather than approximately true. It needs no permission, no `MediaProjection` consent dialog
and no foreground service, because the app is copying its **own** window.

Alternatives considered:

- **`react-native-view-shot` (`captureScreen`).** The obvious third-party answer, and it would
  work. Rejected because it is a new native dependency whose New-Architecture support under RN 0.86
  this repo cannot verify without a build, because it captures by re-drawing the view tree rather
  than reading the surface, and because `.claude/rules/android.md` blesses a local module for
  exactly this. **If the local module turns out to be more than the ~60 lines estimated, this is the
  fallback**, and it changes nothing above the port.
- **`MediaProjection`.** Captures the whole device, needs a consent dialog every session and a
  foreground service. Wildly disproportionate for a screenshot of our own window.
- **Doing it in JS.** There is no such thing.
- **Asking the owner to use the phone's own screenshot and pick it afterwards.** That is exactly
  today's behaviour, and the problem this change exists to remove.

The downscale is not cosmetic: it is what keeps one Markdown file a file a chat will accept
(D8). A 1080×2400 PNG of this app's flat UI is 200–500 KB; at 1280 on the long edge it is well
under 200 KB, and base64 grows it by a third. Text stays perfectly readable at that size.

iOS: `screen-capture.ts`'s adapter answers `{ kind: 'unavailable' }` on any platform without the
module, the sheet says so in Ukrainian, and the репорт is filed without a скріншот (spec: "A
capture that fails still lets the репорт be filed"). Vision §14.15 satisfied — nothing here stands
in the way of an iOS implementation later.

### D3. Capture first, then draw — and the handle hides itself first

The order is the requirement, so it is the code's shape:

```
activate()
  → if a capture is already in flight, do nothing
  → hide the handle (state), await two frames so the hide is on screen
  → await screenCapture.capture()           // ~50–150 ms
  → open the sheet with the outcome (uri | reason)
```

Nothing of the app's own is drawn *before* the capture; the one thing that would be in the picture
— the handle itself — is removed first, and the two frames are what makes the removal actually
composited before `PixelCopy` reads the surface. From the gesture there is nothing to hide, but the
same path runs, so there is one order and not two.

The sheet is opened **after** the capture settles, in both the success and the failure branch. No
spinner, no placeholder, no dimming in between: any of those would be in the picture.

### D4. The sheet is an overlay in the shell, not a route

A `<Modal>`-style overlay rendered by the root layout above the `Stack`, not a pushed screen.
Three reasons:

1. **The журнал.** Every route change is a `screen` entry, and `routeOf` reads the last one. A
   pushed sheet would write an entry and the репорт would have to skip it — the same wart
   `NEW_ROUTE` already is. An overlay writes nothing, so the last `screen` entry stays the screen
   the owner is complaining about.
2. **The back stack.** «Скасувати» must return the owner exactly where they were, including a
   half-typed form. An overlay never touches navigation state.
3. **The order in D3.** A navigation is a frame of animation over the screen; a capture that raced
   it would sometimes catch the transition.

The device's back gesture is answered with `BackHandler` while the sheet is open — the same thing
`CrashFallback` does, and for the same reason.

### D5. The captured file has a lifecycle, and «leaves nothing behind» is enforced three ways

A capture writes into `cacheDir/bug-report-capture/`. From there:

- **«Зберегти» / «Зберегти й передати»** → the репорт row is written, then
  `files.keep(reportId, {uri, mime})` copies the PNG into the репорт's own document folder (the
  path every other screenshot already takes), then the cache file is deleted.
- **«Скасувати», the back gesture, or a refused save** → the cache file is deleted and no row is
  written.
- **A process that died in between** → the whole `bug-report-capture/` directory is emptied once at
  launch, beside the other launch work in `_layout.tsx`. This is the one that makes the promise
  true rather than merely intended: a crash between capture and save is precisely when litter would
  otherwise accumulate.

Only one capture may be in flight; `activate()` is a no-op while one is. `verify` proves all of
this against the in-memory double, whose `kept()` and a new `captured()` make «nothing is left
behind» an observation rather than a hope — exactly what `handed()` already does for hand-overs.

### D6. «Що я робив» is written by the app, and the sheet asks «Що не так?»

The stored репорт keeps its three lines, so nothing about storage, rendering or the section moves.
The sheet maps onto them:

| Sheet | Stored field | Filled by |
| --- | --- | --- |
| — | `did` («Що я робив») | the app: «Заведено з екрана `/transaction/abc123` — там, де сталася проблема» |
| «Що не так?» (required) | `happened` | the owner |
| «Чого я очікував?» (optional) | `expected` | the owner |

The line names the route and says the репорт was filed from the screen itself, and deliberately
**not** which of the two doors was used: the handle calls the same `activate` the gesture does
(D1a), so «жестом» would be false half the time. Which door it was is `origin`, which records it
exactly once and without guessing.

This is the whole of «do not make me describe what I was doing every time»: the route, the
скріншот and the журнал say it, and the line that used to demand it is now derived from the route.
The refusal moves with it — an empty «Що не так?» is refused, and `did` can no longer be empty on
this path.

`submitForm`'s existing rule (an empty `did` is refused) is untouched and still guards the section
form; the sheet gets its own `submitHere`, which fills `did` and refuses on `happened`. One
`attachContext`, two front doors.

### D7. `origin` is a column; the route trail is not

- **`origin`** (`'here' | 'dialog' | 'crash' | 'section'`, nullable) is a fact about the moment of
  filing that nothing else records, so it is a column on `bug_reports`, written once, read back
  with the репорт. Nullable because rows written before this migration have no honest answer, and a
  guess in a diagnostic file is worse than a blank.
- **The route trail** is `report.journal.filter(kind === 'screen').slice(-N)` — a fold over the
  snapshot the репорт already stores. Storing it would be storing the same data twice and inviting
  the two copies to disagree. `N = 20`, which is a dozen screens of context and a few lines of
  text; the whole журнал is in the file anyway for anyone who wants more.

### D8. One Markdown file stays one Markdown file — with the picture inside it

The proposal asked whether a ZIP bundle or a self-contained HTML would serve the second reader
better. Weighed against what actually happens (the owner taps «Передати», picks a chat, the file
lands at the laptop, a coding agent is pointed at it):

| Form | One file | Text readable immediately | Picture viewable | Cost |
| --- | --- | --- | --- | --- |
| **Markdown + embedded base64** | yes | yes | one command to extract | none — this is today |
| ZIP (report.md + PNGs) | yes | no — unzip first | yes, directly | a ZIP writer, and no way to test the unzip side in Vitest |
| HTML + `<img src="data:">` | yes | buried in markup | yes, in a browser | a second renderer, and the owner's on-phone reading gets worse |
| Markdown + separate PNGs | **no** | yes | yes | breaks the one requirement that matters |

Markdown wins on the axis that decides it — the text is the diagnosis, and it must be readable
without a step — and it is what `renderReportFile` already produces. So the format does not change;
its **sections** do (see the `bug-report` delta), and `## Screenshots` gains two lines telling the
reader how to turn the block back into a PNG:

```
Дістати: скопіюйте рядок після `base64,` і виконайте `base64 -d > shot.png`.
```

The headings are English with a Ukrainian gloss after a `·` — «`## User observation · Що не так`».
This is a deliberate, small break with the existing requirement's «Ukrainian headings», and it is
the one place in the app where English is right: the section headings are addressed to the reader
at the laptop, who is usually a coding agent looking for exactly those anchors, while every word of
content — the owner's lines, the app's refusals, the labels — stays Ukrainian, and the owner still
reads their own language on the phone. `renderReport` remains the single renderer, so «what the
owner reads is what would leave» is still a property of the code.

**One renderer, one order — `renderReportFile` may no longer append.** Today it renders the whole
of `renderReport` and then adds `## Скріншоти` after it. With `Screenshots` fixed at section 9 of
ten, appending would put a second copy of it after `Reproduction context` and leave section 9
empty. So `renderReport(report, images = [])` takes the image data as an argument it defaults to
none of: the screen and the clipboard call it with nothing and get section 9 naming the скріншоти
without their data, and `renderReportFile` calls the same function with the images and gets the
same ten sections in the same order with the base64 inside section 9. There is still exactly one
renderer, and «what the owner reads is what would leave» is still a property of the code rather
than of two functions kept in step. The на-екрані text stays a few kilobytes however many pictures
the репорт holds, because it is the argument and not the renderer that differs.

### D9. One migration, and both new things stay out of the бекап

One append-only migration (the next index after the current head): `ALTER TABLE bug_reports ADD
COLUMN origin TEXT`, `ALTER TABLE bug_reports ADD COLUMN capture_failure TEXT` and a one-row
`bug_report_capture` table holding the two switches. Committed migrations are untouched.

`src/backup/format.ts` will fail `verify` on the version bump until all three are sorted, which is
the tripwire working. All three stay **out** of a бекап, for the reason `journal`, `bug_reports` and
`bug_report_screenshots` are already out: they describe this phone and how it is being tested, not
the owner's money. `BACKUP_SCHEMA_VERSION` moves to one more than it is, with a one-line comment saying so —
stated relatively because `format.test.ts` asserts it against the number of entries in
`drizzle/meta/_journal.json`, and the absolute number depends on which in-flight migrations are
committed by the time this one is generated.

### D10. The switches live where the репорти live

`bug_report_capture` is one row with two booleans, read once at launch into the shell and written
from «Репорти про помилки». Not a generic settings table — the app does not have one, and inventing
one for two booleans is a bigger decision than this change is allowed to make (`dailyReminder` and
`entryDefaults` are the precedent for a one-row table per concern).

Defaults: **gesture on, handle off.** The gesture is the feature; the handle is the fallback and
would otherwise sit on top of every screen of a money app the owner did not ask to decorate.

**Read at launch, and again when the section changes them.** «A switch takes effect without a
restart» is a requirement, and the switches are written on a pushed screen while the thing they
govern lives in the root layout beneath it. The shell therefore re-reads the row when it regains
focus — `useFocusEffect` on the layout is not available, so the read is the one
`useOnForeground`-shaped trigger the app already has plus a re-read whenever the pathname leaves
`/manage/bug-reports`. That is a storage read of one row, on a navigation the owner just made, and
it beats a context provider for two booleans that change perhaps twice in the life of the phone.

### D11. The скріншот warning is one component, used twice

The sentence and the thumbnails are the same in the sheet's «Зберегти й передати» and on the saved
репорт's «Передати», so they are one confirmation surface with the words in
`src/ui/bug-report-screen.ts` beside `REMOVE_CONFIRMATION`. A репорт holding no скріншот skips it
entirely — a warning about nothing trains the owner to dismiss warnings.

### D12. The emulator smoke drives the handle; the gesture gets its own driver

`adb shell input` cannot press two fingers, so `scripts/android.sh` gains `twofinger X1 Y1 X2 Y2
[ms]`, implemented with `adb shell sendevent` against the emulator's touchscreen (multitouch
protocol B: two tracking slots down, a hold, both up). Everything **after** activation — the
capture, the sheet, the refusal, saving, cancelling, the hand-over, the restart — is driven through
the handle with plain `tap`, which is why the handle is worth its weight.

If `sendevent` proves unreliable on the AVD, the two gesture-only scenarios (it activates; it does
not activate from ordinary use) are verified by hand on the device and **recorded as manually
verified in the task**, not quietly skipped. That is the honest fallback and it is written into
tasks §8.

### D13. What `verify` proves, and what it cannot

Proven in Node, with no device: the gesture's parameters as values (`GESTURE` — pointers, duration,
distance — asserted against the recogniser's config), the activation ordering as a sequence of
effects against a fake capture port, the sheet's refusals and its auto-written `did`, the whole
rendered text including every new heading and the route trail, the cleanup on every exit path, the
switch defaults, the migration and the бекап exclusions, and that no forbidden word ever reaches
the rendered text (`privacy.test.ts` gains the new path).

**Not** proven in Node, and therefore in tasks §8: that the recogniser actually fires on a device,
that it does not disturb scrolling or buttons, that `PixelCopy` returns the screen and not a black
rectangle, and that the picture in the file is the screen from before the sheet.

## Risks / Trade-offs

- **`GestureHandlerRootView` changes touch dispatch for the whole app** → the emulator pass in
  tasks §8 walks all five tabs, the pushed screens, a long list, a form with a keyboard up and the
  tab bar itself, before anything else is believed. The RN-touch-observer fallback in D1 needs no
  root view at all, and swapping to it changes one component.
- **A multi-finger gesture may never reach the app under TalkBack** → the handle exists precisely
  for that (D1a), is labelled for a screen reader, and the section says in words that it is the way
  in when the gesture is not.
- **The gesture cannot fire while a system dialog is open** — an `Alert` is another window and RNGH
  never sees the touch → accepted, because those dialogs already carry «Повідомити про помилку»,
  which is the better door there anyway.
- **`PixelCopy` returns nothing useful on a window marked secure, or on an emulator with software
  rendering** → a value, not an exception: the sheet says the скріншот could not be taken and the
  репорт is filed anyway. The emulator run is what tells us whether this is theoretical.
- **The capture adds ~100 ms between the gesture and the sheet, with no feedback** → accepted
  deliberately: any feedback would be in the picture. If it reads as a hang on a slow device, the
  answer is a *post*-capture acknowledgement, never a pre-capture one.
- **One more picture in one file makes the file bigger** → the 1280 px downscale (D2) keeps a
  captured скріншот under ~200 KB before base64. Picked screenshots are still whatever the owner
  picked, exactly as today.
- **English headings in a Ukrainian app** → D8's trade, made once and confined to headings; every
  word of content stays Ukrainian and the on-phone text is still the text that leaves. If the owner
  dislikes it, the fix is one table of strings.
- **The local Expo module is native code `verify` cannot compile** → the CI `android` job
  (`assembleDebug`) is the check, `npx expo-doctor` runs after the module is added, and D2 names
  `react-native-view-shot` as the drop-in fallback behind the same port.
- **`sendevent` multitouch may not work on every AVD** → D12's recorded manual fallback, and the
  handle keeps every other scenario automatable regardless.

## Migration Plan

One append-only migration generated with `npm run db:generate` (D9); no data is rewritten and no
committed migration is touched. A phone upgrading loads its existing репорти with no origin and
both switches at their defaults. There is no rollback beyond the usual: an earlier build reading a
database with the extra column and table ignores both.

## Open Questions

- **How long the route trail should be.** D7 picks 20 because it is a dozen screens; the whole
  журнал is in the same file, so changing the number later changes one constant and one test.
- **Whether the handle should be movable.** Fixed for now, in the corner least likely to sit on a
  primary action. If it covers something during real testing, making it draggable is a separate
  small change and no spec above depends on it standing still.
