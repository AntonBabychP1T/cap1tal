## ADDED Requirements

### Requirement: Налаштування offers «Базові категорії» right after «Правила»

Among the sections the «Налаштування» tab offers, it SHALL offer «Базові категорії», which opens the
шаблон's mapping onto this device's категорії, placed immediately after «Правила» — the two are the
owner's tier and the built-in tier of one автокатегоризація, and are read together. Every other
section SHALL stay where it is.

#### Scenario: The tab offers «Базові категорії» after «Правила»

- **WHEN** the owner opens «Налаштування»
- **THEN** «Базові категорії» is offered immediately after «Правила», and every section offered
  before it is still offered in the same order

#### Scenario: The section opens the mapping

- **WHEN** the owner opens «Базові категорії»
- **THEN** every базова категорія of the шаблон is listed with where it lands

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
