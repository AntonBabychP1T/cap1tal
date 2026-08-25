# settings-screen Specification

## Purpose
The «Налаштування» tab — the one place the owner configures the app: категорії, джерела and
правила автокатегоризації now; monobank-токен, ліміти, цілі and бекап in later steps.
## Requirements
### Requirement: The Налаштування tab hosts the management sections

The app SHALL offer a «Налаштування» tab, last after Головний, Місяць and Рахунки. Opening it
SHALL offer the sections «Категорії», «Джерела» and «Правила», each opening its management list.

#### Scenario: The tab opens on its sections

- **WHEN** the owner opens «Налаштування»
- **THEN** the sections «Категорії», «Джерела» and «Правила» are offered

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

