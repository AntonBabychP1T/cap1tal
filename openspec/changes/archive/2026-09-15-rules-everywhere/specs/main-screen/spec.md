## ADDED Requirements

### Requirement: The entry form shows the категорія a правило gives the typed опис

While a витрата is being recorded, the entry form SHALL show as chosen the категорія the owner's
правила give the опис currently typed, for as long as the owner has picked no категорія
themselves. The chosen категорія SHALL follow the опис as it is typed and cleared: clearing the
опис, or changing it to text no правило matches, SHALL return the form to «Без категорії». The
moment the owner picks a категорія, the form SHALL keep that pick and SHALL stop following the
опис for the rest of that recording.

The категорія a правило gives SHALL be shown in the short list like any other, so it is visible
before «Записати» is pressed and can be changed with one tap. Recording SHALL store exactly the
категорія shown.

#### Scenario: Typing a known merchant chooses its категорія

- **WHEN** the правило "атб → Groceries" exists and the owner types "АТБ 421" as the опис of a
  витрата without having picked a категорія
- **THEN** the form shows Groceries as the chosen категорія, and «Записати» stores the витрата in
  Groceries

#### Scenario: Clearing the опис gives the категорія back

- **WHEN** the правило "атб → Groceries" exists, the owner types "АТБ 421" and then clears the
  опис, having picked no категорія
- **THEN** the form shows «Без категорії»

#### Scenario: A picked категорія stops following the опис

- **WHEN** the owner picks Eating out and then types "АТБ 421" while the правило "атб →
  Groceries" exists
- **THEN** the form still shows Eating out, and «Записати» stores the витрата in Eating out

#### Scenario: The proposed категорія is one tap from being changed

- **WHEN** the form shows Groceries because a правило matched the typed опис
- **THEN** Groceries is shown among the short list of категорії and picking another one replaces it

### Requirement: Categorising a транзакція offers to remember it as a правило

After a категорія is set on a stored витрата or повернення that carries an опис — through the
«Без категорії» mark in the feed or through the editing screen alike — the owner SHALL be offered
a правило that would make the same decision next time, with the merchant pattern already proposed
from that опис and editable before it is stored. Accepting SHALL store the правило; declining
SHALL store none and SHALL leave the категорія just set exactly as it is. Whether the правило is
stored or not, the категорія SHALL already be stored on the транзакція before the offer is made,
so dismissing the offer — or leaving the screen — can never lose the owner's categorisation.

The offer SHALL name what it would remember in words the owner can check before accepting: the
pattern and the категорія it would target. The cases in which no offer is made at all belong to
the categorisation-rules capability.

#### Scenario: One tap in the feed, then the offer

- **WHEN** the owner uses the «Без категорії» mark on a витрата carrying the опис "СІЛЬПО 123
  Київ" and picks Groceries
- **THEN** the витрата carries Groceries and an offer appears naming the pattern "сільпо" and
  Groceries

#### Scenario: Accepting the offer stores the правило

- **WHEN** that offer is accepted unchanged
- **THEN** the правило "сільпо → Groceries" exists

#### Scenario: Declining keeps the категорія

- **WHEN** that offer is declined
- **THEN** the витрата still carries Groceries and no правило was stored

#### Scenario: The editing screen offers it too

- **WHEN** the owner opens a витрата carrying the опис "УКЛОН" in editing, changes its категорія
  to Transport and saves
- **THEN** the витрата carries Transport and an offer appears naming the pattern "уклон" and
  Transport

## MODIFIED Requirements

### Requirement: A транзакція recorded by hand can carry an опис

The entry form SHALL offer an optional опис for every type it records — витрата, переказ, дохід
and повернення. What the owner types SHALL be stored as the транзакція's опис, with the meaning
the transactions capability gives it: it changes no total and no balance, and it decides no
транзакція's type. For a витрата it is also what the owner's правила read to propose a категорія,
as "The entry form shows the категорія a правило gives the typed опис" requires — a proposal the
owner sees and can change, never a classification made behind them. Leaving it empty SHALL store no
опис, and SHALL be the normal case — the опис SHALL never be required, its absence SHALL never
block recording, and a витрата recorded without one SHALL be categorised exactly as it is today.

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
