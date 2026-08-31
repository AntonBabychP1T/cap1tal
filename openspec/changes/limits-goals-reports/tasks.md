# limits-goals-reports — tasks

## 1. Schema and storage

- [x] 1.1 Extend `src/db/schema.ts` with `category_limits` (category_id PK → categories,
      amount, currency — design D1) and `goals` (id PK, name, amount, currency, deadline,
      account_id → accounts — D2); run `npm run db:generate` producing migration `0006_*`
      (D3); extend `src/db/migrations.test.ts` with the persistence scenarios "A fresh
      database from migrations alone stores ліміти", "A fresh database from migrations alone
      stores цілі" and "Rows stored before the migration survive it" (rows under 0000–0005
      load unchanged, no category has a ліміт); verify `npx vitest run src/db/migrations.test.ts`
      passes and no committed migration file changed.
- [x] 1.2 Add `src/db/limits-repo.ts`: read, upsert and clear a category's ліміт, list all
      ліміти; storing for an unknown category id rejects; verify with
      `src/db/limits-repo.test.ts` covering the persistence scenarios "A stored ліміт is
      still there after a restart", "Storing again replaces, clearing removes" and "An
      unknown category id is rejected".
- [x] 1.3 Add `src/db/goals-repo.ts`: store, replace under id, remove and list цілі; storing
      with an unknown рахунок id rejects, and so does a currency differing from the linked
      рахунок's (design D2); verify with `src/db/goals-repo.test.ts` covering "A stored ціль
      round-trips", "A replaced ціль keeps its id and new values", "A removed ціль is gone
      and nothing else is", "An unknown рахунок id is rejected" and "A currency mismatching
      the рахунок is rejected".
- [x] 1.4 Add `listAll` to `src/db/transactions-repo.ts` returning every stored транзакція
      once (D5) and wire the new repos through `src/db/repos.ts`; verify with a
      `transactions-repo.test.ts` case for the persistence scenario "Every stored транзакція
      is returned once" across three months.

## 2. Domain determinations

- [x] 2.1 Create `src/domain/limits.ts`: strictly-greater `overLimit` and the
      breakdown-to-over-limit-set helper judging only the ліміт's own currency (D4); verify
      with `src/domain/limits.test.ts` covering the limits scenarios "Spending above the
      ліміт is over", "Spending equal to the ліміт is not over", "A повернення pulls the
      month back under", "Another currency's spending never counts", "Months are judged
      independently" and "No ліміт means never over".
- [x] 2.2 Create `src/domain/goals.ts`: progress from a розрахунковий баланс, `isReached`,
      `isOverdue(deadline, today)` with the clock always an argument (D4); verify with
      `src/domain/goals.test.ts` covering "Progress equal to the target reaches the ціль",
      "Progress below the target is not reached", "A past дата without the target is
      overdue" and "A reached ціль is never overdue".
- [x] 2.3 Create `src/domain/reports.ts`: derive the span (earliest month …
      max(current month, latest month), consecutively) and fold `monthly-picture` per month
      into the витрачено/дохід/інвестовано series and the one-category series (D4, D5);
      verify with `src/domain/reports.test.ts` covering the reports scenarios "A gap month
      is present at zero", "The span reaches the current month", "A future-dated транзакція
      extends the span", "An empty history yields an empty series", "A month's series
      numbers equal its monthly picture" (computed both ways on the same транзакції),
      "Currencies stay apart across the whole span", "A month of returns shows negative
      інвестовано", "A category's month equals its breakdown amount", "A month without the
      category is zero" and "Refunds can push a category's month negative".

## 3. Ліміти turn red in the screens

- [x] 3.1 Give the breakdown rows of `src/ui/month-screen.ts` an `overLimit` flag fed by
      `domain/limits.ts`, marking only the row in the ліміт's currency (D7); verify with
      `src/ui/month-screen.test.ts` covering the month-screen scenarios "An over-limit row
      is red", "Spending at the ліміт is not marked", "Another currency's amount stays
      unmarked" and "The mark follows the shown month".
- [x] 3.2 Give `src/ui/transaction-line.ts` an `overLimit` flag on category-showing lines,
      computed from per-month over-limit sets the screen derives for the distinct months in
      the loaded feed (D7), and carry the same flag through `src/ui/category-transactions.ts`
      for the Місяць drill-down; verify with `transaction-line.test.ts` (and a
      `category-transactions.test.ts` case) covering the main-screen scenarios "A витрата in
      an over-limit category is marked", "A line in an under-limit month is not marked", "A
      транзакція in another currency is judged by the ліміт's currency" and "The «Без
      категорії» highlight and the over-limit mark coexist".
