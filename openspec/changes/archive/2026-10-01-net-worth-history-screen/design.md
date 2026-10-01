## Context

See proposal.md (Why). The current state the approach builds on:

- `src/domain/net-worth.ts` reconstructs history from three repository readings in
  `src/db/net-worth-repo.ts`: per-account monthly net, per-account first date, and the net on that
  first date. All three are SQL sums over one `MOVEMENTS` fragment, so the work is bounded by
  рахунки × months, not by транзакції. `valueAt` makes a nonzero opening *unknown* before the
  рахунок's first date. That is the whole truncation.
- `src/ui/net-worth.ts` builds `NetWorthWidgetModel`, including the «Усе ≈ грн» history from
  `net-worth-total-history`. `src/components/net-worth-widget.tsx` draws it with
  `src/ui/dashboard-charts.ts` (`historyGeometry`, `linePath`, react-native-svg). The selection
  lives in `useState` in `src/app/(tabs)/index.tsx`.
- `accounts` has no date for its opening. Saldo's «Initial balance» rows carry one
  (`saldo_export*.csv`, Transaction Date). `src/saldo/interpret.ts` sums them into
  `openingContributions` and drops the date. A monobank-created рахунок
  (`monobankRepo.createAccountAndLink`) has a `syncStartDate` but no opening date.
- The backup format is version 2 (`src/backup/format.ts`). The storage-shape version follows the
  migrations.

## Goals / Non-Goals

**Goals:**
- One pure domain model gives the widget, the screen, the розбивка, the summary and the forecast.
  The screen computes nothing the domain cannot test under Node.
- The repository stays bounded by рахунки × months × types. Selecting a month or a period never
  runs a query.
- The exact per-currency history stays the source; «≈» is a conversion over it, as today.

**Non-Goals:**
- No chart library. Bars, the change bars and the dashed forecast are SVG paths from pure
  geometry, as the line is today.
- No persisted screen preferences. Selection, period and view live in memory for the app's run.
- No new native module, permission or Expo config change.

## Decisions

### D1 — `opening_date` is a nullable column; the effective entry date is derived

Add `accounts.opening_date TEXT NULL` (ISO date) with a generated migration and a migration test.
The domain `Account` gains `openingDate?: IsoDate`. The history uses
`entryDate = min(openingDate, firstDate) ?? firstDate ?? today` (firstDate bounded to today, a
recorded date after today read as today), computed in
`src/domain/net-worth.ts`, never stored.

- Why derived: a backdated or imported транзакція can precede a recorded date at any time. Storing
  the minimum would go stale and need a rewrite on every edit.
- Rejected alternative: back-filling `opening_date` from the first транзакція in the migration. It
  would freeze today's first date, and the data step would need hand-written SQL that
  database.md allows only when the schema cannot land without it. It can.
- Rejected alternative: writing the opening as a dated коригування. That changes the
  місячна картина (коригування are monthly numbers) and the transaction count, and breaks
  "the opening is not a транзакція".

### D2 — Entry semantics replace the unknown state

`valueAt` returns 0 before `entryDate`, and `opening + cumulative` from it. The `gap` reason
disappears from per-currency totals; `overflow` stays.

- The candidate dates start at `min(entryDate)` over all рахунки rather than the first транзакція,
  so an opening dated 2024-10-27 starts the history that day.
- Sub-month precision at the first date keeps today's `firstDateNet` mechanism. When the global
  first date is an opening date with no транзакція that day, the net is zero.
- `chartedHistory` / `chartedCombinedHistory` leading-trim stays harmless.

### D3 — Monthly розбивка from one more grouping of the same `MOVEMENTS`

Extend `MOVEMENTS` with `t.type` and a leg marker. Add one reading:
`monthlyMovementByType(): { accountId, month, kind, net }[]`, where `kind ∈ income | spending |
correction | transfer` and `spending` is expense + refund, both signed. The domain groups it by the
рахунок's currency.

- Per currency per month: `дохід`, `витрати`, `коригування`, `перекази й обмін`, and
  `нові рахунки` = Σ openings whose `entryDate` falls in the month.
- An identity test proves: Σ components = month-end − previous month-end. Previous month-end is 0
  before the first entry.
- The current month runs to today because the repository already bounds movements to
  `date <= today` for history.
- The existing per-account `monthlyNet` stays. It is the per-type reading summed, so either can be
  derived from the other. Both readings keep their bounded shape; the differential test against
  `computeBalance` is extended to the new reading.
- **«≈» розбивка**: each per-currency component is converted with `approximateUah`. The residual
  `≈Δ − Σ≈components` is added to `перекази й обмін`. It is bounded by one minor unit per currency
  per point, and it is exactly the line that already carries the FX difference.
- Rejected alternative: per-transaction reads in the UI. That would be unbounded on 50000 records.

### D4 — Зміна is point-to-point on the ledger basis

One numeric function, `changeOf(end, previous, entered)` in `src/domain/net-worth.ts`, returns
`{ absolute: end − previous − entered, percent }`; `monthFigures` applies it to every month, today's
against the preceding month-end included, and the «≈» reading applies it to its converted levels.
The old `netWorthChange`, which compared the current reading, is removed: nothing reads a change
any other way.

- `current` = today's history point, not `currentNetWorth`. The `valuation-substituted` and
  `future-records` reasons become unreachable, and the domain drops them.
- `no-baseline` stays for a first entry this month, or an overflow point.
- The same function serves the widget's change, each month of the screen and the «≈» variant.
  Its inputs are just two points and an `entered` sum.
