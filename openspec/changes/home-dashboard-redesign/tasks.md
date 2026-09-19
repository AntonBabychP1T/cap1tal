## 1. Approval and contract alignment

All boxes describe future implementation work and remain unchecked in this proposal-only change. Each task is intended to fit within about two hours; split further before apply if a discovered dependency makes it larger. Requirement names below refer to this change's delta files. No implementation starts before the owner's requested agreement.

- [x] 1.1 Confirm the agreed product decision and net-worth basis; reconcile/archive the predecessor through its own workflow, then rebase delta operations exactly as design Migration Plan §3 describes. Trace: main-screen «Головний presents the daily dashboard», «The primary month amount…», removed money-held requirement. Validate strict after the rebase; do not let a later predecessor archive restore superseded requirements.

      **Result:** Owner confirmed the product decision. `home-daily-overview` smoke-tested clean
      (task 6.1 PASS, no defects) and archived to
      `openspec/changes/archive/2026-09-19-home-daily-overview/` (commit `be70176`), synced into
      `main-screen` and `bank-notifications-screen`. Rebased this change's `main-screen` delta per
      Migration Plan §3: dropped the MODIFIED "Opening the app shows quick entry…" (heading no
      longer published) and re-added its content as ADDED "Головний presents the daily dashboard";
      re-targeted the scroll requirement onto its published replacement "Opening Головний again
      shows it from the month's status" (and fixed a stale "entry form" scenario title left over
      from the old heading); dropped the now-redundant REMOVED "Головний opens with how much money
      there is"; added REMOVED entries for the three headings home-daily-overview just published
      that this change supersedes ("Головний leads with the month's залишилось", "The money held is
      a secondary line that leads to Рахунки", "«Потребує уваги» appears only when something is
      waiting"); kept "Головний leads to «Прогрес»…" REMOVED unchanged (untouched by the
      predecessor). `openspec validate home-dashboard-redesign --strict` and `npm run verify` both
      pass (3522 tests, `1fb1d055afd8a72b0ad3b002d7f9880356beae25`).
- [x] 1.2 Run the spec-reviewer subagent on the rebased change and resolve CRITICAL findings before apply. Trace: all three capability contracts; record review outcome.

      **Result:** First pass returned NOT READY with 3 CRITICAL findings, all confirmed real and
      fixed: (1) the rebase had silently dropped the published scenario "Scrolling within Головний
      is untouched" from the retargeted scroll requirement, replacing it with a same-titled-looking
      but different sync-refresh scenario — restored the dropped scenario verbatim and kept the
      refresh one under its own distinct title "A sync refresh does not reset scrolling"; (2) the
      untouched `bank-notifications-screen` requirement "Pending чернетки are visible on Головний"
      contradicted this change's collapsed-by-default draft row and its reference to the removed
      «Потребує уваги» section — added a `bank-notifications-screen` delta (MODIFIED that
      requirement) reconciling it with the collapsed/expand model, and added the capability to
      proposal.md's Modified Capabilities; (3) the untouched "Everything stored is reachable from
      Головний" duplicated the new ADDED "The feed shows the latest five legible records" — REMOVED
      it with Reason/Migration pointing at the replacement. Also fixed stale "Trace:" text in tasks
      1.1/4.2/4.4 and added the challenges spec to task 6.2's Purpose-sync list (reviewer WARNINGs).
      Re-validated with both the pinned `node_modules/.bin/openspec` (what `npm run verify` uses)
      and the newer global `openspec` v1.12.0 the reviewer flagged as catching a stricter
      MODIFIED-completeness check — the global CLI caught one more instance of the same class of
      bug (a scenario rename in the new `bank-notifications-screen` delta that the pinned CLI let
      through silently); renamed it back to the published scenario's exact title. Both CLIs now
      pass strict. `npm run verify`:
      ```
      Totals: 56 passed, 0 failed (56 items)
      Test Files  173 passed (173)
           Tests  3522 passed (3522)
      ✔ verify passed (7c5b71933a13071162ab9c74502f1cef7fef82d8)
      ```

