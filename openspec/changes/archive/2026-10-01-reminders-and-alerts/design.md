# reminders-and-alerts — design

## Context

See proposal.md — Why. What shapes every decision below:

- **The app has never posted a notification.** It has only ever *read* them: `modules/
  notification-capture/` and `src/platform/notification-access.ts` are the incoming direction, and
  they share nothing with this change but a vocabulary. Nothing in the repo schedules anything.
- **`npm run verify` is Node-only and under a minute.** It never loads React Native and never
  loads a native module. Anything that decides — when to schedule, whether to raise, what the words
  are, where a tap leads — has to be a pure function over injected values, or it is not proven.
- **The repo's platform idiom is settled.** A device capability sits behind a port in
  `src/platform/` with an in-memory double beside it and a `-device.ts` adapter `verify` never
  loads; failures are values, never exceptions (`monobank-token.ts`, `notification-access.ts`,
  `backup-file.ts`). This change adds one more port of exactly that shape.
- **`android/` is generated and never hand-edited**, every native need is expressed in `app.json`
  or a config plugin, and a new dependency is named in a design before it is added
  (`.claude/rules/android.md`). This change adds one dependency and one permission.
- **Committed migrations are immutable** (`.claude/rules/database.md`): a table's CHECK constraints
  are decided once, and widening one later means rebuilding the table.
- **`backup-file` (step 11) enumerates what a бекап holds** in `src/backup/format.ts` and asserts
  `BACKUP_SCHEMA_VERSION` against the migration journal. A new migration fails `verify` until this
  change sorts its two tables into that list — which is exactly the tripwire step 11 built.
- **Money and the domain are untouched.** Nothing here reads a сума, computes a місячна картина or
  writes a транзакція. It reports that something failed, and it says nothing about what.

## Goals / Non-Goals

**Goals:**

- Every decision — is the нагадування arranged for the right time, does this failure raise
  anything, what does it say, where does it lead, is one already outstanding — provable under
  Vitest in Node, with no clock, no device, no emulator.
- Make the privacy promise a property of the code rather than a habit: a notification's words
  cannot carry a сума because there is nowhere to put one.
- One seam for step 12: `google-drive-backup` adds a failure kind and a route, and nothing else.
- A reminder that survives a reboot, a revoked permission and a restored бекап, through one
  reconciliation path rather than three special cases.

**Non-Goals:**

- No abstraction over «notification providers». There is one: this phone.
- No scheduling engine. One daily trigger the system owns; the app re-asserts it and otherwise
  does not think about time.
- No queue of pending alerts, no retry of the failed work, no exponential anything. An alert is a
  fact that stands until the work succeeds or the owner looks at it.
- No in-app inbox and no history. Vision §13 asks for a notification, not a log.

## Decisions

**D1. The dependency is `expo-notifications` (57.0.x, matching SDK 57), installed with `npx expo
install`.** It is the module that owns exactly the four things this change needs on Android and
nothing more: the Android 13 `POST_NOTIFICATIONS` runtime permission, a repeating daily trigger
held by the system (with the boot receiver that re-arms it after a restart), notification channels,
and the tap delivered back into JS on both a cold and a warm start.

Rejected: **our own Expo module beside `modules/notification-capture/`** — we would be writing
AlarmManager scheduling, a `BOOT_COMPLETED` receiver, channel creation, the permission request and
the tap bridge by hand, which is the whole of what the module already is, in a repo whose first
native rule is to stay in the managed workflow. **`expo-task-manager` / background fetch** — Android
promises no execution at a clock time, so the reminder would arrive when the system felt like it
and the alerts would arrive late or never. **An in-app banner only** — that is today's silence with
a nicer surface: the owner is not in the app, which is the entire problem.

