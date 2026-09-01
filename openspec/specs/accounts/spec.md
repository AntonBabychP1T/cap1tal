# accounts Specification

## Purpose

Defines the account — a place money sits — and the five account kinds. The kind, not the name,
decides how money moving into the account is classified in the monthly picture.
## Requirements
### Requirement: Every account has exactly one kind and one currency

An account SHALL have exactly one kind — `spending`, `savings`, `investment`, `cash`, or `debt` —
and exactly one currency code.

#### Scenario: A jar is a savings account in UAH

- **WHEN** an account is defined with kind `savings` and currency UAH
- **THEN** the account holds kind `savings` and currency UAH

### Requirement: The account kind decides how a transfer is classified

The system SHALL classify a transfer by the kinds of its two accounts, never by their names: a
destination of kind `savings`, `investment` or `debt` adds to saved, invested or lent
respectively; a source of kind `savings`, `investment` or `debt` subtracts from saved, invested
or lent; `spending` and `cash` ends contribute nothing. The amounts and currencies of these
contributions are defined by the monthly-picture capability.

#### Scenario: Jar top-up is saved, not invested

- **WHEN** a transfer goes from a `spending` account into a `savings` account (a jar)
- **THEN** it is classified as saved

#### Scenario: Transfer to an investment account is invested

- **WHEN** a transfer goes from a `spending` account into an `investment` account
- **THEN** it is classified as invested

#### Scenario: Lending is lent

- **WHEN** a transfer goes from a `spending` account into a `debt` account
- **THEN** it is classified as lent

#### Scenario: Withdrawing from a jar subtracts from saved

- **WHEN** a transfer goes from a `savings` account (a jar) into a `spending` account
- **THEN** it subtracts from saved

#### Scenario: ATM withdrawal is only a move

- **WHEN** a transfer goes from a `spending` account into a `cash` account
- **THEN** it has no monthly classification — it is neither spent, saved, invested nor lent

#### Scenario: Card to card is only a move

- **WHEN** a transfer goes from a `spending` account into another `spending` account
- **THEN** it has no monthly classification

### Requirement: An account has an opening balance

An account SHALL have an opening balance in its own currency; when none is given it SHALL be zero.
An opening balance in a currency other than the account's SHALL be rejected.

#### Scenario: The opening balance defaults to zero

- **WHEN** an account is created without an opening balance and has no transactions
- **THEN** its computed balance is 0 minor units in the account's currency

#### Scenario: A mismatched opening-balance currency is rejected

- **WHEN** a UAH account is created with an opening balance of 10000 minor units USD
- **THEN** creation is rejected with an error

### Requirement: The balance is computed from the opening balance and every transaction

The system SHALL compute an account's balance (розрахунковий баланс) as the opening balance plus
the effect of every transaction touching the account: an `expense` subtracts its amount, an
`income` adds its amount, a `refund` adds its amount, a `correction` adds its signed amount, and a
`transfer` subtracts what left from the source account and adds what arrived at the destination
account. The system SHALL NOT store a balance; balances that transactions cannot explain do not
exist. A transaction whose amount touching the account carries a currency other than the
account's SHALL be rejected — amounts of different currencies never combine.

#### Scenario: Expenses, income and refunds move the balance

- **WHEN** a UAH account opens with 100000 minor units, then records an income of 50000, an
  expense of 30000 and a refund of 10000 minor units UAH
- **THEN** its computed balance is 130000 minor units UAH

#### Scenario: A correction moves the balance by its signed amount

- **WHEN** a UAH account opens with 50000 minor units and records a correction of −3000 minor
  units UAH
- **THEN** its computed balance is 47000 minor units UAH

#### Scenario: A cross-currency transfer moves both balances in their own currencies

- **WHEN** a transfer leaves a UAH card as 410000 minor units UAH and arrives at a USD account as
  10000 minor units USD
- **THEN** the card's computed balance decreases by 410000 minor units UAH and the USD account's
  computed balance increases by 10000 minor units USD

