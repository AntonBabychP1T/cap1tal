# monthly-picture Delta

## ADDED Requirements

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
