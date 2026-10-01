## 1. Vocabulary

- [x] 1.1 Record the owner's decision of 2026-10-01 in `docs/product-vision.md` (§4 «Розстрочки», §8, §13, §14 items 3, 6, 10 and 14) and the section «Розстрочки», the Backup entry and two distinction rows in `docs/glossary.md` — drafted with the proposal; re-read against the specs, then verify `npm run verify` passes

## 2. Domain (`src/domain/installments.ts`, tests in `src/domain/installments.test.ts`)

- [x] 2.1 `splitInstallment` (design D3); prove "An even split", "The remainder falls on the last платіж", "A hand-set платіж moves the difference to the last", "Платежі that exceed the повна сума are refused"
- [x] 2.2 `installmentRefusal`; prove "A complete розстрочка is stored" (no refusal), "A розстрочка on a foreign-currency рахунок is refused", "A розстрочка without a назва is refused", "An archived рахунок or категорія is refused", "One платіж is not a розстрочка", "All платежі already paid is refused at creation"
- [x] 2.3 `installmentSchedule` from the original day; prove "Monthly on the same day" and "The 31st in a shorter month"
- [x] 2.4 `installmentPartStates`, progress, залишок; prove "Платежі counted as paid before", "A late debit is noticed", "The last платіж closes the розстрочка", "Paid off early" (залишок 0), "Reopening a розстрочка closed by mistake", "Shortening a розстрочка drops the extra платежі", "Marked as paid without a debit"
- [x] 2.5 `matchInstallmentDebits` links and ordering; prove "A monobank debit becomes the платіж", "A different сума is not a списання", "A переказ of the same сума is not a списання", "Another рахунок is not the рахунок списання", "Two розстрочки of the same сума on the same day", "An unlinked debit is not taken back"
- [x] 2.6 `matchInstallmentDebits` drops and categorise-on-new-link only; prove "A categorised витрата keeps its категорія", "The owner's категорія after linking stands", "A debit retyped as a переказ releases its платіж", "Moving the рахунок списання drops links on the old one", and that a link more than ten days from a moved дата is dropped
- [x] 2.7 `freeAfterInstallments` and `installmentReminderDates`; prove "Two платежі, one already debited", "Nothing owed means no reading", "A past month has none", and that two parts on one дата give one reminder date and a paid part gives none

## 3. Storage

