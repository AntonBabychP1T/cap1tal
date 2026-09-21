## Context

See proposal.md — Why. The current shape this design has to fit:

- `src/domain/rules.ts` — `Rule { merchant?, mcc?, categoryId }`, `matchRule` returns a category
  id, `sweepUncategorised` returns `CategoryMove[]`. Callers: `src/monobank/sync.ts`
  (`mapStatement`), `src/notifications/draft.ts`, `src/ui/entry-form.ts`, `src/ui/list-management.ts`
  (`ruleOffer`, `ruleFromDraft`, `ruleLine`, `storeRule`), `src/db/rules-repo.ts` (`save` runs the
  розбір inside one immediate transaction).
- `src/db/schema.ts` — `rules.category_id` is `NOT NULL` with an FK to `categories`;
  `transactions` holds all five shapes under one `transactions_shape` CHECK. One committed
  migration (`drizzle/0000_…`).
- Sync maps a statement purely (`mapStatement`) and `monobankRepo.commitStatementAnswer` stores
  one answer in one immediate transaction.
- Retype happens in `src/app/transaction/[id].tsx`: `buildEntry` builds the transfer, then
  `askAboutTransfer` (`src/components/transfer-dialog.ts`) may add a дохід «Відсотки» and calls
  `store(...written)`, which is `persist` → the transactions repository.
- The rule offer is `useRuleOffer` (`src/hooks/use-rule-offer.ts`) over the pure `ruleOffer`.
- Backup: `BACKUP_FORMAT_VERSION = 2`, `BACKUP_SCHEMA_VERSION = 1` (tripwired to the migration
  journal), consistency checks in `src/backup/format.ts`.
- `storage-locking` is uncommitted in the tree and edits the same repositories; this change is
  applied after it.

## Goals / Non-Goals

**Goals:**
- One matching ladder for both targets, decided in the pure domain.
- One pure function that decides pairing, used by all three write paths (sync commit, розбір,
  retype), so the three can never disagree about what a зустрічний дохід is.
- Pairing lands in the same database transaction as whatever created the переказ or the дохід.

**Non-Goals:**
- No change to how a переказ counts in the monthly picture — it is already by рахунок kind.
- No pairing on the source side, no pairing for чернетки, Saldo or hand-recorded перекази
  (proposal Non-goals).

## Decisions

### D1. `RuleTarget` is a union; `Rule` carries exactly one

```ts
type RuleTarget =
  | { kind: 'category'; categoryId: string }
  | { kind: 'transfer'; toAccountId: string };
interface Rule { id; merchant?; mcc?; target: RuleTarget; createdAt }
```

A union rather than two optional fields, so "both" and "neither" are unrepresentable above storage
(the same reasoning as `PagingPosition`). Storage mirrors it with a nullable `category_id`, a new
nullable `to_account_id` FK to `accounts` (`onDelete: 'restrict'` — рахунки are archived, not
deleted, and a правило pointing nowhere must not silently appear), and a CHECK
`(category_id IS NULL) <> (to_account_id IS NULL)`.

*Alternative:* a separate `transfer_rules` table. Rejected: the ladder ranks both kinds together
(spec), and two tables would mean merging two lists in every caller and two `createdAt` sequences.

### D2. Matching takes the рахунок; two entry points

`matchRule(rules, { description, mcc?, from?: { accountId, currency } }, accounts)` returns
`RuleTarget | undefined`. A transfer rule is *eligible* only when `from` is given, its destination
exists in `accounts`, differs from `from.accountId`, and is in `from.currency`; an ineligible rule
is filtered out **before** ranking, so the next best decides (spec: "takes no part in that match").

`matchCategory(rules, { description, mcc? })` keeps today's signature and return type for the entry
form and `notifications/draft.ts`: it ranks category rules only. Keeping that name stable means the
two "category only" callers change by a rename and nothing else.

### D3. Pairing is one pure decision: `src/domain/counterpart-income.ts`

```ts
isCounterpartIncome(transfer, income): boolean       // рахунок, «Без джерела», arrived сума, |Δdate| ≤ 1
pickCounterpartIncome(transfer, incomes): Income | undefined     // nearest date, earliest storedAt, id
pickAwaitingTransfer(income, awaiting): Transfer | undefined // the mirror choice, same ordering
```

Date distance is calendar-day arithmetic over `IsoDate` (no timezone). The ordering needs
`storedAt`, which the repository already has for the feed tie-break; the functions take
`{ transaction, storedAt }` pairs.

