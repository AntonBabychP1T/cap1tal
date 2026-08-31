# limits-goals-reports — proposal

## Why

Every number this step needs already exists: monthly-picture computes витрачено, дохід and
інвестовано for any month, the breakdown knows each category's spent, and every рахунок carries a
розрахунковий баланс. What the owner still cannot do is read those numbers across time or against
their own intentions. Step 9 of tech-task §5 (FR-L1–L2, FR-R1–R3) closes that: ліміти answer "how
much can I still spend" before the month ends instead of after, цілі give "set aside N by a date"
a visible progress, and the «Звіти» screen answers "where did the money go" over the whole
history, not one month at a time. Both product questions gain; nothing new is recorded — this
step only reads what is already true and compares it with what the owner wants.

## What Changes

- **New capability `limits`** — the ліміт of the glossary: an optional monthly ceiling on a
  category, at most one per category, an integer-minor-units сума with a currency code. A
  category is over its limit for a month exactly when that month's spent of that category **in
  the limit's currency** — the same net-of-повернення amount the monthly-picture breakdown
  holds — strictly exceeds the ліміт. Equality is not over; spending in other currencies never
  counts toward it (money rule: no cross-currency sums, no rate-converted comparisons); a
  повернення can pull a category back under. Nothing is blocked and nothing is pushed — the
  ліміт only colours what is shown.
- **New capability `goals`** — the ціль of the glossary: назва, a target сума, a дата, and the
  рахунок it is tied to. Tech-task FR-R3 left "прив'язка до рахунку або ручний прогрес" to this
  spec; the spec decides **прив'язка до рахунку**: progress is the linked рахунок's
  розрахунковий баланс, so a ціль never carries a second, hand-maintained number that can drift
  from the stored truth — every hryvnia stays explained. The target сума lives in the linked
  рахунок's currency; re-linking to a рахунок of another currency asks the target anew, nothing
  is converted. A ціль is reached when the баланс is at least the target, and overdue when its
  дата has passed unreached.
- **New capability `reports`** — the history series, pure computation: for every calendar month
  from the earliest stored транзакція's month through the current month, витрачено, дохід and
  інвестовано per currency — each month's numbers exactly as monthly-picture defines them,
  empty months at zero so the time axis never lies — and, for one chosen category, its monthly
  spent per the breakdown, negative months included.
- **New capability `reports-screen`** — the «Звіти» tab, between «Рахунки» and «Налаштування»
  (tech-task §1 screen 4): the витрачено / дохід / інвестовано chart over the whole history,
  one currency at a time where several took part; the one-category-by-month chart with its
  category chooser; and the цілі with their progress, reached and overdue states visible.
- **Modified `month-screen`** — a breakdown row whose category is over its ліміт for the shown
  month is visibly marked over limit (red), FR-L2's «у місячній картині».
- **Modified `main-screen`** — a feed line whose category is over its ліміт for the month of
  that транзакція's date shows the category visibly over limit (red), FR-L2's «у списку
  транзакцій».
- **Modified `settings-screen`** — two new sections, «Ліміти» (each category with its optional
  ліміт: set, change, clear) and «Цілі» (create, edit, delete цілі), joining the existing
  sections; the tab-order wording gains «Звіти».
- **Modified `persistence`** — ліміти and цілі survive a restart, arrive by new append-only
  migrations that keep every stored row, and reference stored categories and рахунки or are
  rejected; the whole stored history can be listed so reports can be computed.

Non-goals of this change (deliberate):

- No overall monthly limit (vision §14.13) — ліміти are per category only.
- No over-limit notification and no blocking: exceeding a ліміт changes colours, never behaviour.
  Vision §13 permits a daily bookkeeping reminder and operational error alerts, neither of which
  reports a category crossing its limit; vision §14.14 still excludes remote push notifications.
- No forecasts (vision §14.10) — the charts show what happened, never "at this pace…".
- No manual goal progress and no multi-рахунок цілі: one ціль reads one рахунок's
  розрахунковий баланс, and no money is ever assigned to a ціль by hand.
- No rate conversion anywhere in this step: ліміти compare within their own currency, цілі live
  in their рахунок's currency, report series stay per currency. The approximate-UAH figure
  stays a Місяць-screen concern.
- No new transaction types, no change to any monthly number, no change to how anything is
  recorded — this step reads.

## Capabilities

### New Capabilities

- `limits`: the optional monthly ceiling on a category — at most one per category, сума with
  currency, set/change/clear — and the over-limit determination against a month's per-currency
  spent of that category.
- `goals`: the ціль — назва, target сума in the linked рахунок's currency, дата, linked
  рахунок — its lifecycle (create, edit, delete) and the progress, reached and overdue
  determinations read from the розрахунковий баланс.
- `reports`: the per-currency history series — витрачено / дохід / інвестовано by calendar
  month over the whole stored history, and one category's spent by month — computed exactly as
  monthly-picture defines each month.
- `reports-screen`: the «Звіти» tab presenting the history chart, the category chart with its
  chooser, and the цілі with progress.

### Modified Capabilities

- `month-screen`: the breakdown marks a category over its ліміт for the shown month.
- `main-screen`: the feed marks a транзакція's category when it is over its ліміт for the month
  of the транзакція's date.
- `settings-screen`: the «Ліміти» and «Цілі» sections join the tab; the tab list wording now
  includes «Звіти».
- `persistence`: ліміти and цілі round-trip through storage under new append-only migrations;
  a ліміт references a stored category and a ціль a stored рахунок or storing is rejected; the
  whole stored transaction history can be listed.

## Impact

- New code: `src/domain/limits.ts` (over-limit determination), `src/domain/goals.ts` (progress /
  reached / overdue), `src/domain/reports.ts` (history series over the monthly picture),
  `src/ui/reports-screen.ts`, `src/ui/limits-section.ts`, `src/ui/goals-section.ts` (pure view
  models), `src/app/(tabs)/reports.tsx` and the settings sub-screens; names indicative, final
  layout in design.md.
- Touched code: `src/ui/transaction-line.ts` (over-limit flag on a feed line), the Місяць
  breakdown view model, `src/ui/settings-sections.ts`, `src/app/(tabs)/_layout.tsx` (the
  «Звіти» tab), `src/db/` (new tables, repos, mappers) with a new migration under `drizzle/`.
- No new dependencies: charts are laid out by pure TypeScript and rendered with plain views, so
  `npm run verify` stays Node-only and under a minute. No network is touched anywhere in this
  change.
