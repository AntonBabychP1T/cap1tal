## ADDED Requirements

### Requirement: «Транзакції» can be opened narrowed to one продавець

The system SHALL be able to open «Транзакції» narrowed to one продавець. The list then shows exactly
the stored транзакції whose опис is recognised as that продавець, of every type, in the same order
as with no narrowing. The narrowing SHALL be visible while in force, naming the продавець. It SHALL
be an **initial value and not a lock**: the owner may take it off, and may add a search, a рахунок,
a місяць or «Без категорії» to it, each of which only ever removes транзакції from the result.
Clearing the narrowings SHALL clear it with the rest.

Opening «Транзакції» asking for a продавець that does not exist SHALL narrow nothing. A продавець's
narrowing SHALL follow recognition: a транзакція whose опис holds one of its написання but is
recognised as another продавець SHALL NOT be shown.

#### Scenario: Every spelling of one продавець, and nothing else

- **WHEN** «АТБ» holds "атб" and "atb", and витрати carrying "АТБ 12", "ATB MARKET" and "Сільпо"
  are stored, and «Транзакції» is opened narrowed to «АТБ»
- **THEN** the first two are shown, the narrowing names «АТБ», and "Сільпо" is not shown

#### Scenario: The narrowing follows recognition

- **WHEN** «Bolt» holds "bolt", «Bolt Food» holds "bolt food", a витрата carries "BOLT FOOD 3411",
  and «Транзакції» is opened narrowed to «Bolt»
- **THEN** that витрата is not shown

#### Scenario: It combines with a місяць and comes off by hand

- **WHEN** the list opened narrowed to «АТБ» is narrowed to March 2026 too, and the owner then
  clears the narrowing
- **THEN** first only «АТБ»'s транзакції dated in March 2026 are shown, and then the full history is
  shown without leaving the screen

#### Scenario: An unknown продавець narrows nothing

- **WHEN** «Транзакції» is opened asking for a продавець id no продавець carries
- **THEN** the whole history is shown and no продавець narrowing is in force

## MODIFIED Requirements

### Requirement: Транзакції are found by what they say

A search SHALL match a транзакція when the typed text occurs — without regard to letter case, at
any position — in its опис, in the назва of the продавець its опис is recognised as, in the name of
its категорія, or in the name of its джерело; and,
WHEN the typed text reads as a сума, a транзакція whose amount equals that сума on either leg
SHALL match too, whatever its currency, since the typed сума names no currency. A транзакція
SHALL be shown at most once however many of those it matches. An empty search SHALL narrow
nothing.

#### Scenario: The bank's text finds the транзакція

- **WHEN** the owner searches for "сільпо" and a витрата carries the опис "СІЛЬПО Київ"
- **THEN** that витрата is shown

#### Scenario: A продавець's назва finds every spelling

- **WHEN** «АТБ» holds "атб" and "atb market", витрати carry the описи "АТБ 12" and "ATB MARKET
  23", and the owner searches for "атб"
- **THEN** both витрати are shown

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

### Requirement: Under «Без категорії» a line leads with its опис

WHILE the «Без категорії» narrowing is in force, each line that carries an опис SHALL lead with the
назва of the продавець that опис is recognised as, or with the опис as stored when it is recognised
as none, in the place and weight the line
otherwise gives its категорія, since every line in that list carries the same категорія and only
who was paid tells them apart. The line SHALL still carry the «Без категорії» mark, its сума with
its currency, its рахунок and its дата. A line without an опис SHALL read exactly as it does with
the narrowing off. With the narrowing off, every line SHALL read as the latest-transactions feed
reads.

#### Scenario: The опис is what the owner reads first

- **WHEN** the list is narrowed to «Без категорії» and holds a витрата with the опис «Uklon» that no
  написання recognises
- **THEN** its line leads with «Uklon», marked as uncategorised, with its сума, рахунок and дата

#### Scenario: A recognised опис leads with its продавець

- **WHEN** «Зерно» holds "зерно" and the list is narrowed to «Без категорії» and holds a витрата
  with the опис «ЗЕРНО 12»
- **THEN** its line leads with «Зерно», marked as uncategorised

#### Scenario: A line without an опис keeps its usual title

- **WHEN** the list is narrowed to «Без категорії» and holds a витрата recorded by hand with no опис
- **THEN** its line reads as it does in the latest-transactions feed

### Requirement: Showing more reads only what it adds

Asking for more транзакції SHALL read only the next page and add it after the rows already shown,
without reading the pages already shown again, as long as nothing was written since they were read.
WHEN something was written in between, the rows already shown and the next page SHALL be read
together in one read, so that no транзакція is shown twice and none is skipped. Coming back to
«Транзакції», or a write made from it, SHALL keep as many rows shown as before, read in one read,
and SHALL NOT fall back to the first page. WHEN nothing is searched and no продавець narrows the list, the listing SHALL be taken from
storage directly, in the newest-first order, without reading the rest of the history. A продавець's
narrowing is a match judged on the опис, as a search is, so its matches SHALL be read and kept like
a search's, and its next page SHALL follow without the stored транзакції being read again. Which
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

#### Scenario: More of a продавець reads nothing already read

- **WHEN** «Транзакції» opened narrowed to «АТБ» shows one page, nothing is written, and the owner
  asks for more
- **THEN** the next of «АТБ»'s транзакції follow without the stored транзакції being read again

#### Scenario: The unsearched listing reads one page from storage

- **WHEN** the owner opens «Транзакції» with 10 000 транзакції stored and nothing searched
- **THEN** the listing read takes only the first page's транзакції from storage
