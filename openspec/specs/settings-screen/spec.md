# settings-screen Specification

## Purpose
The «Налаштування» tab — the one place the owner configures the app: категорії, джерела and
правила автокатегоризації now; monobank-токен, ліміти, цілі and бекап in later steps.
## Requirements
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

