## ADDED Requirements

### Requirement: The filters leave the list on the first screen

On «Транзакції», each existing narrowing — рахунок, the «Без категорії» narrowing, and місяць —
SHALL take one row that scrolls sideways, whatever the number of its choices, with the choice in
force visible in that row when the screen opens. The рахунок row SHALL lead with the рахунки the
latest транзакції touched, in the order of that use, followed by the rest in their usual order, so
the рахунки in daily use are reachable without scrolling the row. No new narrowing is added. With the search empty
and no narrowing, at least the first транзакція SHALL be visible without scrolling on a 360 × 640
dp Android viewport at the default font.

#### Scenario: Thirty рахунки and twenty-four months

- **WHEN** the owner holds 29 рахунки and 24 months of history and opens «Транзакції»
- **THEN** the search, one row of рахунки, one row holding «Всі» and «Без категорії», and one row
  of місяці are shown, followed by the newest транзакція, without scrolling

#### Scenario: A choice further along the row stays reachable

- **WHEN** the owner scrolls the рахунок row sideways and picks «гаманець»
- **THEN** only транзакції touching «гаманець» are shown and «гаманець» is visibly chosen

#### Scenario: The рахунки in use lead the row

- **WHEN** the latest транзакції were on «гаманець», then «РЕЗЕРВ», then «mono white», and the
  owner opens «Транзакції»
- **THEN** the рахунок row reads «Всі», «гаманець», «РЕЗЕРВ», «mono white» and then the other
  рахунки in their usual order
