## ADDED Requirements

### Requirement: Зобов'язання and the states of their платежі survive a restart

Stored зобов'язання SHALL remain readable after storage is closed and reopened, each with its
назва, сума with its currency, періодичність, дата першого платежу, рахунок списання, категорія and
ознака where it has them, the moment it was recorded and its дата припинення where it was stopped.
For every платіж SHALL be kept, by number, the транзакція it is linked to, the owner's mark
сплачено or пропущено, and every транзакція the owner unlinked from it. A платіж SHALL hold at most
one of a link, a mark сплачено and a mark пропущено, and storage SHALL reject a link, mark or
refusal for a платіж dated after the зобов'язання's дата припинення. The data SHALL live only on the
device.

#### Scenario: A зобов'язання comes back whole

- **WHEN** «Netflix» of 29900 minor units UAH «щомісяця» from 2026-08-15 on «mono black» with the
  ознака «netflix», платіж 1 linked to a витрата, платіж 2 marked сплачено, платіж 3 marked
  пропущено and one витрата unlinked from платіж 1, stopped on 2026-10-20, is stored, and storage is
  closed and reopened
- **THEN** all of it is read back exactly so

#### Scenario: A marked платіж cannot also be linked

- **WHEN** a link to a витрата is stored for a платіж of «Netflix» that is marked пропущено
- **THEN** storage rejects it and the платіж stays marked пропущено with no link

#### Scenario: Nothing is stored for a платіж after the stop

- **WHEN** a mark пропущено is stored for the платіж of 2026-11-15 of «Netflix», stopped on
  2026-10-20
- **THEN** storage rejects it and holds no mark for that платіж

### Requirement: A stored зобов'язання refers only to what storage holds

The system SHALL reject storing a зобов'язання whose рахунок списання or категорія is not present
in storage, or whose currency is not the currency of its рахунок списання, and SHALL reject linking
a платіж of a зобов'язання to a транзакція that is not present, is not a витрата on the
зобов'язання's рахунок списання in its currency, or is already linked to another платіж — of a
зобов'язання or of a розстрочка. It SHALL likewise reject linking a платіж of a розстрочка to a
транзакція already linked to a платіж of a зобов'язання. A rejected write SHALL leave storage as it
was. Removing a транзакція SHALL remove its link and leave the платіж otherwise as it was.

#### Scenario: A currency other than the рахунок's is rejected

- **WHEN** a зобов'язання of 2000 minor units USD naming the UAH рахунок «mono black» as its
  рахунок списання is stored
- **THEN** storage rejects it and holds no зобов'язання

#### Scenario: A транзакція links to one платіж at most, whatever the plan

- **WHEN** a витрата already linked to платіж 5 of the розстрочка «iPhone» is linked to a платіж of
  the зобов'язання «Спортзал», or a витрата linked to a платіж of «Спортзал» is linked to a платіж
  of «iPhone»
- **THEN** storage rejects it and the витрата stays linked to its first платіж only

#### Scenario: A removed транзакція releases its link

- **WHEN** the витрата linked to a платіж of «Інтернет» is removed
- **THEN** that платіж has no link, «Інтернет» is otherwise unchanged, and nothing refuses the
  removal

### Requirement: A merged рахунок takes its зобов'язання along

When one рахунок is merged into another, every зобов'язання whose рахунок списання was the merged
рахунок SHALL name the рахунок it was merged into, with every link of its платежі kept.

#### Scenario: Merging the card of a зобов'язання

- **WHEN** the UAH рахунок «mono black (Saldo)», рахунок списання of «Інтернет», is merged into
  «mono black»
- **THEN** «Інтернет» has «mono black» as its рахунок списання and its linked платежі are still
  linked to the same витрати

### Requirement: Зобов'язання arrive by a new append-only migration

Applying every committed migration in order to an empty database SHALL produce storage that holds
зобов'язання alongside everything the earlier migrations already hold. Rows stored under the
earlier migrations SHALL survive the new one unchanged, and no зобов'язання SHALL exist that the
owner never recorded. Committed migrations SHALL NOT be edited.

#### Scenario: Existing data survives the migration

- **WHEN** рахунки, транзакції, категорії, ліміти, цілі and розстрочки stored under the earlier
  migrations are read after the new migration is applied
- **THEN** every row is exactly what it was and there is no зобов'язання

### Requirement: The snapshot carries the зобов'язання

The whole stored state read as one snapshot SHALL include every зобов'язання and every state of
its платежі, and replacing the stored state by a snapshot SHALL replace them with the snapshot's,
as one unit with everything else.

#### Scenario: Replacing the state replaces the зобов'язання

- **WHEN** storage holding «Інтернет» is replaced by a snapshot holding only «Оренда»
- **THEN** storage holds «Оренда» and no «Інтернет»
