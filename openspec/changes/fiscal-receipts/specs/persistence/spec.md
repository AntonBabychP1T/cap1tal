## ADDED Requirements

### Requirement: A фіскальний чек and its позиції survive a restart

The system SHALL store each фіскальний чек — the транзакція it is attached to, its фіскальний
номер реєстратора, фіскальний номер чека, the date and time it was issued, its dialect and
document kind, its total as integer minor units with its currency code, the seller's name and
point of sale when named, how it was acquired, the moment it was fetched and its source snapshot
— together with every позиція чека in document order — line number, raw name, quantity in
thousandths, unit name, unit price and line total as integer minor units with the currency code,
line discount, barcode and УКТЗЕД code where present — and SHALL read all of it back unchanged
after storage is closed and reopened. A транзакція SHALL hold at most one чек, and the identity of
a чек — реєстратор, фіскальний номер чека and date issued — SHALL occur at most once. A чек
referencing a транзакція id not present in storage SHALL be rejected.

#### Scenario: A чек round-trips whole

- **WHEN** a чек with eight позиції, one of them holding quantity 2000 thousandths of «шт», unit
  price 2590, line total 5180 minor units UAH and barcode "40084725", and another holding no unit
  price and no barcode, is stored and storage is reopened
- **THEN** the чек and all eight позиції read back with the same values, absent values still
  absent, in the same order

#### Scenario: A second чек on a транзакція is rejected

- **WHEN** a транзакція already holds a чек and another чек referencing it is stored
- **THEN** storage rejects the second and the first is unchanged

#### Scenario: The same identity is rejected twice

- **WHEN** a чек with реєстратор "3000909908", number "696582" and date 2026-04-29 is stored and
  another with the same three values referencing a different транзакція is stored
- **THEN** storage rejects the second

#### Scenario: An unknown транзакція id is rejected

- **WHEN** a чек referencing a транзакція id that does not exist in storage is stored
- **THEN** storage rejects it with an error and no позиція is stored

### Requirement: A чек is stored as one unit and goes with its транзакція

Storing a чек with its позиції SHALL be one unit: if any позиція cannot be stored, neither the чек
nor any other позиція SHALL be. Removing a транзакція SHALL remove its чек and позиції with it;
replacing a транзакція under its id SHALL leave its чек untouched. Removing a чек SHALL remove
its позиції and nothing else.

#### Scenario: A failed позиція stores no чек

- **WHEN** storing a чек is attempted and its third позиція is rejected
- **THEN** no чек and no позиція of it is stored

#### Scenario: Removing the транзакція removes the чек

- **WHEN** a транзакція holding a чек with nine позиції is removed and storage is reopened
- **THEN** no чек with that identity and no позиція of it loads

#### Scenario: Replacing the транзакція keeps the чек

- **WHEN** a транзакція holding a чек is replaced under its id by a повернення with another сума
- **THEN** the чек still loads attached to that id with its own values unchanged

### Requirement: Чек storage arrives through append-only migrations

The чек and позиція storage SHALL be introduced only by new migrations that preserve
every existing рахунок, транзакція, категорія, джерело, правило, ліміт, ціль, monobank state,
Saldo marker, watch, чернетка, fingerprint, reminder, alert and rate cache. A fresh database SHALL
start with no чек and no позиція.

#### Scenario: Existing data survives the migration

- **WHEN** a database holding every stored shape is brought to the current storage shape
- **THEN** every existing value loads unchanged, no транзакція holds a чек, and a чек with its
  позиції can be stored

#### Scenario: A fresh database starts empty of чеки

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** no чек and no позиція exists, and each can be stored

## MODIFIED Requirements

### Requirement: The whole stored state can be read as one snapshot

The system SHALL read the whole stored state as one snapshot: every рахунок, категорія, джерело,
правило, ліміт, ціль and транзакція, the marker of a committed Saldo import, every monobank
account with its link, sync boundary, cursor, moment it last synced and imported item ids, every
відстежуваний застосунок with the рахунок it lands on, and every фіскальний чек with its позиції and source snapshot — each exactly once, with the
values that are stored. The snapshot SHALL NOT include the cached monobank rates, the fingerprints
of captured notifications or any pending чернетка, and no monobank token SHALL be read to build it.

#### Scenario: Everything stored is in the snapshot exactly once

- **WHEN** a device holding рахунки, категорії, джерела, правила, ліміти, цілі, транзакції of all
  five types across three months, a Saldo import marker, a monobank account with a link, a cursor,
  a moment it last synced, two imported item ids, one відстежуваний застосунок
  and one чек with three позиції is read as a snapshot
- **THEN** every one of those rows appears in the snapshot exactly once, with the values stored

#### Scenario: The snapshot leaves out the cache and the captures

- **WHEN** a device that also holds a cached monobank rate, two pending чернетки and the
  fingerprints of decided notifications is read as a snapshot
- **THEN** the snapshot holds no rate, no чернетка and no fingerprint

### Requirement: The whole stored state can be replaced by a snapshot as one unit

The system SHALL replace the whole stored state with a snapshot as a single unit: after it, the
рахунки, категорії, джерела, правила, ліміти, цілі, транзакції, Saldo import marker, monobank
accounts, links, cursors, last-sync moments, imported item ids, відстежувані застосунки, and
фіскальні чеки with their позиції SHALL be exactly the snapshot's, and the pending
чернетки and the рахунок the entry form remembers SHALL be gone. The fingerprints of decided
notifications and the cached monobank rates SHALL be left untouched. If any part cannot be stored,
none of it SHALL be: everything that was stored before SHALL be exactly what is stored after.

#### Scenario: A replaced state is the snapshot's and nothing else

- **WHEN** a snapshot holding one рахунок, three транзакції, one категорія and one чек with two
  позиції is stored as a replacement on a device holding four other рахунки, two hundred other
  транзакції, five other чеки and a pending чернетка
- **THEN** afterwards storage holds exactly that рахунок, those three транзакції, that чек with its
  two позиції and the snapshot's категорії, джерела, правила, ліміти and цілі, and no чернетка

#### Scenario: A replacement that fails partway stores nothing

- **WHEN** storing a snapshot whose last транзакція references a категорія the snapshot does not
  hold is attempted
- **THEN** the replacement is rejected and every рахунок, транзакція, ліміт, ціль, правило, чек
  and monobank row the device held before is still there, unchanged

#### Scenario: The rate cache and the fingerprints survive a replacement

- **WHEN** a snapshot is stored as a replacement on a device holding a cached monobank rate for
  USD and the fingerprints of decided notifications
- **THEN** the rate and the fingerprints are still readable afterwards, unchanged