- [x] 3.1 Tables of design D2 in `src/db/schema.ts` and one new migration from `npm run db:generate` (never hand-edited); bump `BACKUP_SCHEMA_VERSION` and the exhaustive table list in `src/backup/format.test.ts`; prove in `src/db/installments-repo.test.ts` "Existing data survives the migration" and "The switch defaults to on"
- [x] 3.2 `src/db/installments-repo.ts` store/edit/close/reopen/delete, registered in `src/db/repos.ts`; prove "A розстрочка comes back whole", "A non-UAH рахунок списання is rejected", "Deleting a розстрочка leaves its транзакції", "Recording a розстрочка moves no number"
- [x] 3.3 Repo link/unlink/mark/refusal and the switch with its `asked` flag; prove "A транзакція links to one платіж at most", "A removed транзакція releases its link", "A debit of another сума picked by hand" (and that a hand-picked «Без категорії» витрата takes the розстрочка's категорія)
- [x] 3.4 `settle(today)` (design D4: amount-filtered window, no write when nothing changed, returns whether it changed, drops checked over every розстрочка); prove "Each платіж is the витрата of its own month" end to end and "A deleted debit releases its платіж", and that a `settle` with nothing to do leaves the storage stamp unchanged
- [x] 3.5 Move `installments.debit_account_id` in `mergeAccounts`; prove "Merging the card of a розстрочка" in the existing merge test file
- [x] 3.6 Snapshot read/replace with the installment tables deleted before accounts and categories (`src/db/backup-repo.ts`); prove "Replacing the state replaces the розстрочки" in the existing snapshot test

## 4. Бекап

- [x] 4.1 Optional section `installments` in `src/backup/format.ts`/`backup.ts` (format version unchanged) and its validation; prove "A розстрочка survives the round trip", "A бекап written before розстрочки existed still restores", "A розстрочка on a рахунок outside the бекап stops the restore", "One транзакція linked twice stops the restore", "A link outside the бекап stops the restore" in `src/backup/backup.test.ts`

## 5. Нагадування про платіж

- [x] 5.1 Create a placeholder `src/app/manage/installments.tsx` route (so the typed `NoticeRoute` `/manage/installments` compiles), then the `INSTALLMENT_DUE_NOTICE` constant in `ALL_NOTICES` and `installmentDueId(date)` in `src/reminders/notices.ts`; prove in `src/reminders/notices.test.ts` that it names no сума or назва and that `routeOf` sends its tap to `/manage/installments`
- [x] 5.2 `scheduleAt` on `LocalNotificationsPort` and its double; prove in `src/platform/local-notifications.test.ts` that a non-granted phone holds no dated arrangement and that cancel by id removes one
- [x] 5.3 Pure re-assertion in `src/reminders/installment-schedule.ts` (+ test); prove "One warning for the day before", "Two платежі on one day give one warning", "An early debit withdraws the warning", "Turned off means none"
- [x] 5.4 Device adapter: `scheduleAt` with the expo-notifications `DATE` trigger and `channelOf` mapping `installment-due-*` to the reminders channel in `src/platform/local-notifications-device.ts`; verify with `npm run typecheck` (never loaded by tests) and in the emulator smoke run
- [x] 5.5 Wire `settle` + re-assertion into `reconcileOnLaunch`, the end of the background monobank run and after a restore. The background run gets an `afterRun` hook on `BackgroundTurnPorts`, called inside `runBackgroundTurn` (`src/ui/monobank-background.ts`) after the run, a failure going to the журнал and never thrown, and bound in `src/platform/monobank-sync-task.ts`; prove "A debit synced in the background withdraws the warning" in `src/ui/monobank-background.test.ts` against `runBackgroundTurn` with the in-memory ports, `npm run typecheck` green

## 6. Screen logic (Node-tested, no React)

- [x] 6.1 `src/ui/installment-form.ts` (+ test): prefill, typed values kept, past-parts count, UAH-only рахунки, Ukrainian refusals per field; prove "Ten thousand over ten months", "The remainder is shown", "A typed платіж is not overwritten", "An existing розстрочка counts its past платежі"
- [x] 6.2 `src/ui/installments-screen.ts` (+ test) list model; prove "The nearest платіж leads", "A missed debit is visible from the list", "Paid-off ones are set apart", "An empty screen explains itself"
- [x] 6.3 Switch and permission logic in `src/ui/installments-screen.ts`; prove "The first розстрочка asks once", "A phone that already allows it is not asked", "A refused permission is said, not hidden"
- [x] 6.4 `src/ui/installment-detail.ts` (+ test): графік rows and verbs, candidates within ±10 days, delete confirmation; prove "The графік reads month by month", "Picking the списання by hand", "Deleting asks first"
- [x] 6.5 `src/ui/month-screen.ts` (+ test): the «Розстрочки» block and the UAH line; prove "October shows its two платежі", "An empty month still shows what it owes", "A month without платежі has no block", "What is free after the платіж still owed", "Before the first дохід it sits beneath залишилось", "No UAH group, no reading", "Not for a past month", "Nothing owed hides it"

## 7. Screens

- [x] 7.1 `src/app/manage/installments.tsx`: list, «Нова розстрочка», «Закриті», switch line; `settle` + re-assertion on focus; verify with `npm run typecheck` and the smoke run
- [x] 7.2 The form editor (back gesture via `use-close-on-back`), opened from the list and «Редагувати»; prove "The back gesture discards the form" in the smoke run, `npm run typecheck` green
- [x] 7.3 `src/app/installment/[id].tsx` with per-part verbs and the candidate picker; re-assertion after every change; verify with `npm run typecheck` and the smoke run
- [x] 7.4 Місяць: the block (tap → `/manage/installments`) and the UAH line, `settle` on focus; Налаштування: the section «Розстрочки»; prove "The section opens the screen" and "The block leads to the screen" in the smoke run, `npm run typecheck` green

## 8. Close

- [ ] 8.0 Coordination (design D5): whichever of `installments` and `reminders-and-alerts` archives second amends the closed list of "Nothing the app posts carries money, a name or bank text" to admit the warning of a платіж tomorrow; after 8.2 and the commit, record whether the `smoke-runner` pass on the emulator ran or was not run and why (CLAUDE.md order: diff-reviewer PASS → commit → smoke-runner → archive); likewise the MODIFIED requirement "The Налаштування tab hosts the management sections" is also modified by `google-drive-backup`, `rule-template` and `reminders-and-alerts`: whichever of the four archives last merges every section into one text, so it names «Нагадування», «Google Drive», «Розстрочки» and whatever `rule-template` adds
- [x] 8.1 Run `npm run verify` and paste the final lines
- [x] 8.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