### D4. "Awaits" is a row in its own table

`Transfer.awaitingCounterpartIncome?: true` in the domain; in storage a new table
`counterpart_income_awaits (transaction_id TEXT PRIMARY KEY REFERENCES transactions(id) ON DELETE
CASCADE)`. A row means "this переказ awaits". The repository reads it with a left join and writes it
in the same transaction as the переказ; `transactionsRepo.save` of any non-переказ deletes the row
for that id, which is how "anything other than a переказ reads back awaiting nothing" holds (a
CHECK cannot look across tables, so that is the one invariant the repository — not the schema —
keeps, and `transactions-repo.test.ts` proves it). No existing row means every stored переказ awaits
nothing, exactly the migration requirement.

*Alternatives considered:*
- *A column `transactions.awaits_counterpart_income` inside the shape CHECK.* Changing the CHECK
  makes SQLite rebuild `transactions`; dropping the old table under the migrator's own `BEGIN`
  (where `PRAGMA foreign_keys=OFF` is a no-op) fires `fiscal_receipts`' `ON DELETE CASCADE` and
  would delete every stored фіскальний чек and its позиції. Rejected.
- *No flag, pair by matching at any time.* Two roundings of 0.09 ₴ on adjacent days would let the
  second дохід be absorbed by a переказ that already absorbed the first. The flag is what makes
  "at most one" true.
- *A link table переказ → absorbed item id.* Records more than any requirement reads, and the
  absorbed дохід is gone anyway.

A row that stays forever is harmless: the one-day window means nothing can match it two days
later. No sweeper clears it.

### D5. Where each write path pairs

- **Sync.** `mapStatement` stays pure and gains the правило-переказ branch (D2 with
  `from = the linked рахунок`), emitting a `Transfer` with `awaitingCounterpartIncome: true`. It does *not*
  look at storage. `commitStatementAnswer`, inside its existing transaction, then:
  1. for each new переказ: load доходи «Без джерела» on its destination within ±1 day
     (lexicographic date range, per database rules), `pickCounterpartIncome`, delete it and store the
     переказ without the flag — or store it awaiting;
  2. for each new дохід «Без джерела»: load awaiting перекази onto this рахунок within ±1 day,
     `pickAwaitingTransfer`; if found, clear its flag and drop the дохід from the insert. Its item
     id is still in `newlySeenIds`, so it never imports again.
  Both steps in one transaction satisfy "a failed commit pairs nothing".
- **Розбір.** `sweepUncategorised` returns `Move = { kind: 'category', id, categoryId } |
  { kind: 'transfer', id, transfer }`; it needs `accounts` for D2 eligibility. `rulesRepo.save`
  writes category moves as today and routes transfer moves through the same pairing write as sync
  (step 1). `SweepCounts` gains `transferred` and `absorbed`.
- **Retype / edit.** `[id].tsx`'s `store` writes the переказ through the same shared step when the
  original was a витрата, or was a переказ that still awaited; every other written транзакція (the
  optional дохід «Відсотки») is saved as before, in the same database transaction. Retyping an
  awaiting переказ into a витрата simply writes a витрата — the flag lives only on a переказ row,
  so nothing is left awaiting. `new.tsx` does not use the shared step (hand-recorded перекази
  await nothing).
- **Чернетки and hand entry** never call step 2: only `commitStatementAnswer` absorbs on arrival
  (transactions spec).

The shared steps are the one module `src/db/counterpart-income-repo.ts` (functions over a
transaction handle, no repository object of their own), so `monobank-repo`, `rules-repo` and the
retype write call one implementation.

A дохід carrying a фіскальний чек is never a зустрічний дохід: the candidate query excludes доходи
that a `fiscal_receipts` row references, because its `onDelete: 'cascade'` would otherwise delete
the owner's чек along with the absorbed дохід.

### D6. The offer after a retype

`ruleOffer` gains a transfer variant: input `{ description, target: RuleTarget, fromAccount,
accounts, rules }`. It returns nothing when the опис is blank, when `matchRule` with `from` already
returns an equal target, or (transfer) when the destination's currency differs from the source.
`useRuleOffer.raise` accepts the target union; the sheet reads «переказ на <назва>». In `[id].tsx`
the offer is raised after `store` (the переказ is already stored — spec), only when the original
was a витрата, and the screen stays open for it exactly as it does for a категорія today.

