# qa-sweep-2026-10 — tasks

Twenty-six defects from [docs/qa/2026-10-05-emulator-qa.md](../../../docs/qa/2026-10-05-emulator-qa.md)
plus four found while mapping the code. Every task that changes behaviour writes its failing test
first (AGENTS.md: bug fix = failing test first), and no box is ticked before `npm run verify` is
green on the tree that holds it. Scenario names below are quoted from this change's delta specs.

## 0. Order

- [ ] 0.1 Before `/opsx:archive`, confirm `merchant-normalization`, `observations-and-month-summary`
      and `commitments` are archived (design D1): `openspec validate qa-sweep-2026-10 --strict`
      shows no «target spec does not exist» and no «MODIFIED failed … not found» INFO line. Until
      then this change is applied and committed, never archived.

## 1. One way to draw money, dates and lists (app-shell)

- [x] 1.1 Route every сума through `formatMoney`; delete `formatHryvnia` and `formatPlanMoney` and
      move their callers (design D2). Update the «₴» expectations in `commitment-detail.test.ts`,
      `month-screen.test.ts`, `receipt-screen.test.ts`, `installment*.test.ts` to UAH. Prove "A
      зобов'язання and a витрата on one screen write their сума alike" and "A чек writes UAH too"
      in `src/ui/receipt-screen.test.ts` / `src/ui/month-screen.test.ts`, and add to
      `src/ui/screens.test.ts` a source assertion that no module under `src/app`, `src/ui` or
      `src/components` holds «₴» outside a parser.
- [x] 1.2 Replace `shortCalendarLabel` with `calendarLabel` and fix the three ISO leaks (design D2).
      Prove "The поточна вартість says when it was recorded in words", "A платіж date is never
      shortened" and "Another year is named" in `src/ui/dates.test.ts` and the view-model tests of
      the three screens (`accounts-screen`, `commitments-screen`, `monobank-screen`).
- [x] 1.3 Swap the free-text date fields of goals, commitments, installments and monobank for
      `DateField`, and the AI-аналіз month fields for a new `MonthStepper` with its label/bounds in
      `src/ui/months.ts` (design D3). Prove "A ціль's date is chosen from the calendar"'s pure half,
      "An impossible typed date is refused" in `src/ui/goals-section.test.ts`, and "A custom range is
      stepped, not typed", "A half-typed month is a sentence, not an exception" (its THEN now: every step reads as a whole
      місяць), "A range end
      cannot step past this month" and the amended "Opened for one month" in
      `src/ui/ai-analysis-screen.test.ts`; `screens.test.ts` asserts
      no screen still renders the «РРРР-ММ-ДД» placeholder.
- [x] 1.4 Sort the зобов'язання form's and the розстрочка form's (`src/ui/installment-form.ts`) lists
      with `byName` (design D4). Prove "Capitals do not jump
      the queue" over every `*Choices` builder in a new `describe` in `src/ui/labels.test.ts`.
- [x] 1.5 Mount `<StatusBar style="auto" />` in `src/app/_layout.tsx` (design D5). Prove the mount by
      a source assertion in `src/ui/screens.test.ts`; "The clock is readable on a light screen" is
      proven in §12.
- [x] 1.6 Give `use-close-on-back` an `isDirty` argument and the confirm (design D6); add a pure
      `sameFields` per form in `src/ui/*`. Update the "The back gesture discards the form" /
      "closes an open … form" proofs in `src/ui/screens.test.ts` and `src/ui/back-gesture.test.ts`
      to answer «Відкинути», and add "An edited form asks first" and "An untouched form closes at
      once". Covers every form app-shell's requirement lists (design D6): settings-screen's three
      editors and the rule form, installments-screen's, commitments-screen's and the ціль form, the
      entry form and the editing of a транзакція, «Звірити» and «Обʼєднати», `merchant/[id]`, and the
      репорт form and sheet (bug-report-screen, bug-report-here) — split into 1.6a (hook, settings,
      plans) and 1.6b (entry/editing, рахунок, продавець, репорт) if it runs past two hours.
      Done in two parts: 1.6a — hook, settings editors, rule form, plans, ціль form; 1.6b — entry
      form and editing of a транзакція, «Звірити» (and «Обʼєднати», which holds nothing typed),
      `merchant/[id]`, the naming form (through `Sheet`'s `isDirty`, since a `Modal` takes «назад»
      itself), the репорт form (screen and crash fallback) and sheet, via `answerBackPress`.
