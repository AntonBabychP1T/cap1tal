## Purpose
The «Транзакції» screen — every stored транзакція, not only the latest, with a search over what
they say and filters by рахунок and місяць. It exists because a history that cannot be searched
cannot answer "where did the money go" once it is longer than one screen.

## ADDED Requirements

### Requirement: Every stored транзакція is reachable

The «Транзакції» screen SHALL show the stored транзакції ordered newest first — by date, then by
recording recency — under no fixed ceiling: when more remain than are shown, the screen SHALL
offer showing more and SHALL keep the ones already shown in place. Reaching the end SHALL be
plain, and the screen SHALL never claim there is more when there is not. WHEN nothing is stored
at all, the screen SHALL say so.

#### Scenario: The history continues past the feed's ceiling

- **WHEN** 188 транзакції are stored and the owner opens «Транзакції»
- **THEN** the newest ones are shown and the screen offers showing more until every stored
  транзакція has been shown

#### Scenario: Showing more keeps what is already shown

- **WHEN** the owner asks for more транзакції
- **THEN** the ones already on the screen stay where they are and the next ones follow them in
  the same order

#### Scenario: An empty history says so

- **WHEN** nothing is stored and the owner opens «Транзакції»
- **THEN** the screen states that nothing is recorded yet

### Requirement: Транзакції are found by what they say

A search SHALL match a транзакція when the typed text occurs — without regard to letter case, at
any position — in its опис, in the name of its категорія, or in the name of its джерело; and,
WHEN the typed text reads as a сума, a транзакція whose amount equals that сума on either leg
SHALL match too, whatever its currency, since the typed сума names no currency. A транзакція
SHALL be shown at most once however many of those it matches. An empty search SHALL narrow
nothing.

#### Scenario: The bank's text finds the транзакція

- **WHEN** the owner searches for "сільпо" and a витрата carries the опис "СІЛЬПО Київ"
- **THEN** that витрата is shown

#### Scenario: A категорія is found by its name

- **WHEN** the owner searches for "прод" and витрати carry the категорія «Продукти»
- **THEN** those витрати are shown

#### Scenario: A сума is found as typed

- **WHEN** the owner searches for "1200" and a витрата of 120000 minor units UAH and a витрата of
  1200 minor units UAH are stored
- **THEN** the витрата of 120000 minor units UAH is shown, since "1200" is 1200,00 in major units

#### Scenario: A транзакція matching twice is shown once

- **WHEN** the owner searches for "пошта" and a витрата carries both the опис "Нова пошта" and a
  категорія named «Пошта»
- **THEN** that витрата appears once in the results

#### Scenario: An empty search shows the history

- **WHEN** the search text is empty
- **THEN** the screen shows the stored транзакції exactly as it does with no search

### Requirement: The list narrows by рахунок and by місяць

The screen SHALL let the owner narrow the list to one рахунок — a переказ counting on either leg
— and to one calendar місяць, each independently and together with the search. The narrowing in
force SHALL be visible, and clearing it SHALL be possible without leaving the screen. Narrowing
SHALL only ever remove транзакції from the result, never add or reorder them.

#### Scenario: One рахунок at a time

- **WHEN** the owner narrows to «гаманець»
- **THEN** only транзакції touching «гаманець» are shown, transfers on either leg included

#### Scenario: A місяць bounds the result

- **WHEN** the owner narrows to March 2026
- **THEN** only транзакції dated in March 2026 are shown, in the same order as before

#### Scenario: Search and filters combine

- **WHEN** the owner searches for "сільпо" while narrowed to «гаманець» and to March 2026
- **THEN** only транзакції satisfying all three are shown

#### Scenario: The narrowing can be cleared

- **WHEN** the owner clears the рахунок and місяць narrowing
- **THEN** the full history is shown again without leaving the screen

### Requirement: A found транзакція reads and opens as it does in the feed

Each line SHALL show what the latest-transactions feed shows — сума with its currency, рахунок
(both for a переказ), дата, категорія or джерело, and the опис when one exists — and SHALL carry
the same marks: «Без категорії» highlighted, a категорія over its ліміт for that транзакція's
own month shown over limit. Tapping a line SHALL open that транзакція for editing exactly as the
feed does. The screen SHALL create, change and delete nothing of its own.

#### Scenario: A found транзакція is edited

- **WHEN** the owner taps a транзакція in the results
- **THEN** it opens for editing exactly as it does from the latest-transactions feed

#### Scenario: The marks travel with the line

- **WHEN** the results hold a витрата in «Без категорії» and a витрата in a категорія over its
  ліміт for that витрата's month
- **THEN** the first is highlighted as uncategorised and the second shows its категорія over limit

#### Scenario: Searching changes nothing stored

- **WHEN** the owner searches, narrows and clears the narrowing
- **THEN** no транзакція is created, changed or deleted

### Requirement: A search that finds nothing says so

WHEN the search and the narrowing in force match no stored транзакція, the screen SHALL say that
nothing was found and SHALL keep the search text and the narrowing as they are, so the owner can
loosen them; it SHALL NOT fall back to showing unrelated транзакції.

#### Scenario: Nothing found is said, not hidden

- **WHEN** the owner searches for "щось, чого немає"
- **THEN** the screen states that nothing was found, the search text stays, and no other
  транзакція is shown
