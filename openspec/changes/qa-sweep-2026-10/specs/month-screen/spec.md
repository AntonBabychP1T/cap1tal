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
led by витрачено SHALL also state plainly that no дохід is recorded for the shown month — «ще» for
the current month, which may still receive one, and without it for a finished month — so the reason залишилось is not leading is on the screen rather than left to be guessed. Every one of
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

- **WHEN** the shown month is the current month and holds UAH витрати of 265000 minor units and no
  дохід, so залишилось is −265000 minor units UAH
- **THEN** the UAH group leads with витрачено, states that no дохід is recorded for the month yet
  («ще»), and still shows залишилось as −265000 minor units UAH under its own name

#### Scenario: A finished month without дохід does not promise one

- **WHEN** Місяць shows вересень 2026, finished, whose USD group holds витрати and no дохід
- **THEN** the USD group leads with витрачено and says no дохід was recorded in вересень, without
  «ще»

#### Scenario: A month with дохід leads with залишилось

- **WHEN** the shown month holds UAH дохід of 5000000 minor units and UAH витрати of 265000 minor
  units
- **THEN** the UAH group leads with залишилось and says nothing about дохід being unrecorded

#### Scenario: Each currency decides its own leading number

- **WHEN** the shown month holds дохід in UAH and only витрати in USD
- **THEN** the UAH group leads with залишилось and the USD group leads with витрачено

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

- **WHEN** Місяць shows October 2026, which has a Netflix price change and Кафе already above
  September's whole
- **THEN** the block lists both, the price change first, beneath the breakdown

#### Scenario: Stepping back shows the past month's own

- **WHEN** the owner steps back to September 2026, which has Продукти above its типова сума
- **THEN** the block lists the спостереження of September, and no спостереження about «already
  more than last month» is among them

#### Scenario: Ten facts are five and «Ще 5»

- **WHEN** Місяць shows вересень 2026 with ten спостереження «проти типової суми» and no дубль
- **THEN** the block lists the five the order puts first and «Ще 5», which shows the other five
  without leaving Місяць

#### Scenario: A quiet month says so

- **WHEN** the shown month holds транзакції and has no спостереження
- **THEN** the block says there is nothing unusual in that month

### Requirement: A month with платежі shows them in Платежі місяця

WHEN the shown month holds at least one платіж of a розстрочка that is not закрито, or of a
зобов'язання, the Місяць screen SHALL show a «Платежі місяця» block listing those платежі by дата,
each with the назва of its розстрочка or зобов'язання — a розстрочка's also with its number as
«платіж N з M» — its scheduled сума in its currency and its state: сплачено, пропущено, очікується
or списання не знайдено. The block SHALL total, separately per currency, the scheduled сума of the
платежі of the month that are not пропущено, and how much of each total is still not сплачено; a
currency all of whose платежі of the month are пропущено SHALL show no total. Tapping a платіж SHALL open
its розстрочка or its зобов'язання. The block SHALL be shown also when the month holds no
транзакція, beside the statement that the month is empty. A month with no such платіж SHALL show no
block. The block SHALL change none of the six numbers of the month.

#### Scenario: October shows its two платежі

- **WHEN** October 2026 is shown, «iPhone» has a сплачено платіж of 1 000,00 UAH on 5 жовтня and
  «Оренда» an очікується платіж of 15 000,00 UAH on 10 жовтня
- **THEN** the «Платежі місяця» block lists «iPhone» with «платіж 5 з 10» and then «Оренда», totals
  16 000,00 UAH and says 15 000,00 UAH is still not сплачено, and витрачено is what the month's
  транзакції alone say

#### Scenario: Every currency totals on its own

- **WHEN** October 2026 is shown, «Інтернет» has a платіж of 300,00 UAH and «ChatGPT» a платіж of
  20,00 USD, both очікується
- **THEN** the block totals 300,00 UAH and 20,00 USD apart and adds neither to the other

