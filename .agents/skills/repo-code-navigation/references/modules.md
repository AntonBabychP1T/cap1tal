# Module map

Spec of record: `openspec/specs/<capability>/spec.md`. Vocabulary: `docs/glossary.md`
(Ukrainian terms are used verbatim in identifiers and UI). Screens: `docs/app-overview.md`.

| Directory | Responsibility | Start at | Spec(s) |
|---|---|---|---|
| `src/domain/` | money, account, transaction, category, rules, limits, goals, monthly-picture, reports, net-worth, investments, counterpart-income, fiscal-receipt | the file named after the concept | money, transactions, accounts, categories, categorisation-rules, limits, goals, monthly-picture, reports, net-worth, investments |
| `src/db/` | schema, repositories, migrations application, seeding, concurrency | `schema.ts`, `repos.ts`, `<table>-repo.ts` | persistence |
| `src/ui/` | screen logic without React: amount input, dashboard layout/charts, account groups, month/category/transaction lists, sync state, journal, alerting, reminders schedule, backup/bug-report screens | file named after the screen or concern | *-screen specs, main-screen, month-screen, transaction-search |
| `src/app/` | expo-router screens (`(tabs)/index|month|accounts|reports|settings`, `transaction/[id]`, `transactions`, `account/[id]`, `category/[month]/…`, `goal/[id]`, `ai-analysis`, `onboarding`, `progress`, `manage/*`, `crash`) | `_layout.tsx`, `(tabs)/_layout.tsx` | app-shell, first-run-setup, settings-screen |
| `src/monobank/` | bank API client, currency endpoint, account linking, statement sync, coordinator, auto (foreground triggers), yielding (timeouts) | `coordinator.ts`, `sync.ts` | monobank-sync, monobank-sync-screen |
| `src/notifications/` | another bank's push → fingerprint → чернетка | `index`-level files | bank-notifications, bank-notifications-capture, bank-notifications-screen |
| `src/saldo/` | one-time CSV import: parse → interpret → survey → verify | in that order | saldo-import, saldo-import-screen |
| `src/analysis/` | AI-аналіз package (period, months, categories, trends, goals) and file (prompt, context, summary) | `package*.ts`, `file*.ts` | ai-analysis-package, ai-analysis-screen, ai-analysis-share |
| `src/backup/` | backup file (canonical shape, versions, restore plan) and `drive/` (Google Drive daily copy) | `format*.ts`, `drive/run-backup.ts` | backup-file, backup-file-screen |
| `src/reminders/` | daily нагадування schedule and failure alerts | `schedule*.ts` | (settings-screen §нагадування) |
| `src/reporting/` | bug reports: capture settings, journal collection | `*.ts` | bug-report, bug-report-screen |
| `src/progress/` | achievements and challenges evaluation | `*.ts` | achievements, challenges, progress-screen |
| `src/fiscal/` | fiscal receipt QR / ПРРО parsing (`fixtures/` holds sample receipts) | `*.ts` | (change `receipt-qr-prro-requisites` in flight) |
| `src/platform/` | ports + `-device` adapters: token store, backup file/key, local notifications, notification access/capture, drive, google-auth, qr-scan/image, screen-capture, random, background tasks | port file first, adapter second | — |
| `src/hooks/` | `*-ports.ts` wiring, `use-*` hooks (foreground, focus reload, alerting, theme, rates, migrations) | `monobank-ports.ts` | — |
| `src/components/`, `src/constants/` | shared RN pieces, theme | — | — |
| `modules/` | Kotlin Expo modules: notification-capture, screen-capture (not indexed) | `android/src/main/java/...` | bank-notifications-capture |
| `scripts/` | `verify.sh`, `fingerprint.sh`, `android.sh` (emulator), `codedb-mcp.sh`, dry-run scripts | — | — |
| `openspec/` | `specs/` truth, `changes/` in flight, `config.yaml` | `openspec list` | — |
| `docs/` | product-vision, glossary, tech-task, app-overview (+`screens/`) | — | — |

Naming: kebab-case files, one concern per file, tests colocated as `<file>.test.ts` whose
names quote the spec scenario. `*-device.ts` never loads under tests.
