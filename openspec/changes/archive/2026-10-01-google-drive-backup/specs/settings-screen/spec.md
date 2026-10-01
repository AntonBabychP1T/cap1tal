## MODIFIED Requirements

### Requirement: The Налаштування tab hosts the management sections

The app SHALL offer a «Налаштування» tab, last after Головний, Місяць, Рахунки and Звіти.
Opening it SHALL offer «Перші кроки», which opens the setup view, and the sections «Категорії»,
«Джерела» and «Правила», each opening its management list, «Ліміти», which opens limit
management, «Цілі», which opens goal management, «Імпорт Saldo», which opens the one-time import
flow, «monobank», which opens token, account linking and sync management,
«Сповіщення банків», which opens notification access and watched apps management, «Бекап»,
which opens saving the whole state to one file and restoring it from one, «Google Drive», which
opens backup connection, status and restore, and «Репорти про помилки», which opens the list of
репорти and filing a new one.

«Бекап» and «Google Drive» are two sections and not one: the first is the file the owner makes
and keeps themselves, the second is the sealed copy that goes to their own Drive without being
asked. Each says which of the two it is.

#### Scenario: The tab opens on its sections

- **WHEN** the owner opens «Налаштування»
- **THEN** the sections «Перші кроки», «Категорії», «Джерела», «Правила», «Ліміти», «Цілі»,
  «Імпорт Saldo», «monobank», «Сповіщення банків», «Бекап», «Google Drive» and «Репорти про
  помилки» are offered

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

#### Scenario: The backup section opens saving and restoring

- **WHEN** the owner opens «Бекап»
- **THEN** saving the whole state to one file and restoring it from one are available in one flow

#### Scenario: The Google Drive section opens backup management

- **WHEN** the owner opens «Google Drive»
- **THEN** the connection state, the last successful бекап, and the actions for backing up and
  restoring are available in one flow

#### Scenario: The bug-reports section opens the list

- **WHEN** the owner opens «Репорти про помилки»
- **THEN** the list of saved репорти and «Повідомити про помилку» are available in one flow

## ADDED Requirements

### Requirement: The tab tells the truth about what leaves the phone

The «Налаштування» tab SHALL state what the app sends outside the phone, and that statement SHALL
match the app's actual state. It SHALL name every outbound connection the app makes: the monobank
requests carrying the owner's token, the tokenless request for monobank's exchange rates, and the
lookup of a фіскальний чек at the tax service that the owner asks for by scanning one. While
Google Drive is connected it SHALL also name the sealed бекап going to the owner's own Google
Drive, and it SHALL NOT claim that everything stays on the phone.

The statement SHALL name no connection the app does not make. A connection a later change adds is
part of this requirement the day it lands, and this sentence is where it is named.

#### Scenario: Not connected names what the app sends without Google Drive

- **WHEN** the owner opens «Налаштування» and Google Drive is not connected
- **THEN** the tab states that what leaves the phone is the monobank requests made with the
  owner's token, the tokenless request for monobank's exchange rates, and the чек lookups the
  owner asks for — and no бекап

#### Scenario: Connected names the backup too

- **WHEN** the owner opens «Налаштування» while Google Drive is connected
- **THEN** the tab states the same three connections and also that a sealed бекап goes to the
  owner's own Google Drive
