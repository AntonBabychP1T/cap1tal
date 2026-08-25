# saldo-import — proposal

## Why

The owner still keeps the real books in Saldo: the export sitting in the repo root spans
2024-10-27 → 2026-08-23 — 2 416 transactions across 27 real accounts in UAH, EUR and USD.
cap1tal became usable for daily manual tracking at step 5, but until that history and those
balances move over, the app can answer neither "where the money went" nor "how much is left"
about the owner's actual money. Step 6 of tech-task §5 (FR-X1–X5, FR-A4, FR-T9) is that move.

The BACKLOG entry pre-authorises splitting this step if it is too big, and it is: parsing and
interpreting a double-entry export with account merging, debt mapping, in-transit pairing and
balance verification is a full change by itself before any screen exists. This change is the
**engine**: everything about the import that is pure TypeScript — from CSV text to a verified,
owner-confirmable import plan. A follow-up change (`saldo-import-screen`) adds the Налаштування
flow that collects the confirmations, commits the plan to storage, seeds «Відсотки» and adds the
FR-T9 interest proposal.

## What Changes

- New pure module `src/saldo/` (sibling of `src/monobank/`): no I/O, no React, no Drizzle —
  CSV text and the owner's decisions in, an import plan and a verification report out.
- Parse the Saldo export CSV: RFC-4180 quoted fields — 34 of the owner's descriptions hold a
  line break and 14 a doubled quote — header check, exact decimal → integer minor units,
  ISO datetimes → calendar dates, legs grouped into transactions by Transaction ID (FR-X1).
- Interpret double-entry legs into cap1tal transactions: витрата / повернення / дохід /
  коригування / переказ, cross-currency transfers with two amounts, foreign-currency purchases
  with an original-currency amount, initial balances → opening balances.
- Account map (FR-X2, model half): every Saldo (account, currency) maps to a new or existing
  рахунок with a вид; duplicates of one card merge by redirecting entries of the map; the map is
  input the owner will confirm in the follow-up screen.
- «Борг» history → рахунки-борги (FR-X3, model half): lending legs become transfers onto a debt
  account, repayments transfers back; the person comes from an owner-supplied assignment, per
  «Борг» transaction with a description assigning every transaction that carries it — two of the
  30 «Борг» rows have an empty description, so a description alone cannot be the identity.
  Unassigned entries are surfaced, never guessed silently.
- MONEY_ON_THE_WAY pairs collapse into single transfers (same- and cross-currency); the
  three-legged fee transaction becomes переказ + витрата «Комісія»; unpairable in-transit legs
  are reported, not dropped silently (FR-X4).
- Verification report (FR-X5): per resulting account, the balance Saldo implies at export time
  vs the balance the plan would compute; every mismatch and every skipped or unexplained row is
  listed for the owner to see before anything is committed.
- A dev-only dry-run script that runs the whole engine on the owner's real (gitignored) export
  and prints the plan summary and the verification report — real-data feedback before the UI
  exists.

## Non-goals (this change)

- No UI, no Налаштування section, no file picking, no new native module or Expo config change.
- No writes to the database and no schema change; committing the plan is the follow-up change.
- No FR-T9 and no seeding of the «Відсотки» source — they ship with the screen change, where
  repayments can actually be recorded. A repayment above the principal stays one переказ back
  here; the report shows the resulting negative рахунок-борг rather than inventing an interest
  split the owner has not confirmed.
- No accrual-month handling: 3 rows carry an Accrual Month different from their date; vision §13
  keeps "перенесення транзакцій між місяцями" out of v1, so the import deliberately uses the
  transaction date and the report notes the three rows.
- FR-A4 needs no new behaviour: рахунок-борг per person already exists in the accounts
  capability; this change only creates such accounts through the map.

## Capabilities

### New Capabilities

- `saldo-import`: the one-time Saldo export import — parsing the CSV, interpreting double-entry
  legs into cap1tal transactions, the owner-confirmed account map and «Борг» person assignment,
  MONEY_ON_THE_WAY pairing, and the balance verification report.

### Modified Capabilities

- `transactions`: a дохід may carry a negative amount — money handed back out of an income. The
  engine emits it (one row in the owner's history), the accounts and monthly-picture capabilities
  already add a дохід's signed amount, and truth has to permit what the import stores. Recording
  one by hand stays impossible; main-screen already rejects a non-positive amount.
- `categories`: the seeding requirement says «Відсотки» arrives with "saldo-import (FR-T9)". This
  change is `saldo-import` and deliberately seeds nothing, so the sentence is redirected to the
  follow-up confirm screen rather than left false the moment this change archives.

<!-- main-screen and settings-screen deltas belong to the follow-up saldo-import-screen change -->

## Impact

- New code: `src/saldo/` (parser, interpreter, plan, verification) with colocated Vitest tests
  on synthetic fixtures mirroring every shape found in the real export.
- New dev script: `scripts/saldo-dry-run.ts` (run by hand, never part of `verify`).
- No schema, migration, native or Expo config changes. One new devDependency: `tsx`, dev-only,
  for the dry-run script — it never enters `verify`, which stays Node-only and under a minute.
- Follow-up change `saldo-import-screen` will touch: settings-screen (import section),
  persistence (atomic commit), categories («Відсотки» seed), main-screen (FR-T9), and add a
  document-picker dependency.
