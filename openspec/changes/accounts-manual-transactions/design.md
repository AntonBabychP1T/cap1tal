# accounts-manual-transactions — design

## Context

Domain (`src/domain/`) and storage (`src/db/`) are done and specced: `Account`, five transaction
types, `computeBalance`, `classifyTransfer`, `proposeFee`, repos over one `transactions` table,
one committed migration. The app shell (`src/app/_layout.tsx`) already applies migrations at
startup and renders template demo tabs. `npm run verify` runs Node-only Vitest over
`src/**/*.test.ts`; React Native screens are never executed by it. See proposal.md for
motivation and scope.

## Goals / Non-Goals

**Goals:**

- Two real screens (Головний, Рахунки) plus transaction editing, thin over tested pure modules.
- Account archival and the latest-transactions feed as specced, with one new migration.
- Keep `verify` Node-only and under a minute; no new dependencies, no native modules, no Expo
  config changes.

**Non-Goals:**

- No visual polish contract — layout/styling details are not specced and may change freely.
- No state-management library, no data-fetching layer; screens call repos directly.
- No i18n framework: UI strings are hardcoded Ukrainian glossary terms.

## Decisions

### 1. `archived` lives on the domain `Account`; filtering is a domain helper

`Account` gains `archived: boolean` (default `false` in `account()`). A pure
`activeAccounts(accounts)` helper returns the ones offered for new transactions — screens use
it, tests prove it. Alternative — a storage-only flag — rejected: "not offered as a choice" is
domain behaviour the accounts spec owns, not a storage detail.

### 2. Kind and currency immutability is enforced in `accountsRepo.save`

`save` stays the single write path (insert or update under the same id) but first loads the
existing row; if the stored kind or currency differs, it throws. Every future account write path —
saldo import, monobank sync, backup restore — therefore has to go through `accountsRepo.save`;
the guard lives there and nowhere else. Alternative — separate
`create`/`rename`/`archive` repo methods — rejected as API churn: the CHECK-style guard in one
place keeps the persistence spec's "replace under the same id" shape and satisfies the accounts
delta's rejection scenarios.

### 3. Feed order: `date DESC`, then storage recency via a `created_at` instant

The domain transaction stays date-only and clock-free. The repo records storage recency:
`transactions.created_at` — `integer { mode: 'timestamp_ms' }` per database.md — set on insert
from a `storedAt: Date` argument (`save(t, storedAt)`), and deliberately excluded from the
`ON CONFLICT DO UPDATE` set so replacing keeps the original instant (spec: replacing keeps its
place). Callers pass `new Date()`; tests pass fixed instants. `listLatest(limit)` orders by
`date DESC, created_at DESC, id DESC` (id as a deterministic last tiebreak). Alternative — an
autoincrement sequence column — rejected: ids and rows are app-generated text by rule, and an
instant doubles as honest metadata for future backup.

### 4. One new migration, generated, append-only

`npm run db:generate` after adding `accounts.archived` (`integer { mode: 'boolean' } NOT NULL
DEFAULT 0`) and `transactions.created_at` (`NOT NULL DEFAULT 0`). Existing committed migration
untouched. `DEFAULT 0` for `created_at` is safe: no released install exists, and rows predating
the migration merely sort last within their date.

### 5. Screen logic that can be pure TypeScript lives in `src/ui/`, under Vitest

New directory `src/ui/` (pure TS, no React imports) — covered by the existing
`src/**/*.test.ts` Vitest include:

- `amount-input.ts` — parse a typed major-units string ("125.50", "125,50", "200") into `Money`
  by integer string arithmetic (split on the separator; no floats, per domain.md the parsing
  stays out of `src/domain/`), rejecting non-numbers, non-positive values and more fractional
  digits than the currency's minor unit (2 for UAH/EUR/USD); plus `formatMoney` for display.
  Comma is accepted as the decimal separator because the UI locale is Ukrainian.
- `account-groups.ts` — `groupAccountsByKind(accounts)`: the Рахунки sections as pure data —
  a fixed вид order (`spending`, `savings`, `investment`, `cash`, `debt`), archived accounts kept
  out of every вид group and collected in a final `archived` group, empty groups omitted, the
  incoming name order preserved. Extracted from the screen so the accounts-screen capability has
  automated proof rather than smoke alone. The date needs no module here: `isoDate` and `monthOf`
  already own parsing and month derivation.
- `id.ts` — app-generated text ids: `Date.now().toString(36)` + random suffix. One phone, one
  writer — collision-safe in practice. Alternative — `expo-crypto` randomUUID — rejected for
  now: it is a new native module for no present gain; the backup change can revisit id strength
  without a schema change (ids stay TEXT).

Screens import these plus domain functions (`expenseByDefault`, `transfer`, `proposeFee`,
`computeBalance`, `activeAccounts`) so every branch that matters is exercised by `verify` even
though the JSX is not.

### 6. Screens and navigation

Expo-router files, replacing the template demo:

- `src/app/index.tsx` — Головний: quick-add (сума, рахунок picker from `activeAccounts`, toggle
  витрата/переказ, date defaulting to today and changeable) above the feed from `listLatest`. A
  same-currency переказ offers an optional «скільки прийшло» defaulting to the сума that left.
  Fee proposal is a confirm dialog driven by `proposeFee` over the candidate переказ; accepting
  stores the trimmed переказ plus the "Комісія" витрата (see §8). With no рахунок to choose the
  form says so and points at Рахунки.
