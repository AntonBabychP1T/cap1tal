## ADDED Requirements

### Requirement: The moment a link last completed a sync survives a restart

The system SHALL store, per monobank link, the moment at which a sync last completed for it, and
read it back unchanged after storage is closed and reopened. A link SHALL be storable with no such
moment — the state of a link that has never synced — and storing a newer moment SHALL replace the
one held. Removing the link SHALL remove the moment with it, leaving every транзакція, imported-id
memory, опис and last known баланс банку untouched. The moment SHALL be about the link alone: two
links SHALL hold their moments independently.

#### Scenario: A stored moment reads back unchanged

- **WHEN** a link is stored with the moment of a completed sync and storage is closed and reopened
- **THEN** the link reads back with the same moment

#### Scenario: A link that never synced holds no moment

- **WHEN** a link is stored and no sync has completed for it
- **THEN** it reads back with no moment, and that is distinguishable from a moment of zero

#### Scenario: A newer moment replaces the older one

- **WHEN** a second sync completes for a link that already held a moment
- **THEN** the link holds only the newer moment

#### Scenario: Two links keep their moments apart

- **WHEN** one link holds the moment of a sync and a second link holds an earlier one
- **THEN** each reads back with its own moment

#### Scenario: Removing the link removes only the moment

- **WHEN** a link holding a moment is removed
- **THEN** the moment is gone with it and every транзакція, imported item id, опис and last known
  баланс банку of that monobank account remains

## MODIFIED Requirements

### Requirement: Monobank storage arrives through append-only migrations without a token

The monobank link, progress, imported-id, balance, опис and last-completed-sync storage SHALL be
introduced only by new migrations that preserve all existing рахунки, транзакції, категорії,
джерела, правила, Saldo import state and rate cache. The monobank token SHALL have no column or row
in this storage.

#### Scenario: Existing financial data survives the migration

- **WHEN** a database holding every транзакція type, рахунки, list rows, rules, a Saldo import
  marker and rates is brought to the current shape
- **THEN** every existing value loads unchanged and no monobank token exists in the database

#### Scenario: An existing link survives gaining the moment

- **WHEN** a database holding monobank links, imported item ids and bank balances is brought to the
  current shape
- **THEN** every link loads unchanged, holding no last-completed-sync moment, and its imported item
  ids and balance are untouched

#### Scenario: A fresh database supports monobank metadata but not the token

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** links, cursors, imported ids, bank balances, transaction описи and the moment a link
  last completed a sync can be stored, and no storage location for a monobank token exists
