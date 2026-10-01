## ADDED Requirements

### Requirement: The нагадування's setting survives a restart

The system SHALL store whether the daily нагадування is on and the time of day it is set for, and
SHALL load the same values after storage is reopened. A device that was never asked SHALL load as
off, and the change of a value SHALL replace it rather than add a second setting.

#### Scenario: The setting round-trips

- **WHEN** the нагадування is stored as on for 09:30 and storage is reopened
- **THEN** it loads as on for 09:30

#### Scenario: A device never asked loads as off

- **WHEN** storage that was never told about the нагадування is opened
- **THEN** it loads as off, with no time claimed to be set by the owner

#### Scenario: Changing the setting leaves one setting

- **WHEN** the нагадування is stored as on for 21:00 and then as on for 09:30, and storage is
  reopened
- **THEN** it loads as on for 09:30 and no other reminder setting exists

### Requirement: Outstanding failures survive a restart, one per action

The system SHALL store the outstanding сповіщення про збій as at most one per action, with the
moment it was raised, and SHALL load the same set after storage is reopened. Raising an action
that is already outstanding SHALL leave one, keeping the moment it was first raised; clearing an
action SHALL remove only that action's.

#### Scenario: An outstanding failure round-trips

- **WHEN** a сповіщення про збій for the monobank sync is stored and storage is reopened
- **THEN** exactly that one is outstanding, with the moment it was raised

#### Scenario: Raising the same action twice stores one

- **WHEN** the same action is raised twice and storage is reopened
- **THEN** one сповіщення is outstanding for it, carrying the moment of the first raise

#### Scenario: Clearing one leaves the others

- **WHEN** two actions are outstanding, one is cleared, and storage is reopened
- **THEN** only the other is outstanding

### Requirement: Reminder and failure storage arrives through append-only migrations

The reminder setting and the outstanding сповіщення SHALL be introduced only by new migrations
that preserve every existing рахунок, транзакція, категорія, джерело, правило, ліміт, ціль,
monobank state, Saldo state, notification watch, fingerprint, чернетка and rate cache. No text of
a captured bank notification, no сума and no secret SHALL be stored with a сповіщення — the action
that failed is the whole of what is kept.

#### Scenario: Existing data survives the migration

- **WHEN** a database holding every stored shape is brought to the current storage shape
- **THEN** every existing value loads unchanged, and the reminder setting and a сповіщення can be
  stored

#### Scenario: A fresh database starts with nothing to announce

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** the нагадування loads as off, no сповіщення is outstanding, and each can be stored
