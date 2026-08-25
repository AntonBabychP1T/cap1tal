# transactions Specification (delta)

## MODIFIED Requirements

### Requirement: An expense carries a category; an income carries a source

An `expense` SHALL carry exactly one category. An `income` SHALL carry exactly one source.

A дохід's amount MAY be negative — money handed back out of an income rather than a fresh
arrival, which the Saldo history holds and the import brings over. Such a дохід SHALL reduce the
month's дохід and the рахунок's розрахунковий баланс by that amount, and SHALL NOT become a
витрата: it belongs to the джерело it came from, and no category would honestly name it.
Recording one by hand is not offered — the amount entered when recording is positive, as the
main-screen capability states — so a negative дохід can only arrive from an import.

#### Scenario: Income with a source

- **WHEN** an income of 5000000 minor units UAH with source "salary" is recorded
- **THEN** the transaction holds type `income`, amount 5000000 UAH and source "salary"

#### Scenario: An income handed back is a negative дохід

- **WHEN** a дохід of −27100 minor units UAH with source "Other income" is stored on a рахунок
- **THEN** the рахунок's розрахунковий баланс is 27100 minor units UAH lower, the month's дохід
  is 27100 minor units UAH lower, and no category holds any part of it
