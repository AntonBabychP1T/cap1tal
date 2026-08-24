# monthly-picture

## Purpose

Defines the per-currency numbers for a calendar month — spent, invested, saved, lent, income,
left — that answer the two product questions: where the money went and how much can still be spent.

## ADDED Requirements

### Requirement: The period is the calendar month

Monthly numbers SHALL be computed for a calendar month; a transaction SHALL belong to the month of
its date.

#### Scenario: Transactions fall into the month of their date

- **WHEN** one expense is dated the last day of March and another the first day of April
- **THEN** the March picture includes only the first and the April picture only the second

### Requirement: Monthly numbers are computed per currency

The system SHALL compute every monthly number separately per currency and SHALL NOT sum amounts of
different currencies into one number.

#### Scenario: Two currencies stay apart

- **WHEN** a month contains expenses in UAH and expenses in USD
- **THEN** the picture holds a spent number in UAH and a separate spent number in USD, and no
  combined total across currencies

### Requirement: Spent is expenses net of refunds

Spent for a month SHALL be the month's expenses — including uncategorised expenses, fees and
negative corrections — minus the month's refunds.

#### Scenario: Refund reduces spent

- **WHEN** a month has expenses of 500000 minor units UAH and a refund of 80000 minor units UAH
- **THEN** spent is 420000 minor units UAH

#### Scenario: Negative correction is spent

- **WHEN** a month has a correction of −3000 minor units UAH and no other transactions
- **THEN** spent is 3000 minor units UAH

### Requirement: Invested is the net of transfers into investment accounts

Invested for a month SHALL be transfers into `investment` accounts minus transfers out of them, and
MAY be negative when more came back than went in.

#### Scenario: Return exceeds contributions

- **WHEN** a month has a transfer of 100000 minor units UAH into an investment account and a
  transfer of 150000 minor units UAH back from it
- **THEN** invested is −50000 minor units UAH

### Requirement: Saved is the net of transfers into savings accounts

Saved for a month SHALL be transfers into `savings` accounts minus transfers out of them.

#### Scenario: Jar top-up and withdrawal

- **WHEN** a month has a transfer of 200000 minor units UAH into a jar and a transfer of 50000
  minor units UAH out of it
- **THEN** saved is 150000 minor units UAH

### Requirement: Lent is the net of transfers into debt accounts

Lent for a month SHALL be transfers into `debt` accounts minus transfers out of them, so repayment
of principal reduces lent.

#### Scenario: Lending and partial repayment

- **WHEN** a month has a transfer of 300000 minor units UAH into a debt account and a transfer of
  100000 minor units UAH back from it
- **THEN** lent is 200000 minor units UAH

### Requirement: Transfer legs decide the amount and currency of saved, invested and lent

A transfer whose destination account kind is `savings`, `investment` or `debt` SHALL increase the
matching number — saved, invested or lent; a transfer whose source account kind is `savings`,
`investment` or `debt` SHALL decrease it. Between accounts of different currencies the
contribution SHALL be measured by the opposite leg, in that leg's currency: destination-classified
→ the amount that left, in the source currency, so money moved into a jar or lent out never looks
available in the currency it was paid from; source-classified → the amount that arrived, in the
destination currency. Between accounts of the same currency the contribution SHALL be measured by
the classified account's own leg — destination-classified → the amount that arrived,
source-classified → the amount that left — so a shortfall is accounted for exactly by its proposed
fee expense.

#### Scenario: UAH top-up of a USD jar is saved in UAH

- **WHEN** a transfer leaves a UAH card as 410000 minor units UAH and arrives at a USD jar as
  10000 minor units USD
- **THEN** saved increases by 410000 minor units UAH and no monthly number changes in USD

#### Scenario: Jar top-up arriving short is saved at what arrived

- **WHEN** a UAH transfer leaves a card as 100000 minor units and arrives at a jar as 99500 minor
  units, and the proposed fee of 500 minor units is recorded as an expense
- **THEN** saved increases by 99500 minor units UAH, spent increases by 500 minor units UAH, and
  left decreases by exactly 100000 minor units UAH

#### Scenario: Money back from a USD jar reduces saved in UAH

- **WHEN** a transfer leaves a USD jar as 10000 minor units USD and arrives at a UAH card as
  400000 minor units UAH
- **THEN** saved decreases by 400000 minor units UAH and no monthly number changes in USD

### Requirement: Income is all income of the month including positive corrections

Income for a month SHALL be all `income` transactions of the month — whatever the source, interest
included — plus positive corrections.

#### Scenario: Positive correction joins income

- **WHEN** a month has an income of 5000000 minor units UAH with source "salary" and a correction
  of +3000 minor units UAH
- **THEN** income is 5003000 minor units UAH

### Requirement: Left is income minus spent, invested, saved and lent

Left for a month SHALL equal income − spent − invested − saved − lent, per currency; equivalently
income = spent + invested + saved + lent + left SHALL hold for every currency and any set of
transactions.

#### Scenario: Money moved into a jar or lent out is not available

- **WHEN** a month in UAH has income 5000000, spent 2000000, invested 500000, saved 1000000 and
  lent 300000, all in minor units
- **THEN** left is 1200000 minor units UAH

#### Scenario: The identity holds for any transactions

- **WHEN** the monthly picture is computed for an arbitrary set of transactions and accounts
- **THEN** income = spent + invested + saved + lent + left holds in every currency of the picture
