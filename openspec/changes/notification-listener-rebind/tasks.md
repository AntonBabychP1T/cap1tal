# notification-listener-rebind — tasks


Re-applied by hand onto main on 2026-10-06 from the unmerged branch `claude/lucid-dirac-faf60c`
(commits 557c77d, 6a45508). Boxes 1–5 are ticked for the work now in this tree; the review and
the smoke are open again, because the earlier ones ran against a different base.

## 1. The port and its pure rule

- [x] 1.1 In `src/platform/notification-access.ts`, add `'not-listening'` to `NotificationAccess`
      and a second argument to `notificationAccessFrom(enabled, listening)` — `boolean |
      undefined`, where `undefined` is "the device cannot say". The order of the answers is the
      rule: nothing to switch on is `unsupported`, switched off is `denied`, switched on and
      known deaf is `not-listening`, everything else is `granted` (design D2, D6). Keep the file
      import-free — `notification-access.test.ts` asserts it. Verify with that file, extending it
      to cover the `bank-notifications-capture` scenarios "A switched-on capture layer that hears
      nothing is not reported as granted", "A reconnected capture layer reads as granted" and "A
      device that cannot say is not reported as silent", and asserting that the double answers
      `'not-listening'` like every other state.

## 2. The Kotlin half

- [x] 2.1 In `CaptureStore.kt`, add the process-scoped listening flag: a `@Volatile` boolean with
      a setter and a reader, and the comment saying why it is memory and never a file — a file
      would outlive the process it describes and answer "bound" after a «Force stop», which is
      the very failure this change ends (design D1). It holds a boolean and no notification
      content. Nothing here can be proven in Node: the flag's behaviour is smoke 6.3.
- [x] 2.2 In `CaptureListenerService.kt`, override `onListenerConnected` and
      `onListenerDisconnected` to set that flag true and false. Nothing else: no content, and the
      existing log lines are untouched. That these callbacks actually run — the whole premise of
      the change — is smoke 6.3's first two scenarios and is provable nowhere else.
- [x] 2.3 In `NotificationCaptureModule.kt`, add `Function("isListening")` reading the flag and
      `Function("requestRebind")` calling `NotificationListenerService.requestRebind(
      ComponentName(context, CaptureListenerService::class.java))` — API 24, and the module's
      `minSdkVersion` is 24, so no version guard. Update the module's header comment, which says
      "five calls". Verify with `npm run verify`: `notification-capture.test.ts` reads every
      Kotlin source as text and fails on an import outside `android.` / `androidx.` /
      `expo.modules.` / `java.io.File` / `org.json.` — the two new imports are `android.content
      .ComponentName` and `android.service.notification.NotificationListenerService`.

## 3. The device adapters

- [x] 3.1 In `src/platform/notification-capture-device.ts`, add `isListening(): boolean` and
      `requestRebind(): void` to the `NativeNotificationCapture` interface. Nothing else in that
      file changes — the capture port keeps its four methods (design D2).
- [x] 3.2 In `src/platform/notification-access-device.ts`, make `state()` ask the second question:
      not granted answers as it does today; granted and listening is `granted`; granted and deaf
      asks for the rebind, waits `REBIND_GRACE_MS` (600 ms) and asks once more before answering
      (design D3, D4). Every native call stays inside a `try` whose `catch` means "the device
      cannot say" — `undefined` for the listening fact, so a module that throws reads as `granted`
      and not as a false alarm (design D6). Update the file's header comment, which currently says
      the answer is "whatever the operating system's own list of enabled listeners says". Verify
      with `src/platform/notification-access.test.ts`, which already reads a source file as text:
      a new block reads `notification-access-device.ts` and holds its order — the rebind is asked
      for, the listening fact is read again after it, and `notificationAccessFrom` is the only
      thing that decides the answer — which is what makes the `bank-notifications-capture`
      scenario "A switched-on capture layer that hears nothing is not reported as granted" true of
      a real state rather than of a passing instant (design D8). Reading is not loading: `verify`
      stays Node-only.

- [x] 3.3 Keep the журнал truthful about the fourth answer (design D9): `state()` journals
      `await read()`, so the rebind and its grace settle before `journalPermission` sees the
      answer. Verify with `src/ui/device-journal.test.ts`: `not-listening` is an entry of its own
      between two `granted`, repeats add nothing, and the adapter's source journals the awaited
      read.

## 4. What the owner sees

- [x] 4.1 In `src/ui/notification-settings.ts`, give `accessSection` its `not-listening` branch:
      a status saying сповіщення are not being read and that switching the access off and on
      again in the system settings restores it, the same «Налаштування доступу» way to that
      screen, and `manageable: true` — the watched apps are unaffected and hiding them would hide
      what the owner came to check. Verify with `src/ui/notification-settings.test.ts` covering
      the `bank-notifications-screen` scenario "A switched-on but silent capture layer is
      reported and explained".
- [x] 4.2 Pin the two behaviours that fall out of the existing code rather than from an edit
      (design D7): in `src/ui/onboarding.test.ts`, that the setup step for `'not-listening'` is
      «to do» and still offers the action that opens the system screen; in
      `src/ui/alerting.test.ts`, the `bank-notifications-screen` scenario "A capture layer that
      stopped receiving is announced" — `reportCollection({ access: 'not-listening', watched:
      true, failed: false })` raises one `alert:collection` and a second call in the same state
      adds no second one.

## 5. The collection

- [x] 5.1 In `src/app/_layout.tsx`, change the collect gate to return only on `'denied'` and
      `'unsupported'`, so a deaf listener's queue is still drained and the state is still reported
      afterwards (design D5). Update the header comment on the effect, which says "no access, no
      collection". Verify with `src/ui/notifications-screen.test.ts`, whose gate assertion moves
      to the new shape and stays as strong — it must still prove that the two answers that cannot
      collect return before `drainCaptures` — and covers the `bank-notifications-screen` scenario
      "What was captured before the silence is still collected".

## 6. The gate and the phone

- [x] 6.1 Run `npm run verify` and paste the final lines.
- [ ] 6.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS.
- [ ] 6.3 Smoke on the emulator (`scripts/android.sh`, `.claude/rules/android.md`), the change
      being native: the app reports «надано» with the listener bound; `adb shell am force-stop`
      then reopening reports the deaf state or repairs itself through the rebind; disabling and
      re-enabling «Доступ до сповіщень» comes back to «надано»; a watched app's notification
      posted after the repair still becomes a чернетка; and the журнал (`native
      notification-access`) shows `not-listening` once and then `granted`.

      The original branch's run (2026-09-08, Pixel 10 Pro API 37) passed all four of the first
      scenarios and measured that `requestRebind` does not restore the binding after a
      force-stop — only toggling the access does (design, Risks). Expect the same here: the
      section's «не читаються» wording is the fix on that path.
