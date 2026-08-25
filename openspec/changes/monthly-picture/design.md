# monthly-picture — design

## Context

See proposal.md — Why. Everything the screen shows already exists below it: `monthlyPicture()`
(src/domain/monthly-picture.ts) computes the six numbers per currency, `transactionsRepo.listMonth`
reads one calendar month lexicographically, `useReloadOnFocus` re-queries on focus, `formatMoney` /
`transactionLine` render amounts and rows, and the screens follow one pattern — pure logic in
`src/ui/*.ts` proven by Vitest, thin JSX above it that `verify` never runs. The two genuinely new
ingredients are the category breakdown (pure function, missing today) and the monobank rate
(network + cache, nothing like it exists yet). Constraints: `.claude/rules/domain.md` (integer
money, pure domain, no floats), `.claude/rules/database.md` (append-only migrations, no `real` for
money), vision §12 (only monobank connections, token nowhere near this change).

## Goals / Non-Goals

**Goals:**

- The Місяць tab, its month stepping, breakdown and drill-down, entirely on the existing
  screen pattern — every decision `verify` can check lives in `src/ui` or `src/domain`.
- The rate pipeline honest end to end: floats stop at the network boundary, integers everywhere
  after, absence handled as a first-class state.

**Non-Goals:**

- Anything monobank beyond the public currency endpoint (no token, no accounts, no statements).
- Visual polish of the breakdown (colours, charts) — rows of labels and amounts are enough;
  limits colouring arrives with step 9.

## Decisions

### 1. Category breakdown is a second pure function beside `monthlyPicture()`

`categoryBreakdown({ month, transactions })` lives in `src/domain/monthly-picture.ts` and returns
per currency the map category id → signed integer minor units (expenses +, refunds −, negative
corrections + under `CORRECTION_CATEGORY_ID`). It needs no accounts: transfers never enter spent.
Property test: for arbitrary transactions, per currency, the breakdown sums exactly to
`monthlyPicture().spent`.
*Alternative — SQL `GROUP BY`*: rejected; database.md says what the domain can compute from loaded
rows is computed in the domain, and the month's rows are already loaded for `monthlyPicture()`.

### 2. Rates are integer millionths from the boundary inward

monobank's JSON carries floats (`rateBuy: 41.2534`). The parser converts once:
`rateMillionths = Math.round(rate * 1e6)`, and no float survives past `src/monobank/currency.ts`.
The converter (`src/ui/approx-uah.ts`) computes `round(amount × rateMillionths / 1e6)` in BigInt —
`amount × rateMillionths` can exceed 2^53 for large amounts — rounding halves away from zero, and
returns a plain integer. Minor-units-in, minor-units-out is only correct because UAH, USD and EUR
all share exponent 2 — the parser's {840, 978} whitelist in decision 3 is the guard; a future
currency with another exponent (JPY) must extend the converter, not just the whitelist. It lives
in `src/ui`, not `src/domain`: domain.md brands the approximate
UAH display-only, and the domain stays rate-free.
*Alternative — keep the float and multiply*: rejected; the spec pins exact rounding, and float
products are not reproducible enough to pin in a test.

### 3. The rate source is the public currency endpoint, `rateBuy` first

`GET https://api.monobank.ua/bank/currency` — tokenless, one of the two outbound connections
vision §12 names. The parser keeps pairs with `currencyCodeB === 980` (UAH) whose `currencyCodeA`
is an offered currency (840 → USD, 978 → EUR), taking `rateBuy` when present, else `rateCross`.
`rateBuy` is what the bank pays for the owner's foreign currency — the honest "what are my dollars
worth in UAH today"; `rateSell` answers the opposite question. The endpoint 429s when polled more
often than every ~5 minutes; the one-hour staleness threshold in the spec keeps us far under, and
any failure (429 included) falls back to the cache silently, as month-screen specifies.
`fetchMonobankRates` takes `fetch` as a parameter; tests feed fixtures, never the network.

### 4. One table `monobank_rates`, integer rate, letter-code PK

One row per currency, and therefore **staleness is decided per currency**: the screen asks
monobank again when any offered currency has no rate or a rate older than an hour, not when "the
newest rate" is old. Reading the newest would let a fresh USD rate keep a week-old EUR rate
serving the approximation forever, which is exactly the failure a partial response produces.

`currency TEXT PRIMARY KEY` (ISO-4217 letters, same vocabulary as every other currency column),
`rate_millionths INTEGER NOT NULL CHECK (> 0)`, `obtained_at INTEGER NOT NULL`
(`timestamp_ms`). A rate is a ratio, not money, so the money-pair rule (amount + currency on one
row) does not apply — but `real` stays banned and the integer convention holds. One generated
migration; the existing migrations shape test grows the new table; a small `ratesRepo`
(get / upsert / all) beside the other repos.

### 5. Routes: the tab at `(tabs)/month`, the drill-down under `/category`