#### Scenario: A skipped платіж is listed but not totalled

- **WHEN** October 2026 is shown and its only платіж, of «Netflix», 299,00 UAH, is пропущено
- **THEN** the block lists «Netflix» as «пропущено» and shows no total

#### Scenario: The block leads to the screen

- **WHEN** the owner taps the платіж of «iPhone» in the block
- **THEN** the розстрочка «iPhone» opens with its графік

#### Scenario: A платіж of a зобов'язання leads to its зобов'язання

- **WHEN** the owner taps the платіж of «Оренда» in the block
- **THEN** «Оренда» opens with its платежі

#### Scenario: An empty month still shows what it owes

- **WHEN** November 2026 is the current month, holds no транзакція yet, and «iPhone» has an
  очікується платіж of 1 000,00 UAH on 5 листопада
- **THEN** the screen states the month has no транзакції yet and still shows the «Платежі місяця»
  block with that платіж

#### Scenario: A month without платежі has no block

- **WHEN** a month in which no розстрочка and no зобов'язання has a платіж is shown
- **THEN** no «Платежі місяця» block is shown

### Requirement: The current month states Вільно після зобов'язань in every currency that owes

WHEN the shown month is the current month, every currency group of it for which «Вільно після
зобов'язань» exists SHALL show it directly beneath залишилось, wherever залишилось stands in the
group — leading, or among the numbers when витрачено leads — under its own name and сума, negative
sign included. It SHALL NOT become the leading number, SHALL NOT appear in the group of a currency
in which nothing of the month is owed, and SHALL NOT appear for any other month. WHEN платежі are
owed in a currency in which the month has no group, no «Вільно після зобов'язань» SHALL be shown
for that currency, and the «Платежі місяця» block's сума still not сплачено in it stands alone.

#### Scenario: What is free after the платіж still owed

- **WHEN** October 2026 is the current month, its UAH залишилось is 20 000,00 UAH, «Оренда» has an
  очікується платіж of 15 000,00 UAH and «iPhone» an очікується платіж of 500,00 UAH
- **THEN** the UAH group still leads with залишилось 20 000,00 UAH and shows «Вільно після
  зобов'язань» 4 500,00 UAH beneath it

#### Scenario: A USD group gets its own reading

- **WHEN** October 2026 is the current month, its USD залишилось is 500,00 USD and «ChatGPT» has an
  очікується платіж of 20,00 USD, and nothing UAH is owed
- **THEN** the USD group shows «Вільно після зобов'язань» 480,00 USD beneath залишилось, and the UAH
  group shows none

#### Scenario: Before the first дохід it sits beneath залишилось

- **WHEN** October 2026 is the current month, its UAH group has витрати and no дохід, so it leads
  with витрачено and залишилось is −2 650,00 UAH, and one платіж of 500,00 UAH is очікується
- **THEN** the group still leads with витрачено and shows «Вільно після зобов'язань» −3 150,00 UAH
  directly beneath залишилось

#### Scenario: No UAH group, no reading

- **WHEN** the current month holds only USD транзакції and one UAH платіж of 500,00 UAH is очікується
- **THEN** no UAH «Вільно після зобов'язань» is shown and the «Платежі місяця» block says 500,00 UAH
  is still not сплачено

#### Scenario: No USD group, no USD reading

- **WHEN** the current month holds only UAH транзакції and «ChatGPT» has an очікується платіж of
  20,00 USD
- **THEN** no USD «Вільно після зобов'язань» is shown and the «Платежі місяця» block says 20,00 USD
  is still not сплачено

#### Scenario: Not for a past month

- **WHEN** the owner steps back to September 2026
- **THEN** no «Вільно після зобов'язань» is shown

#### Scenario: Nothing owed hides it

- **WHEN** every платіж of the current month is сплачено or пропущено
- **THEN** no «Вільно після зобов'язань» is shown
