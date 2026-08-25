## ADDED Requirements

### Requirement: An import plan is stored as one whole or not at all

The system SHALL store an import plan — its рахунки with their назви, види, currencies and
початкові залишки, the replaced початковий залишок of a рахунок the plan maps onto, its
категорії, its джерела, every транзакція of the plan in the plan's own order, and the marker
recording that an import was committed — as a single unit. If any part of it cannot be stored,
none of it SHALL be stored: the рахунки, категорії, джерела, транзакції and the marker that were
there before SHALL be exactly what is there after.

#### Scenario: A stored plan reads back whole

- **WHEN** a plan holding two рахунки, one new категорія, one new джерело and three транзакції is
  stored
- **THEN** both рахунки, the категорія, the джерело and all three транзакції read back with the
  values the plan held, and each рахунок's розрахунковий баланс is its початковий залишок plus its
  транзакції

#### Scenario: A plan that fails partway stores nothing

- **WHEN** storing a plan whose last транзакція references a категорія the plan never creates is
  attempted
- **THEN** storing is rejected and neither the рахунки, the категорії, the джерела nor the earlier
  транзакції of that plan are in storage

#### Scenario: A failed commit leaves no marker

- **WHEN** storing that plan is attempted on a device where no import was ever committed
- **THEN** reading the import marker afterwards still returns nothing

#### Scenario: A plan mapping onto an existing рахунок replaces its opening balance

- **WHEN** a plan whose рахунок carries an existing рахунок's id and a початковий залишок of 12300
  minor units UAH is stored, and that рахунок's stored початковий залишок was 5000
- **THEN** no second рахунок is created and the existing рахунок's початковий залишок is 12300
  minor units UAH

#### Scenario: The plan's order becomes the stored order

- **WHEN** a plan holding two транзакції of one date — the export's earlier one first — is stored
- **THEN** the latest listing returns the export's later one first, as it does for any two
  same-date транзакції stored one after the other

### Requirement: The moment of a committed import is stored

The system SHALL store the moment an import plan was committed and SHALL read it back after a
restart; committing another plan SHALL replace it with the newer moment. Before any import has
been committed, reading it SHALL return nothing, not an error. The marker SHALL be stored by a new
migration — committed migrations stay untouched — and рахунки, транзакції, категорії, джерела and
правила stored under the previously committed migrations SHALL survive it unchanged.

#### Scenario: The moment survives a restart

- **WHEN** an import plan is committed and storage is closed and reopened
- **THEN** reading the import marker returns the moment that import was committed

#### Scenario: Before any import there is no marker

- **WHEN** the import marker is read on a device where no import has been committed
- **THEN** nothing is returned and no error is raised

#### Scenario: A second import replaces the moment

- **WHEN** a second plan is committed later
- **THEN** reading the marker returns only the later moment

#### Scenario: A fresh database from migrations alone holds the marker

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** an import marker can be stored and read back, and a рахунок and one транзакція of each
  of the five types can still be stored and read back

#### Scenario: Rows stored before the migration survive it

- **WHEN** a рахунок, a категорія, a джерело, a правило and one транзакція of each type are stored
  under the previously committed migrations alone, and the database is brought to the current shape
- **THEN** all of them load unchanged and no import marker exists
