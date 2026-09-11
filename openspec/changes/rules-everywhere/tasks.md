## 1. The domain: what an опис proposes and what a sweep moves

- [ ] 1.1 Add `proposeMerchantPattern(description)` to `src/domain/rules.ts` — the leading run of
  letters and the spaces between them, folded and trimmed, falling back to the whole folded опис
  (design D3). Tests in `src/domain/rules.test.ts` prove "Categorising an imported витрата offers
  the правило" («СІЛЬПО 123 Київ, вул. Хрещатик» → «сільпо»), «Нова Пошта відділення 5» → «нова
  пошта», and "An опис that starts with no letter proposes the whole of itself" («7-Eleven Kyiv» →
  «7-eleven kyiv»); an empty or blank опис proposes nothing.
- [ ] 1.2 Add `sweepUncategorised(rules, transactions)` to `src/domain/rules.ts` returning the
  `{ id, categoryId }` moves, matching on опис with no MCC (design D1). Tests in
  `src/domain/rules.test.ts` prove "A new правило clears the matching витрати out of «Без
  категорії»", "A категорія the owner chose is never taken away", "An MCC-only правило moves
  nothing", "A витрата with no опис is not swept", "A повернення is not swept", "A more specific
  правило keeps the last word during the sweep", "A правило targeting «Без категорії» moves
  nothing" — the guard that covers a правило a restore could land (design D1) — and that a
  коригування, a дохід and a переказ are never moved.

## 2. Storage: storing a правило sweeps

- [ ] 2.1 Add a category-only update to `src/db/transactions-repo.ts` — the sweep changes one column
  on rows it never parsed as a whole (design context). A test in
  `src/db/transactions-repo.test.ts` proves the транзакція round-trips with its сума, дата,
  рахунок, опис and `stored_at` untouched.
- [ ] 2.2 Reject «Без категорії» as a правило's target in `src/db/rules-repo.ts`, beside the
  «Коригування» rejection, with its own sentence. A test in `src/db/rules-repo.test.ts` proves
  "«Без категорії» is rejected as a rule's target".
- [ ] 2.3 Make `rulesRepo.save` upsert the правило, run `sweepUncategorised` over the правила as
  they stand after the upsert, and apply the moves — all in one `db.transaction` (design D2). It
  returns `{ examined, moved }`, where `examined` counts the «Без категорії» витрати considered.
  Tests in `src/db/rules-repo.test.ts` prove "A stored правило recategorises the «Без категорії»
  витрати it matches", "A витрата already moved is not swept again" and "Deleting a правило moves
  nothing".
- [ ] 2.4 Prove restore does not sweep: a test in `src/db/backup-repo.test.ts` restores a state
  holding правила and a «Без категорії» витрата they match, and asserts the витрата is exactly as
  the backup held it (design D2).

## 3. The entry form follows the опис

- [ ] 3.1 Add `proposedCategoryId(draft, rules)` to `src/ui/entry-form.ts`, taking the draft's
  `type` (design D4). Tests in `src/ui/entry-form.test.ts` prove "A typed опис proposes its
  категорія", "The owner's own pick is not overridden", "An опис no правило matches proposes
  nothing", "A правило takes no part in a дохід", "A правило takes no part in a повернення", and
  that a переказ takes nothing either.
- [ ] 3.2 Wire it into `src/app/transaction/new.tsx`: load правила with the rest of the form's
  state, hold `pickedByOwner`, and show the proposed категорія as chosen. Verified on the emulator
  in task 6.1 — the chip reads Groceries before «Записати».

## 4. The offer to remember, and the one seam that stores a правило

- [ ] 4.1 Add `ruleOffer({ description, categoryId, rules })` to `src/ui/list-management.ts`
  (design D5). Tests in `src/ui/list-management.test.ts` prove "A витрата with no опис is offered
  nothing", "Nothing is offered for a правило that already covers it", "A different категорія than
  the правила give is still offered", "A повернення is offered the правило too", "Moving a витрата
  back into «Без категорії» offers nothing", and the proposed pattern of a plain опис.
- [ ] 4.2 Add `storeRule(rule)` to `src/ui/list-management.ts` — the one seam every screen stores a
  правило through: `journal.step('rules/sweep', …)` with `counts: { examined, moved }`, returning
  the sentence to show when anything moved (design D6). Tests in
  `src/ui/list-management.test.ts` prove "The pass is in the журнал as counts alone" (two numbers,
  no опис, сума or назва), "The owner is told how many moved" and "A pass that moved nothing says
  nothing".
- [ ] 4.3 Build the offer as a dialog component beside the existing form components — the pattern in
  an editable field, the target категорія named, «Запамʼятати» and «Не треба». A refused pattern
  goes through `reportFailure`/`failureAlert` like every other refusal, so the dialog offers
  «Повідомити про помилку» ("An emptied pattern stores nothing").
- [ ] 4.4 Raise it from the «Без категорії» mark in `src/app/(tabs)/index.tsx`, after the категорія
  is stored, never before (design D5). Move the «Правила» screen onto `storeRule` too. Verified on
  the emulator in task 6.1.
- [ ] 4.5 Raise it from `src/app/transaction/[id].tsx` when saving changed the категорія of a
  витрата or повернення carrying an опис, and not when a дохід's джерело or a переказ changed
  ("Setting a джерело on a дохід offers nothing", "Editing a переказ offers nothing"). Verified on
  the emulator in task 6.1.

## 5. The docs

- [ ] 5.1 Correct `docs/glossary.md` «Опис»: it decides the категорія a витрата is offered through
  the owner's правила, at recording as at import, and manual entry does ask for one. Correct «Rule»:
  правила apply wherever a витрата is created, and storing one recategorises the stored «Без
  категорії» витрати it matches. Add «Розбір» as the name of that pass, so the specs' noun has a
  glossary entry.
- [ ] 5.2 Update the Purpose of `openspec/specs/categorisation-rules/spec.md` — matching is no
  longer what "every import source" alone runs; manual entry is a fourth caller.
- [ ] 5.3 Correct FR-C2 in `docs/tech-task.md` — it reads «застосовуються до імпортованих
  транзакцій», which is the sentence this change makes false — mark FR-C2 and FR-C3 as built, and
  add this change to the table.

## 6. The emulator

- [ ] 6.1 Run the `smoke-runner` subagent over this change's scenarios: record a витрата typing
  «АТБ» and check the категорія chip before «Записати»; categorise a «Без категорії» витрата from
  the feed and take the offer; decline it on another; read the sentence naming how many витрати
  moved; confirm in «Правила» that exactly what was accepted is stored. Fix what it finds; record
  what was seen.

## 7. The gate

- [ ] 7.1 Run `npm run verify` and paste the final lines
- [ ] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
