# uniform-fields — tasks

Every task that changes behaviour writes its failing test first. Scenario names are quoted from
this change's delta spec (`specs/app-shell/spec.md`); tests sit next to their source in `src/ui/`
(or `src/progress/`), never under `src/app/`. No box is ticked before `npm run verify` is green on
the tree that holds it.

## 1. No рахунок-борг to pay from (commitments-screen, installments-screen, bank-notifications-screen)

- [x] 1.1 Add `isPerson` to `src/ui/account-choices.ts` and drop such рахунки from
      `commitmentAccountChoices` (`src/ui/commitment-form.ts`) and `debitAccountChoices`
      (`src/ui/installment-form.ts`), carrying a stored plan's chosen рахунок back with `withCurrent`
      through a new optional `currentId` parameter (also on `commitmentAccountRows`) (design D4). Prove "A зобов'язання is not paid from a person", "A stored зобов'язання on a
      рахунок-борг still shows it" and "Only рахунки-борги leave nothing to pay from" in
      `src/ui/commitment-form.test.ts`; "A розстрочка is paid from bonds but not from a person" and "A
      stored розстрочка on a рахунок-борг still shows it" in `src/ui/installment-form.test.ts`. Keep
      "The pickers offer five and the rest behind one offer" green.
- [x] 1.2 Move the watch's рахунок list out of `src/app/manage/notifications.tsx` into
      `watchAccountChoices` in `src/ui/notifications-screen.ts`, without рахунки-борги (design D4).
      (The builder lives in `src/ui/notification-settings.ts`, the section's existing view model;
      there is no `notifications-screen.ts`.) Prove "A watched bank app is not mapped to a person" in
      `src/ui/notification-settings.test.ts`;
      keep "An archived рахунок is not offered" green.
- [x] 1.3 Amend the glossary entry for «Рахунок списання» in `docs/glossary.md`: never a рахунок-борг,
      any other вид including інвестиційний. Verify with `npm run verify` (openspec validate step).

## 2. One picker everywhere (app-shell "Every picker of one рахунок, категорія or джерело is the entry form's picker")

- [x] 2.1 Розстрочка form: add `installmentAccountRows` / `installmentCategoryRows` (рахунки named
      with `accountChoiceLabel`), load `listLatest(RECENT_WINDOW)` and swap both `Choices` in
      `src/app/manage/installments.tsx` for `Picker` with `useCloseOnBack` on the open list (design
      D1, D2). Prove "The розстрочка form no longer scrolls through every категорія" in
      `src/ui/installment-form.test.ts` (rows + `shortlist` + `allOffer`), and "«Назад» closes the
      full list of a plan form first" by a source assertion in `src/ui/screens.test.ts` that the
      screen passes its open picker to `useCloseOnBack`.
- [x] 2.2 Правило form: rows for «Категорія» and «Переказ на» in `src/ui/list-management.ts`, recents
      loaded, both `Choices` in `src/app/manage/rules.tsx` swapped for `Picker` (one open at a time,
      «назад» closes it). Prove "A правило-переказ finds its рахунок through the search" in
      `src/ui/list-management.test.ts` (rows narrowed by `narrow` with «банка», the picked id stored
      by `ruleFromDraft`).
- [x] 2.3 Шаблон and ціль витрат: `templateTargetRows` in `src/ui/rule-template-screen.ts` and
      `spendingGoalCategoryRows` in `src/ui/goals-section.ts`; `Picker` in
      `src/app/manage/rule-template.tsx` (tap still stores and sweeps, design D3) and in
      `src/app/manage/goals.tsx`. Prove "A ціль витрат's категорія comes from the same picker" in
      `src/ui/goals-section.test.ts`, and in `src/ui/rule-template-screen.test.ts` that the opened
      базова категорія's current target is among the shown five.
- [x] 2.4 Watch and monobank link: `Picker` for the watch's «Рахунок» in
      `src/app/manage/notifications.tsx` and for «Наявний рахунок у …» in
      `src/app/manage/monobank.tsx` (tap confirms and links, design D3), rows from
      `watchAccountChoices` / `linkChoices`. Prove "A short list is drawn whole" in
      `src/ui/notification-settings.test.ts` (four рахунки, `allOffer` undefined) and add a
      `linkChoices` → rows case in `src/ui/monobank-screen.test.ts`.
- [x] 2.5 Guard the inventory: a source assertion in `src/ui/screens.test.ts` that no screen under
      `src/app` passes a рахунок, категорія or джерело list to `Choices` (the six screens of design
      §Context are on `Picker`), and that `src/app/transactions.tsx` still draws its рахунок
      narrowing with `Choices … scroll` — proving "A filter row is not turned into a picker". The
      guard covers джерела too: if `answer-queue`'s правило «Джерело» has landed by then, it moves
      to `Picker` here; otherwise answer-queue's merge does it (proposal, Sequencing).

