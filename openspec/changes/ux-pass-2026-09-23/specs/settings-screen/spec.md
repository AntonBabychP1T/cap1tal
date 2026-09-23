## ADDED Requirements

### Requirement: A management list leads with its rows and edits a row from the row

«Категорії», «Джерела», «Ліміти» and «Правила» SHALL open on their list of rows. Creating a new
категорія or джерело SHALL be one action above the list that opens the create form; the form SHALL
NOT stand open above the list by default. Tapping a row SHALL open that row's editor with every
verb the row offers — for a категорія or джерело its назва (and a категорія's іконка), archiving or
unarchiving; for a ліміт setting, changing or clearing it; for a правило editing and deleting it —
and a row SHALL NOT carry its verbs as a row of buttons of its own. Creating a правило stays the
one «Нове правило» action it is today. A reserved row SHALL open no editor and SHALL still say that
the app uses it. WHILE a create form or a row's editor is open in «Категорії» or «Джерела», the
device's back gesture SHALL close it, discarding what was typed, and only with none open SHALL it
leave the section — as «Ліміти» already does.

#### Scenario: Категорії opens on the list

- **WHEN** the owner opens «Категорії» holding 30 категорії
- **THEN** the first категорії are shown on the first screen under one «Нова категорія» action,
  and no create form is open

#### Scenario: A row opens its editor

- **WHEN** the owner taps «Алік» in «Категорії»
- **THEN** its editor opens with its назва, its іконка, «Зберегти», «Скасувати» and «В архів»,
  and renaming it to «Алкоголь 2» and saving stores the new назва

#### Scenario: A ліміт is set from its row

- **WHEN** the owner taps «Продукти» in «Ліміти»
- **THEN** the ліміт editor of «Продукти» opens, exactly as the Ліміти requirement describes it

#### Scenario: An existing ліміт opens filled in

- **WHEN** «Продукти» carries a ліміт of 2500,00 UAH and the owner taps it in «Ліміти»
- **THEN** the editor opens holding "2500,00" and UAH, and saving it unchanged leaves the ліміт as
  it was

#### Scenario: A правило is deleted from its editor

- **WHEN** the owner taps the правило «сільпо → Продукти» and chooses «Видалити» in its editor and
  confirms
- **THEN** the правило is deleted and no longer listed

#### Scenario: A категорія is archived and brought back from its editor

- **WHEN** the owner taps «Алік», chooses «В архів», then taps the archived «Алік» and chooses
  «З архіву»
- **THEN** «Алік» is first shown visibly archived and then unarchived again

#### Scenario: The back gesture closes an open create form

- **WHEN** the owner taps «Нова категорія», types "Ремонт" and uses the device's back gesture
- **THEN** the form closes, «Категорії» is still open, and no «Ремонт» exists
