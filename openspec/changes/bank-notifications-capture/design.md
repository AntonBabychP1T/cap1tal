# bank-notifications-capture — design

## Context

See proposal.md — Why. The engine (`src/notifications/`) already defines the seam this change
fills: `CapturedNotification = { packageName, postedAt, title, text }` (engine design D1) is
what the platform must produce, and the access port
(`src/platform/notification-access.ts`) already speaks `granted | denied | unsupported` with
the device adapter hard-coding `unsupported` and its own comment saying exactly what changes
when the listener lands. Constraints that shape everything: `android/` is generated and never
hand-edited (rules/android.md), `npm run verify` stays Node-only, native code is exercised by
the CI `android` Gradle job plus a scripted emulator smoke test, and iOS/web must keep
building with capture honestly absent. This is the repo's first native module.

## Goals / Non-Goals

**Goals:**

- The smallest native surface that satisfies the capture spec: hear, filter, store, hand over
  — no parsing, no persistence beyond the queue, no UI.
- Every rule that can be a pure function is one, tested under `verify`; the Kotlin side keeps
  only what must touch Android.
- The whole flow smoke-testable from the shell against an emulator, per android.md.

**Non-Goals:**

- No draining into `processCapture`, no watched-app storage in SQLite, no screens — the
  follow-up (`bank-notifications-screen`) wires those; here nothing in production code calls
  the capture port yet.
- No notification-shape research: title and text are captured verbatim; making sense of them
  is the engine's existing job.

## Decisions

**D1. A local Expo module, not a third-party listener library.**
New native module `notification-capture` at `modules/notification-capture/`
(`expo-module.config.json` + `android/` Kotlin, no ios/ implementation), autolinked by Expo
SDK 57's local-modules support. Alternatives — a community package like
`react-native-android-notification-listener` (unmaintained-risk dependency that neither
filters natively nor buffers to our rules) or a config plugin injecting raw Kotlin into the
generated tree (fights prebuild regeneration) — rejected. A local module survives `expo
prebuild` by construction and keeps the Kotlin in our tree under our tests' eyes.

**D2. The service and its permission live in the module's own manifest; `app.json` does not change.**
`modules/notification-capture/android/src/main/AndroidManifest.xml` declares
`CaptureListenerService` (a `NotificationListenerService`) guarded by
`android.permission.BIND_NOTIFICATION_LISTENER_SERVICE` with the
`android.service.notification.NotificationListenerService` intent filter — merged into the
app manifest by Gradle's manifest merger at build. This is a service-binding guard held by
the OS, not a user-consent permission entry: the user-facing grant is Android's own
notification-access toggle, which is exactly what the spec's access requirement describes.
No new entry in `app.json` `plugins`; if the merger ever proves insufficient the fallback is
a config plugin in `plugins/`, named here so android.md's rule is satisfied in advance.

**D3. The service filters before it stores, and stores only the four fields.**
`onNotificationPosted` reads the watched set (D5) and returns without writing anything when
the posting package is not in it — the "leaves no trace" requirement enforced at the first
point the data exists. For a watched package it extracts exactly `packageName`, `postTime`,
title (`EXTRA_TITLE`, else empty) and text (`EXTRA_BIG_TEXT`, else `EXTRA_TEXT`, else empty),
skipping group-summary notifications (`FLAG_GROUP_SUMMARY` — they duplicate their children)
and records where both title and text came out empty (nothing for the engine or the owner to
read). Belt and braces for the monobank exclusion: the service drops the monobank package
even if a watched set somehow names it (D6).

