## ADDED Requirements

### Requirement: Головний opens with how much money there is

Above the entry form Головний SHALL show the money held the accounts capability defines — the
total of every unarchived рахунок, per currency — with the approximate UAH equivalent beside it,
visibly marked as approximate, only when a non-UAH currency participates and every participating
currency has a known monobank rate. The figure SHALL be named so it cannot be read as a monthly
number: it is what the рахунки hold, not the month's залишилось, and the two SHALL NOT share a
name. WHEN no unarchived рахунок exists, no total SHALL be shown and the screen SHALL keep
inviting the owner to create the first рахунок.

#### Scenario: Money is the first thing on the screen

- **WHEN** the owner opens the app with unarchived рахунки holding 705000 minor units UAH and
  600000 minor units UAH
- **THEN** Головний shows 1305000 minor units UAH as the money held, above the entry form

#### Scenario: The month's number is not this number

- **WHEN** the month's залишилось is −265000 minor units UAH while the рахунки hold 1305000 minor
  units UAH
- **THEN** Головний shows the 1305000 minor units UAH under its own name, and shows no monthly
  залишилось under that name

#### Scenario: An empty device shows no total

- **WHEN** the app is opened while no рахунок exists
- **THEN** no total is shown and the screen states that a рахунок must be created first

### Requirement: A транзакція recorded by hand can carry an опис

The entry form SHALL offer an optional опис for every type it records — витрата, переказ, дохід
and повернення. What the owner types SHALL be stored as the транзакція's опис, with the meaning
the transactions capability gives it: information only, changing no total, balance or
classification. Leaving it empty SHALL store no опис, and SHALL be the normal case — the опис
SHALL never be required and its absence SHALL never block recording.

#### Scenario: A typed опис is stored

- **WHEN** the owner records a витрата of "1200" from a UAH рахунок with the опис "шини на зиму"
- **THEN** a витрата of 120000 minor units UAH carrying the опис "шини на зиму" is stored, and
  the month's spent counts exactly 120000 minor units UAH

#### Scenario: An empty опис stores none

- **WHEN** the owner records a витрата without typing an опис
- **THEN** the витрата is stored with no опис and behaves exactly as before

#### Scenario: A переказ can be explained too

- **WHEN** the owner records a переказ between two of their own рахунки with the опис "на ремонт"
- **THEN** the переказ carries that опис, both legs are unchanged, and the month's витрачено is
  unaffected

### Requirement: The entry form opens on the рахунок last recorded on by hand

The entry form SHALL open with the рахунок of the owner's most recent hand-recorded транзакція
already chosen, and that memory SHALL survive closing and reopening the app. For a переказ it is
the рахунок the money left. Only recording by hand SHALL set it: importing, syncing and
confirming a чернетка SHALL leave it untouched. WHEN the remembered рахунок no longer exists or
has been archived, no рахунок SHALL be pre-chosen and recording SHALL still refuse until one is
picked. The pre-chosen рахунок SHALL be an offer, freely changeable before recording.

#### Scenario: The next витрата opens on the same рахунок

- **WHEN** the owner records a витрата from «гаманець» and later reopens the app
- **THEN** the entry form opens with «гаманець» chosen

#### Scenario: An import does not move the memory

- **WHEN** the owner last recorded by hand from «гаманець» and a monobank sync then stores
  транзакції on a linked рахунок
- **THEN** the entry form still opens with «гаманець» chosen

#### Scenario: An archived рахунок is not offered as the default

- **WHEN** the remembered рахунок is archived
- **THEN** no рахунок is pre-chosen, and recording without picking one is refused as before

### Requirement: Recently used категорії and джерела are offered ahead of the full list

The категорія picker SHALL offer, ahead of the full list, the категорії of the owner's most
recently stored транзакції carrying one — most recently used first, each at most once — and the
джерело picker SHALL do the same for джерела. The full list SHALL remain available, in the order
it already has. Archived категорії and джерела SHALL appear in neither, and «Коригування» SHALL
appear in neither, exactly as today. WHEN nothing has been recorded yet, only the full list SHALL
be shown.

#### Scenario: The last used категорія is one tap away

- **WHEN** the owner's latest витрати carry Groceries, then Eating out, then Groceries again, and
  the owner opens the категорія picker
- **THEN** Groceries and Eating out are offered ahead of the full list, Groceries first and each
  named once, and the full list is still reachable

#### Scenario: An archived категорія is not resurrected by having been used

