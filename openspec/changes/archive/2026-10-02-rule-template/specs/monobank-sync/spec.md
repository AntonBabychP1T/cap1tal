## MODIFIED Requirements

### Requirement: Statement items map deterministically to транзакції

The system SHALL map each statement item of a linked рахунок to at most one транзакція on it,
dated the item's date, carrying the item's description as its опис:

- An item with a negative amount SHALL become a витрата of the absolute amount in the
  рахунок's currency; its category SHALL be the owner's правила applied to the item's
  description and MCC — and, when no правило eligible there matches, the шаблон категоризації
  applied the same way — and «Без категорії» when neither matches. When the best matching
  правило is a правило-переказ, the item SHALL instead become a переказ from this рахунок to the
  правило's destination, carrying the absolute amount on both legs.
- An item with a positive amount SHALL become a дохід of that amount with the reserved джерело
  «Без джерела» — unless it is the зустрічний дохід of a переказ that awaits one, in which case it
  SHALL become no транзакція and that переказ SHALL await nothing. A дохід «Без джерела» is a
  starting state, never a verdict:
  an arriving повернення or cashback is retyped by the owner through витрата into повернення
  (the main-screen retype rules), because the glossary forbids a повернення to end up as
  income.
- An item on hold SHALL map exactly as a settled one — a hold is just a transaction.
- An item with a zero amount SHALL map to no транзакція.

An item that became no транзакція SHALL still count as imported, so it never imports later.

#### Scenario: A recognised merchant lands in its category

- **WHEN** the правило "сільпо → Groceries" exists and an item of amount −12550 with
  description "СІЛЬПО Київ" is mapped
- **THEN** the result is a витрата of 12550 minor units in category Groceries with опис
  "СІЛЬПО Київ"

#### Scenario: An unrecognised merchant is «Без категорії»

- **WHEN** no правило and no базова категорія matches an item of amount −8000 with description
  "НОВИЙ ЗАКЛАД"
- **THEN** the result is a витрата of 8000 minor units in «Без категорії», carrying the
  description as its опис

#### Scenario: A правило-переказ makes the item a переказ

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists and an item of amount −479
  with description "Округлення балансу «Резерв»" is mapped on the UAH рахунок platinum
- **THEN** the result is a переказ of 479 minor units UAH from platinum to РЕЗЕРВ with that опис,
  and no витрата

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
