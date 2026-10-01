## Why

Статок is the app's answer to "how much is there, and is it growing", yet on the owner's real data
its history is cut short and its change line never shows. Saldo, which holds the same records,
draws Статок from November 2024 month by month, with each month's level and change and a detail
screen behind it; cap1tal draws UAH only from 28 February 2026, «Усе ≈ грн» only from 31 August,
and reads «Порівняння недоступне» under both. The owner asked (2026-10-01) to make Статок as clear
and useful as Saldo's, not a copy of it.

Two rules cause the truncation, and the owner's backup of 2026-09-23 confirms both:

- A рахунок with a nonzero початковий залишок is treated as *unknown* before its first транзакція,
  and one unknown рахунок makes its whole currency unknown. One 803 UAH рахунок first used on
  2026-02-27 hides 16 months of UAH history recorded since 2024-10-28; a 300 EUR cash рахунок
  (2026-06-07) and a 20 EUR monobank рахунок (2026-08-30) hide EUR, and with it «Усе ≈ грн», until
  August. Saldo dates every «Initial balance» entry; the import keeps the сума and drops the date.
- The change compares the current reading, which counts an інвестиційний рахунок at its поточна
  вартість, against a month-end counted at вкладено. Different bases are refused, so with any
  поточна вартість entered the change never appears.

This serves the vision's second question, "how much is left", at the scale of the whole статок
over time.

## What Changes

- **Owner's decision 2026-10-01 — a рахунок enters Статок at its дата початкового залишку**, as in
  Saldo: before it the рахунок contributes nothing, and from it the рахунок contributes its
  початковий залишок plus its транзакції. The entry is a disclosed step, «новий рахунок», never
  growth. The дата comes from the Saldo «Initial balance» entry on import, is the day of creation
  for a рахунок created in the app, and is otherwise the рахунок's first транзакція. The history
  counts the рахунок from whichever of the дата and its first транзакція is earlier. The owner can
  set it beside the початковий залишок.
  **BREAKING (spec)**: replaces the requirement "Undated opening money produces honest coverage
  gaps"; a per-currency history has no gaps any more, only an overflow can make a point unknown.
- **Зміна статку compares like with like on the ledger basis.** Today's reconstructed point is
  compared with the previous month-end's, without the entry of new рахунки, so the change and
  its percentage show whatever поточна вартість has been entered. How far поточна вартість differs
  from вкладено is read on its own line.
- **Owner's decision 2026-10-01 — «Усе ≈ грн» is the default** whenever more than one currency is
  held. Per-currency histories stay one tap away and remain the exact truth.
- **Статок on Головний becomes compact and opens a screen.** The widget keeps:
  - the headline;
  - the change since the previous month-end, with sign and percentage, not shown by colour alone;
  - a 12-month chart with each month named under it.
  Tapping it opens a new pushed screen «Статок». The account explanation and the point list move
  to that screen.
- **The «Статок» screen** offers:
  - currency choices and «Усе ≈ грн»;
  - a period: 6 міс, 1 рік, 2 роки or Усе;
  - three views: Стовпці and Лінія of the month-end level, and Зміна as up/down bars of each
    month's change.
  Selecting a month shows:
  - its month-end статок, its change and its percentage;
  - the change's розбивка: дохід, витрати, коригування, обмін валют, нові рахунки.
  The screen also reads:
  - a summary of the period: total change, average per month, best and worst month;
  - a table of months, newest first, with статок, change and percentage.
- **Owner's decision 2026-10-01 — an opt-in «Прогноз»** on the screen, off by default. It draws a
  dashed continuation for the next six month-ends at the median monthly change of the last six
  complete months, with a band from the spread of the last twelve. It is always marked «≈» and
  captioned «якщо темп збережеться». It is computed on demand, stored nowhere and never feeds
  another number. This narrows vision §11 ("Not in v1: forecasts") and §14 item 10, «Forecasts»,
  for this one reading only.

**Non-goals**:
- historical exchange rates (the «≈» reading still uses the current rate);
- quarters or years as a granularity;
- a forecast anywhere but the «Статок» screen, or one built from income/category models;
- any change to how a транзакція, місячна картина, ліміт or ціль is computed;
- stored history snapshots;
- network work of any kind.

## Capabilities

### New Capabilities

- `net-worth-screen`: the pushed «Статок» screen. It covers the selector, the period, the three
  views, the selected month with its розбивка, the period summary, the month table, the opt-in
  «Прогноз», and the moved account explanation.

### Modified Capabilities

- `net-worth`:
  - history enters each рахунок at its дата початкового залишку, and the requirement on undated
    opening gaps is removed;
  - change is ledger-to-ledger and excludes new рахунки;
  - «Усе ≈ грн» is the default;
  - new requirements cover the monthly розбивка, the period summary and the «Прогноз» reading.
- `main-screen`: the Статок widget becomes compact. It shows the headline, the change and a
  month-labelled 12-month chart, and tapping it opens the «Статок» screen.
- `accounts`: a рахунок carries an optional дата початкового залишку. It is set to the day of
  creation, editable, and never in the future.
- `accounts-screen`: the рахунок form shows «станом на» beside a nonzero початковий залишок.
- `saldo-import`: the «Initial balance» entry's date becomes the дата початкового залишку.
- `backup-file`: a бекап carries each рахунок's дата початкового залишку.

## Impact

- `docs/product-vision.md` §5/§11/§14.10 and `docs/glossary.md` («Історія статку», «Зміна
  статку», «Приблизний статок», new «Дата початкового залишку», «Прогноз статку»).
- Schema: nullable `accounts.opening_date`, with a new migration and its test. The backup format
  version and the backup/restore mapping change with it.
- `src/domain/net-worth.ts`: entry semantics, monthly розбивка, period summary and forecast, all
  pure. `src/db/net-worth-repo.ts` gets per-currency, per-month sums by транзакція type.
- `src/saldo/interpret.ts` (opening date), `src/db/monobank-repo.ts` (creation date),
  `src/ui/account-form.ts` (+ its screen).
- `src/ui/net-worth.ts` (widget and screen models), `src/ui/dashboard-charts.ts` (bars and change
  bars), `src/components/net-worth-widget.tsx`, and a new route `src/app/net-worth.tsx`.
- Depends on `net-worth-total-history` being archived first. Its «Усе ≈ грн» requirements are
  modified here, including "never the default".
