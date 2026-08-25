## 1. The reserved джерело «Відсотки»

- [x] 1.1 Add the reserved джерело id to `src/domain/category.ts` beside the reserved category ids
      (`RESERVED_SOURCE_IDS`, `isReservedSource`) and «Відсотки» to `src/db/starter-set.ts` under
      that same constant — the starter row and the reserved id must be one slug, never two literals
      that can drift. Tests in `src/domain/category.test.ts` and `src/db/seed.test.ts` proving
      categories' "A fresh install holds the starter set" (the джерело exists) and "The reserved
      джерело id resolves to a seeded row".
- [x] 1.2 Make the manage lists refuse to rename or archive it: extend the reserved check in
      `src/ui/list-management.ts` (and whatever `src/app/manage/sources.tsx` reads) to sources.
      Test in `src/ui/list-management.test.ts` proving categories' "The reserved джерело may be
      neither renamed nor archived", and that «Відсотки» is still offered as a джерело.

## 2. The «Відсотки» adoption, and the marker's migration

- [x] 2.1 Adopt a hand-created «Відсотки» in `src/db/seed.ts` (design §6): when a джерело of that
      name exists under another id, insert the reserved row, repoint its доходи, delete the old
      row — one database transaction, matching nothing from the second opening on. Tests in
      `src/db/seed.test.ts` proving categories' "A hand-created «Відсотки» is not duplicated", that
      it stays a no-op on a device without such a row, and that opening twice changes nothing.
- [x] 2.2 Add the `saldo_import` table to `src/db/schema.ts` (design §4) and run
      `npm run db:generate`; commit the generated migration untouched — no hand-written statements
      in it.
- [x] 2.3 Extend `src/db/migrations.test.ts` with persistence's "A fresh database from migrations
      alone holds the marker" and "Rows stored before the migration survive it".

## 3. The import marker in storage

- [x] 3.1 Add `src/db/import-repo.ts` with reading and writing the marker, `now` passed in. Tests
      in `src/db/import-repo.test.ts` proving persistence's "The moment survives a restart",
      "Before any import there is no marker" and "A second import replaces the moment".

## 4. The atomic commit of a plan

- [x] 4.1 Implement `commit(plan, now)` in `src/db/import-repo.ts`: one Drizzle transaction, plan
      ids mapped to fresh app ids, рахунки created or their початковий залишок replaced,
      категорії and джерела created, транзакції inserted in plan order, marker written (design §3).
- [x] 4.2 Tests in `src/db/import-repo.test.ts` proving persistence's "A stored plan reads back
      whole", "A plan mapping onto an existing рахунок replaces its opening balance" and
      "The plan's order becomes the stored order".
- [x] 4.3 Tests proving "A plan that fails partway stores nothing" — a plan whose last транзакція
      references a категорія the plan never creates — and "A failed commit leaves no marker".

## 5. FR-T9 — a repayment above the principal proposes дохід «Відсотки»

- [x] 5.1 Add the pure interest proposal to `src/ui/entry-form.ts`: given the переказ, the source
      рахунок's kind, both currencies, both legs and the source's розрахунковий баланс before this
      переказ, return the дохід to propose or nothing. Tests in `src/ui/entry-form.test.ts`
      proving main-screen's "Repaying more than owed proposes the interest", "Repaying exactly the
      principal proposes nothing", "A переказ into a рахунок-борг proposes nothing", "A repayment
      onto another рахунок-борг proposes nothing" and "A cross-currency repayment proposes
      nothing".
- [x] 5.2 Make the комісія proposal step aside for a рахунок-борг source in the same module. Test
      proving main-screen's "A repayment arriving short proposes no комісія", and that the
      existing комісія scenarios still hold for every other source.
- [x] 5.3 The accept/decline outcome in the same pure layer — accepted: переказ of the principal
      on both legs plus the дохід «Відсотки» of the excess on the destination, same date;
      declined: the переказ as entered. Tests proving "Accepting leaves the debt at nothing and
      the excess as income" and "Declining stores the repayment as entered".
- [x] 5.4 The edit path: the balance the comparison uses excludes the переказ's own effect. Tests
      proving "Editing a repayment up proposes the interest", "Reopening an unchanged repayment
      proposes nothing" and "An accepted дохід «Відсотки» survives editing its переказ".
- [x] 5.5 Wire it into the переказ form in `src/app/(tabs)/index.tsx` and the editing screen
      `src/app/transaction/[id].tsx` beside the existing комісія proposal, reusing
      `src/components/fee-dialog.ts` or giving it a sibling (design §5). No new logic in the
      `.tsx` beyond passing the balance in and the answer back.

## 6. The flow's pure logic

- [x] 6.1 Add `src/ui/saldo-import.ts`: the flow state (step, parsed transactions, `Decisions`,
      derived `Survey` / `ImportPlan` / `Report`) and `startWithText`, which parses and refuses a
      bad file with its reason. Tests in `src/ui/saldo-import.test.ts` proving
      saldo-import-screen's "A file with an alien header is refused with the reason" and
      "A readable export moves the flow on".
- [x] 6.2 Account-map transitions — redirect an entry onto another entry or an existing рахунок,
      change a вид, undo either — surfacing a rejected redirect with its reason. Tests proving
      "Merging two entries leaves one рахунок", "Changing a вид changes what the month counts" and
      "A cross-currency redirect is shown as rejected".
