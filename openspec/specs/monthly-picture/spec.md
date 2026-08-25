# monthly-picture Specification

## Purpose

Defines the per-currency numbers for a calendar month — spent, invested, saved, lent, income,
left — that answer the two product questions: where the money went and how much can still be spent.
## Requirements
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

### Requirement: Spent breaks down by category

For a month and per currency, spent SHALL break down by category: an expense adds to its
category, a refund subtracts from its category, and a negative correction adds to the correction
category. Nothing else contributes: a переказ is never spent whatever account it reaches, an
income is not spent, and a positive correction is income. Per currency, the category amounts
SHALL sum exactly to spent, a category's amount MAY be negative when its refunds exceed its
expenses, and amounts of different currencies SHALL NOT be summed into one category figure. A
category whose refunds cancel its expenses exactly SHALL keep its place in the breakdown at zero —
money did move there this month.

#### Scenario: The breakdown sums to spent

- **WHEN** a month has expenses of 300000 and 200000 minor units UAH in two categories and a
  refund of 50000 minor units UAH in the first
- **THEN** the breakdown holds 250000 and 200000 minor units UAH, and their sum equals the
  month's spent of 450000 minor units UAH

#### Scenario: A refund can push its category negative

- **WHEN** a month's only transactions in a category are an expense of 40000 and a refund of
  100000 minor units UAH
- **THEN** that category's amount is −60000 minor units UAH

#### Scenario: A negative correction lands in the correction category

- **WHEN** a month has a correction of −3000 minor units UAH
- **THEN** the breakdown holds 3000 minor units UAH in the correction category

#### Scenario: A positive correction stays out of the breakdown

- **WHEN** a month's only transaction is a correction of +3000 minor units UAH
- **THEN** the breakdown holds no amount for the correction category — a positive коригування is
  income, not spent

#### Scenario: One category keeps its currencies apart

- **WHEN** a month has expenses of one category in both UAH and USD
- **THEN** the breakdown holds a UAH amount and a separate USD amount for that category and no
  combined figure

#### Scenario: A transfer gets no row, whatever it reached

- **WHEN** a month holds a jar top-up, a transfer to an investment account and a loan out, and no
  expense at all
- **THEN** the breakdown holds no category and no amount, while відкладено, інвестовано and
  позичено carry those transfers — this is the distinction the breakdown exists to make visible

#### Scenario: A category that nets to zero keeps its place

- **WHEN** a month holds an expense of 80000 minor units UAH in a category and a refund of 80000
  minor units UAH in the same category
- **THEN** the breakdown holds that category at 0 minor units UAH rather than dropping it

### Requirement: The approximate UAH equivalent is a display-only conversion at the current rate

The approximate UAH equivalent of a monthly number SHALL be computed by converting each non-UAH
amount at monobank's current rate — the most recently obtained one — into integer minor units of
UAH, rounding to the nearest minor unit with halves away from zero, and summing the results with
the UAH amount. The rate used SHALL be the rate at which the bank buys the currency, which is what
the owner's foreign money is worth to them; the rate at which it sells answers a different
question and SHALL NOT be used. Where the bank offers no buying rate for a currency and quotes
only a cross rate, that cross rate MAY be used instead — it is the same question answered less
precisely, where the alternative is no approximation at all. The conversion SHALL be
display-only: no converted amount is ever stored, no transaction carries one, and no balance or
monthly number derives from one. The per-currency numbers SHALL remain the primary truth.

Each of the six numbers SHALL be approximated on its own. Because each is rounded separately, the
approximations MAY miss the identity дохід = витрачено + інвестовано + відкладено + позичено +
залишилось by a few minor units; that identity holds exactly of the per-currency numbers, which
are the truth, and the approximation SHALL NOT be bent to preserve it — deriving one approximate
number from the other five would only move the rounding error onto whichever number was derived,
while making it look exact.

#### Scenario: Conversion rounds to whole kopiykas

- **WHEN** 10000 minor units USD are converted at a monobank rate of 41.25345 UAH per USD
- **THEN** the approximate figure is 412535 minor units UAH

#### Scenario: A negative amount rounds away from zero

- **WHEN** −10000 minor units USD are converted at a monobank rate of 41.25345 UAH per USD
- **THEN** the approximate figure is −412535 minor units UAH

#### Scenario: UAH joins the approximation unchanged

- **WHEN** a month's spent is 100000 minor units UAH and 10000 minor units USD, and the USD rate
  is 41.25 UAH per USD
- **THEN** the approximate spent is 512500 minor units UAH, and spent itself stays two
  per-currency numbers

#### Scenario: Each number is approximated on its own

- **WHEN** a month's дохід is 3 minor units USD against витрачено, інвестовано and позичено of 1
  minor unit USD each, at a rate of 41.25345 UAH per USD
- **THEN** the approximate дохід is 124 minor units UAH while each approximate part is 41, so the
  parts sum to 123 — one kopiyka apart, and the per-currency numbers behind them still add up
  exactly

### Requirement: A missing rate yields no approximation

WHEN any non-UAH currency of a month's picture has no known monobank rate, the approximate UAH
equivalent SHALL be absent for that month rather than partial or guessed; the per-currency
numbers SHALL be unaffected.

#### Scenario: One unknown rate withholds the whole approximation

- **WHEN** a month's picture holds UAH, USD and EUR numbers and a rate is known for USD but not
  for EUR
- **THEN** no approximate UAH equivalent is produced for that month and every per-currency
  number is unchanged

