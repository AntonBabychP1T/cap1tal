# accounts-manual-transactions

## Why

The domain (domain-core) and storage (db-schema) exist, but the app still shows the Expo template
demo: nothing the owner can actually use. This change is step 3 of the build plan — the first
usable milestone ("після кроку 3 можна вести облік вручну"). It answers both product questions at
their root: money can only be tracked (де гроші — рахунки з розрахунковим балансом) and spending
can only be recorded (куди пішли — витрати з головного екрана) once these screens exist.

Covers FR-A1 (CRUD рахунків), FR-S1 (ручне додавання), FR-T8 (редагування, видалення, зміна типу).

## What Changes

- The template demo screens (`src/app/index.tsx`, `src/app/explore.tsx`, demo components) are
  replaced by two real screens: **Головний** and **Рахунки**.
- **Головний**: quick-add form (сума, рахунок; тип — витрата за замовчуванням або переказ;
  дата — сьогодні, змінна) and the стрічка останніх транзакцій, newest first. Tapping a
  transaction opens editing: change amount, date, account(s), delete, and retype (витрата ↔
  переказ — інвестиція є переказом на інвестиційний рахунок). A same-currency переказ offers an
  optional «скільки прийшло»; when it is smaller than the сума that left, the difference is
  proposed as a "Комісія" expense (already specced in `transactions`; this change gives it UI).
  Accepting stores the переказ with the сума that arrived on both legs plus that витрата, so the
  комісія is never counted twice against the source's розрахунковий баланс — design §8.
- **Рахунки**: accounts grouped by вид with their розрахунковий баланс; create (назва, вид,
  валюта UAH/EUR/USD, початковий залишок), rename, archive/unarchive.
- **Account archival** (new behaviour): an account is never deleted; it is archived. Archived
  accounts keep their history and balance but are hidden from new-transaction pickers and grouped
  separately on Рахунки. Requires an `archived` flag on the domain `Account`, in storage, and a
  new migration.
- **Latest-transactions listing** (new behaviour): storage can list the N most recent
  transactions — by date, ties broken by insertion recency — which needs a stored insertion
  instant (`created_at`) as storage metadata (not part of the domain transaction). New migration
  column.

### Scope decisions (owner can veto before apply)

1. **Manual entry covers витрата and переказ only.** *(Confirmed by the owner; `docs/tech-task.md`
   is corrected in task 4.6 so the plan stops claiming FR-S1 is finished after step 3, and the
   consequence is stated: until step 5 the розрахунковий баланс of an account that receives дохід
   drifts, because дохід cannot be recorded yet.)* The vision's own words define daily use:
   "every transaction is spending until I mark it as a transfer or an investment", and FR-T8's
   retype example is витрата → переказ/інвестиція. Дохід needs джерело and повернення needs a
   real категорія — both catalogues arrive with `categories-rules` (step 5), which will extend
   manual entry to them. Коригування arrives with reconcile (`monobank-sync`, step 7). Recording
   them earlier would mean inventing throwaway category/source UI that step 5 replaces.
2. **Category of a manual expense is "Без категорії"** (the reserved `uncategorised` id) — the
   only option until `categories-rules` seeds real categories and adds one-tap categorisation.
   The form states this; FR-S1's third minimum field exists but has one value for now.
3. **Вид and валюта are immutable after creation; назва and початковий залишок are editable.**
   Changing currency would invalidate every stored amount (balance computation rejects foreign
   currencies); changing kind would silently reclassify history in the monthly picture. FR-A1
   names only перейменування and архівація as lifecycle actions.

### Non-goals

- No categories, sources, rules, one-tap categorisation (step 5 `categories-rules`).
- No Місяць screen / monthly picture UI (step 4), no monobank, no limits, no goals, no reports.
- No income, refund or correction manual entry yet (see scope decision 1).
- Nothing from vision §13 is touched.

## Capabilities

### New Capabilities

- `main-screen`: the Головний screen — quick manual entry (витрата за замовчуванням, переказ),
  the стрічка останніх транзакцій, editing/deleting/retyping a transaction, fee proposal UI.
- `accounts-screen`: the Рахунки screen — accounts grouped by вид with розрахунковий баланс;
  creating, renaming, archiving accounts.

### Modified Capabilities

- `accounts`: new requirement — account lifecycle: an account can be renamed and archived, never
  deleted; archived accounts keep history and balance but are excluded from new-transaction
  account choices.
- `persistence`: new requirements — the archived flag round-trips through storage; storage lists
  the latest N transactions ordered by date then insertion recency (`created_at` metadata);
  a new migration adds both columns (committed migrations stay untouched).

## Impact

- `src/domain/account.ts`: `archived` on `Account` (+ tests).
- `src/db/schema.ts`, new migration in `drizzle/`, `src/db/mappers.ts`,
  `src/db/accounts-repo.ts` (archive/rename persist), `src/db/transactions-repo.ts`
  (`listLatest`, `created_at`) (+ tests on in-memory SQLite over real migrations).
- `src/app/`: replace template screens with Головний, Рахунки and an edit screen; remove demo
  components that nothing references afterwards. Screen logic that can be pure TypeScript
  (amount-input parsing to minor units, form validation, feed ordering) lives in testable
  modules — screens stay thin, since `npm run verify` never runs UI.
- No new native modules, no Expo config change, no new dependencies expected.
- `.claude/rules/testing.md`, the CLAUDE.md Layout table and the `vitest.config.mts` comment gain
  `src/ui/**`: design §5 puts screen logic there and `verify` now runs it, so a rule file listing
  only `src/domain` and `src/db` would be false (task 4.7).
- `docs/tech-task.md`: FR-S1 is split across steps 3 and 5 and the "після кроку 3" milestone line
  says what is and is not possible (task 4.6, the owner's answer to scope decision 1).
- UI language: Ukrainian, glossary terms verbatim.
