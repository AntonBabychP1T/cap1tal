## ADDED Requirements

### Requirement: A «Не дубль» answer survives a restart and lives exactly as long as both транзакції

The system SHALL store, for a pair of транзакції, that the owner answered «Не дубль», and when.
The pair SHALL be unordered: the answer to X with Y is the answer to Y with X, and at most one
answer SHALL exist for a pair. It SHALL read back unchanged after a restart. Replacing either
транзакція SHALL keep the answer. Deleting either SHALL delete the answer with it, in the same
unit. Nothing about any спостереження other than this answer SHALL be stored.

#### Scenario: An answer round-trips

- **WHEN** «Не дубль» is stored for the pair of транзакції `a` and `b`, and storage is closed and
  reopened
- **THEN** the pair `a`, `b` reads back as answered, at the moment it was answered, and so does the
  pair `b`, `a`

#### Scenario: Answering twice keeps one answer

- **WHEN** «Не дубль» is stored for `a` with `b` and then for `b` with `a`
- **THEN** exactly one answer exists for that pair

#### Scenario: Editing keeps the answer

- **WHEN** транзакція `a` of an answered pair is replaced with a new опис
- **THEN** the pair is still answered

#### Scenario: Deleting takes the answer with it

- **WHEN** транзакція `b` of an answered pair is removed
- **THEN** no answer naming `b` remains, and транзакція `a` is unchanged

### Requirement: The «Не дубль» answers arrive by a new migration that keeps stored rows

The storage for «Не дубль» answers SHALL arrive by a new migration, appended after every
committed one. Applying it to a database that already holds рахунки, транзакції and the rest of
the owner's state SHALL keep every stored row unchanged and SHALL start with no answer.

#### Scenario: An upgraded device keeps everything and has no answers

- **WHEN** the new migration is applied to a database holding рахунки, транзакції, цілі and earned
  досягнення
- **THEN** every one of those rows reads back unchanged, and no «Не дубль» answer exists

### Requirement: The snapshot carries the «Не дубль» answers as well

The snapshot the system reads out and the snapshot it replaces the whole stored state with SHALL
both carry every «Не дубль» answer, with its pair and its moment, alongside everything else those
requirements enumerate. Replacing SHALL make the answers exactly the snapshot's, in the same single
unit as the транзакції they name.

#### Scenario: The snapshot carries the answers

- **WHEN** a snapshot is read from storage holding two «Не дубль» answers
- **THEN** it carries both, each with its pair and moment

#### Scenario: Replacing replaces the answers

- **WHEN** a snapshot holding no answer replaces a stored state holding two
- **THEN** storage holds no answer afterwards, and the транзакції were replaced in the same unit
