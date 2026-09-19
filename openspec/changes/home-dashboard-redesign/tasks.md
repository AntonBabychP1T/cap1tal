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
- [x] 3.3 Add pure donut and history geometry with existing chart/theme conventions. Trace: main-screen «Signed or empty breakdowns…» and net-worth «History is readable…». Tests: `src/ui/dashboard-charts.test.ts` — positive sectors reconcile, no negative/zero division, negative/flat axis, bounded path preserves first/last/extrema/gaps, unsampled exact point values remain available.

      **Result:** No existing chart geometry to extend (confirmed by exploration — only
      `icons.tsx`/`icons.ts` set the data/renderer split precedent to follow; `react-native-svg` is
      already a dependency). Added `src/ui/dashboard-charts.ts`: `donutGeometry` — `neutral` for
      any negative amount, an all-non-positive total, or no categories, else sectors reconciling
      exactly to 360°; `historyGeometry` — splits into segments at gaps (never bridged), pads a
      flat or all-equal value range symmetrically so a division by a zero range never happens, and
      bounds each segment to ≤120 plotted points via a first/last/local-extrema-then-even-stride
      downsampler, while every plotted point keeps its original `seriesIndex` so exact values stay
      reachable from the caller's own untouched series. 13 tests cover sector reconciliation,
      negative/zero/no-category neutrality, flat/negative-range padding, gap-splitting, bounded
      downsampling preserving a peak and a trough over 400 points, and exact-value lookup by index
      after downsampling. `npm run verify`: 3593 tests passed,
      `1ba14ceb7c504b28fe5428d1f4a2efc565a01091`.
