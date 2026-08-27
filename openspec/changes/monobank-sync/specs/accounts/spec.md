## ADDED Requirements

### Requirement: Звірити creates a коригування for the difference

Given a рахунок's розрахунковий баланс and an actual balance in the рахунок's currency — the
баланс банку of a linked рахунок, or a recount the owner made — звірити SHALL create a
коригування on that рахунок, dated today, whose signed amount is the actual balance minus the
розрахунковий баланс, so that afterwards the розрахунковий баланс equals the actual balance
and every hryvnia stays explained. WHEN the two balances are equal, звірити SHALL create
nothing. An actual balance in a currency other than the рахунок's SHALL be rejected.

#### Scenario: A shortfall becomes a negative коригування

- **WHEN** a UAH рахунок's розрахунковий баланс is 47000 minor units and звірити is given an
  actual balance of 45000 minor units UAH
- **THEN** a коригування of −2000 minor units UAH dated today is created on that рахунок, its
  розрахунковий баланс becomes 45000 minor units UAH, and the month counts 2000 minor units
  UAH as spent in «Коригування»

#### Scenario: A surplus becomes a positive коригування

- **WHEN** a UAH рахунок's розрахунковий баланс is 47000 minor units and звірити is given an
  actual balance of 50000 minor units UAH
- **THEN** a коригування of +3000 minor units UAH dated today is created, and the month counts
  3000 minor units UAH as дохід

#### Scenario: Equal balances create nothing

- **WHEN** звірити is given an actual balance equal to the розрахунковий баланс
- **THEN** no коригування is created

#### Scenario: A foreign-currency actual balance is rejected

- **WHEN** звірити on a UAH рахунок is given an actual balance in USD
- **THEN** it is rejected and no коригування is created
