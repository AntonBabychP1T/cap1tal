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
| the «Без категорії» count | the queue «Що потребує відповіді», narrowed to the month |
| the «Без джерела» count | the queue «Що потребує відповіді», narrowed to the month |
| the waiting чернетки | the queue «Що потребує відповіді», narrowed to the month |
| the коригування | the month's list of коригування |

Every such part SHALL be a control with a label a screen reader announces. A mark — at or above
the 2 % of коригування — SHALL be stated in words, not by colour alone.

#### Scenario: A changed категорія opens its month

- **WHEN** the owner chooses Продукти in «Найбільше змінилися» of September
- **THEN** the транзакції of Продукти in September open

#### Scenario: Unanswered records open narrowed

- **WHEN** September holds three витрати «Без категорії» of 45000 minor units UAH in total and the
  owner chooses that line
- **THEN** the queue opens narrowed to вересень 2026, holding «Без категорії» with those three, each
  answerable in place

#### Scenario: Unsourced records open narrowed too

- **WHEN** September holds nine доходи «Без джерела» and the owner chooses that line
- **THEN** the queue opens narrowed to вересень 2026, holding «Без джерела» with those nine

#### Scenario: «Не дубль» is answered in place

- **WHEN** the owner answers «Не дубль» to a можливий дубль in the підсумок of September
- **THEN** it disappears from the підсумок without leaving the screen, and both транзакції are
  unchanged
