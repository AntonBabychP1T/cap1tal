## ADDED Requirements

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

## MODIFIED Requirements

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
