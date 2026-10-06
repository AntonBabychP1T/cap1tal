## 1. Vision and glossary

- [x] 1.1 Add `docs/product-vision.md` §19 «Спостереження і підсумок місяця», as design D10 lays it out:
  - «Owner's decision, 2026-10-02» for the two units;
  - **[PROPOSED]** for the thresholds, the widget's default place, «Не дубль» as the only answer, and the seven-day row;
  - explicit lines that no спостереження projects (§14.10 stands), none notifies (§13 stands), and none leaves the phone.

  Add one **[PROPOSED]** line to §15: the підсумок reports the частка коригувань — the sum of the коригування's absolute сум against витрачено — against this measure every month. Add a pointer from §3 to §19. Verify `npm run verify`
- [x] 1.2 Add to `docs/glossary.md`:
  - terms: спостереження, типова сума, поріг помітності, можливий дубль (with «Не дубль»), підсумок місяця, частка коригувань (the sum of absolute сум, **[PROPOSED]**);
  - типова сума covering both a категорія's and the whole витрачено;
  - distinction rows: спостереження vs AI-аналіз, спостереження vs досягнення, типова сума vs місячна норма витрат (six months and confirmation vs three and none), типова сума vs типова категорія, можливий дубль vs підказка про дубль, можливий дубль vs зустрічний дохід, підсумок місяця vs місячна картина, типова сума vs the тренди's typical amount of a recurring candidate;
  - the «Backup» entry names the «Не дубль» answers.

  Verify `npm run verify`

## 2. «Не дубль» in storage and the бекап

- [x] 2.1 Add the `duplicate_answers` table to `src/db/schema.ts` (design D5: two cascading references, `answered_at`, PRIMARY KEY, CHECK `first_id < second_id`). Run `npm run db:generate` under the next free number. Prove "An upgraded device keeps everything and has no answers" in `src/db/migrations.test.ts`
- [x] 2.2 Add `src/db/duplicate-answers-repo.ts` (`answer`, `answered`, `list`; sorts the pair) and export it from `src/db/repos.ts`. Prove "An answer round-trips", "Answering twice keeps one answer", "Editing keeps the answer" and "Deleting takes the answer with it" in `src/db/duplicate-answers-repo.test.ts`
- [x] 2.3 Update the snapshot, restore and бекап:
  - snapshot/restore in `src/db/backup-repo.ts`, after `transactions`;
  - `'duplicate_answers'` in `BACKUP_TABLES` with its comment;
  - optional `duplicateAnswers` section in `src/backup/format.ts`, refusing a dangling id, a self-pair and a repeated pair, and sorting an unsorted one (design D5);
  - `BACKUP_SCHEMA_VERSION` up by one, so its tripwire in `src/backup/format.test.ts` passes.

  Prove "The snapshot carries the answers" and "Replacing replaces the answers" in `src/db/backup-repo.test.ts`. Prove the storage halves of "The answers survive the round trip" (both answers back with pairs and moments), "A бекап written before the answers existed restores with none" (accepted, no answer stored), "An answer naming an absent транзакція is refused whole", "An answer pairing a транзакція with itself, or one pair twice, is refused whole", "Either order restores the same answer" and "No спостереження is in the file" in `src/backup/format.test.ts` and `src/db/backup-repo.test.ts`. Their detector halves ("neither pair is stated", "stated again") are proven in 4.7

## 3. The window, typical сума and поріг

- [x] 3.1 Add `src/observations/thresholds.ts` (every constant of design D3, each with its reason) and `src/observations/window.ts` (`finishedActiveMonths`, `windowOf`, `typicalOf`, `typicalSpentOf`, `noticeableOf`). Prove "Six finished months make the window", "A month without the категорія counts as zero", "A повернення lowers the month it lands in", "Two finished months are not enough" and "The поріг is three per cent of the typical month" in `src/observations/window.test.ts`, plus the design D2 parity test against `completedMonthsIn`

## 4. Detectors

