## ADDED Requirements

### Requirement: A бекап carries the розстрочки

A бекап SHALL carry every розстрочка with every value it holds, the states of its платежі — the
транзакція each is linked to, the owner's marks and the транзакції the owner unlinked — and the
switch of the нагадування про платіж, and restoring SHALL put them back exactly as they were. A
розстрочка is the owner's word about money the statement never shows: dropped from a бекап, the
restored phone would know every платіж as an ordinary витрата and nothing of what is still owed.

A restore SHALL replace the розстрочки wholesale like every other part of the state. Whether the
app has already asked for notification permission is the phone's own state: it SHALL NOT be carried,
and a restore SHALL leave it as it was on the phone. A бекап written
before розстрочки existed SHALL still restore, leaving the phone with none and the нагадування про
платіж on.

A бекап SHALL be refused whole, with nothing restored, when a розстрочка it carries names a
рахунок or категорія the бекап does not contain, names a рахунок списання that is not a UAH рахунок,
holds a value the installments capability refuses — an archived рахунок or категорія is no such
value, since a card may be archived after its розстрочка was recorded — or links a платіж to a
транзакція the бекап does not contain, that is not a UAH витрата on its рахунок списання, or that
is linked to another платіж as well.

#### Scenario: A розстрочка survives the round trip

- **WHEN** a бекап made on a device holding «iPhone» with 4 сплачено раніше, платіж 5 linked to a
  витрата and платіж 6 marked сплачено, with the нагадування про платіж off, is restored onto
  storage holding nothing
- **THEN** «iPhone» is back with the same values, платіж 5 is linked to the same витрата, платіж 6
  is still marked, and the нагадування про платіж are off

#### Scenario: A бекап written before розстрочки existed still restores

- **WHEN** a бекап that names no розстрочка, because it was written before they existed, is
  restored
- **THEN** its рахунки, транзакції and settings are restored, there is no розстрочка, and the
  нагадування про платіж are on

#### Scenario: A розстрочка on a рахунок outside the бекап stops the restore

- **WHEN** restoring a бекап whose розстрочка names a рахунок списання the бекап does not contain,
  or a USD рахунок, is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: One транзакція linked twice stops the restore

- **WHEN** restoring a бекап in which one витрата is linked to платежі of two розстрочки is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A link outside the бекап stops the restore

- **WHEN** restoring a бекап whose розстрочка links a платіж to a транзакція the бекап does not
  contain is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A розстрочка on a since-archived рахунок restores

- **WHEN** a бекап whose «iPhone» names a UAH рахунок списання that was archived after «iPhone» was
  recorded is restored
- **THEN** «iPhone» is back on that рахунок and nothing is refused
