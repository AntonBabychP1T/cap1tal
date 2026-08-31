# month-screen Specification

## Purpose
The Місяць screen — where the owner reads one calendar month: витрачено, інвестовано, відкладено,
позичено, дохід and залишилось per currency, the spent broken down by category, and the secondary
approximate UAH figure. It is the answer half of the product: Головний records the money, Місяць
says where it went and how much is left.
## Requirements
### Requirement: The Місяць screen shows the month's numbers per currency

The app SHALL offer a Місяць screen, placed between Головний and Рахунки. For the shown month it
SHALL display витрачено, інвестовано, відкладено, позичено, дохід and залишилось separately per
currency, exactly as the monthly-picture capability computes them from the stored transactions —
a currency appears only when some number of it moved that month, and no amounts of different
currencies are ever summed into one primary number. WHEN the shown month has no transactions the
screen SHALL say so plainly instead of showing an empty gap.

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

