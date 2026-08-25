# categories Specification

## Purpose
The owner's flat vocabulary for "where did the money go" and "where did it come from": the
editable list of expense categories and the editable list of income sources, seeded once with the
owner's own starter set, including the reserved rows the domain's stored transactions already
reference.
## Requirements
### Requirement: The starter set seeds the lists on first use

On every opening, the system SHALL create whatever is missing of the starter set — the owner's
Saldo lists, verbatim, hierarchy flattened:

- Expense categories: Home, COFFEE ☕, Groceries, Entertainment, Family care, Transport, Travel,
  Bills, Gifts, Eating out, Food Delivery, KrayShop, Digital, Electronics, сімейний бюджет,
  Clothing, Health, book, Pets, Other expense, Charity, Education, habits, булка, Services —
  plus the three reserved rows «Без категорії», «Комісія», «Коригування».
- Income sources: Salary, salary Mono, Freelance, степендія, батьки, батьки — Андрій,
  батьки — Лена, Оліни батьки, KrayShop, Gifts, інвестиції, Other income.

The Saldo category «Борг» SHALL NOT be seeded — lending is a переказ onto a рахунок-борг, not an
expense. No «Відсотки» source is seeded either, although the glossary makes interest income: the
lists above are the owner's Saldo lists verbatim and Saldo held no such row, and nothing can
record interest until the Saldo import's confirm screen (FR-T9) arrives — that change seeds or
asks for it, and until then the owner can create it in Налаштування like any other source.

Seeding SHALL create only what is missing and SHALL NOT change, restore or duplicate a row that
already exists, however the owner has renamed or archived it — so repeating it changes nothing.

#### Scenario: A fresh install holds the starter set

- **WHEN** the app is opened for the first time on an empty device
- **THEN** the expense categories and income sources listed above exist, including «Без
  категорії», «Комісія» and «Коригування», and no category «Борг» exists

#### Scenario: Reopening does not duplicate the starter set

- **WHEN** the app is opened a second time
- **THEN** every starter row exists exactly once

#### Scenario: The owner's rename survives reopening

- **WHEN** the owner renames the category Groceries to «Продукти» and the app is reopened
- **THEN** the category is still named «Продукти» and no new Groceries row appears

#### Scenario: The owner's archive survives reopening

- **WHEN** the owner archives the category habits and the app is reopened
- **THEN** the category is still archived and no unarchived duplicate appears

### Requirement: The reserved category ids resolve to seeded rows

The seeded list SHALL hold «Без категорії», «Комісія» and «Коригування» under the same reserved
category ids the domain's stored transactions already carry — the uncategorised, fees and
correction ids — so every stored transaction carrying a reserved id resolves to a real row of the
editable list.

#### Scenario: A коригування lands in the seeded correction row

- **WHEN** a коригування of −3000 minor units UAH is stored and its category id is resolved
  against the seeded list
- **THEN** it resolves to the row named «Коригування»

#### Scenario: A комісія lands in the seeded fees row

- **WHEN** the owner accepts a proposed витрата "Комісія" from a same-currency переказ that
  arrived short
- **THEN** the stored витрата's category id resolves to the row named «Комісія»

#### Scenario: A default expense lands in the seeded uncategorised row

- **WHEN** a витрата is recorded without picking a category
- **THEN** its category id resolves to the row named «Без категорії»

### Requirement: Categories and sources can be created and renamed

The owner SHALL be able to create a category or a source with a name, and to rename an existing
one; the lists stay flat — no hierarchy, no tags. A name that is empty after trimming SHALL be
rejected; a name equal to another unarchived row of the same list SHALL be rejected.

#### Scenario: A created category is available

- **WHEN** the owner creates the category «Ремонт»
- **THEN** «Ремонт» exists in the category list

#### Scenario: A rename keeps the row's history

- **WHEN** a category with stored витрати is renamed
- **THEN** the same row carries the new name and its витрати still reference it

#### Scenario: An empty name is rejected

- **WHEN** the owner submits a category name of only spaces
- **THEN** creation is rejected and nothing is stored

#### Scenario: A duplicate name is rejected

- **WHEN** the owner creates a second source named Salary while an unarchived Salary exists
- **THEN** creation is rejected and nothing is stored

### Requirement: Categories and sources can be archived and unarchived

The owner SHALL be able to archive a category or a source and to unarchive it again. An archived
row SHALL NOT be offered when recording or categorising a transaction; transactions already
referencing it SHALL keep it, display it and count it exactly as before. Unarchiving a row whose
name equals another unarchived row of the same list SHALL be rejected — the same rule a rename
obeys.

#### Scenario: An archived category leaves the picker

- **WHEN** the owner archives the category Pets
- **THEN** Pets is not offered when recording a витрата

#### Scenario: An archived category keeps its history

- **WHEN** a category with витрати in the current month is archived
- **THEN** those витрати still show the category and still count as spent in it

#### Scenario: An unarchived category returns to the picker

- **WHEN** the owner unarchives Pets
- **THEN** Pets is offered again when recording a витрата

#### Scenario: An archived source is not offered as a джерело

- **WHEN** the owner archives the source Freelance and records a дохід
- **THEN** Freelance is not among the offered джерела, while a stored дохід that already carries
  it still shows it

#### Scenario: Unarchiving into a name collision is rejected

- **WHEN** the owner archives Pets, creates a new category named Pets, and attempts to unarchive
  the old one
- **THEN** the unarchive is rejected and the old row stays archived

### Requirement: Reserved rows can be neither renamed nor archived

The rows «Без категорії», «Комісія» and «Коригування» SHALL be neither renamable nor archivable:
default recording, the комісія proposal, retyping a переказ into a витрату and the коригування
attribution depend on them existing under their names. «Без категорії» and «Комісія» SHALL be
offered when recording and categorising like any unarchived category; «Коригування» SHALL NOT
be offered in any picker — it is carried only by коригування transactions, which the app itself
creates.

#### Scenario: Renaming a reserved row is rejected

- **WHEN** the owner attempts to rename «Без категорії»
- **THEN** the rename is rejected and the row is unchanged

#### Scenario: Archiving a reserved row is rejected

- **WHEN** the owner attempts to archive «Комісія»
- **THEN** the archive is rejected and the row stays offered

#### Scenario: «Коригування» exists but is never pickable

- **WHEN** the owner opens any category picker
- **THEN** «Коригування» is not offered, while a stored коригування still resolves to and
  displays it