## 3. Full lists without the keyboard (app-shell "A full list is read before it is searched")

- [x] 3.1 Assert in `src/ui/screens.test.ts` that `Picker`'s search field in
      `src/components/form.tsx` carries no `autoFocus` and that every `Picker` placed inside a form
      that scrolls sits in a `keyboardShouldPersistTaps` scroller with the app-shell keyboard
      avoidance. Prove "The full list of рахунки opens unobstructed" by that assertion; "Typing keeps
      the matches in sight" is proven on the emulator in 6.3, and fixed by `searchBelow` on any form
      where it fails there.

## 4. Date texts (app-shell "A дата in running text…", "A транзакція's дата reads as a day")

- [x] 4.1 Ціль deadline: a `deadlineLabel` field on `GoalRow` (`src/ui/goals-section.ts`), on the
      goal-screen model (`src/ui/goal-screen.ts`) and on the reports goal row
      (`src/ui/reports-screen.ts`), each `calendarLabel`; the three `.tsx` interpolate it. Prove "A
      ціль's deadline is a day in words wherever it is read" in `src/ui/goals-section.test.ts`,
      `src/ui/goal-screen.test.ts` and `src/ui/reports-screen.test.ts`.
- [x] 4.2 Чернетка line: `DraftLine` gains `dayLabel` of its дата (`src/ui/drafts-section.ts`);
      `src/app/(tabs)/index.tsx` draws it. Prove "A чернетка's line names its day" in
      `src/ui/drafts-section.test.ts`.
- [x] 4.3 Monobank and чек: `boundaryConfirmation` and its several-рахунки twin take `now` and write
      `calendarLabel` (`src/ui/monobank-screen.ts`); `receipt-screen.ts` writes the issue day with
      `calendarLabel` in the line and the date warning. Prove "The monobank link confirmation names
      its day" in `src/ui/monobank-screen.test.ts` and "A чек's issue day differs in words" in
      `src/ui/receipt-screen.test.ts`.
- [x] 4.4 Досягнення and Saldo: move `calendarLabel`'s wording to `src/domain/day-words.ts`
      (re-exported by `src/ui/dates.ts`, design D7) and use it in the catalogue's deadline condition
      (`src/progress/catalogue.ts`, no import from `src/ui`); the Saldo «Імпорт уже виконано» sentence moves into
      `src/ui/saldo-import.ts` built with `momentLabel`. Prove "A досягнення's condition names its
      day" in `src/progress/catalogue.test.ts` and "A past import is an instant in words" in
      `src/ui/saldo-import.test.ts`; add to `src/ui/screens.test.ts` an assertion that no module in
      `src/app` or `src/ui` calls `toLocaleString` or `toLocaleDateString`.

## 5. Date control (app-shell "A дата or a місяць the owner sets…")

- [ ] 5.1 `dateStepOffers(typed, now, { looksAhead })` in `src/ui/dates.ts` and a `looksAhead` prop on
      `DateField`, passed by «До дати» (`manage/goals.tsx`) and «Дата першого платежу»
      (`manage/commitments.tsx`, `manage/installments.tsx`) (design D6). Prove "A first платіж steps
      past today" and "A транзакція still stops at today" in `src/ui/dates.test.ts`, and a source
      assertion in `src/ui/screens.test.ts` that exactly those three `DateField`s pass `looksAhead`.

## 6. Emulator and closing

- [ ] 6.1 Run `npm run verify` and paste the final lines
- [ ] 6.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
- [ ] 6.3 Smoke on the emulator with the owner's бекап (smoke-runner, `.claude/rules/android.md`):
      розстрочка, зобов'язання, правило, базова категорія, ціль витрат, watch and monobank link
      pickers show five + «Всі … (N)»; each full list opens with no keyboard and the matches stay above
      it while typing «под» / «банка»; no рахунок-борг under «Рахунок списання» while «військові
      облігації» is offered; «до 31 грудня» on Цілі, the ціль screen and «Звіти»; a чернетка line with «вчора»;
      «Дата першого платежу» steps past today; «назад» on an open «Рахунок списання» list of the
      розстрочка form closes the list and keeps the назва; the чек's issue day, a досягнення's
      condition, the Saldo «Імпорт уже виконано …» and the monobank link confirmation read in words. Record the verdict per scenario here, with an explicit line
      for "Typing keeps the matches in sight".
