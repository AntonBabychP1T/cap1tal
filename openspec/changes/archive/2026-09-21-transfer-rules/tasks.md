## 0. Precondition

- [x] 0.1 Confirm `storage-locking` is committed (its repositories are the ones this change edits).
  Verify: `git status --short src/db` shows none of its files modified or untracked.

  **Result:** storage-locking and receipt-qr-prro-requisites were both fully implemented but
  uncommitted; committed both (`bd41595`, `3d32b94`) and archived storage-locking
  (`1a70a22`, `417361d`). `git status --short src/db` is now empty.

- [x] 0.2 `docs/glossary.md` (Rule, Transfer rule / правило-переказ, Counterpart income / зустрічний
  дохід, Sweep) and one line in `.claude/rules/domain.md` (design D10); `docs/app-overview.md` notes
  the new rule kind. Verify: `openspec validate --all` and a read-through that spec terms match the
  glossary verbatim.

  **Result:** `openspec validate --all` — `change/transfer-rules` passes; the only pre-existing
  failures are unrelated changes (bug-report-here, fiscal-receipts, reminders-and-alerts).

## 1. Domain: the rule target and matching

- [x] 1.1 `src/domain/rules.ts`: `RuleTarget` union and `Rule.target` (design D1); update every
  construction site the typechecker points at to `{ kind: 'category', categoryId }` with no
  behaviour change. Verify: `npm run typecheck` and the existing `src/domain/rules.test.ts` pass
  unchanged in meaning.
- [x] 1.2 `matchRule` with `from` and eligibility filtered before ranking, plus `matchCategory` for
  category-only callers (design D2). Tests in `src/domain/rules.test.ts` for categorisation-rules
  scenarios "A правило-переказ wins by the same ladder", "…does not match money leaving its
  destination", "…does not match across currencies", "…keeps matching into an archived рахунок".
- [x] 1.3 Switch `src/ui/entry-form.ts` and `src/notifications/draft.ts` to `matchCategory`. Test in
  `src/ui/entry-form.test.ts`: "A правило-переказ proposes nothing by hand"; and in
  `src/notifications/draft.test.ts` that a правило-переказ does not decide a чернетка's категорія.

## 2. Domain: the зустрічний дохід

- [x] 2.1 `Transfer.awaitingCounterpartIncome?: true` in `src/domain/transaction.ts`. Verify: typecheck; a
  test in `src/domain/transaction.test.ts` that a non-переказ cannot carry it (by construction).
- [x] 2.2 `src/domain/counterpart-income.ts`: `isCounterpartIncome`, `pickCounterpartIncome`,
  `pickAwaitingTransfer` (design D3). Tests in `src/domain/counterpart-income.test.ts` for transactions
  scenarios "A дохід with a chosen джерело is never absorbed", "A дохід two days away is not the
  зустрічний дохід", "A different сума is not the зустрічний дохід", "A дохід carrying a фіскальний чек
  is never absorbed", "A cross-currency переказ absorbs a дохід of its arrived сума", "The nearest date wins among candidates",
  plus the storedAt and id tie-breaks and a month/year boundary for the ±1 day window.
- [x] 2.3 `sweepUncategorised` returns category and transfer moves using `accounts` (design D5).
  Tests in `src/domain/rules.test.ts`: "A new правило-переказ turns matching витрати into перекази"
  (the move, not the absorption), "A правило-переказ does not take a витрата out of a chosen
  категорія", and that a transfer move keeps id, date, опис and сума on both legs.

  **Result (1–2):** `npx vitest run src/domain/rules.test.ts src/domain/counterpart-income.test.ts
  src/domain/transaction.test.ts src/ui/entry-form.test.ts src/notifications/draft.test.ts` — all
  green.

## 3. Storage

- [x] 3.1 `src/db/schema.ts`: nullable `rules.category_id`, `rules.to_account_id` FK, exactly-one
  CHECK; new table `counterpart_income_awaits` (design D1, D4, D9); `npm run db:generate`, and confirm
  the generated SQL does not touch `transactions`.
  Tests in `src/db/migrations.test.ts`: "Stored rules and перекази survive the migration" (rows
  written under `0000` alone) and "A fresh database stores a правило-переказ" — the old-shape rows include a витрата with a
  фіскальний чек and its позиції, all asserted after migrating (design D9); and "A rule row with
  two targets is refused by storage".
- [x] 3.2 `src/db/rules-repo.ts` maps the union both ways and validates (both/neither, «Коригування»,
  «Без категорії», MCC). Tests in `src/db/rules-repo.test.ts`: "A правило-переказ is stored", "A rule
  naming both a category and a рахунок is rejected", "A правило-переказ to an unknown рахунок is
  rejected", "A правило-переказ round-trips".
