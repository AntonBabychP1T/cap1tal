## MODIFIED Requirements

### Requirement: The Налаштування tab hosts the management sections

The app SHALL offer a «Налаштування» tab, last after Головний, Місяць, Рахунки and Звіти.
Opening it SHALL offer «Перші кроки», which opens the setup view, and the sections «Категорії»,
«Джерела» and «Правила», each opening its management list, «Ліміти», which opens limit
management, «Цілі», which opens goal management, «Імпорт Saldo», which opens the one-time import
flow, «monobank», which opens token, account linking and sync management, and
«Сповіщення банків», which opens notification access and watched apps management.

#### Scenario: The tab opens on its sections

- **WHEN** the owner opens «Налаштування»
- **THEN** the sections «Перші кроки», «Категорії», «Джерела», «Правила», «Ліміти», «Цілі»,
  «Імпорт Saldo», «monobank» and «Сповіщення банків» are offered

#### Scenario: The import section opens the import flow

- **WHEN** the owner opens «Імпорт Saldo»
- **THEN** the one-time Saldo import flow opens, at its first step

#### Scenario: The monobank section opens connection management

- **WHEN** the owner opens «monobank»
- **THEN** token state, monobank accounts, links and sync state are available in one flow

#### Scenario: The first-steps section opens the setup view

- **WHEN** the owner opens «Перші кроки»
- **THEN** the setup view opens with every step and its current state

#### Scenario: The bank-notifications section opens access and watches

- **WHEN** the owner opens «Сповіщення банків»
- **THEN** the notification access state and the watched apps management are available in one
  flow
