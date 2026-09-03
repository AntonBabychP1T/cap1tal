# settings-screen Specification

## Purpose
The «Налаштування» tab — the one place the owner configures the app: категорії, джерела and
правила автокатегоризації now; monobank-токен, ліміти, цілі and бекап in later steps.
## Requirements
### Requirement: The Налаштування tab hosts the management sections

The app SHALL offer a «Налаштування» tab, last after Головний, Місяць, Рахунки and Звіти.
Opening it SHALL offer «Перші кроки», which opens the setup view, and the sections «Категорії»,
«Джерела» and «Правила», each opening its management list, «Ліміти», which opens limit
management, «Цілі», which opens goal management, «Імпорт Saldo», which opens the one-time import
flow, «monobank», which opens token, account linking and sync management,
«Сповіщення банків», which opens notification access and watched apps management, «Бекап»,
which opens saving the whole state to one file and restoring it from one, and «Репорти про
помилки», which opens the list of репорти and filing a new one.

#### Scenario: The tab opens on its sections

- **WHEN** the owner opens «Налаштування»
- **THEN** the sections «Перші кроки», «Категорії», «Джерела», «Правила», «Ліміти», «Цілі»,
  «Імпорт Saldo», «monobank», «Сповіщення банків», «Бекап» and «Репорти про помилки» are offered

#### Scenario: The import section opens the import flow

- **WHEN** the owner opens «Імпорт Saldo»
- **THEN** the one-time Saldo import flow opens, at its first step

#### Scenario: The monobank section opens connection management

- **WHEN** the owner opens «monobank»
- **THEN** token state, monobank accounts, links and sync state are available in one flow

#### Scenario: The first-steps section opens the setup view

- **WHEN** the owner opens «Перші кроки»
- **THEN** the setup view opens with every step and its current state

#### Scenario: The bank-notifications section opens access and watches

- **WHEN** the owner opens «Сповіщення банків»
- **THEN** the notification access state and the watched apps management are available in one
  flow

#### Scenario: The backup section opens saving and restoring

- **WHEN** the owner opens «Бекап»
- **THEN** saving the whole state to one file and restoring it from one are available in one flow

#### Scenario: The bug-reports section opens the list

- **WHEN** the owner opens «Репорти про помилки»
- **THEN** the list of saved репорти and «Повідомити про помилку» are available in one flow

### Requirement: The Категорії and Джерела sections manage the lists

Each list section SHALL show its unarchived rows, with archived rows visibly set apart, and SHALL
offer creating, renaming, archiving and unarchiving per the categories capability. Reserved rows
SHALL be shown but SHALL offer neither rename nor archive.

#### Scenario: A category created in Налаштування reaches the picker

- **WHEN** the owner creates «Ремонт» in the «Категорії» section and returns to Головний
- **THEN** «Ремонт» is offered when recording a витрата

#### Scenario: An archived row is set apart, not gone

- **WHEN** the owner archives the category Pets
- **THEN** the «Категорії» section still shows Pets, visibly archived

#### Scenario: A reserved row offers no editing

- **WHEN** the owner opens «Без категорії» in the «Категорії» section
- **THEN** no rename and no archive is offered for it

### Requirement: The Правила section manages the rules

The «Правила» section SHALL list every rule as its merchant pattern and/or MCC with the target
category's name, and SHALL offer creating, editing and deleting rules per the
categorisation-rules capability.

#### Scenario: A created rule appears in the list

- **WHEN** the owner creates the rule "сільпо → Groceries"
- **THEN** the «Правила» section lists it with its pattern and the category name Groceries

#### Scenario: A deleted rule leaves the list

- **WHEN** the owner deletes that rule and confirms
- **THEN** the «Правила» section no longer lists it

### Requirement: The Ліміти section manages the limits

The «Ліміти» section SHALL show every unarchived category with its ліміт or its absence, and an
archived category carrying a ліміт visibly set apart, so a leftover ліміт can still be found and
cleared. It SHALL offer setting, changing and clearing a ліміт per the limits capability, the
сума entered in major units the way an amount is entered when recording, with the ліміт's
currency chosen from the same currencies a рахунок can be created in, defaulting to UAH. The
section SHALL say that a ліміт is also the ціль витрат of its категорія, so the owner is not left
to discover that the two lists hold one сума; setting a ліміт here SHALL make that ціль витрат
appear among the цілі, and clearing it here SHALL remove it from there.