## 2. Existing account semantics and historical reads

- [x] 2.1 Factor a shared pure transaction-effect primitive from computeBalance without changing behavior. Trace: net-worth «History is reconstructed…». Tests: `src/domain/account.test.ts` — expenses/refunds/signed corrections, transfer legs and accepted/declined fee effects remain identical.

      **Result:** Added `transactionEffect(accountId, transaction)` to `src/domain/account.ts`,
      returning the signed per-account effect of one transaction or `undefined` when it doesn't
      touch that account; `computeBalance` now folds over it instead of its own switch, with no
      behaviour change (same `add`/`subtract` currency guards apply since `transactionEffect`
      always returns an amount in the queried account's own currency). 5 new tests in
      `account.test.ts` cover expense/income/refund/correction/transfer-leg effects and confirm
      accepted vs. declined fee proposals still move the source account by the identical total.
      `npm run verify`: 3527 tests passed, `85d5407537520f2765a541554b8df03e52000911`.
- [x] 2.2 Add bounded local account/month movement and first-date reads with as-of cutoff, a bounded first-date end-of-day aggregate and future-record flag. Trace: net-worth «Undated opening money…», «History spans…»; main-screen «The dashboard uses local data…». Tests: `src/db/net-worth-repo.test.ts` — zero/nonzero openings, June 5 initial point excludes a later June 20 movement in the same month, future rows excluded from historical aggregates, all accounts/archived included, multiple currencies and no-transaction accounts retained.

      **Result:** Added `src/db/net-worth-repo.ts`: a shared `MOVEMENTS` SQL fragment (the
      `transactionEffect` rule restated in SQL, one row per transaction-account touch) reused by
      four bounded readings — `monthlyMovement`, `firstDates`, `firstDateMovement` (the sub-month
      cutoff for the first history point) and `accountsWithFutureRecords`. All four key by
      accountId only and stay silent about currency/archived-status/opening-balance/membership —
      those live on the `Account` the caller already has; a no-transaction account is simply
      absent, which the domain layer (2.4/2.5) is what retains. 7 tests in
      `net-worth-repo.test.ts` cover the June 5/20 sub-month cutoff, future-row exclusion and
      flagging, archived-account participation, cross-currency transfer legs, empty-month gaps and
      the no-transaction-account contract. `npm run verify`: 3534 tests passed,
      `f752058f373e317741d5d4e6c0235cba4ac40f99`.
- [x] 2.3 Differentially verify aggregate outputs against existing account calculations, including transfer fees and currencies. Trace: net-worth «History is reconstructed…». Tests: `src/db/net-worth-repo.test.ts` — generated histories agree with computeBalance per account/date; results grow by accounts/months rather than raw record count on 50k records.

      **Result:** Added a scale test generating ~58000 transactions across 30 accounts (mixed
      UAH/USD/EUR) and 120 months — expenses, income, corrections, and same-currency transfers
      with a shortfall pattern exercising fee-like splits — wrapped in one `{ behavior: 'immediate'
      }` transaction for speed (~6s to insert and verify). For every account, both the reading
      reconstructed from `monthlyMovement`/`firstDateMovement` (opening + repo aggregate) and
      `computeBalance` over the same account's transactions (bounded to `date <= today`, matching
      what the repo itself excludes) are asserted equal — at "today" and at the account's own
      first date. Also asserts `monthlyMovement(...).length <= accounts × months`, an order of
      magnitude below the record count, proving the O(accounts × months) growth design D5 asks
      for. One bug caught and fixed in the test itself (not the repo): the unfiltered comparison
      set included a handful of records dated after "today" within its own month, which the repo
      correctly excludes as future-dated — filtering the comparison set the same way fixed it.
      `npm run verify`: 3535 tests passed in ~29s total, `d1c1242bd3a11d31ad9933c0c93df07cf352a31e`.
