## MODIFIED Requirements

### Requirement: Зобов'язання and the states of their платежі survive a restart

Stored зобов'язання SHALL remain readable after storage is closed and reopened, each with its
назва, сума with its currency, періодичність, дата першого платежу, рахунок списання, категорія and
ознака where it has them, whether its нагадування про платіж is on, the moment it was recorded and
its дата припинення where it was stopped.
For every платіж SHALL be kept, by number, the транзакція it is linked to, the owner's mark
сплачено or пропущено, and every транзакція the owner unlinked from it. A платіж SHALL hold at most
one of a link, a mark сплачено and a mark пропущено, and storage SHALL reject a link, mark or
refusal for a платіж dated after the зобов'язання's дата припинення. The data SHALL live only on the
device.

#### Scenario: A зобов'язання comes back whole

- **WHEN** «Netflix» of 29900 minor units UAH «щомісяця» from 2026-08-15 on «mono black» with the
  ознака «netflix», its нагадування про платіж on, платіж 1 linked to a витрата, платіж 2 marked
  сплачено, платіж 3 marked пропущено and one витрата unlinked from платіж 1, stopped on 2026-10-20,
  is stored, and storage is closed and reopened
- **THEN** all of it is read back exactly so

#### Scenario: A marked платіж cannot also be linked

- **WHEN** a link to a витрата is stored for a платіж of «Netflix» that is marked пропущено
- **THEN** storage rejects it and the платіж stays marked пропущено with no link

#### Scenario: Nothing is stored for a платіж after the stop

- **WHEN** a mark пропущено is stored for the платіж of 2026-11-15 of «Netflix», stopped on
  2026-10-20
- **THEN** storage rejects it and holds no mark for that платіж

## ADDED Requirements

### Requirement: A declined пропозиція зобов'язання survives a restart

The system SHALL store, for a description key and a currency, that the owner answered «Ні» to its
пропозиція зобов'язання, and when. At most one answer SHALL exist for a description key and a currency;
the same description key in another currency SHALL be a different answer. It SHALL read back unchanged
after a restart and SHALL be removed only by its undo or by a restore. No пропозиція itself SHALL be
stored. The data SHALL live only on the device.

#### Scenario: An answer round-trips

- **WHEN** «Ні» is stored for «netflix» in UAH on 2026-10-06, and storage is closed and reopened
- **THEN** «netflix» in UAH reads back as declined at that moment, and «netflix» in USD does not

#### Scenario: Declining twice keeps one answer

- **WHEN** «Ні» is stored twice for «netflix» in UAH
- **THEN** exactly one answer exists for «netflix» in UAH

#### Scenario: Undo removes it

- **WHEN** the stored «Ні» for «netflix» in UAH is undone
- **THEN** no answer exists for «netflix» in UAH

### Requirement: The нагадування switch and the declined пропозиції arrive by a new migration that keeps stored rows

The storage for a зобов'язання's нагадування про платіж and for the declined пропозиції SHALL arrive
by one new migration, appended after every committed one. Applying it to a database that already
holds рахунки, транзакції, розстрочки, зобов'язання with their links, marks and refusals, and the
rest of the owner's state SHALL keep every stored row unchanged, SHALL leave every stored
зобов'язання with its нагадування off, and SHALL start with no declined пропозиція.

#### Scenario: An upgraded device keeps its зобов'язання, silent

- **WHEN** the new migration is applied to a database holding «Оренда» of 1500000 minor units UAH
  with платіж 1 linked to a витрата, and «Netflix» stopped on 2026-10-02
- **THEN** both read back with every value, link and stop they had, each with its нагадування off,
  and no пропозиція is declined