- `src/app/accounts.tsx` — Рахунки: sections from `groupAccountsByKind` (вид groups + "Архів");
  balances via `computeBalance(account, listByAccount(id))`; create/edit forms (вид and валюта
  disabled when editing). With no accounts the screen invites creating the first рахунок.
- `src/app/transaction/[id].tsx` — editing: amount, date, account(s), retype витрата ↔ переказ,
  delete with confirmation. Retype builds the new shape under the same id and calls `save`. Its
  account pickers take one list per leg from `src/ui/account-choices`, so an archived account is
  never offered as somewhere to move money to while the leg already on it keeps showing it.
  Choosing an account of another currency clears the сума touching it — the spec asks for it to be
  entered anew, and keeping the digits would silently reinterpret 125,50 UAH as 125,50 USD.
  A транзакція this step cannot record — дохід, повернення, коригування — opens read-only with
  only "видалити": a screen must render something, and half-editing a type whose джерело and
  категорія do not exist yet would invent behaviour no spec asks for. They become editable with
  the steps that can record them.
- `_layout.tsx` keeps migrations + splash and renders a **Stack**, not the tabs themselves: the
  tabs are a `(tabs)` group under it and editing one transaction is pushed on top of whichever tab
  opened it. Making `NativeTabs` the root layout leaves a route with no trigger — like
  `transaction/[id]` — unreachable, with nothing to push it onto; `verify` cannot see this and the
  bundle still builds, so it surfaced only in the manual smoke (task 4.5). Template demo files
  (`explore.tsx`, hint-row, external-link, web-badge, collapsible, app-tabs demo content) are
  deleted or rewritten; whatever nothing references is removed. `AnimatedSplashOverlay`,
  themed-text/view and the theme hooks stay.

Data freshness without a store: screens re-query on focus (`useFocusEffect`) and after their own
writes. The editing screen is the one place this is not symmetrical: its form is built once from
the stored transaction, so a refocus does not reload the fields the owner is typing into. With one
edit path and one phone nothing can change the row underneath it; a second edit path (import,
sync) would have to reconcile the form, not just the query. Synchronous SQLite keeps this trivial; ~5k transactions is well inside the perf budget
(balances computed in the domain per database.md — SQL aggregation only if measured slow).

### 7. Verification split

`verify` proves: domain (`archived`, `activeAccounts`), `src/ui` modules, repos + migration over
in-memory SQLite (every persistence/accounts delta scenario has a named test). Screen deltas
(`main-screen`, `accounts-screen`) are proven by tests of the modules that implement their
behaviour where possible (amount parsing, ordering, fee proposal, retype-under-same-id at repo
level) — the JSX wiring itself is compile-checked by `tsc`/`eslint` and smoke-checked via the CI
android job; this split is stated per-task in tasks.md, as testing.md demands.

### 8. The accepted-fee shape: the переказ is trimmed, the комісія carries the difference

A same-currency переказ that arrived short is two different movements: money that moved between
the owner's own accounts, and money that left to the outside world. Accepting the proposal stores
them as such — `transfer` with the сума that arrived on **both** legs, plus the "Комісія"
`expense` for the difference on the source account. Their sum is what the bank debited, so the
source's розрахунковий баланс falls by exactly the сума that left it. Declining stores the typed
legs unchanged (100000 / 99500): the balance is the same, the 500 simply has no name.

Rejected alternatives, so they are not relitigated:

- *Store the typed legs plus the fee.* This is what `openspec/specs/monthly-picture/spec.md`
  ("Jar top-up arriving short is saved at what arrived") names in its WHEN, and it double-counts
  the комісія on the source balance: `computeBalance` subtracts `left` (100000) **and** the fee
  (500), so an account that lost 100000 shows −100500 — measured, opening 1000000 → 899500. Only
  a коригування could repair it, and корекції arrive with step 7.
- *Net the fee out inside `computeBalance`.* Breaks the archived accounts rule that the balance is
  the opening balance plus the effect of every transaction, and would force MODIFIED deltas
  against two archived capabilities.

The archived monthly-picture THEN stays true either way (saved 99500, spent 500, left −100000 —
numerically identical), and declined shortfalls still store unequal legs, so the clause "a
shortfall is accounted for exactly by its proposed fee expense" keeps a live case. Consequence to
know: `proposeFee` is a pre-store proposal computed from the form input, never re-derivable from
an accepted stored row — a stored переказ with equal legs proposes nothing when reopened.

## Risks / Trade-offs

- [UI wiring untested by `verify`] → all decision logic in `src/ui` + domain + repos with named
  scenario tests; screens stay declarative glue; manual smoke on Android before archive.
- [Deleting template components may break the web entry or lint] → remove leaf-first, run
  `verify` after each removal task; `npx expo-doctor` not needed (no config change).
- [`save(t, storedAt)` signature change touches existing tests] → mechanical update in the same
  task as the repo change; no behaviour of stored data changes.
- [Ids from `Math.random` are not UUIDs] → acceptable single-device risk, revisited by the
  backup change; ids remain opaque TEXT so nothing depends on their shape.
- [Editing opening balance can silently rewrite history's meaning] → it only shifts the computed
  balance (spec scenario); the Рахунки edit form shows the resulting balance immediately.

## Open Questions

- Exact visual layout (list density, grouping headers, icons) — free to evolve; nothing in specs
  pins it.
- Whether the feed needs paging beyond `listLatest(N)` for daily use — N=50 to start; a later
  change can add "показати всі".
