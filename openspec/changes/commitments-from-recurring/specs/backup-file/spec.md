## MODIFIED Requirements

### Requirement: A бекап carries the зобов'язання

A бекап SHALL carry every зобов'язання with every value it holds and the states of its платежі — the
транзакція each is linked to, the owner's marks сплачено and пропущено, and the транзакції the owner
unlinked — and restoring SHALL put them back exactly as they were. A зобов'язання is the owner's
word about money no statement announces in advance: dropped from a бекап, the restored phone would
know every платіж as an ordinary витрата and nothing of what is still owed.

Whether a зобов'язання's нагадування про платіж is on SHALL be among the values it carries, so a
restored phone warns about the same зобов'язання the old one did. A бекап whose зобов'язання say
nothing of it, because it was written before the switch existed, SHALL restore every such
зобов'язання with its нагадування off. Whether this phone already asked for the permission SHALL
NOT be carried.

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

#### Scenario: The нагадування switch survives the round trip

- **WHEN** a бекап made on a device where «Оренда» has its нагадування про платіж on and «Netflix»
  has it off is restored onto storage holding nothing
- **THEN** «Оренда» has its нагадування on and «Netflix» has it off

#### Scenario: A бекап written before the switch restores silent

- **WHEN** a бекап whose зобов'язання «Оренда» carries no нагадування value, because it was written
  before the switch existed, is restored
- **THEN** «Оренда» is back with every other value and its нагадування off

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


## ADDED Requirements

### Requirement: A бекап carries the declined пропозиції зобов'язання

A бекап SHALL carry every «Ні» the owner gave to a пропозиція зобов'язання, with its description key, its
currency and the moment it was given. Restoring SHALL make the declined пропозиції exactly the
бекап's, replacing what the device held, as a відновлення replaces everything else. They are carried
because they are the owner's word and cannot be recomputed: dropped, a restored phone would ask
again about every regular payment already declined.

No пропозиція itself SHALL be carried: each is recomputed from the restored state whenever it is
shown.

The answers SHALL be carried as one more optional section of the existing format, with no change
to the envelope's format version. A бекап written before the answers existed carries no such
section and SHALL restore with no пропозиція declined.

An answer whose description key is empty, whose currency is not a currency code the app knows, or two
answers naming the same description key in the same currency SHALL make the whole бекап contradict
itself, and such a бекап SHALL be refused whole, with nothing restored.

#### Scenario: The answers survive the round trip

- **WHEN** a бекап made on a device where «Ні» was given to «netflix» in UAH and to «megogo» in UAH
  is restored onto storage holding nothing, and both still qualify as regular payments
- **THEN** both answers are back with their moments, and neither is offered as a пропозиція

#### Scenario: A бекап written before the answers existed restores with none

- **WHEN** a бекап carrying no section of declined пропозиції is restored
- **THEN** it is accepted, no пропозиція is declined, and every regular payment that qualifies is
  offered again

#### Scenario: One description key declined twice in one currency is refused whole

- **WHEN** restoring a бекап whose answers name «netflix» in UAH twice is attempted
- **THEN** it is refused as contradicting itself and nothing local changes

#### Scenario: One description key in two currencies is two answers

- **WHEN** a бекап whose answers name «spotify» in UAH and «spotify» in USD is restored
- **THEN** it is accepted and «spotify» is declined in both currencies

#### Scenario: No пропозиція is in the file

- **WHEN** a бекап is made on a device where two пропозиції are offered and one was declined
- **THEN** the file carries the one declined answer and no пропозиція
