## MODIFIED Requirements

### Requirement: The Налаштування tab hosts the management sections

The app SHALL offer a «Налаштування» tab, last after Головний, Місяць, Рахунки and Звіти.
Opening it SHALL offer the sections «Категорії», «Джерела» and «Правила», each opening its
management list, «Ліміти», which opens limit management, «Цілі», which opens goal management,
«Імпорт Saldo», which opens the one-time import flow, and «monobank», which opens token, account
linking and sync management.

#### Scenario: The tab opens on its sections

- **WHEN** the owner opens «Налаштування»
- **THEN** the sections «Категорії», «Джерела», «Правила», «Ліміти», «Цілі», «Імпорт Saldo» and
  «monobank» are offered

#### Scenario: The import section opens the import flow

- **WHEN** the owner opens «Імпорт Saldo»
- **THEN** the one-time Saldo import flow opens, at its first step

#### Scenario: The monobank section opens connection management

- **WHEN** the owner opens «monobank»
- **THEN** token state, monobank accounts, links and sync state are available in one flow

## ADDED Requirements

### Requirement: The Ліміти section manages the limits

The «Ліміти» section SHALL show every unarchived category with its ліміт or its absence, and an
archived category carrying a ліміт visibly set apart, so a leftover ліміт can still be found and
cleared. It SHALL offer setting, changing and clearing a ліміт per the limits capability, the
сума entered in major units the way an amount is entered when recording, with the ліміт's
currency chosen from the same currencies a рахунок can be created in, defaulting to UAH.

#### Scenario: A set ліміт appears with its category

- **WHEN** the owner sets a ліміт of "2500" in UAH on Groceries in the «Ліміти» section
- **THEN** the section shows Groceries with a ліміт of 250000 minor units UAH, and August's
  Groceries spending above it marks the category over limit

#### Scenario: A ліміт can be set in another offered currency

- **WHEN** the owner sets a ліміт of "100" in USD on the category Travel
- **THEN** Travel carries a ліміт of 10000 minor units USD, and only Travel's USD spending is
  judged against it

#### Scenario: A cleared ліміт leaves the category listed

- **WHEN** the owner clears the ліміт of Groceries
- **THEN** the section still shows Groceries, now with no ліміт

#### Scenario: An archived category with a ліміт stays visible

- **WHEN** the owner archives Pets while it carries a ліміт
- **THEN** the «Ліміти» section shows Pets visibly set apart, its ліміт clearable, while an
  archived category without a ліміт is not listed

### Requirement: The Цілі section manages the цілі

The «Цілі» section SHALL list every ціль with its назва, target, дата and linked рахунок, and
SHALL offer creating, editing and deleting per the goals capability, deletion after
confirmation. Linking SHALL offer the unarchived рахунки; a ціль whose рахунок was archived
SHALL stay listed and editable.

#### Scenario: A created ціль appears in the list

- **WHEN** the owner creates the ціль «Авто» for "200000" UAH by 2026-12-31 on the jar «Подушка»
- **THEN** the «Цілі» section lists «Авто» with a target of 20000000 minor units UAH, the дата
  and the рахунок «Подушка»

#### Scenario: A deletion is confirmed first

- **WHEN** the owner deletes the ціль «Авто» and confirms
- **THEN** «Авто» is gone from the list and from «Звіти»

#### Scenario: An archived рахунок is not offered for a new ціль

- **WHEN** the owner creates a ціль while a рахунок is archived
- **THEN** that рахунок is not among the offered рахунки, while an existing ціль linked to it
  stays listed
