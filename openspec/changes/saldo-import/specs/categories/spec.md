# categories Specification (delta)

## MODIFIED Requirements

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
