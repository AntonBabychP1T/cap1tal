# saldo-import-screen — design

## Context

The engine is archived and unchanged: `src/saldo/` exposes `parseSaldoExport(text)` →
`survey(transactions, existing)` → `interpret({transactions, decisions, existing})` → `ImportPlan`,
and `verify({...})` → `Report`. It is pure — no clock, no I/O, no Drizzle — and every shape the
owner's real export holds is already covered by its tests. See proposal.md — Why.

What is missing is everything around it: getting the CSV text off the device, letting the owner
build the `Decisions` the engine takes, showing the `Report`, and writing an `ImportPlan` into
SQLite. Two project constraints shape all of it:

- `npm run verify` is Node-only and never runs JSX (CLAUDE.md). So anything worth testing has to
  live outside `.tsx`, in `src/ui/` as pure TypeScript — the rule the screens already follow.
- Migrations are append-only and every schema change needs a generated migration plus a test that
  runs all migrations on an empty in-memory database (`.claude/rules/database.md`).

## Goals / Non-Goals

**Goals:**

- The owner's decisions are built by pure functions that Vitest exercises without a device.
- The plan reaches SQLite as one unit — the balances the report proved are the balances the app
  shows afterwards, or nothing changed at all.
- FR-T9 reuses the shape the комісія proposal already established, rather than inventing a second
  vocabulary for "the app noticed something and asks".

**Non-Goals:**

- No state container, no navigation library, no form framework: the flow is one screen holding
  one state object, the same way `transaction/[id]` holds its form.
- No streaming or chunked parsing. The owner's export is ~2 400 transactions / a few hundred KB;
  reading it whole is milliseconds and the engine already takes one string.

## Decisions

### 1. The flow is a pure reducer in `src/ui/saldo-import.ts`; the `.tsx` only renders and touches native

`src/ui/saldo-import.ts` holds the flow state — which step, the parsed transactions, the owner's
`Decisions` so far, the derived `Survey`, `ImportPlan` and `Report` — and pure transitions over
it: `startWithText`, `redirectAccount`, `setKind`, `redirectName`, `assignDescription`,
`assignTransaction`, `undo…`, `toStep`. Every transition returns a new state; deriving the plan is
just calling the engine again, which is deterministic by its own spec, so there is no cache to
invalidate.

`src/app/manage/saldo-import.tsx` does three things the reducer cannot: it calls
`expo-document-picker` and `expo-file-system` to get the text, it renders the state, and it calls
the repository to commit.

*Alternative considered:* a hook with `useReducer` holding the logic inline. Rejected — the logic
would then live in a `.tsx` that `verify` never runs, which is exactly what `src/ui/` exists to
prevent.

*Alternative considered:* re-deriving only what changed (incremental survey/interpret). Rejected as
premature: interpreting 2 400 transactions is a few milliseconds of pure array work, and
correctness here is worth more than a redraw budget.

### 2. Native modules: `expo-document-picker` and `expo-file-system`, imported only from the `.tsx`

`expo-document-picker` returns a content URI for the chosen file; `expo-file-system` reads it as
UTF-8 text. Both are Expo modules already compatible with SDK 57 and need only a native rebuild —
no manifest permission on Android (the picker is a system activity, the URI is granted per pick),
no new plugin entry in `app.json`, no hand edit under `android/`. Neither is imported by anything
`verify` loads: the reducer takes text, never a URI.

*Alternative considered:* pasting the CSV into a text field, avoiding both dependencies. Rejected —
a few hundred KB of CSV through a `TextInput` is not a thing the owner can do.

### 3. The commit is one Drizzle transaction in `src/db/import-repo.ts`

`importRepo(db).commit(plan, now)` runs inside `db.transaction(tx => …)` — synchronous on both
drivers, as the repositories already assume (`src/db/storage.ts`) — and inside it: insert the
рахунки the plan creates, update the початковий залишок of the ones it maps onto, insert the
категорії and джерела, insert every транзакція in the plan's order, and write the import marker.
A throw anywhere rolls the whole thing back, which is what the persistence delta's "stores nothing"
scenario asserts. The repository writes through the existing repos' mappers rather than raw rows,
so a `PlannedTransaction`'s `Transaction` is stored exactly as a hand-recorded one is.

Ids: the plan already carries ids (`saldo:account:…` and friends from `survey.ts`). Those are
placeholder keys, not storage ids, so the commit maps each to a fresh app id via `src/ui/id.ts`
before inserting, and rewrites every reference in the plan through that map. Storing the
placeholder text as a primary key would leak the import's vocabulary into the database forever.

Each транзакція is stored one millisecond after the one before it, in the plan's order. `createdAt`
is storage metadata and the tie-break between транзакції of one calendar date; writing the whole
import under a single instant would leave every same-date group to the last tie-break — the id,
whose suffix is random — and Saldo's intra-day order, which the engine spec keeps on purpose, would
come back shuffled. Storing them one after the other is not a fabrication: it is what the commit
does.

*Alternative considered:* committing step by step with progress. Rejected — partial history is
precisely what the "one whole" requirement forbids, and the whole write is well under a second.

### 4. The import marker is a one-row table, not a settings key-value store

New table `saldo_import`: `id text primary key` (always `'saldo'`), `committed_at integer`
(epoch ms, `{ mode: 'timestamp_ms' }` per the database rules). One generated migration adds it;
nothing else changes, so the existing rows are untouched by construction.

*Alternative considered:* a general `app_settings` key-value table, anticipating the monobank token
and бекап. Rejected — the token is step 7's decision to make, and a table invented for a user that
does not exist yet is the kind of guess hard rule 8 forbids. `now` is passed into `commit`, never
read from a clock inside it, so the marker is testable without freezing time.

