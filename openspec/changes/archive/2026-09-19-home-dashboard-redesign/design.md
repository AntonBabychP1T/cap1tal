## Context

See proposal.md for the product decision. Read before drafting: product-vision, glossary, tech-task, current main-screen/month-screen/monthly-picture/accounts/reports/achievements contracts, relevant progress-screen contracts, and the current Home wiring and helpers. Graph MCP is unavailable in this session; discovery used source files.

`index.tsx` already renders five records, but only after month/held/attention/progress. `homeViewModel` reads `monthlyPicture`, `accountTotals`, sync coverage and `needsOwner`. The main spec still describes an inline form and money-held first; the active `home-daily-overview` implements a FAB and залишилось first without having archived all deltas. Treat implementation and published contract as separate evidence.

`Account` has no creation date or dated opening balance. Its opening balance means the amount before its first recorded transaction and is editable. `investment_values` holds one replaceable `CurrentValue { amount, asOf }` per account, not a valuation history. `goals.contribution` already chooses current value (including zero) over computed balance for investments. Archived accounts retain all money, though `accountTotals` deliberately excludes them from «Усього грошей». Those facts constrain a trustworthy historical chart.

## Goals / Non-Goals

**Goals:** one presentation of existing money rules; testable missing-data states; responsive bounded dashboard; readable 360 × 640 dp Android layout; no new persisted financial totals.

**Non-Goals:** new valuation history, dated account opening migration, historical FX service, inferred prices/returns, customization, new transaction semantics or changes to existing Accounts totals. Native modules: none. Permissions: none. Expo configuration changes: none. Dependencies: none (SVG is already installed). Schema/migrations: none; any later schema decision requires a separate amendment and append-only migration.

## Decisions

### D1. Visual hierarchy and interaction

Use existing theme tokens, `ThemedText`, `Card`, `ListCard`, `Icon`, `Screen` and `Fab`. No reference colors, screenshot assets or pixel-perfect Saldo layout. There were no Saldo images attached to inspect.

Default order:

1. Wordmark; a compact freshness line and 48 dp sync button where linked/configured.
2. «Витрачено у <місяці>», one exact amount per currency on separate wrapping rows.
3. «Останні 5 транзакцій» + «Усі»; optional uncategorised banner; up to five rows.
4. At most two collapsed operational rows: draft count and actionable monobank error.
5. «Топ категорій витрат, <місяць>»: compact currency chips, donut, five legend rows, «Ще N».
6. «Статок»: primary per-currency current values, secondary ≈ UAH if available; compact history and its explicitly named basis.

Primary here is hierarchy, not a new total. No forced single-line amount shrinking. Large fonts may increase card height and stack donut/legend. At default font on 360 × 640 dp, header, month card, feed heading and at least one transaction must be visible; service content must not occupy most of that viewport. The owner should identify spent/month and latest record in a 3–5 second smoke walkthrough. Full widgets need not fit in the first viewport.

Month-card navigation explicitly selects the device's current month, even if the tab retained a past month. Category navigation uses the existing category/month route; it preserves that route's all-currency list and signed correction semantics. «Ще N» opens current Місяць with the full breakdown. Statок header action «Рахунки» opens the existing accounts tab; text explains why its active-account computed totals can differ.

Money direction in feed text is explicit: expense −, income/refund +, correction its stored sign, transfer a directional arrow with each leg’s amount/currency (both amounts when unequal even in one currency). Keep row text for category/type/source, description where present, date and account(s); use icon only as an extra cue. Keep exact amount(s) and currencies, transfer direction, existing one-tap categorisation/rule offer, editor and deletion rules. Description never becomes a category or income source. No unbounded text expansion in the default feed; accessibility exposes the full text.

### D2. Month and category calculation

`monthlyPicture` and `categoryBreakdown` receive the same `listMonth(currentMonth(now))` rows; all accounts, archived included, remain available for transfer classification. Do not write an expense-only alternative query that misses refunds or corrections. Currency ordering uses existing `byCurrency` (UAH first); category currency defaults to UAH if present in the breakdown, otherwise first currency in that ordering. A user selection survives rerenders in the same month while available; reset on month change/disappearance.

Five rows sorted by signed net spent descending, then Ukrainian label, then stable id. «Ще N» counts all remaining categories including zero/negative, and states their signed sum in the selected currency. Donut groups their amounts into the corresponding remainder segment. All category numbers, including archived/reserved, reconcile exactly to spent.

If any category is negative, a usual share-of-total donut is mathematically misleading even when total > 0. Keep the exact signed center/legend, render a neutral ring without percentage sectors, and say «Повернення перевищили витрати в окремих категоріях». All-zero amounts also render a neutral ring with «Витрати за вирахуванням повернень — 0». No absolute-value pie, clipped negative, or division by zero. An empty breakdown says «Ще немає витрат»; a month with no records says «Цього місяця ще немає транзакцій» in its main card rather than inventing a currency. Income-only or classified-transfer-only month displays the existing picture's spent zeroes. Ordinary transfers alone explain «Цього місяця лише перекази» without inventing a picture currency.

