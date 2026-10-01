## ADDED Requirements

### Requirement: A month with платежі shows its розстрочки

WHEN the shown month holds at least one платіж of any розстрочка that is not закрито, the Місяць
screen SHALL show a «Розстрочки» block listing those платежі by дата, each with the назва of its
розстрочка, its number as «платіж N з M», its сума and its state: сплачено, очікується or списання не
знайдено. The block SHALL total the платежі of the month and how much of that total is still not
сплачено. Tapping the block SHALL open the «Розстрочки» screen. The block SHALL be shown also when the
month holds no транзакція, beside the statement that the month is empty. A month with no such
платіж SHALL show no block. The block SHALL change none of the six numbers of the month.

#### Scenario: October shows its two платежі

- **WHEN** October 2026 is shown, «iPhone» has a сплачено платіж of 1 000,00 ₴ on 5 жовт. and
  «Пилосос» an очікується платіж of 500,00 ₴ on 20 жовт.
- **THEN** the «Розстрочки» block lists both in that order, totals 1 500,00 ₴ and says 500,00 ₴ is
  still not сплачено, and витрачено is what the month's транзакції alone say

#### Scenario: The block leads to the screen

- **WHEN** the owner taps the «Розстрочки» block
- **THEN** the «Розстрочки» screen opens

#### Scenario: An empty month still shows what it owes

- **WHEN** November 2026 is the current month, holds no транзакція yet, and «iPhone» has an очікується платіж of 1 000,00 ₴
  on 5 лист.
- **THEN** the screen states the month has no транзакції yet and still shows the «Розстрочки» block
  with that платіж

#### Scenario: A month without платежі has no block

- **WHEN** a month in which no розстрочка has a платіж is shown
- **THEN** no «Розстрочки» block is shown

### Requirement: The current month's UAH group states Вільно після розстрочок

WHEN the shown month is the current month, «Вільно після розстрочок» exists for it and the month
has a UAH group, that group SHALL show it directly beneath залишилось, wherever залишилось stands in
the group — leading, or among the numbers when витрачено leads — under its own name and сума,
negative sign included. It SHALL NOT become the leading number, SHALL NOT appear in any other
currency's group, and SHALL NOT appear for any other month. WHEN the month has no UAH group, no
«Вільно після розстрочок» SHALL be shown, and the «Розстрочки» block's сума still not сплачено stands
alone.

#### Scenario: What is free after the платіж still owed

- **WHEN** October 2026 is the current month, its UAH залишилось is 20 000,00 ₴ and one платіж of
  500,00 ₴ is очікується
- **THEN** the UAH group still leads with залишилось 20 000,00 ₴ and shows «Вільно після
  розстрочок» 19 500,00 ₴ beneath it

#### Scenario: Before the first дохід it sits beneath залишилось

- **WHEN** October 2026 is the current month, its UAH group has витрати and no дохід, so it leads
  with витрачено and залишилось is −2 650,00 ₴, and one платіж of 500,00 ₴ is очікується
- **THEN** the group still leads with витрачено and shows «Вільно після розстрочок» −3 150,00 ₴
  directly beneath залишилось

#### Scenario: No UAH group, no reading

- **WHEN** the current month holds only USD транзакції and one UAH платіж of 500,00 ₴ is очікується
- **THEN** no «Вільно після розстрочок» is shown and the «Розстрочки» block says 500,00 ₴ is still
  not сплачено

#### Scenario: Not for a past month

- **WHEN** the owner steps back to September 2026
- **THEN** no «Вільно після розстрочок» is shown

#### Scenario: Nothing owed hides it

- **WHEN** every платіж of the current month is сплачено
- **THEN** no «Вільно після розстрочок» is shown
