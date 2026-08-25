## MODIFIED Requirements

### Requirement: The Налаштування tab hosts the management sections

The app SHALL offer a «Налаштування» tab, last after Головний, Місяць and Рахунки. Opening it
SHALL offer the sections «Категорії», «Джерела» and «Правила», each opening its management list,
and «Імпорт Saldo», which opens the one-time import flow.

#### Scenario: The tab opens on its sections

- **WHEN** the owner opens «Налаштування»
- **THEN** the sections «Категорії», «Джерела», «Правила» and «Імпорт Saldo» are offered

#### Scenario: The import section opens the import flow

- **WHEN** the owner opens «Імпорт Saldo»
- **THEN** the one-time Saldo import flow opens, at its first step
