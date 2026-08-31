# bank-notifications-capture — proposal

## Why

The `bank-notifications` engine is done: given a captured notification record, pure TypeScript
turns it into a чернетка or an auto-confirmed витрата. But no record is ever captured — the
build installs no notification listener, so Android does not even list the app on its
notification-access screen, and the setup step honestly answers "not available yet". FR-S3
(tech-task §5, step 8: "нативний Android listener, persistence, permission flow та UI" still
missing) stays closed on both product questions — whole banks are still absent from "where the
money went" — until the phone actually hands notifications to the engine. This change is the
Android integration itself: the listener, the real permission answers, and the on-device path
from a posted notification to the engine's `CapturedNotification`, split off from the screens
and storage exactly as engine/screen splits worked for steps 6–8.

## What Changes

- **New capability `bank-notifications-capture`** — the platform capture layer between
  Android and the engine:
  - **The build becomes grantable.** The app installs a notification listener, so it appears
    on Android's «Доступ до сповіщень» system screen and notification access can actually be
    granted. The existing access port stops hard-coding `unsupported`: on Android it answers
    `granted` or `denied` from the device's own state; on a platform with no such permission
    (web today, iOS until it ever gains one) it keeps answering `unsupported`. The
    first-run-setup step needs no spec or UI change — its spec already says what a grantable
    build shows for each answer; this change makes those scenarios reachable on a device.
  - **Capture of watched apps only.** While access is granted, a notification posted by a
    watched app is captured on the device as exactly the record the engine defined — package
    name, posted moment, title, text. An app that is not watched leaves no trace: not parsed,
    not stored, not counted — the privacy line the engine's spec already draws, enforced at
    the capture layer where the data first appears. The capture layer is told the current set
    of watched packages and remembers it on the device, so filtering holds even when the app's
    TypeScript has not run since the phone booted. Until the owner has watched anything —
    which today means until `bank-notifications-screen` ships the picker — the set is empty
    and nothing is captured at all.
  - **A local capture queue that loses nothing it accepted.** Captured records wait on the
    device (vision §12 names this queue) until the app collects them, surviving the app
    process not running; the queue is bounded, and when full it forgets oldest-first rather
    than failing — a stale notification degrades to the owner typing by hand, which is the
    engine's own degradation story. Collecting removes nothing by itself: a captured record
    waits until the app acknowledges it as safely taken, so a crash between collecting and
    storing loses nothing, and a redelivered record dies at the engine's own fingerprint
    dedup. Nothing captured ever leaves the device, and the queue is no part of any export
    or backup.
- **The monobank package is never watchable.** The capture layer refuses to watch the
  monobank app package — the exclusion `bank-notifications` made a named obligation on the
  follow-up lands here, at the layer every future picker must go through, instead of waiting
  in a screen.

Non-goals (deliberate, they stay for `bank-notifications-screen`):

- No watched-app picker, no Налаштування section, no чернетки on Головний, no confirmation
  UI: nothing here renders.
- No persistence of watches, fingerprints or чернетки, no migrations, no repos: this change
  ends where a `CapturedNotification` is handed to TypeScript; wiring it into
  `processCapture` and storing the outcome is the screen change's atomic-commit story.
- No per-bank parsers (still waiting on real samples), no SMS and no other banks' APIs
  (vision §14.7), no remote push (§14.14).
- No iOS listener: iOS has no notification-access permission to grant, and §14.15 keeps iOS
  buildable, not featureful — the port answers `unsupported` there, which the setup step
  already displays honestly.

## Capabilities

### New Capabilities

- `bank-notifications-capture`: the on-device capture layer — the build is grantable and
  reports the real notification-access state per platform; while granted, watched apps'
  notifications (and only theirs) are captured as the engine's record into a bounded local
  queue that survives the app not running; the app collects each record exactly once; the
  monobank package cannot be watched; nothing captured leaves the device or enters a backup.

### Modified Capabilities

<!-- none: first-run-setup (in-flight change first-run-onboarding) already specifies both the
     grantable and the unsupported build — this change moves devices from one already-specified
     world to the other. The bank-notifications engine spec is untouched: its input record and
     its watched-app privacy rule are what this capability implements against. -->

## Impact

- **New native module** (the one android.md requires a design.md to name — see design D2): a
  local Expo module under `modules/`, Android-only Kotlin — a `NotificationListenerService`,
  the on-device queue and watched-package store, and the small API the port calls. First
  native module in the repo; `android/` stays generated, nothing is hand-edited.
- New code: `src/platform/notification-capture.ts` — the port (watched packages down,
  captured records up) with its in-memory double, plus the device adapter beside it; the
  existing `src/platform/notification-access-device.ts` starts asking the module instead of
  returning the hard-coded `unsupported` (its port type and `src/ui/onboarding.ts` are
  untouched, as its own comment promised).
- `npm run verify` stays Node-only and green without the module: ports and doubles are pure
  TypeScript, and no test loads the native side — same seam `monobank-token` already proves.
- Native verification is explicit, per android.md: the CI `android` Gradle job compiles the
  listener; the granted/denied flow and a real capture are a manual emulator smoke test
  (`scripts/android.sh`, `adb shell cmd notification post`) with screenshots. The android
  job's change-detection filter (`.github/workflows/ci.yml`) and the android.md rule's
  `paths` do not know `modules/` yet — this change adds `modules/**` to both, or the job it
  leans on would silently skip for exactly the files it introduces.
- No schema change, no migration, no new npm dependency expected; `app.json` changes only if
  the module's own manifest cannot declare everything (design decides and names it).