### D3. Meaning of Статок now

Define the proposed glossary term as a **derived valuation of all recorded accounts**, per currency. No stored total, no balance override:

`current[currency] = sum(contribution(account, all recorded transactions, currentValue if investment))`.

Include archived accounts: archiving is not disposal. Include debt balances with their sign: positive is a receivable, not a liability to subtract again. Negative balances subtract. An investment current value replaces, never adds to, вкладено; absent means use вкладено and label the fallback; zero is present. Show a compact basis line and expandable explanation listing account, amount, basis and valuation date. A stale valuation is still the latest observation, visibly dated, never described as a fresh market price. Missing account/balance inputs are unknown, never silently zero.

This differs intentionally from existing «Усього грошей» on Accounts in **membership** (archived included) and **valuation** (investment observations). Keep that existing definition and show the difference on the widget explanation. This uses the same contribution semantics already used by goals and changes no goals or balances.

Approximation groups exact contributions per currency, then uses existing `approximateUah` and `approximateTotals` rounding: current cached monobank buy/cross rate, integer minor units, halves away from zero. Require a known rate for every participating non-UAH currency, including a zero total, as the existing totals rule does. Missing rate hides the whole approximation with the named currencies; exact rows remain. Mark ≈ and the oldest participating rate timestamp. Overflow or incomplete data yields an unavailable value, never an unsafe integer. Primary rows remain exact arithmetic on the recorded observations, not claims of exact market valuation.

### D4. Historical coverage and comparison

Do not infer investment performance from money movements. The mini chart is explicitly **«Історія розрахункових балансів · інвестиції за вкладеним»**, per selected currency; do not call it historical market value. Current headline and chart endpoint can differ; display that explanation and never join a current-value headline to the curve. History currency selector uses all account currencies, UAH first when present then existing currency order, independently from category selection; preserve an available selection while focused, reset only when it disappears. No historical FX conversion: changing cached rates changes only today's ≈ line.

History spans earliest recorded transaction on/before today through today. Candidate points: that earliest date (end of day), each intervening calendar month-end, and today, deduplicated. Empty months carry the previous balance. Future transactions are excluded from the curve, and don't extend its axis. Current headline remains the same all-recorded-transactions reading as existing account/contribution semantics; if future transactions participate, label «Включено записи з майбутніми датами» and suppress headline comparison. Do not silently change account rules to force agreement.

At date d the ledger value of an account is its opening balance plus effects of its transactions dated ≤ d, using the existing account semantics. For a **nonzero** undated opening balance, it is only anchored from that account's earliest recorded transaction date: earlier points are unknown. If such an account has no transaction on/before today, its historical contribution remains unknown for the whole series. For a zero opening balance, recorded contribution before the first movement is zero, explicitly within the recorded-history basis (no assertion that the real account existed then). A currency point requires every account contribution in that currency to be known: any unknown creates a gap, never a partial total or zero. This conservative choice sacrifices early points rather than inventing when money existed. No transaction history means no chart, even if current money is known. One known date means a labelled point without a connecting line or change.

Historical values are reconstructed **from the currently stored record**, not an audit log of what the app showed then: changing an opening balance or editing/deleting/backdating/importing/restoring records recomputes the affected series. No fabricated snapshots. Archiving/unarchiving changes neither current membership nor past points.

Previous relevant period is precisely the last day of the calendar month before today. Show current minus that point only if both complete and comparable in the same currency and no current investment observation substitutes for that currency's ledger contribution and no future-dated transaction affects it. Do not skip a missing previous month to pick a flattering baseline. If unavailable, say why; the curve can still be useful. Signed absolute change can be shown for zero/negative baseline; percentage only for strictly positive baseline, rounded to one decimal for display with integer/rational arithmetic. Label «від <date>» and never call it investment return. No cross-currency change or ≈ percentage.

### D5. Local data and performance

Keep five-record `listLatest(5)` and bounded picker recency, count uncategorised with the existing predicate (expense/refund, all history; income «Без джерела» excluded). Do not load draft bodies until expanded. Existing `needsOwner` and `syncCoverage` own stale/error decisions; oldest fully covered completion defines freshness, partial 3/9 is never a fresh timestamp. Pending/postponed is not failure.

No new requests for dashboard widgets. Retain the existing shared rate-refresh and app-level monobank lifecycle policies; header button and pull use the same manual `startSync` flow with `asked: true`, in-flight joining and finally-cleared spinner. Graph interaction/scroll/rerender never requests FX or sync. Offline cached data renders immediately. No token/link means local refresh only.

