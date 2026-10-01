## ADDED Requirements

### Requirement: Розстрочки and the states of their платежі survive a restart

Stored розстрочки SHALL remain readable after storage is closed and reopened, each with its назва,
повна сума, кількість платежів, щомісячний платіж, дата першого платежу, рахунок списання,
сплачено раніше, категорія where it has one, the moment it was recorded and the дата it was closed
early where it was. For every платіж SHALL be kept, by number, the транзакція it is linked to, the
owner's mark сплачено, and every транзакція the owner unlinked from it. The switch of the
нагадування про платіж, and whether the app has already asked for notification permission on their
behalf, SHALL survive likewise, reading as on when it was never set. The data SHALL
live only on the device.

#### Scenario: A розстрочка comes back whole

- **WHEN** «iPhone» of 1000000 minor units UAH in 10 платежі of 100000 from 2026-06-05 on «mono
  black» with 4 сплачено раніше, платіж 5 linked to a витрата, платіж 6 marked сплачено and one
  витрата unlinked from платіж 7 is stored, and storage is closed and reopened
- **THEN** all of it is read back exactly so

#### Scenario: The switch defaults to on

- **WHEN** storage that never stored the switch is read
- **THEN** the нагадування про платіж read as on, and the app has not yet asked on their behalf

### Requirement: A stored розстрочка refers only to what storage holds

The system SHALL reject storing a розстрочка whose рахунок списання or категорія is not present in
storage, or whose рахунок списання is not a UAH рахунок, and SHALL reject linking a платіж to a
транзакція that is not present, is not a UAH витрата on the розстрочка's рахунок списання, or is
already linked to another платіж. A rejected write SHALL leave storage as it was. Removing a
транзакція SHALL remove its link and leave the платіж otherwise as it was.

#### Scenario: A non-UAH рахунок списання is rejected

- **WHEN** a розстрочка naming a USD рахунок as its рахунок списання is stored
- **THEN** storage rejects it and holds no розстрочка

#### Scenario: A транзакція links to one платіж at most

- **WHEN** a витрата already linked to платіж 5 of «iPhone» is linked to платіж 1 of «Пилосос»
- **THEN** storage rejects it and the витрата stays linked to платіж 5 of «iPhone» only

#### Scenario: A removed транзакція releases its link

- **WHEN** the витрата linked to платіж 5 is removed
- **THEN** платіж 5 has no link, the розстрочка is otherwise unchanged, and nothing refuses the
  removal

### Requirement: A merged рахунок takes its розстрочки along

When one рахунок is merged into another, every розстрочка whose рахунок списання was the merged
рахунок SHALL name the рахунок it was merged into, with every link of its платежі kept.

#### Scenario: Merging the card of a розстрочка

- **WHEN** the UAH рахунок «mono black (Saldo)», рахунок списання of «iPhone», is merged into «mono
  black»
- **THEN** «iPhone» has «mono black» as its рахунок списання and its linked платежі are still
  linked to the same витрати

### Requirement: Розстрочки arrive by a new append-only migration

Applying every committed migration in order to an empty database SHALL produce storage that holds
розстрочки alongside everything the earlier migrations already hold. Rows stored under the earlier
migrations SHALL survive the new one unchanged, and no розстрочка SHALL exist that the owner never
recorded. Committed migrations SHALL NOT be edited.

#### Scenario: Existing data survives the migration

- **WHEN** рахунки, транзакції, категорії, ліміти and цілі stored under the earlier migrations are
  read after the new migration is applied
- **THEN** every row is exactly what it was and there is no розстрочка

### Requirement: The snapshot carries the розстрочки

The whole stored state read as one snapshot SHALL include every розстрочка, every state of its
платежі and the switch of the нагадування про платіж, and replacing the stored state by a snapshot
SHALL replace them with the snapshot's, as one unit with everything else. Whether the app has
already asked for notification permission on behalf of the нагадування про платіж is the phone's
own state: it SHALL NOT be part of the snapshot, and a replace SHALL leave it as it was.

#### Scenario: Replacing the state replaces the розстрочки

- **WHEN** storage holding «iPhone» is replaced by a snapshot holding only «Пилосос»
- **THEN** storage holds «Пилосос» and no «iPhone»

#### Scenario: A replace leaves whether the app already asked

- **WHEN** storage whose app has already asked for notification permission is replaced by a
  snapshot
- **THEN** the app has still already asked
