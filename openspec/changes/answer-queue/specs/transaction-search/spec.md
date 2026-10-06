## MODIFIED Requirements

### Requirement: The list narrows to «Без категорії»

The «Транзакції» screen SHALL let the owner narrow the list to the транзакції without a категорія:
exactly the витрати and повернення carrying «Без категорії» — every line the list marks as
uncategorised, and the same set the «Без категорії» group of the queue «Що потребує відповіді»
lists over all history, so the count there, the marks and the list here SHALL name the same
транзакції. A дохід carrying «Без джерела», a переказ, a
коригування, and a витрата or повернення in any other категорія SHALL NOT be shown under it.

The narrowing SHALL combine with the search, the рахунок and the місяць like the other narrowings,
SHALL be visible while in force, and SHALL be cleared together with them. Like them it SHALL only
ever remove транзакції from the result, never add or reorder them; the empty result SHALL be the
«nothing found» the screen already says for a narrowing that matches nothing.

#### Scenario: Only the uncategorised витрати are shown

- **WHEN** a витрата «СІЛЬПО Київ» in «Без категорії», a витрата «АТБ» in «Продукти», a дохід in
  «Без джерела» and a переказ are stored and the owner narrows to «Без категорії»
- **THEN** only «СІЛЬПО Київ» is shown

#### Scenario: A повернення in «Без категорії» is a question too

- **WHEN** a повернення carrying «Без категорії» and a повернення in «Продукти» are stored and the
  owner narrows to «Без категорії»
- **THEN** only the first is shown, marked as uncategorised, and the queue's «Без категорії» group
  counts it

#### Scenario: The list and Головний's count agree

- **WHEN** six stored витрати and one повернення carry «Без категорії», nothing else waits, and the
  rail row «Що потребує відповіді» names «7 без категорії»
- **THEN** «Транзакції» narrowed to «Без категорії» shows exactly those seven

#### Scenario: «Без категорії» combines with a рахунок and a місяць

- **WHEN** the owner narrows to «Без категорії», to «гаманець» and to March 2026
- **THEN** only the транзакції in «Без категорії» touching «гаманець» and dated in March 2026 are shown,
  in the same order as before

#### Scenario: Clearing takes «Без категорії» off with the rest

- **WHEN** the list is narrowed to «Без категорії» and to «гаманець» and the owner clears the
  narrowing
- **THEN** the full history is shown again without leaving the screen

#### Scenario: Nothing left uncategorised says so

- **WHEN** no stored транзакція carries «Без категорії» and the owner narrows to «Без категорії»
- **THEN** the screen states that nothing was found and the narrowing stays in force

### Requirement: «Транзакції» can be opened already narrowed to one місяць

The system SHALL be able to open «Транзакції» narrowed to a named місяць, so another screen that
leads to one місяць's транзакції — a виклик with nothing left to answer, for one — lands the owner on
that місяць rather than on the whole history. The narrowing SHALL be an **initial value and not a
lock**: it is shown in the місяць narrowing like any other, and the owner may widen or change it
exactly as they can one they chose themselves.

A місяць that is not a calendar місяць SHALL narrow nothing, and neither SHALL an absent one: the
screen opens on the whole history rather than on an empty list or a refusal.

#### Scenario: A виклик opens the місяць it is about

- **WHEN** «Транзакції» is opened asking for 2026-08 — as a «Закрий серпень 2026» with nothing left
  in it does, while one still waiting opens the queue instead
- **THEN** the list shows the транзакції of 2026-08, the місяць narrowing says 2026-08, and the
  owner can widen it back to every місяць

#### Scenario: Something that is not a місяць narrows nothing

- **WHEN** «Транзакції» is opened asking for «2026-13», for «серпень» or for nothing at all
- **THEN** the list shows the whole history and no narrowing is in force
