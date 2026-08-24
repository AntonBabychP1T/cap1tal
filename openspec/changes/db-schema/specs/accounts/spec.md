# accounts

## ADDED Requirements

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
