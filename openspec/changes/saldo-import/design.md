# saldo-import — design

## Context

See proposal.md — Why. The engine turns one real artifact — the owner's Saldo export
(double-entry CSV, 4 833 rows, 2 416 transactions, 27 real accounts, UAH/EUR/USD balances with
PLN/HUF appearing only as purchase currencies) — into an import plan the follow-up screen change
will confirm and commit. Constraints that shape the design:

- `npm run verify` stays Node-only and under a minute; nothing here may touch native code.
- `.claude/rules/domain.md` forbids parsing decimal strings inside `src/domain/**` — the same
  reason `src/monobank/` exists as its own module.
- The real export is gitignored (personal data); committed tests can never depend on it.
- The schema is frozen for this change: no migrations, no DB writes, no new columns.

## Goals / Non-Goals

**Goals:**

- A pure, deterministic pipeline: export text + owner decisions in → plan + verification report
  out. Every stage a plain function over plain values, replayable by the screen change.
- Balance-preservation as the core invariant: whatever interpretation does, per-рахунок
  per-currency balances must reproduce Saldo's, and every deviation must be visible in the
  report (FR-X5), never silent.
- Real-data feedback before any UI exists (dry-run script on the owner's file).

**Non-Goals:**

- No storage, no screens, no seeding, no FR-T9 — see proposal non-goals.
- No fuzzy merge heuristics for duplicate accounts: proposing "one entry per Saldo account" and
  letting the owner redirect is enough for a one-time import of 27 accounts.
- No general-purpose CSV library and no streaming: the file is ~500 KB, read whole.

## Decisions

1. **Home: `src/saldo/`, sibling of `src/monobank/`** — source-specific interpretation code,
   pure TypeScript, no React/Expo/Drizzle imports. `src/domain/` keeps only timeless money
   rules; decimal-text parsing is exactly what domain.md exiles. Colocated `*.test.ts` run under
   the existing Vitest include. Alternative — `src/domain/saldo/` — rejected for the parsing
   rule above.

2. **Five pure stages, one serializable decisions value.**
   `parse(text) → SaldoTransaction[]` (legs grouped, minor units, calendar dates);
   `survey(txns) → Survey` (real accounts with currencies and proposals, category/source names
   with matches, distinct «Борг» descriptions, dropped zero-only pairs);
   `Decisions` (plain JSON-able object: account redirects + вид overrides, category/source
   redirects, «Борг» person assignments) — built by the future screen, hand-built in tests and
   the dry-run;
   `interpret(txns, survey, decisions) → ImportPlan` (рахунки to create, opening-balance
   settings, транзакції in export datetime order, category/source creations, unresolved list);
   `verify(export, plan, existing) → Report` — it re-reads the export because that is what it
   verifies the plan *against*, and the plan carries the (Saldo account, currency) → рахунок map
   so no decision has to be resolved twice; `existing` (current рахунки with their opening
   amounts, plus the транзакції already recorded by hand) is passed in as plain values so the
   engine never sees the DB.
   Rationale: the screen change composes these stages around UI steps without re-deriving
   anything; determinism (a spec requirement) falls out of value-in/value-out.

3. **Exact decimal parsing, no floats.** An amount must match `^\d+\.\d{2}$` (the whole export
   does); minor units = whole×100 + fraction, computed on integers from digit text. Any other
   shape rejects the file with row context. All five currencies in the export carry two decimals;
   the exponent comes from the text, not from a currency table. The 9 PLN and 6 HUF legs
   therefore become two-exponent amounts as well — they only ever appear as the informational
   original-currency amount of a foreign purchase, never in a total, so no exponent table is
   needed to keep them honest.

   The reader is RFC 4180, not a line splitter: 34 descriptions in the real export hold a line
   break and 14 hold a doubled quote, and splitting on newlines would shift 34 records into
   nonsense that the amount check would then reject — throwing away the one file this change
   exists for. Committed fixtures are synthetic (decision 11), so this is a case only the
   requirement and its scenario can defend.

4. **MONEY_ON_THE_WAY pairing is keyed, then nearest-date.** Departures (real CREDIT + MOTW
   DEBIT, optional Fees DEBIT) and arrivals (real DEBIT + MOTW CREDIT) bucket by key
   (source account, destination account, MOTW amount + currency); within a bucket both sides
   sort by datetime and match greedily nearest-first, earliest on ties. The departure's real leg
   minus its Fees leg always equals its MOTW leg (double entry), which is what makes
   "переказ carries the in-transit amount + separate «Комісія» витрата" reproduce the source
   balance exactly — the same shape main-screen's accepted-комісія already stores. Leftovers go
   to the report. The real export balances at 13 departures / 13 arrivals.

5. **«Борг» is assigned per transaction, grouped by description.** `Decisions` carries both a
   description → person map (the convenience: one answer covers every transaction carrying that
   description) and a transaction id → person map that overrides it. Description alone cannot be
   the identity: two of the export's 30 «Борг» rows carry an empty description, nine months and
   two рахунки apart, and a description-keyed assignment would force them onto one person or
   leave the plan permanently incomplete with no way out.

6. **An unrecognised shape is a reported row, never an exception.** Interpretation has no
   fallthrough that throws: a transaction it has no rule for becomes no транзакція and every one
   of its real legs is listed as unexplained with the effect that рахунок therefore misses. The
   verification report turns that into exactly one visible difference per рахунок — which is why
   the dry-run over the real export can be trusted to surface a shape no fixture anticipated.

7. **Plan rows carry stable saldo keys, not app ids.** Each planned транзакція carries its
   source Transaction ID(s) (a pair for collapsed MOTW transfers, an id+`/fee` suffix for the
   комісія). App ids are generated at commit time by the screen change; the engine stays
   replay-identical. Ordering: sort by (datetime, export row position) explicitly — the file's own
   order is the tiebreak; never rely on Map iteration order.

8. **Name matching includes archived rows.** A Saldo category/source name matches an existing
   row whether archived or not — stored транзакції may legitimately reference archived rows, and
   resurrecting a duplicate under an archived name would violate the categories capability's
   collision rules later. Unarchived match wins over archived when both exist.

9. **The negative дохід (one row: income handed back) stays a дохід.** Persistence's shape
   CHECK constrains no sign; the accounts capability adds an income's signed amount; the monthly
   picture sums signed доходи. An engine test proves the −27100 case flows through the domain's
   balance and monthly computations. Alternative — remap to витрата — rejected: it would need an
   invented category and would misstate the month's дохід. The transactions capability said
   nothing about the sign either way, so this change carries a MODIFIED delta that says it out
   loud rather than storing something truth does not describe.

10. **Dry-run script via a `tsx` devDependency.** `scripts/saldo-dry-run.ts`, run as
   `npx tsx scripts/saldo-dry-run.ts <file.csv>`, parses the real export with empty decisions
   and prints the survey, the unresolved «Борг» list and the verification report. New
   devDependency: `tsx` (dev-only, Node-only; no native module, no permission, no Expo config
   change). It never enters `verify`. Alternative — reuse vitest as a runner — rejected: files
   outside the test include don't run, and a "test" that needs a personal file would poison the
   suite.

11. **Fixtures are synthetic inline CSV strings.** Each test builds the smallest export
   exhibiting its shape, with numbers copied from the real file's anonymous rows (amounts,
   account types, journal types) but no personal descriptions beyond what the spec scenarios
   already quote. The real file stays gitignored and is exercised only by the dry-run.