- [x] 4.1 Add `src/observations/vs-typical.ts`. Prove "Groceries well above typical", "A категорія well below typical", "A категорія absent this month is stated as all of it less", "A large percentage of a small сума is not noticeable", "A сума inside the band is not stated" and "Коригування are never the subject" in `src/observations/vs-typical.test.ts`
- [x] 4.2 Add `src/observations/early.ts`. Prove "Ten days of cafés already exceed September", "No projection is stated" (the result carries no end-of-month сума) and "A finished month is not judged this way" in `src/observations/early.test.ts`
- [x] 4.3 Add `src/observations/run.ts`. Prove "Cafés grow for the third month running", "Above-typical takes precedence over the run" and "A flat month breaks the run" in `src/observations/run.test.ts`
- [x] 4.4 Add `src/observations/price-change.ts`, reusing `foldMerchant`, `largestPerMonthByKey` and `medianOf`. Prove "Netflix got dearer", "A rate wobble inside the band is not a price change", "An unrelated purchase at the same продавець is not a price change" and "No charge yet this month says nothing" in `src/observations/price-change.test.ts`
- [x] 4.5 Add `src/observations/merchant-outlier.ts`. Prove "A purchase four times the usual", "Two earlier purchases are not a usual" and "A large ratio of a small сума is not noticeable" in `src/observations/merchant-outlier.test.ts`
- [x] 4.6 Add `src/observations/duplicates.ts`. Prove "A транзакція recorded by hand and a bank record of the same coffee", "A pair across two months is asked in both", "Two identical bank records are two purchases", "Two days apart is not a дубль", "Different рахунки are not a дубль", "A переказ is never a дубль", "Two equal комісії of two перекази are not a дубль", "Two bank records at two продавці are asked, not guessed" and "A third identical витрата is asked anew" in `src/observations/duplicates.test.ts`
- [x] 4.7 Add `src/observations/order.ts` and `src/observations/observations.ts` (`observationsOf`: current-month vs finished-month detectors, the answers filter, and `merchantKeyOf` as a parameter per design D11). Prove "The same state yields the same спостереження", "A month with no транзакція has none", "A дубль leads", "Currencies do not mix in the order", "Answered once, gone everywhere" (the domain half: an answered pair is in no list), "A fact cannot be hidden", and the detector halves of the бекап scenarios of 2.3 in `src/observations/observations.test.ts`. Prove "Deleting the дубль ends the question" over the repo of 2.2 (the cascade leaves no answer and the detector no pair) in `src/db/duplicate-answers-repo.test.ts`, so nothing under `src/observations/` imports `src/db/` (5.2)

## 5. How an спостереження is stated

- [x] 5.1 Add `src/ui/observations.ts`: sentence and routes per design D4, with a genitive month form in `src/ui/months.ts` if it is missing. Prove "A категорія leads to its month", "A дубль opens either транзакція", "Two currencies are two sentences", the banned-words check over every kind (requirement "An спостереження states itself in one sentence…"), and the ratio plurals («4,2 раза», «3 рази», «5 разів») in `src/ui/observations.test.ts`
- [x] 5.2 Add the privacy and quietness guards. Prove "The пакет does not carry them", "Nothing is posted" and "Showing changes nothing" in `src/observations/privacy.test.ts`:
  - `src/analysis/`, `src/backup/` and `src/reporting/` import nothing from `src/observations/`;
  - `src/observations/` and `src/ui/observations.ts` import no platform, notification or db module;
  - `observationsOf` over a fixture leaves its inputs deep-equal.

## 6. The підсумок місяця

- [x] 6.1 Add `compositionBalanceChange` in `src/domain/goals.ts` (design D7). Prove "A cushion grew in September" and "A ціль that did not move" in `src/domain/goals.test.ts`
- [x] 6.2 Add `src/month-summary/summary.ts`, covering which months have a підсумок, витрачено against the previous and typical month, and the категорії that changed most. Prove "September has a підсумок in October", "A month of перекази alone still has one", "An empty month has none", "Reading it twice changes nothing", "September against August and the median of six", "Too little history for a типова сума", "A переказ into a банка is not витрачено", "The three largest changes", "A повернення is part of its категорія's change", "A new категорія is marked new" and "An empty August leaves nothing to compare with" in `src/month-summary/summary.test.ts`
- [x] 6.3 Add the картина and the статок to the summary (design D6). Prove "The картина equals Місяць" (against the Місяць model built from the same fixture), "A repayment above the principal is дохід only for the відсотки", "A positive коригування is дохід", "Дохід against August", "The зміна equals Статок's" (against the Статок screen model from the same fixture), "The first month of the history" and "An інвестиційний рахунок counts its вкладено" in `src/month-summary/summary.test.ts`
- [x] 6.4 Add цілі and ліміти, the unanswered records, the коригування and the спостереження to the summary. Prove "A ліміт exceeded is stated with its overrun", "A ліміт kept is stated as kept", "Three uncategorised and one unsourced", "A clean month is called clean", "Corrections of both signs count by size", "A частка of two per cent is marked", "No витрачено, no частка", "Just under the measure is not rounded up to it" and "The спостереження are the month's" in `src/month-summary/summary.test.ts`

## 7. Screens

- [x] 7.1 Add the registry entry `observations` («Спостереження», visible, third) to both `DASHBOARD_WIDGET_IDS` and `DASHBOARD_WIDGETS` in `src/dashboard/layout.ts` (updating the comments that count five widgets and the first four), and `needsObservations` in `src/ui/home-dashboard.ts`.
  - In `src/dashboard/layout.test.ts` and `src/ui/dashboard-layout-editor.test.ts`, prove "Every known widget is listed once", "Repeated editing cannot create a duplicate", "Fresh install uses the five-widget default", "Progress is available without taking priority by default" and "A customised dashboard meets «Спостереження» hidden at its end".
  - Rename the existing "Fresh install uses the four-widget default" tests to the five-widget scenario and update their expectations in `src/dashboard/layout.test.ts`, `src/db/dashboard-layout-repo.test.ts` and `src/db/migrations.test.ts`. Prove "Reset restores the current default" with five visible widgets in `src/db/dashboard-layout-repo.test.ts`.
  - In `src/ui/home-dashboard.test.ts`, prove the default order of "The first screen is entry plus the feed" and "A hidden widget shows nothing" (no observation read).