- [x] 1.7 Label every unlabelled switch, build `feedA11yLabel` with «понад ліміт», and give the
      «Статок» card's зміна (`src/app/net-worth.tsx:132`) an accessible name from a new
      `changeA11yLabel` on `MonthCard` in `src/ui/net-worth-screen.ts` (design D18). Prove "A widget
      switch says which widget" and dashboard-layout's "Six switches, six names" in
      `src/ui/dashboard-layout-editor.test.ts`, "A line over its ліміт says so" in
      `src/ui/transaction-line.test.ts` beside "A витрата in an over-limit category is marked", "A
      зміна that fell is heard as a fall" in `src/ui/net-worth-screen.test.ts`, and a
      `screens.test.ts` assertion that every `ThemedSwitch` passes `accessibilityLabel` and that
      `net-worth.tsx` passes the card's зміна its label.
- [x] 1.8 Draw a переказ title as two single-line, ellipsized рахунок names (design D18). Verify by
      `npm run typecheck` and a source assertion in `src/ui/screens.test.ts`; "A переказ title at a
      large text size" is proven in §12.

## 2. Proposals and matching (merchants, merchants-screen, categorisation-rules)

- [x] 2.1 Add the transliterated service words and `PROCESSOR_PREFIXES` to `src/domain/merchants.ts`
      (design D8). Prove "A transliterated service word is skipped", "A payment processor's prefix
      is skipped", "A processor prefix written with a space before the star is skipped", "A star
      after a name that is not a processor is not a prefix" and "A transliterated service word alone
      proposes itself too" in `src/domain/merchants.test.ts`, and extend its property test's prefix
      set; "Service words are skipped in the proposed pattern" in `src/domain/rules.test.ts` gains the
      «Oplata poslug» case.
- [x] 2.2 Add `occursAtWordStart` to `src/domain/fold.ts` and use it in `rules.ts:79` and
      `merchants.ts:150` (design D7). Prove "A merchant pattern inside a word does not match", "A
      merchant pattern after punctuation matches", "A pattern that starts with punctuation matches
      wherever it occurs", "A написання inside another word recognises nothing", "A написання after
      punctuation begins a word" and "A написання that starts with punctuation is recognised
      wherever it occurs" in `src/domain/rules.test.ts` and
      `src/domain/merchants.test.ts`; give `Rule` its `match` mode, set to `'substring'` only by
      `templateRules` (design D7), and prove "A шаблон fragment inside a word still matches" in
      `src/domain/rule-template.test.ts`; keep every existing matching
      and recognition scenario green.
