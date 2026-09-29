## Context

`netWorthHistory` (domain) already returns, per dated point, a `Map<currency, CurrencyTotal>` where
a total is `known`, or `unavailable` with reason `gap` or `overflow`. `src/ui/net-worth.ts` turns one
currency's totals into the chart series, the point rows and the change line, and already owns the
current «≈ грн» conversion (`approximateNetWorthUah`, over the cached `StoredRate`s the caller
passes in). The widget keeps the selected currency in the Головний screen's state and passes it to
`netWorthWidgetModel`. See proposal.md for motivation; vision §5 already sanctions approximating at
the current rate.

## Goals / Non-Goals

**Goals:**
- One combined series built only from data the model already receives: the per-currency history
  totals and the cached rates. No new read, repository, migration, request or clock.
- The same honesty rules the per-currency history and the current ≈ figure live under: no partial
  sum, a rate is required even for a zero balance, no invented value.

**Non-Goals:**
- Any change under `src/domain/` or `src/db/`: the combined series is a presentation reading of
  domain output, exactly as the current ≈ figure is (it lives in `src/ui/net-worth.ts` today).
- Persisting the selection, or making the combined view the default.
- No new native module, permission or Expo config change; no schema change.

## Decisions

**D1. Extract the conversion, reuse it for history.** `approximateNetWorthUah` holds the loop that
converts totals with `approximateUah`, checks rates and checks `Number.isSafeInteger`. Extract it
into `convertTotalsToUah(totals, rates)` returning `{ status: 'known', amount, oldestRateAt }` or
`{ status: 'unavailable', reason: 'missing-rate' | 'overflow' | 'uah-only', … }`, and make the
existing function format its result. The history then calls the same function per point, so the
combined series and the headline ≈ figure cannot round or select rates differently.
*Alternative:* re-implement per point — rejected; two copies of a rounding rule drift.

**D2. A point is unknown unless every held currency is known.** «Held» is every currency of any
recorded рахунок, archived and zero-balance ones included (the `historyCurrencies` set — Статок's
own scope). For each history point every held currency must have a `known` total; the first that has
not, in the existing currency order (UAH first, then `byCurrency`), gives the gap reason from its own status: «немає даних за <CUR>» for `gap`, and «сума перевищує
безпечне представлення» for `overflow` — the per-currency reason is passed through, never relabelled. A missing rate is not a per-point
property (rates are current), so it is decided once before the loop and yields the widget-level
message «Немає курсу <CUR> для сукупної історії.» instead of a chart. Overflow is a per-point gap.
This matches "no fabricated partial total" and the existing "missing EUR withholds the entire
approximation… including when EUR totals zero" rule (every held currency participates).
*Alternative:* drop unknown currencies from the sum — rejected: it presents a partial sum as the
total, which net-worth forbids.

**D3. Series and rows reuse the per-currency machinery.** The combined values are mapped to a
`HistorySeriesPoint[]` with the same even spacing and `undefined` for gaps; `historyGeometry`
already leaves a break at an `undefined` value. The leading run of gaps is trimmed by the same
rule as `chartedHistory`. The point rows reuse the folding of consecutive same-reason gaps by
generalizing `historyPointRows` to take a per-point "value or reason" reader; the per-currency call
passes its current reader, so per-currency output is byte-identical (covered by the existing tests).

**D4. The change line reuses `netWorthChange`.** Current = the exact totals converted by D1 (the
same number as the headline ≈); previous = the previous month-end's combined point; `currentUsedValuation`
is true if *any* held currency's contribution uses a current value; `hasFutureRecords` if *any*
account has future-dated records. `netWorthChange` needs a `CurrencyTotal` in one currency — the
combined values are passed as UAH `CurrencyTotal`s. Its text gains a leading «≈» on the amount.

**D5. Selection state is one value.** The screen's state holds `string | undefined`; a reserved
constant `TOTAL_HISTORY` (not an ISO-4217 code) means the combined view. `netWorthWidgetModel`
takes `requestedHistory` (replacing `requestedHistoryCurrency`), resolves it through
`selectHistoryCurrency` extended with the rule "the combined choice is valid only with ≥ 2
currencies, else fall back to the default", and exposes `historyChoices` (currencies plus the combined
choice when offered) and `historyTotalSelected`. The widget renders one chip more, labelled
«Усе ≈ грн», with its own accessibility label «Усе, наближено в гривнях, обрано».
*Alternative:* a separate toggle beside the chips — rejected: it would let "USD + combined" be
selected together and needs a second state; one selector already exists.

**D6. The model owns every string.** The chip label «Усе ≈ грн», its accessibility label, the caption,
the rate-freshness line (the oldest participating rate's own moment, `historyRateFreshness`), the chart's accessibility label,
the withheld message (naming every currency without a rate: «Немає курсу EUR, USD для сукупної історії.») and the «≈» point rows are fields of `NetWorthWidgetModel` produced in
`src/ui/net-worth.ts`, so the Node-only gate proves them; the widget only draws what the model says.

**D7. Caption.** The combined view replaces the per-currency basis line with «Історія розрахункових
балансів · інвестиції за вкладеним · ≈ за поточним курсом, не за курсом на дату», and every point
row carries «≈» before its amount.

## Risks / Trade-offs

[The combined line moves when the rate moves, which may read as wealth changing] → the caption says
it is at the current rate; per-currency chips stay one tap away; the change line is labelled «≈».

[The line starts later than the per-currency ones when any currency lacks early data] → the point
list names the earlier unknown dates and their reason, as the per-currency list does.

[Generalizing `historyPointRows` could alter per-currency text] → the existing per-currency tests
must pass unmodified; new tests cover only the combined reader.

## Migration Plan

None: no stored data changes. Rollback is reverting the change.
