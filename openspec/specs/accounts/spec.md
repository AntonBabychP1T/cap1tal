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