- [x] 2.3 Before 2.2 is committed, run a Node script over the owner's бекап (the newest file in
      `/sdcard/Download`, pulled to `.cache/qa-sweep/`) that lists every опис whose rule target or
      продавець differs between substring and word-start matching, and every nameless group 2.1 and
      2.4 change; write it to `.cache/qa-sweep/match-diff.txt` (never committed) and record here only
      the counts. Verify the script reruns to the same counts.
      Done 2026-10-06 over `cap1tal-2026-09-23.json` (script `.cache/qa-sweep/match-diff.ts`, three
      runs, the same counts, before and after 2.2's code): 2 383 описи, 22 правила, 0 продавці;
      rule target differs: 1 (a витрата that leaves its категорія for none); продавець differs: 0;
      nameless groups 836 → 835 (4 gone, 3 new, 0 resized); 53 витрати dropped as a person or a
      банка; 5 описи open with «від» without a colon and stay listed; 3 описи open with one of two
      unlisted letter heads before «*» (one of them SumUp), 32 with a masked card number.
- [x] 2.4 Drop `PERSON_PREFIXES` описи from `namelessGroups` (design D8). Prove "A payment to a
      person is not a nameless продавець" in `src/ui/merchants-screen.test.ts`.
- [x] 2.5 Move the правило offer's sentence into `ruleOfferView` by target kind (design D17). Prove
      "A правило-переказ is offered as a переказ" and "A категорія правило is offered as a категорія"
      in `src/ui/list-management.test.ts`, and a source assertion that `rule-offer-sheet.tsx` holds
      no sentence of its own.

## 3. Спостереження (observations, month-screen, month-summary)

- [x] 3.1 Pass `linkedAccountIds` into `possibleDuplicates` and narrow `sameBankText` (design D9).
      Prove "The same опис entered twice by hand is a дубль", "Two equal сповіщення on an unlinked
      рахунок are asked about", "Equal описи on a linked рахунок are not asked about", "A hand record
      and the bank's record of one purchase with one опис are not asked about" and the amended
      "Two identical bank records are two purchases" (linked, MCC 5814) in
      `src/observations/duplicates.test.ts`. The owner confirmed the link test on 2026-10-06
      (design D9).
- [x] 3.2 Add `forget` to `src/db/duplicate-answers-repo.ts` and the in-place «Скасувати» row (design
      D10). Prove "«Не дубль» given by mistake is undone" in `src/db/duplicate-answers-repo.test.ts`
      (storage) and `src/ui/observations.test.ts` (the row's view model).
- [x] 3.3 Add «Видалити одну» (design D10). Prove "One of the two is deleted from the спостереження" in
      `src/ui/observations.test.ts` for the choice and confirmation text, and in
      `src/db/transactions-repo.test.ts` that the delete path cascades the answer as "Deleting the
      дубль ends the question" requires.
- [x] 3.4 Phrase a zero as absence (design D11). Update `src/observations/vs-typical.test.ts` "A
      категорія absent this month is stated as all of it less" to the amended THEN and prove the
      sentence in `src/ui/observations.test.ts`.
- [x] 3.5 Cut Місяць's and the підсумок's lists at `LIST_LIMIT` with «Ще N» (design D11). Prove "Ten
      facts are five and «Ще 5»" in `src/ui/month-screen.test.ts` and month-summary's "More than five
      спостереження fold under «Ще N»" in `src/ui/month-summary-screen.test.ts`.
- [x] 3.6 Name the коригування inside the підсумок's витрачено. Prove "Коригування inside витрачено
      are named" in `src/month-summary/summary.test.ts`.

## 4. Головний

- [x] 4.1 Add the `bank-unheard` attention item and `syncCoverage`'s `oldestSyncedMs` (design D12).
      Prove "Twelve days without a token are said", "Some linked рахунки never synced", "No linked
      рахунок ever synced", "A device that never connected a bank stays quiet" and "Entering the
      token clears the row" and "A linked bank without a token is not synced by the gesture" in
      `src/ui/home-screen.test.ts`; keep "Scenario: Without monobank there is no line" green for the
      no-link case and add its linked-without-token twin asserting no freshness line.
- [x] 4.2 Add «Обрати джерело» on a дохід «Без джерела» in the feed (design D13). Prove "One tap
      gives a дохід its джерело", "A дохід that is really a повернення is retyped from its editing"
      (the mark's choices hold only джерела; the line's own tap still routes to editing) and "Nothing
      else is offered a джерело" in `src/ui/home-screen.test.ts` and
      `src/ui/transaction-line.test.ts`.
- [x] 4.3 Pass `suggestedId` to the quick picker and take `autoFocus` off its search (design D14).
      Prove "The шаблон's категорія is one tap away" in `src/ui/shortlist.test.ts` and "The full list
      is read before it is searched" by a source assertion on `src/components/form.tsx`.
- [x] 4.4 Name the two сума refusals (design D17). Prove "An empty сума asks for one" and "A
      negative сума is named as such" in `src/ui/amount-input.test.ts`, updating "A non-positive
      amount is rejected" and "What is not a number is not an amount" to match.
      A zero сума reads «Сума має бути більшою за нуль» too (main-screen: «zero or negative»), proven
      in "A non-positive amount is rejected"; the ліміт form shares the parser, so app-shell's "A
      ліміт that is not positive is refused in Ukrainian" now expects the same words (no spec
      quoted the old «сума має бути більша за нуль, а не «0»»).
- [x] 4.5 Draw the empty «Спостереження» sentence inside its card (design D18). Prove the amended
      "Nothing notable yet" by a source assertion in `src/ui/observations.test.ts`.

## 5. Транзакції

- [x] 5.1 Add the `unsourced` repo filter and the `ONLY_UNSOURCED` param, mutually exclusive with
      «Без категорії» (design D13). Prove "Only the unsourced доходи are shown", "«Без джерела» and
      «Без категорії» take turns" and "Opened narrowed to one month's unsourced доходи" in
      `src/db/transactions-repo.test.ts` and `src/ui/transaction-search.test.ts`.
- [x] 5.2 Add «Обрати джерело» on the list's «Без джерела» rows (design D13). Prove "The same mark in
      «Транзакції»" in `src/ui/transaction-search.test.ts` beside the «Без категорії» proof.
- [x] 5.3 Shorten the search hint (design D17). Prove "The hint fits" as a length bound in
      `src/ui/transaction-search.test.ts`, and on the emulator in §12.

## 6. Коригування

- [x] 6.1 Give a коригування a description-only form and its read-out (design D15). Prove "A
      коригування reads as one" and "Its опис is corrected" in `src/ui/retype.test.ts` and
      `src/ui/entry-form.test.ts`, rename `retype.test.ts:120` to its new reason, and assert in
      `screens.test.ts` the stale sentence is gone.
- [x] 6.2 Confirm the delete with сума and рахунок. Prove "Deleting it says what goes" in
      `src/ui/retype.test.ts` (the text) and `src/db/transactions-repo.test.ts` (the balance).

## 7. Місяць, підсумок, виклики

- [x] 7.1 Make `NO_INCOME_NOTE` depend on the current month (design D17). Prove "A finished month
      without дохід does not promise one" in `src/ui/month-screen.test.ts` and keep "A month before
      its first дохід leads with витрачено" green.
- [x] 7.2 Lead each unanswered count of the підсумок to its own narrowing (design D13). Prove
      "«Без джерела» opens the unsourced доходи" (month-summary) and "Unsourced records open narrowed
      too" (month-summary-screen) in `src/ui/month-summary-screen.test.ts`, keeping "Unanswered records
      open narrowed" green, and that the чернетки count leads to Головний.
- [x] 7.3 Add `monthAccusativeYearLabel` and `monthInYearLabel` and wire them into the challenge
      (design D17); open its action on what is left. Prove "The month is named in its case", "Only
      доходи left opens them", the amended "Закрий місяць is offered ahead of the rest" and "A
      dismissal binds only its own parameters" in `src/progress/challenges.test.ts` with the real
      labels instead of the identity stub, and `src/ui/progress-screen.test.ts` for the route —
      including Головний when only чернетки are left.

## 8. Plans

- [x] 8.1 Give the зобов'язання form short-list pickers for рахунок списання and категорія, without a
      second «Без категорії» and without «Коригування» or «Комісія» — `commitmentCategoryChoices`
      drops `UNCATEGORISED_CATEGORY_ID`, `CORRECTION_CATEGORY_ID` and `FEES_CATEGORY_ID`
      (`src/domain/transaction.ts`, reserved in `src/domain/category.ts`) (design D4, D18). Prove
      "The pickers offer five and the rest behind one offer" in `src/ui/commitment-form.test.ts`,
      updating "offers every unarchived рахунок, of any currency".
- [x] 8.2 Verify the UAH and date sweep of §1 reaches the розстрочка and зобов'язання screens and
      «Платежі місяця», and the «Статок» month explanation: every amended scenario of
      `installments-screen`, `commitments-screen`, `fiscal-receipts-screen`, `month-screen` and
      net-worth-screen's "The owner sees why July fell" in this change has its test updated in the same
      file that pinned «₴». For the «Статок» розбивка the formatter is `breakdownLines` →
      `signedReadingAmount` (`src/ui/net-worth-screen.ts:188`, design D2): keep its expectation in
      `src/ui/net-worth-screen.test.ts` at «дохід +60 000,00 UAH · витрати −110 000,00 UAH ·
      коригування −6 000,00 UAH» and add a «Усе ≈ грн» case asserting every розбивка amount carries
      «≈». Verify with `npx vitest run src/ui`.

## 9. Charts

- [x] 9.1 Count forecast months for the label rule and cap labels by width (design D16). Prove "The
      forecast does not crowd the names" in `src/ui/net-worth-screen.test.ts` and keep "Up and down
      months read at a glance" and "Two years still name the months" green.
- [x] 9.2 Shorten the history scale and add the leading-edge cue (design D16). Prove the scale of
      "Seven months on a narrow phone" in `src/ui/reports-screen.test.ts`, updating "The stated scale
      follows the shown currency"; the cue in §12.

## 10. Рахунки, monobank, found in mapping

- [x] 10.1 Offer «Як у банку» under «Звірити» (design D18). Prove "The bank's balance is one tap away"
      in `src/ui/account-movements.test.ts`.
- [x] 10.2 Prove, through the editing path (`persistRetyped` and the plain save), that editing a
      транзакція's опис keeps its place among same-date ones — persistence's "Replacing a transaction
      keeps its place". If the test passes first time, record here that QA 2.19 did not reproduce;
      if it fails, fix it before ticking.
      Result: passed first time — QA 2.19 did not reproduce. `src/db/counterpart-income-repo.test.ts`
      "Scenario: Replacing a transaction keeps its place — an edited опис, through persistRetyped and
      the plain save"; no code changed.
- [x] 10.3 Store a statement's items in bank-time order (design D19), failing test first in
      `src/db/monobank-repo.test.ts`: two items of one day, the API's newest first, list newest first.
- [x] 10.4 Disable «Оновити список рахунків» without a token. Prove "Without a token there is nothing
      to refresh" in `src/ui/monobank-screen.test.ts`, replacing "«Оновити список рахунків» without a
      token says what «Синхронізувати» says".
- [x] 10.5 PLN in accounts-screen: no code change (`OFFERED_CURRENCIES` already holds it); prove the
      amended "An account can be created from the screen" by asserting `OFFERED_CURRENCIES` in
      `src/ui/labels.test.ts`.

## 11. Documents

- [x] 11.1 Update `docs/glossary.md` — «Можливий дубль» (equal описи without a bank behind them),
      «Написання» and «Назвати» (word start, transliterated service words, processor prefixes),
      «Без продавця» (payments to a person or a банка not listed), «Шаблон категоризації» (still
      matched inside words), and the «Можливий дубль | Зустрічний дохід» row (line 747), whose «the
      app never merges or deletes either» becomes: the app never merges or deletes either on its
      own; «Видалити одну» is the owner's own delete, offered beside «Не дубль» — and
      `docs/app-overview.md` §3.2, §3.3, §3.8, §3.10, §3.13, §4.2, §4.2b, §4.11a for what changed.
      Verify by reading both against the delta specs.
- [x] 11.2 Mark each QA §2 item in `docs/qa/2026-10-05-emulator-qa.md` with the task that closed it,
      or «не відтворено» with 10.2's result.

## 13. Closing

- [x] 13.1 Run `npm run verify` and paste the final lines

  ```
        Tests  5059 passed (5059)
  ✔ verify passed (74a33c8b390c960b22912c934485387984358a29)
  ```
- [x] 13.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS — first pass FAIL (2 CRITICAL: naming checked substring; copied коригування rule), fixed in 3fdb1d8; second pass PASS (0 critical, 2 minor)

## 12. Emulator (after §13 and the commit — CLAUDE.md step 6)

- [x] 12.1 Run the `smoke-runner` subagent at 100 % and 200 % text, light appearance, on the owner's
      restored data with a DB backup taken first: status bar on Головний; the no-token row; a
      переказ title at 200 %; «Обрати джерело» from the feed; «Всі категорії» without the keyboard;
      «Відкинути зміни?» on the rule form, the ціль form and the зобов'язання form; «Статок» with
      «Прогноз» on; the «Звіти» history cue; the коригування screen; «Не дубль» → «Скасувати»;
      «Закрий вересень 2026» → the narrowed list; the date control on «До дати»; the AI-аналіз month
      stepper. Also check main-screen's «The entry form opens on the рахунок last recorded on by
      hand» after a cold start, which the QA pass could not confirm, and watch «Місяць»'s first open
      for QA 2.25. Record verdicts and screenshots here.

      **Recorded 2026-10-06** (Pixel_10_Pro, light, owner's data, DB backed up first and left
      unchanged; screenshots in `.cache/android/smoke/qa-sweep-2026-10/`, not committed):
      - 100 %: PASS — status bar on Головний; the no-token row («… 9 рахунків не оновлюються з 21
        вересня»); «Обрати джерело» from the feed; the suggested «Підписки» chip and «Всі
        категорії» without the keyboard; «Відкинути зміни?» on the rule, ціль and зобов'язання
        forms (untouched forms close at once); the зобов'язання pickers (5 + «Всі … (N)», no
        «Коригування»/«Комісія», «Без категорії» once); the AI-аналіз month stepper; the
        коригування screen and its delete question; «Не дубль» → «Скасувати» (серпень 2026);
        «Закрий вересень 2026» → Транзакції narrowed to вересень and «Без джерела»; the підсумок's
        «з них коригування» and its narrowed «Без джерела» row; «Ще 5» on Місяць; the entry form on
        the last hand рахунок after a cold start; Місяць not blank after a cold start (QA 2.25 not
        seen). «До дати» is the shared date control (typed field + Вчора/Сьогодні/Календар).
      - 200 %: PASS — переказ title («platinum ·…» / «→ РЕЗЕРВ»); «Як у банку: 7,22 EUR» under
        «Звірити»; the no-token row's date; the AI-аналіз stepper; Місяць after a cold start.
      - Defects found and fixed on main, each re-checked on the emulator: the no-token row cut its
        date and the keyboard covered the quick picker's chips while searching (fa23b0e); at 200 %
        «Статок» month names touched and clipped, the «Звіти» strip cut its newest label, and the
        search hint lost «сума» (9ae1104).
      - Not run: the quick категорія picker's search on a «Без категорії» витрата after fa23b0e (no
        such витрата on the device; the same Picker was checked through «Обрати джерело»).
