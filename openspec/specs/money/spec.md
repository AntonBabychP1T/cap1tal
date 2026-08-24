# money Specification

## Purpose

Defines how a money amount is represented and combined everywhere in the product: integer minor
units with a currency code, and the rules that keep amounts of different currencies apart.

## Requirements

### Requirement: Money is an integer amount in minor units with a currency code

A money amount SHALL be an integer number of minor units (kopiykas, cents) together with an
ISO-4217 currency code. A non-integer amount SHALL be rejected.

#### Scenario: Creating a valid amount

- **WHEN** an amount of 12550 minor units in UAH is created
- **THEN** it holds exactly 12550 minor units and the currency code UAH

#### Scenario: Rejecting a fractional amount

- **WHEN** an amount of 125.5 minor units is created
- **THEN** creation is rejected with an error

### Requirement: Money supports negative amounts

A money amount SHALL be allowed to be negative, so that refunds, negative corrections and negative
monthly nets (e.g. invested) can be represented.

#### Scenario: A negative amount is valid

- **WHEN** an amount of −5000 minor units in UAH is created
- **THEN** it holds exactly −5000 minor units in UAH

### Requirement: Arithmetic only within one currency

The system SHALL add and subtract money amounts only when both amounts carry the same currency
code; combining amounts of different currencies SHALL be rejected.

#### Scenario: Adding two amounts of the same currency

- **WHEN** 10000 minor units UAH is added to 2500 minor units UAH
- **THEN** the result is 12500 minor units UAH

#### Scenario: Cross-currency sum is rejected

- **WHEN** an amount in UAH is added to an amount in USD
- **THEN** the operation is rejected with an error