- Investment difference: `Σ(contribution − ledger balance)` over contributions with
  `basis === 'currentValue'`, per currency. `currentNetWorth` already has both. The oldest `asOf`
  is named.

### D5 — Summary and forecast are pure functions over the monthly зміни

`periodSummary(months, period, today)` and `forecast(points, months, today)` live in
`src/domain/net-worth.ts`. They take the already-built monthly series of
`{ month, endValue, change, entered }`.

- **Integer arithmetic.** Median of an even count = mean of the middle two, rounded half away from
  zero. The band's hinges are the medians of the lower and upper halves, the middle value of an odd
  count in neither (Moore–McCabe, not Tukey). The current-month fraction is
  `daysLeft / daysInMonth`, applied as `roundHalfAway(pace × daysLeft / daysInMonth)`, so it is
  deterministic and needs no float accumulation over months. Month k ≥ 1 adds whole `pace` steps.
- **Why median over the last 6.** It is robust to one large purchase or a bonus, and it moves with
  a raise within half a year. That is the owner's "якщо стабільно дохід вище" case. A linear
  regression over the whole history was rejected: it lags a raise by years and is pulled around by
  outliers.
- **The band.** It uses up to the last 12 complete months for spread. More history would widen it
  with old regimes.
- **Withholding.** The forecast is withheld under 6 complete months, or if any of them is not
  `known`.
- **Complete month.** A calendar month ended before today that has a зміна; the history's first
  month has no preceding month-end, so it has no зміна and is never complete.

### D6 — One model, two views

`src/ui/net-worth.ts` gains `netWorthScreenModel({...input, selection, period, view, forecast,
selectedMonth})`, and `netWorthWidgetModel` is reduced to its compact fields. Both build on one
internal `netWorthSeries(...)`, which the screen's `useMemo` calls once per data reload. Changing
period, view or month re-slices it without a query.

- Default selection uses net-worth's new rule: «Усе ≈ грн» when more than one currency is held and
  every non-UAH rate is cached.
- The selection, period and view move from `index.tsx` state to one small in-memory store,
  `src/hooks/net-worth-selection.ts`, shared by Головний and the new route `src/app/net-worth.tsx`.
- The account explanation, the rate freshness and the withheld message move to the screen model.

### D7 — Geometry

`dashboard-charts.ts` gains:
- `barGeometry(series, {baseline: 'zero'})` for level and change bars. It includes zero in the
  scale, has a nonzero range for flat data, and handles negative bars.
- `monthTickLabels(months, maxLabels)` for regular label spacing that always includes the first
  and the current month.
- `forecastGeometry`, which shares the scale with the recorded series so the dashed line and band
  line up.

`MAX_PLOTTED_POINTS` (120) stays the ceiling. «Усе» on a 10-year history plots monthly points at
that limit, and the table still lists every month.

### D8 — Opening dates at their sources

- Saldo: `interpret.ts` collects `min(localDate)` per рахунок beside `openingContributions`, then
  takes `min` with the рахунок's first planned транзакція date. The plan carries
  `openingDate`, and its replacement on an existing рахунок, into the report and the committed
  write.
- In-app creation (`account-form`) defaults «станом на» to today. `createAccountAndLink` records
  the creation day (`today`, not `syncStartDate`). D1's `min` with the first imported транзакція
  then reaches back to the sync start by itself.
- Validation ("not after today") lives in the accounts repository update. A дата later than the
  first транзакція is accepted on purpose: a monobank-linked рахунок records today and then
  receives older транзакції, and D1's `min` already counts it from the earlier of the two.
- Backup: `openingDate` optional on each account, `BACKUP_FORMAT_VERSION` unchanged — an optional
  field, as every optional addition so far; `BACKUP_SCHEMA_VERSION` follows the new migration, so an
  older app already refuses the file. A file without dates restores with none.
- Merge (`account-merge-repo`): the kept рахунок takes the earlier of the two recorded дати, or
  none when neither has one.

## Risks / Trade-offs

- [The entry semantics show a step where a рахунок was simply not yet recorded, so the level
  before it understates the owner's real wealth] → The step is marked «нові рахунки», excluded
  from зміна, the summary and the forecast, and the owner can date the opening precisely. This is
  the owner's decision and Saldo's behaviour.
- [The headline (with поточна вартість) and today's point (вкладено) differ, which can puzzle] →
  The investment line states the difference beside the headline (net-worth, "The поточна вартість
  beyond вкладено is read on its own").
- [A forecast reads as a promise] → It is opt-in, off on every open, marked «≈ якщо темп
  збережеться», carries its темп and band, and never appears on Головний. The vision amendment
  limits it to this one reading.
- [«≈» history at today's rate distorts old months for a holder of foreign currency] → Already
  disclosed by the existing caption. Historical rates stay a non-goal.
- [Bars on 24+ months are thin on 360 dp] → The labels thin out, and selection works through the
  month table (48 dp rows). Bars are not the only target.

## Migration Plan

1. Archive `net-worth-total-history` first. Its smoke run (task 3.1/4.0) is still open, and these
   deltas modify its requirements.
2. New migration `opening_date` plus a test that an existing row reads `NULL`. It lands after the
   in-flight `installments` migration (0007), so it is 0008 and `BACKUP_SCHEMA_VERSION` follows.
3. Domain → repository reading → UI models → widget → screen, each behind its tests.
4. Rollback: the column is nullable and ignored by older code paths, and a v3 backup is refused by
   an older app as any newer format already is.

The owner's existing рахунки get correct history immediately through the first-транзакція
fallback. Exact Saldo dates arrive only through a re-import or by setting «станом на». On the
owner's data the difference is a few days for each of the late рахунки.
