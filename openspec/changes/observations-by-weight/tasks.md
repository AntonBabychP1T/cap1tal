## 1. Order by money weight (observations: "Спостереження are listed in one fixed order")

- [ ] 1.1 Add `src/observations/order.test.ts` with plain `Observation` values and failing tests
      named after the scenarios "The largest difference leads whatever its kind", "Below typical
      weighs as much as above", "A категорія with no витрата weighs its whole типова сума" and
      "Equal weight falls back to the kind order", using the delta's exact minor-unit numbers;
      verify with `npx vitest run src/observations/order.test.ts` that they fail on the current
      kind-first order.
- [ ] 1.2 Change the comparator in `src/observations/order.ts` per design D1–D4 (дубль first;
      currency; weight = the existing per-kind size; kind rank without the дубль as tie-break;
      existing text/id tie-breaks); verify `npx vitest run src/observations/order.test.ts` passes.
- [ ] 1.3 Restate "Scenario: A дубль leads" in `src/observations/observations.test.ts` to the
      delta's numbers (дубль 12500, Кафе 420000 vs 390000, Netflix 34900 vs 29900) and expect дубль,
      Кафе, Netflix; restate "Scenario: Currencies do not mix in the order" to USD 9900 vs 5000 and
      UAH 31900 vs 29900, expecting UAH first; verify `npx vitest run src/observations` passes with
      no other expectation edited.

## 2. Місяць and the capped lists (month-screen: "Місяць states the shown month's спостереження")

- [ ] 2.1 Add "Scenario: October's спостереження on Місяць" to `src/ui/month-screen.test.ts`
      (Netflix 34900 vs 29900, Кафе 420000 vs 390000, today 2026-10-10) expecting Кафе first; and
      tighten "Scenario: Ten facts are five and «Ще 5»" to assert the five shown are the five
      largest |A − T| (c9…c5); verify `npx vitest run src/ui/month-screen.test.ts` passes.
- [ ] 2.2 Correct the fixture of "Scenario: Three of five" in `src/ui/observations.test.ts`: the
      widget only slices, and `EVERY_KIND` is listed in the old kind order, so build the widget's
      input through the observations order (`inOrder`) and expect `['d', 'v', 'm']` (дубль, then
      Продукти 380000, then Сільпо 224000; Кафе 30000 and Netflix 5000 fall behind «Усі (5)»). This
      is a fixture correction, not a scenario change. Then run `npx vitest run
      src/ui/observations.test.ts src/ui/month-summary-screen.test.ts` and confirm "«Не дубль» on
      Головний", "The спостереження are the month's" and "More than five спостереження fold under
      «Ще N»" pass unchanged; any other failure means a scenario outside this delta changed and is
      raised, not edited.

## 3. Thresholds on the owner's history (design D5)

- [ ] 3.1 Measurement only — traces to no requirement, changes no source file and no threshold.
      With a throwaway script in the session scratchpad (not committed, not part of `verify`),
      restore the owner's latest бекап (`~/Downloads/cap1tal-2026-09-23.json` or a fresher one the
      owner names) into an in-memory database with the real migrations, and compute today's
      спостереження of every завершений активний місяць and the current month through the
      observations entry point. Then post-filter them with the сум each states, without editing
      `src/observations/thresholds.ts`: band 35 % keeps a vs-типова fact only when |A − T| ≥ 35 % of
      T; поріг 5 % keeps a fact of a kind that uses the поріг only when its money weight ≥ 5 % of
      that currency's типова сума of витрачено, read from the window module's baseline for that
      month and currency (the same baseline the detectors use). Record in design.md "Measurement" a
      counts-only table per month and kind: today, band 35 %, поріг 5 % — no описи, no сум. Done
      when the table is in design.md and Open question 3 cites it.

## 4. On the emulator

- [ ] 4.1 Run the smoke-runner subagent on "October's спостереження on Місяць" and the Головний
      widget with the owner-like data set: the heaviest UAH fact leads after any дубль, and «Усі
      (N)» / «Ще N» counts are unchanged; record the verdict in this task.

## 5. Gate

- [ ] 5.1 Run `npm run verify` and paste the final lines
- [ ] 5.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
