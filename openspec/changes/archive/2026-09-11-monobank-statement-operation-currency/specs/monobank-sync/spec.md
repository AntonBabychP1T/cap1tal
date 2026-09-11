## REMOVED Requirements

### Requirement: Statement parsing yields items whole or fails whole

**Reason**: The requirement rested on a fact that is not true. It read "Every row states the
currency of the account it belongs to", and made a row stating any other currency unreadable —
but a statement row's currency field names the currency of the транзакція the bank carried out,
not of the рахунок, whatever the API's own description of that field says. Measured on the owner's
`platinum ··6628` (UAH) on 2026-09-11: of 66 rows in fourteen days, 64 named UAH and two named USD,
with those two rows' amount over their operation amount at 44.83 and 44.63 — the hryvnia-to-dollar
rate — and their running balance inside the range the hryvnia rows trace. The amount was therefore
already in hryvnia and the rows were this рахунок's own. Because the rule failed the whole window
and the cause was deterministic, the рахунок never advanced past 3 вересня and never could.

**Migration**: Replaced by «A statement payload is read whole or not at all», which keeps every
other rule of this one unchanged — the fields an item holds, the amount as integer minor units of
the рахунок's currency, whole-or-nothing on a row the parser cannot read, and no original-currency
amount — and only stops treating the currency a row names as a claim about the
рахунок. Nothing already imported changes; рахунки stopped by this rule resume from the cursor they
were stuck at, so the windows they could not read are read.

## ADDED Requirements

### Requirement: A statement payload is read whole or not at all

The system SHALL parse a statement payload into items, each holding the bank's item id, the
moment the bank carried the item out, the calendar date of that moment in the device's timezone, the
description, the MCC, the signed amount as integer minor units of the account's currency, and the
hold flag. A payload holding any row the parser cannot read SHALL yield the unavailable outcome
and no items — a window is imported whole or not at all, so no транзакція is ever silently
dropped.

The currency a row names SHALL NOT be read as a claim about the рахунок, and SHALL NOT make the
row unreadable — neither when it is a currency a рахунок may be opened in, nor when it is one the
app does not offer, nor when the row names none at all. What identifies the рахунок a statement
belongs to is the account the request named, never a field inside the answer. The amount SHALL be
read as minor units of the рахунок's currency whatever the row names, that being the currency the
bank states the amount in and the сума it charged.

An item SHALL carry no original-currency amount. The statement does name that сума and the
currency it is in, so this is a deferral and not a refusal: what the bank charged the рахунок is
the one сума kept until reading the other one is built.

#### Scenario: A statement item parses whole

- **WHEN** a statement payload holds an item with id "a1", time in the device's August 26th,
  description "СІЛЬПО", MCC 5411, amount −12550 and hold false
- **THEN** parsing yields one item with id "a1", date 2026-08-26, description "СІЛЬПО",
  MCC 5411, amount −12550 minor units and hold false

#### Scenario: A foreign purchase is the сума the bank charged, and nothing more

- **WHEN** a UAH account's statement item holds amount −420000 with an operation amount of −10000
  and names USD as the currency that second сума is in
- **THEN** the parsed item holds amount −420000 minor units UAH and no original-currency amount

#### Scenario: A row naming another currency does not fail the window

- **WHEN** a statement being parsed for a UAH рахунок holds two rows naming UAH and one row naming
  USD, every row otherwise well-formed
- **THEN** parsing yields all three items, each with its amount in minor units UAH

#### Scenario: A row naming a currency the app does not offer still parses

- **WHEN** a row of a statement being parsed for a UAH рахунок names a currency no рахунок can be
  opened in
- **THEN** parsing yields that item too, with its amount in minor units UAH

#### Scenario: A row naming no currency at all still parses

- **WHEN** a row of a statement being parsed for a UAH рахунок carries no currency field, or one
  that is not a number, every other field well-formed
- **THEN** parsing yields that item too, with its amount in minor units UAH

#### Scenario: A hryvnia row on a foreign-currency рахунок parses

- **WHEN** a statement being parsed for a USD рахунок holds a row naming UAH, otherwise well-formed
- **THEN** parsing yields that item with its amount in minor units USD

#### Scenario: One unreadable row fails the whole answer

- **WHEN** a statement payload holds two well-formed items and one item without an id
- **THEN** the outcome is unavailable and no items are yielded

## MODIFIED Requirements

### Requirement: Statement items map deterministically to транзакції

The system SHALL map each statement item of a linked рахунок to exactly one транзакція on it,
dated the item's date, carrying the item's description as its опис:

- An item with a negative amount SHALL become a витрата of the absolute amount in the
  рахунок's currency; its category SHALL be the owner's правила applied to the item's
  description and MCC, and «Без категорії» when no правило matches.
- An item with a positive amount SHALL become a дохід of that amount with the reserved джерело
  «Без джерела». A дохід «Без джерела» is a starting state, never a verdict:
  an arriving повернення or cashback is retyped by the owner through витрата into повернення
  (the main-screen retype rules), because the glossary forbids a повернення to end up as
  income.
- An item on hold SHALL map exactly as a settled one — a hold is just a transaction.
- An item with a zero amount SHALL map to no транзакція.

#### Scenario: A recognised merchant lands in its category

- **WHEN** the правило "сільпо → Groceries" exists and an item of amount −12550 with
  description "СІЛЬПО Київ" is mapped
- **THEN** the result is a витрата of 12550 minor units in category Groceries with опис
  "СІЛЬПО Київ"

#### Scenario: An unrecognised merchant is «Без категорії»

- **WHEN** no правило matches an item of amount −8000 with description "НОВИЙ ЗАКЛАД"
- **THEN** the result is a витрата of 8000 minor units in «Без категорії», carrying the
  description as its опис

#### Scenario: Arriving money is a дохід «Без джерела»

- **WHEN** an item of amount +5000000 with description "Зарахування зарплати" is mapped
- **THEN** the result is a дохід of 5000000 minor units with the reserved джерело
  «Без джерела» and that опис

#### Scenario: A foreign purchase is a витрата of what the bank charged

- **WHEN** a UAH card's item of amount −420000 for a purchase made abroad is mapped
- **THEN** the result is a витрата of 420000 minor units UAH, carrying no original-currency
  amount — the sync does not read the one the statement names

#### Scenario: A hold maps like anything else

- **WHEN** an item of amount −30000 marked hold is mapped
- **THEN** the result is a витрата of 30000 minor units — nothing about it says hold

#### Scenario: A zero amount maps to nothing

- **WHEN** an item of amount 0 is mapped
- **THEN** no транзакція results
