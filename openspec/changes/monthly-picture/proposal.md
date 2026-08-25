# monthly-picture

## Why

The two questions the product exists to answer — *"where did my money went this month"* and *"how
much can I still spend"* (vision §1) — are computed and proven but invisible: the `monthly-picture`
spec defines spent / invested / saved / lent / income / left per currency, `monthlyPicture()`
passes its property tests, and no screen shows a single one of those numbers. With
`accounts-manual-transactions` the owner can record витрати and перекази; this change (step 4 of
tech-task §5) lets them finally *see* the month.

## What Changes

- **A new «Місяць» tab** appears between Головний and Рахунки (the vision §1 screen order). It
  shows, for one calendar month and separately per currency: **витрачено, інвестовано, відкладено,
  позичено, дохід, залишилось** — straight from the existing `monthlyPicture()` domain function
  over the month's stored transactions. It opens on the current month; the owner can step to any
  earlier month and back, but not past the current one.
- **A category breakdown of spent** (FR-M4): per currency, the month's expenses net of refunds
  grouped by category — «Без категорії», «Комісія» and «Коригування» are all there is until
  `categories-rules` seeds the editable list, and the breakdown must keep working unchanged when
  that list arrives. Tapping a category opens that category's transactions for the month; tapping
  a transaction there opens the existing editing screen.
- **The approximate UAH equivalent** (FR-M3, glossary "Approximate UAH equivalent"): beside the
  month's numbers, one secondary «≈ … грн» figure per monthly number — every currency of that
  number converted at monobank's **current** rate and summed with its UAH amount, never one total
  per currency group. The rate comes from monobank's public, tokenless currency endpoint — one of the two
  outbound connections vision §12 allows — is cached on the device, and refreshes quietly when the
  screen opens with a stale cache. No rate known (fresh install, offline) → no approximate number;
  the per-currency numbers are the truth and are always there. This is display-only conversion:
  no converted amount is ever stored, no transaction ever carries it.
- **One new table** for the cached rate (new migration; committed migrations stay untouched), and
  **one new tab icon** (`tabIcons/month.png` ×3 scales), monochrome like its neighbours.

### Non-goals (deliberately out of scope)

1. **Limits and red categories** (FR-L, step 9) — the breakdown shows amounts, never judges them.
2. **Reports across months** (FR-R, step 9) — this screen is one month at a time.
3. **Recording дохід and повернення** stays impossible until `categories-rules` (step 5): the
   screen truthfully shows дохід = 0 and залишилось going negative meanwhile. That is the honest
   state of the data, not a bug in the screen.
4. **A custom month start day** — vision §8 keeps the calendar month; a setting may come later.
5. **monobank token, transaction sync, bank balances** (step 7). Only the public rate endpoint is
   touched, with no token anywhere near it. `docs/tech-task.md` §5 files «курс» under step 7,
   but the approximate UAH figure is FR-M3, which step 4 owns and which is useless without a
   rate — so the tokenless rate endpoint comes here and the token stays in step 7. The tech task
   is a plan, not a spec; this line is the record of the two disagreeing on purpose.
6. No vision §13 item is touched.

## Capabilities

### New Capabilities

- `month-screen`: what the «Місяць» tab shows and how the owner moves — the per-currency monthly
  numbers, stepping between months, the category breakdown with its tap-through to the month's
  transactions of one category, and when the approximate UAH figure appears.

### Modified Capabilities

- `monthly-picture`: ADDED requirements — the category breakdown of spent (its rows sum to spent,
  per currency), and the approximate UAH equivalent (conversion at monobank's current rate,
  integer rounding, absent when a needed rate is unknown).
- `persistence`: ADDED requirement — the last fetched monobank rate survives a restart, so an
  offline morning still shows yesterday's approximation.

## Impact

- `src/app/(tabs)/month.tsx` — the new screen; `src/app/category/[month]/[categoryId].tsx` — the
  category drill-down route. Not under `/month`, which the tab already owns (design decision 5).
- `src/components/app-tabs.tsx` and `app-tabs.web.tsx` — one new trigger each;
  `assets/images/tabIcons/month.png` (+`@2x`/`@3x`) — new icon.
- `src/domain/` — category breakdown as a pure function beside `monthlyPicture()`.
- `src/ui/` — month label/stepping helpers and the display-only UAH conversion, pure and tested.
- `src/db/schema.ts` + one generated migration + a small repo for the rate cache.
- `src/monobank/` (new) — fetching and parsing the public currency endpoint; platform-free, tested
  against fixtures, network mocked.
- **Coordination**: `app-tabs.tsx` and `app.json`-adjacent files are also in flight in
  `app-shell-branding`. This change must be implemented only after that change and
  `accounts-manual-transactions` are committed/archived.
