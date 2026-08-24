# domain-core — design

## Context

See proposal.md — Why. `src/domain/` is empty; this change creates it. Constraints that shape the
approach (from `.claude/rules/domain.md`): the domain is pure TypeScript — no React/Expo/Drizzle
imports, no I/O, no clocks, no randomness; money is integer minor units + currency code; glossary
terms are used verbatim as identifiers. `npm run verify` (openspec validate → eslint → tsc →
vitest) must stay Node-only and under a minute. Vitest 4 is already installed; no property-testing
library is.

## Goals / Non-Goals

**Goals:**

- One place where the four delta specs (money, accounts, transactions, monthly-picture) are
  expressed as types and pure functions, testable without a device or a database.
- Types that make illegal states hard: a transaction is a discriminated union, exhaustively
  matched, so adding a sixth type later is a compile error everywhere it matters.
- The monthly identity (income = spent + invested + saved + lent + left) proven by a property test.

**Non-Goals:**

- No persistence shape: db-schema decides tables and how the union maps to rows.
- No id generation, no `Date.now()` — ids and dates always come in from the caller.
- No formatting/parsing of user-facing amounts ("125.50") — that is a UI concern.

## Decisions

### D1. Money is `{ amount: number; currency: CurrencyCode }` with a validating constructor

`amount` is an integer in minor units, checked with `Number.isSafeInteger` at construction
(constructor throws otherwise); `CurrencyCode` is a string type for ISO-4217 codes with `'UAH'`,
`'EUR'`, `'USD'` as the known starter values (extensible, per FR-A1). `add`/`subtract` throw on
currency mismatch.

- *Why not `bigint`*: personal-finance magnitudes are far inside `Number.MAX_SAFE_INTEGER`
  (~9·10¹⁵ minor units); `bigint` complicates JSON, SQLite and React Native bridging for no gain.
- *Why not a class or branded type library*: plain readonly objects + factory functions keep the
  domain dependency-free and serialisable as-is.

### D2. Transaction is a discriminated union on `type`

`Expense` (category, optional `originalAmount` for FR-T7), `Income` (source), `Transfer` (two
account ids + `left`/`arrived` amounts), `Refund` (category), `Correction` (signed amount). The
default-is-expense rule (FR-T1) lives in the one factory that builds transactions from untyped
input, not scattered through consumers.

- `Transfer` always carries both `left` and `arrived` money values; for a same-currency transfer
  they share a currency. This makes the cross-currency case (two amounts, no rate) the same shape
  as the plain case instead of a special one.
- `Refund` stores a **positive** amount; the monthly picture subtracts it. Alternative — negative
  amounts inside `Expense` — was rejected: it hides the type in a sign and makes "refund" invisible
  in data.
- `Correction` stores a **signed** amount; the sign decides spent vs income (per spec). It carries
  no category field because its category is fixed by definition.

### D3. Reserved category ids as domain constants

The "Fees", "correction" and "Uncategorised" categories are domain facts, but the editable
category list arrives only in the categories-rules change. The domain exports three reserved
category id constants (`FEES_CATEGORY_ID`, `CORRECTION_CATEGORY_ID`, `UNCATEGORISED_CATEGORY_ID`);
later changes map them onto real seeded rows. Category and account references in the domain are
opaque `string` ids.

### D4. Dates are ISO strings, month is `YYYY-MM`

Transaction dates are `YYYY-MM-DD` strings; a month is a `YYYY-MM` string; membership is a prefix
check. No `Date` objects inside the domain — they drag in time zones and a clock, both banned.
Callers convert at the boundary.

### D5. Fee proposal is a pure function

`proposeFee(transfer)` returns the "Fees" `Expense` for a same-currency transfer with
`arrived < left`, else `null` (FR-T4 says *propose*; recording it is the caller's decision, and
the UI/db layers arrive in later changes).

### D6. Monthly picture is one pure function returning per-currency rows

`monthlyPicture({ month, accounts, transactions })` → a map keyed by currency code with
`{ spent, invested, saved, lent, income, left }`. Classification of a transfer uses both accounts'
**kinds** looked up from the passed accounts: a `savings`/`investment`/`debt` destination adds, a
`savings`/`investment`/`debt` source subtracts, and per the monthly-picture spec each contribution
is measured **cross-currency by the opposite leg** in that leg's currency (destination-classified
→ the amount that left, in the source currency; source-classified → the amount that arrived, in
the destination currency) and **same-currency by the classified account's own leg**
(destination-classified → arrived, source-classified → left), so a same-currency shortfall is
accounted for exactly by its proposed "Fees" expense with no double count. One classification
function is shared by the accounts and monthly-picture test suites so the two specs cannot diverge
in code.

`left` is computed from the other five, so the identity holds by construction; to keep the
property test able to fail, it recomputes the five nets independently from the raw transactions
(not via `monthlyPicture` internals) and asserts the identity against the function's output.

### D7. Add `fast-check` as a dev dependency

The tech task asks for property tests; fast-check is the standard for vitest, dev-only,
zero runtime impact. Property runs are capped (default 100 runs) so `verify` stays well under a
minute. No native modules, no permissions, no Expo config changes anywhere in this change.

## Risks / Trade-offs

- [`number` overflow on absurd inputs] → `Number.isSafeInteger` validation at every construction
  point; arithmetic helpers re-validate their result.
- [ISO date strings accept garbage like `"2026-13-99"`] → factory validates shape and calendar
  range; property tests generate only valid dates. Full timezone correctness is pushed to the UI
  boundary by construction.
- [Spec drift: two specs touch transfer classification (accounts, monthly-picture)] → one
  classification function used by both test suites, so the specs cannot diverge in code.
- [Discriminated union vs future DB rows mismatch] → accepted; db-schema owns the mapping and its
  own tests.

## Migration Plan

Purely additive — new files under `src/domain/` plus one dev dependency. No data, schema or config
migration; rollback is deleting the directory.