- [x] 3.3 Render the marks red in `src/app/(tabs)/index.tsx`, the Місяць screen and its
      drill-down, feeding the view models the limits from `limits-repo`, and draw the Місяць
      breakdown's bars from a `share` field the view model computes (each row's amount against
      the month's largest категорія in the same currency), so the screens map over the view
      models and decide nothing themselves; verify `npm run verify` stays green and
      `src/ui/month-screen.test.ts` covers the month-screen scenarios "The largest fills its
      track and the rest read against it", "Each currency is measured against its own largest,
      never across currencies" and "A категорія a повернення pushed below zero gets no bar".

## 4. Налаштування: Ліміти and Цілі

- [x] 4.1 Create `src/ui/limits-section.ts`: every unarchived category with its ліміт or its
      absence, an archived category listed only while it carries a ліміт and visibly set
      apart, set/change/clear with the сума through `amount-input.ts` and the currency
      chosen from the same currencies a рахунок can be created in, defaulting to UAH (D8);
      verify with `src/ui/limits-section.test.ts` covering the settings scenarios "A set
      ліміт appears with its category", "A ліміт can be set in another offered currency",
      "A cleared ліміт leaves the category listed" and "An archived category with a ліміт
      stays visible", plus the limits scenarios "A set ліміт is carried by its category",
      "Setting again replaces the ліміт", "A cleared ліміт is gone", "A non-positive ліміт
      is rejected", "A reserved category may carry a ліміт" and "Archiving keeps the ліміт".
- [x] 4.2 Create `src/ui/goals-section.ts`: listing, creation, editing and deletion of цілі
      with назва/target validation (empty назва rejected, non-positive target rejected),
      linking offered from unarchived рахунки via `account-choices.ts`, the target
      (re-)entered in the linked рахунок's currency on a currency-changing re-link (D2);
      verify with `src/ui/goals-section.test.ts` covering the goals scenarios "A created
      ціль exists with its fields", "An empty назва is rejected", "A non-positive target is
      rejected", "Two цілі may share one рахунок", "An edited target persists", "Re-linking
      to another currency asks the target anew", "Deleting a ціль touches no money", "A
      transfer into the рахунок moves the progress" and "An archived рахунок still feeds its
      ціль", plus the settings scenario "An archived рахунок is not offered for a new ціль".
- [x] 4.3 Add «Ліміти» and «Цілі» to `src/ui/settings-sections.ts` and create
      `src/app/manage/limits.tsx` and `src/app/manage/goals.tsx` (deletion after
      confirmation, per the settings scenario "A deletion is confirmed first"); verify with
      `settings-sections.test.ts` that the tab offers «Категорії», «Джерела», «Правила»,
      «Ліміти», «Цілі», «Імпорт Saldo» and «monobank», and `npm run verify` is green.

## 5. The Звіти tab

- [x] 5.1 Create `src/ui/reports-screen.ts` (D6): the shown currency governing both charts
      (currencies occurring in history, opening on UAH else first alphabetically, no switch
      for one currency), the chart layout model (bar sizes normalised to the largest
      absolute value, negative months flagged, month-and-year labels via `months.ts`), the
      category chooser offering
      exactly the categories some stored транзакція carries under their current names, the
      цілі list with progress/reached/overdue from `domain/goals.ts`, and the two empty
      states; verify with `src/ui/reports-screen.test.ts` covering the reports-screen
      scenarios "The history is shown by month", "One currency at a time, UAH first", "A
      single-currency history offers no switch", "An empty history says it is empty", "The
      chooser offers the categories of the history", "The chosen category is shown by
      month", "A two-currency category follows the shown currency", "A renamed category is
      offered under its new name", "A ціль shows its
      progress", "A reached ціль is marked", "An overdue ціль is marked" and "No цілі is
      said plainly".
- [x] 5.2 Create `src/app/(tabs)/reports.tsx` rendering the layout model with plain views —
      no new dependency — and order the tabs Головний, Місяць, Рахунки, Звіти, Налаштування
      in `src/app/(tabs)/_layout.tsx`; verify `npm run verify` is green and
      `scripts/android.sh shot` shows the «Звіти» tab between Рахунки and Налаштування.

## 6. Truth and the gate

- [x] 6.1 Extend the glossary's **Goal (ціль)** entry with the states the specs name —
      reached (досягнута) and overdue (прострочена) — and the progress-is-the-рахунок's-баланс
      decision; verify every term the new specs use exists in `docs/glossary.md` verbatim.
- [x] 6.2 Run `npm run verify` on the finished tree and quote its last lines green; then run
      the `diff-reviewer` subagent and fix CRITICAL findings until it returns PASS.
      `Test Files 63 passed (63)` / `Tests 957 passed (957)` /
      `✔ verify passed (d778e448f7b5c0a89bc62593a9039b29e08308f0)`.
      diff-reviewer: FAIL on the first pass — the `share` bar on the Місяць breakdown rows was
      behaviour no requirement asked for; it is now specified in the month-screen delta with
      three scenarios and the tests carry their `Scenario:` titles. Second pass PASS,
      0 critical, 6 warnings accepted.
