## ADDED Requirements

### Requirement: A breakdown row carries its категорія's іконка

Each row of «Витрачено за категоріями» SHALL lead with its категорія's іконка — the reserved rows
their fixed ones, an archived категорія its own — beside the категорія's назва, in the same neutral
tone for every категорія and in the over-limit red when the row is over its ліміт. The row's сума,
its bar, its place in the order and its over-limit mark SHALL NOT depend on the іконка, and no
chart SHALL be drawn from іконки. The drill-down list a row opens SHALL show each транзакція with
the transaction line of the feed.

#### Scenario: Breakdown rows show their іконки

- **WHEN** August holds витрати in Groceries, which carries «Продукти», and in «Без категорії», and
  a коригування of −3000 minor units UAH
- **THEN** the Groceries row leads with «Продукти», the «Без категорії» row with «Питання» and the
  «Коригування» row with «Плюс-мінус», each with its сума and bar as before

#### Scenario: An over-limit row turns its іконка red with its name

- **WHEN** Groceries is over its ліміт for August in UAH
- **THEN** the UAH Groceries row's іконка, назва and сума are drawn in the over-limit red, and a
  row under its ліміт is drawn in the neutral tone

#### Scenario: Only the over-limit currency's row turns its іконка red

- **WHEN** Groceries carries a UAH ліміт it is over for August, and August also holds Groceries
  витрати in USD
- **THEN** the UAH Groceries row's іконка is drawn in the over-limit red and the USD Groceries row's
  іконка in the neutral tone, both the same «Продукти»

#### Scenario: The order does not follow the іконка

- **WHEN** the owner changes the іконка of the largest категорія of August
- **THEN** the breakdown keeps the same rows in the same order with the same суми and bars

#### Scenario: The drill-down shows the feed's line

- **WHEN** the owner taps the Groceries row of August
- **THEN** each Groceries транзакція of August is listed leading with «Продукти», a повернення among
  them saying «повернення»
