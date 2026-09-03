## Why

The monobank engine is complete — cursors, dedup by the bank's own item ids, per-page commits,
typed outcomes — but nothing starts it. Today the only way to see today's spending is
`Налаштування → monobank → Синхронізувати`, four taps away from where the owner actually looks.
So the first question the vision asks — «скільки залишилось» — is answered on Головний from data
whose age the owner cannot see and did not choose. Money spent this morning is simply absent, and
nothing on the screen says so.

This change makes the app fetch on its own while the owner is in it, and makes the age of the
answer visible: `оновлено 3 хв тому`. Silence when it worked, «Потребує уваги» when it did not.

## What Changes

- Opening the app starts a sync by itself, without the owner asking, when the last attempt is old
  enough. Returning to the app after hours does the same — it is the same trigger the notification
  drain already uses.
- Pulling down on Головний forces a sync now, whatever the interval says.
- Головний states how fresh the bank data is — `оновлено 3 хв тому` — from the moment the linked
  рахунки last completed a sync. It says nothing at all when monobank is not connected.
- A successful automatic run says nothing: no toast, no dialog, no notification. The транзакції it
  imported appear in the стрічка and the freshness line moves, and that is the whole of it.
- A run that needs the owner appears in «Потребує уваги» on Головний: at once when the token was
  rejected (only the owner can replace it), and otherwise only once the data has gone stale —
  a phone in the metro is not a problem to announce.
- One sync at a time across the whole app: the automatic run, the pull, and «Синхронізувати» on
  the monobank screen cannot overlap and corrupt each other's cursors.
- The moment of the last attempt and how it ended are remembered, so closing and reopening the app
  ten times does not spend ten runs against an API that allows one request a minute.

### Scope

The trigger, the visible freshness, the failure surface, and the one lock that keeps runs apart.
Nothing about how a statement is fetched, parsed, deduplicated, mapped or committed changes: the
coordinator this change calls is the one that exists, with the same ports and the same outcomes.

### Non-goals

- **No background sync.** Nothing runs while the app is closed — no WorkManager, no background
  fetch, no scheduled job. A run happens only while the owner has the app open. Vision §14.14
  (remote push) and §14.9 (cloud services) stay untouched; the only network this change causes is
  the same monobank personal API call the owner triggers by hand today.
- No change to the manual «Синхронізувати» button, its progress reporting or its per-account
  outcome list; the monobank screen keeps everything it shows.
- No new sync of anything else: курс валют, чернетки зі сповіщень and the бекап are not part of
  this trigger.
- No sync when monobank is not configured or no рахунок is linked — pulling down still refreshes
  what Головний reads from storage, and no request goes out.

## Capabilities

### New Capabilities

(none — every behaviour here belongs to a capability that already exists)

### Modified Capabilities

- `monobank-sync`: gains when an automatic run is due, that at most one run exists at a time, and
  that a run's attempt and its worst outcome are remembered; the mapping, dedup and cursor
  requirements are untouched.
- `monobank-sync-screen`: its last-sync requirement today ends «Sync SHALL remain something the
  owner starts: nothing here makes the app sync on its own» — that sentence is replaced, and the
  screen additionally states when a run started elsewhere is going on.
- `main-screen`: gains the freshness line, pull-to-refresh as a forced sync, and the silence rule
  for a run the owner did not ask for; «Потребує уваги» is *modified* to hold a third kind of row,
  because that requirement today says the section holds exactly «Без категорії» and чернетки and
  vanishes when both are empty.
- `persistence`: the moment of the last automatic attempt and how it ended survive a restart, and
  neither travels in a бекап.

## Impact

- `src/monobank/` — a new pure module deciding whether a run is due and what a finished run means
  for the owner; `coordinator.ts` itself is called, not changed.
- `src/ui/` — the one place a run is started and the one flag that keeps two runs apart (the shape
  `notification-drain.ts` already uses), the freshness label, and the Головний view model gaining
  its freshness and attention row.
- `src/app/_layout.tsx` — the open-and-foreground trigger, beside the notification drain's.
- `src/app/(tabs)/index.tsx` — the pull, the freshness line, the attention row.
- `src/db/` — one new single-row table for the remembered attempt, by a new append-only migration,
  plus its repository; `monobank_links.last_synced_at` is read as it is.
- `src/backup/format.ts` — `BACKUP_SCHEMA_VERSION` to 14 and the new table named among the
  enumerated exclusions: it is what one phone last tried, not the owner's money.
- `src/components/surfaces.tsx` — `Screen` gains one optional `refreshControl` prop, since the
  ScrollView the pull needs lives there and not on Головний.
- Sequencing: «Потребує уваги» is defined by the in-flight `home-daily-overview` change. This
  change adds a row to that section and should be implemented after it lands.