- [x] 3.3 `src/db/transactions-repo.ts` round-trips `awaitingCounterpartIncome` and clears it when an
  id is saved as anything but a переказ. Tests in `src/db/transactions-repo.test.ts`: "An awaiting
  переказ round-trips", "A retyped переказ no longer reads back as awaiting", and that removing an
  awaiting переказ leaves no row.
- [x] 3.4 `src/db/counterpart-income-repo.ts`: store a переказ absorbing or awaiting, and absorb an
  incoming дохід into an awaiting переказ, both inside a caller's transaction (design D5). Tests in
  `src/db/counterpart-income-repo.test.ts`: "A retyped переказ absorbs the дохід already stored", "A
  переказ with no stored зустрічний дохід awaits it", "Two перекази never absorb the same дохід".

  **Result:** the generated migration (`drizzle/0001_cloudy_betty_ross.sql`) recreates `rules`
  alone and never touches `transactions`, matching design D9 — but drizzle-kit's own data-copy
  `INSERT` mis-referenced the new `to_account_id` column on the *old* `rules` table; hand-corrected
  to `NULL` (the migration is not yet committed, so `.claude/rules/database.md`'s hand-editing
  clause applies) and covered by the "survives the migration" test.
  `npx vitest run src/db/migrations.test.ts src/db/rules-repo.test.ts src/db/transactions-repo.test.ts
  src/db/counterpart-income-repo.test.ts` — all green.

## 4. Where перекази are made

