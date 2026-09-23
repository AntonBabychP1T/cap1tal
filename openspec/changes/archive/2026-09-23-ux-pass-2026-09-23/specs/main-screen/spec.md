## ADDED Requirements

### Requirement: The ring's total stays inside the ring

The сума in the centre of «Топ категорій витрат» SHALL be drawn wholly inside the ring's hole,
never across the ring or past it: the number SHALL shrink as far as it must to fit, with its
currency on a line of its own under it. While the ring draws proportional sectors, each legend row
SHALL carry a swatch in the tone of its sector, so a row and its sector can be matched without
counting; the swatch SHALL NOT be the only thing that names the category — the row's name and exact
сума stay beside it. While the ring is the neutral ring of a signed or empty breakdown, which draws
no sectors, the legend SHALL carry no swatch, so no row claims a share.

#### Scenario: A six-digit month fits

- **WHEN** the month's UAH витрачено across categories is 68 682,49 UAH
- **THEN** «68 682,49» is drawn inside the hole of the ring with «UAH» under it, and no digit
  overlaps the ring

#### Scenario: Legend rows match their sectors

- **WHEN** the ring shows five categories and «Ще 14»
- **THEN** every legend row, «Ще 14» included, carries a swatch in its own sector's tone

#### Scenario: A negative category draws no swatch

- **WHEN** a category's повернення exceed its витрати this month and the ring is neutral
- **THEN** its legend rows show names and signed сумі and no swatch

### Requirement: A transaction line keeps its сума beside its title

On every line of транзакції — the feed, «Транзакції», a рахунок's рухи and a категорія's month —
the сума SHALL stand beside the line's first row (its title) only; the line's second row and its
опис SHALL use the whole width under the title. The title of a переказ SHALL be allowed a second
row rather than cut both рахунки's names to a few letters.

#### Scenario: Large text keeps the second row on one line

- **WHEN** the system font is at 130% and a витрата on «гаманець» reads «Кава» with its дата
- **THEN** «гаманець · сьогодні» reads on one row under the title and is not wrapped by the сума's
  column

#### Scenario: A переказ names both рахунки

- **WHEN** a переказ goes from «platinum ··6628» to «інжур»
- **THEN** its line shows «platinum ··6628 → інжур» whole, over up to two rows

### Requirement: The recording confirmation stands above «Записати»

WHEN a транзакція is stored from the entry form, its confirmation SHALL be drawn directly above
«Записати», the control the owner just pressed, so it is on screen without scrolling wherever the
form was scrolled to.

#### Scenario: The confirmation is seen where the button is

- **WHEN** the owner scrolls the entry form to «Записати» and records a витрата of "100" in Кава
- **THEN** «Записано: витрата 100,00 UAH — Кава.» is visible directly above «Записати» without
  any further scrolling

### Requirement: The дата of a транзакція is set without typing a date code

The entry form and transaction editing SHALL offer, beside the дата, «Сьогодні» and «Вчора», each
setting the дата in one tap. While the typed дата is a real date, they SHALL also offer a step of
one day back and — only while that дата is before today — one day forward, so no tap sets a
future дата; while it is not a date, only «Сьогодні» and «Вчора» SHALL be offered. The дата SHALL
be named as a day beside its label, and typing it SHALL offer the device's digit keyboard. Choices
SHALL only change the дата field; nothing is stored until «Записати» or «Зберегти».

#### Scenario: Yesterday in one tap

- **WHEN** today is 2026-09-23 and the owner taps «Вчора» on the entry form
- **THEN** the дата becomes 2026-09-22 and the form names it «вчора»

#### Scenario: A day back from the дата shown

- **WHEN** the дата is 2026-09-01 and the owner taps the one-day-back step
- **THEN** the дата becomes 2026-08-31

#### Scenario: Stepping stops at today

- **WHEN** the дата is today
- **THEN** no one-day-forward step is offered

#### Scenario: A half-typed дата offers only the two quick choices

- **WHEN** the owner has typed "2026-09" into the дата
- **THEN** only «Сьогодні» and «Вчора» are offered and no day is named beside the label

### Requirement: Статок's explanation and history say only what holds

In Статок's account explanation, «вкладено» SHALL be written only beside an інвестиційний рахунок
counted at its вкладено, and an інвестиційний рахунок counted at its поточна вартість SHALL keep
«поточна вартість на <date>»; every рахунок of another вид SHALL show its сума with no basis word. A
percentage in the change line SHALL use a decimal comma. In the list of history points, a run of
consecutive points with no known value for the same reason SHALL read as one line naming the first
and last date of the run and the reason, instead of one line per point. The history chart SHALL
span the card's width and name the first and the last date it covers under it.

#### Scenario: A card is not «вкладено»

- **WHEN** the explanation lists «mono black» (витратний), «інжур» (інвестиційний, no поточна
  вартість) and «облігація $» (інвестиційний, поточна вартість on 2026-09-21)
- **THEN** «mono black» shows its сума alone, «інжур» shows its сума with «вкладено», and
  «облігація $» shows its сума with «поточна вартість на 21 вересня»

#### Scenario: The percent reads as Ukrainian

- **WHEN** Статок grew by 72 028,07 UAH, 62,4 %, since 31 August
- **THEN** the change line reads «+72 028,07 UAH · +62,4% · від 31 серпня»

#### Scenario: Fifteen unknown month-ends read as one line

- **WHEN** the UAH history is unknown from 28 жовтня 2024 to 31 січня 2026 for lack of data and
  known afterwards
- **THEN** the point list opens with one line «28 жовтня 2024 — 31 січня: невідомо — недостатньо
  даних за цей період» followed by the known points one per line

#### Scenario: The chart names its span

- **WHEN** the UAH history runs from 28 жовтня 2024 to 23 вересня 2026
- **THEN** the chart spans the card's width and reads «28 жовтня 2024» under its left end and
  «23 вересня» under its right end