WHILE the editor of a category's ліміт is open, the device's own back gesture SHALL close that
editor and leave the section open, discarding what was typed and storing nothing; only with no
editor open SHALL it leave the section. The editor is what the owner opened last, so it is what
the back gesture undoes first.

#### Scenario: A set ліміт appears with its category

- **WHEN** the owner sets a ліміт of "2500" in UAH on Groceries in the «Ліміти» section
- **THEN** the section shows Groceries with a ліміт of 250000 minor units UAH, and August's
  Groceries spending above it marks the category over limit

#### Scenario: A ліміт set here is a ціль витрат there

- **WHEN** the owner sets a ліміт of "2500" in UAH on Groceries and opens «Цілі»
- **THEN** the ціль витрат «Groceries» of at most 250000 minor units UAH is listed among the цілі

#### Scenario: A ліміт can be set in another offered currency

- **WHEN** the owner sets a ліміт of "100" in USD on the category Travel
- **THEN** Travel carries a ліміт of 10000 minor units USD, and only Travel's USD spending is
  judged against it

#### Scenario: A cleared ліміт leaves the category listed

- **WHEN** the owner clears the ліміт of Groceries
- **THEN** the section still shows Groceries, now with no ліміт, and no ціль витрат «Groceries»
  remains among the цілі

#### Scenario: An archived category with a ліміт stays visible

- **WHEN** the owner archives Pets while it carries a ліміт
- **THEN** the «Ліміти» section shows Pets visibly set apart, its ліміт clearable, while an
  archived category without a ліміт is not listed

#### Scenario: The back gesture closes an open ліміт editor

- **WHEN** the owner opens the ліміт editor on Groceries, types "2500" and uses the device's back
  gesture
- **THEN** the editor closes, the «Ліміти» section is still open, and Groceries' ліміт is
  unchanged

#### Scenario: The back gesture leaves the section when no editor is open

- **WHEN** the owner uses the device's back gesture on «Ліміти» with no editor open
- **THEN** the «Ліміти» section is left, exactly as its own way back does

### Requirement: The Цілі section manages the цілі

The «Цілі» section SHALL list every ціль of both kinds, visibly apart, and SHALL offer creating,
editing and deleting per the goals capability, deletion after confirmation. A ціль-накопичення
SHALL be listed with its назва, its target with currency, its дата where it has one, and the
рахунки of its склад — by назва where they are few enough to name, by their number otherwise —
each archived рахунок among them visibly marked. A ціль витрат SHALL be listed with its категорія's
назва, its ceiling with currency and that its period is the calendar month; one whose категорія
is archived SHALL be listed and visibly set apart, as the «Ліміти» section and «Звіти» both set it
apart, so a leftover ceiling is findable from every list that shows it. Progress belongs to
«Звіти» and the ціль's own screen, not to this section: here цілі are managed, not read.

Creating SHALL ask the kind **first**, as two named choices — «Накопичити» and «Не перевищити
витрати» — and SHALL then show only the fields that kind has, so a field belonging to the other
kind is never on screen:

- **«Накопичити»** — назва; цільова сума, entered in major units the way an amount is entered when
  recording; the ціль's currency, chosen from the same currencies a рахунок can be created in and
  defaulting to UAH; an **optional** дата, which may be left empty and cleared later; and «Що
  враховувати» — the склад, where one or more рахунки are ticked. The ціль's currency SHALL be
  refused, in the owner's own language, when the ticked рахунки mix currencies and the currency is
  not UAH, or when it is neither UAH nor the one currency the ticked рахунки share.
- **«Не перевищити витрати»** — the категорія, offered among those carrying no ліміт yet; the
  maximum сума; and its currency, chosen and defaulted as above. No назва is asked — the ціль is
  named by its категорія — and no дата and no period are asked, the period being the calendar
  month.

