# monobank-sync-screen — design

## Context

See `proposal.md` — Why, and the seven delta-spec capabilities for the observable contract.

The pure half already exists:

- `src/monobank/api.ts` fetches and totally parses client-info and statements into typed outcomes.
- `src/monobank/link.ts` validates one-to-one, same-currency links.
- `src/monobank/sync.ts` plans API-sized windows, continues full 500-item answers and maps items
  using explicit rules, seen ids and id generation.
- `src/domain/account.ts` already computes a розрахунковий баланс and creates the коригування for
  «Звірити».

What is absent is the effectful seam: the token adapter, durable monobank state, a request loop,
and UI. SQLite is currently opened once and exposed through small domain-facing repositories;
`importRepo.commit` is the precedent for a multi-table atomic write. Migrations are generated and
append-only. `npm run verify` must remain Node-only and under one minute, so no test may require a
network, native secure storage, an emulator or real request pacing.

## Goals / Non-Goals

**Goals:**

- Keep the token outside React view state after submission and outside SQLite, while making the
  token adapter replaceable by an in-memory test double.
- Make every statement-page write crash-safe and restartable without hiding any bank account or
  importing an item twice.
- Put request sequencing, pacing, time, timezone conversion and persistence behind injected ports,
  leaving the existing mapping and money rules pure.
- Keep React components thin: state transitions, link choices, progress summaries and account rows
  are plain TypeScript exercised by Vitest.

**Non-Goals:**

- No background task, headless execution, app-start sync, webhook or operating-system notification.
- No cross-source Saldo/monobank matching and no inferred transfer/refund/investment/lending pairs.
- No web token persistence: a `.web.ts` adapter reports secure storage unavailable rather than
  falling back to localStorage. Android is the delivery target; the native adapter also supports a
  future iOS build.
- No database-level computed balance. Only bank metadata is stored; the розрахунковий баланс stays
  opening balance plus транзакції in the domain.

## Decisions

### D1. One coordinator owns a foreground run; React only subscribes to its state

Add `src/monobank/coordinator.ts` with a `syncLinkedAccounts` operation and plain ports for token
read, authenticated fetch, link/progress repository, rules, clock, local-calendar conversion,
request pacing and id generation. It captures one `runToMs` at the start, processes active links
in a deterministic order, and emits per-account progress/results. `src/ui/monobank-screen.ts`
turns those values into rows and permitted actions; `src/app/manage/monobank.tsx` renders them.

The coordinator is not a singleton background service. If the route goes away or the app is
suspended, the current operation may stop; every completed database transaction remains, and the
next manual run resumes from durable cursors. This is preferable to hiding a long-lived task in a
component or introducing a background module outside the proposal.

Alternative — put the request loop directly in the route — is rejected because React lifecycle,
network decisions and atomic persistence would become inseparable and the important failure paths
would fall outside `verify`.

### D2. `expo-secure-store` is the only token persistence

Install the SDK-compatible `expo-secure-store` with `npx expo install expo-secure-store`. The
native adapter `src/platform/monobank-token-store.ts` uses one versioned key,
`cap1tal.monobank.personal-token.v1`, asynchronous get/set/delete, `requireAuthentication: false`,
and `SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY`. The value is therefore readable only while
the device is unlocked and is not migrated to another device. A sibling
`monobank-token-store.web.ts` implements the same port but returns unavailable and stores nothing;
no insecure fallback exists.

The port itself and its in-memory double live apart from both, in
`src/platform/monobank-token.ts`. They have to: Metro resolves `./monobank-token` to a
`.native.ts` sibling on a device, so a port declared in the base file would be invisible to the
native build and an adapter importing it from itself would be circular. Keeping the port in a file
no platform code touches is also what lets every test import it without `expo-secure-store`.

The candidate token exists only in the controlled input and the validation call. On success the
adapter writes it, the input is cleared, and UI state retains only `configured: true`. Replacing a
token validates first and overwrites only after success. Sync reads the secret into a local
operation variable and never includes it in an outcome, error, progress event or log.

Expo configuration changes are explicit:

- add `["expo-secure-store", { "configureAndroidBackup": true }]` to `app.json` plugins so Android
  Auto Backup excludes the undecryptable secure-store preferences;
- add no runtime permission, no Face ID permission text and no biometric prompt;
- make no manual Android manifest/Gradle or iOS Info.plist change.

