## ADDED Requirements

### Requirement: A поточна вартість survives a restart, at most one per рахунок

Stored поточні вартості SHALL remain readable after storage is closed and reopened, at most one
per рахунок, each returning the сума in integer minor units, its currency code and its дата
exactly as stored. Storing another for the same рахунок SHALL replace it rather than add a second;
clearing SHALL leave none, and reading a рахунок that has none SHALL return nothing, not an error.
The data SHALL live only on the device.

#### Scenario: Reopening storage returns the вартість unchanged

- **WHEN** a поточна вартість of 560000 minor units UAH dated 2026-08-28 is stored for an
  `investment` рахунок, and storage is closed and reopened
- **THEN** it is read back as 560000 minor units UAH dated 2026-08-28

#### Scenario: Storing again replaces, never accumulates

- **WHEN** 575000 minor units UAH dated 2026-09-30 is stored for that same рахунок
- **THEN** the рахунок has exactly one stored вартість, 575000 minor units UAH dated 2026-09-30

#### Scenario: Clearing leaves nothing behind

- **WHEN** that рахунок's вартість is cleared and storage is closed and reopened
- **THEN** the рахунок has no stored вартість and reading it returns nothing rather than an error

### Requirement: A stored поточна вартість names a stored інвестиційний рахунок in its currency

The system SHALL reject storing a поточна вартість whose рахунок is not present in storage, whose
рахунок is not of вид `investment`, whose currency is not that рахунок's own, or whose сума is
negative. A rejected вартість SHALL leave storage as it was.

#### Scenario: An unknown рахунок is rejected

- **WHEN** a вартість naming a рахунок id that does not exist in storage is stored
- **THEN** storage rejects it with an error

#### Scenario: A рахунок of another вид is rejected

- **WHEN** a вартість for a stored рахунок of вид `spending` is stored
- **THEN** storage rejects it with an error and that рахунок holds no вартість

#### Scenario: A currency other than the рахунок's is rejected

- **WHEN** a вартість of 10000 minor units USD is stored for a stored UAH `investment` рахунок
- **THEN** storage rejects it with an error

#### Scenario: A negative сума is rejected

- **WHEN** a вартість of −100 minor units UAH is stored for a UAH `investment` рахунок
- **THEN** storage rejects it with an error

### Requirement: The поточна вартість arrives by a new append-only migration

Applying every committed migration in order to an empty database SHALL produce storage that holds
поточні вартості alongside everything the earlier migrations already hold. Rows stored under the
earlier migrations SHALL survive the new one unchanged, and no рахунок SHALL gain a вартість it
was never given. Committed migrations SHALL NOT be edited.

#### Scenario: A fresh database holds поточні вартості

- **WHEN** every committed migration is applied to an empty database and a вартість is stored for
  an `investment` рахунок
- **THEN** it is stored and read back unchanged

#### Scenario: Existing financial data survives the migration

- **WHEN** рахунки, транзакції, категорії, ліміти and цілі stored under the earlier migrations are
  read after the new migration is applied
- **THEN** every row is exactly what it was

#### Scenario: No рахунок gains an invented вартість

- **WHEN** an `investment` рахунок stored before the new migration is read after it
- **THEN** it has no поточна вартість until one is entered
