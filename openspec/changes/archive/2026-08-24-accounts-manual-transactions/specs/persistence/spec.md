# persistence Delta

## ADDED Requirements

### Requirement: The archived flag round-trips through storage

The system SHALL store whether an account is archived and return it unchanged on load; an account
stored without the flag SHALL load as unarchived. The flag SHALL be stored by a new migration —
committed migrations stay untouched.

#### Scenario: An archived account survives a restart

- **WHEN** an account is stored as archived, and storage is closed and reopened
- **THEN** the account loads as archived

#### Scenario: A fresh database from migrations alone stores the flag

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** an archived account and an unarchived account can be stored and read back with their
  flags intact

#### Scenario: A pre-migration account loads unarchived

- **WHEN** an account row stored under the previously committed migrations alone is brought to
  the current shape by the new migration and loaded
- **THEN** it loads unarchived, with its name, kind, currency and opening balance unchanged

### Requirement: The latest stored transactions can be listed

The system SHALL list the latest stored transactions up to a requested count, ordered by date,
newest date first; transactions of the same date SHALL be ordered by when they were stored, most
recently stored first. Replacing a stored transaction under its id SHALL NOT change its place
among transactions of the same date; a replacement carrying a different date SHALL take the place
its new date gives it.

#### Scenario: Newest date comes first

- **WHEN** an expense dated 2026-08-20 and an expense dated 2026-08-24 are stored, and the latest
  transactions are listed
- **THEN** the expense dated 2026-08-24 comes before the expense dated 2026-08-20

#### Scenario: Same-date transactions are ordered by storage recency

- **WHEN** two expenses with the same date are stored one after the other
- **THEN** the one stored second comes first in the latest listing

#### Scenario: The requested count is respected

- **WHEN** three transactions are stored and the latest two are requested
- **THEN** exactly the two latest are returned, in order

#### Scenario: Replacing a transaction keeps its place

- **WHEN** two same-date expenses are stored one after the other, and the first-stored one is
  then replaced under its id with a changed amount
- **THEN** the second-stored expense still comes first in the latest listing

#### Scenario: A replacement with a new date takes its new place

- **WHEN** an expense dated 2026-08-20 and an expense dated 2026-08-24 are stored, and the one
  dated 2026-08-20 is then replaced under its id with the date 2026-08-25
- **THEN** the replaced expense comes first in the latest listing
