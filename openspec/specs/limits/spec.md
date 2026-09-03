# limits Specification

## Purpose

The ліміт of the glossary: an optional monthly ceiling on a category — at most one per category,
a сума with a currency — and the determination of when a month's spending has exceeded it, which
colours the category red and changes nothing else. A ліміт **is** that категорія's ціль витрат —
one сума under two names, set, changed and cleared from either place, so no second ceiling exists
that could disagree with it.

## Requirements

### Requirement: A category may carry at most one monthly ліміт

The owner SHALL be able to set a ліміт on any category — reserved rows included — as a positive
integer minor-units сума with a currency code, to change it, and to clear it; a category SHALL
carry at most one ліміт at a time, so setting a ліміт on a category that already has one
replaces it. Because the ліміт is also that категорія's ціль витрат, setting one where one already
exists SHALL change the existing ceiling rather than creating a second, and the owner SHALL NOT be
offered the creation of a ціль витрат for a категорія that already carries a ліміт — that ціль
already exists and is edited, not created again. A сума that is not positive SHALL be rejected.
Archiving a category SHALL NOT change its ліміт. Sources of income carry no ліміт — a ліміт is a
ceiling on spending only.

#### Scenario: A set ліміт is carried by its category

- **WHEN** the owner sets a ліміт of 250000 minor units UAH on the category Groceries
- **THEN** Groceries carries the ліміт of 250000 minor units UAH

#### Scenario: Setting again replaces the ліміт

- **WHEN** Groceries carries a ліміт of 250000 minor units UAH and the owner sets a ліміт of
  300000 minor units UAH on it
- **THEN** Groceries carries only the ліміт of 300000 minor units UAH

#### Scenario: A category that already has one is not offered a second

- **WHEN** the owner creates a ціль витрат and chooses among the категорії
- **THEN** Groceries, which already carries a ліміт, is not offered — its ціль витрат exists and is
  edited where it stands

#### Scenario: A cleared ліміт is gone

- **WHEN** the owner clears the ліміт of Groceries
- **THEN** Groceries carries no ліміт

#### Scenario: A non-positive ліміт is rejected

- **WHEN** the owner sets a ліміт of 0 minor units UAH on a category
- **THEN** setting is rejected and the category's ліміт is unchanged

#### Scenario: A reserved category may carry a ліміт

- **WHEN** the owner sets a ліміт of 100000 minor units UAH on «Без категорії»
- **THEN** «Без категорії» carries that ліміт

#### Scenario: Archiving keeps the ліміт

- **WHEN** the owner archives a category carrying a ліміт
- **THEN** the archived category still carries the same ліміт

### Requirement: A ліміт and the ціль витрат of its категорія are one thing

A категорія's ліміт SHALL be the same stored fact as that категорія's ціль витрат: one сума, one
currency, one категорія, one calendar-month period. The system SHALL NOT hold a second ceiling for
a категорія under the name of a ціль, and SHALL NOT let a ліміт and a ціль витрат of the same
категорія carry different сума, currencies or periods — there is one row, read under two names.

Setting, changing or clearing the ліміт SHALL set, change or clear the ціль витрат, and the same in
the other direction, wherever in the app the owner does it. A категорія carrying no ліміт SHALL
have no ціль витрат, and a категорія carrying a ліміт SHALL have exactly one.

#### Scenario: One сума, whichever name it is set under

- **WHEN** the owner sets a ліміт of 200000 minor units UAH on Ресторани and then reads the ціль
  витрат «Ресторани»
- **THEN** the ціль витрат is of at most 200000 minor units UAH, and no second сума exists for
  Ресторани

#### Scenario: Changing under one name changes under the other

- **WHEN** the owner changes the ceiling of the ціль витрат «Ресторани» to 250000 minor units UAH
- **THEN** the ліміт of Ресторани is 250000 minor units UAH

#### Scenario: Clearing removes both readings

- **WHEN** the owner clears the ліміт of Ресторани
- **THEN** Ресторани carries no ліміт and there is no ціль витрат «Ресторани»

#### Scenario: A категорія cannot hold two ceilings

- **WHEN** a категорія carries a ліміт of 200000 minor units UAH
- **THEN** there is exactly one ціль витрат for it, of exactly 200000 minor units UAH, and no way
  to give the ціль a different сума while the ліміт keeps the old one

### Requirement: Over limit is decided per month in the ліміт's own currency

A category SHALL be over its ліміт for a calendar month exactly when that month's spent of that
category in the ліміт's currency — the net-of-повернення amount the monthly-picture breakdown
defines — is strictly greater than the ліміт's сума. Spending equal to the ліміт is not over.
Spending of the same category in any other currency SHALL NOT count toward the ліміт and SHALL
NOT be converted toward it. A category with no ліміт is never over. The determination is made
per month: one month's excess says nothing about any other month.

#### Scenario: Spending above the ліміт is over

- **WHEN** Groceries carries a ліміт of 250000 minor units UAH and August's spent in Groceries
  is 250001 minor units UAH
- **THEN** Groceries is over its ліміт for August

#### Scenario: Spending equal to the ліміт is not over

- **WHEN** Groceries carries a ліміт of 250000 minor units UAH and August's spent in Groceries
  is exactly 250000 minor units UAH
- **THEN** Groceries is not over its ліміт for August

#### Scenario: A повернення pulls the month back under

- **WHEN** Groceries carries a ліміт of 250000 minor units UAH, August holds витрати of 260000
  minor units UAH in Groceries and a повернення of 20000 minor units UAH in Groceries
- **THEN** August's spent in Groceries is 240000 minor units UAH and Groceries is not over its
  ліміт for August

#### Scenario: Another currency's spending never counts

- **WHEN** Groceries carries a ліміт of 250000 minor units UAH, August's spent in Groceries is
  200000 minor units UAH plus 5000 minor units USD
- **THEN** Groceries is not over its ліміт for August, whatever any exchange rate says

#### Scenario: Months are judged independently

- **WHEN** Groceries is over its ліміт for July and August's spent in Groceries is below the
  ліміт
- **THEN** Groceries is not over its ліміт for August

#### Scenario: No ліміт means never over

- **WHEN** a category carries no ліміт and a month's spent in it is any amount
- **THEN** the category is not over a ліміт for that month

### Requirement: A month that has ended carries a settled ліміт verdict

For a calendar month that has ended, whether the категорія was over its ліміт SHALL be decided by
that month's транзакції alone, and SHALL NOT change because a later month's spending changed. The
verdict SHALL change only when a транзакція of that month is added, edited or removed — the same
condition under which every other number of that month changes.

#### Scenario: A finished month keeps its verdict

- **WHEN** August ended with a spent in Ресторани of 180000 minor units UAH against a ліміт of
  200000, and September's spending in Ресторани then passes 200000
- **THEN** August is still not over its ліміт

#### Scenario: A retroactive транзакція settles the month anew

- **WHEN** a витрата of 30000 minor units UAH dated in August is recorded in Ресторани after August
  ended, bringing August's spent to 210000 against a ліміт of 200000
- **THEN** August is over its ліміт

### Requirement: A ліміт blocks nothing and pushes nothing

Exceeding a ліміт SHALL change only how the category is shown. Recording, editing and importing
транзакції in an over-limit category SHALL work exactly as without a ліміт, and no notification
of any kind SHALL be produced.

#### Scenario: Recording into an over-limit category still stores

- **WHEN** Groceries is over its ліміт for August and the owner records another витрата in
  Groceries dated in August
- **THEN** the витрата is stored exactly as it would be without a ліміт
