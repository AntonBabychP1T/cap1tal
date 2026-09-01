## ADDED Requirements

### Requirement: The money held is the per-currency total of the accounts' balances

The money held SHALL be the sum of the розрахунковий баланс of every unarchived рахунок,
totalled separately per currency; amounts in different currencies SHALL NOT be added into one
number. The same total SHALL also be available per вид рахунку, so that money in hand is
separable from money that is saved, invested or lent. An archived рахунок SHALL NOT count toward
any of those totals. A рахунок whose розрахунковий баланс is negative SHALL be counted with its
sign, never dropped or clamped: the total says what the accounts hold, not what the owner wishes
they held. The money held is a reading of balances, not a monthly number — it SHALL NOT be
derived from, or take the place of, витрачено, дохід or залишилось.

#### Scenario: Two accounts of the same currency add up

- **WHEN** an unarchived `spending` рахунок holds 705000 minor units UAH and an unarchived
  `savings` рахунок holds 600000 minor units UAH
- **THEN** the money held is 1305000 minor units UAH, and the `spending` вид totals 705000 minor
  units UAH while the `savings` вид totals 600000 minor units UAH

#### Scenario: Currencies stay apart

- **WHEN** an unarchived UAH рахунок holds 705000 minor units and an unarchived USD рахунок holds
  20000 minor units
- **THEN** the money held is 705000 minor units UAH and 20000 minor units USD, as two numbers,
  and no single combined number is produced

#### Scenario: An archived рахунок counts toward nothing

- **WHEN** a рахунок holding 100000 minor units UAH is archived while an unarchived one holds
  705000 minor units UAH
- **THEN** the money held is 705000 minor units UAH and the archived рахунок's вид contributes
  nothing

#### Scenario: A рахунок-борг counts as what is still owed

- **WHEN** an unarchived `spending` рахунок holds 705000 minor units UAH and an unarchived
  рахунок-борг holds 200000 minor units UAH
- **THEN** the money held is 905000 minor units UAH, of which the `debt` вид totals 200000 minor
  units UAH

#### Scenario: A negative balance is counted with its sign

- **WHEN** one unarchived UAH рахунок holds 705000 minor units and another holds −5000 minor
  units
- **THEN** the money held is 700000 minor units UAH