The склад SHALL offer the unarchived рахунки to tick, plus any рахунок the ціль already holds even
if it has since been archived, so editing a ціль never silently drops a рахунок from it. Beside the
individual рахунки the section SHALL offer shortcuts naming a вид рахунку — «Усі інвестиційні»,
«Усі накопичувальні», «Усі готівкові» — each of which ticks the рахунки of that вид as they stand
at that moment and stores nothing but the ticked ids. The section SHALL show how many рахунки are
ticked, and SHALL refuse a ціль-накопичення with none.

The kind SHALL NOT be offered for change while editing an existing ціль.

WHILE the form of a ціль is open, the device's own back gesture SHALL close that form and leave
the section open, discarding what was typed and storing nothing; only with no form open SHALL it
leave the section — the same rule the «Ліміти» section carries, for the same reason.

#### Scenario: The kind is asked before anything else

- **WHEN** the owner opens the form of a new ціль
- **THEN** it asks the kind, offering «Накопичити» and «Не перевищити витрати», and shows no
  сума, категорія, дата or рахунок until one is chosen

#### Scenario: A created ціль appears in the list

- **WHEN** the owner chooses «Накопичити» and creates «Машина» for "700000" UAH by 2027-06-30 over
  the рахунки «Резерв», «Готівка» and «USD»
- **THEN** the «Цілі» section lists «Машина» with a target of 70000000 minor units UAH, the дата
  and three рахунки in its склад

#### Scenario: A ціль-накопичення without a дата is accepted

- **WHEN** the owner creates «Резерв» for "300000" UAH over one рахунок and leaves the дата empty
- **THEN** the ціль is created and listed with no дата

#### Scenario: A created ціль витрат shows no накопичення fields

- **WHEN** the owner chooses «Не перевищити витрати»
- **THEN** the form asks the категорія, the maximum сума and its currency, and asks no назва, no
  дата and no рахунок

#### Scenario: A shortcut ticks the рахунки of its вид

- **WHEN** three інвестиційні рахунки exist and the owner takes «Усі інвестиційні» in the склад
- **THEN** those three рахунки are ticked, the section says three are ticked, and taking the
  shortcut again after a fourth is created is what would add the fourth

#### Scenario: A mixed-currency склад outside UAH is refused in the owner's language

- **WHEN** the owner ticks a USD рахунок and a UAH рахунок and chooses USD as the ціль's currency
- **THEN** the form refuses in Ukrainian, saying the ціль must be in UAH because its рахунки are in
  different currencies, and nothing is stored

#### Scenario: A ціль-накопичення with no рахунок is refused

- **WHEN** the owner submits «Накопичити» with a назва and a сума but no рахунок ticked
- **THEN** the form refuses and nothing is stored

#### Scenario: A категорія that already carries a ліміт is not offered

- **WHEN** Groceries carries a ліміт and the owner creates a ціль витрат
- **THEN** Groceries is not among the offered категорії, and its existing ціль витрат is edited
  from the list instead

#### Scenario: An archived рахунок is not offered for a new ціль

- **WHEN** the owner creates a ціль while a рахунок is archived
- **THEN** that рахунок is not among the рахунки offered to tick, while an existing ціль holding it
  keeps it ticked and listed

#### Scenario: A ціль витрат of an archived категорія is listed, set apart

- **WHEN** Pets is archived while carrying a ліміт of 100000 minor units UAH
- **THEN** the «Цілі» section lists the ціль витрат «Pets», visibly set apart as archived, so its
  leftover ceiling can be cleared from here as well as from «Ліміти»

#### Scenario: The kind of an existing ціль is not offered for change

- **WHEN** the owner opens an existing ціль-накопичення for editing
- **THEN** the kind is not offered, and the form shows the накопичення fields only

#### Scenario: A deletion is confirmed first

- **WHEN** the owner deletes the ціль «Машина» and confirms
- **THEN** «Машина» is gone from the list and from «Звіти»

#### Scenario: Deleting a ціль витрат clears its ліміт

- **WHEN** the owner deletes the ціль витрат «Ресторани» and confirms
- **THEN** it is gone from the list, and the «Ліміти» section shows Ресторани with no ліміт

#### Scenario: The back gesture closes an open ціль form

- **WHEN** the owner opens the form of a new ціль, fills in its назва and uses the device's back
  gesture
- **THEN** the form closes, the «Цілі» section is still open, and no ціль has been created
