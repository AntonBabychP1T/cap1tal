## ADDED Requirements

### Requirement: An over-limit category is marked in the breakdown

WHEN the shown month's breakdown holds a category that is over its ліміт for that month per the
limits capability, the breakdown's showing of that category's amount in the ліміт's currency
SHALL be visibly marked over limit (red). The showing of the same category's amount in any other
currency SHALL NOT be marked, and a category that is not over its ліміт — under it, exactly at
it, or carrying none — SHALL NOT be marked. The mark follows the shown month: stepping to a
month where the category is not over shows it unmarked.

#### Scenario: An over-limit row is red

- **WHEN** Groceries carries a ліміт of 250000 minor units UAH, August's spent in Groceries is
  260000 minor units UAH, and the owner opens August
- **THEN** the Groceries amount in UAH is visibly marked over limit

#### Scenario: Spending at the ліміт is not marked

- **WHEN** August's spent in Groceries is exactly its ліміт of 250000 minor units UAH
- **THEN** the Groceries row is not marked over limit

#### Scenario: Another currency's amount stays unmarked

- **WHEN** Groceries is over its UAH ліміт for August and August also holds Groceries витрати in
  USD
- **THEN** the Groceries amount in UAH is marked and the Groceries amount in USD is not

#### Scenario: The mark follows the shown month

- **WHEN** Groceries is over its ліміт for August and under it for July, and the owner steps
  from August to July
- **THEN** July's Groceries row is not marked
