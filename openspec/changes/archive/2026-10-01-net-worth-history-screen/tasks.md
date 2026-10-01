## 0. Prerequisite

- [x] 0.1 Close `net-worth-total-history` first: record its smoke-runner result (its tasks 3.1 and 4.0) and archive it; verify `openspec list` no longer shows it and `openspec validate net-worth-history-screen` passes against the synced main specs
  **Done (2026-10-01):** archived as `2026-10-01-net-worth-total-history`, its smoke recorded as not
  run (superseded by this change's 7.0). Validation then refused five MODIFIED blocks for dropping
  scenarios the synced specs still had («never the default», leading gaps, unknown-currency gaps,
  withheld changes, the widget's point list), so those five became REMOVED + ADDED under new names
  with unchanged bodies; `openspec validate` passes. `npm run verify` green.

## 1. Vision and glossary

- [x] 1.1 Amend `docs/product-vision.md`: §5/§11 Статок history enters рахунки at their дата початкового залишку and «Усе ≈ грн» is the default; §14 item 10 narrowed to allow the opt-in «Прогноз статку» on the «Статок» screen only (owner's decision 2026-10-01). Also narrow §11 "Not in v1: forecasts". Amend `docs/glossary.md`: «Історія статку», «Зміна статку», «Приблизний статок», and new «Дата початкового залишку», «Прогноз статку» (with «темп»), «Розбивка зміни статку» (with «нові рахунки» and «перекази й обмін»). Verify `npm run verify`

## 2. Opening date in storage

- [x] 2.1 Add `opening_date` to `accounts` in `src/db/schema.ts` and `openingDate?` to the domain `Account` (`src/domain/account.ts`); run `npm run db:generate`; prove "A рахунок stored before this change has no дата" in the migration test and "The дата moves no balance" in `src/domain/account.test.ts`
- [x] 2.2 Accounts repository: record the creation day on create, reject a дата after today on update; prove "A new рахунок records its creation day" and "A дата after today is rejected" in the accounts repo test
- [x] 2.3 `createAccountAndLink` records the creation day; prove "A linked рахунок keeps its creation day while older транзакції arrive" in `src/db/monobank-repo.test.ts`
- [x] 2.4 Backup: optional `openingDate` on each account (format version unchanged, schema version follows the migration); prove "The дата survives the round trip" and "An older бекап restores without dates" in `src/backup/*.test.ts`
- [x] 2.5 `account-merge-repo` keeps the earlier дата; prove "Merged рахунки keep the earlier дата" in `src/db/account-merge-repo.test.ts`

## 3. Saldo import

- [x] 3.1 `src/saldo/interpret.ts`: carry the earliest local «Initial balance» date per рахунок, moved back to the first planned or stored транзакція; include the дата and its replacement in the plan, the report and the committed write; prove "An initial balance becomes the opening balance", "Merged accounts sum their initial balances", "Mapping onto an existing рахунок proposes replacing its opening balance" and "An entry dated after the first транзакція is moved back to it" in `src/saldo/interpret.test.ts` and the commit path's test

## 4. Domain history

- [x] 4.1 Failing tests first in `src/domain/net-worth.test.ts` for "A later рахунок does not hide earlier history", "An earlier first транзакція wins over the recorded дата", "A рахунок with neither enters today", "A zero opening adds no step" and "An opening dated before any транзакція starts the history"; then implement entry dates in `valueAt` / candidate dates (design D1, D2); the remaining history scenarios stay green, updated only where this delta rewrote them («No history or one date», «Reconstructing is not an immutable audit log»)
- [x] 4.2 Point-to-point зміна with `entered` (design D4); prove "Positive comparable baseline", "Zero or negative denominator", "An entered поточна вартість does not withhold the change", "A new рахунок is not growth", "A future-dated record does not enter the change" and "No matching baseline means no change" in `src/domain/net-worth.test.ts`
- [x] 4.3 Repository reading `monthlyMovementByType` over the shared `MOVEMENTS` (design D3), extending the differential test against `computeBalance` in `src/db/net-worth-repo.test.ts`
- [x] 4.4 Monthly розбивка with the identity Σ components = Δ; prove "Flows and corrections explain the month", "An exchange moves money between currencies" and "A new рахунок is its own line" and "A history starting mid-month has no first зміна" in `src/domain/net-worth.test.ts`
- [x] 4.5 `periodSummary`; prove "A half-year summary" and "The period is longer than the history" in `src/domain/net-worth.test.ts`
- [x] 4.6 `forecast` with integer median, hinges and current-month fraction (design D5); prove "A steady pace projects a straight continuation", "The range comes from a year's spread", "A raise moves the pace within half a year", "An odd count leaves the middle out of both halves", "Too little history withholds the forecast" and "A forecast never becomes a record" in `src/domain/net-worth.test.ts`
- [x] 4.7 Investment difference per currency; prove "The investment difference is its own line" in `src/domain/net-worth.test.ts`

## 5. UI models

- [x] 5.1 `src/ui/net-worth.ts`: «≈» conversion of points, change, розбивка (rounding residual into перекази й обмін) and forecast; prove "Each date converts at the one current rate", "A currency first held later does not shorten the whole", "A рахунок entering later is a step, not a gap", "Overflow is a gap that says so" and the «≈» change scenarios in `src/ui/net-worth.test.ts`
- [x] 5.2 Default selection rule; prove "History currency has a deterministic default", "A missing rate makes UAH the default", "The combined choice is offered only when it adds something" and "The combined choice does not outlive its currencies" in `src/ui/net-worth.test.ts`
- [x] 5.3 Compact `netWorthWidgetModel` (headline, exact line, change with mark, investment line, 12-month series and labels); prove "The widget answers 'is it growing' at a glance", "Headline and history use different investment bases", "A missing rate falls back to UAH by default", "A withheld combined history says why" and "The widget is announced to TalkBack" in `src/ui/net-worth.test.ts`
- [x] 5.4 `netWorthScreenModel` (selection, period, view, selected month, розбивка rows, summary, table, forecast caption, explanation, withheld message, TalkBack labels); prove the net-worth-screen scenarios "The screen opens where the widget is", "Up and down months read at a glance", "An entry month is marked", "The owner sees why July fell", "The year at a glance", "Rows read like Saldo's months", "The current month's row is the history point", "An unrepresentable month says why", "«Зміна» offers no forecast", "A card is not «вкладено»", "The percent reads as Ukrainian", "A missing rate is named" and "A month is read aloud" in `src/ui/net-worth-screen.test.ts`
- [x] 5.5 Chart geometry `barGeometry`, `monthTickLabels` and `forecastGeometry` (design D7); prove "Two years still name the months" and "Negative and flat history" in `src/ui/dashboard-charts.test.ts`

## 6. Screens

- [x] 6.1 Shared in-memory selection store `src/hooks/net-worth-selection.ts`; rewrite `src/components/net-worth-widget.tsx` as the compact widget opening the route; verify `npm run typecheck` and "Choices survive the round trip" through the store's test
- [x] 6.2 New route `src/app/net-worth.tsx` with the chips, the period, the views, the month card, the summary, the table, the «Прогноз» switch (off on open) and «Пояснення»; verify `npm run typecheck`
- [x] 6.3 Account form «станом на» in `src/ui/account-form.ts` and its screen; prove "The owner dates an old balance", "A future date is explained in the form" and "A zero opening asks for no date" in `src/ui/account-form.test.ts`

  **Notes (2026-10-01):** the selection store lives in `src/hooks/net-worth-selection.ts` with
  relative imports so Vitest can load it; the screen's chart is `src/components/net-worth-chart.tsx`.
  Two source-inspection tests that encoded the old widget were updated, not weakened:
  `home-data.test.ts` now asserts the history choice goes through the in-memory store from the
  screen (Головний has no selector), and `motion-usage.test.ts` still finds one `ChangingFigure`
  per currency in the widget's exact line. "Tapping opens the screen" and "Offline graphs need no
  request" have source-inspection tests in `src/ui/net-worth-screen.test.ts` and stay in 7.0's
  emulator run; "A large history scrolls smoothly" is a device measurement with no Node test (as
  before this change) and is left to the emulator.

## 7. Close

- [ ] 7.0 After 7.2 and the commit, run the smoke-runner on the emulator over "The widget answers 'is it growing' at a glance", "Tapping opens the screen", "Up and down months read at a glance", "The owner asks where the trend leads", "The forecast does not persist", "The owner dates an old balance", "Offline graphs need no request" and "Data changes invalidate derived readings" at 360 × 640 dp and 200 % text, and record the result in the change before archive
- [x] 7.1 Run `npm run verify` and paste the final lines
  ```
        Tests  4310 passed (4310)
     Duration  8.79s (transform 5.48s, setup 0ms, import 24.64s, tests 25.62s, environment 9ms)
  ✔ verify passed (918c761cbba3ac7fbe71042b1338d1abb6846c31)
  ```
- [x] 7.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
  **Result (2026-10-01):** first pass FAIL (2 critical: future-dated records no longer disclosed;
  a one-month history read a «Зміна за період» of 0 — 2 important: dead `netWorthChange` carrying
  the change scenarios; spec date format). All fixed with tests; re-review **PASS** (one minor
  left: a table row older than the 120 plotted months highlights no bar — unreachable today).
