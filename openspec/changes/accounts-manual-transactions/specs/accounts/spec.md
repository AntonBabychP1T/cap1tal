# accounts Delta

## ADDED Requirements

### Requirement: An account is archived, never deleted

The system SHALL archive an account instead of deleting it, and SHALL unarchive an archived
account. An archived account SHALL keep its transactions and its computed balance, and SHALL NOT
be offered as an account choice when a transaction is recorded, edited or retyped; an archived
account already on a stored transaction SHALL keep being shown on it. An account SHALL be
unarchived by default.

#### Scenario: Archiving keeps history and balance

- **WHEN** an account with transactions and a computed balance of 130000 minor units UAH is
  archived
- **THEN** its transactions remain and its computed balance is still 130000 minor units UAH

#### Scenario: An archived account is not offered for new transactions

- **WHEN** a new transaction is being recorded while one account is archived and another is not
- **THEN** only the unarchived account is offered as a choice

#### Scenario: Editing pickers also offer only unarchived accounts

- **WHEN** a stored витрата is retyped into a переказ while one account is archived
- **THEN** the archived account is not offered as the destination, though it keeps being shown
  on its own stored transactions

#### Scenario: Unarchiving restores the account

- **WHEN** an archived account is unarchived
- **THEN** it is offered again as an account choice for new transactions

### Requirement: The name and opening balance are editable; the kind and currency are not

The system SHALL allow changing an account's name (перейменування) and opening balance while
keeping its identity, transactions and kind; the system SHALL reject changing an account's kind
or currency after creation.

#### Scenario: Renaming keeps identity and history

- **WHEN** an account named "mono black" with transactions is renamed to "mono чорна"
- **THEN** it is the same account with the same transactions and computed balance, under the new
  name

#### Scenario: Editing the opening balance moves the computed balance

- **WHEN** an account with an opening balance of 0 and an expense of 30000 minor units UAH gets
  its opening balance changed to 100000 minor units UAH
- **THEN** its computed balance is 70000 minor units UAH

#### Scenario: Changing the kind is rejected

- **WHEN** an existing `spending` account is updated with kind `savings`
- **THEN** the update is rejected with an error

#### Scenario: Changing the currency is rejected

- **WHEN** an existing UAH account is updated with currency USD
- **THEN** the update is rejected with an error
