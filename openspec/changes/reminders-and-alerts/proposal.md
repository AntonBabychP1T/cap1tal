# reminders-and-alerts — proposal

## Why

cap1tal never speaks first. It records what it is told and reports what it holds, and both of the
vision's questions — where the money went, how much is left — are answered from a record the owner
alone has to remember to keep. Two silences follow from that, and this change ends both.

The first is the owner's own forgetting. A day not recorded is not a gap the app can see: the
місячна картина simply says a smaller number and says it confidently. Vision §13 grants exactly one
answer to that — one local daily нагадування, at a time the owner picks, that opens the place where
a транзакція is added and pending чернетки are waiting.

The second is worse, because it is the app's. Work that keeps the record complete already runs
without the owner watching: the drain of what the phone captured from other banks' notifications, a
monobank sync that paces itself at a minute per request and outlives the owner's patience for
watching it, an import that commits while they walk away, a бекап they asked for and left. When one
of those fails today, nothing says so anywhere. «Залишилось» is then wrong in the one direction that
matters — too much money, because the витрати never arrived — and the owner has no reason to doubt
it. Step 13 (tech-task §5, FR-N1–N3) makes that failure visible: one local сповіщення that names the
action that failed and leads to the screen where it can be retried.

This change is step 13 and the last of the roadmap's notification work. **It depends on `backup-file`
(step 11) being implemented**, for one narrow reason: the reminder's preference is a non-secret
setting and FR-B1 says a бекап carries those, so the tables this change adds must be sorted into
what a бекап holds and what it deliberately leaves behind. Nothing else here waits on anything.

## What Changes

- **New capability `reminders-and-alerts`** — everything the app itself sends to the phone's
  notification shade, and nothing else:
  - **One daily нагадування, off until the owner turns it on.** The owner picks the time; the app
    asks the system for permission to post notifications at the moment they turn it on, and the
    reminder is arranged for that time every day. Tapping it opens Головний, where a транзакція is
    added and pending чернетки are answered. Changing the time moves it; turning it off removes it;
    a permission revoked behind the app's back turns it off honestly rather than pretending it is
    still arranged.
  - **An alert when work the owner was not watching failed.** The collection of captured bank
    notifications, a monobank sync, a Saldo import commit, a local save, a бекап to a file — and,
    when step 12 lands, a Drive backup — each raises one alert on failure. It names the action that
    failed and nothing else, and it leads to the screen that explains it and offers the retry.
    Access to other banks' notifications being withdrawn while відстежувані застосунки remain is
    announced as the same silence: from the owner's side the транзакції stopped arriving either way.
  - **One failure is one alert.** An alert of a kind already outstanding is not raised a second
    time, however many times the same work fails. It is cleared when that work next succeeds, or
    when the owner opens the screen it leads to. A failure the owner is already looking at — the
    screen that would raise the alert is in front of them — is shown there and raises nothing.
  - **Nothing sensitive on the lock screen.** No сума, no рахунок, no категорія, no bank text, no
    part of a captured notification and no token ever appears in what the app posts. What is posted
    is the action's name in Ukrainian; the money stays behind the phone's lock.
  - **Everything is local.** There is no server, no push service, no account and no message the app
    did not schedule on this phone (vision §14.14).
- **New capability `reminders-screen`** — the «Нагадування» section of Налаштування: the permission
  in words, the switch for the daily нагадування, the time it is set for, what the app will and will
  not tell the owner about, and — when the permission is refused — where in the system settings it
  is granted.
- **Modified capability `settings-screen`** — the section list gains «Нагадування».
- **Modified capability `persistence`** — the reminder's preference and the outstanding alerts
  survive a restart, arriving through a new append-only migration.

Non-goals, some of them vision §14 lines this change stays behind:

- **No remote push** (§14.14). No cap1tal server, no push token, no messaging SDK, no analytics
  channel. Every notification in this change is scheduled by this phone for this phone.
- **No smart reminder.** It does not check whether the owner already recorded something today,
  does not skip weekends, does not nag twice and does not learn. That would need background
  execution Android does not promise, to save a notification that costs a swipe.
