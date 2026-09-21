## ADDED Requirements

### Requirement: The Категорії section shows every категорія with its іконка

Every row of the «Категорії» section SHALL lead with its категорія's іконка, drawn in a tile beside
its назва — unarchived, archived and reserved rows alike, an archived row still set apart as
before. The «Джерела» section SHALL stay as it is: джерела carry no іконка.

#### Scenario: Each row shows its іконка

- **WHEN** the owner opens «Категорії»
- **THEN** Groceries is shown with «Продукти», «Без категорії» with «Питання» and an archived Pets
  with its own іконка, still visibly archived

#### Scenario: Джерела carry no іконка

- **WHEN** the owner opens «Джерела»
- **THEN** its rows show their names exactly as before, with no іконка

### Requirement: A категорія is created and edited through one editor holding its назва and its іконка

Adding a категорія and editing one SHALL open the same editor over the section: a field for the
назва and every pickable іконка of the catalogue shown at once as a compact grid, grouped by
meaning under each group's name, with «Зберегти» and «Скасувати».

- **Adding**: the editor SHALL open with an empty назва and «Інше» chosen. While the owner has not
  picked an іконка, the chosen іконка SHALL follow the назва being typed — whatever that назва
  suggests. Once the owner picks an іконка in the grid, typing SHALL NOT change it any more.
- **Editing**: the editor SHALL open with the категорія's назва and its stored іконка chosen;
  typing a new назва SHALL NOT change the chosen іконка. It is offered for every категорія that
  is not reserved, archived ones included.
- «Зберегти» SHALL store the назва and the іконка as one save; a rejected save SHALL keep the
  editor open with what was typed and picked, and SHALL say why in Ukrainian, as the section's
  other refusals do. «Скасувати», and the phone's «назад» while the editor is open, SHALL close the
  editor, store nothing and leave the section open.
- A reserved row SHALL offer no editor. Archiving and unarchiving SHALL stay as they are.

#### Scenario: A new категорія is created with a picked іконка

- **WHEN** the owner adds a категорія, types «Ремонт», picks the іконка «Ремонт» and saves
- **THEN** «Ремонт» appears in the section with the іконка «Ремонт», and is offered when recording
  a витрата

#### Scenario: The chosen іконка follows the назва until the owner picks one

- **WHEN** the owner adds a категорія and types «Кафе»
- **THEN** «Кава» is the chosen іконка in the grid, without the owner having touched it

#### Scenario: A picked іконка is kept while typing

- **WHEN** the owner adds a категорія, picks «Ігри», and then types «Кафе»
- **THEN** «Ігри» is still the chosen іконка

#### Scenario: Only the іконка is changed

- **WHEN** the owner edits Pets, picks «Подарунки» and saves without touching the назва
- **THEN** the section shows Pets with «Подарунки»

#### Scenario: A rejected save keeps the editor and changes nothing

- **WHEN** the owner edits Pets, types the назва of another unarchived категорія, picks «Кава» and
  saves
- **THEN** a Ukrainian refusal names the duplicate, the editor is still open with what was typed
  and picked, and the section still shows Pets with its former іконка

#### Scenario: Leaving the editor stores nothing

- **WHEN** the owner edits Pets, picks «Кава», and uses the phone's «назад»
- **THEN** the editor closes, the section is still open, and Pets carries the іконка it had

#### Scenario: A reserved row offers no editor

- **WHEN** the owner looks at «Комісія» in the section
- **THEN** it shows «Відсоток» and offers neither editing nor archiving

### Requirement: The іконка grid is usable without sight and without colour

Every cell of the grid SHALL be announced to a screen reader by its іконка's Ukrainian name and as
chosen or not chosen, and SHALL be at least the app's minimum touch size. The chosen іконка SHALL
be obvious without relying on colour: its cell SHALL be outlined where no other cell is, and the
editor SHALL write the chosen іконка's name beside the grid.

#### Scenario: A screen reader names the cell and its state

- **WHEN** the editor is open with «Кава» chosen and a screen reader reads the grid
- **THEN** the cell «Кава» is announced as «Кава» and chosen, and the cell «Таксі» as «Таксі» and
  not chosen

#### Scenario: Every cell is large enough to tap

- **WHEN** the editor's grid is shown
- **THEN** every cell's tappable area is at least the app's minimum touch size, whatever the size of
  the іконка drawn in it

#### Scenario: The choice is written, not only coloured

- **WHEN** the owner picks «Аптека» in the grid
- **THEN** the «Аптека» cell is outlined, no other cell is, and the editor reads «Аптека» as the
  chosen іконка
