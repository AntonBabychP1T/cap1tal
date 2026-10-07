## ADDED Requirements

### Requirement: The entry form opens with the сума ready to type

The сума SHALL be the first field of the entry form. The form SHALL open with the сума focused
and the phone's digit keyboard shown, with no tap. The keyboard SHALL offer a decimal separator.

The other fields SHALL follow in this order:

1. тип;
2. the рахунок — for a переказ «Звідки», then «Куди», then «Скільки прийшло»;
3. the опис;
4. the категорія of a витрата, «До якої категорії» of a повернення, or the джерело of a дохід;
5. the дата.

The категорія a правило proposes for the typed опис SHALL therefore stand directly below that
опис. Typing the сума before choosing the тип or the рахунок SHALL keep it while they are chosen.
The one exception is choosing a рахунок in another currency, which clears the сума as it does
today.

#### Scenario: The «+» opens on the сума with digits ready

- **WHEN** the owner taps the «+» on Головний
- **THEN** the entry form opens with the cursor in «Сума» and the digit keyboard shown, without any
  further tap

#### Scenario: The сума is the first field and the дата the last

- **WHEN** the entry form is open on a витрата
- **THEN** its fields read, from the top: «Сума», «Тип», «Рахунок», «Опис», «Категорія», «Дата»

#### Scenario: A переказ keeps the сума first

- **WHEN** the owner switches the тип to переказ
- **THEN** the fields read, from the top: «Скільки пішло», «Тип», «Звідки», «Куди», «Скільки
  прийшло» (once both рахунки are chosen), «Опис», «Дата», and no категорія is offered

#### Scenario: Typing first and choosing after records the typed сума

- **WHEN** the form opens on the remembered UAH рахунок «гаманець», the owner types «125,50» and
  then picks the категорія Кава and taps «Записати»
- **THEN** a витрата of 12550 minor units UAH in Кава is stored on «гаманець»

#### Scenario: Switching the тип keeps the typed сума

- **WHEN** the owner types «300» and then switches the тип from витрата to дохід
- **THEN** «Сума» still reads «300», and the form waits for a джерело before it records a дохід of
  30000 minor units in the рахунок's currency

#### Scenario: A рахунок in another currency still clears the сума

- **WHEN** the owner types «125,50» on the UAH рахунок «гаманець» and then chooses the USD рахунок
  «картка USD»
- **THEN** «Сума» is empty, so 125,50 UAH is never stored as 125,50 USD

#### Scenario: A повернення keeps the сума first

- **WHEN** the owner switches the тип to повернення
- **THEN** the fields read, from the top: «Сума», «Тип», «Рахунок», «Опис», «До якої категорії»,
  «Дата»

#### Scenario: The proposed категорія stands right under the опис

- **WHEN** the правило "атб → Groceries" exists and the owner types «АТБ 421» as the опис
- **THEN** the field directly below «Опис» is «Категорія», showing Groceries as chosen

### Requirement: «Записати» stays in reach without scrolling

The entry form SHALL offer «Записати» and «Записати і ще одну» pinned beneath the form's fields.
Both SHALL be visible without scrolling whatever the тип, at every scroll position of the fields,
while the keyboard is shown and at the largest system text size. The fields SHALL scroll above
them and SHALL never be hidden beneath them. With no unarchived рахунок, neither SHALL be offered,
since nothing can be recorded.

#### Scenario: Both actions stand above the keyboard on opening

- **WHEN** the entry form opens with the сума focused and the digit keyboard shown
- **THEN** «Записати» and «Записати і ще одну» are visible directly above the keyboard

#### Scenario: The longest form does not push «Записати» away

- **WHEN** the тип is переказ between two UAH рахунки and the fields are scrolled to the top
- **THEN** «Записати» and «Записати і ще одну» are visible, and the дата can be scrolled into view
  above them

#### Scenario: Large text keeps the actions on screen

- **WHEN** the system text size is at its largest and the entry form is open on a витрата
- **THEN** «Записати» and «Записати і ще одну» are visible and every field can still be scrolled
  into view above them

#### Scenario: No рахунок, no actions

