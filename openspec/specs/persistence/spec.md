# persistence Specification

## Purpose

Keeps the owner's accounts and transactions on the device across app restarts — the stored history
that the computed balance, the monthly picture and every future screen read. Storage is faithful:
what comes back is exactly what was put in, down to the minor unit and currency code.
## Requirements
### Requirement: Accounts and transactions survive a restart

Stored accounts and transactions SHALL remain readable after storage is closed and reopened; the
data SHALL live only on the device.

#### Scenario: Reopening storage returns what was stored

- **WHEN** an account and an expense of 12550 minor units UAH on it are stored, and storage is
  closed and reopened
- **THEN** the account and the expense are read back with the same values

### Requirement: Every transaction type round-trips through storage unchanged

The system SHALL store and load every transaction type — `expense`, `income`, `transfer`,
`refund`, `correction` — returning exactly the values stored: the type, the date, the account or
accounts touched, integer minor-unit amounts with their currency codes, the category of an
expense or refund, the source of an income, both legs of a transfer, and the informational
original-currency amount of an expense when present. Loading an id that was never stored SHALL
return nothing, not an error.

#### Scenario: Expense with an original-currency amount round-trips

- **WHEN** an expense of 420000 minor units UAH with an original-currency amount of 10000 minor
  units USD is stored and loaded
- **THEN** the loaded expense holds 420000 minor units UAH, category unchanged, and the
  original-currency amount of 10000 minor units USD

#### Scenario: Cross-currency transfer round-trips with two legs and no rate

- **WHEN** a transfer that left a UAH card as 410000 minor units UAH and arrived at a USD account
  as 10000 minor units USD is stored and loaded
- **THEN** the loaded transfer holds both accounts and both amounts in their own currencies, and
  no exchange rate exists anywhere in storage

#### Scenario: Income, refund and correction round-trip

- **WHEN** an income of 5000000 minor units UAH with source "salary", a refund of 80000 minor
  units UAH in category "clothes", and a correction of −3000 minor units UAH are stored and loaded
- **THEN** each comes back with its type, amount, currency and category or source unchanged,
  including the correction's negative sign

#### Scenario: Loading an unknown id returns nothing

- **WHEN** a transaction id that was never stored is loaded
- **THEN** no transaction is returned and no error is raised

### Requirement: A stored transaction references stored accounts

The system SHALL reject storing a transaction that references an account id not present in
storage.

#### Scenario: A transaction referencing an unknown account is rejected

- **WHEN** an expense referencing an account id that does not exist in storage is stored
- **THEN** storage rejects it with an error

### Requirement: Migrations bring an empty database to the current shape

Applying every committed migration in order to an empty database SHALL produce storage that holds
accounts and every transaction type. Committed migrations SHALL never be edited; the schema
evolves only by adding new migrations.

#### Scenario: A fresh install starts from migrations alone

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** an account and one transaction of each of the five types can be stored and read back

### Requirement: A calendar month's transactions can be read

The system SHALL list the stored transactions of one calendar month; a transaction belongs to the
month of its date.

#### Scenario: Month boundaries are respected

- **WHEN** one expense is stored dated the last day of March and another the first day of April
- **THEN** listing March returns only the first and listing April returns only the second

### Requirement: An account's transactions can be read

The system SHALL list the stored transactions touching one account, including transfers where the
account is the source or the destination.

#### Scenario: Both transfer legs count as touching

- **WHEN** an account has a stored expense, a stored transfer arriving at it, and an unrelated
  transaction between two other accounts is also stored
- **THEN** listing the account's transactions returns the expense and the transfer, and not the
  unrelated transaction

### Requirement: A stored transaction can be replaced or removed

The system SHALL replace a stored transaction with an updated one under the same id, and SHALL
remove a stored transaction so that it no longer appears in any listing.

#### Scenario: Retyping an expense into a transfer keeps the id

- **WHEN** a stored expense is replaced under the same id by a transfer between two accounts
- **THEN** loading that id returns the transfer and the expense is gone

#### Scenario: A removed transaction disappears from listings

- **WHEN** a stored expense is removed
- **THEN** it no longer appears in the listing of its month or its account

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

