## MODIFIED Requirements

### Requirement: The зобов'язання form starts monthly and refuses in Ukrainian

The form SHALL ask for «Назва», «Сума», «Як часто», «Дата першого платежу», «Рахунок списання», an
optional «Категорія» and an optional «Текст в описі списання» — the ознака — with one line saying
that, when it is filled, a списання is recognised by that text in the bank's опис whatever its
сума. The сума SHALL be entered in major units the way an amount is entered when recording, and the
form SHALL show it in the currency of the chosen рахунок списання. «Як часто» SHALL offer
«Щомісяця», «Щокварталу», «Щопівроку» and «Щороку», starting at «Щомісяця». «Дата першого
платежу» SHALL start at today. «Рахунок списання» SHALL offer only unarchived рахунки that are not a рахунок-борг — a рахунок-борг is a person, and a платіж is never paid from one; every other вид, an інвестиційний рахунок included, SHALL stay offered. A зобов'язання already stored on a рахунок-борг SHALL keep showing it as the chosen «Рахунок списання» while it is edited, and saving it untouched SHALL keep it there. «Редагувати»
SHALL open the same form holding the зобов'язання's current values. Every refusal of the
commitments capability SHALL be stated in Ukrainian next to the field it concerns, and nothing SHALL
be stored while any stands. WHILE the form is open, the device's back gesture SHALL close it,
storing nothing — after the confirmation the app-shell capability asks for when the form holds edits.

«Рахунок списання» and «Категорія» SHALL be picked the way the entry form picks them: at most five
shown — those last reached for, topped up in alphabetical order — and one offer naming how many
there are in all, which opens the full list with a search. «Категорія» SHALL offer «Без категорії»
once, as having none, and SHALL NOT offer «Коригування» or «Комісія»: a коригування is fixed to its
own категорія, and a комісія is recorded with its переказ, never as a платіж of a зобов'язання.

#### Scenario: Monthly unless told otherwise

- **WHEN** the owner opens «Нове зобов'язання»
- **THEN** «Як часто» shows «Щомісяця» and «Дата першого платежу» shows today

#### Scenario: The pickers offer five and the rest behind one offer

- **WHEN** the owner holds nine unarchived рахунки and 27 unarchived категорії besides «Без
  категорії», «Комісія» and «Коригування», and opens «Нове зобов'язання»
- **THEN** «Рахунок списання» shows five рахунки and «Всі рахунки (9)», «Категорія» shows five
  and «Всі категорії (28)» — the 27 and «Без категорії» — each opening the full list with a search;
  «Без категорії» is offered exactly once, and neither the short list nor the full list offers
  «Комісія» or «Коригування»

#### Scenario: A USD card makes a USD сума

- **WHEN** the owner chooses the USD рахунок «mono USD» as «Рахунок списання»
- **THEN** the сума is shown in dollars

#### Scenario: A refusal sits next to its field

- **WHEN** the owner stores the form with «Текст в описі списання» "tv"
- **THEN** nothing is stored and the refusal about three characters stands next to «Текст в описі
  списання»

#### Scenario: The back gesture discards the form

- **WHEN** the owner types into the form, uses the device's back gesture and answers «Відкинути»
- **THEN** the form closes and no зобов'язання is stored

#### Scenario: A зобов'язання is not paid from a person

- **WHEN** the owner holds «mono чорна» (spending, UAH), «IBKR» (investment, USD) and «Ярослав»
  (debt, UAH), all unarchived, and opens «Нове зобов'язання»
- **THEN** «Рахунок списання» offers «mono чорна» and «IBKR» and not «Ярослав», and no offer to see
  more is drawn

#### Scenario: A stored зобов'язання on a рахунок-борг still shows it

- **WHEN** a зобов'язання of 29900 minor units UAH stored before this change is paid from «Ярослав»
  (debt, UAH) and the owner opens it for editing and saves without touching «Рахунок списання»
- **THEN** «Ярослав» is shown as the chosen рахунок, and the зобов'язання of 29900 minor units UAH
  stays on it

#### Scenario: Only рахунки-борги leave nothing to pay from

- **WHEN** the owner's only unarchived рахунки are «Ярослав» and «Оля», both of kind debt, and they
  fill «Нове зобов'язання» and store it
- **THEN** «Рахунок списання» offers no рахунок, the refusal stands next to «Рахунок списання», and
  no зобов'язання is stored
