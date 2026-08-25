## MODIFIED Requirements

### Requirement: Saldo categories and sources map by name, with special rows never created

The system SHALL map each Saldo EXPENSES account to a category and each INCOME account to a
джерело by exact name — an INCOME account with a parent SHALL match as "parent — name" (the
starter set's flattening) — proposing creation of any name with no existing row, and the owner's
decisions SHALL be able to redirect any proposed creation onto an existing row instead. Four
EXPENSES names SHALL never become categories: "Fees" SHALL map to the reserved «Комісія» row,
"Uncategorised expense" to the reserved «Без категорії» row, "Balance correction" legs SHALL
become коригування, and «Борг» legs SHALL become перекази on рахунки-борги. The INCOME name
"Balance correction" SHALL likewise never become a джерело — its legs become коригування too.
The INCOME name "Uncategorised income" SHALL be proposed as an ordinary джерело like any other:
the one джерело the domain reserves is «Відсотки», the interest row, which means something else
entirely — there is no «Без джерела» row to map "Uncategorised income" onto, and inventing one
would add a reserved row nothing has a requirement for.

#### Scenario: A flattened income child matches the starter source

- **WHEN** an INCOME leg carries account "Андрій" with parent "батьки"
- **THEN** it maps to the джерело named "батьки — Андрій"

#### Scenario: An unknown category is proposed for creation and can be redirected

- **WHEN** the export holds EXPENSES account "булка" and no category of that name exists
- **THEN** the plan proposes creating category "булка", and the owner's decision can redirect it
  onto an existing category instead

#### Scenario: Fees map to the reserved row

- **WHEN** an EXPENSES leg carries account "Fees"
- **THEN** the resulting витрата carries the reserved «Комісія» category and no category named
  "Fees" is proposed

#### Scenario: No category «Борг» and no category "Balance correction" are ever proposed

- **WHEN** the export holds EXPENSES accounts «Борг» and "Balance correction"
- **THEN** the plan proposes creating neither as a category

#### Scenario: "Uncategorised income" is proposed as an ordinary джерело

- **WHEN** the export holds the INCOME account "Uncategorised income"
- **THEN** the plan proposes creating a джерело of that name, which the owner may redirect onto
  an existing one like any other proposal

#### Scenario: No джерело "Balance correction" is ever proposed

- **WHEN** the export holds the INCOME account "Balance correction" with credited legs
- **THEN** the plan proposes no джерело of that name and those legs become коригування
