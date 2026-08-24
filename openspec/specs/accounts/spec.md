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
