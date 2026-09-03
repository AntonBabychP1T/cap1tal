## ADDED Requirements

### Requirement: The опис of a Saldo row travels onto the транзакції built from it

Every транзакція the import builds SHALL carry, as its опис, the description the Saldo export
wrote on the row it was built from, with surrounding whitespace removed. A row whose description
is empty SHALL produce транзакції with no опис rather than an empty one. This SHALL hold for every
shape the import builds: витрата, повернення, дохід, коригування, a переказ between two рахунки, a
переказ built from an in-transit departure and its arrival, the комісія split off such a переказ,
and a переказ onto or off the рахунок-борг.

The опис SHALL be carried and nothing more: it SHALL NOT decide a категорія, a джерело, a вид, a
merge or a сума, and it SHALL NOT appear anywhere in the звірка's arithmetic.

#### Scenario: A витрата keeps the merchant the export named

- **WHEN** the export holds a витрата row whose description is «СІЛЬПО»
- **THEN** the витрата built from it carries the опис «СІЛЬПО»

#### Scenario: An in-transit pair takes the departure's опис

- **WHEN** an in-transit departure described «Переказ на картку» is matched with its arrival
- **THEN** the переказ built from the pair carries the опис «Переказ на картку», and the комісія
  split off it carries the same опис

#### Scenario: An empty description leaves no опис

- **WHEN** the export holds a витрата row whose description column is empty or blank
- **THEN** the витрата built from it carries no опис at all

#### Scenario: A повернення carries the опис of the row it reverses

- **WHEN** the export holds a row crediting a категорія back onto a рахунок, described
  «Повернення за куртку»
- **THEN** the повернення built from it carries the опис «Повернення за куртку», and it is still a
  повернення in that категорія and not a дохід

#### Scenario: Both plain shapes of переказ carry theirs

- **WHEN** the export holds a move between two рахунки described «На готівку» and a «Борг» row
  described «борг яріку»
- **THEN** the переказ between the two рахунки carries «На готівку» and the переказ onto
  «Борги» carries «борг яріку»

#### Scenario: A коригування and a дохід carry theirs too

- **WHEN** the export holds a balance-correction row described «Звірка» and an income row
  described «Зарплата»
- **THEN** the коригування carries the опис «Звірка» and the дохід carries the опис «Зарплата»
