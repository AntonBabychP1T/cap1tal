## Why

«Статок» draws its history one currency at a time: the owner picks UAH, USD or EUR and reads three
separate lines, and has no way to see the whole статок over time in one figure. The headline already
carries a secondary «≈ … грн» total (net-worth, "Approximate UAH requires every rate"), but the
history under it never does.

The vision (§5) already allows the approximation to use the *current* monobank rate "because it is
secondary and explicitly approximate", so an approximate whole статок in time is the same secondary
reading extended along the dates, not a new kind of number. It stays secondary: the per-currency
histories remain the truth.

## What Changes

- The history selector of «Статок» gains one more choice beside the per-currency ones, «Усе ≈ грн»,
  offered only when the owner holds more than one currency (with a single currency it would repeat
  that currency's line).
- Chosen, it draws the reconstructed history of every currency added up in UAH (приблизний статок в динаміці): each dated point is
  every currency's reconstructed balance converted at the *current* cached monobank rate and summed,
  marked «≈» and captioned «за поточним курсом, не за курсом на дату».
- A combined point exists only when every currency's balance on that date is known and every non-UAH
  currency has a cached rate and the sum is representable; any other point is a gap that says which
  currency or rate is missing, never a partial sum.
- The point list, the span under the chart and the change line read in the same combined terms; the
  change line is withheld when its baseline is not comparable, by the same rules as per-currency.
- Nothing else moves: UAH stays the default selection, per-currency history, the exact headline and
  its ≈ figure, the investment basis (вкладено) and every stored value are unchanged. No rate is
  fetched or stored for this — it reads the rates already cached.

**Non-goals**: historical exchange rates (the vision keeps none), a per-currency stacked chart, a
new widget, forecasting, and any change to the default selection or its persistence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `net-worth`: amends the history requirements and adds the combined «≈ грн» history — its rate basis, its completeness rule and its
  labelling — and lets the history selector offer it beside the currencies.
- `main-screen`: the Статок widget also offers and draws the combined history with its basis and
  approximation caption beside the chart.

## Impact

- `docs/glossary.md`: «Історія статку», «Зміна статку» and «Приблизний статок» name the «Усе ≈ грн»
  reading and its current-rate exception.
- `src/ui/net-worth.ts` (+ test): pure combined-series builder and model fields; reuses
  `approximateUah` and the cached `StoredRate`s already passed in.
- `src/components/net-worth-widget.tsx`: one more selector chip and the caption.
- `src/app/(tabs)/index.tsx`: the selection state becomes «currency or total».
- No schema, migration, repository, network or backup change.
