## ADDED Requirements

### Requirement: The «Базові категорії» section maps the шаблон onto this device's категорії

The «Базові категорії» section SHALL list every базова категорія of the шаблон with the категорія
of this device it currently lands in, and SHALL say for each whether that is its типова категорія
or a choice the owner made. Each SHALL offer pointing it at another unarchived expense категорія
and switching it off; a switched-off базова категорія SHALL be listed as off rather than hidden, so
nothing the шаблон covers disappears from the list.

Each базова категорія SHALL show what it covers — the merchant patterns and the MCC codes it
carries — so the owner can tell why a витрата landed where it did before changing anything. Those
patterns and codes SHALL be shown as what they are and SHALL NOT be editable: a merchant the шаблон
gets wrong is corrected by the owner's own правило, which outranks it.

The section SHALL say, above the list, that a правило of the owner's own always wins over the
шаблон.

#### Scenario: The section lists every базова категорія with where it lands

- **WHEN** the owner opens «Базові категорії» having changed nothing
- **THEN** every базова категорія of the шаблон is listed, each with its типова категорія named,
  and each marked as using its типова категорія

#### Scenario: Pointing one at another категорія

- **WHEN** the owner points «Продукти» at «Їжа»
- **THEN** «Продукти» is listed as landing in «Їжа» and marked as the owner's own choice

#### Scenario: A switched-off базова категорія stays in the list

- **WHEN** the owner switches «Алкоголь і тютюн» off
- **THEN** it is still listed, marked as off, and names no категорія

#### Scenario: What a базова категорія covers is visible and not editable

- **WHEN** the owner opens «Продукти»
- **THEN** its merchant patterns and its MCC codes are shown, and none of them can be changed

## MODIFIED Requirements

### Requirement: The Налаштування tab hosts the management sections

The app SHALL offer a «Налаштування» tab, last after Головний, Місяць, Рахунки and Звіти.
Opening it SHALL offer «Перші кроки», which opens the setup view, and the sections «Категорії»,
«Джерела» and «Правила», each opening its management list, «Базові категорії», which opens the
шаблон's mapping onto this device's категорії, «Ліміти», which opens limit
management, «Цілі», which opens goal management, «Імпорт Saldo», which opens the one-time import
flow, «monobank», which opens token, account linking and sync management,
«Сповіщення банків», which opens notification access and watched apps management, «Бекап»,
which opens saving the whole state to one file and restoring it from one, and «Репорти про
помилки», which opens the list of репорти and filing a new one.

#### Scenario: The tab opens on its sections

- **WHEN** the owner opens «Налаштування»
- **THEN** the sections «Перші кроки», «Категорії», «Джерела», «Правила», «Базові категорії»,
  «Ліміти», «Цілі», «Імпорт Saldo», «monobank», «Сповіщення банків», «Бекап» and «Репорти про
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

#### Scenario: The bug-reports section opens the list

- **WHEN** the owner opens «Репорти про помилки»
- **THEN** the list of saved репорти and «Повідомити про помилку» are available in one flow
