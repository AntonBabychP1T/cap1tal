# saldo-import-screen — proposal

## Why

The engine that reads the owner's Saldo export is done and archived: `src/saldo/` turns the CSV
into a plan of рахунки, категорії, джерела and транзакції, and proves it with a verification
report. Nothing can run it. The owner still cannot open cap1tal and see the 2 416 transactions
of 2024-10-27 → 2026-08-23 that hold the answer to both questions the vision names — where the
money went, and how much is left. This change is the other half of tech-task §5 step 6: the
Налаштування flow that picks the file, collects the two confirmations the engine already takes as
input, shows the report, and commits the plan to the device.

## What Changes

- **New «Імпорт Saldo» section in Налаштування**, opening a one-time flow: pick the export file →
  confirm the account map → assign a person to every «Борг» transaction → read the verification
  report → commit. The engine is called as it stands; the flow only supplies its `Decisions` and
  displays its `Survey`, `ImportPlan` and `Report`.
- **The map step (FR-X2, confirmation half)**: every proposed рахунок is shown with its name, вид
  and currency; the owner may change a вид, redirect an entry onto another entry or onto an
  existing рахунок (merging the duplicates of one card), and redirect a proposed категорія or
  джерело onto an existing row. A rejected redirect is shown as rejected, never applied silently.
- **The debt step (FR-X3, confirmation half)**: every «Борг» description and every «Борг»
  transaction is listed with its date and amount; the owner assigns a person — a new рахунок-борг
  or an existing one — per description, and per transaction where a description is not enough.
  The flow SHALL NOT let the owner commit while the plan reports itself incomplete.
- **The report step (FR-X5)**: per рахунок, Saldo's balance against the plan's розрахунковий
  баланс, every difference with what explains it, every рахунок-борг's resulting balance
  (negative ones included) and every dropped or unexplained row — all before anything is written.
- **Atomic commit (persistence)**: the whole plan — created рахунки with their початкові залишки,
  replaced opening balances, created категорії and джерела, and every транзакція in the plan's
  order — is written in one database transaction. A failure anywhere leaves storage exactly as it
  was; there is no half-imported history.
- **A committed import is recorded, and a second one warns.** The commit stores the moment it
  happened; opening the flow again shows that an import was already committed and requires a
  second, explicit confirmation before committing another. Not in the BACKLOG line, added
  deliberately: committing twice silently doubles the owner's entire history, and the account map
  maps onto existing рахунки, so nothing else in the flow would catch it.
- **«Відсотки» becomes a reserved джерело (categories)**: the джерело the glossary defines as
  interest income joins the starter set unconditionally, so it exists for every owner and not only
  after an import — and reserved like «Комісія», because the same reason applies: a proposal the
  app itself makes cannot depend on a row the owner may rename or archive. This redeems the
  sentence the categories spec left pointing at "the Saldo import's confirm screen". A джерело the
  owner already created by hand under that name is adopted by the seed as the reserved row rather
  than duplicated — the previous spec explicitly told them to create one.
- **FR-T9 (main-screen)**: recording a переказ back from a рахунок-борг for more than that
  рахунок's розрахунковий баланс proposes the excess as a дохід «Відсотки», to accept or decline —
  the same shape as the комісія proposal on a short transfer. The комісія proposal itself steps
  aside for a рахунок-борг: a person is not a bank, a repayment that arrives short is no fee, and
  keeping the two proposals mutually exclusive is what stops one переказ from being owed two
  different stored shapes.
- New dependencies: `expo-document-picker` (choosing the file) and `expo-file-system` (reading its
  text). Both are Expo modules and need a native rebuild; neither enters `npm run verify`.

## Non-goals (this change)

- No change to the engine: `parse`, `survey`, `interpret` and `verify` are truth as archived and
  are called, not edited. In particular a repayment above the principal stays one переказ in the
  **import** — the report shows the resulting negative рахунок-борг — because splitting it needs
  an owner decision, and FR-T9 is where the owner makes it, by hand, afterwards.
- No undo of a committed import: the marker warns before a second commit, it does not roll one
  back. Removing an imported history is deletion by hand until the бекап change (step 11).
- No import of anything but a Saldo export; monobank (step 7) and notifications (step 8) are
  their own changes.
- No перенесення транзакцій між місяцями — vision §13 keeps it out of v1, and the engine already
  reports the three accrual-month divergences rather than obeying them.
- The negative дохід the import writes needs no delta here: the `transactions` capability already
  permits it, shipped with the engine.

## Capabilities

### New Capabilities

- `saldo-import-screen`: the Налаштування flow that runs the one-time Saldo import — picking the
  export, confirming the account map, assigning «Борг» transactions to people, reading the
  verification report, and committing the plan.

### Modified Capabilities

- `settings-screen`: the tab offers a fourth section, «Імпорт Saldo», which opens that flow.
- `persistence`: an import plan is committed atomically — every рахунок, категорія, джерело and
  транзакція of it, or none — and the moment of a committed import is stored and readable, by a
  new migration that leaves the committed ones untouched.
- `categories`: «Відсотки» is part of the seeded starter set of джерела, as a reserved row that
  can be neither renamed nor archived, adopting a hand-created row of that name.
- `main-screen`: a переказ out of a рахунок-борг exceeding its розрахунковий баланс proposes the
  excess as a дохід «Відсотки», and no комісія is proposed for a переказ out of a рахунок-борг.
- `saldo-import`: one stale clause of the name-mapping requirement said the domain reserves no
  джерело at all, which making «Відсотки» reserved falsifies. The SHALL itself is untouched —
  "Uncategorised income" is still proposed as an ordinary джерело, since «Відсотки» means interest
  and is no «Без джерела».

## Impact

- New screen code under `src/app/manage/saldo-import.tsx` (pushed over the Налаштування tab, like
  the other management screens), with its pure logic — step state, the decisions the owner builds,
  the display shapes of survey, plan and report — in `src/ui/saldo-import.ts`, where Vitest can
  reach it without JSX.
- New `src/db/import-repo.ts`: the atomic commit of an `ImportPlan` and the import marker.
- New migration for the marker; `src/db/schema.ts` gains one table. Committed migrations untouched.
- `src/db/starter-set.ts` gains «Відсотки» and `src/domain/category.ts` gains the reserved джерело
  id beside the three reserved category ids; `src/db/seed.ts` adopts a hand-created «Відсотки» into
  that id. The new migration only creates the marker table — the adoption is not migration work,
  and `.claude/rules/database.md` allows hand-written data statements only where the schema change
  cannot land without them.
- `src/ui/entry-form.ts` (or its переказ part) gains the interest proposal beside the fee one;
  `src/components/fee-dialog.ts` gets a sibling, or is generalised if it fits without contortion.
- Two new runtime dependencies (`expo-document-picker`, `expo-file-system`) and a native rebuild.
  `npm run verify` stays Node-only and under a minute — nothing in it imports either module.
