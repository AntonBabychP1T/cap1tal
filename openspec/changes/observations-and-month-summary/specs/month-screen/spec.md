## ADDED Requirements

### Requirement: A finished month on Місяць leads to its підсумок

WHEN the shown month is a завершений активний місяць, Місяць SHALL offer «Підсумок <місяця>»
directly beneath the month's name, above its numbers, leading to that month's підсумок. The
current month and a month with no транзакція SHALL offer none. Stepping to another month SHALL
offer that month's, or none.

#### Scenario: September offers its підсумок

- **WHEN** today is 2026-10-02 and the owner steps Місяць back to September 2026, which holds
  транзакції
- **THEN** «Підсумок вересня» is offered above September's numbers and opens the підсумок of
  September

#### Scenario: The current month offers none

- **WHEN** Місяць shows October 2026 on 2026-10-02
- **THEN** no «Підсумок» is offered

#### Scenario: An empty month offers none

- **WHEN** Місяць shows a past month that holds no транзакція
- **THEN** no «Підсумок» is offered, and the empty month's own offer of the previous month is
  unchanged

### Requirement: Місяць states the shown month's спостереження

WHEN the shown month holds at least one транзакція, Місяць SHALL show a «Спостереження» block
directly beneath the breakdown by category, before any block of the month's платежі. The block SHALL list every
спостереження of the shown month, in the order the observations capability defines, each leading
where that capability says. A можливий дубль SHALL carry its «Не дубль» answer, which takes
effect in place.

The current month SHALL show the current month's спостереження, and a завершений активний місяць
its own. A month with none SHALL say so in one sentence. A month with no транзакція SHALL show no
block.

The block SHALL change none of the six numbers, the breakdown or any other block shown with it.

#### Scenario: October's спостереження on Місяць

- **WHEN** Місяць shows October 2026, which has a Netflix price change and Кафе already above
  September's whole
- **THEN** the block lists both, the price change first, beneath the breakdown

#### Scenario: Stepping back shows the past month's own

- **WHEN** the owner steps back to September 2026, which has Продукти above its типова сума
- **THEN** the block lists the спостереження of September, and no спостереження about «already
  more than last month» is among them

#### Scenario: A quiet month says so

- **WHEN** the shown month holds транзакції and has no спостереження
- **THEN** the block says there is nothing unusual in that month
