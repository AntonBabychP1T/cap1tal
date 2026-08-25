# persistence Specification (delta)

## ADDED Requirements

### Requirement: Categories, sources and rules survive a restart

Stored categories, sources and rules SHALL remain readable after storage is closed and reopened,
returning exactly what was stored: names, the archived flag, and a rule's merchant pattern, MCC
and target category.

#### Scenario: A renamed, archived and ruled state round-trips

- **WHEN** a category renamed to «Продукти», an archived source, and a rule with merchant pattern
  "сільпо", MCC 5411 and target «Продукти» are stored, and storage is closed and reopened
- **THEN** all three are read back with the same values, including the archived flag and both
  rule criteria

### Requirement: A transaction references stored categories and sources

The system SHALL reject storing a витрата or повернення whose category id is not present in
storage, and a дохід whose source id is not present in storage. Every other scenario of this
capability that names a category or a source — the round-trips of витрата, повернення and дохід —
presumes those rows are in storage; they always are, because the starter set is seeded on every
opening and the reserved rows arrive with the migration.

#### Scenario: An unknown category id is rejected

- **WHEN** an expense referencing a category id that does not exist in storage is stored
- **THEN** storage rejects it with an error

#### Scenario: An unknown source id is rejected

- **WHEN** an income referencing a source id that does not exist in storage is stored
- **THEN** storage rejects it with an error

### Requirement: The category and source references arrive by a new migration that keeps stored rows

The categories, sources and rules tables and the transaction's category and source references
SHALL be introduced by a new migration; committed migrations SHALL stay untouched. Transaction
and account rows stored under the previously committed migrations SHALL survive the new migration
unchanged, and the reserved category ids they already carry SHALL satisfy the new references once
the reserved rows exist.

#### Scenario: Pre-migration transactions survive the migration unchanged

- **WHEN** an expense in the reserved uncategorised category, a витрата "Комісія" in the reserved
  fees category and a переказ are stored under the previously committed migrations alone, and the
  database is brought to the current shape
- **THEN** all three load unchanged — types, amounts, currencies, dates and category ids intact

#### Scenario: A fresh database from migrations alone stores every list

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a category, a source, a rule and one transaction of each of the five types can be
  stored and read back