- [x] 6.3 Name-proposal transitions: redirect a proposed категорія or джерело onto an existing row
      and undo it. Test proving "A proposed category is redirected onto an existing one".
- [x] 6.4 Debt transitions: assign a description or a single transaction to a new or existing
      рахунок-борг; expose what is still unassigned and whether the commit may be offered. Tests
      proving "An unassigned «Борг» transaction blocks the commit", "Assigning the last one opens
      the commit" and "One transaction goes to a different person than its description".
- [x] 6.5 The display shapes of the report and of the pre-commit summary — per-рахунок
      reconciliation, рахунки-борги, dropped rows, and the counts of what would be created. Tests
      proving "The plan is shown before it is committed", "A reconciling рахунок is shown as
      equal", "A difference is shown with its explanation" and "An over-repaid рахунок-борг is
      visible before the commit".
- [x] 6.6 The commit gate and the post-commit state, both in the pure layer: the report must have
      been shown; a flow opened when the marker holds a moment carries that moment and demands the
      extra confirmation; committing yields the summary of what was written, and a failed commit
      yields the failure. Tests proving "The first import needs no extra confirmation", "A second
      import states when the first happened", "Declining the extra confirmation writes nothing",
      "Accepting the extra confirmation stores the second plan", "A committed plan reaches the
      rest of the app" (the counts the flow reports) and "A failed commit leaves nothing behind"
      (the failure the flow reports).

## 7. The screen

- [x] 7.1 `npm install expo-document-picker expo-file-system`; check `npx expo install --check`
      is quiet and that nothing `verify` loads imports either module.
- [x] 7.2 Move the Налаштування section list out of `src/app/(tabs)/settings.tsx` into
      `src/ui/settings-sections.ts` and add «Імпорт Saldo» to it. Test in
      `src/ui/settings-sections.test.ts` proving settings-screen's "The tab opens on its sections"
      and that «Імпорт Saldo» points at the import flow's route.
- [x] 7.3 Add `src/app/manage/saldo-import.tsx`: pick the file, read it as UTF-8, drive
      `src/ui/saldo-import.ts` through its steps, render map / debts / report / commit, call
      `importRepo.commit`, then show what was written or the failure. The `.tsx` decides nothing
      the pure layer already decides.
- [x] 7.4 Smoke-tested on the emulator (Pixel_10_Pro, API 37) with `scripts/android.sh`. Seen:
      «Імпорт Saldo» is the fourth section of Налаштування and opens the flow; the owner's real
      export (663 KB, 2 416 transactions) is picked and parsed on the device, and the map step
      shows all 27 entries with the види Saldo's own types imply (інжур → Інвестиції, euro cash →
      Готівка); only one name is proposed for creation — "Uncategorised income" — because the
      seeded starter set already holds the owner's Saldo categories verbatim; the debts step lists
      all 14 «Борг» descriptions and assigning one drops the «Без людини» count; the report renders
      per-рахунок reconciliation, the dropped rows with the same reasons the dry-run prints, and
      "Буде записано: 2 369 транзакцій, 28 рахунків, 0 категорій, 1 джерел"; the commit is withheld
      with "Спершу призначте людину для N запис(ів) «Борг»" while any is unassigned. Running the
      flow twice to the report without committing left the device with no рахунок at all. The
      commit itself was then exercised on a 200-transaction slice of the same export (`.cache/
      android/saldo-slice.csv`, «Борг» rows excluded so the assignment step is empty): «Імпортувати»
      reported "Записано: 188 транзакцій, 13 рахунків, 0 категорій, 0 джерел", the Рахунки screen
      shows the 13 рахунки grouped by вид with binance usdt at 310,00 USD and binance crypto at
      400,00 USD — exactly the "Сходиться" figures of the report — and Місяць is empty for the
      current month, which is right for a slice dated 2024. Reopening the flow states "Імпорт уже
      виконано 25.08.2026, 16:40:11. Ще один подвоїть усю історію."
      A second pass, after the diff review, covered what the first had not, on the device that
      already held the first import: an entry merged onto a рахунок the owner already has shows
      "→ наявний рахунок «mono black»" with an undo (and the види now read Витратні / Накопичувальні
      / Інвестиційні / Готівка / Борги, the same words as Рахунки); the debts step lists each «Борг»
      transaction as "2026-01-21 · 2000,00 UAH — без людини · «Ярослав С.»"; assigning the shared
      description «Ярослав С.» sent both to Yaroslav, and assigning the later transaction alone sent
      it to Olya, which the report then showed as two рахунки-борги, "Yaroslav: 2000,00 UAH" and
      "Olya: 2500,00 UAH"; and on that device the commit was offered only after «Так, імпортувати
      ще раз».
      Fixed along the way: the report step told the owner to assign a person but offered no way
      back to the debts step (both steps now carry a «Назад» action); the debts step listed only
      descriptions, with no per-transaction assignment and no way to pick a рахунок-борг that
      already exists; an entry could be merged only onto another entry, never onto a рахунок the
      owner already has; and a merge onto an existing рахунок of the same name showed nothing at
      all, because the row inferred "merged" from the name rather than being told.

## 8. Truth kept coherent

- [x] 8.1 Nothing to implement for the `saldo-import` delta — it corrects one stale clause about
      what the domain reserves. Confirm no code or test asserts "no джерело is reserved":
      `grep -rn "reserved" src/ | grep -i source`.

## 9. Done

- [x] 9.1 Run `npm run verify` and paste the final lines
- [x] 9.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
