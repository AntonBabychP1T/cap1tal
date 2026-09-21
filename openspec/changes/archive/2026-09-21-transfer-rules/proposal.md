## Why

The owner's monobank банка «Резерв» is topped up every day with the rounding of the card
platinum ··6628. Both рахунки are linked to monobank, so every rounding arrives as two unrelated
транзакції: a витрата «Округлення балансу «Резерв»» in «Без категорії» on the card and a дохід
«З платинової картки» in «Без джерела» on РЕЗЕРВ (bug report 2026-09-16). Today the owner cannot fix
this once and for all:

- the «Без категорії» mark on Головний offers only категорії, and a переказ is a type, not a
  категорія — so the obvious gesture has no «переказ» in it;
- retyping the витрата into a переказ from editing leaves the дохід on РЕЗЕРВ standing, so the
  money is counted twice (the owner's data already holds two such pairs, 11 and 12 September);
- a правило can only name a категорія, and editing a переказ offers no правило at all, so the same
  work comes back every single day.

This is problem one of the vision — *where money went*: a daily move between the owner's own
рахунки is not spending, and a feed that calls it «Без категорії» (and a дохід) every day makes the
month's витрачено and дохід untrustworthy.

## What Changes

- A **правило-переказ**: a правило may target a destination рахунок instead of a категорія —
  "merchant / MCC → переказ на РЕЗЕРВ". It is ranked on the same ladder as every правило.
- **Monobank sync applies it**: money leaving a linked рахунок whose best правило is a
  правило-переказ is stored as a переказ from that рахунок to the destination instead of a витрата.
  This is the owner's explicit action (they wrote the правило), so the monobank-sync requirement
  "sync does not invent a переказ" is sharpened to say so rather than broken.
- **The зустрічний дохід is absorbed**: the дохід «Без джерела» that the destination's own statement
  reports for the same переказ — same рахунок, same сума, date within one day — is not kept beside
  it. Whichever leg arrives first, the second finds the first: a переказ that has not yet met its
  зустрічний дохід *awaits* it, and absorbs it when it arrives; a переказ created after the дохід is
  already stored removes that дохід at once. Each переказ absorbs at most one дохід.
- **Retyping a витрата into a переказ by hand absorbs the зустрічний дохід the same way**, and then
  offers to remember the decision as a правило-переказ (pattern proposed from the опис, destination
  the рахунок just chosen), exactly as setting a категорія offers a правило today.
- **The розбір covers правила-перекази**: storing one turns the stored «Без категорії» витрати it
  now matches into перекази (same identity, сума, date and опис) and absorbs their зустрічні доходи.
- **The «Без категорії» mark on Головний offers «Це переказ»**, which opens editing with the type
  already set to переказ — so the gesture the owner reached for leads somewhere.
- **«Правила» in Налаштування** lets a правило be created and edited with either a категорія or a
  destination рахунок as its target, and lists a правило-переказ as «→ переказ на <рахунок>».
- A дохід the owner chose a джерело for, or attached a фіскальний чек to, is never a зустрічний дохід.
- **Storage and бекап**: a правило stores either a target категорія or a destination рахунок (exactly
  one); a переказ stores whether it still awaits its зустрічний дохід. One new migration; the бекап
  carries both and refuses a правило naming a рахунок it does not contain.
- Glossary: **правило** widened; new terms **правило-переказ** and **зустрічний дохід**.

### Non-goals

- Pairing without a правило or a retype. Sync still never decides on its own that two legs are one
  переказ; only the owner's правило or retype does.
- Absorbing a дохід that arrives other than as a monobank statement item — a confirmed чернетка
  from a bank сповіщення or a дохід recorded by hand is stored as it is.
- Bank сповіщення (чернетки), the Saldo import and the manual entry form do not produce перекази from
  правила; there a правило-переказ is simply not a категорія and takes no part. A переказ recorded
  by hand from «Новий запис» does not await a зустрічний дохід.
- A правило-переказ across currencies: it applies only when the destination is in the source
  рахунок's currency — a statement item names one сума, and a cross-currency переказ needs two.
- Absorbing the matching витрата on the *source* side (a переказ recorded on the destination first).
  The rounding case only ever starts at the card.
- Repairing the two existing double-counted pairs (11 and 12 September): the owner deletes those
  two доходи by hand. Перекази stored before this change do not await anything.
- Restoring an absorbed дохід when a переказ is retyped back into a витрата or deleted.
- Changing a рахунок's kind (РЕЗЕРВ is `spending`, so these перекази still count as neither
  відкладено nor резерв). The owner wants that too; it is a separate change, because accounts spec
  forbids it today.
- No vision §14 item is touched. §14.12 (the app never moves money) stands: a правило-переказ
  classifies a movement the bank already made.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `categorisation-rules`: a правило targets a категорія or a destination рахунок; matching returns
  the target; a правило-переказ takes no part where only a категорія is decided; the розбір turns
  matched «Без категорії» витрати into перекази; retyping into a переказ offers a правило-переказ.
- `transactions`: a переказ may await its зустрічний дохід and absorbs it — the rule of what a
  зустрічний дохід is and that it is absorbed at most once.
- `monobank-sync`: a правило-переказ turns outgoing money into a переказ; an incoming item that is
  the зустрічний дохід of an awaiting переказ is absorbed; the "no invented переказ" requirement
  names the owner's правило as explicit action.
- `main-screen`: the «Без категорії» mark on a витрата offers «Це переказ»; retyping a витрата into
  a переказ offers the правило-переказ.
- `settings-screen`: «Правила» lists and edits a правило-переказ.
- `persistence`: a правило-переказ and a переказ's awaiting flag survive a restart; they arrive by a
  new append-only migration keeping stored rows.
- `backup-file`: the бекап carries both, and a правило naming a рахунок outside the бекап makes it
  inconsistent.

## Impact

- `src/domain/rules.ts` (target union, matching, розбір producing перекази), a new pure
  `src/domain/counterpart-income.ts` (which дохід is the зустрічний дохід of which переказ),
  `src/domain/transaction.ts` (`Transfer.awaitingCounterpartIncome`), stored in a new table so
  `transactions` is never rebuilt.
- `src/monobank/sync.ts` (mapping with правила-перекази), `src/db/monobank-repo.ts`
  (`commitStatementAnswer` absorbs in the same database transaction), `src/db/rules-repo.ts`,
  `src/db/transactions-repo.ts`, `src/db/schema.ts` + one generated migration in `drizzle/`.
- `src/backup/format.ts` (`BACKUP_SCHEMA_VERSION` 1 → 2, rule and transfer shapes, consistency),
  `src/db/backup-repo.ts`.
- `src/ui/retype.ts`, `src/ui/list-management.ts`, `src/hooks/use-rule-offer.ts`,
  `src/app/transaction/[id].tsx`, `src/app/manage/rules.tsx`, the Головний feed's category mark.
- `src/ui/entry-form.ts`, `src/notifications/draft.ts`: keep matching категорії only.
- `docs/glossary.md`. No new dependency, no native change.
- Conflicts: `storage-locking` (uncommitted in the tree) touches `src/db/*-repo.ts`; this change
  should be applied after it lands. `fiscal-receipts` MODIFIES the same backup-file requirement;
  this delta already carries its чек/позиція clauses, so `fiscal-receipts` is archived first and
  this change second.