## Risks / Trade-offs

- [The real export holds a shape no fixture anticipated] → the interpreter never throws on an
  unknown shape: the transaction lands in the report's unexplained list and unbalances exactly
  one рахунок's verification row, so the dry-run surfaces it before the screen change exists.
- [The owner has renamed starter rows since seeding, so by-name matches miss] → the plan
  proposes creation; the redirect decision (spec: category/source map) lets the owner point the
  name at the renamed row in the confirm UI. Nothing is guessed.
- [Opening-balance replacement on existing рахунки may fight balances the owner set by hand] →
  the report shows the replaced value and the resulting balance per рахунок before anything is
  committed; the owner sees the exact effect and can adjust after import (opening balance is
  editable per the accounts capability).
- [Descriptions, notes and tags are not persisted — the schema has no such columns] → they still
  drive «Борг» assignment and appear in the report, but the stored history loses them. Accepted
  for v1; revisiting is a screen-change (schema) decision, see Open Questions.
- [Merging two Saldo accounts can leave a переказ with both ends on one рахунок] → 281 BANK↔BANK
  and 6 CASH↔CASH transactions make this reachable the moment the owner merges duplicates. Such a
  move becomes no переказ (a транзакція connects two distinct рахунки) and is listed as a dropped
  row; being a credit and a debit of the same amount on one рахунок it is balance-neutral, so the
  рахунок still reconciles exactly and the report shows a row, not a difference.
- [Greedy nearest-date MOTW matching could mispair two identical same-day transfers] → within a
  key bucket the amounts and endpoints already agree, so a swap changes nothing observable
  (dates differ by at most the pair distance; the переказ takes the departure's date either way).

## Migration Plan

Nothing deploys and nothing migrates: new pure module + dev script + devDependency. Rollback is
deleting `src/saldo/` and the script.

## Open Questions

- Should imported транзакції keep their Saldo descriptions once a description column exists
  (monobank-sync will likely want one for правила anyway)? Safe to defer: it changes the
  follow-up screen change's persistence delta, not this engine — the plan already carries the
  descriptions, so the commit step can start storing them whenever the column arrives.