#### Scenario: A foreign-currency amount on the account is rejected

- **WHEN** a UAH account's transactions include an expense of 10000 minor units USD
- **THEN** computing the balance is rejected with an error

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

### Requirement: Звірити creates a коригування for the difference

Given a рахунок's розрахунковий баланс and an actual balance in the рахунок's currency — the
баланс банку of a linked рахунок, or a recount the owner made — звірити SHALL create a
коригування on that рахунок, dated today, whose signed amount is the actual balance minus the
розрахунковий баланс, so that afterwards the розрахунковий баланс equals the actual balance
and every hryvnia stays explained. WHEN the two balances are equal, звірити SHALL create
nothing. An actual balance in a currency other than the рахунок's SHALL be rejected.

#### Scenario: A shortfall becomes a negative коригування

- **WHEN** a UAH рахунок's розрахунковий баланс is 47000 minor units and звірити is given an
  actual balance of 45000 minor units UAH
- **THEN** a коригування of −2000 minor units UAH dated today is created on that рахунок, its
  розрахунковий баланс becomes 45000 minor units UAH, and the month counts 2000 minor units
  UAH as spent in «Коригування»

#### Scenario: A surplus becomes a positive коригування

- **WHEN** a UAH рахунок's розрахунковий баланс is 47000 minor units and звірити is given an
  actual balance of 50000 minor units UAH
- **THEN** a коригування of +3000 minor units UAH dated today is created, and the month counts
  3000 minor units UAH as дохід

#### Scenario: Equal balances create nothing

- **WHEN** звірити is given an actual balance equal to the розрахунковий баланс
- **THEN** no коригування is created

#### Scenario: A foreign-currency actual balance is rejected

- **WHEN** звірити on a UAH рахунок is given an actual balance in USD
- **THEN** it is rejected and no коригування is created

### Requirement: The money held is the per-currency total of the accounts' balances

The money held SHALL be the sum of the розрахунковий баланс of every unarchived рахунок,
totalled separately per currency; amounts in different currencies SHALL NOT be added into one
number. The same total SHALL also be available per вид рахунку, so that money in hand is
separable from money that is saved, invested or lent. An archived рахунок SHALL NOT count toward
any of those totals. A рахунок whose розрахунковий баланс is negative SHALL be counted with its
sign, never dropped or clamped: the total says what the accounts hold, not what the owner wishes
they held. The money held is a reading of balances, not a monthly number — it SHALL NOT be
derived from, or take the place of, витрачено, дохід or залишилось.

#### Scenario: Two accounts of the same currency add up

- **WHEN** an unarchived `spending` рахунок holds 705000 minor units UAH and an unarchived
  `savings` рахунок holds 600000 minor units UAH
- **THEN** the money held is 1305000 minor units UAH, and the `spending` вид totals 705000 minor
  units UAH while the `savings` вид totals 600000 minor units UAH

#### Scenario: Currencies stay apart

- **WHEN** an unarchived UAH рахунок holds 705000 minor units and an unarchived USD рахунок holds
  20000 minor units
- **THEN** the money held is 705000 minor units UAH and 20000 minor units USD, as two numbers,
  and no single combined number is produced

#### Scenario: An archived рахунок counts toward nothing

- **WHEN** a рахунок holding 100000 minor units UAH is archived while an unarchived one holds
  705000 minor units UAH
- **THEN** the money held is 705000 minor units UAH and the archived рахунок's вид contributes
  nothing

#### Scenario: A рахунок-борг counts as what is still owed

- **WHEN** an unarchived `spending` рахунок holds 705000 minor units UAH and an unarchived
  рахунок-борг holds 200000 minor units UAH
- **THEN** the money held is 905000 minor units UAH, of which the `debt` вид totals 200000 minor
  units UAH

#### Scenario: A negative balance is counted with its sign

- **WHEN** one unarchived UAH рахунок holds 705000 minor units and another holds −5000 minor
  units
- **THEN** the money held is 700000 minor units UAH
