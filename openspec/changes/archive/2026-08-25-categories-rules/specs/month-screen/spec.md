# month-screen Specification (delta)

## MODIFIED Requirements

### Requirement: Spent breaks down by category with tap-through to its transactions

For the shown month the Місяць screen SHALL list the categories of spent per the monthly-picture
breakdown, each with its per-currency amount. Tapping a category SHALL show that category's
transactions of the shown month — its витрати and повернення, and for the correction category all its
коригування of either sign, positive ones included even though only negative ones enter the
row's amount — and from that list a transaction SHALL open for editing exactly like from the
Головний feed. That list SHALL hold the category's transactions of every currency, not only the
currency of the row that was tapped: a category is one category, and each row already carries its
own amount. Category rows and the drill-down title SHALL show the category's name from the
editable list — «Без категорії», «Комісія» and «Коригування» for the reserved rows — and an
archived category SHALL appear like any other wherever its history is.

#### Scenario: The breakdown lists the categories of the month

- **WHEN** August holds expenses in «Без категорії» and a fee expense in «Комісія»
- **THEN** the breakdown shows a «Без категорії» row and a «Комісія» row with their amounts

#### Scenario: A category opens its month's transactions

- **WHEN** the owner taps «Без категорії» in the August breakdown
- **THEN** they see only the витрати and повернення of «Без категорії» dated in August

#### Scenario: A category's list is not split by currency

- **WHEN** August holds expenses of «Без категорії» in both UAH and USD, and the owner taps the
  UAH «Без категорії» row
- **THEN** they see the category's August витрати in both currencies, each shown in its own
  currency

#### Scenario: The correction list holds corrections of either sign

- **WHEN** August holds a коригування of −3000 and a коригування of +3000 minor units UAH
- **THEN** the «Коригування» row reads 3000 minor units UAH — only the negative one is spent —
  and tapping it lists both коригування

#### Scenario: A transaction in the category list opens for editing

- **WHEN** the owner taps a transaction in a category's list
- **THEN** the same editing that the Головний feed offers opens for that transaction

#### Scenario: A renamed category shows its new name

- **WHEN** the owner renames Groceries to «Продукти» and opens a month holding Groceries витрати
- **THEN** the breakdown row and its drill-down title read «Продукти»

#### Scenario: An archived category still shows its months

- **WHEN** the owner archives a category that holds витрати in August and opens August
- **THEN** the breakdown shows that category's row with its amount, like any other row