- [x] 4.1 `rulesRepo.save` writes transfer moves through 3.4 and returns `transferred`/`absorbed`;
  `storeRule` journals the four counts and says both numbers (design D6). Tests in
  `src/db/rules-repo.test.ts` ("A new правило-переказ turns matching витрати into перекази" end to
  end with the absorbed дохід, "A правило-переказ leaves a витрата on its own destination where it
  is", "A rule retargeted to a переказ runs the розбір", main-screen "Accepting the правило-переказ
  pairs the history too" through the offer's accept path) and `src/ui/list-management.test.ts` ("The owner is told how many
  moved", "The pass is in the журнал as counts alone").
- [x] 4.2 `src/monobank/sync.ts`: the правило-переказ branch in `mapStatement`. Tests in
  `src/monobank/sync.test.ts`: "A правило-переказ makes the item a переказ", and that a USD рахунок's
  item under a UAH destination stays a витрата.
- [x] 4.3 `commitStatementAnswer` pairs in its transaction; an absorbed item stays remembered as
  imported. Tests in `src/db/monobank-repo.test.ts`: "The card is synced before рахунок РЕЗЕРВ",
  "Рахунок РЕЗЕРВ is synced before the card", transactions "A переказ awaiting after a retype is met
  by a later sync", "An incoming item with no awaiting переказ stays a дохід", "A
  failed commit pairs nothing", and monobank-sync "A правило-переказ pairs the two legs".
- [x] 4.4 Retype and edit in `src/app/transaction/[id].tsx` store the переказ through 3.4 when the
  original was a витрата or an awaiting переказ; `new.tsx` does not. The decision of *which* write
  to use lives in `src/ui/retype.ts` so it is tested: `src/ui/retype.test.ts` for "A переказ
  recorded by hand awaits nothing", "Retyping back does not restore the absorbed дохід", "Editing an
  awaiting переказ looks again", "An awaiting переказ retyped into a витрата leaves nothing awaiting".
  Plus `src/db/notifications-repo.test.ts`: "A confirmed чернетка is not absorbed".

  **Result (4.1–4.4):** `mapStatement`'s `MapContext` and `coordinator.ts`'s `SyncPorts` both
  gained an optional `accounts` (absent behaves as empty), so every pre-existing caller needed no
  change; `src/hooks/monobank-ports.ts` wires the real one. `new.tsx` was not touched — it never
  calls the shared pairing step, so a hand-recorded переказ awaits nothing by construction.
  `npx vitest run src/db/rules-repo.test.ts src/ui/list-management.test.ts src/monobank/sync.test.ts
  src/db/monobank-repo.test.ts src/ui/retype.test.ts src/db/notifications-repo.test.ts` — all green.

## 5. Offers and screens

- [x] 5.1 `ruleOffer` transfer variant and `useRuleOffer` with the target union (design D6). Tests in
  `src/ui/list-management.test.ts`: "Retyping a витрата into a переказ offers the правило-переказ",
  "A cross-currency переказ offers no правило", "A переказ an existing правило-переказ already gives
  offers nothing", "Editing a переказ offers nothing".
- [x] 5.2 Raise the transfer offer in `[id].tsx` after the переказ is stored, sheet text «переказ на
  <назва>». Verify: the pure decision is covered by 5.1; screen covered by smoke 6.2.
- [x] 5.3 `RuleDraft`, `ruleFromDraft`, `ruleLine` and `src/app/manage/rules.tsx` with the target
  switch and рахунок picker (design D8). Tests in `src/ui/list-management.test.ts`: "A правило-переказ
  appears in the list" (the line), "Switching the target drops the other choice".
- [x] 5.4 «Це переказ» in the feed mark and `?as=transfer` on the editing screen (design D7). The
  initial-shape decision is a pure function in `src/ui/retype.ts`; tests in `src/ui/retype.test.ts`
  for "«Це переказ» opens editing as a переказ" (shape, source рахунок kept, no destination), "A
  повернення's mark offers no «Це переказ»", and
  "Leaving without saving changes nothing" (nothing written by opening).

  **Result (5.1–5.4):** "Editing a переказ offers nothing" (5.1) is proven structurally in the
  pre-existing "who raises and answers the offer" suite (`src/ui/list-management.test.ts`),
  unchanged by this work since the transfer branch still returns before any offer code runs.
  `npx vitest run src/ui/list-management.test.ts src/ui/retype.test.ts` — all green.

## 6. Бекап, docs, smoke

- [x] 6.1 `src/backup/format.ts` and `src/db/backup-repo.ts`: optional `toAccountId` /
  `awaitingCounterpartIncome`, consistency checks, `BACKUP_SCHEMA_VERSION` 2 (design D9). Tests in
  `src/backup/format.test.ts` and `src/db/backup-repo.test.ts`: "A правило-переказ and an awaiting
  переказ survive the round trip", "An older бекап restores with nothing awaiting", "A
  правило-переказ pointing outside the бекап stops the restore", "A правило with two targets stops
  the restore", "A чек pointing outside the бекап stops the restore".

  **Result:** the new `counterpart_income_awaits` table is folded into `transactions`'s own
  entries, not a top-level бекап list — added to `format.test.ts`'s enumerated exclusion list with
  that reason, or the existing "nothing overheard" scenario would have failed.
  `npx vitest run src/backup/format.test.ts src/db/backup-repo.test.ts` — all green.
- [x] 6.2 Smoke on the emulator (`smoke-runner`): create "округлення балансу → переказ на <UAH
  рахунок>" in «Правила» and see the list line and the розбір message; use «Це переказ» on a «Без
  категорії» витрата, save, see the offer naming «переказ на …». Verify: screenshots read by the
  smoke-runner, verdict recorded here.

  **Result (Pixel_10_Pro emulator, 2026-09-19):** PASS on all three scenarios.
  1. Created a rule (МЕТА "Переказ", destination "test") — list line reads `zaokruhlennia →
     переказ на test`, matching spec wording. (Cyrillic is untypeable via `adb shell input text`,
     so a Latin pattern stood in for it — not a defect.)
  2. «Це переказ» on a «Без категорії» витрата opened editing with ТИП=переказ, ЗВІДКИ pre-filled
     with the source рахунок, КУДИ empty — matches design D7.
  3. Picking a destination and saving raised «Запам'ятати правило?» reading
     `pattern rounding → переказ на test`; declining left the переказ stored. Matches design D6.

  No defects in the three scenarios' own behaviour. Two out-of-scope observations recorded for
  follow-up (not this change's spec): a stale expanded-category-picker on a Головний row that was
  «Без категорії» before being retyped into a переказ (pre-existing feed row/expanded-state
  handling, not caused by this change); and `proposeMerchantPattern`'s two-word cut is working as
  documented (design decision 3), not a bug — the agent's report flagged it for a second look but
  it matches the existing "СІЛЬПО 123 Київ" → "сільпо" behaviour exactly.
  Screenshots: `.cache/android/smoke/transfer-rules/`.

## 7. Gate

- [x] 7.1 Run `npm run verify` and paste the final lines

  ```
  Test Files  173 passed (173)
       Tests  3522 passed (3522)
  ✔ verify passed (d9765ab7c7e19dee9affd24ca7e09080e987ec31)
  ```

- [x] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

  **Result:** First pass — FAIL (2 critical, 5 warning). Critical: (1) `[id].tsx`'s retype write
  called the shared pairing step against the raw `db`, not inside one transaction, unlike
  `rules-repo.ts`/`monobank-repo.ts` — violated design D5's "same database transaction" promise
  and risked a переказ landing with no `counterpart_income_awaits` row on a crash mid-write, which
  a later sync could then double-count. Fixed: `persistRetyped` in `counterpart-income-repo.ts`
  wraps a whole save's written transactions in one `db.transaction(..., {behavior:'immediate'})`,
  called once from `[id].tsx` instead of looping per item; `db/repos.ts` binds it to the real `db`.
  (2) the фіскальний чек exclusion in `candidateIncomes` had no test. Fixed: a test attaches a real
  чек via `receiptsRepo` and proves it is excluded. Warnings addressed: extracted the duplicated
  `daysBetween` into `src/domain/dates.ts`; removed the dead `absorbCounterpartIncome` export;
  added the missing "Retyping back does not restore the absorbed дохід" test.
  Second pass — **PASS (0 critical, 1 warning** — a test comment slightly overstated its own
  fixture; reworded**)**.