- **No second kind of reminder**: no ліміт warnings (FR-L2 is explicit that exceeding a ліміт is red
  in the picture and nothing more), no ціль deadlines, no «you have not opened the app in a week».
- **No alert list screen and no alert history.** An alert leads to the screen that already explains
  that failure and offers its retry; that screen is where the details live. Outstanding alerts are
  state, not a log the owner reads.
- **No new setup step in «Перші кроки».** The permission is asked for where the reminder is turned
  on, not on the first run — the app must be worth reminding about before it asks.
- **No change to what fails or how.** Every failure this change reports is a failure the code
  already produces as a value; nothing here retries anything by itself, and no existing screen's
  own words about its failure change.

## Capabilities

### New Capabilities

- `reminders-and-alerts`: the app's own outgoing notifications — the one daily нагадування and its
  time, the enumerated alert kinds and what raises each, the rule that one failure is one alert and
  what clears it, what may never appear in what is posted, where a tap leads, and the permission
  states as values.
- `reminders-screen`: the «Нагадування» section of Налаштування — permission state and how to grant
  it, the daily reminder's switch and time, and the plain statement of what the app notifies about.

### Modified Capabilities

- `settings-screen`: the section list gains «Нагадування», which opens the reminder and alert
  settings.
- `persistence`: the daily нагадування's preference (on or off, and its time) and the set of
  outstanding alerts SHALL survive a restart, and SHALL arrive through an append-only migration —
  neither exists today.

## Impact

- **New npm dependency: `expo-notifications`** — a native module, so `app.json` gains its config
  plugin and Android's `POST_NOTIFICATIONS` permission, and the next emulator run needs a prebuild
  and a fresh install. It is the only maintained way to schedule a repeating local notification
  that survives a reboot, to own a notification channel and to hear a tap; design D1 names the
  alternatives that were rejected and why. `npx expo-doctor` is run after the config change.
- **Native/config**: one permission (`POST_NOTIFICATIONS`, Android 13+, declared in `app.json`
  because that file carries no comments and the requirement carries the reason instead), two
  notification channels so the owner can silence нагадування without silencing збої, and no hand
  edit under `android/`.
- **New code**: `src/reminders/**` for the pure parts — the time of day and its parse, the alert
  kinds with their words and their routes, the decision to raise or not, and the reconciliation of
  the preference with what the system actually holds; `src/platform/local-notifications.ts` as the
  port with an in-memory double beside it and `-device.ts` as the adapter `verify` never loads;
  `src/db/reminders-repo.ts` for the preference and the outstanding alerts; `src/ui/reminders-
  screen.ts` for the section's pure logic and `src/app/manage/reminders.tsx` for the screen.
- **Touched code**: the five places that already produce a failure as a value gain one call each —
  the drain in `src/app/_layout.tsx`, the sync in `src/app/manage/monobank.tsx`, the commit in
  `src/app/manage/saldo-import.tsx`, saving and restoring in `src/app/manage/backup.tsx`, and the
  чернетка commit in `src/app/(tabs)/index.tsx`. None of their own words change.
- **Database**: one new migration adding two small tables — the reminder preference (one row) and
  the outstanding alerts (one row per kind). Committed migrations stay untouched.
- **Backup coupling**: `src/backup/format.ts` names every table a бекап holds and asserts its
  schema version against the migration journal, so this migration fails `verify` until the two new
  tables are sorted: the preference travels in a бекап (FR-B1's «налаштування без секретів»), the
  outstanding alerts do not (they describe this phone's last few minutes, not the owner's money).
- **`npm run verify` stays Node-only and under a minute**: the time, the alert decisions, the words,
  the routes and the reconciliation are pure functions over injected values; the repository is
  tested against the same in-memory SQLite as every other; the device adapter is loaded by nothing.
- **Docs**: `docs/glossary.md` gains **нагадування** and **сповіщення про збій** so specs and
  screens use one word each; `docs/tech-task.md` §5 row 13 moves from ⏳ to its real state at
  archive time.
- **Scheduling note**: `settings-screen` is also modified by `bank-notifications-screen`,
  `first-run-onboarding`, `backup-file` and `google-drive-backup`. Per BACKLOG's own rule, this
  change does not run in the same wave as those.
