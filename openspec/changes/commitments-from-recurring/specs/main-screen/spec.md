## ADDED Requirements

### Requirement: The month card states Вільно після зобов'язань beneath витрачено

WHEN the commitments capability derives «Вільно після зобов'язань» for the current month in a
currency, the month card SHALL show, beneath that currency's витрачено, one line «Вільно після
зобов'язань: <сума>» with exactly the сума Місяць shows for that currency, negative sign included —
the same reading, computed from the same платежі after the same linking, never a projection. It
SHALL NOT become the card's leading amount, SHALL NOT appear for a currency in which no платіж of
the current month is очікується or списання не знайдено, and SHALL NOT appear for a currency the
card shows no витрачено for. Tapping the card SHALL still open Місяць on the current month. No
currency SHALL be converted or added to another for it.

#### Scenario: Оренда still owed

- **WHEN** October 2026 is the current month, its UAH витрачено is 12 000,00 UAH, its UAH залишилось
  20 000,00 UAH, «Оренда» has an очікується платіж of 15 000,00 UAH and «iPhone» an очікується платіж
  of 500,00 UAH
- **THEN** the card leads with «Витрачено у жовтні» 12 000,00 UAH and shows «Вільно після
  зобов'язань: 4 500,00 UAH» beneath it, as Місяць does

#### Scenario: Nothing owed, no line

- **WHEN** every платіж of the current month is сплачено or пропущено, or no зобов'язання and no
  розстрочка exists
- **THEN** the card shows витрачено and no «Вільно після зобов'язань»

#### Scenario: A USD line of its own

- **WHEN** the current month has UAH and USD витрати, its USD залишилось is 500,00 USD, «ChatGPT» has
  an очікується платіж of 20,00 USD and nothing UAH is owed
- **THEN** the card shows «Вільно після зобов'язань: 480,00 USD» beneath the USD витрачено and none
  beneath the UAH витрачено

#### Scenario: Owed in USD with no USD витрачено

- **WHEN** the current month's USD group holds only a дохід of 500,00 USD, so the card shows no USD
  витрачено, and «ChatGPT» has an очікується платіж of 20,00 USD
- **THEN** Місяць shows «Вільно після зобов'язань» 480,00 USD in its USD group, and the card shows
  no USD line

#### Scenario: A debit that arrived counts once

- **WHEN** the платіж of «Оренда», 15 000,00 UAH, was linked to its витрата today
- **THEN** that витрата is inside витрачено and залишилось, and «Вільно після зобов'язань» no longer
  subtracts the платіж

#### Scenario: A negative reading keeps its sign

- **WHEN** the current month's UAH залишилось is −2 650,00 UAH before the first дохід and one платіж
  of 500,00 UAH is очікується
- **THEN** the card shows «Вільно після зобов'язань: −3 150,00 UAH»

#### Scenario: A hidden card shows nothing

- **WHEN** the owner has hidden «Витрачено цього місяця» in dashboard editing
- **THEN** Головний shows no «Вільно після зобов'язань»
