## MODIFIED Requirements

### Requirement: Розстрочки opens on the active ones, nearest платіж first

The «Розстрочки» screen SHALL list every розстрочка that is neither сплачена nor closed early,
ordered by the дата of its next платіж that is not сплачено, each with its назва, its progress as
«N з M», its залишок, and the дата and сума of that next платіж; a розстрочка with a платіж in the
state списання не знайдено SHALL say so on its row. Сплачені розстрочки and those closed early SHALL
follow under «Закриті». Creating a розстрочка SHALL be one «Нова розстрочка» action above the list,
and the create form SHALL NOT stand open by default. With no розстрочка at all the screen SHALL say
what a розстрочка is for in one sentence and offer «Нова розстрочка».

#### Scenario: The nearest платіж leads

- **WHEN** today is 2026-10-01, «Пилосос» has its next платіж on 2026-10-20, and «iPhone» — 10
  платежі of 1 000,00 UAH, 4 сплачено раніше — has its next on 2026-10-05
- **THEN** «iPhone» is listed above «Пилосос», showing «4 з 10», its залишок «6 000,00 UAH» and
  «5 жовтня · 1 000,00 UAH»

#### Scenario: A missed debit is visible from the list

- **WHEN** a платіж of «iPhone» is списання не знайдено
- **THEN** the row of «iPhone» says that a списання was not found

#### Scenario: Paid-off ones are set apart

- **WHEN** «Навушники» is сплачена and «iPhone» is active
- **THEN** «iPhone» is in the list and «Навушники» is under «Закриті»

#### Scenario: An empty screen explains itself

- **WHEN** the owner opens «Розстрочки» holding no розстрочка
- **THEN** the screen says in one sentence what a розстрочка is for and offers «Нова розстрочка»

### Requirement: The form fills in what it can and refuses in Ukrainian

The form SHALL ask for «Що куплено», «Повна сума», «Кількість платежів», «Щомісячний платіж»,
«Дата першого платежу», «Рахунок списання», «Вже сплачено платежів» and an optional «Категорія»,
amounts entered in major units the way an amount is entered when recording. «Щомісячний платіж»
SHALL be filled with the even split whenever the повна сума or the кількість changes, until the
owner types it themselves; when the last платіж differs from it the form SHALL show «Останній
платіж» with its сума. «Дата першого платежу» SHALL start at today. «Вже сплачено платежів» SHALL
start at the number of платежі dated before today and follow the дата and the кількість until the
owner sets it. «Рахунок списання» SHALL offer only unarchived UAH рахунки. Every refusal of the
installments capability SHALL be stated in Ukrainian next to the field it concerns, and nothing
SHALL be stored while any stands. WHILE the form is open, the device's back gesture SHALL close it,
storing nothing — after the confirmation the app-shell capability asks for when the form holds edits.

#### Scenario: Ten thousand over ten months

- **WHEN** the owner types «Повна сума» "10000" and «Кількість платежів» "10"
- **THEN** «Щомісячний платіж» shows "1000,00" and no «Останній платіж» is shown

#### Scenario: The remainder is shown

- **WHEN** the owner types «Повна сума» "1000" and «Кількість платежів» "3"
- **THEN** «Щомісячний платіж» shows "333,33" and «Останній платіж» shows "333,34"

#### Scenario: A typed платіж is not overwritten

- **WHEN** the owner types «Щомісячний платіж» "1050" and then changes «Кількість платежів»
- **THEN** «Щомісячний платіж» still shows "1050,00"

#### Scenario: An existing розстрочка counts its past платежі

- **WHEN** on 2026-10-01 the owner sets «Дата першого платежу» to 2026-06-05 with 10 платежі
- **THEN** «Вже сплачено платежів» shows 4

#### Scenario: The back gesture discards the form

- **WHEN** the owner types into the form, uses the device's back gesture and answers «Відкинути»
- **THEN** the form closes and no розстрочка is stored

### Requirement: One розстрочка shows its графік with a verb per платіж

Tapping a розстрочка SHALL open it: its назва, повна сума, щомісячний платіж, рахунок списання,
категорія, progress and залишок, and every платіж with its number, дата, сума and state — for a
сплачено платіж the дата and сума of its списання, or that it was сплачено раніше, or that the
owner marked it. A linked платіж SHALL offer «Відв'язати»; a платіж that is очікується or списання
не знайдено SHALL offer «Обрати списання», listing the candidates the installments capability
allows with their дата, сума and опис, and «Позначити сплаченим»; a marked платіж SHALL offer
«Зняти позначку». The розстрочка SHALL offer «Редагувати», «Закрити достроково» (or «Відновити» once
closed) and «Видалити»; deleting SHALL ask for confirmation and say that its транзакції stay.

#### Scenario: The графік reads month by month

- **WHEN** on 2026-10-10 the owner opens «iPhone», 10 платежі of 1 000,00 UAH from 2026-06-05, 4
  сплачено раніше and платіж 5 linked to a витрата of 2026-10-05
- **THEN** платежі 1–4 say «сплачено раніше», платіж 5 shows its списання of 5 жовтня 1 000,00 UAH,
  and платежі 6–10 show their дати and «очікується»

#### Scenario: Picking the списання by hand

- **WHEN** платіж 5 is списання не знайдено and the owner chooses «Обрати списання»
- **THEN** the unlinked UAH витрати of the рахунок списання within ten days of its дата are listed,
  and picking one makes платіж 5 сплачено

#### Scenario: Deleting asks first

- **WHEN** the owner chooses «Видалити» on «iPhone»
- **THEN** the app asks for confirmation, saying the транзакції stay, and deletes nothing until the
  owner confirms
