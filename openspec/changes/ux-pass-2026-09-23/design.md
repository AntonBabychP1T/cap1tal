## Context

See proposal.md for the eighteen findings. They were found on the emulator with the owner's real
бекап (`cap1tal-2026-09-23.json`) restored through «Бекап», in the light and the dark theme and at
100% and 130% system font. Screenshots are in `.cache/android/qa/` (gitignored).

Constraints that shape every decision below:

- `verify` runs no JSX. Every *decision* (what a line says, which sign a переказ carries, what a
  collapsed range reads, which day a step lands on) goes into a pure module under `src/ui/` with a
  test; screens only draw. Where the only thing to prove is *where* something is drawn, a
  source-reading test pins it, as `qa-sweep-2026-09` did (`src/ui/screens.test.ts` style).
- No new dependency. A native date picker exists in the installed `@expo/ui`, but it is a native
  surface with an iOS twin to keep in step, and the common cases are «today», «yesterday» and «a
  day or two back» — three taps a pure-JS control covers.
- The in-flight `category-icons-and-transaction-visuals` change owns `icon`/`iconTone`/`amountTone`
  on `TransactionLine` and the icon picker in `manage-list.tsx`. This change keeps both and only
  moves where they are drawn.

## Goals / Non-Goals

**Goals:** every finding in the proposal fixed on the device, each behind a spec scenario; one
shared transaction row so the four lists cannot drift again.

**Non-Goals:** new filters, category merging, a native date picker, chart redesign beyond the two
defects named, any change to a сума or a computation.

## Decisions

### D1. One transaction row component

`src/components/transaction-row.tsx` draws: icon tile · a column holding [title row: mark, title
(flex, 1 line; 2 for a переказ), сума] · subtitle (full width of the column) · опис (full width).
Callers keep what is theirs (the one-tap categorisation under a line on Головний and
«Транзакції»). The row takes already-decided strings — `title`, `subtitle`, `amount`, tones — so it
holds no rule.

Alternative: patch the four copies. Rejected: the four copies are how the сума column ended up
full-height in all of them.

### D2. Day labels are one function

`dayLabel(date, now)` in `src/ui/dates.ts`: «сьогодні», «вчора», else `calendarLabel`. Local
calendar parts, as `momentLabel` already does. `feedSubtitle(line, now)` gains the `now` argument;
all four screens pass the same `new Date()` they render with.

### D3. The рахунок's side of a line

`accountSideLine(t, line, accountId, accountsById)` in `src/ui/transaction-line.ts` returns
`{ title, subtitle, amount, amountTone }` for a line shown inside one рахунок's рухи:

| транзакція | title | amount |
|---|---|---|
| переказ, this рахунок is `from` | «на <to>» | «−» + `left` |
| переказ, this рахунок is `to` | «з <from>» | «+» + `arrived` |
| витрата / повернення / дохід | as the feed | as the feed |
| коригування | «Коригування» | its signed сума |

The subtitle drops the account name: `<day>` alone, or `<тип> · <day>` for a переказ, повернення
and коригування. A переказ «+» keeps the neutral text tone — it is money in for this рахунок, not
дохід, and the green belongs to дохід.

### D4. Date field

`DateField` in `src/components/form.tsx`: the existing ruled `Field` (`keyboardType`
`numbers-and-punctuation`, so the hyphen is on the pad), its overline reading «Дата · вчора» when
the typed value parses, and a row of small chips: «Сьогодні», «Вчора», «‹ день», «день ›». The
forward step is absent when the дата is today or later. Pure pieces in `src/ui/dates.ts`:
`shiftIsoDate(iso, days)` (local-calendar arithmetic, month and year boundaries) and
`dateStepOffers(value, now)` → which of the four are offered and what each sets. Used by
`transaction/new.tsx` and `transaction/[id].tsx`.

### D5. Confirmation position

`transaction/new.tsx` draws the confirmation immediately before `<Action title="Записати">`. A
source assertion in `src/ui/entry-form.test.ts` pins the order (confirmation JSX index < button
index).

