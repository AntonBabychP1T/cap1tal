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
feed does.

A line in «Без категорії» SHALL offer the same one-tap categorisation the latest-transactions feed
offers from its mark, under the same rules: an unarchived категорія picked from the same short
picker, «Без категорії» itself not among the choices, stored on that транзакція without opening
editing, the mark gone with the pick. WHILE the «Без категорії» narrowing is in force, the
categorised line SHALL leave the list at once, and the lines already shown SHALL keep their order.

Beyond that one categorisation, the screen SHALL create, change and delete nothing of its own; it
SHALL NOT, as part of this requirement, store or offer a правило.

#### Scenario: A found транзакція is edited

- **WHEN** the owner taps a транзакція in the results
- **THEN** it opens for editing exactly as it does from the latest-transactions feed

#### Scenario: The marks travel with the line

- **WHEN** the results hold a витрата in «Без категорії» and a витрата in a категорія over its
  ліміт for that витрата's month
- **THEN** the first is highlighted as uncategorised and the second shows its категорія over limit

#### Scenario: One tap categorises from «Транзакції»

- **WHEN** the owner uses the mark on a витрата in «Без категорії» on «Транзакції» and picks
  «Продукти»
- **THEN** the same витрата now carries «Продукти» without the editing screen having opened, and
  its mark is gone

#### Scenario: A categorised line leaves the uncategorised list

- **WHEN** the list is narrowed to «Без категорії» and shows «СІЛЬПО Київ», «Uklon» and «Rozetka»,
  and the owner picks «Транспорт» on «Uklon»
- **THEN** the list shows «СІЛЬПО Київ» and «Rozetka» in that order, and Головний's «Потребує
  уваги» names one fewer

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

### Requirement: Letter case is folded one way, whatever the phone's language

Wherever a search compares what the owner typed with an опис or a name without regard to letter
case, the case SHALL be folded by one mapping that depends on no language setting of the phone,
and that mapping SHALL agree with Ukrainian casing on every character, so that the same опис and
the same typed text are found alike on every phone and in the test suite.

#### Scenario: Ukrainian letters fold as before

- **WHEN** a витрата carries the опис «ҐАНОК ЇЖАК Єнот І» and the owner searches for «ґанок їжак єнот і»
- **THEN** that витрата is shown

#### Scenario: The fold agrees with Ukrainian casing on every character

- **GIVEN** any single character
- **WHEN** it is folded by the search's case mapping and by Ukrainian casing
- **THEN** both give the same text

#### Scenario: A phone set to Turkish still finds a Latin опис

- **GIVEN** the phone's language is Turkish, where a capital «I» lower-cases to a dotless «ı»
- **WHEN** a витрата carries the опис «BILLA» and the owner searches for «billa»
- **THEN** that витрата is shown

### Requirement: Typing a search is never held up by the search

What the owner types into the «Транзакції» search SHALL appear in the field at once, character by
character. The list SHALL be searched again only once typing has paused for 250 ms, and once per
pause, never once per character. Clearing the field SHALL show the unsearched list at once. The
result of a search SHALL be exactly what the same text would find if it were typed in one go.

#### Scenario: Fast typing searches once

- **WHEN** the owner types «сільпо» without pausing
- **THEN** every letter appears as it is typed and the list is searched once, for «сільпо», after
  the pause

#### Scenario: Clearing the field is immediate

- **WHEN** the owner clears a search
- **THEN** the unsearched list is shown without waiting for a pause

### Requirement: Showing more reads only what it adds

Asking for more транзакції SHALL read only the next page and add it after the rows already shown,
without reading the pages already shown again, as long as nothing was written since they were read.
WHEN something was written in between, the rows already shown and the next page SHALL be read
together in one read, so that no транзакція is shown twice and none is skipped. Coming back to
«Транзакції», or a write made from it, SHALL keep as many rows shown as before, read in one read,
and SHALL NOT fall back to the first page. WHEN nothing is searched, the listing SHALL be taken from
storage directly, in the newest-first order, without reading the rest of the history. Which
транзакції are shown, their order and the «nothing more» end SHALL be exactly as before.

#### Scenario: The third page reads one page

- **WHEN** two pages are shown, nothing is written, and the owner asks for more
- **THEN** only the third page is read, and it follows the first two in the same order they would
  have had if all three were read at once

