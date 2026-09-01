## MODIFIED Requirements

### Requirement: The Налаштування tab hosts the management sections

The app SHALL offer a «Налаштування» tab, last after Головний, Місяць, Рахунки and Звіти.
Opening it SHALL offer «Перші кроки», which opens the setup view, and the sections «Категорії»,
«Джерела» and «Правила», each opening its management list, «Ліміти», which opens limit
management, «Цілі», which opens goal management, «Імпорт Saldo», which opens the one-time import
flow, «monobank», which opens token, account linking and sync management, and «Google Drive»,
which opens backup connection, status and restore.

#### Scenario: The tab opens on its sections

- **WHEN** the owner opens «Налаштування»
- **THEN** the sections «Перші кроки», «Категорії», «Джерела», «Правила», «Ліміти», «Цілі»,
  «Імпорт Saldo», «monobank» and «Google Drive» are offered

#### Scenario: The import section opens the import flow

- **WHEN** the owner opens «Імпорт Saldo»
- **THEN** the one-time Saldo import flow opens, at its first step

#### Scenario: The monobank section opens connection management

- **WHEN** the owner opens «monobank»
- **THEN** token state, monobank accounts, links and sync state are available in one flow

#### Scenario: The first-steps section opens the setup view

- **WHEN** the owner opens «Перші кроки»
- **THEN** the setup view opens with every step and its current state

#### Scenario: The Google Drive section opens backup management

- **WHEN** the owner opens «Google Drive»
- **THEN** the connection state, the last successful бекап, and the actions for backing up and
  restoring are available in one flow

## ADDED Requirements

### Requirement: The tab tells the truth about what leaves the phone

The «Налаштування» tab SHALL state what the app sends outside the phone, and that statement
SHALL match the app's actual state: while Google Drive is not connected it SHALL name only the
monobank requests, and while Google Drive is connected it SHALL also name the бекап going to
the owner's own Google Drive. It SHALL NOT claim that everything stays on the phone while
Google Drive is connected.

#### Scenario: Not connected names monobank only

- **WHEN** the owner opens «Налаштування» and Google Drive is not connected
- **THEN** the tab states that the only thing leaving the phone is the monobank requests made
  with the owner's token

#### Scenario: Connected names the backup too

- **WHEN** the owner opens «Налаштування» while Google Drive is connected
- **THEN** the tab also states that a sealed бекап goes to the owner's own Google Drive
