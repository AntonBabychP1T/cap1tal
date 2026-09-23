## ADDED Requirements

### Requirement: A транзакція's дата reads as a day

Wherever a line of транзакції shows a дата — the latest-transactions feed, «Транзакції», a
рахунок's рухи and a категорія's month — the дата SHALL read as a day in Ukrainian rather than as
a date code: «сьогодні» for today, «вчора» for the day before, otherwise the day and the month in
the genitive, with the year added only when it is not the current year. What is today SHALL be
decided by the device's local calendar day.

#### Scenario: Today and yesterday are named

- **WHEN** today is 2026-09-23 and the feed holds a витрата dated 2026-09-23 and a дохід dated
  2026-09-22
- **THEN** their lines read «сьогодні» and «вчора» where the дата is shown

#### Scenario: This year's day carries no year

- **WHEN** today is 2026-09-23 and a line's транзакція is dated 2026-09-21
- **THEN** its дата reads «21 вересня»

#### Scenario: Another year's day carries its year

- **WHEN** today is 2026-09-23 and a line's транзакція is dated 2025-08-11
- **THEN** its дата reads «11 серпня 2025»

### Requirement: A сума is never split across two lines

Wherever a сума is drawn with its currency, the number and its currency code SHALL stay on one
line; when several currencies are read together and do not fit one line, each currency's сума
SHALL take its own line whole rather than break between a number and its code. A screen whose own
requirement puts one currency per line (such as «Усього грошей») does so whether or not they fit.

#### Scenario: Three currencies of a total

- **WHEN** a total reads 187 449,16 UAH, 1 300,22 EUR and 3 353,52 USD on a phone too narrow for
  all three on one line
- **THEN** each of the three is drawn whole on its own line and no line starts with a bare
  currency code

### Requirement: A switch is drawn in the app's own tones

Every on/off switch the app draws SHALL use the app's own palette in both themes: the accent for
the switched-on state and a neutral tone of the theme for the switched-off state. No switch SHALL
carry a colour the rest of the app does not use.

#### Scenario: A switched-on widget in «Налаштувати Головний»

- **WHEN** the owner opens «Налаштувати Головний» with «Статок» shown
- **THEN** its switch is drawn in the accent, in the light and in the dark theme, with no other hue

### Requirement: A field being typed into is never under the keyboard

WHILE the device's keyboard is open over a screen, the field being typed into SHALL be drawn
above the keyboard, and the rest of the screen SHALL remain reachable by scrolling. This SHALL
hold on Android versions that no longer resize the window for the keyboard.

#### Scenario: A ліміт typed near the bottom of a long list

- **WHEN** the owner opens the ліміт editor of a категорія low on «Ліміти» and the keyboard opens
- **THEN** the «Ліміт на місяць» field is visible above the keyboard while the owner types
