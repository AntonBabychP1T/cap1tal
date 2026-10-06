## MODIFIED Requirements

### Requirement: The screen offers the kind, the period and the details

The AI-аналіз screen SHALL offer the kind of AI-аналіз — «Місячна картина» in this change — and
a period: «Цей місяць», «Останні 3 місяці», «Останні 6 місяців», «Останні 12 місяців», or a
custom range of whole calendar months from one month to another. A month of that range that is
not yet a whole calendar month — the owner is still typing it — SHALL be answered with how a month
is written, never with an exception. It SHALL offer two detail
choices, «Продавці» (the описи of транзакції — the bank's text, including what a confirmed
чернетка carried — and the назви the owner gave their продавці) and «Окремі транзакції», both off when the screen
opens and never remembered between openings. It SHALL state that agregates — the monthly
picture, категорії, тренди, ліміти and цілі — are always included. Changing any choice SHALL
hand nothing to any app.

#### Scenario: The defaults are the least that leaves the phone

- **WHEN** the owner opens the AI-аналіз screen
- **THEN** «Місячна картина» is chosen, «Останні 3 місяці» is chosen, «Продавці» and «Окремі
  транзакції» are both off, and the preview already shows what those defaults would hand over —
  built in memory, with nothing written and nothing handed to any app

#### Scenario: A custom range is whole months

- **WHEN** the owner chooses a custom range from 2026-01 to 2026-06
- **THEN** the period is January through June 2026, six whole calendar months

#### Scenario: A custom range that ends before it starts is refused

- **WHEN** the owner chooses a custom range from 2026-06 to 2026-01
- **THEN** it is refused as a range that ends before it starts, «Поділитися з AI» is not offered,
  and nothing is built

#### Scenario: A half-typed month is a sentence, not an exception

- **WHEN** the owner is still typing a month of a custom range and it is not yet a whole one —
  «2026-0» on the way to «2026-08»
- **THEN** the screen says how a month is written, offers no «Поділитися з AI», builds nothing,
  and shows no exception; the preview returns as soon as both months are whole again

#### Scenario: «Продавці» says the owner's назви go too

- **WHEN** the owner reads the «Продавці» choice
- **THEN** it says it carries the описи as the bank sent them and the назви the owner gave their
  продавці

#### Scenario: Details are not remembered

- **WHEN** the owner turns «Продавці» on, leaves the screen and opens it again
- **THEN** «Продавці» is off
