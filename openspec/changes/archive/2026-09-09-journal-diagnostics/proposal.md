## Why

A репорт про помилку filed on 2026-09-09 about «не працює синхронізація картки platinum» carried
208 journal entries. Two hundred of them were `екран · /route`; four were `збій · backup`. About
the monobank sync the репорт said nothing at all — not that a run had started, not which рахунки
got a turn, not one request to the bank, not one answer. The bug it was filed about was invisible
in the file filed about it, and the person at the laptop had to guess.

That is not an accident of that one репорт. The журнал is written from four places and three of
them only ever fire when something has already failed: navigation, crashes, сповіщення про збій,
and `journal.failure(...)` in three screens. **The app records where the owner went and what
refused them, and nothing whatever about what it itself did.** Every outbound request, every sync
turn, every WorkManager wake-up, every native permission — the whole machinery a bug usually lives
in — leaves no trace. This change makes the журнал record the app's own work, so a репорт про
помилку is evidence rather than a route trail.

## What Changes

- **Three new kinds of journal entry** beside `screen`, `failure`, `alert` and `crash`:
  - `network` — one outbound request: method, host and path, the status that came back and how
    long it took. Never a header, never a body, never the token. The path is kept whole only for
    the monobank API; for every other host the журнал keeps the endpoint's shape with identifiers
    replaced, so a Drive file id and a чек's реквізити never enter it.
  - `step` — one thing the app did, with a phase (`почалось` / `вдалось` / `не вдалось`) and
    measured numbers: a sync run, one рахунок's turn in it, a statement window, the drain of the
    notification queue, a бекап, an import.
  - `native` — the device's own half: the background task registered and fired, the
    NotificationListenerService connected or not, a permission's state, the app moving between
    foreground and background, a headless launch with no Activity.
- **Three new optional fields on an entry**: `run` (the id that ties every entry of one operation
  together), `tookMs` (how long the thing it names took), and `counts` — a `Record<string, number>`,
  so that what enforces privacy on the new data is the type, exactly as it already is for the old.
- **Instrumentation at the ports, never in the pure core.** The `fetch` adapters
  (`hooks/monobank-ports.ts`, `platform/drive-device.ts`, `app/manage/monobank.tsx`,
  `fiscal/chk-all-web.ts`, the rate endpoint), the `SyncProgress` events the coordinator already
  emits and nobody records, the background task, the capture and notification-access adapters, and
  `AppState` in the root layout. `src/monobank/`, `src/domain/` and `src/ui/` stay as pure as they
  are; `npm run verify` still runs no network and no native module.
- **A журнал that can hold the extra traffic**: the bound rises from 500 to 2000 entries, and the
  rendering folds a run of identical consecutive `screen` entries into one line with a count, so
  richer entries are not pushed out by the owner tapping between two tabs.
- **Three additions to the rendered репорт**: a summary at the top (how many requests, how many of
  them failed, the slowest, how many sync runs and what the last one came to), a «Мережа ·
  Network» section, and a «Що робив застосунок · What the app did» timeline grouped by `run`. The
  one-renderer rule holds: what the owner reads on screen is still exactly what leaves.
- The migration adds three nullable columns to `journal` (`run`, `took_ms`, `counts_json`). No
  committed migration is touched; an entry written by the old build reads back exactly as before.
- **Non-goals.** No log level, no verbosity setting, no remote logging, no crash reporter, no
  network call of any kind — the репорт still leaves the phone only by the owner's hand
  («Передати»). No sums, назви, описи, bank notification text or the monobank token enter the
  журнал; nothing here reopens vision §14.
- The Google sign-in token exchange goes through `expo-auth-session`, not through a fetch this app
  owns, so it is recorded as an operation rather than a request. That matters: the репорт that
  prompted this change carried four `збій · backup · not-configured` entries and nothing about why.
- The one privacy boundary that moves, stated rather than smuggled: a `network` or `step` entry
  may name the **monobank account id** the request was about. It is an opaque bank identifier, not
  the owner's money, it is the same class of identifier the журнал already carries in routes
  (`/transaction/mtkihq4f-3gb2eh3e`), and without it «which card is not syncing» — the question the
  репорт that prompted this change asked — cannot be answered.

## Capabilities

### New Capabilities

None. This deepens what the журнал and the репорт already are.

### Modified Capabilities

- `bug-report`: the журнал's requirement gains three kinds of entry, the three optional fields,
  the raised bound and the monobank account id as a named exception to «nothing of the owner's»;
  the rendering requirement gains the summary, the network section and the timeline, and the
  folding of repeated screen entries.

## Impact

- **Product truth**: `docs/glossary.md` — the **Журнал** entry names four kinds and «the most
  recent 500»; both change here.
- **Code, pure**: `src/reporting/journal.ts` (kinds, fields, `entryLine`, folding),
  `src/reporting/report.ts` (summary, network section, timeline), `src/ui/journal.ts` (the
  singleton's `record` gains the optional tail; a `step` helper that times an operation and writes
  both its ends).
- **Code, ports**: `src/hooks/monobank-ports.ts`, `src/hooks/drive-backup-ports.ts`,
  `src/platform/drive-device.ts`, `src/platform/monobank-sync-task.ts`,
  `src/platform/notification-capture-device.ts`, `src/platform/notification-access-device.ts`,
  `src/app/manage/monobank.tsx`, `src/app/_layout.tsx`, `src/platform/google-auth-device.ts`,
  `src/fiscal/chk-all-web.ts` call sites, `src/monobank/currency.ts` call sites. Each `native`
  entry's decision lands as a pure function in `src/ui/`, because `verify` never loads an adapter.
- **Database**: `src/db/schema.ts` journal table + one new migration under `drizzle/`;
  `src/db/reporting-repo.ts` reads and writes the three columns **and widens its own `KINDS` array**
  — widening the TypeScript union does not break that array, and leaving it would make every new
  entry fail its read while the writer swallows the error. `src/backup/format.ts`'s
  `BACKUP_SCHEMA_VERSION` 21 → 22, the tripwire every migration trips.
- **Untouched on purpose**: `src/monobank/api.ts`, `sync.ts`, `coordinator.ts`,
  `src/monobank/currency.ts`, `src/fiscal/chk-all-web.ts`, `src/platform/drive.ts`, `src/domain/*`
  — every one of them takes a fetch-like, and a wrapped fetch-like is still one, so the wrapping
  happens at their call sites. `src/backup/format.ts`'s shape and `backup-repo.ts` — the журнал
  stays out of a бекап, and only the schema version moves.