The tab screen is `src/app/(tabs)/month.tsx`, registered in `app-tabs.tsx` (and the `.web`
variant) between Головний and Рахунки. The drill-down is
`src/app/category/[month]/[categoryId].tsx` — **not** `month/[month]/…`, which would collide with
the tab's `/month` URL. Its filter is pure in `src/ui`: витрати and повернення matching the
category id, plus коригування when the id is `CORRECTION_CATEGORY_ID`; rows render through the
existing `transactionLine`, and a tap pushes the existing `transaction/[id]` editor.

### 6. Month arithmetic and labels are pure `src/ui` helpers

`prevMonth` / `nextMonth` over `'YYYY-MM'` strings, a clamp at the current month (the screen
passes `new Date()` in — no clock below the JSX, per domain.md), and a label table of the twelve
Ukrainian month names in nominative («Серпень 2026») — no `Intl`, so Vitest and Hermes cannot
disagree. A `monthViewModel(...)` composes picture + breakdown + rates into formatted groups so
the JSX maps over strings.

### 7. The tab icon is three committed PNGs, generated by a throwaway script

`tabIcons/month.png` (+`@2x`/`@3x`) — a monochrome calendar glyph with alpha, matching
`home.png`'s pixel sizes, rendered by `NativeTabs.Trigger.Icon` with `renderingMode="template"`
like its neighbours. Generated once by a scratch script (node's `zlib` writes a valid PNG without
new dependencies); only the PNGs are committed, the script is not.
*Alternative — add `sharp`/`pngjs` as a dev dependency*: rejected, a dependency for three static
files nothing regenerates.

### 8. `monthlyPicture()` gets every account, archived included

It throws on a transaction referencing an unknown account id, and a month may hold transfers
touching a since-archived рахунок. The screen therefore loads the full account list (archived
included) for classification, whatever the Рахунки screen chooses to display. A ui test pins this
with an archived account's transfer in the month.

### 9. The refresh is decided from storage, never from what it just wrote

The month screen asks monobank from a `useFocusEffect`. The decision must **not** read the rate
cache through `useReloadOnFocus`, and that state must not be in the effect's dependencies:
`useReloadOnFocus` hands back a fresh object on every read, so the effect's own `reload()` after a
successful store would re-arm it. When the answer covers every currency that is merely wasteful —
the second pass finds nothing stale and stops. When the answer is **partial** (monobank drops a
currency, or the parser skips a malformed row) the uncovered currency stays stale, so the effect
would fetch, store, re-arm and fetch again with nothing but the endpoint's 429 to stop it.

So the effect reads `ratesRepo.all()` directly — synchronous SQLite, the same read the screen
already does — and depends only on `reload`, whose identity survives its own call. The effect
therefore runs once per focus and once per month change, which is what the requirement says.

This is a structural guarantee about a React effect: `verify` cannot reach it (it never runs JSX)
and no pure helper can express it. What `verify` does hold is the fact that makes the loop
possible — `approx-uah.test.ts`'s "A partial answer leaves the other currency stale, however fresh
what arrived is". The rest is evidenced by the smoke rows that watch the cache stop changing while
the screen stays open. A future edit to that dependency array is the thing to watch for.

### 10. What this hands to `categories-rules`

The breakdown keys on the reserved ids in `src/domain/transaction.ts` —
`UNCATEGORISED_CATEGORY_ID`, `FEES_CATEGORY_ID`, `CORRECTION_CATEGORY_ID` — and `categoryLabel`
maps exactly those three to «Без категорії», «Комісія» and «Коригування», falling back to the raw
id for anything else. That fallback is what lets this change ship before an editable category list
exists, and it is also the obligation it hands on: `categories-rules` must seed rows under exactly
those three ids and let stored names take over from the label map, so no breakdown row starts
showing a bare id the day the list arrives. Its own tests must cover correction attribution —
a negative коригування lands under the correction id, a positive one lands nowhere.

## Risks / Trade-offs

- [monobank changes the response shape] → the parser is total: anything unrecognised parses to
  "no rates", which the specs already treat as a first-class state (no approximation, silence).
- [BigInt on Hermes] → supported since the RN versions Expo SDK 57 ships; the converter is also
  exercised by Vitest on Node, and the value is display-only — a failure cannot corrupt data.
- [Rate limit 429 on the shared public endpoint] → one-hour staleness + silent cache fallback;
  no retry loop anywhere.
- [Parallel changes touch `app-tabs.tsx` / assets] → this change starts only after
  `app-shell-branding` and `accounts-manual-transactions` are committed; tasks gate on it.
- [The screen shows дохід = 0 until categories-rules] → stated as a non-goal in the proposal;
  the empty-month and honest-numbers scenarios make the intermediate state legible, not broken.

## Migration Plan

One append-only migration adds `monobank_rates`. Older trees simply lack the table; no data moves.
Rollback = shipping without the approximation; nothing else reads the table.
