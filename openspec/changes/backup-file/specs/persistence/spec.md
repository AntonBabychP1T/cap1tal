## ADDED Requirements

### Requirement: The whole stored state can be read as one snapshot

The system SHALL read the whole stored state as one snapshot: every рахунок, категорія, джерело,
правило, ліміт, ціль and транзакція, the marker of a committed Saldo import, every monobank
account with its link, sync boundary, cursor, moment it last synced and imported item ids, and
every відстежуваний застосунок with the рахунок it lands on — each exactly once, with the values
that are stored. The snapshot SHALL NOT include the cached monobank rates, the fingerprints of
captured notifications or any pending чернетка, and no monobank token SHALL be read to build it.

#### Scenario: Everything stored is in the snapshot exactly once

- **WHEN** a device holding рахунки, категорії, джерела, правила, ліміти, цілі, транзакції of all
  five types across three months, a Saldo import marker, a monobank account with a link, a cursor,
  a moment it last synced and two imported item ids, and one відстежуваний застосунок is read as a
  snapshot
- **THEN** every one of those rows appears in the snapshot exactly once, with the values stored

#### Scenario: The snapshot leaves out the cache and the captures

- **WHEN** a device that also holds a cached monobank rate, two pending чернетки and the
  fingerprints of decided notifications is read as a snapshot
- **THEN** the snapshot holds no rate, no чернетка and no fingerprint

### Requirement: The whole stored state can be replaced by a snapshot as one unit

The system SHALL replace the whole stored state with a snapshot as a single unit: after it, the
рахунки, категорії, джерела, правила, ліміти, цілі, транзакції, Saldo import marker, monobank
accounts, links, cursors, last-sync moments, imported item ids and відстежувані застосунки SHALL
be exactly the snapshot's, and the pending чернетки and the рахунок the entry form remembers SHALL
be gone. The fingerprints of decided notifications and the cached monobank rates SHALL be left
untouched. If any part cannot be stored,
none of it SHALL be: everything that was stored before SHALL be exactly what is stored after.

#### Scenario: A replaced state is the snapshot's and nothing else

- **WHEN** a snapshot holding one рахунок, three транзакції and one категорія is stored as a
  replacement on a device holding four other рахунки, two hundred other транзакції and a pending
  чернетка
- **THEN** afterwards storage holds exactly that рахунок, those three транзакції and the
  snapshot's категорії, джерела, правила, ліміти and цілі, and no чернетка

#### Scenario: A replacement that fails partway stores nothing

- **WHEN** storing a snapshot whose last транзакція references a категорія the snapshot does not
  hold is attempted
- **THEN** the replacement is rejected and every рахунок, транзакція, ліміт, ціль, правило and
  monobank row the device held before is still there, unchanged

#### Scenario: The rate cache and the fingerprints survive a replacement

- **WHEN** a snapshot is stored as a replacement on a device holding a cached monobank rate for
  USD and the fingerprints of decided notifications
- **THEN** the rate and the fingerprints are still readable afterwards, unchanged
