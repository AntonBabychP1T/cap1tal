## ADDED Requirements

### Requirement: Monobank links and progress survive a restart

The system SHALL store each active link's monobank account id, рахунок id, confirmed first-sync
boundary, committed cursor and latest баланс банку, and SHALL read them back unchanged after a
restart. A monobank account and a рахунок SHALL each occur in at most one active link, and every
stored balance SHALL carry the linked рахунок's currency.

#### Scenario: A link resumes after restart

- **WHEN** a UAH link with a confirmed boundary, committed cursor and баланс банку is stored and
  storage is reopened
- **THEN** the same monobank account is linked to the same UAH рахунок with the same boundary,
  cursor and bank balance

#### Scenario: A second active link is rejected

- **WHEN** storage already links monobank account M to рахунок A and an attempt is made to link M
  to рахунок B or another monobank account to A
- **THEN** the attempted second link is rejected and the existing link remains unchanged

### Requirement: Imported monobank item ids are remembered independently of transactions

The system SHALL store each imported monobank item id with its monobank account id and SHALL keep
that pair after the created транзакція is edited or deleted and after the account is unlinked, so
the item can never import twice.

#### Scenario: Deleting a transaction keeps its imported id

- **WHEN** an imported транзакція is deleted and storage is reopened
- **THEN** its monobank item id is still remembered and the same item is rejected as already
  imported

#### Scenario: The same item id belongs separately to each bank account

- **WHEN** two different monobank accounts each import an item with id X
- **THEN** both account-and-X pairs can be stored, while storing either pair a second time is
  rejected

### Requirement: A statement answer commits atomically

The system SHALL store one statement answer's new транзакції, imported item ids, resulting cursor
and latest баланс банку as one unit; if any value cannot be stored, none of those values SHALL
change.

#### Scenario: A transaction failure rolls back sync metadata

- **WHEN** one statement answer contains two valid mapped транзакції but storing the second is
  rejected
- **THEN** neither транзакція nor either imported item id is stored, and the cursor and баланс
  банку retain their previous values

#### Scenario: A complete answer survives restart whole

- **WHEN** a statement answer with three new транзакції is committed and storage is reopened
- **THEN** all three транзакції and their imported item ids, the resulting cursor and the latest
  баланс банку are present together

### Requirement: A transaction's informational description survives a restart

The system SHALL store and load the optional опис of every транзакція type unchanged; a
транзакція with no опис SHALL still load with none, and adding the field SHALL NOT change any
amount, currency, category, source or monthly number.

#### Scenario: An imported description round-trips

- **WHEN** an imported витрата with опис "СІЛЬПО Київ" is stored and storage is reopened
- **THEN** the витрата still carries that exact опис and all its money and category fields are
  unchanged

#### Scenario: An old transaction gains no invented description

- **WHEN** a транзакція stored before опис existed is brought to the current storage shape
- **THEN** it loads with no опис and every pre-existing field remains unchanged

### Requirement: Monobank storage arrives through append-only migrations without a token

The monobank link, progress, imported-id, balance and опис storage SHALL be introduced only by new
migrations that preserve all existing рахунки, транзакції, категорії, джерела, правила, Saldo
import state and rate cache. The monobank token SHALL have no column or row in this storage.

#### Scenario: Existing financial data survives the migration

- **WHEN** a database holding every транзакція type, рахунки, list rows, rules, a Saldo import
  marker and rates is brought to the current shape
- **THEN** every existing value loads unchanged and no monobank token exists in the database

#### Scenario: A fresh database supports monobank metadata but not the token

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** links, cursors, imported ids, bank balances and transaction описи can be stored, and no
  storage location for a monobank token exists

