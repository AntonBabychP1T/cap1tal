## Purpose

The pushed «Підсумок <місяця>» screen: where the owner reads one finished month as a whole, goes
from each part of it to the records behind it, and — by their own choice — takes that one month
to AI-аналіз. It shows what the month-summary capability computes and nothing else.

## ADDED Requirements

### Requirement: The підсумок opens as a pushed screen named by its month

The підсумок of a month SHALL open as a screen pushed over the tab it was opened from. Its title
SHALL name the month in words with its year, «Підсумок вересня 2026». Hardware or gesture back
SHALL return to the screen it was opened from. Opening it SHALL write nothing and request nothing.
Returning to it after a change elsewhere SHALL show the stored state as it is now: a транзакція
categorised in between is no longer counted «Без категорії».

#### Scenario: Opened from Місяць, back to Місяць

- **WHEN** the owner opens «Підсумок вересня 2026» from Місяць and goes back
- **THEN** Місяць is shown on September as it was

#### Scenario: A categorisation made from the підсумок is reflected on return

- **WHEN** the підсумок states 3 «Без категорії», the owner follows it to the транзакції,
  categorises one and returns
- **THEN** the підсумок states 2 «Без категорії»

### Requirement: The screen reads in a fixed order of sections

The screen SHALL show, in this order:
1. витрачено against the previous month and a typical month;
2. the категорії that changed most;
3. the month's спостереження;
4. the місячна картина;
5. the зміна статку with its розбивка;
6. the цілі and ліміти;
7. what is still unanswered, or that the month is a чистий місяць;
8. the коригування with their частка;
9. the way to AI-аналіз for this month.

Each section that holds several currencies SHALL show each currency apart, UAH first. A section
with nothing to state SHALL say so in one sentence rather than disappear:
- no спостереження;
- no ціль and no ліміт;
- no коригування.

#### Scenario: A plain September

- **WHEN** September holds UAH транзакції only, two спостереження, one ціль, no ліміт and no
  коригування
- **THEN** the nine sections appear in order, one UAH reading each, the цілі section names the
  ціль, and the коригування section says there were none

#### Scenario: Two currencies stay apart

- **WHEN** September holds UAH and USD витрати
- **THEN** витрачено, the категорії that changed most and the місячна картина each show a UAH
  reading and then a USD one, and no reading adds the two

### Requirement: Every part of the підсумок leads to what it is made of

Choosing a part SHALL lead to the screen that holds its records:

| Part | Leads to |
|---|---|
| a категорія that changed | that категорія's month |
| an спостереження | where the observations capability says |
| the зміна статку | the «Статок» screen |
| a ціль-накопичення | its breakdown screen |
| a ліміт | its категорія's month |
| the unanswered records | the month's транзакції, narrowed to «Без категорії» when it has any |
| the коригування | the month's list of коригування |

Every such part SHALL be a control with a label a screen reader announces. A mark — at or above
the 2 % of коригування — SHALL be stated in words, not by colour alone.

#### Scenario: A changed категорія opens its month

- **WHEN** the owner chooses Продукти in «Найбільше змінилися» of September
- **THEN** the транзакції of Продукти in September open

#### Scenario: Unanswered records open narrowed

- **WHEN** September holds витрати «Без категорії» and the owner chooses that line
- **THEN** the транзакції of September open, narrowed to «Без категорії»

#### Scenario: «Не дубль» is answered in place

- **WHEN** the owner answers «Не дубль» to a можливий дубль in the підсумок of September
- **THEN** it disappears from the підсумок without leaving the screen, and both транзакції are
  unchanged

### Requirement: A month without a підсумок is said in words, never an exception

WHEN the screen is opened for a month that has no підсумок, it SHALL say why in one sentence and
show no section:
- the current month: its підсумок comes after its last day;
- a month with no транзакція: there is nothing to sum up;
- a month after the current one: it has not come yet;
- text that is not a month: there is no such month.

It SHALL show no exception in any of these cases.

#### Scenario: The current month is not finished

- **WHEN** today is 2026-10-02 and the screen is opened for October 2026
- **THEN** it says the підсумок of October comes after 31 October and shows no section

#### Scenario: A month with nothing in it

- **WHEN** the screen is opened for July 2026, which holds no транзакція
- **THEN** it says there is nothing to sum up for July and shows no section

#### Scenario: A month that has not come yet

- **WHEN** today is 2026-10-02 and the screen is opened for December 2026
- **THEN** it says December has not come yet and shows no section

#### Scenario: Not a month at all

- **WHEN** the screen is opened for «2026-13»
- **THEN** it says there is no such month, and no exception is shown

### Requirement: The підсумок leads to AI-аналіз of that one month and hands nothing over itself

The last part of the screen SHALL be an action named «AI-аналіз <місяця>», for example «AI-аналіз
вересня». It SHALL open the AI-аналіз screen with that month alone as its period. The action
SHALL build no пакет, prepare no file and hand nothing to any app. Everything that leaves the
phone SHALL leave only by «Поділитися з AI» on the AI-аналіз screen, as that screen specifies.

#### Scenario: September goes to AI-аналіз as one month

- **WHEN** the owner chooses «AI-аналіз вересня» on the підсумок of September 2026
- **THEN** the AI-аналіз screen opens with the period 2026-09 to 2026-09, «Продавці» and «Окремі
  транзакції» off, and nothing has left the phone

#### Scenario: Leaving without sharing hands nothing over

- **WHEN** the owner opens AI-аналіз from the підсумок and goes back without choosing «Поділитися з
  AI»
- **THEN** no file has been handed to any app