- **WHEN** the entry screen opens while no unarchived рахунок exists
- **THEN** neither «Записати» nor «Записати і ще одну» is offered, and the screen offers going to
  Рахунки

## MODIFIED Requirements

### Requirement: Recording is visibly confirmed

The entry form SHALL offer two ways to store what it holds, and both SHALL store exactly the same
транзакції under the same refusals and proposals:

- «Записати» stores and returns to the screen the owner came from. On Головний the транзакція
  stands in the latest-transactions section in the place its date gives it.
- «Записати і ще одну» stores and keeps the entry screen open, ready for the next транзакція.

A refused recording SHALL show its own refusal and no confirmation, store nothing and leave the
fields as typed, whichever of the two was tapped.

WHEN a транзакція is stored by «Записати і ще одну», the entry screen SHALL confirm it where the
owner is already looking, without scrolling. The confirmation SHALL name the сума with its
currency and what it was recorded as:

- the категорія of a витрата or повернення;
- the джерело of a дохід;
- both рахунки of a переказ.

WHEN a комісія or a дохід «Відсотки» was stored alongside a переказ, the confirmation SHALL say so.

After a store by «Записати і ще одну»:

- the сума, «Скільки прийшло» and the опис SHALL be cleared;
- the picked категорія and джерело SHALL be dropped, so the категорія follows the next опис
  again;
- the сума SHALL be focused again with the digit keyboard shown;
- the тип, the рахунки and the дата SHALL stay as they were. The рахунок is the one this
  recording has just remembered.

Any change to any field afterwards SHALL end the confirmation, so it never describes a form that has
moved on.

While the confirmation stands and no field has changed since the store:

- tapping «Записати і ще одну» again SHALL store nothing and show no refusal;
- tapping «Записати» SHALL store nothing and return to the screen the owner came from;
- «назад» SHALL leave without asking «Відкинути зміни?».

A tap on either action that arrives while a store from an earlier tap is still being handled SHALL
store nothing, however quickly it follows.

#### Scenario: «Записати» returns with what was recorded

- **WHEN** the owner opened the form from Головний and records a витрата of «1200» dated today in
  Groceries from a UAH рахунок with «Записати»
- **THEN** the entry screen closes, and Головний shows a витрата of 120000 minor units UAH in
  Groceries at the top of the latest-transactions section

#### Scenario: The owner sees what was recorded

- **WHEN** the owner records a витрата of «1200» in Groceries from a UAH рахунок with «Записати і
  ще одну»
- **THEN** the screen stays open and confirms that 120000 minor units UAH in Groceries was
  recorded, without the owner scrolling anywhere

#### Scenario: An accepted комісія is part of the confirmation

- **WHEN** the owner records with «Записати і ще одну» a same-currency переказ of «1000» UAH that
  arrives as «970» and accepts the proposed комісія
- **THEN** the confirmation names the переказ of 97000 minor units UAH and the комісія of 3000
  minor units UAH stored with it, and the month's витрачено counts the 3000 комісія but not the
  переказ

#### Scenario: A дохід is confirmed by its джерело

- **WHEN** the owner records with «Записати і ще одну» a дохід of «5000» UAH from the джерело
  Salary
- **THEN** the confirmation reads «Записано: дохід 5 000,00 UAH — Salary.»

#### Scenario: A refusal is not a confirmation

- **WHEN** the owner taps «Записати і ще одну» with no сума entered
- **THEN** the refusal «Напишіть суму» is shown, nothing is stored, no confirmation appears and the
  screen stays open

#### Scenario: The form is ready for the next транзакція

- **WHEN** a витрата in Groceries from «гаманець» dated yesterday is stored with «Записати і ще
  одну»
- **THEN** the screen stays open with the confirmation; the сума and опис are empty and the сума
  is focused with the digit keyboard shown; no категорія is picked; витрата, «гаманець» and
  yesterday's дата are still chosen

#### Scenario: A переказ keeps both рахунки for the next one

- **WHEN** the owner records with «Записати і ще одну» a переказ of «1000» from the UAH рахунок
  «гаманець» onto the USD рахунок «картка USD» with «24» arrived