**D4. The queue is a JSON-lines file in `noBackupFilesDir`, capped at 500, removed only on acknowledgement.**
Captured records append to `<noBackupFilesDir>/notification-capture/queue.jsonl`; the watched
set sits beside it as `watched.json`. `Context.noBackupFilesDir` is excluded from Android
Auto Backup by the OS itself, which makes the spec's "no backup ever includes it" structural
rather than a rule someone must remember when backup ships (vision §12). Append enforces the
500-record bound by dropping oldest lines. Collection reads everything and removes nothing;
`acknowledge(count)` drops via write-temp-then-rename the oldest `count` lines *of the last
collection's remembered snapshot* that are still at the head of the file — never blind
line-count arithmetic, so a bound eviction happening between collect and acknowledge can
never make acknowledgement eat records that were never delivered. A destructive
read-and-truncate drain was rejected: it would hard-code a loss window — a crash between the
native call returning and the follow-up change's SQLite commit would lose captures
unrecoverably — while at-least-once redelivery costs nothing, because the engine's persisted
fingerprint dedup turns a redelivered record into `duplicate`. The follow-up commits records
and fingerprints to SQLite first and acknowledges after. Service callbacks and module calls
share one process, so one lock object in a Kotlin singleton (`CaptureStore`) serialises all
file access. On read, an unparsable line (torn write at a crash) is skipped, never thrown —
the engine's totality idiom applied to our own storage — and dropped from the file as the
collection rewrites it: a line no collection can hand over is a line no acknowledgement can ever
forget, so leaving it would park it at the head of the queue and block every acknowledgement
behind it. ("Removes nothing" is about captured notifications; a torn line is not one.) Alternatives — SharedPreferences
(unordered, backed up by default, size-limited) and a second SQLite database (a second writer
next to Drizzle's, for a 500-line buffer) — rejected.

**D5. The watched set is pushed down, persisted natively, empty by default.**
The module API is four functions: `isAccessGranted(): boolean` (via
`NotificationManagerCompat.getEnabledListenerPackages(context)` containing our package),
`setWatchedPackages(packages: string[])` (persists `watched.json`),
`collect(): CapturedRecord[]` and `acknowledge(count: number)` (D4). Persisting natively is
what makes the spec's
"holds without the app running" true: the service reads `watched.json` on each posting, so a
reboot that starts the listener before any JS ran still filters correctly. No set ever
written = empty set = capture nothing, which is also the privacy default while no screen
exists to call `setWatchedPackages`.

**D6. The monobank refusal is a pure function, used on both sides of the seam.**
`src/platform/notification-capture.ts` exports the port
(`setWatched(packages) → ok | typed rejection`, `collect() → CapturedNotification[]`,
`acknowledge(count)`) and the pure validation that refuses any package equal to or prefixed
by `com.ftband.mono` (the monobank Android app family). The TypeScript port applies it before the native call — that
is the typed rejection the spec requires and the part `verify` proves — and the Kotlin
service drops the same prefix as D3's last line of defence. The exact production package is
confirmed on the owner's phone (open question); the spec says "the monobank app package",
so a corrected constant is no spec change.

**D7. Ports and doubles follow `monobank-token` exactly; the native module is loaded lazily.**
`notification-capture.ts` — port type, `inMemoryNotificationCapture` double (seedable queue
honouring collect/acknowledge semantics, records `setWatched` calls), and a source-hygiene
test asserting no react/expo/db imports (the engine's `CapturedNotification` type import is
allowed: it is pure TypeScript). `notification-capture-device.ts` — the adapter: on Android
it resolves the native module lazily inside each call
(`requireNativeModule('NotificationCapture')` in a try/catch); on any failure or non-Android
platform, `collect` answers `[]`, `acknowledge` answers quietly and `setWatched` answers the
typed "capture cannot work here" outcome — failures are values, the spec's no-crash
requirement.
`notification-access-device.ts` changes one function exactly as its comment promised:
`state()` asks the module `isAccessGranted()` and answers `granted`/`denied`, keeps answering
`unsupported` when the module is absent (web, iOS, a build without it); `openSettings` is
already correct and does not change. `src/ui/onboarding.ts` and the access port type are
untouched.

**D8. A debug-only broadcast makes the smoke test scriptable.**
In debuggable builds only (`ApplicationInfo.FLAG_DEBUGGABLE` checked at runtime), the service
registers (dynamically, in `onCreate` — never in the manifest, so release builds cannot carry
it) a receiver for four actions: `com.antonbabychp1t.cap1tal.DEV_SET_WATCHED` taking a
package-list extra, `DEV_COLLECT` and `DEV_ACKNOWLEDGE`, which each do exactly one of the two
things, and `DEV_DRAIN`, which does both; every one of them logs a count and nothing else.
Collect and acknowledge are separately reachable because together they cannot tell a queue that
waits for acknowledgement from one that empties itself on being read — the single property this
design rejected a destructive drain for, so a smoke test that cannot see it proves nothing. On targetSdk 33+ the registration must pass `RECEIVER_EXPORTED` or
`adb shell am broadcast` cannot reach it — named here so the smoke test does not discover it;
exported means any app on a *debug* build could send these actions, which is accepted: the
receiver exists only on debuggable builds on dev machines, and the worst it can do there is
tamper with a dev queue that holds test notifications. The emulator smoke then needs no UI:
grant access via the onboarding step (screenshots), broadcast `com.android.shell` into the
watched set, `adb shell cmd notification post` a fake bank text, read the queue with
`run-as com.antonbabychp1t.cap1tal`, and prove delivered-until-acknowledged by DEV_COLLECT twice
over an unchanged queue file, then by a capture posted between DEV_COLLECT and DEV_ACKNOWLEDGE
surviving the acknowledgement. Debug logging states package
name and the watched/dropped verdict only — never title or text, so even device-local logs
hold no notification content. Alternative — a hidden dev screen — rejected: that is UI, and
the follow-up change owns all UI.

**D9. Native verification: compile in CI, behave on the emulator.**
`npm run verify` neither builds nor loads the module — the port/double/validation tests and
the untouched onboarding logic are its whole jurisdiction here, same seam
`monobank-token.test.ts` already proves. The CI `android` Gradle job (assembleDebug) compiles
the Kotlin and the merged manifest — but its change-detection filter in
`.github/workflows/ci.yml` and the `paths` frontmatter of `.claude/rules/android.md` do not
list `modules/` yet (this is the first content there), so both gain `modules/**` in this
change or the compile check would silently skip. The granted/denied answers, the watched
filter, the bound, and delivered-until-acknowledged are one scripted emulator smoke run (D8)
plus `npx expo-doctor` after the module lands, with results quoted in the task. One of those runs
must cross the JS↔native bridge for `setWatchedPackages`, `collect` and `acknowledge`: the dev
broadcasts call `CaptureStore` straight from Kotlin, so they leave `requireNativeModule` and the
`CapturedRecord` → JS conversion untested, and the adapter's own "failures are values" would
swallow a broken conversion as an empty queue for ever. Kotlin logic that can be a plain function
(bounding, JSONL encode/decode, the prefix drop) lives in `CaptureStore` methods small enough
to read as specification.

## Risks / Trade-offs

- [Android quirk: after reinstall or an update, a granted listener sometimes stays unbound
  until the toggle is flipped off/on] → `state()` reports what the OS says, the setup step
  already displays denied honestly, and the smoke script re-toggles; no code pretends
  otherwise. If it bites in practice, `requestRebind` is a later, spec-invisible addition.
- [Manifest merger conflicts with the generated app manifest] → the module's manifest adds
  only a service entry; the CI android job fails loudly if the merger objects, and the named
  fallback is a config plugin (D2).
- [A bank's payload lives in fields we do not read (sub-text, big-text styles)] → title+text
  cover the notifications banks actually post; a miss degrades to an empty-text skip (D3),
  visible on the owner's phone, and extending extraction is a change to this capability's
  spec, not a silent patch.
- [The 500 cap silently eats a burst larger than the queue] → oldest-first forgetting is the
  spec's own choice; 500 is far above any real day of bank notifications, and the loss mode
  is the same manual entry the whole feature degrades to.
- [First native module raises build friction (Kotlin version, autolinking)] → the module uses
  only `expo-modules-core` and androidx already in the tree; `expo-doctor` plus the CI job
  gate it, and `scripts/android.sh up` is the local proof.

## Migration Plan

No database, no migration, no data to move. Deploy = `expo prebuild` regenerating `android/`
with the merged manifest (the script does this) and a normal build. Rollback = delete
`modules/notification-capture/` and revert the two `src/platform/` adapters — the access
state returns to `unsupported` and the setup step returns to the not-available wording by
itself. An orphaned queue file on a device that then updates costs nothing and dies with the
app's data.

## Open Questions

- The exact monobank package name(s) on the owner's phone — `com.ftband.mono` is the Play
  Store package; confirming (and widening the refused prefix if a flavour differs) changes a
  constant and its test, not the spec (D6).
- Whether any of the owner's actual banks post only group-summary or big-text-style
  notifications — answered when real samples arrive with the follow-up change in use; the
  extraction seam (D3) is where a finding lands.