Introduce a local read adapter (`src/db/net-worth-repo.ts`) producing openings + first dates + signed movement aggregates per account/month and current balances, plus a bounded per-account aggregate through the earliest recorded date for the initial end-of-day point (a monthly aggregate cannot distinguish later transactions in that same month), with an explicit as-of-today cut and future-presence flag. Derive transaction effects with one shared domain rule factored from `computeBalance`; repository aggregation must have differential tests against `computeBalance`, including both transfer legs and accepted/declined fee representation. Do not make SQLite a second financial definition. Aggregate result size O(accounts × months), no N-account full histories; no per-month full rescans. Query scans may be O(transactions); test 50k rows, 30 accounts, 120 months and three currencies. Current investment observations are read once in a batch. Pure `src/domain/net-worth.ts` takes plain data, dates passed in, no FX/I/O/React/clock.

Load compact top content first; defer heavy history derivation until after first paint and yield between bounded batches if necessary. Memoize derived series by local data revision and today; invalidate on focus, committed sync/capture, transaction/valuation/account edits, import, restore and local date rollover. Drop obsolete async results. Sync status text updates alone must not rescan the whole ledger. SVG path is bounded by chart pixel width (at most 120 plotted points, preserve ends/extrema/gaps); exact comparison uses unsampled points. Point inspection and an accessible chronological list expose the unsampled monthly values on demand. Never mount a history-sized set of SVG labels.

### D6. Progress, drafts and overlay safety

Keep all achievement/challenge evaluation triggers and stored data; remove only Home's progress read/render. The existing Reports → Progress entry gains a quiet unseen-count/name line; reading Reports does not mark seen. Opening Progress marks seen as before; no notification/dialog/sound.

Draft count expands the existing in-place confirm/dismiss UI on Home, with full text, amount entry and rule evaluation unchanged. Expansion is opt-in, not part of default hierarchy. Collapse after the last draft; confirmed records update feed, spent, category and history. This keeps bank-notifications semantics and reminder destination without another editor.

FAB currently uses `bottom: Spacing.six + Spacing.three`, report handle `bottom: TouchTarget * 2`, both right-aligned in different coordinate roots. They risk collision; do not treat source offsets as proof of rendered clearance. Introduce shared overlay layout inputs (actual safe-area and tab-bar dimensions) and reserve disjoint 48 dp hit rectangles, with ≥8 dp between report handle and FAB; report handle sits above FAB on Home. Reserve scroll bottom inset so final content can clear both and the tab bar. Verify Android gesture and three-button navigation with handle on/off and large text; preserve report gesture and sheet behavior.

## Risks / Trade-offs

- Unknown opening dates can leave early history or the whole chart unavailable → state the reason next to the chart; never manufacture dates or carry today's values backwards.
- All-account valuation differs from Accounts active computed totals → explicit membership/basis explanation and dates; no silent change to Accounts.
- Negative net categories cannot form a conventional donut → signed legend with neutral ring rather than misleading proportions.
- History aggregation can block JS → compact reads, deferred work, memoization, bounded chart paths, profiling on 50k records. Acceptance: top content ≤1 s on the compact Android test device, no sustained scrolling below 55 fps over 10 seconds after load, recorded device/build and frame evidence.
- Existing implementation and active specs diverge → apply/archive prerequisite below; no edits to someone else's active work during this proposal.

## Migration Plan

1. Obtain owner agreement to this proposal before implementation, as requested. Run spec-reviewer again on the then-current tree.
2. Resolve predecessor `home-daily-overview` first through its own verification/archive process, or explicitly agree its supersession in that change; do not archive it later over this dashboard. This proposal's deltas target the published specs **as of drafting** so validation can run now.
3. After predecessor archive, rebase this delta: remove its newly published «Головний leads with the month's залишилось», «The money held is a secondary line that leads to Рахунки», and «“Потребує уваги” appears only when something is waiting» (use the exact headings in the predecessor). Move this change’s modified «Opening the app shows quick entry and the latest transactions» to ADDED under a new truthful heading «Головний presents the daily dashboard», because the predecessor removes its old heading. Drop removals for requirements the predecessor already removed; retain its FAB/entry form/recording confirmation and scroll-to-top contracts. Map the modified old scroll heading onto its published replacement. Re-review/validate before apply. Keep bank-notifications-screen, uncategorised-filter, sync freshness/cadence changes intact; coordinate icons and transaction-row rendering with the concurrently created `category-icons-and-transaction-visuals` change, using its shared icon contract if it lands first and introducing no competing category-icon storage; reconcile any overlapping active delta before archive.
4. Implement/test small tasks, then synchronized product-vision §3, glossary term, tech-task, app-overview, main-screen/month-screen/progress-screen Purpose updates and real documentation screenshots. No stored-data migration or backup version change.
5. Run compact Android smoke and repository gate, then diff-reviewer. Archive only when these pass (or separately recorded smoke limitation per repository policy). Rollback is the UI/read-model code revert; no stored balances or history are rewritten.