- **THEN** a переказ of 100000 minor units UAH out and 2400 minor units USD in is stored, the
  month's витрачено is unaffected, and the screen stays open on переказ with «гаманець» in «Звідки»
  and «картка USD» in «Куди», while «Скільки пішло» and «Скільки прийшло» are empty

#### Scenario: Three витрати in a row

- **WHEN** the owner records «45», «120» and «80» from the UAH рахунок «гаманець» with «Записати і
  ще одну», typing only the сума each time, and then taps «Записати» on the untouched form
- **THEN** three витрати of 4500, 12000 and 8000 minor units UAH in «Без категорії» are stored, no
  fourth is stored, and the owner is back on Головний

#### Scenario: A repeated tap stores nothing

- **WHEN** the owner taps «Записати і ще одну» twice in quick succession on a витрата of «250» UAH,
  the second tap arriving before the screen has redrawn after the first
- **THEN** exactly one витрата of 25000 minor units UAH is stored, the confirmation names it, and
  no refusal is shown

#### Scenario: Leaving after a stay-open store asks nothing

- **WHEN** a витрата was just stored with «Записати і ще одну» and the owner presses «назад»
  without touching any field
- **THEN** the entry screen closes without asking «Відкинути зміни?»

### Requirement: The recording confirmation stands above «Записати»

WHEN a транзакція is stored with «Записати і ще одну», its confirmation SHALL be drawn directly
above the pinned «Записати» and «Записати і ще одну». It SHALL therefore be on screen without
scrolling wherever the fields are scrolled to and while the keyboard is shown.

#### Scenario: The confirmation is seen where the button is

- **WHEN** the owner scrolls the entry form's fields to the дата and records a витрата of «100» in
  Кава with «Записати і ще одну»
- **THEN** «Записано: витрата 100,00 UAH — Кава.» is visible directly above «Записати» and
  «Записати і ще одну» without any further scrolling, while the digit keyboard is shown

### Requirement: Recording opens from a «+» on Головний

Головний SHALL offer recording a транзакція from a control reachable without scrolling — a «+»
standing over the screen's bottom-right corner — and SHALL NOT hold the entry form in its own
content. Tapping the «+» SHALL open the entry form on its own screen, pushed over Головний, which
records exactly what this capability's recording requirements define: витрата, переказ, дохід and
повернення, the same fields, the same refusals, the same комісія and дохід «Відсотки» proposals,
the same remembered рахунок and the same recently used категорії and джерела. There SHALL be one
entry form in the app, not two.

Leaving that screen SHALL return to the screen it was opened from — Головний when it was opened by
the «+» there, and Головний too when the launcher shortcut opened it on a closed app (app-shell). On
Головний a транзакція just recorded stands in the latest-transactions section in the place its date
gives it — at the top when it is dated today.
WHEN no unarchived рахунок exists, the entry screen SHALL state that a рахунок must be created
first and SHALL offer going to Рахунки, and nothing SHALL be recorded until one exists.

#### Scenario: The «+» opens the form

- **WHEN** the owner taps the «+» on Головний
- **THEN** the entry form opens as its own screen, offering витрата, переказ, дохід and повернення

#### Scenario: Головний holds no form of its own

- **WHEN** the owner opens Головний
- **THEN** no сума field, no категорія picker and no «Записати» stand in the screen's content

#### Scenario: What was recorded is on Головний when the owner returns

- **WHEN** the owner records a витрата of "1200" dated today from the entry screen and goes back
- **THEN** Головний shows that витрата at the top of the latest-transactions section and the
  month's витрачено counts it

#### Scenario: A back-dated транзакція takes its own place

- **WHEN** the owner records a витрата dated a week ago and goes back
- **THEN** it stands in the latest-transactions section in the place its date gives it, not
  necessarily first

#### Scenario: With no рахунок nothing can be recorded yet

- **WHEN** the owner opens the entry screen while no unarchived рахунок exists
- **THEN** it offers no рахунок, states that a рахунок must be created first, offers going to
  Рахунки, and nothing can be recorded
