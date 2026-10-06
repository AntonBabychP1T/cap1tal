## MODIFIED Requirements

### Requirement: The screen offers the kind, the period and the details

The AI-аналіз screen SHALL offer the kind of AI-аналіз — «Місячна картина» in this change — and
a period: «Цей місяць», «Останні 3 місяці», «Останні 6 місяців», «Останні 12 місяців», or a
custom range of whole calendar months from one month to another, each end set by stepping a місяць
back or forward and read as a місяць in words, as the app-shell capability requires. No end can be a
month after the current one. It SHALL offer two detail
choices, «Продавці» (the описи of транзакції — the bank's text, including what a confirmed
чернетка carried — and the назви the owner gave their продавці) and «Окремі транзакції», both off when the screen
opens and never remembered between openings. It SHALL state that agregates — the monthly
picture, категорії, тренди, ліміти and цілі — are always included. Changing any choice SHALL
hand nothing to any app.

WHEN the screen is opened for one given month — from that month's підсумок — the period SHALL be
the custom range from that month to that same month. Every other choice SHALL be at its default
as on any opening, and the owner SHALL be able to change the period like any other choice. A
given month that is not a whole calendar month SHALL leave the period at its default rather than
fail.

#### Scenario: The defaults are the least that leaves the phone

- **WHEN** the owner opens the AI-аналіз screen from «Звіти»
- **THEN** «Місячна картина» is chosen, «Останні 3 місяці» is chosen, «Продавці» and «Окремі
  транзакції» are both off, and the preview already shows what those defaults would hand over —
  built in memory, with nothing written and nothing handed to any app

#### Scenario: Opened for one month

- **WHEN** the owner opens the AI-аналіз screen from the підсумок of September 2026
- **THEN** the period is the custom range вересень 2026 — вересень 2026, «Продавці» and «Окремі транзакції»
  are off, the preview shows that one month's пакет, the one-month warning of a short period is
  shown, and nothing has been handed to any app

#### Scenario: A malformed given month falls back to the default period

- **WHEN** the screen is opened for the given month «2026-13»
- **THEN** «Останні 3 місяці» is chosen and no exception is shown

#### Scenario: A custom range is whole months

- **WHEN** the owner sets a custom range from січень 2026 to червень 2026
- **THEN** the period is January through June 2026, six whole calendar months

#### Scenario: A custom range that ends before it starts is refused

- **WHEN** the owner sets a custom range from червень 2026 to січень 2026
- **THEN** it is refused as a range that ends before it starts, «Поділитися з AI» is not offered,
  and nothing is built

#### Scenario: A half-typed month is a sentence, not an exception

- **WHEN** the owner steps either end of a custom range back and forward several times — stepping
  replaced typing, so a month can no longer be half-typed
- **THEN** each end reads as a whole місяць in words at every step, no sentence about how a month is
  written appears, no exception is shown, and the preview follows each step

#### Scenario: A range end cannot step past this month

- **WHEN** «До» reads жовтень 2026, the current month, and the owner steps it forward
- **THEN** it stays жовтень 2026

#### Scenario: «Продавці» says the owner's назви go too

- **WHEN** the owner reads the «Продавці» choice
- **THEN** it says it carries the описи as the bank sent them and the назви the owner gave their
  продавці

#### Scenario: Details are not remembered

- **WHEN** the owner turns «Продавці» on, leaves the screen and opens it again
- **THEN** «Продавці» is off