- [x] 3.4 Wire explicit current-month and category navigation, including retained month state and rollover. Trace: main-screen «The month card always opens…», «Categories open…». Tests: `src/ui/home-navigation.test.ts` — retained July opens September, October rollover, all-currency category route, remainder opens full month and both correction signs remain reachable; manual route smoke in §7.

      **Result:** Added `src/ui/home-navigation.ts`: `currentMonthRoute`/`categoryMonthRoute`/
      `remainderRoute`, pure functions of `now` (never of any retained state) building the exact
      route strings the existing `/month` and `/category/[month]/[categoryId]` routes already
      accept — no currency param exists for `categoryMonthRoute` to narrow with, and «Коригування»
      reaches the same existing route (its both-signs behavior is that route's own, untouched).
      Wired the month card in `index.tsx` to `currentMonthRoute(new Date())`. `month.tsx` now reads
      an optional `month` search param and, when it changes, resets its retained `shown` state
      during render (React's documented "adjusting state" pattern — a plain effect tripped the
      `react-hooks/set-state-in-effect` lint rule); arriving via the tab bar itself carries no such
      param, so ordinary retained stepping is untouched. Category-row/«Ще N» wiring has no UI home
      yet — that's task 4.5's donut — so only the month-card call site is wired now. 5 new tests in
      `home-navigation.test.ts` plus a structural check and a fixed stale assertion in
      `home-screen.test.ts`. `npm run verify`: 3599 tests passed,
      `601f4500eb6988f0863fe94722a852594723125a`.

## 4. Daily content and operational controls

- [x] 4.1 Implement compact header model and common manual sync action, keeping coverage/freshness and existing manual-run policy. Trace: main-screen «Sync occupies…». Tests: `src/ui/home-screen.test.ts` and `src/ui/home-refresh.test.ts` — 3/9 coverage, oldest completion, no bank, in-flight join, rejected run clears spinner, no widget-specific requests.

      **Result:** Coverage/freshness (3/9, oldest completion, no bank) were already correct and
      tested via `HomeMonobank`/`freshnessOf` from `home-daily-overview` — no new data model was
      needed for those; "compact header" is a layout question for task 4.4's assembly, not a new
      abstraction (`model.monobank !== null` already gates exactly "linked/configured", which is
      when the 48 dp button belongs). Added `src/ui/home-refresh.ts`'s `manualRefresh`: the one
      decision pull-to-refresh and the header button now share — quiet when not configured or
      nothing is linked, otherwise delegates unconditionally to `startSync` (which already joins a
      run in flight rather than starting a second one, so this never pre-checks `syncing` itself),
      never swallowing a rejection so the caller's own `finally` still clears its spinner. Wired
      `index.tsx`'s `pull` callback to call it instead of duplicating the configured/linked check
      inline. 5 new tests in `home-refresh.test.ts` (no bank not-configured, no bank
      nothing-linked, a normal call, two overlapping calls both reaching `startSync`, and a
      rejection propagating past a `finally`); fixed one stale structural assertion in
      `home-screen.test.ts`. `npm run verify`: 3604 tests passed,
      `e4348eee37fa3d7956465dd95c81f1d61df3b672`.
- [x] 4.2 Implement compact uncategorised banner and collapsed draft/error state. Trace: main-screen «Uncategorised records…», «Operational alerts…»; bank-notifications-screen «Pending чернетки are visible on Головний». Tests: `src/ui/home-screen.test.ts` and `src/ui/drafts-section.test.ts` — seven across history incl refund, unsourced income excluded, last item removes banner, fifty drafts stay collapsed, expand/confirm/dismiss and pending vs failure.

      **Result:** Replaced `HomeAttention`/`attention` with `HomeAlerts`/`alerts` in
      `home-screen.ts`: `uncategorisedBanner` («7 транзакцій без категорії · Переглянути», `null`
      at zero — the seven-across-history/unsourced-income-excluded/last-item-removes-banner
      behavior is `countUncategorised()`'s own, already correct and unchanged), `draftCount` +
      `draftLabel` («50 чернеток»), and `failureRow` (unchanged `needsOwner` logic, just renamed).
      Rewrote `index.tsx`'s JSX: the old single "Потребує уваги" accent card is gone; the banner is
      its own compact row, and the draft/failure rows are up to two collapsed rows in one card —
      the draft row toggles a local `draftsExpanded` state that gates the existing confirm/dismiss
      `ListCard` (unchanged logic from `drafts-section.ts`, still 15/15 passing as a regression
      check — expand/confirm/dismiss and pending-vs-failure behavior was never touched). Updated
      every structural assertion in `home-screen.test.ts` and `notifications-screen.test.ts` that
      had regex-matched the old JSX literals, and rewrote the operational-alerts describe block for
      the new fields. `npm run verify`: 3605 tests passed,
      `b1423c13c6f425f5a4f6b8afc988cccb3fea904e`.
- [x] 4.3 Adjust feed presentation while keeping editor and categorisation paths. Trace: main-screen «The feed shows…». Tests: `src/ui/transaction-line.test.ts` and `src/ui/home-screen.test.ts` — distinct description/category/source, two transfer legs, signed amounts, no-description compactness and latest five/all action; retain repo ordering tests for equal dates/backdating.

      **Result:** `transaction-line.ts`'s `transactionLine` now shows explicit money direction —
      `directionalAmount` prefixes expense with «−» (stored positive; the prefix is purely
      display, `transactionEffect` still owns the real negation) and income/повернення with «+»,
      and shows коригування's own stored sign explicitly either way; `transferAmount` always
      draws a directional arrow and now shows **both** leg amounts whenever they differ — same
      currency or not — fixing a real gap where a same-currency fee-adjusted переказ (left ≠
      arrived) previously collapsed to one ambiguous number. No category/type icon: no shared icon
      contract exists yet (`category-icons-and-transaction-visuals` is still unplanned), and the
      main-screen requirement itself only asks for one "as an extra cue" beside required text,
      which the existing type/category/source labels already are — introducing one now would risk
      the "no competing category-icon storage" the design's Migration Plan explicitly warns
      against. Description/category/source distinction, no-description compactness,
      editing/categorisation taps and the latest-five/«Усі» action were already correct and are
      untouched. Updated 4 pre-existing assertions in `transaction-line.test.ts` to the new format
      and added a same-currency-unequal-legs test (26 tests, was 25). `npm run verify`: 3606 tests
      passed, `c49464c22423db40af7fbf2656a62a012cf71cf8`.
- [x] 4.4 Assemble header/month/feed/alerts using existing shared surfaces; retain FAB and scroll behavior. Trace: main-screen «Головний presents the daily dashboard», «Opening Головний again…». Tests: `src/ui/home-screen.test.ts` — ordered default sections, no held/progress/large attention/form, all-archived invitation with history; manual first-viewport and focus/refresh smoke in §7.

      **Result:** Reordered `index.tsx` into design D1's sequence: Wordmark → compact header
      (freshness text + a new 48 dp «Оновити» sync button, both calling the same `pull`/
      `manualRefresh` the gesture already did — the header had no distinct tappable sync trigger
      before this) → month card → no-account invitation (still keyed on `model.held === null`,
      the same signal, even though its card no longer renders) → uncategorised banner → «Останні
      транзакції» feed → collapsed operational alerts → expanded drafts → `RuleOfferSheet`.
      Removed entirely: the "На рахунках" held card and the «Прогрес» section (JSX, the
      `progressSection` useMemo, the `progress: progressScreenData()` read, and the
      `homeProgressSection`/`progressScreenData` imports) — both REMOVED requirements now have no
      rendering on Головний; `evaluateProgress()`'s evaluation-trigger calls elsewhere in the file
      are untouched. Also retired the now-dead `held`/`heldText`/`heldAmount`/`progress`/
      `progressTop` styles plus two already-orphaned ones (`statusFoot` from task 3.1,
      `attentionHead` from task 4.2). Fixed two stale structural tests in other files
      (`home-screen.test.ts`'s held-card test, `screens.test.ts`'s cross-screen progress-reachability
      test) and one stale doc comment, and added explicit ordering/no-held-progress-form tests.
      FAB and scroll-to-top behavior are untouched. `npm run verify`: 3608 tests passed,
      `b57a6d0930e0537b8f775dd34b93b3a9a42d221a`.
- [x] 4.5 Render category donut, currency control, legend and remainder with accessible alternatives. Trace: main-screen «Top categories…», «Category currencies…», «Categories open…», «The dashboard remains accessible…». Tests: `src/ui/home-categories.test.ts` — text/selected-state labels and route descriptors; rendered layout and TalkBack smoke in §7.

      **Result:** Extended `home-categories.ts` with `accessibilityLabel` on every row and the
      remainder, and a new `currencyChips` array (empty unless 2+ currencies exist, each chip
      carrying its own selected-state label — "UAH, обрано" vs plain "UAH" — so the choice is never
      colour-only). Added `src/components/category-widget.tsx`: an SVG donut (plain trigonometry,
      no arc-command approximation needed since this isn't the icon set's bounds-checked glyph
      table) using the single theme accent at graduated opacity per sector — confirmed via
      exploration that the theme defines no multi-hue chart palette at all ("Графіт і вохра" is
      genuinely one accent), so a second palette would fight the design system rather than extend
      it; a neutral ring (border-coloured, no sectors) for any negative or non-positive total; the
      remainder grouped into the donut's own last sector so it reconciles to the exact signed
      center. Wired into `index.tsx` after the operational alerts, with local `useState` for the
      requested currency and `categoryMonthRoute`/`remainderRoute` (task 3.4) driving navigation.
      6 new tests in `home-categories.test.ts` (10 total) cover the two new fields, the
      no-selector-for-one-currency case, and the route-descriptor contract. Rendered
      layout/TalkBack verification is task 7.2's, on the emulator. `npm run verify`: 3610 tests
      passed, `5063acebf6f0b39ed29f6b81a8c06e83f3d894b3`.
- [x] 4.6 Render Статок current values, compact history, point inspection, explanation and Accounts link. Trace: main-screen «Статок exposes…»; net-worth «History is readable…». Tests: `src/ui/net-worth.test.ts` — all basis/coverage explanations and exact accessible dated points; rendered flat/negative/gapped charts and Accounts navigation smoke in §7.

      **Result:** Added `netWorth` to `src/db/repos.ts` (net-worth-repo's four bounded reads,
      following the existing one-repo-per-line convention) and `netWorthWidgetModel` to
      `src/ui/net-worth.ts` — the one assembly function tying together `currentNetWorth`,
      `netWorthHistory`, `netWorthChange` and the already-built readouts/approximate/explanation
      helpers into one renderable model, plus `buildHistoryInputs` (groups the repo's three flat
      readings by account), `historySeriesFor`/`historyPointLabel` (dated points → chart-ready
      series and per-point accessible text), `selectHistoryCurrency` (independent from the
      category widget's own selection, same UAH-first fallback rule) and `changeLabel`. Fixed a
      real bug caught while wiring the renderer: `accountBasisLines` was returning bare account
      ids as if they were names — it now takes an account-names map and returns a resolved `name`.
      Added `src/components/net-worth-widget.tsx`: current per-currency values, ≈ UAH, a currency
      selector (only with 2+ history currencies), an SVG line chart (plain polyline, gaps left as
      real gaps in the path), the change line, a collapsible accessible point list (this doubles
      as point inspection — no on-chart touch tracking, given no established interaction pattern
      exists to extend), a collapsible basis explanation, and a link to Рахунки. Wired into
      `index.tsx` after the category widget, reading `transactionsRepo.listAll()` and
      `investmentsRepo.all()` alongside the four net-worth-repo reads. 14 new tests in
      `net-worth.test.ts` (26 total) cover the new functions and two `netWorthWidgetModel`
      integration scenarios. Section 4 (daily content and operational controls) is now complete.
      `npm run verify`: 3626 tests passed, `cecb8d3b63fc8230545d67101b195c46b18b870e`.

## 5. Progress, overlays and data lifecycle

- [x] 5.1 Remove Home's progress read/render and place quiet unseen name/count by the existing Reports → Progress entry, retaining seen behavior and evaluation triggers. Trace: progress-screen both modified requirements. Tests: `src/ui/progress-screen.test.ts` and `src/ui/reports-screen.test.ts` — twelve as one line, one name, no unseen still navigable, opening Progress marks seen, Home/Reports rendering earns nothing; preserve achievement/challenge/backup tests.

      **Result:** Home's progress read/render was already fully gone as of task 4.4 (no
      `held`/progress JSX, no `progressSection`/`progressScreenData` call in `index.tsx`). This
      task did the other half: `src/ui/progress-screen.ts` dropped the dead `HomeProgressSection`
      interface, `homeProgressSection()` and `closeness()` (zero non-test callers after 4.4) and
      gained `unseenAchievementsBadge(earned, candidates): string | null` — one name for exactly
      one unseen досягнення, one `Ви вже маєте N досягнень` line for several, `null` for none;
      reading never marks anything seen, only `progress.tsx`'s existing `markAllSeen` effect does
      (untouched). `src/hooks/progress-ports.ts` gained `unseenAchievementsData(now)`, a narrower
      read alongside `progressScreenData` (both now share a `namedCandidates(now)` helper) that
      returns just `{candidates, earned}` — the same bounded, read-only storage reading «Прогрес»
      itself does, without the виклик classification the badge does not need. `reportsViewModel`
      (`src/ui/reports-screen.ts`) gained optional `progressCandidates`/`earnedAchievements`
      inputs and a `progressBadge` output field computed via `unseenAchievementsBadge`; `reports.tsx`
      loads `unseenAchievementsData()` alongside its existing reads and renders
      `model.progressBadge ?? 'Що вже вийшло і що варто зробити далі'` in the existing Прогрес card,
      unconditionally — the entry itself was never gated on the badge. Also switched the one
      `router.push('/progress')` call site to the existing `PROGRESS_ROUTE` constant (was defined
      but unreferenced), updating the two structural assertions in `screens.test.ts` that quoted
      the literal.
      New tests: `progress-screen.test.ts` — `unseenAchievementsBadge`'s no-unseen/one-named/
      twelve-as-one-line/seen-is-seen/plural-counting scenarios (5), plus the `homeViewModel`
      type-exclusion proof that Головний reads none of this. `reports-screen.test.ts` — the same
      badge scenarios through `reportsViewModel` (4), plus structural proof the badge is drawn from
      the model, the Прогрес entry is never gated on it, and «Звіти» reaches no evaluator or
      seen-marking write (`runEvaluation`/`evaluateProgress`/`markAllSeen`/`.earn(`) — only the
      read-only `unseenAchievementsData`. All achievement/challenge/backup tests untouched and
      still passing. `npm run verify`: 3630 tests passed,
      `75a0e0e4354bcc2fc699e06afb0293dc4a8cdf76`.
- [x] 5.2 Define shared overlay clearance from safe-area/tab dimensions and apply it to FAB/report handle with scroll bottom clearance. Trace: main-screen «The dashboard remains accessible…». Tests: `src/ui/dashboard-layout.test.ts` — disjoint ≥48 dp targets, ≥8 dp spacing, tab clearance across compact/large insets; actual rendered coordinates verified in §7.

      **Result:** New `src/ui/dashboard-layout.ts`: pure `overlayLayout({safeAreaBottom,
      tabBarHeight, fabSize, handleSize})` — the «+» sits `safeAreaBottom + tabBarHeight + 16dp`
      above the device's own bottom edge; the report handle stacks `OVERLAY_GAP` (8dp) above the
      «+»'s own top edge; a scroll column's `paddingBottom` clears the handle's own top edge plus
      the same 16dp margin. Stacking by construction is what keeps the two disjoint regardless of
      device or screen, without either needing to know the other is present — load-bearing because
      the report handle floats over every screen (design D4, `bug-report-here.tsx`) while the «+»
      floats only over Головний (`surfaces.tsx`'s `Fab`/`Screen`), so the two are never in the same
      component tree. This replaced two independent, unrelated pixel guesses
      (`bottom: Spacing.six + Spacing.three` = 80 for the «+», `bottom: TouchTarget * 2` = 96 for
      the handle) that neither read the device's real safe-area inset nor its real tab bar height
      and, worked out on paper, actually overlapped by 40dp with no 8dp gap at all — exactly what
      this task's Trace requirement rules out.
      Wired into both `.tsx` files via `useSafeAreaInsets()` (`react-native-safe-area-context`,
      already a dependency, `useSafeAreaInsets` previously uncalled anywhere in `src`) and the
      previously-unused `BottomTabInset` constant (`constants/theme.ts`, Platform-specific tab bar
      height placeholder, now given its first caller): `Screen`'s `Fab` and its scroll
      `contentContainerStyle`, and `BugReportHere`'s handle, each call `overlayLayout` with the
      same `FAB_SIZE`/`HANDLE_SIZE` formula (`TouchTarget + Spacing.two` / `TouchTarget`) — defined
      once in each file rather than cross-imported, since the two components never share a tree.
      `src/ui/dashboard-layout.test.ts` (5 tests, new): disjoint ≥48dp targets with ≥8dp gap;
      neither target under the tab bar across four safe-area insets (0/16/34/48dp, compact through
      large) crossed with both platforms' `BottomTabInset`; scroll clearance exceeds both overlays'
      top edges; a larger safe-area inset or a taller tab bar shifts every offset by exactly that
      amount. No existing test asserted the old hardcoded values structurally, so nothing else
      needed updating. `npm run verify`: 3635 tests passed,
      `4ddafd283cd2eb40985e231e89c0c7cb2ca431f3`.
- [x] 5.3 Add coherent data loading, deferred history derivation, memoization and invalidation with cancellation of stale reads. Trace: main-screen «The dashboard uses local data…» and month rollover. Tests: `src/ui/home-data.test.ts` — mutation/focus/sync/capture/restore/valuation/opening edit/date rollover refresh, old result cannot overwrite new, status-only rerender does not rescan history, currency selection sends no requests.

      **Result:** Audited every named trigger against the existing wiring first, rather than
      assuming each needed new code. Coherent data loading, memoization and the "status-only
      rerender does not rescan history"/"currency selection sends no requests" properties were
      already true by construction: `useReloadOnFocus` (`src/hooks/use-reload-on-focus.ts`) reads
      every field of `stored` — Статок's included — in one synchronous callback, so there is
      already exactly one coherent snapshot per reload and never a partial one; `categories` and
      `netWorth` each carry their own narrow `useMemo` dependency arrays that never mention
      `configured`/`syncing`/`coverage`/`drafts`/`pulling`, so a status-only rerender already
      leaves both memoized; the two currency choosers are wired straight to a bare `useState`
      setter (`onSelectCurrency={setRequestedCategoryCurrency}`), never a wrapper that could reach
      a repo. Mutation, restore, valuation and opening-balance edits all happen on a screen reached
      by leaving Головний, so returning is a navigation focus and `useReloadOnFocus` already
      answers it; sync (`onSyncState`) and чернетка capture (`onCapturesStored`) already had their
      own subscriptions calling `reload()`.
      The one trigger genuinely missing was **date/month rollover** — main-screen's own "Rollover
      updates the month" scenario ("Головний was opened on September 30… local October 1 arrives
      while it remains open, or the app resumes then"): neither case is a navigation focus, so
      nothing reloaded `stored.month`/`stored.today` for either. Added `hasDateRolledOver(lastToday,
      now)` in a new pure module, `src/ui/home-data.ts` (no React, same shape as task 5.2's
      `dashboard-layout.ts`), and wired it into `index.tsx` two ways — an `AppState` `'change'`
      listener catching the resume case (any date at all after the phone slept) and a 60s
      `setInterval` catching the date turning over while the screen was never backgrounded — both
      calling the same `reload()` every other trigger calls.
      For "old result cannot overwrite new": the `configured` (monobank-token) focus effect already
      had a correct, hand-rolled cancel flag; `useCurrentRates.ts` (shared by three screens, out of
      this task's main-screen scope) already had its own, independently reasoned-through one — left
      untouched rather than refactored into shared machinery it does not need. Added
      `makeCancelToken()` to `home-data.ts` as the one tested primitive and moved the `configured`
      effect (in scope: it is Головний's own) onto it, so this repo's shared cancellation guard now
      has one proven implementation rather than an unproven convention repeated by hand.
      New `src/ui/home-data.test.ts` (16 tests): `hasDateRolledOver` across a same-day check, a
      year boundary and a multi-day resume; `makeCancelToken`'s cancelled/uncancelled/double-cancel/
      independent-tokens behaviour; structural proof (reading `index.tsx`, the
      `reports-screen.test.ts`/`progress-screen.test.ts` pattern) that every named trigger reaches
      `reload()`, that the monobank-token effect checks `token.cancelled()` before applying its
      result, that neither `categories` nor `netWorth`'s `useMemo` mentions any status field, and
      that both currency choosers are bare state setters. `npm run verify`: 3651 tests passed,
      `2ca91d54b32f6755c258de647021f69c4d627d88`.
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
