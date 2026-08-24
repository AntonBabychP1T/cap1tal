# domain-core

## Why

Every later step (persistence, screens, imports, monobank sync) needs one shared, tested model of
what money, accounts, transactions and the monthly numbers *are*. Without it each feature would
re-invent the rules ("is a jar top-up spent?", "is a refund income?") and the owner could not trust
the numbers — the core problem the product exists to solve: *"I don't know where my money went this
month"* and *"I don't know how much I can still spend."* This change is step 1 of the tech task
(covers FR-T1–T7 and FR-M2) and unblocks db-schema and every screen.

## What Changes

- Introduce pure TypeScript domain code under `src/domain/` — no React, Expo, Drizzle, I/O, clocks
  or randomness (per `.claude/rules/domain.md`).
- Money value: integer amount in minor units + ISO-4217 currency code; same-currency arithmetic
  only; cross-currency operations are a type/runtime error.
- Account entity with kind `spending` / `savings` / `investment` / `cash` / `debt`; the kind is what
  decides how a transfer into the account is counted in the month.
- Transaction types: `expense` (the default), `income`, `transfer`, `refund`, `correction`, with the
  glossary semantics: refund = negative expense in the same category; correction has its own
  category, negative counts as spent, positive as income; a cross-currency transfer carries two
  amounts and no rate; a same-currency transfer that arrives short yields a proposed "Fees" expense;
  a foreign-currency purchase from a UAH card is spent in UAH with the original-currency amount kept
  as information.
- Monthly picture computation for a calendar month, per currency: **spent**, **invested**,
  **saved**, **lent**, **income**, **left** = income − spent − invested − saved − lent, with the
  identity held as a property test.
- Vitest tests (including property tests) colocated with the source.

### Non-goals

- No persistence, no Drizzle schema, no repositories (change: db-schema).
- No screens or UI wiring; the scaffold demo app stays untouched (change: accounts-manual-transactions).
- No categorisation rules engine, starter category set, limits, goals or reports (later changes).
- No approximate-UAH conversion (needs monobank's current rate — display concern, FR-M3, later).
- No interest-on-repayment proposal (FR-T9 — arrives with saldo-import / debt flows).
- Nothing from vision §13 "Explicitly not in v1" is touched.

## Capabilities

### New Capabilities

- `money`: money as integer minor units + currency code; permitted arithmetic; the ban on
  cross-currency sums and on floats.
- `accounts`: the account entity and the five account kinds; the kind — not the name — decides how
  money moving into the account is classified.
- `transactions`: the five transaction types, expense-by-default, and the semantics of transfer,
  refund, correction, fee and original-currency amount (FR-T1–T7).
- `monthly-picture`: the per-currency monthly numbers for a calendar month and the identity
  income = spent + invested + saved + lent + left (FR-M1 period, FR-M2 numbers).

### Modified Capabilities

None — this is the first change; `openspec/specs/` is empty.

## Impact

- New code: `src/domain/` (types + pure functions + colocated `*.test.ts`).
- Possibly a new dev dependency for property-based testing (decided in design.md).
- No changes to `src/app/`, `src/db/`, Expo config or migrations.
- `npm run verify` stays Node-only and under a minute.
