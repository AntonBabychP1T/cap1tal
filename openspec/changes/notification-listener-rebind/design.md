## Context

See proposal.md — Why. The one fact the approach turns on: `NotificationManagerCompat
.getEnabledListenerPackages` answers from Android's *settings*, and the listener being enabled
there is not the same fact as the listener being *bound*. `NotificationListenerService` has the
second fact and only the second fact: `onListenerConnected` runs when the system binds it,
`onListenerDisconnected` when it lets go. Nothing else in the app can observe it.

Two constraints shape everything below. `npm run verify` is Node-only — it loads no native
module and no React Native — so every rule that can be a pure function must be one, and the
device adapters (`*-device.ts`) stay dumb enough that reading them is proof enough. And the
capture module holds the text of every notification the owner's phone has shown, so nothing added
to it may read, store or log content.

The four surfaces that ask about access today are `src/app/_layout.tsx` (the collect path),
`src/app/manage/notifications.tsx` (the section, on focus and on foreground),
`src/app/onboarding.tsx` (the «Перші кроки» step) and, through `reportCollection`, the
сповіщення про збій. All four go through one port and one value.

**Re-applied onto main (2026-10-06).** This change was first built and smoke-tested on a branch
that fell 91 commits behind and was never merged; main carried none of it. It is brought back by
hand against main's current code, which differs from that branch in three places that matter
here:

