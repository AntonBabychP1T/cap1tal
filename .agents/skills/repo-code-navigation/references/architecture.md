# Architecture (what the graph will not tell you on its own)

Expo SDK 57 / React Native app, TypeScript strict, expo-router file routes, SQLite through
Drizzle. One person, one phone, Android first. `npm run verify` runs Node only and never
executes JSX, which is why screen logic is kept out of `.tsx`.

## Layers, inner to outer

1. `src/domain/` — pure values and rules: money (integers in minor units + currency code),
   accounts, transactions, monthly picture, rules, limits, goals, reports. No React, no Expo,
   no db imports; `now` is passed in.
2. `src/db/` — Drizzle schema (`schema.ts`), one repository per table family
   (`*-repo.ts`, factories taking `db`), `repos.ts` instantiates them over `client.ts`. Tests
   run the real migrations on in-memory SQLite (`test-db.ts`).
3. Pure feature modules — `src/monobank/` (bank API, linking, sync coordinator), `src/saldo/`
   (CSV import), `src/notifications/` (bank push → draft), `src/analysis/` (AI package + file),
   `src/backup/` (file + Google Drive), `src/reminders/`, `src/reporting/`, `src/progress/`,
   `src/fiscal/` (receipt QR). They talk to the device only through ports (plain interfaces).
4. `src/ui/` — screen logic with no React imports: parsing, grouping, labels, sync state
   machines. This is where a screen's behaviour is tested.
5. `src/platform/` — one port per device capability (`<x>.ts`, tested against an in-memory
   double) and its adapter (`<x>-device.ts`, loads a native module, never imported by tests).
6. `src/hooks/` — React hooks plus the `*-ports.ts` files that assemble a feature's ports from
   adapters and repos at runtime (`monobank-ports.ts`, `drive-backup-ports.ts`,
   `progress-ports.ts`).
7. `src/app/` — expo-router screens. Routes are file paths; `(tabs)/` holds the five tabs;
   the rest is pushed over them. Screens hold form state only and re-query on focus.
8. `src/components/`, `src/constants/` — the few shared RN components and the theme.

## Entry points

- `index.ts` — imports the two background task modules first, then `expo-router/entry`
  (headless wake-ups never render the root component).
- `src/app/_layout.tsx` — root layout: migrations, seeding, port wiring, foreground sync,
  notification drain, reminders, crash fallback. Most runtime composition happens here.
- `src/platform/monobank-sync-task.ts`, `src/platform/drive-backup-task.ts` —
  `TaskManager.defineTask` bodies run by WorkManager without an Activity.
- `modules/notification-capture`, `modules/screen-capture` — local Expo modules (Kotlin) behind
  `src/platform/notification-capture-device.ts` and `screen-capture-device.ts`.

## How one transaction flows

Bank statement (`src/monobank/sync.ts`) or push (`src/notifications/`) or CSV
(`src/saldo/`) → domain typing and rules (`src/domain/rules.ts`, `transaction.ts`) →
`transactions-repo` → screens re-query → `src/domain/monthly-picture.ts` computes
spent / invested / saved / lent / left per currency → `src/ui/*` shapes it for Головний,
Місяць, Звіти. `docs/app-overview.md` §5.3 tells the same story with screenshots.

## Cross-module dependencies that matter

- `src/hooks/*-ports.ts` and `src/app/_layout.tsx` are the only places that bind adapters to
  ports; change a port's shape → check both.
- `src/db/repos.ts` is the single import surface screens use for storage.
- `src/ui/journal.ts` / `alerting.ts` / `bug-report-here.ts` are cross-cutting: many modules
  write to the journal, the reporting screen reads it.
- `src/monobank/coordinator.ts` + `src/ui/monobank-sync.ts` own sync rules; the three triggers
  (foreground, pull-to-refresh, «Синхронізувати») all pass through `syncPorts`.
- `drizzle/` is generated from `src/db/schema.ts` (`npm run db:generate`); committed migrations
  are immutable and are not in the code index.

## Dynamic / reflective behaviour the static graph resolves poorly

- expo-router file routing and `router.push` string paths.
- Port → adapter binding chosen at runtime; `.web.ts` platform variants.
- `TaskManager.defineTask` and `registerTaskAsync` (no caller edge).
- Repository factories closed over `db`; call edges land on exported instances.
- `require.context` in expo-router bundles every file in `src/app/` (hence no tests there).
- Kotlin native modules and JSON/SQL artefacts are outside the index.
