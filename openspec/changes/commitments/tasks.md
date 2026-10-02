Every new test goes in the test file of the module it proves, under a `describe` that names the
capability (`commitments`, `commitments-screen`, `month-screen`, …). About twenty scenario titles
repeat installments titles word for word, and the `describe` keeps a title search from counting
the розстрочки' tests as this change's.

## 1. Vocabulary

- [x] 1.1 Record the owner's decision of 2026-10-02 in `docs/product-vision.md`: §4 Lending and the new «Зобов'язання», §6, §8 («Вільно після зобов'язань» replacing «Вільно після розстрочок»), and §14 items 6 and 10. Record it in `docs/glossary.md` too:
  - the new section «Зобов'язання» (with its own «Стан платежу зобов'язання»);
  - in «Розстрочки», платіж, графік, рахунок списання, списання and нагадування про платіж widened or narrowed for both plans;
  - опис and the Backup entry;
  - the reading renamed;
  - new distinction rows.

  Both were drafted with the proposal and revised after `spec-reviewer`. Re-read them against the specs, then verify `npm run verify` passes

## 2. Domain (`src/domain/commitments.ts`, tests in `src/domain/commitments.test.ts`)

- [x] 2.1 Export `monthsAfter` from `src/domain/installments.ts` (design D2); add `commitmentProblems`/`commitmentRefusal` (design D3). Prove "A complete зобов'язання is stored", "A зобов'язання on a USD card is in dollars", "A зобов'язання without a назва is refused", "A сума of zero is refused", "An archived рахунок or категорія is refused" and "A two-letter ознака is refused"
- [x] 2.2 The графік part of `commitmentDues` with its `until` bound (design D1). Prove "Monthly on the same day", "Quarterly", "Yearly on the 29th of February" and "The 31st in a shorter month", and that there is no платіж before the first or after the дата припинення
- [x] 2.3 States, `nearestDue`, stop and resume. Prove:
  - "A late debit is noticed", "Within three days it is still expected" and "A skipped платіж is not owed" (its state);
  - "Marked as paid without a debit" and "A skipped платіж taken back";
  - "Stopping before the next платіж", "Resuming a зобов'язання stopped by mistake" and "Resuming after months brings back the gap";
  - "A dearer підписка" (the scheduled сума of open платежі)
