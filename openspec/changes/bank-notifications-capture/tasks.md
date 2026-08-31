# bank-notifications-capture — tasks

> This change touches native paths (`modules/`, merged AndroidManifest). `npm run verify`
> does not cover them: the CI `android` Gradle job (assembleDebug) is the compile check —
> task 2.4 teaches it about `modules/` — and section 5 is the behaviour check on the
> emulator (rules/android.md).

## 1. The port and its pure rules

- [x] 1.1 Create `src/platform/notification-capture.ts`: the capture port (`setWatched` →
      ok / typed monobank rejection / typed cannot-work outcome; `collect` →
      `CapturedNotification[]` reusing the engine's type; `acknowledge(count)`), the pure
      validation refusing any package equal to or prefixed by `com.ftband.mono` (design
      D6), and the `inMemoryNotificationCapture` double whose seedable queue honours
      collect/acknowledge semantics and records `setWatched` calls; verify with
      `src/platform/notification-capture.test.ts` covering scenarios "A watched set naming
      monobank is refused", "Collecting without acknowledging redelivers", "After
      acknowledgement nothing returns" and "A capture during processing survives the
      acknowledgement" (double semantics downstream code will rely on), plus the same
      source-hygiene test the access port has: no react, expo or db imports in the port
      file.

## 2. The native module

- [x] 2.1 Scaffold the local Expo module `modules/notification-capture/`
      (`expo-module.config.json`, `android/build.gradle`, the Kotlin module class exposing
      `isAccessGranted` via `NotificationManagerCompat.getEnabledListenerPackages`,
      `setWatchedPackages`, `collect`, `acknowledge` — design D1, D5; no ios
      implementation); verify: `npx expo-doctor` 20/21 — the one failing check is the
      pre-existing SDK patch-version drift in `package.json`, which this change does not
      touch and the module does not add to — and `scripts/android.sh up` still builds and
      launches (native behaviour itself is proven in section 5, compile in the CI android
      job).
- [x] 2.2 Implement `CaptureStore` (design D4): `watched.json` and `queue.jsonl` under
      `noBackupFilesDir/notification-capture/`, one lock around all file access, the
      500-record bound dropping oldest on append, `collect` as read-without-removing,
      `acknowledge(count)` dropping only remembered-snapshot lines still at the head via
      temp-file-and-rename (never blind line counts), torn or unparsable lines skipped
      never thrown, and the `com.ftband.mono` prefix dropped on write (D6
      belt-and-braces); verify: compiles in the same build — the bound,
      delivered-until-acknowledged and reboot persistence are proven by smoke tasks
      5.2–5.3 against the spec scenarios "A full queue forgets the oldest first",
      "Collecting without acknowledging redelivers", "After acknowledgement nothing
      returns" and "Capture works before the app is opened". The `com.ftband.mono` drop in
      `append` stays a code-read: `cmd notification post` always posts as `com.android.shell`
      and no app with that package id exists on the emulator, so there is no way to post one.
      Accepted, because it is the second line of a defence whose first line (the drop in
      `setWatched`, proven in 5.2) already makes such a set unstorable through the module.
- [x] 2.3 Implement `CaptureListenerService` (design D2, D3, D8): the
      `NotificationListenerService` declared in the module's own `AndroidManifest.xml`
      behind `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE`, with the one-line
      "why" comment android.md asks of every permission carried in that manifest;
      `onNotificationPosted` ignores unwatched packages before writing anything, skips
      group summaries and empty title+text, and appends exactly packageName / postTime /
      title / text; the debug-only dynamically-registered receiver (`RECEIVER_EXPORTED`,
      registered only when `FLAG_DEBUGGABLE`) for `DEV_SET_WATCHED` and `DEV_DRAIN`; debug
      logging of package name and verdict only, never title or text; verify: the merged
      manifest builds (`scripts/android.sh up`, CI android job) and the filter behaviour is
      proven by smoke task 5.2 against scenarios "A watched app's notification becomes a
      captured notification" and "An unwatched app's notification leaves no trace".
- [x] 2.4 Teach the native checks about `modules/`: add `modules` to the android job's
      change-detection filter in `.github/workflows/ci.yml` (the `git diff --name-only`
      path list) and `modules/**` to the `paths` frontmatter of `.claude/rules/android.md`;
      verify: the filter line names `modules` and the next push's android job runs instead
      of skipping (quote the job's run in the task summary when it lands — the push is the
      owner's call, so that half is still outstanding; the local `scripts/android.sh build`
      on JDK 21 is what has compiled the module so far, and CI's android job uses JDK 17).
      `.gitignore` also gains `modules/*/android/build/` and `.gradle/`, or `git add modules/`
      commits the Gradle output beside the seven source files.

## 3. The device adapters

- [x] 3.1 Create `src/platform/notification-capture-device.ts` (design D7): resolves
      `NotificationCapture` lazily inside each call in a try/catch; on non-Android
      platforms or when the module is absent, `collect` answers `[]`, `acknowledge`
      answers quietly and `setWatched` answers the typed cannot-work outcome — scenarios
      "Collecting where capture cannot work yields nothing" and "Telling the watched set
      where capture cannot work is a typed outcome"; verify: `npm run verify` green
      (typecheck covers the adapter; no vitest loads it) and section 5 exercises the Android
      side. Web bundling cannot be the other half after all: `npx expo export --platform web`
      fails identically at HEAD (expo-sqlite's `wa-sqlite.wasm` does not resolve through this
      Metro config), so the non-Android branch rests on `Platform.OS !== 'android'` read, plus
      the scenario test against the double.
- [x] 3.2 Update `src/platform/notification-access-device.ts` exactly as its comment
      promised: `state()` asks the module's `isAccessGranted` and answers
      `granted`/`denied`, keeps `unsupported` when the module cannot be resolved;
      `openSettings` and the port type unchanged, `src/ui/onboarding.ts` untouched; verify:
      `npm run verify` green with the existing onboarding and access-port tests unmodified,
      and smoke task 5.1 shows the real answers — scenarios "Granting flips the answer to
      granted", "Revoking flips the answer back to denied" and "A platform without the
      permission says so" (web keeps answering unsupported).

## 4. Docs

- [x] 4.1 Update the step-8 status row in `docs/tech-task.md`: the native listener and the
      permission flow are done by this change; persistence and UI remain for
      `bank-notifications-screen`; verify: `npm run verify` green (openspec validate reads
      the tree) and the row names exactly what remains.

## 5. Emulator smoke (manual, scripted — rules/android.md)

- [x] 5.1 Permission flow: `scripts/android.sh up`, open the first-run setup view — the
      notification step reads as still to do and offers its action; tap it, land on
      Android's «Доступ до сповіщень», grant, return — the step reads as done; revoke in
      system settings, return — still to do again; attach `scripts/android.sh shot`
      screenshots for each state (spec scenarios "Granting flips the answer to granted" and
      "Revoking flips the answer back to denied", plus first-run-setup's "A grantable
      permission offers the system screen" and "A granted permission reads as done" now
      reachable on a device).
- [x] 5.2 Capture flow with access granted: post a shell notification before any watched
      set is broadcast and show the queue file absent/empty ("Nothing is captured before
      any set was given"); broadcast `DEV_SET_WATCHED` with `com.android.shell` **and**
      `com.ftband.mono` and show `watched.json` holds only the shell package ("A stored
      watched set naming monobank still captures nothing" — the Kotlin-side drop, since
      the broadcast bypasses the TypeScript refusal); post a fake bank text via
      `adb shell cmd notification post` and show the queue holds exactly the four fields
      ("A watched app's notification becomes a captured notification"); broadcast
      `DEV_DRAIN` twice — logcat shows count 1 then 0 ("After acknowledgement nothing
      returns"); record the commands and output in the task summary.
- [x] 5.3 Persistence across restart: with the watched set in place, `adb reboot` the
      emulator, post a shell notification before launching the app, and show the queue
      holds it ("Capture works before the app is opened").
- [x] 5.4 Delivered-until-acknowledged, on the device rather than in the double (the
      diff-reviewer's finding: `DEV_DRAIN` collects and acknowledges in one breath, so it
      cannot tell a waiting queue from one that empties itself on being read). With
      `DEV_COLLECT` and `DEV_ACKNOWLEDGE` split (design D8): collect twice over an unchanged
      queue file — "Collecting without acknowledging redelivers" — then post a notification
      between the collect and the acknowledgement and show the queue left holding exactly the
      newer record — "A capture during processing survives the acknowledgement".
- [x] 5.5 The JS↔native bridge itself: the dev broadcasts call `CaptureStore` straight from
      Kotlin, so `requireNativeModule` and the `CapturedRecord` → JS conversion were untested
      and the adapter would swallow a broken conversion as an empty queue. Prove it once with
      temporary instrumentation in `src/app/_layout.tsx` calling
      `notificationCapture.setWatched/collect/acknowledge`, quote the `ReactNativeJS` log, and
      revert the instrumentation (nothing in production code calls the port until
      `bank-notifications-screen`).

### What the smoke runs showed (emulator-5554, Pixel_10_Pro, API 37)

5.1 — the build is listed on «Доступ до сповіщень» as "cap1tal" (screenshot), and after the
grant `settings get secure enabled_notification_listeners` ends with
`com.antonbabychp1t.cap1tal/expo.modules.notificationcapture.CaptureListenerService`. The step
read «ще не зроблено» + «Надати доступ» before, «готово» + «Налаштування доступу» after, and
«ще не зроблено» + «Надати доступ» again once the toggle was switched off. (The setup view
re-asks on mount and on «Оновити стан»; returning from system settings needs that tap, which is
`first-run-onboarding`'s screen, not this change.)

5.2 — with no watched set ever given, a posted notification left no `no_backup/notification-capture/`
directory at all. Then:

```
$ adb shell am broadcast -a com.antonbabychp1t.cap1tal.DEV_SET_WATCHED \
    --esa packages com.android.shell,com.ftband.mono
$ adb shell run-as com.antonbabychp1t.cap1tal cat no_backup/notification-capture/watched.json
["com.android.shell"]
$ adb shell "cmd notification post -t 'Оплата' cap1tal-smoke 'Картка *1234, 125.50 UAH, СІЛЬПО'"
$ adb shell run-as com.antonbabychp1t.cap1tal cat no_backup/notification-capture/queue.jsonl
{"packageName":"com.android.shell","postedAt":1788189677654,"title":"Оплата","text":"Картка *1234, 125.50 UAH, СІЛЬПО"}
D NotificationCapture: com.android.shell: captured
D NotificationCapture: com.android.shell: group summary, dropped
D NotificationCapture: dev: drained 4, waiting 0
D NotificationCapture: dev: drained 0, waiting 0
```

While `com.android.shell` was not in the watched set, two posted notifications (both live in
`cmd notification list`) left `queue.jsonl` at 0 bytes, with the service proven alive by the
drains either side. Seeding the queue to its bound and posting one more:

```
$ adb shell run-as com.antonbabychp1t.cap1tal wc -l no_backup/notification-capture/queue.jsonl
500 …                                    # after one more capture: still 500
$ … head -1   {"…","postedAt": 1001, "title": "seed", "text": "seed 1"}    # "seed 0" is gone
$ … tail -1   {"packageName":"com.android.shell",…,"text":"Картка 1111, 1.00 UAH, ПОНАД МЕЖУ"}
```

5.3 — after `adb reboot`, with `dumpsys activity activities` showing no activity of ours and the
process alive only for `CaptureListenerService`, a posted notification was captured:

```
D NotificationCapture: com.android.shell: captured
$ adb shell run-as com.antonbabychp1t.cap1tal cat no_backup/notification-capture/queue.jsonl
{"packageName":"com.android.shell","postedAt":1788189759144,"title":"Оплата","text":"Картка 9876, 300.00 UAH, ЕПІЦЕНТР"}
```

5.4 — collect and acknowledge apart:

```
D NotificationCapture: dev: collected 1, waiting 1     # DEV_COLLECT, queue file unchanged
D NotificationCapture: dev: collected 1, waiting 1     # DEV_COLLECT again — redelivered
D NotificationCapture: com.android.shell: captured     # a capture during "processing"
D NotificationCapture: dev: acknowledged 1, waiting 1  # DEV_ACKNOWLEDGE
$ adb shell run-as com.antonbabychp1t.cap1tal cat no_backup/notification-capture/queue.jsonl
{"packageName":"com.android.shell","postedAt":1788193974567,"title":"Оплата","text":"ДРУГА, 20.00 UAH"}
```

5.5 — the bridge, from JavaScript through `notification-capture-device.ts` into the module
(`ReactNativeJS` logcat; the instrumentation that produced it was reverted afterwards):

```
'CAP mono:', '{"kind":"refused","packages":["com.ftband.mono"]}'
'CAP watch:', '{"kind":"ok"}'
'CAP collect#1:', '[{"title":"Оплата","text":"Картка 4321, 77.00 UAH, СІЛЬПО","postedAt":1788193887493,"packageName":"com.android.shell"}]'
'CAP collect#2:', '[{"title":"Оплата","text":"Картка 4321, 77.00 UAH, СІЛЬПО","postedAt":1788193887493,"packageName":"com.android.shell"}]'
'CAP collect#3 after ack:', '[]'
```

## 6. Verification

- [x] 6.1 Run `npm run verify` and paste the final lines

```
 Test Files  63 passed (63)
      Tests  957 passed (957)
✔ verify passed (e453c67429b0c22e4d1ae3d8197ba27ef8a05a50)
```

- [x] 6.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS — **PASS, 0 critical,
      8 warnings**. Fixed from the review: `notification-access.test.ts` now names
      «Scenario: Granting flips the answer to granted» and
      «Scenario: Revoking flips the answer back to denied» verbatim, as rules/testing.md asks.
      Left standing, each a known cost rather than a defect:
      - the CI `android` job has still never run for `modules/**` — the filter is in place (2.4)
        but the run needs a push, which is the owner's call. Local `scripts/android.sh build`
        (JDK 21) is the only compile so far; CI uses JDK 17.
      - `CaptureStore.append`'s monobank drop stays a code read (task 2.2 records why: no way to
        post as `com.ftband.mono` on the emulator). Its first line of defence, the drop in
        `setWatched`, is proven on the device in 5.2.
      - the two "capture cannot work" scenarios assert the in-memory double, not
        `notification-capture-device.ts` — the same seam `monobank-token` already accepts.
      - §5.2's pasted logcat is a collage across runs: the prose says "count 1 then 0" while the
        line reads `drained 4, waiting 0`. The conclusion holds (N → 0 → 0), the transcript is not
        contiguous.
      - `src/notifications/draft.ts` `addWatch` still accepts a `com.ftband.mono*` package into the
        domain watch list; D6 put the refusal at the port. Nothing calls either path yet —
        `bank-notifications-screen` must route every watch through the port.

### Re-smoke after the change was committed (2026-08-31, emulator-5554, Pixel_10_Pro, API 37)

The diff-reviewer's warning about §5.2 was fair: that block is a collage across runs. This run
redid the reachable scenarios as one contiguous transcript each, on the installed build, with the
`DEV_COLLECT` / `DEV_ACKNOWLEDGE` split. Screenshots in
`.cache/android/smoke/bank-notifications-capture/`. No defects; `logcat -s AndroidRuntime:E` empty.

- **Granting / revoking** — at launch `settings get secure enabled_notification_listeners` ended
  with `…/expo.modules.notificationcapture.CaptureListenerService` and the step read «готово» +
  «Налаштування доступу»; the system screen listed **cap1tal** under *Allowed*. Toggled off →
  the setting no longer names the service → «Оновити стан» flipped the step to «ще не зроблено» +
  «Надати доступ». Re-granted through the app's own action → «готово» again. Both directions agree
  with the operating system's own answer.
- **A stored watched set naming monobank still captures nothing** — the broadcast carrying
  `com.android.shell,com.ftband.mono` left `watched.json` as `["com.android.shell"]`. The other
  half (a notification posted *by* `com.ftband.mono`) stays unreachable for the reason task 2.2
  records: `cmd notification post` always posts as `com.android.shell`.
- **A watched app's notification becomes a captured notification** — queue at 0 bytes before,
  and after the post exactly
  `{"packageName":"com.android.shell","postedAt":1788199231712,"title":"Оплата","text":"Картка *1234, 125.50 UAH, СІЛЬПО"}`.
- **Collecting without acknowledging redelivers** — `DEV_COLLECT` twice, `collected 1, waiting 1`
  both times, with `md5sum` of `queue.jsonl` identical (`841353374b…`) either side. The md5 is the
  part the old evidence was missing.
- **After acknowledgement nothing returns** — `acknowledged 1, waiting 0`, then
  `collected 0, waiting 0`, queue back to 0 bytes.
- **An unwatched app's notification leaves no trace** — with the watched set pointed elsewhere, a
  posted notification reached the shade (`cmd notification list` shows it) while the queue stayed
  at 0 bytes, `DEV_COLLECT` reporting 0 either side to prove the service was alive.

Not re-exercised this run (the earlier evidence stands): the 500 bound, the reboot, "a capture
during processing", and "nothing is captured before any set was given" — that last one needs the
app-data wipe, which would have cost unrelated in-flight state on the device.