`storeRule`'s message becomes: "N витрат перекатегоризовано." and/or "M стали переказами.", and
the journal step's counts gain `transferred` and `absorbed`.

### D7. «Це переказ» in the feed mark

The category picker opened from the mark gets one extra action, «Це переказ», that navigates to
`/transaction/[id]?as=transfer`. The editing screen reads the param once to set the initial form
shape to `transfer` via the existing `labelsAfterRetype`, touching nothing stored. The choice list
itself stays in `src/ui/category-choices.ts` untouched; the action is a separate row, so the "at
most five категорії" rule is unaffected.

### D8. Rules form

`RuleDraft` becomes `{ merchant, mcc, target: 'category' | 'transfer', categoryId?, toAccountId? }`;
`ruleFromDraft` builds the union and drops the id of the non-chosen kind (spec: switching drops the
other choice). `ruleLine` renders «переказ на <назва>» with names resolved against every рахунок,
archived included — the same reason categories are resolved against all. The account picker offers
unarchived рахунки through the existing short-list helpers.

### D9. Migration and бекап

- `npm run db:generate` after the schema edit. SQLite cannot drop `NOT NULL` in place, so drizzle
  generates a recreate (`__new_rules` + `INSERT … SELECT`) for `rules` alone — nothing references
  `rules`, so the rebuild cascades nowhere. `transactions` is not touched (D4); the new
  `counterpart_income_awaits` table is a plain `CREATE TABLE`. The migration test stores, under
  `0000` alone, a rule, a переказ and a витрата with a фіскальний чек and its позиції, migrates, and
  asserts every row is still there. If the generated SQL touches `transactions` after all, stop and
  ask the owner.
- Restore deletes `rules` before `accounts` already (`backup-repo.ts`), so the new
  `to_account_id` restrict FK needs no reordering; the backup-repo test covers it.
- `BACKUP_SCHEMA_VERSION` 1 → 2 (the tripwire demands it). `BACKUP_FORMAT_VERSION` stays 2: the
  envelope does not change, only the domain values inside it, and a бекап "names fewer things"
  when older. `BackupRule` gains optional `toAccountId` with `categoryId` becoming optional; a
  transfer gains optional `awaitingCounterpartIncome: true`. Missing both → category rule / awaiting nothing.
  Consistency: exactly one target, target exists in the бекап, `awaitingCounterpartIncome` only on a переказ.

### D10. Glossary

`docs/glossary.md`: **Rule** widened to "→ category Y, or → переказ на рахунок Z"; new
**Transfer rule** (правило-переказ) and **Counterpart income** (зустрічний дохід) with the four
conditions and "awaits"; **Sweep** mentions перекази. `.claude/rules/domain.md` gets one line that
pairing is only ever the owner's правило or retype.

## Risks / Trade-offs

- [A правило-переказ written too broadly turns real purchases into перекази, and absorbs real
  доходи] → it only ever absorbs a дохід «Без джерела» of the exact сума within a day; the розбір
  tells the owner how many became перекази; a переказ can be retyped back (the absorbed дохід is not
  restored — stated in the spec and proposal).
- [The destination is not linked to monobank, so a переказ awaits forever] → harmless after the
  one-day window (D4).
- [`rules` table recreate during migration] → generated by drizzle; nothing references `rules`;
  covered by a before/after test with representative rows, a фіскальний чек included (database
  rules). `transactions` is never rebuilt (D4).
- [The "only a переказ awaits" invariant lives in the repository, not a CHECK] → one write path
  (`transactionsRepo.save` plus the shared step) and a test for the retype case.
- [`fiscal-receipts` also MODIFIES backup-file "A бекап that contradicts itself is refused whole"]
  → this delta carries its чек/позиція clauses too; archive `fiscal-receipts` first, this change
  second.
- [Bank dates the two legs on different days around midnight] → the ±1 day window.
- [Conflict with `storage-locking` in the same repositories] → apply after it is committed.

## Migration Plan

One new generated migration; `BACKUP_SCHEMA_VERSION` bump. No data backfill: existing rules keep
their category, existing перекази await nothing. Rollback is not supported for migrations (append-
only); a бекап made before the change restores into the new shape.

After shipping, the owner creates the правило "округлення балансу → переказ на РЕЗЕРВ" (or accepts
the offer after one retype) and deletes the two доходи on РЕЗЕРВ dated 11 and 12 September by hand.
