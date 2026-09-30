## ADDED Requirements

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
