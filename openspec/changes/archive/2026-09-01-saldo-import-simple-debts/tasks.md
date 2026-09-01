# saldo-import-simple-debts — tasks

## 1. The engine stops asking

- [x] 1.1 In `src/saldo/survey.ts` drop `DebtDescription`, `Survey.debtDescriptions`,
      `PersonAssignment`, `Decisions.debtPeople`, `Decisions.debtTransactions` and
      `NEW_DEBT_PREFIX`, and add the name and plan-local id of the one рахунок-борг the import
      builds (`DEBT_ACCOUNT_NAME = 'Борги'`, one id per currency); `src/saldo/survey.test.ts`
      loses the debt-description cases and keeps every other survey case green.
- [x] 1.2 In `src/saldo/interpret.ts` make every «Борг» transaction a переказ between its real
      рахунок and the «Борги» рахунок-борг of the real leg's currency, dropping `UnresolvedDebt`,
      `ImportPlan.unresolvedDebts`, `ImportPlan.complete`, `personFor` and the `unassigned-debt`
      and `debt-currency-mismatch` unexplained reasons — requirement "«Борг» legs become перекази
      on the рахунок-борг «Борги»", proven in `src/saldo/interpret.test.ts` by scenarios "Lending
      lands on «Борги»", "A repayment is the переказ back", "Every «Борг» row lands, whatever its
      description", "Two currencies get two рахунки-борги" and "An export with no «Борг» row
      creates no рахунок-борг".
- [x] 1.3 In `src/saldo/verify.ts` drop `Report.unresolvedDebts`, keeping the рахунок-борг
      balances the report states; `src/saldo/verify.test.ts` keeps the over-repaid case and
      `src/saldo/engine.test.ts` runs the whole engine over the fixture with no decisions at all.
- [x] 1.4 Update `scripts/saldo-dry-run.ts` to the plan's new shape (no unresolved list).

## 2. The flow loses a step

- [x] 2.1 In `src/ui/saldo-import.ts` reduce `Step` to `file | accounts | report | done` and drop
      `assignDescription`, `assignTransaction`, `DebtRow`, `debtRows`, `unassignedDebts` and
      `PlanSummary.unassignedDebts`; `canCommit` consults only the report having been seen, the
      outcome and the second-import confirmation — requirement "The import shows what it would do
      before it does anything", proven in `src/ui/saldo-import.test.ts` by scenario "The map step
      leads straight to the звірка" and by the existing commit-gate cases still passing.
- [x] 2.2 In `src/app/manage/saldo-import.tsx` remove the борги step, `PersonPick`, the person
      field and the report's «Назад — борги» and unassigned warning; the map step's action becomes
      «Далі — звірка» — requirement "The import shows what it would do before it does anything".

## 3. The merge proposals go

- [x] 3.1 In `src/ui/saldo-import.ts` remove `MergeSuggestion`, `mergeSuggestions`, `applyMerges`
      and the `strongest` helper, with their cases in `src/ui/saldo-import.test.ts`; the on-row
      target list and `redirectAccount` stay exactly as they are, which the remaining
      merge-by-hand cases prove. `src/domain/name-match.ts` stays where it is — monobank linking
      reads it.
- [x] 3.2 In `src/app/manage/saldo-import.tsx` remove the «Схоже на дублі» block and the
      `refusedMerges` state with it; «Об'єднати з» on the row and «Скасувати об'єднання» stay.
- [x] 3.3 Rewrite `openspec/changes/saldo-import-merge/` — proposal, design and tasks — to the
      one thing it now ships: the merge targets offered on the entry's own row, and the name
      matching living in `src/domain/name-match.ts`. Its two ADDED requirements about proposing
      merges go, so nothing about a proposal ever reaches the main specs.

## 4. The product truth

- [x] 4.1 In `docs/product-vision.md` §16 close the open question "How to identify the person
      behind each historic «Борг» transaction" with the owner's answer — the imported debts are
      closed and the person is not kept — and in `docs/glossary.md` say that рахунок-борг is one
      per person for debts kept by hand, while the Saldo import puts its closed history on a
      single «Борги» per currency.
- [x] 4.3 `docs/tech-task.md` FR-X3 still carried the rule this change removes — «особа
      визначається з опису транзакції, непевні випадки користувач розкладає вручну» — while
      `product-vision.md` and `glossary.md` had already been brought level by 4.1. It now says what
      the requirement says: one рахунок-борг «Борги» per currency, no person kept, the description
      not read for one. Three product docs, one answer.
- [x] 4.2 When this change is archived, **two** Purposes lose their person clause — a delta cannot
      rewrite a Purpose, so both are hand edits at archive time:
      - `openspec/specs/saldo-import-screen/spec.md` — drop " and which person each «Борг»
        transaction belongs to";
      - `openspec/specs/saldo-import/spec.md` — drop " and «Борг» person assignment".

## 5. Verification

- [x] 5.1 Run `npm run verify` and paste the final lines —
      `Test Files 89 passed (89) / Tests 1407 passed (1407)`,
      `✔ verify passed (66ad4fc4b0eef3dae9726ae5606b48ef1ab3e394)`
      (was `62 / 942` at `7aa70327…`, a tree older than task 4.3.)
- [x] 5.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS — first pass FAIL on
      one CRITICAL (`docs/tech-task.md` FR-X3 still carrying the removed person rule), closed by
      task 4.3; re-review **PASS (0 critical, 3 warning)** on
      `✔ verify passed (66ad4fc4b0eef3dae9726ae5606b48ef1ab3e394)`.

## 6. Emulator smoke (2026-09-01)

- [x] 6.1 The real export driven through the flow on the Pixel_10_Pro, screenshots in
      `.cache/android/smoke/`:
      - the map step ends in «Далі — звірка» and there is no борги step between them — nothing asks
        the owner about a person (`69-accounts-bottom.png`);
      - the звірка shows every рахунок «Сходиться» and «Буде записано: 188 транзакцій, 12
        рахунків» — and no «Борги» among them, because this export holds no «Борг» row: the
        scenario "An export with no «Борг» row creates no рахунок-борг", on a device
        (`70-report.png`, `71-report-top.png`);
      - leaving before «Імпортувати» stores nothing — «Рахунки» still holds the two it had
        (`72-accounts-after-leaving.png`).
      One thing seen, not a defect of this change: the «Рядки, які нічого не рухають» block prints
      the engine's own English (`accrual-month-divergence: the row is accrued to 2024-11 and dated
      2024-10-30; the import keeps the date`). It is a report line, not a form refusal, so the
      app-shell requirement does not reach it — but it is English in front of the owner, and it
      belongs in the backlog.
