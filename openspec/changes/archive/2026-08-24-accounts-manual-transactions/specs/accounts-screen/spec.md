# accounts-screen Delta

## Purpose

The Рахунки screen — every account with its розрахунковий баланс, grouped by вид, and the place
where accounts are created, renamed and archived. It answers "where the money sits" from
transactions alone.

## ADDED Requirements

### Requirement: Accounts are shown grouped by kind with their computed balance

The Рахунки screen SHALL show every account under its вид, each with its розрахунковий баланс in
the account's own currency; archived accounts SHALL be shown apart from the active ones, not
mixed into their kind groups.

#### Scenario: An account shows its computed balance

- **WHEN** a UAH account has an opening balance of 100000 minor units and one expense of 30000
  minor units UAH
- **THEN** the Рахунки screen shows it with a balance of 70000 minor units UAH

#### Scenario: Accounts group by kind, archived apart

- **WHEN** the owner has an active `spending` account, an active `savings` account and an
  archived `spending` account
- **THEN** the two active accounts appear each under its вид and the archived one appears in a
  separate archived group

### Requirement: An account can be created from the screen

The owner SHALL create an account by giving a назва, a вид (`spending`, `savings`, `investment`,
`cash`, `debt`) and a валюта offered from UAH, EUR and USD; the початковий залишок SHALL be
optional and default to zero. The created account SHALL appear on the screen and be offered when
a transaction is recorded.

#### Scenario: A created account is usable immediately

- **WHEN** the owner creates a `cash` account "гаманець" in UAH without an opening balance
- **THEN** it appears under its вид with a balance of 0 minor units UAH and is offered as an
  account choice when recording a transaction

#### Scenario: The screen invites the first рахунок

- **WHEN** the owner opens Рахунки while no account exists
- **THEN** no вид groups and no archived group are shown, and the screen offers creating the
  first рахунок

### Requirement: An account can be renamed and archived from the screen

From an account on the screen the owner SHALL be able to rename it, edit its opening balance,
archive it, and unarchive an archived one — with the semantics the accounts capability defines;
no delete action SHALL exist.

#### Scenario: Renaming is immediately visible

- **WHEN** the owner renames "mono black" to "mono чорна"
- **THEN** the screen shows the account under the new name with its balance unchanged

#### Scenario: Archiving moves the account to the archived group

- **WHEN** the owner archives an account
- **THEN** it leaves its kind group for the archived group, its balance still shown
