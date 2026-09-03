## MODIFIED Requirements

### Requirement: A category's month states its сума and how far it is over its ліміт

The list a breakdown row opens SHALL state the category's own витрачено for that month per
currency — the same сума the breakdown row carries — above its транзакції. WHEN the category is
over its ліміт for that month per the limits capability, the list SHALL also state by how much it
is over, in the ліміт's currency: the сума spent minus the ліміт. A category that is not over its
ліміт — under it, exactly at it, or carrying none — SHALL state no overrun. The stated сума SHALL
hold every currency the list shows, each apart, while the overrun is stated for the ліміт's
currency alone.

This list is where a ціль витрат is read, so it SHALL also state the settled verdict of a month
that has ended: WHEN the shown month is earlier than the current one and the category carries a
ліміт it did not exceed in that month, the list SHALL state that the month finished within the
ліміт. For the current month, which is still being spent, no such verdict SHALL be stated — only
the сума and, where there is one, the overrun.

#### Scenario: The category's own сума is stated

- **WHEN** the owner opens Groceries for August, which holds Groceries витрати of 260000 minor
  units UAH
- **THEN** the list states витрачено 260000 minor units UAH for Groceries in August

#### Scenario: An over-limit category says by how much

- **WHEN** Groceries carries a ліміт of 250000 minor units UAH and August's Groceries витрати are
  260000 minor units UAH
- **THEN** the list states that the ліміт is exceeded by 10000 minor units UAH

#### Scenario: Spending at the ліміт states no overrun

- **WHEN** August's Groceries витрати are exactly the ліміт of 250000 minor units UAH
- **THEN** the list states the сума and no overrun

#### Scenario: A category with no ліміт states no overrun

- **WHEN** the owner opens a category carrying no ліміт
- **THEN** the list states the сума and no overrun

#### Scenario: Two currencies are stated apart

- **WHEN** August holds Groceries витрати in UAH and in USD and Groceries is over its UAH ліміт
- **THEN** the list states a UAH сума and a USD сума separately, and the overrun in UAH only

#### Scenario: A month that ended within the ліміт says so

- **WHEN** the owner opens Ресторани for August, which has ended, where Ресторани carries a ліміт
  of 200000 minor units UAH and August's Ресторани витрати are 180000 minor units UAH
- **THEN** the list states that August finished within the ліміт

#### Scenario: The current month gets no settled verdict

- **WHEN** the owner opens Ресторани for the current month, its витрати being below the ліміт
- **THEN** the list states the сума and no verdict — the month is not over

#### Scenario: A month that ended over the ліміт states its overrun, not a verdict of keeping it

- **WHEN** the owner opens Ресторани for August, which ended with витрати of 248000 minor units UAH
  against a ліміт of 200000
- **THEN** the list states that the ліміт is exceeded by 48000 minor units UAH and does not state
  that the month finished within it
