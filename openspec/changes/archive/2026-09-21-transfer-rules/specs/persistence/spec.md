## ADDED Requirements

### Requirement: A правило-переказ and an awaiting переказ survive a restart

A stored правило SHALL come back after storage is closed and reopened with exactly one target — its
category, or its destination рахунок — as stored. A stored переказ SHALL come back saying whether it
awaits its зустрічний дохід, as stored. Storage SHALL refuse a правило naming both a category and a
destination рахунок, or neither. A транзакція stored as anything other than a переказ SHALL read
back awaiting nothing — including a переказ that awaited and has since been retyped into another
type — and removing a транзакція SHALL remove whatever it awaited with it.

#### Scenario: A правило-переказ round-trips

- **WHEN** a rule with merchant pattern "округлення балансу" and destination рахунок РЕЗЕРВ is stored
  and storage is closed and reopened
- **THEN** it is read back with the same pattern, the destination РЕЗЕРВ and no category

#### Scenario: An awaiting переказ round-trips

- **WHEN** a переказ that awaits its зустрічний дохід and one that awaits nothing are stored and
  storage is closed and reopened
- **THEN** the first is read back awaiting and the second not, with both legs unchanged

#### Scenario: A retyped переказ no longer reads back as awaiting

- **WHEN** a переказ that awaits its зустрічний дохід is replaced under the same id by a витрата, and
  storage is closed and reopened
- **THEN** the витрата is read back and nothing says it awaits

#### Scenario: A rule row with two targets is refused by storage

- **WHEN** a rule row naming both a category and a destination рахунок is written directly
- **THEN** storage refuses it and nothing is stored

### Requirement: Правила-перекази and awaiting перекази arrive by a new migration that keeps stored rows

The possibility of a rule targeting a рахунок and of a переказ awaiting its зустрічний дохід SHALL be
introduced by one new migration; committed migrations SHALL stay untouched. Every rule and
транзакція stored under the previously committed migrations SHALL survive it unchanged: every rule
keeps its target category, and every stored переказ awaits nothing.

#### Scenario: Stored rules and перекази survive the migration

- **WHEN** the rule "сільпо → Groceries" and a переказ of 616 minor units UAH are stored under the
  previously committed migrations alone, and the database is brought to the current shape
- **THEN** the rule loads with target Groceries and no destination рахунок, and the переказ loads
  unchanged, awaiting nothing

#### Scenario: A fresh database stores a правило-переказ

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a правило-переказ and an awaiting переказ can be stored and read back
