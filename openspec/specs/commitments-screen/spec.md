# commitments-screen Specification

## Purpose
The «Зобов'язання» screen — where the owner records a recurring payment they already know of, reads
which платежі arrived and which did not, corrects which витрата is which платіж, and stops a
зобов'язання that has ended.

## Requirements

### Requirement: Зобов'язання opens on the active ones, nearest платіж first

The «Зобов'язання» screen SHALL list every зобов'язання that is not stopped, ordered by the дата of
its найближчий платіж — its earliest платіж that is очікується or списання не знайдено — each with
its назва, its сума in its currency, its періодичність, and the дата of that платіж; a зобов'язання
with a платіж in the state списання не знайдено SHALL say so on its row. Stopped зобов'язання SHALL
follow under «Припинені». Creating a зобов'язання SHALL be one «Нове зобов'язання» action above the
list, and the create form SHALL NOT stand open by default. With no зобов'язання at all the screen
SHALL say what a зобов'язання is for in one sentence and offer «Нове зобов'язання».

#### Scenario: The nearest платіж leads

- **WHEN** today is 2026-10-02, «Оренда» — 15 000,00 UAH «щомісяця» — has its найближчий платіж on
  2026-10-10, and «Інтернет» on 2026-10-05
- **THEN** «Інтернет» is listed above «Оренда», and «Оренда» shows «15 000,00 UAH», «щомісяця» and
  «10 жовтня»

#### Scenario: A missed debit is visible from the list

- **WHEN** a платіж of «Оренда» is списання не знайдено
- **THEN** the row of «Оренда» says that a списання was not found

#### Scenario: Stopped ones are set apart

- **WHEN** «Netflix» is stopped and «Інтернет» is not
- **THEN** «Інтернет» is in the list and «Netflix» is under «Припинені»

#### Scenario: An empty screen explains itself

- **WHEN** the owner opens «Зобов'язання» holding no зобов'язання
- **THEN** the screen says in one sentence what a зобов'язання is for and offers «Нове
  зобов'язання»

### Requirement: The зобов'язання form starts monthly and refuses in Ukrainian

The form SHALL ask for «Назва», «Сума», «Як часто», «Дата першого платежу», «Рахунок списання», an
optional «Категорія» and an optional «Текст в описі списання» — the ознака — with one line saying
that, when it is filled, a списання is recognised by that text in the bank's опис whatever its
сума. The сума SHALL be entered in major units the way an amount is entered when recording, and the
form SHALL show it in the currency of the chosen рахунок списання. «Як часто» SHALL offer
«Щомісяця», «Щокварталу», «Щопівроку» and «Щороку», starting at «Щомісяця». «Дата першого
платежу» SHALL start at today. «Рахунок списання» SHALL offer only unarchived рахунки. «Редагувати»
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

### Requirement: One зобов'язання shows its платежі with a verb per платіж

Tapping a зобов'язання SHALL open it: its назва, сума, періодичність, рахунок списання, категорія
and ознака, and its платежі newest first — every платіж dated up to today and the first one dated
after it, where one exists — each with its дата, сума and state; for a сплачено платіж the дата and
сума of its списання, or that the owner marked it. A linked платіж SHALL offer «Відв'язати»; a
платіж that is очікується or списання не знайдено SHALL offer «Обрати списання», listing the
candidates the commitments capability allows with their дата, сума and опис, «Позначити сплаченим»
and «Пропустити»; a marked платіж SHALL offer «Зняти позначку». The зобов'язання SHALL offer
«Редагувати», «Припинити» (or «Відновити» once stopped) and «Видалити»; deleting SHALL ask for
confirmation and say that its транзакції stay.

#### Scenario: The платежі read newest first

- **WHEN** on 2026-12-08 the owner opens «Інтернет», 300,00 UAH «щомісяця» from 2026-10-05, with the
  платіж of 2026-10-05 linked to a витрата of 5 жовтня and the платіж of 2026-11-05 marked
  сплачено
- **THEN** the платежі of 2027-01-05 «очікується», 2026-12-05 «очікується», 2026-11-05 «позначено
  сплаченим» and 2026-10-05 with its списання of 5 жовтня 300,00 UAH are listed in that order

#### Scenario: Picking the списання by hand

- **WHEN** a платіж of «Інтернет» is списання не знайдено and the owner chooses «Обрати списання»
- **THEN** the unlinked витрати of the рахунок списання within ten days of its дата are listed with
  their дата, сума and опис, and picking one makes the платіж сплачено

#### Scenario: Skipping a платіж

- **WHEN** the owner chooses «Пропустити» on the очікується платіж of «Netflix» of 2026-10-15
- **THEN** that платіж reads «пропущено» and offers «Зняти позначку»

#### Scenario: Stopping moves it under Припинені

- **WHEN** the owner chooses «Припинити» on «Netflix»
- **THEN** «Netflix» offers «Відновити», shows no платіж after today, and is listed under
  «Припинені»

#### Scenario: Deleting asks first

- **WHEN** the owner chooses «Видалити» on «Інтернет»
- **THEN** the app asks for confirmation, saying the транзакції stay, and deletes nothing until the
  owner confirms

### Requirement: A зобов'язання offers its new сума when the bank charged another

WHEN the latest платіж of a зобов'язання that is linked to a списання — latest by дата — has a
списання whose сума differs from the зобов'язання's сума, the зобов'язання SHALL say so with both
sums and offer «Оновити суму», which sets the зобов'язання's сума to that списання's сума as an edit
would. Nothing SHALL change until the owner chooses it, and no other платіж's списання SHALL be
read for it.

#### Scenario: Netflix got dearer

- **WHEN** «Netflix» is 299,00 UAH and its latest linked платіж, of 2026-10-15, was debited as
  349,00 UAH
- **THEN** «Netflix» says the last списання was 349,00 UAH against 299,00 UAH and offers «Оновити
  суму», and choosing it makes its сума 349,00 UAH

#### Scenario: The same сума offers nothing

- **WHEN** the latest linked платіж of «Інтернет» was debited at exactly its сума
- **THEN** no «Оновити суму» is offered