### D6. Donut centre

The centre overlay gets a fixed width of `2 × INNER_RADIUS − 2 × Spacing.two` and draws two texts:
the number (`hero` type, `numberOfLines={1}` + `adjustsFontSizeToFit`, which only works with a
bounded width — the missing bound is the bug) and the currency code (`caption`). The split comes
from `splitMoney(money)` in `src/ui/amount-input.ts` so the number format stays `formatMoney`'s.
Legend rows get a 10 pt swatch at the sector's opacity; the opacity list moves to
`src/ui/home-categories.ts` (`sectorOpacity(index)`) so ring and legend read the same one.

### D7. Статок

In `src/ui/net-worth.ts`: `accountBasisLines` takes the рахунки's kinds and returns `basis: ''`
for any non-investment рахунок (an investment keeps «вкладено» or «поточна вартість на <date>»; the widget draws no basis
text when empty);
`changeLabel` formats the percent with a comma; `historyPointRows(points, currency, now)` returns
rows where a run of consecutive unknown points with the same reason is one row «<first> — <last>:
<reason>». The widget measures its card width (`onLayout`) for the chart and puts the first and
last point dates under it.

### D8. Filters and chooser rows

`Choices` gets an optional `scroll` prop: one horizontal `ScrollView` row of the same chips, which
on mount scrolls the picked chip into view. «Транзакції» uses it for рахунок, категорія, місяць
and puts the search on the `SearchBar` it already has on other screens rather than a ruled field
with an overline. «Звіти» uses it for the category chooser.

### D9. Management lists

- `manage-list.tsx`: the create card is replaced by an `Action` «Нова категорія»/«Нове джерело»
  that opens the same form (name + icon picker) in place with «Додати» / «Скасувати»; rows become
  `Pressable` and tapping one opens the existing inline editor, which gains «В архів» / «З архіву».
  A reserved row stays non-pressable with its sentence. The hardware back closes an open form or
  editor first (`useCloseOnBack`, as Ліміти already does).
- `limits.tsx`, `rules.tsx`: the row is the tap target that opens the existing editor; the
  «Встановити»/«Змінити»/«Видалити» buttons move into the editor (rules: «Видалити» with its
  existing confirmation). Rows show a chevron.

### D10. Smaller fixes

- Switches: a `ThemedSwitch` in `src/components/form.tsx` with `trackColor` and `thumbColor` from
  the theme (on: `accentSurface` track, `accent` thumb — `onAccent` is near-black on the dark
  theme and vanished; off: `backgroundSelected` track, `textMuted` thumb); every `Switch` in `src/app` uses it. `screens.test.ts`'s existing `<Switch` assertion is
  updated to the component.
- «Усього грошей»: per-currency lines in `src/app/(tabs)/accounts.tsx`, one `ThemedText` each.
- Month strip: after computing the offset that brings the marked column in, snap it to the start
  of the first column at or after it, so the leftmost visible column is whole.
- Звіти цілі empty state: «Створити ціль ›» → `/manage/goals`.
- Прогрес: earned and in-progress досягнення become rows of one `ListCard` each — a local
  `ProgressRow` (name, line under it, chevron) rather than `IconRow`, which requires a glyph and
  досягнення have none.

## Risks / Trade-offs

- [The row component changes four screens at once] → the smoke pass walks all four; the pure
  line functions keep their tests.
- [Changing `feedSubtitle`'s signature] → typecheck finds every caller; tests are updated to the
  new day wording, which is the spec change itself.
- [`adjustsFontSizeToFit` on Android shrinks only with a bounded width and `numberOfLines`] → both
  are set; verified on the emulator at 130% font.
- [In-flight `category-icons-and-transaction-visuals`] → no field of `TransactionLine` is removed
  or renamed; its unticked tasks still apply to the same code.

## Migration Plan

None: no stored data, schema or format changes. Rollback is a revert of the commit.
