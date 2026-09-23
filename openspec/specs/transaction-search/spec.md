# transaction-search Specification

## Purpose
The «Транзакції» screen — every stored транзакція, not only the latest, with a search over what
they say and filters by рахунок and місяць. It exists because a history that cannot be searched
cannot answer "where did the money go" once it is longer than one screen.

## Requirements

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

### Requirement: «Транзакції» can be opened already narrowed to one місяць

The system SHALL be able to open «Транзакції» narrowed to a named місяць, so a виклик whose action
is «the place where those items are answered» lands the owner on the місяць it is about rather than
on the whole history. The narrowing SHALL be an **initial value and not a lock**: it is shown in
the місяць narrowing like any other, and the owner may widen or change it exactly as they can one
they chose themselves.

A місяць that is not a calendar місяць SHALL narrow nothing, and neither SHALL an absent one: the
screen opens on the whole history rather than on an empty list or a refusal.

#### Scenario: A виклик opens the місяць it is about

- **WHEN** «Закрий 2026-08» is begun and «Транзакції» is opened for 2026-08
- **THEN** the list shows the транзакції of 2026-08, the місяць narrowing says 2026-08, and the
  owner can widen it back to every місяць

#### Scenario: Something that is not a місяць narrows nothing

- **WHEN** «Транзакції» is opened asking for «2026-13», for «серпень» or for nothing at all
- **THEN** the list shows the whole history and no narrowing is in force

### Requirement: The entry form can be opened on a type and a destination

The system SHALL be able to open «Нова транзакція» on a named transaction type and with a named
destination рахунок, so a виклик whose action is «recording a переказ onto a рахунок of вид
`savings`» opens that переказ rather than the form's own default. Both SHALL be **offers and not
locks**: every picker on the form changes them as it always did.

A type the form does not offer, an absent one, and a рахунок the device does not hold SHALL each
name nothing: the form opens on a витрата — «anything not explicitly typed otherwise is a витрата»
— with nothing pre-chosen.

#### Scenario: A виклик opens the переказ it names

- **WHEN** «Нова транзакція» is opened asking for a переказ onto the рахунок «Банка»
- **THEN** the form opens as a переказ with «Банка» as the destination, and the owner may change
  both

#### Scenario: Anything else opens a витрата

- **WHEN** «Нова транзакція» is opened asking for «коригування», for «переказ», or for nothing
- **THEN** the form opens as a витрата with nothing pre-chosen

### Requirement: The filters leave the list on the first screen

On «Транзакції», each existing narrowing — рахунок, the «Без категорії» narrowing, and місяць —
SHALL take one row that scrolls sideways, whatever the number of its choices, with the choice in
force visible in that row when the screen opens. The рахунок row SHALL lead with the рахунки the
latest транзакції touched, in the order of that use, followed by the rest in their usual order, so
the рахунки in daily use are reachable without scrolling the row. No new narrowing is added. With the search empty
and no narrowing, at least the first транзакція SHALL be visible without scrolling on a 360 × 640
dp Android viewport at the default font.

#### Scenario: Thirty рахунки and twenty-four months

- **WHEN** the owner holds 29 рахунки and 24 months of history and opens «Транзакції»
- **THEN** the search, one row of рахунки, one row holding «Всі» and «Без категорії», and one row
  of місяці are shown, followed by the newest транзакція, without scrolling

#### Scenario: A choice further along the row stays reachable

- **WHEN** the owner scrolls the рахунок row sideways and picks «гаманець»
- **THEN** only транзакції touching «гаманець» are shown and «гаманець» is visibly chosen

#### Scenario: The рахунки in use lead the row

- **WHEN** the latest транзакції were on «гаманець», then «РЕЗЕРВ», then «mono white», and the
  owner opens «Транзакції»
- **THEN** the рахунок row reads «Всі», «гаманець», «РЕЗЕРВ», «mono white» and then the other
  рахунки in their usual order