The package and plugin choice follows Expo's secure-token and Android-backup guidance in the
[SecureStore documentation](https://docs.expo.dev/versions/latest/sdk/securestore/). Alternative —
SQLite, AsyncStorage or localStorage — is rejected because each puts a bearer secret in ordinary
app data or backup scope. Biometric-gated storage is rejected because a manual finance sync should
not add a platform prompt to every run and Expo Go cannot exercise that path consistently.

### D3. Three normalized tables preserve bank identity independently of a link

Add generated schema and one append-only migration for:

- `monobank_accounts`: opaque bank account id primary key, kind (`card|jar`), bank name, currency,
  latest bank-balance amount in integer minor units, and `obtained_at` epoch milliseconds;
- `monobank_links`: monobank account id primary key/foreign key, unique app account id foreign key,
  confirmed `sync_start_date` (`YYYY-MM-DD`) and `cursor_ms` epoch milliseconds;
- `monobank_imported_items`: composite primary key `(monobank_account_id, item_id)`.

`monobank_accounts` is deliberately separate from `monobank_links`. Unlinking deletes only the
link, so cached identity, last bank balance and imported ids survive. Imported ids reference the
bank-account row, never the app transaction: editing or deleting a транзакція cannot resurrect an
item. Both link foreign keys use `onDelete: 'restrict'`; no app path deletes a monobank-account
identity, and app рахунки already archive rather than delete.

The repository revalidates currency equality before link insertion; unique constraints provide the
concurrent/backstop form of the one-to-one invariant. A newly created рахунок and its link are
inserted in one database transaction, using the existing account constructor and row mapper, so a
link failure cannot leave an accidental orphan account.

Alternative — put bank ids, cursors and balance columns directly on `accounts` — is rejected:
unlinking would either erase the permanent seen-id namespace or leave bank-specific null columns
on every cash, debt and investment account.

### D4. A page commits atomically; a cursor advances only when its whole window is complete

`src/db/monobank-repo.ts` exposes reads plus a single `commitStatementAnswer` transaction. The
input is already-mapped транзакції, every newly seen item id (including zero-amount items), the
latest bank balance, and the resulting cursor. Inside `db.transaction`, it inserts transactions
through the same row mapper and storage timestamp rules as `transactionsRepo`, inserts imported
ids, updates the balance and updates the cursor. Any constraint failure rolls everything back.

For a short answer, the resulting cursor is the completed planned window's end. For a full
500-item answer, the page's transactions and imported ids commit but the high-water cursor remains
at the window start while `continueWindow` narrows the request toward older items. After a later
short answer completes that window, the cursor jumps to the original window end. If the app stops
between pages, the next run may fetch an already committed page again; the durable ids make that
overlap harmless and let paging continue without another persisted state machine.

Boundary instants are inclusive. The next run may therefore see the item exactly at `cursor_ms`
again, which is intentional: an overlap is skipped by id, while an exclusive boundary risks losing
same-second items.

Alternative — advance after every full page — is rejected because a 500-item response proves that
older items inside the same window still exist. Alternative — hold all pages in memory and commit
the account only at the end — makes a long first sync lose hours of completed work on suspension.

### D5. Request pacing and time are ports, not sleeps in the engine

The coordinator serializes personal-API requests and enforces the API's minimum request gap through
an injected `wait(ms)` and monotonic `nowMs()`. Production uses a cancellable timer; tests use a
recording no-wait fake. Progress has an explicit waiting state, so a long first sync does not look
frozen. Invalid-token marks the current and all not-yet-attempted links invalid without sending the
same rejected secret repeatedly. Rate-limited and unavailable outcomes finish that account without
advancing it; after the normal gap the coordinator can continue with the remaining links, producing
one terminal outcome per link as specified.

The first boundary's calendar date is validated as `IsoDate` and converted once to device-local
midnight by an injected adapter when the link is created; both the date (for display) and instant
(as the initial cursor) are stored. Statement-item dates continue to use the existing injected
`dateOf` converter. No `Date`, timezone, delay or randomness enters `src/domain/**`.

Alternative — retry 429 automatically in a loop — is rejected because it can turn a manual action
into an unbounded wait and obscures the typed outcome the owner needs to see.

### D6. Token validation and account refresh are staged, never half-adopted

Validation calls client-info with the candidate. Only an `ok` result proceeds to secure storage;
after the secure write succeeds, the fetched monobank accounts are upserted into SQLite. If that
database refresh fails, the valid token remains safe and the next opening can refetch; no link or
financial history is changed. Invalid-token, rate-limited and unavailable never touch the stored
token.

Opening the route with a configured token first renders cached account/link data, then refreshes
client-info. That keeps an offline screen useful while an unavailable banner makes the staleness
honest. Removing the token deletes only the secure-store key. Replacing or removing it never clears
tables, links, balances, seen ids or transactions.

Alternative — delete the old token before validating a replacement — is rejected because a typo
or temporary outage would destroy a working connection.

### D7. `description` becomes a nullable transaction column and a read-only display field

Add nullable `transactions.description` through the same generated migration and thread it through
`toTransactionRow`/`toTransaction`. Older rows load with no property; an absent description stores
NULL. Existing upserts preserve the optional field for every transaction type. Feed view-models
show a non-empty опис as secondary text while keeping category/source and account labels distinct;
the edit route shows it read-only and every existing retype/edit path already preserves it.

Alternative — store the merchant text in the category/source label — is rejected because it would
change totals' vocabulary and blur precisely the «Без категорії» / «Без джерела» states the owner
must resolve.

### D8. «Без джерела» uses the existing reserved-row adoption pattern

Add «Без джерела» to `STARTER_SOURCES`, add `UNSOURCED_SOURCE_ID` to `isReservedSource`, and exclude
it from active manual source choices while keeping it visible in source management. Generalize
`adoptHandCreatedInterest` into an atomic reserved-source adoption used for both «Відсотки» and
«Без джерела»: create the reserved id, repoint existing доходи with the same hand-created name,
then delete the stray row. `docs/glossary.md` gains «Без джерела» as an imported arrival's visible
starting state, never a verdict and never a refund classification.

This remains startup seeding, not hand-written migration data: the schema can land without the row,
and the existing seed transaction is the safe place to reconcile user-created names after all
migrations have applied.

### D9. Рахунки joins computed balances to cached bank metadata at the UI seam

On focus, the accounts route loads accounts and their transaction-derived balances as today, plus
links joined to cached monobank accounts keyed by app account id. `src/ui/account-groups.ts` (or a
sibling pure view-model) adds optional bank-balance presentation without putting it on the domain
`Account`. «Звірити» calls the existing pure `reconcile` with today's local date and saves the
returned коригування through `transactionsRepo`; equal balances produce no write. A confirmation
names the signed difference before saving.

Alternative — add `bankBalance` to `Account` — is rejected because an API observation is cached
external metadata, not part of the owner's рахунок or its computed truth.

### D10. Every behavioural path stays in the fast test layers

Vitest covers coordinator outcomes/pacing/cursor rules with synthetic API answers and injected
ports; monobank repository tests use the real generated migration in in-memory SQLite; source
adoption and transaction-description tests extend existing DB/domain suites; screen view-model
tests cover link filtering, status copy, description rows and reconcile rows. The React Native route
is wiring only and receives a manual checklist, consistent with `.claude/rules/testing.md`.

No test imports `expo-secure-store`. A contract test runs against the in-memory token adapter; the
native adapter is typechecked. No real token, personal payload, network call, timer wait, emulator or
native build joins `npm run verify`.

## Risks / Trade-offs

- [A first sync across many accounts can take minutes because personal-API calls are serialized] →
  show waiting/account/window progress, commit each page, and make leaving/retrying safe.
- [The app may stop after a full page before that window's cursor advances] → durable item ids make
  the repeated page harmless; the next run continues paging and eventually advances the window.
- [A user chooses a boundary that overlaps Saldo history] → require explicit confirmation and state
  that cross-source deduplication is absent; duplicates remain ordinary editable transactions.
- [Secure storage can be unavailable or a native write can fail] → keep the old token until a
  validated replacement write succeeds and surface an unavailable state without logging the value.
- [A token replacement belongs to a different monobank owner] → account ids not returned by the
  new token remain cached and visibly disconnected; no link, seen id or transaction is deleted or
  silently reassigned.
- [A stale cached bank balance can be mistaken for current truth] → store `obtained_at`, call it the
  latest known баланс банку, and refresh it only from successful client-info; «Звірити» confirmation
  shows the exact difference before creating a correction.

## Migration Plan

1. Add the nullable description column and three monobank tables to `src/db/schema.ts`, then run
   `npm run db:generate`; commit the generated SQL, snapshot, journal entry and regenerated
   `drizzle/migrations.js` without touching migrations 0000–0004.
2. Run migration tests first against a populated pre-change database and then against an empty
   database. Existing rows must load unchanged; description is NULL; monobank tables are empty.
3. Land source adoption and repositories before exposing the route, then land the coordinator and
   secure-store adapter, then the settings/accounts/feed UI. A partially staged build therefore has
   storage that old UI safely ignores.
4. Rollback is code-only: the previous app version ignores the nullable column and extra tables;
   no down migration or data deletion is performed. The secure-store key and monobank metadata stay
   on-device for a forward fix, while the previous version continues to read all old financial data.
