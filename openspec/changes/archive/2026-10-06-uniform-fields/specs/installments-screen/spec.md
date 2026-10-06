## MODIFIED Requirements

### Requirement: The form fills in what it can and refuses in Ukrainian

The form SHALL ask for «Що куплено», «Повна сума», «Кількість платежів», «Щомісячний платіж»,
«Дата першого платежу», «Рахунок списання», «Вже сплачено платежів» and an optional «Категорія»,
amounts entered in major units the way an amount is entered when recording. «Щомісячний платіж»
SHALL be filled with the even split whenever the повна сума or the кількість changes, until the
owner types it themselves; when the last платіж differs from it the form SHALL show «Останній
платіж» with its сума. «Дата першого платежу» SHALL start at today. «Вже сплачено платежів» SHALL
start at the number of платежі dated before today and follow the дата and the кількість until the
owner sets it. «Рахунок списання» SHALL offer only unarchived UAH рахунки that are not a рахунок-борг; an інвестиційний рахунок in UAH SHALL stay offered. A розстрочка already stored on a рахунок-борг SHALL keep showing it as the chosen «Рахунок списання» while it is edited, and saving it untouched SHALL keep it there. Every refusal of the
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

#### Scenario: A розстрочка is paid from bonds but not from a person

- **WHEN** the owner holds «mono чорна» (spending, UAH), «військові облігації» (investment, UAH) and
  «Оля» (debt, UAH), all unarchived, and opens «Нова розстрочка»
- **THEN** «Рахунок списання» offers «mono чорна» and «військові облігації» and not «Оля»

#### Scenario: A stored розстрочка on a рахунок-борг still shows it

- **WHEN** a розстрочка of 1000000 minor units UAH over 10 платежі stored before this change is paid
  from «Оля» (debt, UAH) and the owner opens it for editing and saves without touching «Рахунок
  списання»
- **THEN** «Оля» is shown as the chosen рахунок, and the розстрочка stays on it with its 10 платежі
  of 100000 minor units UAH
