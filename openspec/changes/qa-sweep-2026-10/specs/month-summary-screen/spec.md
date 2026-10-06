## MODIFIED Requirements

### Requirement: Every part of the підсумок leads to what it is made of

Choosing a part SHALL lead to the screen that holds its records:

| Part | Leads to |
|---|---|
| a категорія that changed | that категорія's month |
| an спостереження | where the observations capability says |
| the зміна статку | the «Статок» screen |
| a ціль-накопичення | its breakdown screen |
| a ліміт | its категорія's month |
| the «Без категорії» count | the month's транзакції, narrowed to «Без категорії» |
| the «Без джерела» count | the month's транзакції, narrowed to «Без джерела» |
| the waiting чернетки | Головний, where чернетки are answered |
| the коригування | the month's list of коригування |

Every such part SHALL be a control with a label a screen reader announces. A mark — at or above
the 2 % of коригування — SHALL be stated in words, not by colour alone.

#### Scenario: A changed категорія opens its month

- **WHEN** the owner chooses Продукти in «Найбільше змінилися» of September
- **THEN** the транзакції of Продукти in September open

#### Scenario: Unanswered records open narrowed

- **WHEN** September holds витрати «Без категорії» and the owner chooses that line
- **THEN** the транзакції of September open, narrowed to «Без категорії»

#### Scenario: Unsourced records open narrowed too

- **WHEN** September holds доходи «Без джерела» and the owner chooses that line
- **THEN** the транзакції of September open, narrowed to «Без джерела»

#### Scenario: «Не дубль» is answered in place

- **WHEN** the owner answers «Не дубль» to a можливий дубль in the підсумок of September
- **THEN** it disappears from the підсумок without leaving the screen, and both транзакції are
  unchanged
