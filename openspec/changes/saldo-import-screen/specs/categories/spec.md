## MODIFIED Requirements

### Requirement: The starter set seeds the lists on first use

On every opening, the system SHALL create whatever is missing of the starter set — the owner's
Saldo lists, verbatim, hierarchy flattened, plus the one джерело the glossary needs that Saldo
never held:

- Expense categories: Home, COFFEE ☕, Groceries, Entertainment, Family care, Transport, Travel,
  Bills, Gifts, Eating out, Food Delivery, KrayShop, Digital, Electronics, сімейний бюджет,
  Clothing, Health, book, Pets, Other expense, Charity, Education, habits, булка, Services —
  plus the three reserved rows «Без категорії», «Комісія», «Коригування».
- Income sources: Salary, salary Mono, Freelance, степендія, батьки, батьки — Андрій,
  батьки — Лена, Оліни батьки, KrayShop, Gifts, інвестиції, Other income — plus the reserved row
  «Відсотки».

The Saldo category «Борг» SHALL NOT be seeded — lending is a переказ onto a рахунок-борг, not an
expense. «Відсотки» is seeded although Saldo held no such row: the glossary makes what a borrower
repays above the principal income, and a repayment above the principal proposes exactly that
джерело, so it has to exist under its name on every device — which is why it is reserved rather
than ordinary.

Until this change the owner was told to create «Відсотки» by hand like any other source. Seeding
SHALL therefore NOT produce a second row for it: a джерело already named «Відсотки» SHALL become
the reserved row itself, keeping the доходи that reference it, and SHALL be unarchived in
becoming one.

Seeding SHALL create only what is missing and SHALL NOT change, restore or duplicate a row that
already exists, however the owner has renamed or archived it — so repeating it changes nothing.

#### Scenario: A fresh install holds the starter set

- **WHEN** the app is opened for the first time on an empty device
- **THEN** the expense categories and income sources listed above exist, including «Без
  категорії», «Комісія», «Коригування» and the джерело «Відсотки», and no category «Борг» exists

#### Scenario: Reopening does not duplicate the starter set

- **WHEN** the app is opened a second time
- **THEN** every starter row exists exactly once

#### Scenario: A hand-created «Відсотки» is not duplicated

- **WHEN** a device holds a джерело the owner created by hand named «Відсотки», carrying a дохід,
  and the app is brought to the current shape and opened
- **THEN** exactly one unarchived джерело named «Відсотки» exists, it is the reserved one, and
  that дохід still resolves to it

#### Scenario: The owner's rename survives reopening

- **WHEN** the owner renames the category Groceries to «Продукти» and the app is reopened
- **THEN** the category is still named «Продукти» and no new Groceries row appears

#### Scenario: The owner's archive survives reopening

- **WHEN** the owner archives the category habits and the app is reopened
- **THEN** the category is still archived and no unarchived duplicate appears

### Requirement: Reserved rows can be neither renamed nor archived

The rows «Без категорії», «Комісія» and «Коригування», and the джерело «Відсотки», SHALL be
neither renamable nor archivable: default recording, the комісія proposal, retyping a переказ into
a витрату, the коригування attribution and the відсотки proposal depend on them existing under
their names. «Без категорії» and «Комісія» SHALL be offered when recording and categorising like
any unarchived category, and «Відсотки» SHALL be offered as a джерело like any unarchived source;
«Коригування» SHALL NOT be offered in any picker — it is carried only by коригування
transactions, which the app itself creates.

#### Scenario: Renaming a reserved row is rejected

- **WHEN** the owner attempts to rename «Без категорії»
- **THEN** the rename is rejected and the row is unchanged

#### Scenario: Archiving a reserved row is rejected

- **WHEN** the owner attempts to archive «Комісія»
- **THEN** the archive is rejected and the row stays offered

#### Scenario: The reserved джерело may be neither renamed nor archived

- **WHEN** the owner attempts to rename or to archive «Відсотки»
- **THEN** both are rejected and the row stays offered as a джерело

#### Scenario: «Коригування» exists but is never pickable

- **WHEN** the owner opens any category picker
- **THEN** «Коригування» is not offered, while a stored коригування still resolves to and
  displays it

## ADDED Requirements

### Requirement: The reserved джерело id resolves to a seeded row

The seeded list SHALL hold «Відсотки» under one reserved джерело id, so a дохід the app itself
proposes carries an id that resolves to a real row of the editable list, exactly as the reserved
category ids do for витрати.

#### Scenario: An accepted відсотки proposal lands in the seeded row

- **WHEN** the owner accepts a proposed дохід «Відсотки» from a repayment above the principal
- **THEN** the stored дохід's source id resolves to the row named «Відсотки»