- **WHEN** a recently used категорія is archived
- **THEN** it is offered neither among the recent ones nor in the full list

#### Scenario: A fresh device offers only the full list

- **WHEN** no транзакція has been recorded yet
- **THEN** the picker shows the full list and no recent row

### Requirement: Recording is visibly confirmed

WHEN a транзакція is stored from the entry form, Головний SHALL confirm it where the owner is
already looking, without scrolling, naming the сума with its currency and what it was recorded as
— the категорія of a витрата or повернення, the джерело of a дохід, both рахунки of a переказ.
WHEN a комісія or a дохід «Відсотки» was stored alongside a переказ, the confirmation SHALL say
so. A refused recording SHALL show its own refusal and no confirmation.

#### Scenario: The owner sees what was recorded

- **WHEN** the owner records a витрата of "1200" in Groceries from a UAH рахунок
- **THEN** the screen confirms that 120000 minor units UAH in Groceries was recorded, without the
  owner scrolling anywhere

#### Scenario: An accepted комісія is part of the confirmation

- **WHEN** the owner records a same-currency переказ that arrives short and accepts the proposed
  комісія
- **THEN** the confirmation names the переказ and the комісія that was stored with it

#### Scenario: A refusal is not a confirmation

- **WHEN** the owner taps «Записати» with no сума entered
- **THEN** the refusal is shown, nothing is stored, and no confirmation appears

### Requirement: Everything stored is reachable from Головний

The latest-transactions section SHALL make it plain that it shows only the latest транзакції and
SHALL offer a way to all of them, where they can be searched and narrowed as the
transaction-search capability defines. The offer SHALL be present whether or not more транзакції
are stored than the section shows.

#### Scenario: The whole history is one tap from the feed

- **WHEN** more транзакції are stored than the latest-transactions section shows
- **THEN** the section says it shows the latest only and offers going to all транзакції

#### Scenario: The way there does not depend on having a long history

- **WHEN** three транзакції are stored
- **THEN** the offer to go to all транзакції is still shown

### Requirement: The опис is visible everywhere and correctable

The latest-transactions feed and transaction editing SHALL show a stored опис when one exists and
SHALL omit it when none exists. From editing, the owner SHALL be able to write, change or clear
the опис of any транзакція, whatever put it there — an import, a чернетка or the owner's own hand
— and the опис SHALL be named neutrally rather than as the bank's alone. Changing any other field
SHALL preserve the опис, and the опис SHALL NOT replace or be treated as the категорія, джерело,
account name, amount, currency, date or type.

#### Scenario: An uncategorised merchant can be identified in the feed

- **WHEN** monobank imports a витрата in «Без категорії» with опис "СІЛЬПО Київ"
- **THEN** the latest feed shows "СІЛЬПО Київ" with that витрата while its category remains «Без
  категорії»

#### Scenario: An arriving item keeps its source distinct from its description

- **WHEN** monobank imports a дохід «Без джерела» with опис "Повернення за замовлення"
- **THEN** the feed shows both «Без джерела» and "Повернення за замовлення", without treating the
  description as a джерело

#### Scenario: A manual transaction stays compact

- **WHEN** a manually recorded транзакція has no опис
- **THEN** the feed and editor show no empty description row or placeholder for it

#### Scenario: A wrong опис is corrected from editing

- **WHEN** the owner opens a stored витрата carrying the опис "шини на зиму" and changes it to
  "шини на літо"
- **THEN** the same транзакція now carries "шини на літо" and its сума, категорія, рахунок, дата
  and type are unchanged

#### Scenario: An опис can be cleared

- **WHEN** the owner clears the опис of a stored транзакція
- **THEN** the same транзакція is stored with no опис and the feed shows no description row for it

#### Scenario: Editing another field leaves the опис alone

- **WHEN** the owner changes only the сума of a витрата carrying an imported опис
- **THEN** the опис is still exactly what the import stored

## REMOVED Requirements

### Requirement: An imported description is visible without changing the transaction

**Reason**: The опис is no longer the bank's alone — the owner writes one when recording by hand
and corrects one from editing, so a requirement whose name promises that nothing changes it is no
longer true. Everything it guaranteed about visibility and about the опис never standing in for
another field is carried into «The опис is visible everywhere and correctable», scenario for
scenario.

**Migration**: None. No stored транзакція changes; the опис keeps its meaning from the
transactions capability, and a транзакція with no опис still shows nothing.
