## ADDED Requirements

### Requirement: A пакет never carries a припущення

A пакет для аналізу SHALL NOT carry any припущення, «Ні» or count of them, nor whether the local
model is on. A витрата showing a категорія припущення SHALL be carried under «Без категорії», as it
is stored.

#### Scenario: A guessed витрата is still «Без категорії» in the пакет

- **WHEN** August holds a витрата of 30000 minor units UAH in «Без категорії» showing «Схоже на:
  COFFEE ☕», and a пакет is built
- **THEN** the пакет counts it under «Без категорії», and the serialised пакет contains no trace of
  the припущення
