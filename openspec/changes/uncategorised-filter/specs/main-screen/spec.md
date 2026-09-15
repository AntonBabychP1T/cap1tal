## ADDED Requirements

### Requirement: «Потребує уваги» leads to the транзакції without a категорія

The row of «Потребує уваги» that names how many транзакції are without a категорія SHALL open
«Транзакції» with the «Без категорії» narrowing already in force, as the transaction-search
capability defines — not on the whole history. The number the row names SHALL count exactly the
транзакції that narrowing shows: the витрати and повернення carrying «Без категорії». The offer of
the latest-transactions section to go to all транзакції SHALL keep opening the whole history.

#### Scenario: «Переглянути» opens only what is waiting

- **WHEN** «Потребує уваги» names three транзакції without a категорія among 188 stored and the
  owner follows that row
- **THEN** «Транзакції» opens narrowed to «Без категорії», showing those three and no other

#### Scenario: A повернення in «Без категорії» is counted

- **WHEN** the only транзакція carrying «Без категорії» is a повернення
- **THEN** «Потребує уваги» names one транзакція without a категорія

#### Scenario: The feed's way to all транзакції is not narrowed

- **WHEN** the owner follows the latest-transactions section's offer to see all транзакції
- **THEN** «Транзакції» opens on the whole history with no narrowing in force

#### Scenario: The owner can still see everything from there

- **WHEN** the owner has followed that row to «Транзакції»
- **THEN** the «Без категорії» narrowing reads as in force and taking it off shows the whole
  history
