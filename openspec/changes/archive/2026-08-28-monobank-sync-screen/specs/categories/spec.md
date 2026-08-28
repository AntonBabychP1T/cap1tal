## MODIFIED Requirements

### Requirement: The starter set seeds the lists on first use

On every opening, the system SHALL create whatever is missing of the starter set — the owner's
Saldo lists, verbatim, hierarchy flattened, plus the джерела the glossary needs that Saldo never
held:

- Expense categories: Home, COFFEE ☕, Groceries, Entertainment, Family care, Transport, Travel,
  Bills, Gifts, Eating out, Food Delivery, KrayShop, Digital, Electronics, сімейний бюджет,
  Clothing, Health, book, Pets, Other expense, Charity, Education, habits, булка, Services —
  plus the three reserved rows «Без категорії», «Комісія», «Коригування».
- Income sources: Salary, salary Mono, Freelance, степендія, батьки, батьки — Андрій,
  батьки — Лена, Оліни батьки, KrayShop, Gifts, інвестиції, Other income — plus the reserved rows
  «Відсотки» and «Без джерела».

The Saldo category «Борг» SHALL NOT be seeded — lending is a переказ onto a рахунок-борг, not an
expense. «Відсотки» is seeded although Saldo held no such row: the glossary makes what a borrower
repays above the principal income, and a repayment above the principal proposes exactly that
джерело, so it has to exist under its name on every device — which is why it is reserved rather
than ordinary. «Без джерела» is seeded for an imported arrival whose final meaning is not yet
known; it is a visible starting state, not the owner's final classification.

Until this change the owner could create «Відсотки» or «Без джерела» by hand like any other
source. Seeding SHALL therefore NOT produce a second row for either name: an existing джерело with
one of those names SHALL become that reserved row itself, keeping the доходи that reference it,
and SHALL be unarchived in becoming one.

Seeding SHALL create only what is missing and SHALL NOT change, restore or duplicate any other row
that already exists, however the owner has renamed or archived it — so repeating it changes
nothing.

#### Scenario: A fresh install holds the starter set

- **WHEN** the app is opened for the first time on an empty device
- **THEN** the expense categories and income sources listed above exist, including «Без
  категорії», «Комісія», «Коригування», «Відсотки» and «Без джерела», and no category «Борг»
  exists

#### Scenario: Reopening does not duplicate the starter set

- **WHEN** the app is opened a second time
- **THEN** every starter row exists exactly once

#### Scenario: A hand-created reserved source is not duplicated

- **WHEN** a device holds a source the owner created by hand named «Без джерела», carrying a
  дохід, and the app is brought to the current shape and opened
- **THEN** exactly one unarchived джерело named «Без джерела» exists, it is the reserved one, and
  that дохід still resolves to it

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

The rows «Без категорії», «Комісія» and «Коригування», and the джерела «Відсотки» and «Без
джерела», SHALL be neither renamable nor archivable: default recording, the комісія proposal,
retyping a переказ into a витрату, the коригування attribution, the відсотки proposal and
monobank imports depend on them existing under their names. «Без категорії» and «Комісія» SHALL
be offered when recording and categorising like any unarchived category, and «Відсотки» SHALL be
offered as a джерело like any unarchived source; «Коригування» and «Без джерела» SHALL NOT be
offered in any picker — each is carried only by a транзакція the app creates.

#### Scenario: Renaming a reserved row is rejected

- **WHEN** the owner attempts to rename «Без категорії»
- **THEN** the rename is rejected and the row is unchanged

#### Scenario: Archiving a reserved row is rejected

- **WHEN** the owner attempts to archive «Комісія»
- **THEN** the archive is rejected and the row stays offered

#### Scenario: The imported-arrival source may be neither edited nor picked

- **WHEN** the owner attempts to rename or archive «Без джерела» and then opens a source picker
- **THEN** both edits are rejected and «Без джерела» is not offered for manual recording

#### Scenario: The reserved джерело may be neither renamed nor archived

- **WHEN** the owner attempts to rename or to archive «Відсотки»
- **THEN** both are rejected and the row stays offered as a джерело

#### Scenario: App-only rows exist but are never pickable

- **WHEN** the owner opens a category picker and a source picker
- **THEN** «Коригування» and «Без джерела» are not offered, while stored транзакції carrying them
  still resolve to and display them

#### Scenario: «Коригування» exists but is never pickable

- **WHEN** the owner opens any category picker
- **THEN** «Коригування» is not offered, while a stored коригування still resolves to and
  displays it

### Requirement: The reserved джерело id resolves to a seeded row

The seeded list SHALL hold «Відсотки» and «Без джерела» under their reserved джерело ids, so a
дохід the app itself proposes or imports always carries an id that resolves to a real row of the
editable list, exactly as the reserved category ids do for витрати.

#### Scenario: An accepted відсотки proposal lands in the seeded row

- **WHEN** the owner accepts a proposed дохід «Відсотки» from a repayment above the principal
- **THEN** the stored дохід's source id resolves to the row named «Відсотки»

#### Scenario: An imported arrival lands in the seeded row

- **WHEN** monobank imports a positive statement item before the owner has classified it
- **THEN** the stored дохід's source id resolves to the row named «Без джерела»
