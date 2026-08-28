## ADDED Requirements

### Requirement: The feed marks a category over its ліміт

WHEN a feed line shows a category that is over its ліміт for the calendar month of that
транзакція's date, in the ліміт's currency, per the limits capability, the category SHALL be
visibly marked over limit (red) on that line — on витрати and повернення alike, since it is the
category that is over, not the line. The mark follows each транзакція's own month: the same
category unmarked on a line dated in a month where it is not over. The over-limit mark SHALL NOT
replace the «Без категорії» highlight — a line may carry both. Lines showing no category — a
переказ, a дохід — are never marked. The same marking SHALL apply wherever a category's
month-scoped транзакції are listed with the feed's line, the Місяць breakdown drill-down
included.

#### Scenario: A витрата in an over-limit category is marked

- **WHEN** Groceries carries a ліміт of 250000 minor units UAH, August's spent in Groceries is
  260000 minor units UAH in UAH, and the feed holds a Groceries витрата dated in August
- **THEN** that line shows Groceries visibly marked over limit

#### Scenario: A line in an under-limit month is not marked

- **WHEN** Groceries is over its ліміт for August and under it for July, and the feed holds a
  Groceries витрата dated in July
- **THEN** the July line shows Groceries unmarked

#### Scenario: A транзакція in another currency is judged by the ліміт's currency

- **WHEN** Groceries carries a UAH ліміт, August's UAH spent in Groceries is under it, and the
  feed holds an August Groceries витрата in USD
- **THEN** that line shows Groceries unmarked, whatever the USD amounts are

#### Scenario: The «Без категорії» highlight and the over-limit mark coexist

- **WHEN** «Без категорії» carries a ліміт, is over it for August, and the feed holds an August
  витрата in «Без категорії»
- **THEN** the line still carries the one-tap categorisation mark and shows the category over
  limit