**D2. One port, `src/platform/local-notifications.ts`, with the same three words the incoming
permission already uses.** The port is `permission()`, `ask()`, `openSettings()`,
`scheduleDaily(notice, at)`, `cancelDaily(id)`, `scheduledIds()`, `post(notice)`, `clear(id)`, and
its answers are `'granted' | 'denied' | 'unsupported'` — the vocabulary of
`notification-access.ts`, so the app has one word for a permission that cannot exist here and one
word for one the owner said no to. The two permissions stay separate types: they are different
grants (reading others' notifications, posting our own), and conflating them would let a screen
report the wrong one.

`inMemoryLocalNotifications()` lives beside the port and records what was scheduled, posted,
cancelled and cleared, so every rule about arrangement is asserted against a value.
`local-notifications-device.ts` is the adapter over `expo-notifications` and is imported by no
test, exactly as `backup-file-device.ts` is not.

**D3. Everything that decides lives in `src/reminders/`, and it is pure.**

- `time.ts` — `TimeOfDay { hour, minute }`, `parseTimeOfDay(text)` returning a value or a named
  refusal, `formatTimeOfDay`, and `DEFAULT_REMINDER_TIME` (21:00, a suggestion until the owner
  chooses; storage holds no time until then).
- `notices.ts` — the table of everything the app can post: the нагадування and one entry per
  failure kind, each with its stable id, its Ukrainian title and body, and the route a tap leads
  to. Plus `routeOf(data)`, which maps a tapped notification's destination through this table and
  answers Головний for anything it does not recognise.
- `alerts.ts` — `decideAlert({ kind, outstanding, attended })` → `{ post } | 'attended' |
  'already-outstanding'`, and the clearing decision.
- `schedule.ts` — `reconcile({ preference, permission, scheduled })` → `{ act: 'schedule', at } |
  { act: 'cancel' } | { act: 'nothing' }` (D12 says when each is answered).

**D4. The words are constants, not functions, and that is the privacy guarantee.** Every title and
body in `notices.ts` is a literal string with no parameter and no interpolation: there is no
argument through which a сума, a рахунок's назва or a captured notification's text could reach a
notification, so «nothing sensitive on the lock screen» is enforced by the type of the table rather
than by care at each call site. A test walks every entry and asserts the shape, which is what keeps
the next kind honest too. Rejected: **a formatter taking the failure's own message** — the message
is exactly the thing that carries bank text and суми, and it is already on the screen the alert
leads to, which is where it belongs.

**D5. «Attended» is decided by the caller, because only the caller knows.** A screen raising a
failure of work the owner asked for passes `attended: AppState.currentState === 'active'` — it is
the screen that explains that failure, so if the app is in front of the owner they are reading it.
Unattended work — the drain in `src/app/_layout.tsx`, and step 12's daily upload — passes
`attended: false` unconditionally: nothing on screen says a word about it either way. The
effectful half is `src/ui/alerting.ts` (`raise(kind, { attended }, ports)`, `clear(kind, ports)`)
on the model of `src/ui/notification-drain.ts`: ports in, provable under `verify` against the
in-memory port and a real in-memory database. Rejected: **inferring it from app state inside the
helper** — it would import React Native and leave `verify`; and it would be wrong for the drain,
which is unattended precisely while the app is open.

**D5a. Withdrawn notification access raises the collection kind, not a sixth one.** The drain in
the root layout already asks whether access is granted before collecting; when it is not and the
owner still has відстежувані застосунки, that is the same fact as a failed collection from where
they stand — the транзакції stopped arriving — and it raises the same сповіщення to the same
screen. No watches means nothing is expected, so nothing is raised. Rejected: **a separate
«доступ відкликано» kind** — two notifications leading to the same screen about the same silence.

**D6. Clearing is one call in the mount of the screen the alert leads to.** «monobank», «Бекап»,
«Імпорт Saldo», «Сповіщення банків» and Головний each clear their own kind when opened, and the
work of that kind clears it on success. Both are `clear(kind)`, idempotent, by kind only. A failure
that happens again after the owner looked raises again — which is right: they saw the old one.

**D7. Two tables, one migration, and deliberately no CHECK on the failure kind.**

```
daily_reminder(id TEXT PRIMARY KEY CHECK (id = 'reminder'),
               enabled INTEGER NOT NULL, hour INTEGER NOT NULL CHECK (0..23),
               minute INTEGER NOT NULL CHECK (0..59))
alerts(kind TEXT PRIMARY KEY, raised_at INTEGER NOT NULL)
```

The single-row shape is `saldo_import`'s, CHECK and all. No row means «never asked»: off, with no
time the owner chose. `alerts` is one row per kind, so «one failure is one сповіщення» is the
primary key and not a query.

`alerts.kind` carries **no** CHECK, against the repo's usual habit, for one stated reason:
migrations are immutable, the set of kinds grows (step 12 adds the Drive backup), and widening a
CHECK in SQLite means rebuilding the table in a new migration for the sake of one string. The
enumeration lives in `src/reminders/notices.ts`, where the words and the route already are, and the
repository refuses a kind that is not in it. Nothing about the row's meaning depends on SQL knowing
the list.

Nothing else is stored: no message, no сума, no captured text. The action that failed and the
moment it did is the whole row — which is also why the table cannot leak anything into a бекап.

**D8. The бекап sorting is part of this change, not a follow-up.** `daily_reminder` joins
`BACKUP_TABLES` (FR-B1's «налаштування без секретів» — a restored phone reminds the owner as the
old one did); `alerts` is named among the exclusions beside the чернетки and the rate cache, with
its reason. `BACKUP_SCHEMA_VERSION` goes 8 → 9, `backup-repo` snapshots and replaces the reminder
row, and a бекап written before this change simply names no reminder and restores as off — which
is what `backup-file` D5 already promises about an older бекап naming fewer things.

**D9. Two channels, private on the lock screen, ids that are stable per notice.** The device
adapter creates «Нагадування» and «Збої» on first use, so the owner can silence one in Android's
own settings without losing the other, and sets both to private lock-screen visibility — belt and
braces behind D4, which is the actual guarantee. Every notice has a fixed identifier
(`reminder`, `alert:monobank-sync`, …): posting it again replaces rather than stacks, so Android
agrees with the database even if the two ever disagree, and clearing is `dismiss(id)` plus deleting
the row.

**D10. A tap carries a route, and the app trusts only routes it knows.** The notification's data
holds the destination as a plain string; `routeOf` maps it through `notices.ts` and answers
Головний for anything else. The root layout reads the cold-start response once and subscribes to
warm ones, both after the migrations have run — the target screens read storage. Rejected:
**navigating to whatever the notification says** — the data is the app's own today, and treating it
as untrusted costs one lookup and closes the whole question.

**D11. The time is typed, not picked, and no native picker is added.** `@expo/ui`'s Jetpack Compose
set ships a `DatePicker` and no time picker, and `@react-native-community/datetimepicker` is a
second native dependency for a single field. The section takes «21:00» in a text field and parses
it with `parseTimeOfDay`, the discipline `src/ui/amount-input.ts` already applies to суми: a value
that is not a time is refused in words and the previous time stands. A picker can replace the field
later without touching a requirement.

**D12. One reconciliation path on launch — re-assert rather than check — and the section refreshes
on foreground.** After the migrations, the root layout reads the preference, asks the permission,
asks what the system holds, and applies `reconcile`. `reconcile` answers `schedule` whenever the
нагадування is on and the permission is granted — **even when the system already holds one** — and
`cancel` whenever it is not; `nothing` is only for the case where it is off and nothing is
arranged. Scheduling cancels the stable id first, so re-asserting can never leave two.

Re-asserting rather than checking is what makes the time zone honest. A daily trigger is computed
into an alarm when it is scheduled, so a phone carried into another zone would keep firing at the
old wall-clock hour until something re-computed it; there is no way to hear about
`TIMEZONE_CHANGED` without native code we are not writing, and the next launch is the first moment
the app can act anyway. One unconditional re-schedule per launch costs one call and removes the
whole class: the reboot (the system kept it, or it did not), the permission revoked while the app
was closed, a restored бекап whose setting arrived with nothing scheduled, and the zone change all
end in the same two lines.

The «Нагадування» section additionally re-reads the permission on every foreground, because
granting it happens on Android's own screen — the same reason `use-on-foreground.ts` exists for
«Сповіщення банків».

**D13. What `verify` proves and what only the emulator can.** Pure and proven: the time parse, the
notice table and its privacy shape, the raise/clear decisions, the reconciliation, `routeOf`.
Storage, against real migrations on in-memory SQLite: both tables, the round trips, the бекап
snapshot and replacement. Effectful but Node-testable, against the in-memory port: `raise`,
`clear`, and applying a reconciliation. Only the emulator can show: the permission dialog, the
channels, a notification actually arriving, its survival of a reboot, and where a tap lands — which
is what the smoke tasks name.

## Risks / Trade-offs

- **Android does not guarantee the minute.** Doze and inexact alarms can delay a daily
  notification. → The app never claims a clock guarantee: the spec speaks of what is *arranged*,
  and the section says the нагадування comes around the chosen time. This is the same honesty
  vision §12 already demands of the Drive backup.
- **A permanently refused permission never shows the system dialog again.** → The section reports
  the refusal and offers the system settings screen, which is the only remaining path; the switch
  does not lie about being on.
- **The dependency needs a prebuild and a fresh install.** The emulator's debug APK will not pick
  it up from Metro. → The smoke task begins with a prebuild and `scripts/android.sh up`, and the
  tasks say so; `npx expo-doctor` runs after the config change.
- **`BACKUP_SCHEMA_VERSION` moves to 9.** A бекап written by this build is refused by an older
  build. → That is the intended direction (`backup-file` D5: newer refused, older restored), and
  the older build is one the owner has already replaced.
- **Three changes modify `settings-screen`'s section list.** → This change is not run in the same
  wave as `bank-notifications-screen`, `first-run-onboarding`, `backup-file` or
  `google-drive-backup`; its delta carries the accumulated list *without* «Google Drive», which
  step 12 adds on its own, and whichever lands second re-checks the list against the main spec.
- **Clearing on «the owner opened the screen» can clear an alert raised seconds ago by work still
  running.** → Accepted, and it is the definition being used: the owner is looking at the screen
  that explains it. If the work fails again afterwards, it raises again.
- **An owner who denies the permission gets no failure alerts either.** → Stated on the section
  rather than worked around; the failures remain visible on their own screens, exactly as today.

## Migration Plan

1. `npx expo install expo-notifications`; add its config plugin and `POST_NOTIFICATIONS` to
   `app.json`; `npx expo-doctor`.
2. `npm run db:generate` produces migration 0008 with the two tables; bump
   `BACKUP_SCHEMA_VERSION` to 9 and sort the tables into `BACKUP_TABLES` and the exclusions, which
   is what turns `verify` green again.
3. Build the pure modules, the port and the repository before anything effectful; the screens and
   the root-layout wiring last.
4. Rollback: the migration is additive and both tables are ignorable by every other query, so a
   revert of the code leaves a database that still works; removing the dependency needs a prebuild.
