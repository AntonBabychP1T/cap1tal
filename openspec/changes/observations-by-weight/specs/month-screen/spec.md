## MODIFIED Requirements

### Requirement: Місяць states the shown month's спостереження

WHEN the shown month holds at least one транзакція, Місяць SHALL show a «Спостереження» block
directly beneath the breakdown by category, before any block of the month's платежі. The block SHALL list the
спостереження of the shown month in the order the observations capability defines, each leading
where that capability says: the first five in that order, with one «Ще N» that shows the remaining N
in place. A можливий дубль SHALL carry its «Не дубль» answer, which takes
effect in place.

The current month SHALL show the current month's спостереження, and a завершений активний місяць
its own. A month with none SHALL say so in one sentence. A month with no транзакція SHALL show no
block.

The block SHALL change none of the six numbers, the breakdown or any other block shown with it.

#### Scenario: October's спостереження on Місяць

- **WHEN** Місяць shows October 2026, which has a Netflix price change of 34900 minor units UAH
  against the usual 29900, and Кафе at 420000 minor units UAH already above September's whole of
  390000
- **THEN** the block lists both beneath the breakdown, Кафе first: its money weight of 30000 minor
  units UAH is larger than the price change's 5000

#### Scenario: Stepping back shows the past month's own

- **WHEN** the owner steps back to September 2026, which has Продукти above its типова сума
- **THEN** the block lists the спостереження of September, and no спостереження about «already
  more than last month» is among them

#### Scenario: Ten facts are five and «Ще 5»

- **WHEN** Місяць shows вересень 2026 with ten спостереження «проти типової суми» in UAH and no
  дубль
- **THEN** the block lists the five with the largest difference from their типова сума and «Ще 5»,
  which shows the other five without leaving Місяць

#### Scenario: A quiet month says so

- **WHEN** the shown month holds транзакції and has no спостереження
- **THEN** the block says there is nothing unusual in that month
