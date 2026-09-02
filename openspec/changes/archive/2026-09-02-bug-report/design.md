# bug-report — design

## Context

See proposal.md — Why. What shapes the decisions:

- **The app has no logging at all today.** Not one `console.*` call under `src/`, no error
  boundary, no global handler. A shown failure is `failureMessage(error)` (`src/ui/labels.ts:110`)
  at 21 uses in 11 files under `src/app/` — mostly `Alert.alert` dialogs, once feeding screen
  state (`saldo-import.tsx`) — plus two dialogs that show a text of their own without it
  (`transaction/scan.tsx`'s «Не прикріплено», `(tabs)/index.tsx`'s «Не підтверджено» with
  `answer.message`) and two failure states shown in place (the бекап's `failed` in
  `manage/backup.tsx`, the sync's `failed` in `manage/monobank.tsx`); a crash is a dead app. The журнал is therefore new
  ground, not a rewrite.
- **`npm run verify` is Node-only.** Everything decided — what an entry looks like, the bound,
  what a репорт holds, the rendered text, the privacy invariant, every word the screens show,
  every state — is pure TypeScript under `src/reporting/` and `src/ui/`, tested against
  in-memory doubles. The device sits behind one port per seam (`analysis-share.ts` is the
  template: outcomes are values, never exceptions).
- **The failure-alert machinery already exists.** `src/ui/alerting.ts` raises and clears a
  сповіщення про збій through `AlertStorage`; `AlertKind` names the five unattended actions. The
  журнал records those raises with one line inside `alerting.ts`; it does not replace them.
- **The бекап already names its untouched tables** (`src/db/backup-repo.ts:260`: rates,
  fingerprints, alerts). The three new tables join that list, and `format.ts` never learns them.
- **A native module is a decision** (`.claude/rules/android.md`). None is added: the picker is
  `expo-document-picker` (already used by `backup-file-device.ts`), the chooser `expo-sharing`
  (`analysis-share-device.ts`), files `expo-file-system`, the clipboard `expo-clipboard`, the
  build and device `expo-constants` + `expo-device` — all installed.
- **The owner is the developer.** The репорт is read in a Claude Code session by the person who
  wrote the app, so the file optimises for reproduction — exact refusal text, the route, the
  stack, the journal's order — over polish.

## Goals / Non-Goals

**Goals:**

- One journal, written from four places only: the root layout (routes), `reportFailure` and
  `journal.failure` (every shown failure), `alerting.ts` (every `raise` call, before it decides
  anything, and every clear), the crash handlers.
- Exclusion by construction: the journal's entry type has no field for a сума, a назва, an опис
  or bank text; the drain passes its failure as a kind; a sentinel test over the whole rendered
  text proves it.
- One rendering: what the saved репорт's screen shows, what the clipboard gets and what the file
  carries are the same text — the file only appends the image data.
- The crash fallback and the ordinary form share one component and one screen model.

**Non-Goals:**

- No log levels, no debug logging of successful operations, no timing. The journal answers
  «what was the app doing and where did it fail», nothing finer.
- No zip, no multi-file share, no image compression. One Markdown file.
- No retention policy for репорти; the owner removes them.
- No symbolication on the phone; the build's commit in the file is what makes the stack
  readable at the laptop.

## Decisions

**D1. `src/reporting/` is a pure module beside `src/reminders/`, not part of `src/domain/`.**
The журнал and the репорт are about the app, not the owner's money; `domain.md`'s rules do not
describe them and the domain must not import them. `src/reporting/journal.ts` holds
`JournalEntry` (`{ id; at: Date; kind: 'screen' | 'failure' | 'alert' | 'crash'; name: string;
detail?: string }`) — `name` is a route, an action kind or an `AlertKind`, `detail` is the
refusal text or the crash's message + stack — and `appendBounded(entries, entry, 500)`.
`report.ts` holds
`BugReport` and `renderReport(report, screenshots?)`. `privacy.test.ts` is the sentinel test
(D6). Rejected: **inside `src/ui/`** — the rendering is consumed by a file, not a screen, and
`src/ui` is where the effectful journal lives; keeping the shapes one level down keeps the two
apart the way `src/analysis` and `ai-analysis-screen.ts` are.

**D2. The effectful journal is `src/ui/journal.ts`: a module-level singleton over a storage
port, with `reportFailure` as the one door for shown failures.** `JournalStorage { append(entry);
tail(): readonly JournalEntry[]; byId(id) }` — `append` prunes to 500 inside — is implemented
by `src/db/reporting-repo.ts`;
`journal.record(kind, name, detail?)` appends synchronously (expo-sqlite's sync API, as every
repo here) and prunes to 500 in the same statement batch. `reportFailure(where: string, error:
unknown): string` records `{ kind: 'failure', name: where, detail: failureMessage(error) }` and
returns the text — so the dialog call sites change `failureMessage(error)` to
`reportFailure('local-save', error)` and nothing else; the one use that feeds state
(`commitFailed(current, failureMessage(error))`) becomes `reportFailure` the same way. The two
dialogs that carry a text of their own (`scan.tsx`, `index.tsx`'s `answer.message`) go through
`failureAlert` with that text as the error. The two in-place failure states are journaled with
`journal.failure(where, text)` at the line where the screen receives the failed outcome.
Pruning to 500 happens inside the storage's `append`, in the same statement batch, so the
singleton has one call to make. `alerting.ts` journals at the top of `raise`, before
`decideAlert` — an already-outstanding or attended failure posts nothing but is still a
failure, and the second one is exactly the one the owner files about. A screen test under
`src/ui/` reads `src/app/**/*.tsx` and asserts `failureMessage(` no longer appears there (the
pattern `testing.md` prescribes for inspecting screens); `alerting.test.ts`'s «changed none of
the words those screens already said» assertion is rewritten to the new literals, keeping its
intent. Rejected: **a React context** — the crash
handlers run outside React, and a context cannot be reached from `ErrorUtils`; a singleton with a
`bind(storage)` called once after the migrations is what both can reach. Before `bind`, entries
go to a small in-memory buffer that is flushed on bind, so a crash during launch is not lost.

**D3. Route changes are journaled in the root layout with `usePathname`.** One effect in
`RootLayout`, after the migrations: `journal.record('screen', pathname)`. Every screen is
covered without touching any of them. Dynamic segments stay as the concrete path
(`/transaction/abc123`) — an id is not a назва and is exactly what reproduction needs.

**D4. One boundary catches render errors; two hooks remember the rest.** (a) `export function
ErrorBoundary` in `src/app/_layout.tsx` (expo-router's per-route boundary; the nearest one
catches, and the root is the last resort) renders `CrashFallback`, a component with no router
and no theme provider beneath it — the tree it replaced is gone — that styles itself from
`Colors` and the system scheme, and answers the device's back gesture with React Native's own
`BackHandler` (as `retry`), never with `useCloseOnBack`, whose `useFocusEffect` needs the router
that is not there; for the same reason the shared `BugReportForm` owns no navigation hook — the
host screen `new.tsx` subscribes to the back gesture, the fallback does it its own way; inside one `useRef` guard it first records
`{ kind: 'screen', name: usePathname() }` and then `journal.record('crash', 'render', message +
'\n' + stack)`, so one crash is one crash entry preceded by the route it happened on.
`usePathname` is `useSyncExternalStore` over expo-router's module-level store and needs no
navigator, so it is readable inside the fallback — and it has to be read there: when a screen
throws on its very first draw, React discards that whole render, `RootLayout`'s own pathname
effect never commits, and the journal would otherwise hold no `screen` entry for the crashed
route at all (`routeOf` would then name the previous screen). The boundary's «Повернутися» calls
expo-router's `retry`; «Повідомити про помилку» shows `BugReportForm` inside the fallback with
the crash entry's id as the prompting failure, and after a save calls `retry` — the app remounts
at its initial route, Головний, which is what the spec asks. Rejected: **routing to the form
from the fallback** — there is no navigator to push into; the pathname is still readable, and
that is all the fallback needs. (b) Errors the boundary cannot see are
*remembered, not caught* — the spec says so in as many words. `ErrorUtils.setGlobalHandler`
journals `{ kind: 'crash', name: 'async', detail: message + stack }` and then calls the previous
handler, so the red box in development and the exit in release are unchanged; unhandled
rejections are journaled through Hermes's own tracker
(`HermesInternal.enablePromiseRejectionTracker`, the hook React Native's `polyfillPromise`
installs in development), as `{ kind: 'crash', name: 'rejection' }`. Calling it again replaces
React Native's options object, so the app's `onUnhandled` and `onHandled` journal and then
delegate to exactly what React Native's did — its `onUnhandled` is
`ExceptionsManager.handleException(…, isFatal: false)`, a LogBox error, and only its `onHandled`
warns; in release nothing is installed at all — so the platform's behaviour is unchanged, as the
spec says. Neither shows the fallback: a fatal error in release has no tree left to
show it in, and keeping the app alive past one is not a promise this app can keep. The crash is
in the журнал, and the next репорт — filed from the section, at the owner's own pace — carries
it. Rejected: **a module-level signal the root re-renders the fallback from** — after a fatal
error the JS thread is in an unknown state; a fallback drawn there could itself throw, and the
exit is at least honest.

**D4a. The launch view stays outside the boundary's reach.** `retry` remounts `RootLayout`
whole, `AnimatedSplashOverlay` included, and its `visible` starts `true` — so without care the
launch view would replay over the return, which the existing app-shell requirement forbids. The
overlay keeps a module-level `playedOnce` flag: on a second mount in the same process it renders
nothing and calls nothing. `useMigrations` re-runs and is idempotent (it checks the applied
list); the Stack is unmounted for that one tick, which is a blank frame in the app's own
background colour, not a launch view.

**D4b. The deep import stays; the deprecation banner is turned off at its source.** Delegating
(D4 (b)) means holding React Native's own options object, and in RN 0.86 the only way to reach it
is `require('react-native/Libraries/promiseRejectionTrackingOptions')` — a deep import, which
`babel-preset-expo` answers in development by appending a `console.warn` to the end of the
module's body: a LogBox banner over every screen, which is how the emulator smoke run found it.
Three ways out were investigated and each is rejected for a stated reason.

- **A public API for the tracker.** There is none. `react-native`'s `index.js` exports nothing
  for rejection tracking or for `ExceptionsManager`. The package's `exports` map does resolve
  `./*`, so the deprecation is advisory rather than blocking — but the warning fires on *every*
  subpath of `react-native/`, its one hardcoded exception being `Libraries/Core/InitializeCore`.
  No non-deep specifier reaches the module.
- **Reading the installed options instead of replacing them.**
  `HermesInternal.enablePromiseRejectionTracker` is a setter with no getter, and `polyfillPromise`
  keeps no reference to what it passed. There is nothing to read.
- **A different hook: `global.ErrorUtils.reportError`.** This one is real —
  `setUpErrorHandling` installs `ExceptionsManager.handleException(e, isFatal)` as the global
  handler and `reportError(e)` calls it with `isFatal: false`, so it *is* where React Native's
  `onUnhandled` ends, reachable with no deep import at all. Rejected twice over. It would journal
  every rejection twice: the app's own `ErrorUtils` handler (D4 (b)) records `crash/async`, and
  React Native reaches `ExceptionsManager` directly, bypassing `ErrorUtils` — which is precisely
  why the tracker was needed in the first place. And it reproduces the delivery but not the
  message: React Native builds `Uncaught (in promise, id: N): "…"` with the rejection as `cause`,
  formatting the payload through `pretty-format`, and its `onHandled` warns two lines of its own.
  Re-implementing that is exactly what D4 (b) refused, and it would drift with every release.

What is left is to stop the warning being generated. Both `@react-native/babel-preset` and
`babel-preset-expo` expose `disableDeepImportWarnings`, set top-level in `babel.config.js`
(platform-scoped forms of it are not read). It is preferred over `LogBox.ignoreLogs` on three
counts: it is a supported switch rather than suppression of the UI; it removes the `console.warn`
from the bundle instead of hiding a call that still runs; and `ignoreLogs` would have to be
sequenced ahead of a warning the plugin appends to the very module that would install it. Note
that `if (__DEV__)` never contained this warning — it is appended at module scope, so it fired on
every development launch whether or not the `require` ran, and it is absent from release either
way.

The option is project-wide, so the guard it removes is replaced rather than dropped:
`no-restricted-imports` on `react-native/*` in `eslint.config.js` moves that guard into
`npm run verify`, where it is a gate rather than a banner. It needs no exception beside the
existing `no-require-imports` disable: the rule listens on `import`/`export` syntax only, never
on a `require()` call, so the one deliberate deep import — which is a `require()` — never trips
it. Coverage strictly improves: `@typescript-eslint/no-require-imports` catches only the
`require` form, and only as a warning, while `import … from 'react-native/…'` was caught by
nothing at all before this rule.

**D5. Storage: three tables, one migration, all outside the бекап.** `journal(id text pk, at
integer ms, kind text, name text, detail text null)` — pruned and read in insertion order, `at`
first and SQLite's own `rowid` as the tie-break, because `at` is a millisecond and two entries
can share one (the fallback writes its `screen` and its `crash` in one tick, D4 (a)); without a
total order «the oldest is gone» would be a coin toss over exactly the pair that matters. No
sequence column of its own: `rowid` is already there, already monotonic for an append-only table,
and only ever grows here because the prune deletes the *lowest* rowids.
`bug_reports(id text pk, created_at, route,
did, happened null, expected null, prompting_json text null, build_json, device_json,
counts_json, journal_json, migrations_applied integer, handed_over_at null)`, `bug_report_screenshots(report_id → bug_reports.id on delete cascade, name text, added_at;
pk (report_id, name))`. The журнал snapshot and the prompting entry are copied into the репорт as JSON at
creation (`journal_json`, `prompting_json`), because the live journal keeps rolling — every
route change is an entry, and 500 is a day or two of use — and the репорт must show what it
showed when filed. There is deliberately no foreign key from a репорт to the live journal: a
pointer the pruning would null is a репорт that forgets its own crash. The form reaches the
prompting entry by id through `JournalStorage.byId` once, at creation; after that the репорт is
self-contained. `backup-repo.ts`'s restore leaves the three untouched and the comment there names
them; `backup-repo.test.ts` proves «A restore leaves them in place». Rejected: **files only** —
the list needs ordering and the hand-over moment, and DB tests are the cheap, real tests here.
Rejected: **a JSON column for screenshots** — a child table with a cascade is how `receipt_items`
hangs on its чек, and removal then needs no second thought. The cascade is only half of
«removing a репорт removes its screenshots», though: the images are files, not rows, so the
screen's `removeReport` calls `files.removeAll(reportId)` beside the delete and task 5.2 asserts
`kept()` is empty afterwards — the row half is proven in SQL by task 3.2, the file half there.

**D6. Privacy is by construction, and the one exception is stated and tested.** `JournalEntry`
has no field for money or names; the drain's failure reaches the journal as its kind only
(`notification-drain` already returns `report.failure` as a value). The exception the spec
names: the app's own refusal or error text goes into the entry verbatim, and that text can quote
what the owner typed — `named-list-repo.ts` throws «Рахунок «X» вже існує», `money.ts` throws
with the offending amount — because a repro needs the exact words the owner saw, and the owner
reads the whole репорт before it leaves. `privacy.test.ts` runs a fixture whose every назва,
опис and notification text carries `ZZ-SENTINEL-`, drives the journal through screens, an
ordinary refusal, a duplicate-назва refusal, a collection failure, an alert and a crash, renders
a репорт, and asserts the sentinel occurs exactly once in the text — inside the duplicate-назва
entry's line — and nowhere else. Rejected: **scrubbing quoted values from refusals** — the
refusal would then differ from what the owner saw, and a repro from a report that misquotes the
error is worse than one that quotes a назва the owner already typed.

**D7. The file is Markdown; screenshots ride inside it as base64.** `renderReport` yields the
text; `renderReportFile(report, images: { name; mime; base64 }[])` appends `## Скріншоти` with
one fenced block per image (`data:image/png;base64,…`). One file, no zip, no new dependency; at
the laptop a three-line script extracts the images. The clipboard gets `renderReport` alone,
with the screenshots named. File name `cap1tal-report-<created_at as YYYY-MM-DD-HHmm>.md`,
shared as `text/markdown`. Rejected: **zip via a JS library** — a dependency and an untested
runtime for one owner's convenience; **two hand-overs** — a репорт that is not one file is not a
репорт.

**D8. The device port: `src/platform/bug-report-files.ts`.**
`BugReportFilesPort { pickScreenshot(): Promise<{ kind: 'picked'; uri; mime } | { kind:
'cancelled' } | { kind: 'failed'; reason }>; keep(reportId, picked): Promise<{ name } | failed>;
read(reportId, name): Promise<{ mime; base64 } | failed>; removeAll(reportId): Promise<void>;
share(file: { name; text }): Promise<AnalysisShareOutcome> }` — the share outcome type is reused
from `analysis-share.ts` unchanged, since its three outcomes are exactly the honest ones here
too. `inMemoryBugReportFiles()` is the double, with `handed()` and `kept()` for the tests. The
device adapter keeps images under `<documentDirectory>/bug-reports/<id>/` and the outgoing file
under `<cacheDirectory>/bug-reports/`, overwriting the previous one. `pickScreenshot` calls
`DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true })`; a
`canceled` result is `cancelled`, never a failure.

**D9a. A save that fails is a refusal like the empty line.** `submitForm` takes the storage's
write as a thunk and answers with a value either way, so «нічого не збережено» has one shape
whatever caused it: the form stays, nothing is stored, and the owner reads why in Ukrainian —
«Не вдалося зберегти репорт: <текст>». It matters most exactly where it is least likely to be
noticed: the crash fallback is shown when things are already wrong, and D2's pre-bind buffer
saves the *журнал entry*, not the репорт, so a crash during the migrations leaves «Зберегти»
writing to a database that is not there. The failure is journaled through `reportFailure` like
any other, so the next репорт — filed later, from the section, on a launch that worked — carries
the evidence of the one that could not be filed.

**D9. The screen model is `src/ui/bug-report-screen.ts`**: `formState`, `submitForm` (the
required-line refusal in Ukrainian, the failed-write refusal of D9a, `attachContext` gathering
build, device, counts, journal tail, prompting entry, and the route), `routeOf(journal, prompting?)`, `savedReportState` (`idle | handing-over | handed-over(at) | unavailable
| failed(reason)`), `listRows` (newest first, first line of `did`, route, handed-over flag) and
every label. `BuildInfo` comes from `Constants.expoConfig?.extra?.build` and `Constants.
expoConfig?.version`; `DeviceInfo` from `expo-device` — both read in the screen and passed in as
values, so the model never imports Expo. The JSX maps over the model, as `ai-analysis.tsx` does.
The route of the репорт is derived from the journal, not passed by the caller: with a prompting
entry, it is the last `screen` entry before it (the screen the dialog was shown on); without
one, the last `screen` entry that is not one of the репорт routes themselves (the section, when
filing from it). D3 journals every route change and the fallback journals the crashed route
itself (D4 (a)), so the entries are always there, and no call site has to know its own path.

**D10. `app.config.js` beside `app.json` adds `extra.build`.** Expo merges the two: the function
receives `app.json`'s config and returns it with `extra: { build: { commit, dirty, builtAt } }`
read via `child_process.execSync('git rev-parse --short HEAD')` and `git status --porcelain` at
bundle time, falling back to `unknown` when git is absent. No other config changes; `app.json`
stays the readable source of everything else. Rejected: **a generated `src/build-info.ts`** —
a gitignored file the type-checker needs breaks CI, and a committed one goes stale every commit.

**D11. Routes: `/manage/bug-reports` (list), `/manage/bug-reports/new` (form; `?prompt=<journal
id>` attaches a prompting failure), `/manage/bug-reports/[id]` (saved репорт).** Under `manage/`
for the reason `settings-sections.ts` gives. `new` is a static segment beside `[id]`, the same
shape as `transaction/new` beside `transaction/[id]`. The failure dialogs reach the form through a
helper `failureAlert({ title, where, error, report })` in `src/ui/failure-alert.ts` that returns
the `Alert.alert` arguments — the buttons are values a test can read — and each call site passes
`report: (id) => router.push({ pathname: '/manage/bug-reports/new', params: { prompt: id } })` —
only the entry's id; the route comes from the journal (D9).

**D12. The crash lever for the emulator is a `__DEV__`-only route.** `src/app/crash.tsx` throws
while rendering in a development build and renders a redirect to Головний in a release build;
it is reached only by deep link (`adb shell am start -d cap1tal://crash`). It ships, guarded, so
every later change's smoke can drive the fallback the same way; nothing in the app links to it.
Rejected: **a temporary throw removed before archive** — a tree reviewed with the lever and
archived without it is two trees.

## Risks / Trade-offs

- [The root `ErrorBoundary` replaces the whole tree, including the migrations hook] → the
  boundary re-runs `RootLayout` on `retry`, migrations are idempotent (`useMigrations` checks the
  applied list), and the journal's `bind` is guarded against a second call.
- [A crash before `bind` — during migrations] → the in-memory pre-bind buffer (D2) holds it and
  flushes on bind; if migrations themselves fail, the existing red «Не вдалося підготувати
  сховище» view stays and nothing is journaled, which is the same as today.
- [Release stacks are minified] → the file names the commit (D10); `scripts/android.sh` already
  builds from the working tree, and the Hermes source map is in the build output for that
  commit. A task notes where.
- [`usePathname` in the root layout fires before the migrations are done] → entries before
  `bind` go to the buffer; the first route is not lost.
- [Base64 images make the file large — one screenshot ≈ 1 MB] → acceptable for a share sheet;
  the clipboard never carries them (D7); the saved screen shows thumbnails from the files, not
  from the text.
- [A refusal's text can carry a typed назва] → accepted and stated (D6); the owner reads the
  whole text before handing it over, exactly as the AI-аналіз preview rule.
- [`ErrorUtils` and `HermesInternal` are React Native globals] → `react-native/types` already
  declares `ErrorUtils`; check before adding any ambient, and declare only `HermesInternal`'s
  one method in `types/expo.d.ts` if `tsc` does not know it. The handler chains to the previous
  one so development behaviour is unchanged.

## Migration Plan

One forward migration (`0012_*`), append-only; no data moves. Rollback is uninstalling nothing —
the tables are outside the бекап, so a build without them loses only репорти the owner already
handed over or chose to keep. `app.config.js` is additive and reversible by deleting it.
