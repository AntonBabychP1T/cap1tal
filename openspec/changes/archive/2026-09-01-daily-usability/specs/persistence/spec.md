## ADDED Requirements

### Requirement: Stored transactions can be searched and narrowed

The system SHALL find stored транзакції by a **search** and by **filters**, returning a
транзакція only when it satisfies every filter given and, when a search is given, the search too.

A search SHALL be satisfied by any one of the things given with it: a text occurring in the опис,
matched without regard to letter case and at any position; a сума equal to a given amount on
either leg, whatever the currency; or the транзакція carrying one of the given категорії or
джерела. The filters SHALL be one рахунок — counting a переказ on either leg — and one calendar
month; each SHALL only ever remove транзакції from the result.

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

#### Scenario: Nothing matching returns nothing

- **WHEN** no stored транзакція satisfies the search and filters given
- **THEN** no транзакція is returned

### Requirement: The рахунок last recorded on by hand survives a restart

The system SHALL store the рахунок of the owner's most recent hand-recorded транзакція and load
it unchanged after a restart, so the entry form can open on it. Storing it SHALL be the caller's
explicit act: nothing SHALL set it as a side effect of storing a транзакція, so an import, a sync
or a confirmed чернетка leaves it as it was. At most one such рахунок SHALL be remembered, and
storing another SHALL replace it. A device that has never recorded by hand SHALL load none.

#### Scenario: The remembered рахунок comes back

- **WHEN** a рахунок is remembered as the last hand-recorded one and storage is reopened
- **THEN** exactly that рахунок is loaded

#### Scenario: Only the latest one is kept

- **WHEN** one рахунок is remembered and then another is
- **THEN** the second is loaded and the first is not

#### Scenario: Storing a транзакція remembers nothing by itself

- **WHEN** транзакції are stored without the рахунок being remembered explicitly
- **THEN** no remembered рахунок is loaded

#### Scenario: A fresh database remembers none

- **WHEN** all committed migrations are applied to an empty database
- **THEN** no remembered рахунок is loaded and nothing fails

### Requirement: The remembered рахунок arrives by a new migration that keeps stored rows

The storage for the remembered рахунок SHALL be introduced by a new migration; committed
migrations SHALL stay untouched. Every row stored under the previously committed migrations —
рахунки, транзакції, категорії, джерела, правила, ліміти, цілі, monobank state, чернетки and
their fingerprints — SHALL survive the new migration unchanged.

#### Scenario: Pre-migration rows survive unchanged

- **WHEN** a рахунок and one транзакція of each type are stored under the previously committed
  migrations alone, and the database is brought to the current shape
- **THEN** all of them load unchanged — types, amounts, currencies, dates, categories and
  descriptions intact — and no рахунок is remembered

#### Scenario: A fresh database from migrations alone remembers a рахунок

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a рахунок can be remembered as the last hand-recorded one and read back
