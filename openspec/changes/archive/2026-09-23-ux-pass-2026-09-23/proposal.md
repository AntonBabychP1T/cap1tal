## Why

The owner has used the app for several weeks and handed over a real бекап (29 рахунків, 2541
транзакцій, 30 категорій, 22 правила, 24 months of history). Restored on the emulator and walked
screen by screen, it shows that the app answers both vision questions — where the money went and
how much is left — but makes the owner work for the answer: a real history turns several screens
into walls of chips and buttons, a few numbers spill out of the shapes drawn around them, and the
two things done every day — recording a транзакція and reading one — carry avoidable taps and
hard-to-read lines.

Nothing found is a wrong сума. Every finding is a place where the app draws something badly, hides
what the owner came for behind something they did not, or asks for a keystroke a tap could do.

What the pass found, by screen (light and dark theme, system font 100% and 130%):

**Головний**
1. The сума in the centre of «Топ категорій витрат» («68 682,49 UAH») is wider than the hole of the
   ring and is drawn across the ring itself; the spec asks for money "readable without digit
   truncation".
2. The legend beside that ring has no swatch, so no row can be matched to its sector.
3. «Статок» → «Показати точки» lists fifteen lines of «невідомо — недостатньо даних за цей період»
   one under another before the first number; the chart is 280 pt wide in a wider card and has no
   dates under it, so the known part reads as a broken scribble in its right third.
4. «Статок» → «Пояснення» writes «вкладено» after every рахунок, cards and cash included —
   «вкладено» is an інвестиційний рахунок's word only. The change line prints «+62.4%» with a
   decimal point where every other number in the app uses a comma.
5. Feed rows: the сума column is as tall as the whole row, so the second line («гаманець ·
   2026-09-23») wraps into two at 130% font and a переказ title is cut to «platinum ··6628 → ін…».
   Dates are ISO codes («2026-09-22») where the rest of the app already says «22 вересня».

**Нова транзакція / editing**
6. After «Записати», the confirmation «Записано: витрата 100,00 UAH — Кава.» is drawn *under* the
   button, below the fold on a 6.3" phone — the spec requires it "without scrolling".
7. The дата is a free-text field that opens the full letter keyboard; the owner types
   «2026-09-21» by hand. «Сьогодні», «вчора» or one day back are the common cases and cost ten
   keystrokes each.

**Рахунки**
8. «Усього грошей» wraps in the middle of a сума: «1 300,22» at the end of one line and «EUR» at the
   start of the next.
9. A рахунок's рухи print a переказ as «platinum → гам… → 100,00 UAH» — no sign, so the owner
   cannot tell whether money came in or went out of *this* рахунок; and every line repeats the
   рахунок's own name.
10. The «Звірити» form (label, field, hint, big button) sits permanently between the balance and
    the рухи, pushing the history the owner opened the screen for down by a third of the screen.

**Транзакції**
11. The рахунок filter is 30 wrapping chips, the місяць filter 24 more: the first транзакція is on
    the *third* screen of scrolling.

**Звіти / Прогрес**
12. «Одна категорія за місяцями» is a wall of 29 chips; the chart it controls is below the fold.
13. The history strip clips its leftmost month («ер 2026»).
14. «Цілі — Цілей поки немає.» is a dead end: nothing leads to where a ціль is created.
15. «Прогрес» spends a whole card on each of 17 earned досягнення. (Its виклик detail also stacks
    four headings with no space between them — noted, left for a later pass.)

**Налаштування**
16. «Категорії» opens on the *create* form with its 50-icon picker; the owner's 30 категорії start
    two screens down, each carrying two buttons («Перейменувати», «В архів»).
17. «Ліміти» gives each of 30 категорії its own «Встановити» button; «Правила» gives each of 22
    rules «Змінити» and «Видалити». The lists read as button grids.
18. Every switch (Налаштувати Головний, Нагадування, AI-аналіз, Репорти) draws Android's default
    teal thumb on the ochre track — the only teal in the app.

**Found while fixing the above, on the same device**
19. On Android 15+ (edge-to-edge) the window is no longer resized for the keyboard: a field low on
    a screen — a ліміт, the фактичний залишок, the сума of a транзакція — is typed into blind,
    under the keyboard, and the column cannot be scrolled to it.
20. The «Транзакції» рахунок row lists 29 рахунки alphabetically, so the ones in daily use are
    the last chips; an existing ліміт opens its editor empty; a правило's editor opened at the top
    of a 22-row list, off screen from the row that was tapped.

