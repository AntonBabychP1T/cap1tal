## ADDED Requirements

### Requirement: A category's ліміт survives a restart

The system SHALL store at most one ліміт per category — an integer minor-units сума with its
currency code — and read it back unchanged after storage is closed and reopened. Storing a ліміт
for a category that already has one SHALL replace it; clearing SHALL remove it; a ліміт
referencing a category id not present in storage SHALL be rejected. The ліміт storage SHALL
arrive by a new migration — committed migrations stay untouched — and every row stored under the
previously committed migrations SHALL survive it unchanged.

#### Scenario: A stored ліміт is still there after a restart

- **WHEN** a ліміт of 250000 minor units UAH is stored for a category and storage is closed and
  reopened
- **THEN** reading that category's ліміт returns 250000 minor units UAH

#### Scenario: Storing again replaces, clearing removes

- **WHEN** a ліміт of 250000 minor units UAH is stored for a category, then a ліміт of 300000
  minor units UAH is stored for it, then the ліміт is cleared
- **THEN** after the second store the category's ліміт reads 300000 minor units UAH, and after
  the clear the category has no ліміт

#### Scenario: An unknown category id is rejected

- **WHEN** a ліміт referencing a category id that does not exist in storage is stored
- **THEN** storage rejects it with an error

#### Scenario: A fresh database from migrations alone stores ліміти

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a ліміт can be stored for a seeded category and read back

#### Scenario: Rows stored before the migration survive it

- **WHEN** рахунки, категорії, джерела, правила, monobank links and one транзакція of each type
  are stored under the previously committed migrations alone, and the database is brought to the
  current shape
- **THEN** all of them load unchanged and no category has a ліміт

### Requirement: Цілі survive a restart

The system SHALL store each ціль — its назва, target integer minor-units сума with currency
code, дата and linked рахунок id — and read it back unchanged after storage is closed and
reopened. Replacing a stored ціль under its id SHALL persist the changed values; removing one
SHALL remove only it. A ціль referencing a рахунок id not present in storage SHALL be rejected, and so SHALL a ціль
whose currency differs from its linked рахунок's currency — the mismatch the goals capability
forbids is not representable in storage either.
The ціль storage SHALL arrive by a new migration — committed migrations stay untouched — and
every row stored under the previously committed migrations SHALL survive it unchanged.

#### Scenario: A stored ціль round-trips

- **WHEN** a ціль «Авто» with a target of 20000000 minor units UAH, дата 2026-12-31 and a stored
  рахунок's id is stored and storage is closed and reopened
- **THEN** the ціль reads back with the same назва, target, currency, дата and рахунок id

#### Scenario: A replaced ціль keeps its id and new values

- **WHEN** a stored ціль is replaced under its id with a target of 25000000 minor units UAH
- **THEN** loading that id returns the ціль with the new target

#### Scenario: A removed ціль is gone and nothing else is

- **WHEN** two цілі are stored and one is removed
- **THEN** only the other remains, and every рахунок and транзакція is unchanged

#### Scenario: An unknown рахунок id is rejected

- **WHEN** a ціль referencing a рахунок id that does not exist in storage is stored
- **THEN** storage rejects it with an error

#### Scenario: A currency mismatching the рахунок is rejected

- **WHEN** a ціль with a USD target linked to a UAH рахунок is stored
- **THEN** storage rejects it with an error and nothing is stored

#### Scenario: A fresh database from migrations alone stores цілі

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a рахунок can be stored and a ціль linked to it can be stored and read back

### Requirement: The whole stored history can be listed

The system SHALL list every stored транзакція, each exactly once, so the history series can be
computed from one reading.

#### Scenario: Every stored транзакція is returned once

- **WHEN** транзакції are stored in three different months and the whole history is listed
- **THEN** every stored транзакція is returned exactly once
