## ADDED Requirements

### Requirement: Продавці, their написання and a транзакція's MCC survive a restart

Stored продавці SHALL remain readable after storage is closed and reopened, each with its назва,
every написання it holds, the moment each написання was added and the moment the продавець was
named. A правило's продавець, where it names one, and a транзакція's MCC, where it carries one,
SHALL survive likewise. A транзакція's продавець SHALL NOT be stored: it is read from the опис.
The data SHALL live only on the device and in the owner's бекап.

#### Scenario: A продавець comes back whole

- **WHEN** «АТБ» holding "атб" and "atb", the правило "АТБ → Groceries" naming it, and a витрата
  carrying MCC 5411 are stored, and storage is closed and reopened
- **THEN** all of it is read back exactly so, with the moments the написання were added

### Requirement: Stored продавці refer only to what storage holds

Storage SHALL reject a написання that is blank, a написання another продавець already holds, a
second продавець whose назва differs from a stored one only in letter case or surrounding
whitespace, and a правило naming a продавець that is not stored. A правило SHALL name at most one
of a merchant pattern and a продавець. Storage SHALL refuse to remove a продавець while a правило
names it, and SHALL remove a продавець's написання together with it. A rejected write SHALL leave
storage as it was.

#### Scenario: One написання, one продавець

- **WHEN** «АТБ» holds "атб" and a second продавець holding "атб" is stored
- **THEN** storage rejects it and holds only «АТБ»

#### Scenario: A продавець a правило names stays

- **WHEN** removing «АТБ» is attempted while the правило "АТБ → Groceries" names it
- **THEN** storage rejects it and «АТБ», its написання and the правило are unchanged

#### Scenario: A removed продавець takes its написання

- **WHEN** «Зерно», holding "зерно" and named by no правило, is removed
- **THEN** storage holds neither «Зерно» nor "зерно"

### Requirement: Продавці and the MCC arrive by a new append-only migration

Applying every committed migration in order to an empty database SHALL produce storage that holds
продавці, their написання, a правило's продавець and a транзакція's MCC alongside everything the
earlier migrations already hold. Rows stored under the earlier migrations SHALL survive the new one
unchanged: every правило keeps its pattern, MCC, target and the moment it was created, and every
транзакція carries no MCC. No продавець SHALL exist that the owner never named. Committed
migrations SHALL NOT be edited.

#### Scenario: Existing data survives the migration

- **WHEN** рахунки, транзакції, категорії, правила, правила-перекази and фіскальні чеки stored
  under the earlier migrations are read after the new migration is applied
- **THEN** every row is exactly what it was, no транзакція carries an MCC, every чек still belongs
  to its транзакція, and there is no продавець

### Requirement: The snapshot carries the продавці and the MCC

The whole stored state read as one snapshot SHALL include every продавець with its написання, every
правило's продавець and every транзакція's MCC. Replacing the stored state by a snapshot SHALL
replace them with the snapshot's, as one unit with everything else.

#### Scenario: Replacing the state replaces the продавці

- **WHEN** storage holding «АТБ» is replaced by a snapshot holding only «Сільпо»
- **THEN** storage holds «Сільпо» with its написання and no «АТБ»

## MODIFIED Requirements

### Requirement: Stored transactions can be searched and narrowed

The system SHALL find stored транзакції by a **search** and by **filters**, returning a
транзакція only when it satisfies every filter given and, when a search is given, the search too.

A search SHALL be satisfied by any one of the things given with it: a text occurring in the опис,
matched without regard to letter case and at any position; the транзакція's опис being recognised
as one of the given продавці; a сума equal to a given amount on
either leg, whatever the currency; or the транзакція carrying one of the given категорії or
джерела. The filters SHALL be one рахунок — counting a переказ on either leg — one calendar
month, and one продавець, which keeps only the транзакції whose опис is recognised as it; each
SHALL only ever remove транзакції from the result.

Results SHALL come in the latest listing's order — newest date first, then most recently stored,
then by id — and SHALL be returned up to a requested count from a requested starting position, so
the whole history can be read on in pages without re-reading what came before. A search matching
nothing SHALL return nothing rather than everything.

#### Scenario: An опис is found by part of it, in any case

- **WHEN** транзакції with описи "СІЛЬПО Київ" and "Нова пошта" are stored and the search text is
  "сільпо"
- **THEN** only the first is returned

#### Scenario: A сума finds both legs of a переказ

- **WHEN** a переказ of 120000 minor units UAH on both legs and a витрата of 1200 minor units UAH
  are stored, and the search сума is 120000 minor units
- **THEN** the переказ is returned and the витрата is not

#### Scenario: A категорія given with the search matches its транзакції

- **WHEN** a витрата in Groceries carries no опис at all and the search gives the text "прод"
  together with Groceries among its категорії
- **THEN** that витрата is returned

#### Scenario: Filters narrow the search

- **WHEN** a витрата in Groceries on рахунок A and a витрата in Groceries on рахунок B are
  stored, and the search gives Groceries while the рахунок filter is A
- **THEN** only the витрата on рахунок A is returned

#### Scenario: A month bounds the result

- **WHEN** matching транзакції are stored dated the last day of March and the first day of April,
  and the month filter is March
- **THEN** only the one dated in March is returned

#### Scenario: Pages continue where the previous one ended

- **WHEN** five matching транзакції are stored and two are requested from the position after the
  first two
- **THEN** the third and fourth in the latest listing's order are returned, in that order

#### Scenario: A продавець given with the search matches every spelling

- **WHEN** «АТБ» holds "атб" and "atb", витрати with описи "АТБ 12" and "ATB MARKET" are stored, and
  the search gives the text "атб" together with «АТБ» among its продавці
- **THEN** both витрати are returned

#### Scenario: The продавець filter keeps only what it recognises

- **WHEN** «АТБ» holds "атб", витрати with описи "АТБ 12" and "Сільпо" are stored, and the
  продавець filter is «АТБ»
- **THEN** only the first is returned

#### Scenario: Nothing matching returns nothing

- **WHEN** no stored транзакція satisfies the search and filters given
- **THEN** no транзакція is returned