- `notification-access-device.ts` now wraps the answer in `journalled(read())` through
  `journalPermission` (`src/ui/device-journal.ts`, bug-report's "The журнал records the device's
  own half"). `read()` becomes async because of the rebind wait, so `state()` journals
  `await read()` — see D9.
- `CaptureListenerService.onNotificationPosted` now routes through `NudgeRule` (capture, nudge or
  drop). The connection callbacks sit beside it and touch none of that routing.
- `_layout.tsx` grew a great deal around the collect effect, but the gate itself is the same
  `if (access !== 'granted')`, so D5 applies unchanged.

## Goals / Non-Goals

**Goals:**

- The app never says «Доступ до сповіщень надано» while the capture layer is deaf.
- The ordinary case — an update or a reinstall — repairs itself without the owner opening
  Android's settings, and without a сповіщення про збій for a state that lasted a second.
- Everything provable without a phone stays provable under `verify`; the native half is one
  emulator scenario.

**Non-Goals:**

- Restoring the notifications missed while the listener was deaf. They are gone from the app's
  reach; Android does not replay them, and the degradation is the same manual entry the whole
  feature degrades to.
- A background watchdog. The app asks and repairs when it runs, which is when the owner is there
  to be told; a periodic job would be a new permission and a new battery cost for a state that
  only ever changes because of something the owner did.
- Detecting a *partially* working listener (bound but Android silently filtering). Not
  observable, and not what bit.

## Decisions

### D1 — The bound flag is process-scoped, never a file

`CaptureStore` keeps every other fact in a file precisely because the listener runs when the app
does not. This one flag is the opposite: it must be memory, and a file would be a bug.

A binding keeps the process alive and dies with it. So a flag in memory cannot be stale — it
describes the process it lives in, and a process that was killed comes back saying "not bound"
until `onListenerConnected` says otherwise, which is exactly the truth. A flag on disk would
outlive the process it describes and answer "bound" after a «Force stop» — the precise failure
this change exists to end, reintroduced one layer down.

The listener service and the module's functions run in one process, so one `@Volatile` field is
the whole of it. It holds a boolean and no notification content, so the privacy assertions in
`notification-capture.test.ts` are unaffected.

### D2 — The fourth answer lives on `NotificationAccess`, not on a second port

`NotificationAccess` becomes `'granted' | 'denied' | 'unsupported' | 'not-listening'`.

Every consumer already switches on exactly one value, and every one of them wants the combined
answer rather than the permission bit: the section, the setup step, the collect gate and
`reportCollection` all mean "can сповіщення be read right now?". A parallel `listening()` on the
capture port would have to be threaded to all four and combined correctly at each — four places
to get it wrong, none of them the port. One value, one place.

Alternatives rejected: a `listening()` method on `NotificationCapturePort` (four call sites to
combine it at, and the section would still need both); a boolean flag beside the access state
(the same problem, unnamed).

`notificationAccessFrom(enabled, listening)` stays the pure mapping and gains the second fact, so
the answer the device adapter produces is asserted under `verify` even though that adapter can
never be loaded there. The second argument is `boolean | undefined`, not a named union, because
`notification-access.test.ts` asserts the port imports *nothing* — that guard is worth more than
a nicer parameter type, and `undefined` already means "the device cannot say" for the first
argument.

### D3 — Asking is what repairs: the reconnect lives in the access adapter's `state()`

`requestRebind` is called from `notification-access-device.ts`, on the granted-but-not-listening
path, and nowhere else.

Every surface that asks about access is a surface that wants it working, so the repair belongs
where the question is answered: opening «Сповіщення банків», opening «Перші кроки», opening the
app and returning to the foreground all now attempt it whenever it is needed, and none of them
had to be edited. It is asked for only on the path that needs it — a bound listener is never
told to rebind, which is why the spec says WHEN it is not receiving rather than whenever. A
query with a side effect is a real cost, and it is paid on purpose — it is written on the
function, and the side effect is idempotent, content-free and invisible when the listener is
already bound (it is not even called then).

Alternatives rejected: calling it from Kotlin inside `isAccessGranted()` — the same side effect,
hidden one layer further down, in the file that must stay obviously content-free; and an explicit
call from `_layout.tsx` before `drainCaptures` — that repairs the drain only, leaving the section
and the setup step to report a deaf listener they could have fixed.

### D4 — A bounded grace before answering "not listening"

`requestRebind` returns immediately; the bind lands later, on the main thread, after our call has
returned. Answering straight away would report `not-listening` for every rebind that is about to
succeed, raising a сповіщення про збій that clears itself on the next foreground — noise about a
problem that was already fixed.

So the adapter, and only on the path where the listener is not bound, asks for the rebind, waits
`REBIND_GRACE_MS` (600 ms) and asks once more. Bounded, on the unhappy path only, and never on
the ordinary open where the listener is already connected. The spec says the same thing in the
language of behaviour: the not-receiving answer is reported "only for a state that outlives that
request".

600 ms is a compromise between an owner waiting on a screen and a system server round trip. If
the emulator shows it is not enough, the constant moves; the spec does not.

### D5 — The collect gate names the two answers that stop it

`_layout.tsx` changes from `if (access !== 'granted') return` to returning only on `denied` and
`unsupported`. A deaf listener still has a queue — everything it heard before it fell silent —
and those are транзакції the owner cannot recover any other way once the queue is bounded out.
`reportCollection` then receives `not-listening` and raises the сповіщення, because it already
raises for anything that is not `granted`.

This is also why the new state is reported *after* the drain rather than instead of it: the
owner gets both the records and the warning.

### D6 — "Cannot say" maps to granted, not to silence

A build whose module resolves but throws, an older device, a double that was told nothing: none
of them has said the listener is deaf. They map to `granted`, the same way `installedAmong`
answers `'unknown'` rather than "none". An unanswered question that emptied the picker would be
the worse mistake there; here it would be a сповіщення про збій on every open of a build that is
working fine.

### D7 — Two files that deliberately do not change

`src/ui/onboarding.ts` reads `access === 'granted' ? 'done' : 'todo'` and `src/ui/alerting.ts`
reads `access !== 'granted'`. The fourth answer falls on the correct side of both: the setup step
becomes «to do» with the action that opens Android's screen, and the сповіщення про збій is
raised. That is not luck — it is why the state was added to this type rather than beside it (D2)
— but it is invisible in a diff, so both get a test that pins the behaviour rather than a comment
that claims it.

### D8 — Where each half is proven

Under `verify`: the mapping (`notificationAccessFrom` with both facts), the section wording
(`accessSection('not-listening')`), the setup step, the alert, and the collect gate's shape in
`notifications-screen.test.ts` — read from the source, as the two existing gate assertions
already are.

The one rule that is neither pure nor visible in a screen is the adapter's order — ask, request
the rebind, wait, ask again, and answer `granted` from every `catch`. It is held the same
structural way, by reading `notification-access-device.ts` as text in
`notification-access.test.ts`. Reading a file is not loading it, so `verify` stays Node-only;
what this catches is the edit that drops the second ask and turns every slow bind into a
сповіщення про збій.

On the emulator: that `onListenerConnected` actually sets the flag, that a listener disabled and
re-enabled comes back, and that the app reports «не читаються» for a listener that is enabled and
unbound. The last one is reproducible with `adb shell am force-stop`, which is how the owner's
phone got into it.

### D9 — The журнал learns the fourth answer by name, and only the settled one

`journalPermission(NOTIFICATION_ACCESS, answer)` already writes the device's enumerated answer
on a change of state, so `not-listening` becomes an entry in its own name with no new code in
`device-journal.ts`: «granted» → «not-listening» → «granted» is the silence, timed, in a репорт
про помилку — which is precisely what the 2026-09-07 report lacked. A test in
`device-journal.test.ts` pins that the fourth answer is a distinct entry and that repeats add
nothing.

What reaches the журнал is the *settled* answer: `state()` is `journalled(await read())`, and the
rebind and its grace happen inside `read()`. A rebind that succeeds inside the grace is therefore
one `granted`, never a `not-listening` followed by a `granted` about a silence that lasted 600 ms.
Pinned by reading the adapter's source, as the journal test already does for the call itself.

No bug-report delta: that requirement already says the entry names "the device's own enumerated
answer" for notification access; it gains a value, not a rule.

`NOTIFICATION_LISTENER` (`connected` / `disconnected`) is left as it is on main — it records
whether the native module resolved at all, not the binding — and is not repurposed here; the
binding is carried by the access answer, which is the one every surface reads (D2).

## Risks / Trade-offs

- [`requestRebind` does not always work — the platform bug it is a workaround for] → this is why
  the state is *reported* as well as repaired. The owner is told what to do (toggle off and on)
  rather than left with a button that quietly does nothing.

  Measured on the emulator (Pixel 10 Pro, API 37, smoke of 2026-09-08, on the original
  branch): after `am force-stop` it
  does **not** work. The system drops the component from its live listener set while leaving it in
  the `enabled_notification_listeners` setting — Android's own screen lists the app under "Not
  allowed" while `getEnabledListenerPackages` still names it, which is the lie in its purest form
  — and the rebind request does not bring it back. Switching the access off and on does. So on
  this platform the repair half buys nothing for the force-stop case and the reporting half is
  what carries the fix, which is the split the design was built around. The request stays: it is
  free, it is the documented remedy, and an update or a reinstall is a different path from a
  forced stop.
- [`onListenerConnected` not called on some OEM builds, leaving the flag false forever] → the app
  would say «не читаються» while capture works, which is a false alarm rather than false silence:
  the safer direction of the two, visible immediately on the owner's own phone, and the drain
  still runs (D5), so no транзакція is lost. Smoke task 6.3 is what would catch it.
- [The 600 ms grace on a cold start where the system binds slower than that] → one сповіщення
  про збій that clears on the next foreground. Bounded noise, and preferable to the alternative
  failure, which is silence.
- [A query with a side effect (D3) surprises a later reader] → named on the function and in the
  port's documentation, and it is the only one in `src/platform/`.
- [`_layout.tsx`'s gate is asserted by reading source text, so a refactor breaks the test without
  breaking the app] → already the shape of the two assertions beside it; the alternative is
  running JSX under `verify`, which the whole `src/ui/` split exists to avoid.

## Migration Plan

No database, no migration, no data to move, no new permission and no new dependency. Deploy is
`expo prebuild` regenerating `android/` and a normal build — `scripts/android.sh up` does both.

Rollback is the revert: the flag and the two module functions disappear, `notificationAccessFrom`
loses its second argument, and the access state returns to the three answers it has today.
Nothing persisted changes, so a downgrade needs no cleanup.
