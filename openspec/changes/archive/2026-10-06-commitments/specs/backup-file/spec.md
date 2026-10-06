## ADDED Requirements

### Requirement: A бекап carries the зобов'язання

A бекап SHALL carry every зобов'язання with every value it holds and the states of its платежі — the
транзакція each is linked to, the owner's marks сплачено and пропущено, and the транзакції the owner
unlinked — and restoring SHALL put them back exactly as they were. A зобов'язання is the owner's
word about money no statement announces in advance: dropped from a бекап, the restored phone would
know every платіж as an ordinary витрата and nothing of what is still owed.

A restore SHALL replace the зобов'язання wholesale like every other part of the state. A бекап
written before зобов'язання existed SHALL still restore, leaving the phone with none.

A бекап SHALL be refused whole, with nothing restored, when a зобов'язання it carries names a
рахунок or категорія the бекап does not contain, holds a currency other than its рахунок списання's,
holds a value the commitments capability refuses — an archived рахунок or категорія is no such
value, since a card may be archived after its зобов'язання was recorded — gives one платіж more than
one of a link, a mark сплачено and a mark пропущено, holds a link, mark or refusal for a платіж
dated after the зобов'язання's дата припинення, or links a платіж to a транзакція the бекап does
not contain, that is not a витрата on its рахунок списання in its currency, or that is linked to
another платіж of a зобов'язання or of a розстрочка as well.

#### Scenario: A зобов'язання survives the round trip

- **WHEN** a бекап made on a device holding «Netflix» with the ознака «netflix», платіж 1 linked to a
  витрата, платіж 2 marked сплачено and платіж 3 marked пропущено, stopped on 2026-10-20, is
  restored onto storage holding nothing
- **THEN** «Netflix» is back with the same values, платіж 1 is linked to the same витрата, платежі
  2 and 3 carry the same marks, and it is still stopped on 2026-10-20

#### Scenario: A бекап written before зобов'язання existed still restores

- **WHEN** a бекап that names no зобов'язання, because it was written before they existed, is
  restored
- **THEN** its рахунки, транзакції, розстрочки and settings are restored and there is no
  зобов'язання

#### Scenario: A зобов'язання on a рахунок outside the бекап stops the restore

- **WHEN** restoring a бекап whose зобов'язання names a рахунок списання the бекап does not contain,
  or holds USD while its рахунок списання is a UAH рахунок, is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: One транзакція linked to a розстрочка and a зобов'язання stops the restore

- **WHEN** restoring a бекап in which one витрата is linked to a платіж of a розстрочка and to a
  платіж of a зобов'язання is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A платіж said twice, or said after the stop, stops the restore

- **WHEN** restoring a бекап in which one платіж of a зобов'язання is both linked and marked, or a
  платіж dated after its дата припинення is marked, is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A two-letter ознака stops the restore

- **WHEN** restoring a бекап whose зобов'язання carries the ознака «tv» is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A link outside the бекап stops the restore

- **WHEN** restoring a бекап whose зобов'язання links a платіж to a транзакція the бекап does not
  contain is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A зобов'язання on a since-archived рахунок restores

- **WHEN** a бекап whose «Інтернет» names a рахунок списання that was archived after «Інтернет» was
  recorded is restored
- **THEN** «Інтернет» is back on that рахунок and nothing is refused