- [x] 7.2 Add the Головний widget model (first three, «Усі (N)», empty sentence, the seven-day «Підсумок» row) in `src/ui/observations.ts`. Prove "Three of five", "Nothing notable yet", "September's підсумок in the first week of October", "The підсумок row leaves after the seventh day" and "«Не дубль» on Головний" (the list re-derived after an answer) in `src/ui/observations.test.ts`. Add `src/components/observations-list.tsx` and `src/components/observations-widget.tsx`, and wire them in `src/app/(tabs)/index.tsx` through the stamp memo. Verify `npm run typecheck`

  *Note at apply:* `src/ui/home-screen.test.ts` ("Confirming the last чернетка into «Без категорії» hands off between both alerts") sliced `settleDraft`'s body up to `[reload, reportBug]`, a dependency list the callback no longer has; `indexOf` answered −1 and the «body» ran to the end of the file, so the widget's own `reload()` failed it. The anchor is now `settleDraft`'s real `[reload],` and the test asserts the anchor is found — stricter, not weaker.
- [x] 7.3 Add `summaryOffer` and `observations` to Місяць in `src/ui/month-screen.ts`, rendered in `src/app/(tabs)/month.tsx` (offer under the header, block after the breakdown). Prove "September offers its підсумок", "The current month offers none", "An empty month offers none", "October's спостереження on Місяць", "Stepping back shows the past month's own" and "A quiet month says so" in `src/ui/month-screen.test.ts`
- [x] 7.4 Add `summaryOffer` to Звіти's spelled-out readout in `src/ui/reports-screen.ts`, rendered in `src/app/(tabs)/reports.tsx`. Prove "The newest finished month offers its підсумок", "Picking an older month offers that month's" and "The current month offers none" in `src/ui/reports-screen.test.ts`
- [x] 7.5 Add `initialChoices(today, given?)` beside `defaultChoices(today)` in `src/ui/ai-analysis-screen.ts` and read `?month=` in `src/app/ai-analysis.tsx`. Prove "The defaults are the least that leaves the phone", "Opened for one month" and "A malformed given month falls back to the default period" in `src/ui/ai-analysis-screen.test.ts`
- [x] 7.6 Add `src/ui/month-summary-screen.ts`: `monthSummaryRoute` with the four refusals, the section order and every target. Prove the title «Підсумок вересня 2026», "The current month is not finished", "A month with nothing in it", "A month that has not come yet", "Not a month at all", "A plain September", "Two currencies stay apart", "A changed категорія opens its month", "Unanswered records open narrowed" and "September goes to AI-аналіз as one month" (the route carries `?month=2026-09` and builds no пакет) in `src/ui/month-summary-screen.test.ts`
- [x] 7.7 Add the route `src/app/month-summary/[month].tsx`, pushed from the root stack, reloading on focus, with «Не дубль» in place and TalkBack labels on every row. Verify `npm run typecheck`. The return-after-categorising, in-place answer and back-navigation scenarios are left to 9.0

## 8. Docs after the code

- [x] 8.1 Update `docs/app-overview.md`: §3.2 (the widget), §3.3 (offer and block), §3.5 (offer), §4.10 (six widgets), a new §3.13 «Підсумок місяця», and the §6 status row. Verify `npm run verify`

## 9. Close

- [ ] 9.0 After 9.2 and the commit, run the smoke-runner on the emulator at 360 × 640 dp and 200 % text, and record the result in the change before archive. Scenarios:
  - "Three of five";
  - "September's підсумок in the first week of October";
  - "«Не дубль» on Головний";
  - "October's спостереження on Місяць";
  - "September offers its підсумок";
  - "A plain September";
  - "A categorisation made from the підсумок is reflected on return";
  - "«Не дубль» is answered in place";
  - "Opened from Місяць, back to Місяць";
  - "September goes to AI-аналіз as one month";
  - "Leaving without sharing hands nothing over";
  - "A customised dashboard meets «Спостереження» hidden at its end";
  - "A large history scrolls smoothly".

  Where the owner's own бекап is available locally, also restore it and note what each detector said, as input for the thresholds (design, Risks)
  **Not run** — archived at the owner's request on 2026-10-06 without this step; the qa-sweep-2026-10 emulator sweep (task 12.1) is the latest on-device evidence.
- [x] 9.1 Run `npm run verify` and paste the final lines

  ```
        Tests  4571 passed (4571)
  ✔ verify passed (572cb630c4658a432449a3a993a04512c3f8962f)
  ```
- [x] 9.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS

  PASS: 0 critical, 2 major, 6 minor — all fixed before 9.1 (a категорія absent this month now carries its −100 %; one `byCurrency`, one `daysBetween`, one `monthBefore`/`monthAfter`; each сума of a run with its currency; a test that the підсумок judges a ліміт as Місяць marks it; `calendarLabel`'s doc back on it; the anchor note under 7.2).