### 5. FR-T9 lives beside the fee proposal, and takes the balance as an argument

The interest proposal is a pure function in `src/ui/entry-form.ts` next to the existing fee
proposal: given the переказ being recorded, the source рахунок's kind and currency, the
destination's currency and the source's розрахунковий баланс *before* this переказ, it returns
either nothing or the дохід to propose. The screen supplies the balance — it already loads
accounts and their transactions — so the function stays pure and the rule "balance is derived,
never stored" is untouched.

The dialog reuses `src/components/fee-dialog.ts` if its shape fits a second proposal without
contortion; if it does not, it gets a sibling rather than a parameter that means "which of two
unrelated things am I". Either way the accept/decline semantics mirror the комісія exactly, which
is why the spec's scenarios read the same.

*Alternative considered:* making the **import** split over-repayments into principal + «Відсотки».
Rejected — the archived engine spec says a repayment moves back exactly what its leg says and the
report shows the resulting negative рахунок-борг, and FR-T9 is a proposal the owner accepts, which
is a per-transaction decision the import has no way to collect for 30 «Борг» rows.

### 6. «Відсотки» is a reserved джерело, seeded unconditionally, adopting a hand-created row

It joins `src/db/starter-set.ts` under a stable slug id, and `src/domain/category.ts` gains
`RESERVED_SOURCE_IDS` / `isReservedSource` beside the three reserved category ids. Reservedness
stays where that module already puts it — "the id is one of these", in code, never a column — so
the manage lists get their non-renamable, non-archivable behaviour from the same check they
already apply to «Комісія».

Reserved rather than ordinary because FR-T9 has the same dependency the комісія proposal has: the
app itself picks the row, so the row has to exist under its name. An ordinary «Відсотки» could be
archived, and the archived-row rule then forbids offering it — the proposal would name nothing.

Seeding cannot be conditional on an import having happened: FR-T9 fires on a hand-recorded
repayment too. And it cannot simply insert, because the spec this change replaces told the owner
to create «Відсотки» by hand, so a device may already hold one under a generated id.

The adoption therefore happens in `src/db/seed.ts`, beside the "create only what is missing" pass:
when a джерело named «Відсотки» exists under an id that is not the reserved one, insert the
reserved row, repoint the доходи that referenced the old one, delete it — all in one database
transaction. `sources` has no unique index on `name` and `transactions.source_id` restricts on
delete, so that order is the one that holds; after the first opening the condition matches nothing,
which is what makes it safe to run on every open.

*Alternative considered:* hand-written data statements in the new migration, the way migration 0003
had to seed the reserved categories. Rejected — `.claude/rules/database.md` allows those only when
the schema change cannot land without them, and `CREATE TABLE saldo_import` lands perfectly well
without any adoption; nothing references the reserved джерело id until FR-T9 stores a дохід at
runtime. A committed migration is immutable, so borrowing that clause for convenience is a door
that does not close again. Widening the rule is the owner's call, not this change's.

### 7. The комісія proposal steps aside for a рахунок-борг

Both proposals fire on "a same-currency переказ whose numbers do not look plain", and a repayment
of 110000 arriving as 109500 out of a рахунок-борг owed 100000 satisfies both — with two different
stored outcomes. Rather than a precedence rule, they are made mutually exclusive: no комісія for a
переказ out of a рахунок-борг (a person is not a bank; the shortfall is not a fee), and no
відсотки unless the two legs are equal. The unequal case out of a рахунок-борг then proposes
nothing at all and stores exactly what the owner entered, which loses no money and invents no
intent.

*Alternative considered:* letting both fire, комісія computed on the principal. Rejected — it
turns one repayment into three stored transactions from two proposals the owner answers in
sequence, for a shape that has never occurred in the owner's history.

## Risks / Trade-offs

- **`db.transaction` on `expo-sqlite` behaves differently from `better-sqlite3`** → The tests run
  the real commit path on `better-sqlite3`; the emulator smoke test (`scripts/android.sh`) commits
  a small real export before the change is called done. If the driver turns out to need an async
  transaction, the repository — not the reducer — is the only thing that changes.
- **A committed import cannot be undone** → The marker plus the extra confirmation makes doubling
  the history a deliberate act, and the report shows what will land before anything is written.
  Real undo waits for бекап (step 11); this is stated as a non-goal, not hidden.
- **The reducer re-runs the engine on every keystroke of a decision** → Bounded by the export's
  size; if the owner's real file makes a step feel slow on the device, the fix is memoising the
  derivation in the screen, which changes no behaviour and no spec.
- **The adoption runs on every opening, not only the first** → It is conditional on a row named
  «Відсотки» under another id existing, so from the second opening on it matches nothing. The seed
  test covers both: a database that holds such a row with a дохід on it, and one that does not.
- **The account-map step is the widest UI in the app so far** (27 real accounts, each with a вид, a
  redirect target and a currency) → It renders as a plain list of rows, one row per entry, with the
  same controls the manage lists already use; nothing new is invented for it.

## Migration Plan

One new migration adding `saldo_import`, generated and untouched — it creates a table and changes
no existing one, so applying it to a device holding the current shape is purely additive. The
«Відсотки» adoption is not part of it; it lives in the seed (§6), where it is idempotent and
reversible by editing code rather than frozen into migration history. Rollback
is not a concept here: migrations are append-only and the app is one person's device — an unwanted
marker is one row, and the change ships with the test that runs every migration from empty.
