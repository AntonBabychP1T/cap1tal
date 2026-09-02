# month-screen Specification

## Purpose
The Місяць screen — where the owner reads one calendar month: витрачено, інвестовано, відкладено,
позичено, дохід and залишилось per currency, the spent broken down by category, and the secondary
approximate UAH figure. It is the answer in full: Головний leads with the month's залишилось and
its витрачено, Місяць is where all six numbers, their breakdown by category and the months before
this one are read.
## Requirements
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

### Requirement: The screen opens on the current month and steps between months

The Місяць screen SHALL open on the current calendar month, SHALL let the owner step to any
earlier month and forward again, and SHALL NOT step past the current month. The shown month SHALL
be named in Ukrainian with its year.

#### Scenario: Opening lands on the current month

- **WHEN** the Місяць screen is opened in August 2026
- **THEN** it shows the numbers of August 2026, named «Серпень 2026»

#### Scenario: Stepping back shows the earlier month

- **WHEN** the owner steps back once from August 2026
- **THEN** the screen shows July 2026 and its numbers, computed only from July's transactions

#### Scenario: Stepping forward returns toward the current month

- **WHEN** the owner steps back twice from August 2026 and forward once
- **THEN** the screen shows July 2026 and its numbers

#### Scenario: The current month is the far edge

- **WHEN** the screen shows the current month
- **THEN** stepping forward is not offered

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

### Requirement: The approximate UAH figure appears only when it can be honest

The Місяць screen SHALL show the approximate UAH equivalent beside the per-currency numbers,
visibly marked as approximate, only when a non-UAH currency participates in the shown month and
every participating currency has a known monobank rate. In every other case — the month is
UAH-only, or some needed rate is unknown — the approximate figure SHALL be absent, and its
absence SHALL NOT affect anything else on the screen.

#### Scenario: A UAH-only month has nothing to approximate

- **WHEN** the shown month moved money only in UAH
- **THEN** no approximate figure is shown

#### Scenario: A known rate yields a marked approximation

- **WHEN** the shown month holds USD numbers and a monobank rate for USD is known
- **THEN** an approximate UAH figure is shown and is marked as approximate

#### Scenario: An unknown rate hides the approximation, not the numbers

- **WHEN** the shown month holds USD numbers and no monobank rate for USD is known
- **THEN** no approximate figure is shown and the per-currency numbers are shown in full

### Requirement: The rate refreshes quietly and fails silently

Opening the Місяць screen SHALL obtain monobank's current rates when any currency monobank can
quote against the hryvnia has no stored rate, or has one older than one hour, and SHALL store what
it obtained. UAH is not one of them — it needs no rate — so its presence SHALL never call for a
refresh. Staleness is decided per currency: a fresh rate for one currency SHALL NOT keep a stale
rate for another from being asked about again. Obtaining SHALL be attempted at most once for each
opening of the screen and each month shown in it; in particular, an answer that covers only some
of those currencies leaves the rest stale and SHALL NOT by itself cause another attempt.
Failure to obtain a rate —
offline, or the endpoint erring — SHALL change nothing visible: the stored rate, when one exists,
keeps serving the approximation, and no error is surfaced for this secondary figure. Nothing on
the screen other than the approximate figure SHALL depend on the network.

#### Scenario: Offline with a stored rate still approximates

- **WHEN** the screen opens with no network and a rate stored an evening ago
- **THEN** the approximate figure is computed from the stored rate

#### Scenario: Offline with no stored rate shows everything else

- **WHEN** the screen opens with no network and no rate ever stored
- **THEN** the per-currency numbers and the breakdown appear, and only the approximate figure is
  absent

#### Scenario: A fresh rate replaces a stale one

- **WHEN** the screen opens with a rate stored two hours ago and the current rate is obtainable
- **THEN** the newly obtained rate is stored and the approximation uses it

#### Scenario: One stale currency is enough to ask again

- **WHEN** the screen opens with a USD rate obtained minutes ago and a EUR rate obtained a day ago
- **THEN** monobank is asked again, so the fresher rate does not leave the staler one standing

#### Scenario: Every rate fresh asks nothing

- **WHEN** the screen opens with a rate for every currency monobank quotes, all obtained minutes
  ago
- **THEN** monobank is not asked, and the approximation uses what is stored

#### Scenario: One opening asks once

- **WHEN** the screen opens with a missing or stale rate, monobank answers, and the screen is left
  open
- **THEN** what arrived is stored in a single pass and nothing is obtained again while it stays
  open

### Requirement: An over-limit category is marked in the breakdown

WHEN the shown month's breakdown holds a category that is over its ліміт for that month per the
limits capability, the breakdown's showing of that category's amount in the ліміт's currency
SHALL be visibly marked over limit (red). The showing of the same category's amount in any other
currency SHALL NOT be marked, and a category that is not over its ліміт — under it, exactly at
it, or carrying none — SHALL NOT be marked. The mark follows the shown month: stepping to a
month where the category is not over shows it unmarked.

#### Scenario: An over-limit row is red

- **WHEN** Groceries carries a ліміт of 250000 minor units UAH, August's spent in Groceries is
  260000 minor units UAH, and the owner opens August
- **THEN** the Groceries amount in UAH is visibly marked over limit

#### Scenario: Spending at the ліміт is not marked

- **WHEN** August's spent in Groceries is exactly its ліміт of 250000 minor units UAH
- **THEN** the Groceries row is not marked over limit

#### Scenario: Another currency's amount stays unmarked

- **WHEN** Groceries is over its UAH ліміт for August and August also holds Groceries витрати in
  USD
- **THEN** the Groceries amount in UAH is marked and the Groceries amount in USD is not

#### Scenario: The mark follows the shown month

- **WHEN** Groceries is over its ліміт for August and under it for July, and the owner steps
  from August to July
- **THEN** July's Groceries row is not marked

### Requirement: Each breakdown row carries a bar sized against the month's largest категорія

For the shown month the Місяць screen SHALL draw beside each breakdown row a bar whose length is
that row's amount as a fraction of the largest amount among the rows of the same currency, so the
month's largest категорія fills its track and the rest are read against it. Each currency's rows
SHALL be measured against that currency's own largest, never across currencies. A row whose amount
is zero or less — a категорія a повернення pulled to or below zero — SHALL get no bar, and when the
largest amount of a currency's rows is itself zero or less no row of that currency SHALL get one.
The bar states no number of its own: it is the shape of the same amounts the rows already show, and
the bar of a row marked over its ліміт carries that same mark.

#### Scenario: The largest fills its track and the rest read against it

- **WHEN** August's UAH breakdown holds 100000 minor units in Groceries, 50000 in «Без категорії»
  and 25000 in transport
- **THEN** the Groceries bar is full, the «Без категорії» bar is half of the track and the
  transport bar is a quarter of it

#### Scenario: Each currency is measured against its own largest, never across currencies

- **WHEN** August holds 100000 minor units UAH and 1000 minor units USD of Groceries витрати
- **THEN** the Groceries bar is full in the UAH group and full in the USD group

#### Scenario: A категорія a повернення pushed below zero gets no bar

- **WHEN** August's UAH breakdown holds 100000 minor units in Groceries and transport stands at
  −20000 minor units after a повернення
- **THEN** the transport row gets no bar

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
