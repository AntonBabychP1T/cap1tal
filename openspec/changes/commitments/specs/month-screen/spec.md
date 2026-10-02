## RENAMED Requirements

- FROM: `### Requirement: A month with платежі shows its розстрочки`
- TO: `### Requirement: A month with платежі shows them in Платежі місяця`

- FROM: `### Requirement: The current month's UAH group states Вільно після розстрочок`
- TO: `### Requirement: The current month states Вільно після зобов'язань in every currency that owes`

## MODIFIED Requirements

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

- **WHEN** October 2026 is shown, «iPhone» has a сплачено платіж of 1 000,00 ₴ on 5 жовт. and
  «Оренда» an очікується платіж of 15 000,00 ₴ on 10 жовт.
- **THEN** the «Платежі місяця» block lists «iPhone» with «платіж 5 з 10» and then «Оренда», totals
  16 000,00 ₴ and says 15 000,00 ₴ is still not сплачено, and витрачено is what the month's
  транзакції alone say

#### Scenario: Every currency totals on its own

- **WHEN** October 2026 is shown, «Інтернет» has a платіж of 300,00 ₴ and «ChatGPT» a платіж of
  20,00 USD, both очікується
- **THEN** the block totals 300,00 ₴ and 20,00 USD apart and adds neither to the other

#### Scenario: A skipped платіж is listed but not totalled

- **WHEN** October 2026 is shown and its only платіж, of «Netflix», 299,00 ₴, is пропущено
- **THEN** the block lists «Netflix» as «пропущено» and shows no total

#### Scenario: The block leads to the screen

- **WHEN** the owner taps the платіж of «iPhone» in the block
- **THEN** the розстрочка «iPhone» opens with its графік

#### Scenario: A платіж of a зобов'язання leads to its зобов'язання

- **WHEN** the owner taps the платіж of «Оренда» in the block
- **THEN** «Оренда» opens with its платежі

#### Scenario: An empty month still shows what it owes

- **WHEN** November 2026 is the current month, holds no транзакція yet, and «iPhone» has an
  очікується платіж of 1 000,00 ₴ on 5 лист.
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

- **WHEN** October 2026 is the current month, its UAH залишилось is 20 000,00 ₴, «Оренда» has an
  очікується платіж of 15 000,00 ₴ and «iPhone» an очікується платіж of 500,00 ₴
- **THEN** the UAH group still leads with залишилось 20 000,00 ₴ and shows «Вільно після
  зобов'язань» 4 500,00 ₴ beneath it

#### Scenario: A USD group gets its own reading

- **WHEN** October 2026 is the current month, its USD залишилось is 500,00 USD and «ChatGPT» has an
  очікується платіж of 20,00 USD, and nothing UAH is owed
- **THEN** the USD group shows «Вільно після зобов'язань» 480,00 USD beneath залишилось, and the UAH
  group shows none

#### Scenario: Before the first дохід it sits beneath залишилось

- **WHEN** October 2026 is the current month, its UAH group has витрати and no дохід, so it leads
  with витрачено and залишилось is −2 650,00 ₴, and one платіж of 500,00 ₴ is очікується
- **THEN** the group still leads with витрачено and shows «Вільно після зобов'язань» −3 150,00 ₴
  directly beneath залишилось

#### Scenario: No UAH group, no reading

- **WHEN** the current month holds only USD транзакції and one UAH платіж of 500,00 ₴ is очікується
- **THEN** no UAH «Вільно після зобов'язань» is shown and the «Платежі місяця» block says 500,00 ₴
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