## What Changes

- **Money is never split or spilled.** The ring's centre сума is bounded by the hole and shrinks to
  fit it, the currency on its own line; the legend carries a swatch per sector. «Усього грошей»
  reads one currency per line, like «Статок».
- **A транзакція line reads at a glance.** One shared line layout for Головний, Транзакції, рухи
  and a категорія's month: the сума beside the title only, the second line and the опис using the
  full width, the дата as a day («сьогодні», «вчора», «21 вересня», «21 вересня 2025»). In a
  рахунок's рухи a переказ is signed from that рахунок's side and names the other рахунок, and the
  рахунок's own name is not repeated.
- **Recording asks less.** The confirmation stands directly above «Записати». The дата gets
  «Сьогодні», «Вчора» and a one-day step either way, and typing it offers digits, not letters.
- **Lists lead with the list.** Транзакції's filters are one horizontal row each. Звіти's category
  chooser is one horizontal row. Категорії/Джерела open on the list with «Нова категорія»
  behind a button, and a row opens its own editor. Ліміти and Правила rows open their editor on
  tap; no row carries a button grid. «Звірити» on a рахунок opens on tap.
- **Статок says only true things.** «вкладено» only on an інвестиційний рахунок; a percentage with a
  comma; consecutive unknown points read as one dated range; the chart spans the card with its
  first and last dates under it.
- **The keyboard never hides the field being typed into.** Every screen's column gives up the
  keyboard's height.
- **Small consistency fixes.** Switches in the theme's tones; the history strip never opens on a
  half-drawn month; an empty «Цілі» on Звіти leads to creating one; «Прогрес» lists earned
  досягнення as compact rows.

Non-goals: no new data, no migration, no new dependency or native module, no change to any сума,
rule, limit or computation, no new filter dimension (e.g. by категорія) on Транзакції, no merging of
категорії, no new chart kinds. Nothing from vision §14 is touched.

Vision mapping: items 1–5, 8, 11–13 serve "where did my money go" (reading); 3–4, 8, 14 serve "how
much is left / how much do I have"; 6–7, 9–10, 16–17 remove friction from keeping the record
complete, which both answers depend on (vision §15).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `app-shell`: a transaction line's дата reads as a day; a сума is never split across lines; a
  switch wears the theme's tones; a field being typed into is never under the keyboard.
- `main-screen`: the ring's centre сума fits its hole and the legend carries swatches; a line's сума
  sits beside its title only; the recording confirmation stands above «Записати»; the дата is set
  with quick choices and a digit keyboard; Статок's explanation names «вкладено» only for
  інвестиційні рахунки, collapses runs of unknown points and dates its chart.
- `accounts-screen`: рухи sign a переказ from the рахунок's side and do not repeat its name;
  «Звірити» opens on request; «Усього грошей» reads one currency per line.
- `transaction-search`: the filters take one row each, so the list starts on the first screen.
- `reports-screen`: the category chooser is one row; the history strip never opens on a clipped
  month; an empty цілі group leads to creating a ціль.
- `progress-screen`: earned досягнення are compact rows.
- `settings-screen`: Категорії/Джерела lead with the list and edit a row from the row; Ліміти and
  Правила rows open their editor on tap.

## Impact

- Screens: `src/app/(tabs)/index.tsx`, `accounts.tsx`, `reports.tsx`; `src/app/transactions.tsx`,
  `account/[id].tsx`, `category/[month]/[categoryId].tsx`, `transaction/new.tsx`,
  `transaction/[id].tsx`, `progress.tsx`, `challenge/[key].tsx`, `manage/limits.tsx`,
  `manage/rules.tsx`, and every screen with a `Switch`.
- Components: `category-widget.tsx`, `net-worth-widget.tsx`, `manage-list.tsx`, `form.tsx`
  (date field), a new shared transaction-line row in `src/components/`.
- Pure modules under `verify`: `src/ui/transaction-line.ts` (day labels, account-side переказ),
  `src/ui/net-worth.ts` (basis, percent, collapsed points), `src/ui/dates.ts` (day label, day step),
  `src/ui/account-totals.ts` or its caller (per-currency lines).
- No schema, migration, backup format, dependency, permission or native change.
- In-flight `category-icons-and-transaction-visuals` touches `transaction-line.ts` and
  `manage-list.tsx`; this change keeps its icon fields and icon picker intact and only moves where
  they are drawn.