- [x] 2.4 Implement pure current per-currency net-worth contributions and availability. Trace: net-worth «Статок is a reading…», «Archived and debt…», «Current valuation…». Tests: `src/domain/net-worth.test.ts` — replace value rather than add, zero vs missing value, archived money, signed debt, principal/interest, empty/incomplete/overflow states.

      **Result:** Added `src/domain/net-worth.ts` with `currentNetWorth({ accounts, transactions,
      currentValues })`, reusing `goals.ts`'s existing `contribution()` (investment current value
      replaces, never adds to, вкладено) rather than reimplementing it. Returns `{ status: 'empty'
      }` for zero accounts, else per-account `AccountContribution` (currency, amount, basis
      `ledger`/`currentValue`, `asOf` date) plus per-currency `CurrencyTotal` — `known` or
      `unavailable: { reason: 'overflow' }` when a sum would exceed a safe integer (caught from
      `money()`'s own guard rather than thrown). Includes archived and debt accounts unfiltered,
      by construction (no `activeAccounts` filtering). 11 tests cover empty/multi-currency/replace
      vs fallback/zero-vs-missing-observation/archived/signed-debt/principal-interest/overflow.
      `npm run verify`: 3546 tests passed, `3b2178c95cc1833be07d67991835ab4e3f20b016`.
- [x] 2.5 Build the dated history with coverage gaps and recorded-balance basis. Trace: net-worth «History is reconstructed…», «Undated opening money…», «History spans…». Tests: `src/domain/net-worth.test.ts` — late nonzero opening, no anchor, zero opening, empty months, first day/month ends/today, one date, future records, changed openings/backdated edits and valuation changes leaving past points untouched.

      **Result:** Added `netWorthHistory({ accounts, today })` to `src/domain/net-worth.ts`,
      taking plain `AccountHistoryInput` (firstDate/firstDateNet/monthlyNet — the shape
      `net-worth-repo.ts` produces) so the domain stays pure. Candidate dates: the global earliest
      firstDate across all accounts, each month-end through the month before today's, and today
      (small local month arithmetic, matching `reports.ts`'s "the domain never imports
      `src/ui/months.ts`" precedent). Per account per point: a nonzero opening is unknown before
      its own firstDate (or forever without one), a zero opening is always known; the one
      non-month-end candidate (the global first date) uses the sub-month-precise firstDateNet,
      every other candidate is a whole month-end so cumulative monthly sums are exact. A
      currency's point is a known total only when every account of that currency is known there,
      else a `gap`. No `currentValues` parameter exists at all, so an investment's поточна
      вартість cannot reach history by construction. 10 new tests (21 total in the file) cover the
      June 5/30 sub-month cutoff, a later nonzero opening blocking earlier totals, no-anchor
      accounts staying unknown forever, zero-opening pre-movement zeros, empty months carrying
      the previous balance, the single-point case, future-date bounding, backdated-edit
      recomputation leaving earlier points untouched, and history's total independence from any
      current valuation. `npm run verify`: 3556 tests passed, `e0f2bcb07fdd6f5461aa314ee97093bf0b0aa70d`.
- [x] 2.6 Add comparable previous-month-end changes. Trace: net-worth «Change requires…». Tests: `src/domain/net-worth.test.ts` — +20%, zero/negative baseline absolute-only, missing previous month-end, valuation substitution and future records suppress comparison, unrelated currency remains comparable.

      **Result:** Added `netWorthChange` to `src/domain/net-worth.ts`: takes the current
      `CurrencyTotal`, whether that currency's current reading used an investment valuation
      substitution, whether it has future-dated records, and an optional previous-month-end point
      (all pre-resolved by the caller — this function itself does no lookup, keeping it a small
      pure decision). Suppresses with an explicit `reason` (`no-baseline` / `valuation-substituted`
      / `future-records`) rather than ever silently falling back to an older period; percent is
      computed only for a strictly positive baseline, one decimal via integer-scaled rounding. 7
      new tests (28 total in the file) cover +20%, zero/negative-baseline absolute-only, a missing
      baseline, a gap baseline, valuation substitution, future records, and that each currency is
      judged independently. `npm run verify`: 3563 tests passed, `af603f1878995850a68e6b6b9bf644dbf8d7f5c7`.
- [x] 2.7 Add per-currency current readout, approximate UAH and basis explanations using existing conversion rules. Trace: net-worth «Approximate UAH…», «Current valuation…». Tests: `src/ui/net-worth.test.ts` — rounding example, signed conversion, missing EUR including zero total, stale cached rate date, UAH-only, overflow, investment dates/fallbacks, difference from Accounts totals.

      **Result:** Added `src/ui/net-worth.ts`: `currencyReadouts` (exact per-currency lines,
      UAH-first, an unavailable one named rather than hidden), `approximateNetWorthUah` (reuses
      the existing `approximateUah` rounding rule directly — richer than `approximateTotals` since
      it also names which currency is missing a rate and surfaces the oldest participating rate's
      own `obtainedAt`, both of which the widget's explanation needs and the Accounts-screen
      helper never exposed), `accountBasisLines` (per-account explanation text, reusing
      `calendarLabel` for an investment's observation date) and a static
      `ACCOUNTS_TOTAL_DIFFERENCE_EXPLANATION` sentence. 10 tests cover the rounding example, signed
      conversion, EUR-missing-including-zero-total, stale-rate timestamp disclosure, UAH-only,
      overflow, investment date vs. вкладено fallback, and the Accounts-difference wording. Section
      2 (net-worth domain + repo) is now complete. `npm run verify`: 3573 tests passed,
      `323b6d15b2980dc888e41f4a0db999ca60edb974`.

## 3. Month and top categories

- [x] 3.1 Update Home month model to lead with spent while preserving monthly-picture arithmetic. Trace: main-screen «The primary month amount…». Tests: `src/ui/home-screen.test.ts` — income does not change the primary metric, mixed currencies, negative spent, empty/income-only/transfer-only states; retain monthly-picture identity/property tests.

      **Result:** `HomeMonthStatus` now carries `title`/`spent`/`emptyMessage` only — dropped
      `left`, `spentLabel` and `note` (the "no дохід yet" reason was specific to a залишилось-led
      card and doesn't apply to spent). Added a home-specific `monthEmptyMessage` with the new
      wording («Цього місяця ще немає транзакцій» / «Цього місяця лише перекази»), deliberately
      not sharing `month-screen.ts`'s `emptyMessageFor` — same branching, different words, since
      this isn't a redesign of Місяць. Patched `index.tsx`'s month card to render `status.spent`
      as the single primary figure (the fuller header/feed/alerts assembly is task 4.4's). Rewrote
      the month-status describe block in `home-screen.test.ts` for the new scenarios and fixed two
      incidental `status.left` assertions in the money-held tests. `monthlyPicture` itself is
      untouched, so its identity/property tests (in `monthly-picture.test.ts`) still hold.
      `npm run verify`: 3572 tests passed, `466e376a8fa84d45cbd0276870927d2e74a90d58`.
- [x] 3.2 Add category presentation model from categoryBreakdown with stable top-five/remainder ranking. Trace: main-screen «Top categories…», «Category currencies never mix», «Signed or empty breakdowns…». Tests: `src/ui/home-categories.test.ts` — five plus remainder sums to spent, tied names/ids, reserved/archived/zero categories, refund-negative neutral state, default and disappearing currency selection.

      **Result:** Added `src/ui/home-categories.ts`: `categoryPresentation` reads the same
      `categoryBreakdown` the month card's numbers come from, ranks by signed amount descending
      then `byName` (Ukrainian name, then id — the existing tie-break), and splits into up to five
      `rows` plus a `remainder` (count/label/signed sum). Currency selection takes the caller's
      `requestedCurrency` and falls back to UAH-else-first-in-order whenever it's absent or no
      longer among the breakdown's currencies — the "reset on disappearance" half of the rule;
      "survives rerenders" is the caller's `useState` to own (task 4.5). No filtering of
      reserved/archived categories — they participate exactly as `categoryBreakdown` gives them.
      The neutral-ring decision for negative/zero totals is task 3.3's (donut geometry); this task
      only guarantees the signed amounts themselves are never clamped or hidden. 8 tests cover the
      empty case, the five-plus-remainder reconciliation, Ukrainian tie-breaking, reserved/archived
      participation, a negative category's exact sign, a refund-only negative center, and both
      currency-selection scenarios. `npm run verify`: 3580 tests passed,
      `4fb8f56ee37bdc78c0132ebb925c2b825f6604f7`.
- [ ] 3.3 Add pure donut and history geometry with existing chart/theme conventions. Trace: main-screen «Signed or empty breakdowns…» and net-worth «History is readable…». Tests: `src/ui/dashboard-charts.test.ts` — positive sectors reconcile, no negative/zero division, negative/flat axis, bounded path preserves first/last/extrema/gaps, unsampled exact point values remain available.
- [ ] 3.4 Wire explicit current-month and category navigation, including retained month state and rollover. Trace: main-screen «The month card always opens…», «Categories open…». Tests: `src/ui/home-navigation.test.ts` — retained July opens September, October rollover, all-currency category route, remainder opens full month and both correction signs remain reachable; manual route smoke in §7.

## 4. Daily content and operational controls

- [ ] 4.1 Implement compact header model and common manual sync action, keeping coverage/freshness and existing manual-run policy. Trace: main-screen «Sync occupies…». Tests: `src/ui/home-screen.test.ts` and `src/ui/home-refresh.test.ts` — 3/9 coverage, oldest completion, no bank, in-flight join, rejected run clears spinner, no widget-specific requests.
- [ ] 4.2 Implement compact uncategorised banner and collapsed draft/error state. Trace: main-screen «Uncategorised records…», «Operational alerts…»; bank-notifications-screen «Pending чернетки are visible on Головний». Tests: `src/ui/home-screen.test.ts` and `src/ui/drafts-section.test.ts` — seven across history incl refund, unsourced income excluded, last item removes banner, fifty drafts stay collapsed, expand/confirm/dismiss and pending vs failure.
- [ ] 4.3 Adjust feed presentation while keeping editor and categorisation paths. Trace: main-screen «The feed shows…». Tests: `src/ui/transaction-line.test.ts` and `src/ui/home-screen.test.ts` — distinct description/category/source, two transfer legs, signed amounts, no-description compactness and latest five/all action; retain repo ordering tests for equal dates/backdating.
- [ ] 4.4 Assemble header/month/feed/alerts using existing shared surfaces; retain FAB and scroll behavior. Trace: main-screen «Головний presents the daily dashboard», «Opening Головний again…». Tests: `src/ui/home-screen.test.ts` — ordered default sections, no held/progress/large attention/form, all-archived invitation with history; manual first-viewport and focus/refresh smoke in §7.
- [ ] 4.5 Render category donut, currency control, legend and remainder with accessible alternatives. Trace: main-screen «Top categories…», «Category currencies…», «Categories open…», «The dashboard remains accessible…». Tests: `src/ui/home-categories.test.ts` — text/selected-state labels and route descriptors; rendered layout and TalkBack smoke in §7.
- [ ] 4.6 Render Статок current values, compact history, point inspection, explanation and Accounts link. Trace: main-screen «Статок exposes…»; net-worth «History is readable…». Tests: `src/ui/net-worth.test.ts` — all basis/coverage explanations and exact accessible dated points; rendered flat/negative/gapped charts and Accounts navigation smoke in §7.

## 5. Progress, overlays and data lifecycle

- [ ] 5.1 Remove Home's progress read/render and place quiet unseen name/count by the existing Reports → Progress entry, retaining seen behavior and evaluation triggers. Trace: progress-screen both modified requirements. Tests: `src/ui/progress-screen.test.ts` and `src/ui/reports-screen.test.ts` — twelve as one line, one name, no unseen still navigable, opening Progress marks seen, Home/Reports rendering earns nothing; preserve achievement/challenge/backup tests.
- [ ] 5.2 Define shared overlay clearance from safe-area/tab dimensions and apply it to FAB/report handle with scroll bottom clearance. Trace: main-screen «The dashboard remains accessible…». Tests: `src/ui/dashboard-layout.test.ts` — disjoint ≥48 dp targets, ≥8 dp spacing, tab clearance across compact/large insets; actual rendered coordinates verified in §7.
- [ ] 5.3 Add coherent data loading, deferred history derivation, memoization and invalidation with cancellation of stale reads. Trace: main-screen «The dashboard uses local data…» and month rollover. Tests: `src/ui/home-data.test.ts` — mutation/focus/sync/capture/restore/valuation/opening edit/date rollover refresh, old result cannot overwrite new, status-only rerender does not rescan history, currency selection sends no requests.
- [ ] 5.4 Bound rendered chart work independently of history length and profile the fixture. Trace: main-screen «The dashboard uses local data…»; net-worth «History is readable…». Tests: `src/ui/dashboard-charts.test.ts`, `src/db/net-worth-repo.test.ts` — 50k records/30 accounts/120 months, bounded output, no per-account/per-month full-history rescans; record device frame/timing evidence in §7.

## 6. Synchronized documentation after approval

- [ ] 6.1 Update product-vision §3 and glossary's new Статок term to the agreed primary metric, account membership, valuation basis and honest history limitations. Trace: main-screen «The primary month amount…»; net-worth all requirements. Manual consistency review; preserve monthly formula and §14 exclusions.
- [ ] 6.2 Update tech-task, app-overview and main-screen/month-screen/progress-screen Purpose text to actual implemented behavior; also reword the `challenges` spec's Purpose paragraph, which still narrates «Потребує уваги» as current product framing. Trace: main-screen order, spent, widgets; progress-screen navigation. Document unchanged Accounts totals and Progress data, no global monthly budget, no new requests. Do not claim future work shipped.

## 7. Acceptance and final checks

- [ ] 7.1 Run compact Android visual/navigation smoke on a 360 × 640 dp profile at default and 200% text. Trace: all main-screen accessibility/navigation scenarios. Record month → current Місяць, all/category/editor/rule-offer paths, five latest, empty/three-currency/refund-negative states, draft expansion, refresh in-flight/failure, and 3–5 second daily reading evidence.
- [ ] 7.2 Run Android overlay and accessibility smoke with report handle on/off, gesture and three-button system navigation, TalkBack, chart point inspection and scroll-end clearance. Trace: main-screen «The dashboard remains accessible…» and net-worth «History is readable…». Record screenshots and actual target rectangles; do not infer success from helper tests.
- [ ] 7.3 Run large-history/offline acceptance and domain invariance smoke. Trace: main-screen «The dashboard uses local data…», net-worth historical/current/FX/change requirements and progress-screen preservation. Record device/build, top-load ≤1 s, 10-second scrolling ≥55 fps without sustained drops, cached FX/missing FX, late opening/no anchor, archived/debt/current-value=0, no fabricated past values and Reports → Progress with unchanged stored data.
- [ ] 7.4 Capture real updated documentation screenshots and synchronize links/captions in app-overview (Home default, multi-currency/categories, Статок caveat, Reports access); inspect images for truncation and overlap. Trace: main-screen layout/accessibility and progress-screen navigation. No fabricated screenshots and no pixel-perfect Saldo copying.
- [ ] 7.5 Run `npm run verify` and paste the final lines
- [ ] 7.6 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