- [x] 2.4 `matchCommitmentDebits`: links, ordering, сума-or-ознака qualification, `takenByInstallments`, and the optional `description` added to `DebitCandidate`. Prove:
  - "A debit of the exact сума becomes the платіж";
  - "Without an ознака a different сума is not a списання";
  - "With an ознака the сума may differ" and "With an ознака the сума alone is not enough";
  - "A повернення whose опис contains the ознака is not a списання", "A переказ of the same сума is not a списання" and "A коригування of the same сума is not a списання";
  - "Another рахунок is not the рахунок списання";
  - "A розстрочка is served first", with the розстрочка's ids passed in;
  - "A розстрочка recorded later does not take a linked витрата" (a kept зобов'язання link stays);
  - "An unlinked debit is not taken back";
  - that a пропущено платіж is never linked
- [x] 2.5 `matchCommitmentDebits`: drops and categorise on new links only; also `factsDroppedByEdit` and `factsDroppedByStop` (design D3). Prove:
  - "A categorised витрата keeps its категорія" and "The owner's категорія after linking stands";
  - "A debit retyped as a переказ releases its платіж" and "A deleted debit releases its платіж";
  - "Moving the рахунок списання drops links on the old one" and "Moving the дата першого платежу drops a far link";
  - "Changing how often drops what was said about moved платежі" and "Editing a stopped зобов'язання drops what falls after the stop";
  - "Stopping removes what was said about later платежі"
- [x] 2.6 Optional `takenByCommitments` input to `matchInstallmentDebits` (design D4), defaulting to empty. Prove "A витрата already linked to a зобов'язання is not taken" in `src/domain/installments.test.ts`; every existing installments test is unchanged
- [x] 2.7 Add `owedByCurrency` and `freeAfterCommitments` (with the JSDoc of design D3). Remove `freeAfterInstallments` and move its scenarios into `commitments.test.ts`. Prove "Оренда, інтернет and a розстрочка", "Every currency on its own", "A skipped платіж is not subtracted", "A missing debit is still owed" and "A past month has none", and that with only розстрочки owed the UAH сума equals what «Вільно після розстрочок» gave (the REMOVED requirement's Migration)

## 3. Storage (tests in `src/db/commitments-repo.test.ts` unless named otherwise)

- [x] 3.1 Add the tables of design D5 to `src/db/schema.ts` and generate one new migration with `npm run db:generate` (never hand-edited; the number is whatever is next at that moment). Bump `BACKUP_SCHEMA_VERSION` to current + 1 and extend the exhaustive table list in `src/backup/format.test.ts`. Prove "Existing data survives the migration"
- [x] 3.2 `src/db/commitments-repo.ts` store/edit/stop/resume/delete, registered in `src/db/repos.ts`. It checks the currency against the рахунок, and an edit or stop deletes the facts of design D3 in the same write. Prove "A currency other than the рахунок's is rejected", "Recording a зобов'язання moves no number", "Deleting a зобов'язання leaves its транзакції" and "Deleting removes only the plan", and that an edit and a stop drop exactly the facts 2.5 names
- [x] 3.3 Repo link/unlink/mark (`paid`/`skipped`)/refusal, with one state fact per платіж, no fact after the дата припинення, and cross-plan uniqueness in both directions. That includes `installmentsRepo`'s hand link and its candidate list skipping commitment-linked транзакції. Prove "A зобов'язання comes back whole", "A marked платіж cannot also be linked", "Nothing is stored for a платіж after the stop", "A транзакція links to one платіж at most, whatever the plan", "A removed транзакція releases its link" and "A debit of another сума picked by hand". Prove "A витрата linked to a зобов'язання is not offered" in `src/db/installments-repo.test.ts`
- [x] 3.4 `settleIn(tx, today)` on both repos and `settlePlans(db, today)` in `src/db/plans-settle.ts` (design D4): one `immediate` write, розстрочки first, a window-filtered scan, no write when nothing changed, `{ installments, commitments }` returned. Prove in `src/db/plans-settle.test.ts`:
  - "Each платіж is the витрата of its own month" and "A платіж never debited is never spent", end to end over витрачено;
  - "A розстрочка is served first" end to end;
  - that a settle with nothing to do leaves the storage stamp unchanged
- [x] 3.5 `settleAndReassert` in `src/ui/installment-upkeep.ts` settles through `settlePlans` before its `only: 'if-changed'` return; bind it in `src/hooks/installment-ports.ts`. Prove in `src/ui/installment-upkeep.test.ts`, against a real database:
  - that the зобов'язання are settled when the розстрочки' settle changed nothing;
  - that the reminders re-assert only when the розстрочки' settle changed something
- [x] 3.6 Move `commitments.debit_account_id` in `mergeAccounts`. Prove "Merging the card of a зобов'язання" in `src/db/account-merge-repo.test.ts`
- [x] 3.7 Snapshot read/replace with the commitment tables deleted before accounts and categories (`src/db/backup-repo.ts`). Prove "Replacing the state replaces the зобов'язання" in `src/db/backup-repo.test.ts`

## 4. Бекап

- [x] 4.1 Optional section `commitments` in `src/backup/format.ts` and `src/backup/backup.ts` (format version unchanged), with the validation of design D8. Prove in `src/backup/backup.test.ts`:
  - "A зобов'язання survives the round trip";
  - "A бекап written before зобов'язання existed still restores";
  - "A зобов'язання on a рахунок outside the бекап stops the restore";
  - "One транзакція linked to a розстрочка and a зобов'язання stops the restore";
  - "A платіж said twice, or said after the stop, stops the restore";
  - "A two-letter ознака stops the restore";
  - "A link outside the бекап stops the restore";
  - "A зобов'язання on a since-archived рахунок restores"

## 5. Screen logic (Node-tested, no React)

- [ ] 5.1 `src/ui/commitment-form.ts` (+ test): prefill and edit values, the four chips, the сума in the рахунок's currency, unarchived рахунки, the first-date hint, Ukrainian refusals per field. Prove "Monthly unless told otherwise", "A USD card makes a USD сума" and "A refusal sits next to its field"
- [ ] 5.2 `src/ui/commitments-screen.ts` (+ test) list model, bounded by `max(today, firstDue)` + one period. Prove "The nearest платіж leads", "A missed debit is visible from the list", "Stopped ones are set apart" and "An empty screen explains itself"
- [ ] 5.3 `src/ui/commitment-detail.ts` (+ test): платежі newest first up to the first after today, verbs per state, candidates within ±10 days, «Припинити»/«Відновити», delete confirmation. Prove "The платежі read newest first", "Picking the списання by hand", "Skipping a платіж", "Stopping moves it under Припинені" and "Deleting asks first"
- [ ] 5.4 «Оновити суму» in `src/ui/commitment-detail.ts`. Prove "Netflix got dearer" and "The same сума offers nothing"
- [x] 5.5 `src/ui/month-screen.ts` (+ test): the «Платежі місяця» block over both plans. Rows show the scheduled сума, each row has a `href`, and totals are per currency, with no total for a currency whose платежі are all пропущено. Prove "October shows its two платежі", "Every currency totals on its own", "A skipped платіж is listed but not totalled", "The block leads to the screen", "A платіж of a зобов'язання leads to its зобов'язання", "An empty month still shows what it owes" and "A month without платежі has no block"
- [x] 5.6 `src/ui/month-screen.ts` (+ test): «Вільно після зобов'язань» in every owing currency group. Prove "What is free after the платіж still owed", "A USD group gets its own reading", "Before the first дохід it sits beneath залишилось", "No UAH group, no reading", "No USD group, no USD reading", "Not for a past month" and "Nothing owed hides it"
- [ ] 5.7 `src/ui/settings-sections.ts`: the row «Зобов'язання» right after «Розстрочки». Prove in `src/ui/settings-sections.test.ts`:
  - "The tab opens on its sections";
  - "The Зобов'язання section opens its screen" — the href is `/manage/commitments` and that route file renders the list model, following the «Базові категорії» precedent there

## 6. Screens

- [ ] 6.1 `src/app/manage/commitments.tsx`: the list, «Нове зобов'язання» and «Припинені», with `settleInstallmentsOnFocus` on focus. Register it in `src/app/_layout.tsx`. Verify with `npm run typecheck` and the smoke run
- [ ] 6.2 The form editor (back gesture via `use-close-on-back`), opened from the list and from «Редагувати». Prove "The back gesture discards the form" in `src/ui/screens.test.ts`, as that file proves it for the bug-report form: nothing writes outside «Зберегти», and the editor closes on back. Then in the smoke run; `npm run typecheck` green
- [ ] 6.3 `src/app/commitment/[id].tsx`: verbs per платіж, the candidate picker, «Оновити суму», with `settleInstallmentsOnFocus` on focus. Register it in `src/app/_layout.tsx`. Verify with `npm run typecheck` and the smoke run
- [ ] 6.4 Місяць: «Платежі місяця» rows as pressables (the block-level tap goes) and the reading in every owing currency group, in `src/app/(tabs)/month.tsx`. Check "The block leads to the screen", "A платіж of a зобов'язання leads to its зобов'язання" and "The Зобов'язання section opens its screen" in the smoke run, beside their vitest proofs in 5.5 and 5.7; `npm run typecheck` green

## 7. Close

- [ ] 7.1 Update `docs/app-overview.md`: §2 (зобов'язання, «Вільно після зобов'язань»), §3.3 («Платежі місяця», the reading), §3.9 (the section), §4.11 (the shared linking rule), a new §4.11a «Зобов'язання», §5.2 (tables), §6 (status row) and §7 (item 6 and item 10). Verify `npm run verify` passes
- [ ] 7.2 Coordination and record:
  - `observations-and-month-summary`, `category-icons-and-transaction-visuals`, `merchant-normalization` and `local-model-guesses` also add requirements to capabilities this change touches (`month-screen`, `settings-screen`, `persistence`, `backup-file`). Each adds a migration and backup tables. Whichever archives after this change re-reads the merged main specs and takes the next migration number and `BACKUP_SCHEMA_VERSION`. If this change archives after any of them, it does the same;
  - after 7.4 and the commit, record whether the `smoke-runner` pass on the emulator ran, or was not run and why (CLAUDE.md order: diff-reviewer PASS → commit → smoke-runner → archive)
- [ ] 7.3 Run `npm run verify` and paste the final lines
- [ ] 7.4 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