#### Scenario: More of a search reads nothing already read

- **WHEN** a search for «сільпо» shows one page, nothing is written, and the owner asks for more
- **THEN** the next matches follow without the stored транзакції being read again

#### Scenario: A транзакція stored between pages is neither repeated nor lost

- **WHEN** two pages are shown, a прогін stores a new транзакція, and the owner asks for more
- **THEN** the list shows every транзакція once, the new one in its newest-first place, and none is
  skipped

#### Scenario: Coming back from a транзакція keeps the pages shown

- **WHEN** three pages are shown, the owner opens a транзакція from the third page and goes back
- **THEN** «Транзакції» still shows three pages' worth of транзакції, read in one read

#### Scenario: The unsearched listing reads one page from storage

- **WHEN** the owner opens «Транзакції» with 10 000 транзакції stored and nothing searched
- **THEN** the listing read takes only the first page's транзакції from storage

### Requirement: Limit marks on the list need no read per month

The over-ліміт marks on the shown rows SHALL be judged from the whole history already read between
writes. They SHALL NOT be judged from a separate storage read for each month the shown rows span.
Every mark SHALL be the same as the month-by-month reading would give, including a month left
unjudged because it holds a сума beyond the ceiling.

#### Scenario: Rows spanning two years are marked as the month-by-month reading marks them

- **WHEN** a search shows транзакції from 24 different months, some in an over-ліміт категорія and
  one month holding a сума beyond the ceiling
- **THEN** no month is read from storage on its own to mark them, each row is marked exactly as the
  month-by-month reading marks it, and the ceiling month stays unjudged

### Requirement: The list narrows to «Без категорії»

The «Транзакції» screen SHALL let the owner narrow the list to the транзакції without a категорія:
exactly the витрати and повернення carrying «Без категорії» — every line the list marks as
uncategorised, and the same set «Потребує уваги» on Головний counts, so the count there, the marks
and the list here SHALL name the same транзакції. A дохід carrying «Без джерела», a переказ, a
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
- **THEN** only the first is shown, marked as uncategorised, and «Потребує уваги» counts it

#### Scenario: The list and Головний's count agree

- **WHEN** six stored витрати and one повернення carry «Без категорії» and «Потребує уваги» names
  seven
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

### Requirement: «Транзакції» can be opened already narrowed to «Без категорії»

The system SHALL be able to open «Транзакції» with the «Без категорії» narrowing already in force.
The narrowing SHALL be an **initial value and not a lock**: it is shown like one the owner chose,
and the owner may take it off or add a search, a рахунок or a місяць to it. Opening «Транзакції»
without asking for it SHALL leave it off, and anything asked for that is not this narrowing SHALL
narrow nothing.

#### Scenario: Opened narrowed, and widened by hand

- **WHEN** «Транзакції» is opened asking for «Без категорії»
- **THEN** only the транзакції in «Без категорії» are shown, the narrowing reads as in force, and the
  owner can take it off to see the whole history

#### Scenario: Anything else asked for narrows nothing

- **WHEN** «Транзакції» is opened asking for «продукти», for an empty value or for nothing at all
- **THEN** the whole history is shown and no «Без категорії» narrowing is in force

### Requirement: Under «Без категорії» a line leads with its опис

WHILE the «Без категорії» narrowing is in force, each line that carries an опис SHALL lead with that
опис, as stored, in the place and weight the line
otherwise gives its категорія, since every line in that list carries the same категорія and only
the опис tells them apart. The line SHALL still carry the «Без категорії» mark, its сума with its
currency, its рахунок and its дата. A line without an опис SHALL read exactly as it does with the
narrowing off. With the narrowing off, every line SHALL read as the latest-transactions feed reads.

#### Scenario: The опис is what the owner reads first

- **WHEN** the list is narrowed to «Без категорії» and holds a витрата with the опис «Uklon»
- **THEN** its line leads with «Uklon», marked as uncategorised, with its сума, рахунок and дата

#### Scenario: A line without an опис keeps its usual title

- **WHEN** the list is narrowed to «Без категорії» and holds a витрата recorded by hand with no опис
- **THEN** its line reads as it does in the latest-transactions feed
