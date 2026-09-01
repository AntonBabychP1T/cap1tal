## MODIFIED Requirements

### Requirement: The Місяць screen shows the month's numbers per currency

The app SHALL offer a Місяць screen, placed between Головний and Рахунки. For the shown month it
SHALL display витрачено, інвестовано, відкладено, позичено, дохід and залишилось separately per
currency, exactly as the monthly-picture capability computes them from the stored transactions —
a currency appears only when some number of it moved that month, and no amounts of different
currencies are ever summed into one primary number. WHEN the shown month has no transactions the
screen SHALL say so plainly instead of showing an empty gap.

Within each currency's group one number SHALL be shown as the group's leading number. That number
SHALL be залишилось while the group's дохід is above zero, and витрачено while it is not; a group
led by витрачено SHALL also state plainly that no дохід is recorded for the shown month yet, so
the reason залишилось is not leading is on the screen rather than left to be guessed. Every one of
the six numbers SHALL be shown either way, under its own name and with its own сума: which number
leads is a matter of what is read first, never of what is shown. Залишилось SHALL keep its name and
its сума exactly as the monthly-picture capability computes it, negative sign included.

#### Scenario: Two currencies form two separate groups

- **WHEN** the shown month holds expenses in UAH and expenses in USD
- **THEN** the screen shows one group of monthly numbers in UAH and a separate group in USD, and
  no primary number combines the two currencies

#### Scenario: An empty month says it is empty

- **WHEN** the shown month has no transactions
- **THEN** the screen states the month has no transactions yet

#### Scenario: The numbers follow the records

- **WHEN** the owner records an expense dated in the shown month and returns to the Місяць screen
- **THEN** витрачено and залишилось reflect the new expense

#### Scenario: A month before its first дохід leads with витрачено

- **WHEN** the shown month holds UAH витрати of 265000 minor units and no дохід, so залишилось is
  −265000 minor units UAH
- **THEN** the UAH group leads with витрачено, states that no дохід is recorded for the month yet,
  and still shows залишилось as −265000 minor units UAH under its own name

#### Scenario: A month with дохід leads with залишилось

- **WHEN** the shown month holds UAH дохід of 5000000 minor units and UAH витрати of 265000 minor
  units
- **THEN** the UAH group leads with залишилось and says nothing about дохід being unrecorded

#### Scenario: Each currency decides its own leading number

- **WHEN** the shown month holds дохід in UAH and only витрати in USD
- **THEN** the UAH group leads with залишилось and the USD group leads with витрачено

## ADDED Requirements

### Requirement: An empty month states the previous month and leads to it

WHEN the shown month holds no транзакція and the calendar month before it holds at least one, the
Місяць screen SHALL — besides saying the shown month is empty — state that previous month by name
with its витрачено per currency, and SHALL offer one action that shows that month. WHEN the
previous calendar month holds no транзакція either, the screen SHALL state only that the shown
month is empty, as it does today: an offer to read a second empty month is no offer. The stated
витрачено SHALL be the monthly-picture number of that month, identical to what stepping to it
shows — a currency whose витрачено that month is zero included, because that is what stepping to it
shows for that currency too. A previous month whose транзакції moved no monthly number at all —
transfers between рахунки and nothing else — SHALL still be named and offered with no сума stated:
it holds something to read, and the month it leads to is where what it holds is said.

#### Scenario: The first day of a month points at the month that has numbers

- **WHEN** September holds no транзакція, August holds UAH витрати of 2150000 minor units, and the
  owner opens Місяць on 1 September
- **THEN** the screen says September is empty, names «Серпень 2026» with витрачено 2150000 minor
  units UAH, and offers showing that month

#### Scenario: Taking the offer shows the previous month

- **WHEN** the owner takes that offer
- **THEN** the screen shows August 2026 and its numbers, exactly as stepping back once does

#### Scenario: Two empty months in a row offer nothing

- **WHEN** both the shown month and the month before it hold no транзакція
- **THEN** the screen states the shown month is empty and offers no previous month

#### Scenario: A previous month of transfers alone is still named and offered

- **WHEN** the shown month is empty and the month before it holds only a transfer between рахунки
- **THEN** that month is named with no сума stated, and showing it is still offered

#### Scenario: The previous month is stated per currency

- **WHEN** the shown month is empty and the previous month holds витрати in UAH and in USD
- **THEN** the previous month's витрачено is stated in UAH and in USD separately, with no combined
  сума

### Requirement: A category's month states its сума and how far it is over its ліміт

The list a breakdown row opens SHALL state the category's own витрачено for that month per
currency — the same сума the breakdown row carries — above its транзакції. WHEN the category is
over its ліміт for that month per the limits capability, the list SHALL also state by how much it
is over, in the ліміт's currency: the сума spent minus the ліміт. A category that is not over its
ліміт — under it, exactly at it, or carrying none — SHALL state no overrun. The stated сума SHALL
hold every currency the list shows, each apart, while the overrun is stated for the ліміт's
currency alone.

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
