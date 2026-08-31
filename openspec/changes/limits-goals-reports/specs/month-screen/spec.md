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

### Requirement: Each breakdown row carries a bar sized against the month's largest категорія

For the shown month the Місяць screen SHALL draw beside each breakdown row a bar whose length is
that row's amount as a fraction of the largest amount among the rows of the same currency, so the
month's largest категорія fills its track and the rest are read against it. Each currency's rows
SHALL be measured against that currency's own largest, never across currencies. A row whose amount
is zero or less — a категорія a повернення pulled to or below zero — SHALL get no bar, and when the
largest amount of a currency's rows is itself zero or less no row of that currency SHALL get one.
The bar states no number of its own: it is the shape of the same amounts the rows already show, and
the bar of a row marked over its ліміт carries that same mark.

#### Scenario: The largest fills its track and the rest read against it

- **WHEN** August's UAH breakdown holds 100000 minor units in Groceries, 50000 in «Без категорії»
  and 25000 in transport
- **THEN** the Groceries bar is full, the «Без категорії» bar is half of the track and the
  transport bar is a quarter of it

#### Scenario: Each currency is measured against its own largest, never across currencies

- **WHEN** August holds 100000 minor units UAH and 1000 minor units USD of Groceries витрати
- **THEN** the Groceries bar is full in the UAH group and full in the USD group

#### Scenario: A категорія a повернення pushed below zero gets no bar

- **WHEN** August's UAH breakdown holds 100000 minor units in Groceries and transport stands at
  −20000 minor units after a повернення
- **THEN** the transport row gets no bar
