## MODIFIED Requirements

### Requirement: «Без категорії» is highlighted and categorised in one tap

The feed SHALL visibly mark every transaction carrying "Без категорії". From that mark the owner
SHALL be able to pick an unarchived category and have it stored on that transaction without
opening editing; the mark SHALL disappear with the pick. The categories offered there SHALL follow
the same rule as the recording form's: at most five shown, the rest behind one offer naming how
many категорії it offers in all, the five being those the owner reached for most recently and topped up from the
head of the full list. "Без категорії" itself SHALL NOT be among them — it is what the transaction
is being moved away from.

Beside the категорії, the mark on a витрата SHALL offer «Це переказ»: a переказ is a type, not a категорія, and
the owner looking at a «Без категорії» витрата that is really money moved between their own рахунки
reaches for this mark first. Choosing it SHALL open editing of that витрата with the type already
set to переказ and the destination рахунок still to be chosen; nothing SHALL be stored until the
owner saves there, and leaving editing without saving SHALL leave the витрата exactly as it was.

#### Scenario: An uncategorised expense is marked in the feed

- **WHEN** the feed holds a витрата in "Без категорії" and a витрата in Groceries
- **THEN** the "Без категорії" one is visibly marked and the Groceries one is not

#### Scenario: One tap categorises from the feed

- **WHEN** the owner uses the mark on a "Без категорії" витрата and picks Groceries
- **THEN** the same transaction now carries Groceries, without the editing screen having opened,
  and the mark is gone

#### Scenario: The feed's picker is short too

- **WHEN** the owner uses the mark on a "Без категорії" витрата while twenty-six категорії are
  offered
- **THEN** at most five категорії are shown, "Без категорії" is not one of them, and one offer
  names all twenty-six

#### Scenario: A категорія behind the offer still categorises in the feed

- **WHEN** the owner uses the mark on a "Без категорії" витрата and picks Pets through the offer
  to see all категорії
- **THEN** the same transaction now carries Pets, the editing screen never opened, and the mark is
  gone

#### Scenario: «Це переказ» opens editing as a переказ

- **WHEN** the owner uses the mark on a "Без категорії" витрата carrying the опис "Округлення
  балансу «Резерв»" and chooses «Це переказ»
- **THEN** editing of that same витрата opens with the type переказ selected, the рахунок the money
  left already filled, and no destination chosen

#### Scenario: A повернення's mark offers no «Це переказ»

- **WHEN** the owner uses the mark on a повернення carrying "Без категорії"
- **THEN** категорії are offered and «Це переказ» is not

#### Scenario: Leaving without saving changes nothing

- **WHEN** the owner chooses «Це переказ» from the mark and leaves editing without saving
- **THEN** the витрата is still a витрата in "Без категорії" and still marked

### Requirement: Categorising a транзакція offers to remember it as a правило

After a категорія is set on a stored витрата or повернення that carries an опис — through the
«Без категорії» mark in the feed or through the editing screen alike — the owner SHALL be offered
a правило that would make the same decision next time, with the merchant pattern already proposed
from that опис and editable before it is stored. After a stored витрата that carries an опис is
retyped into a переказ from editing, the owner SHALL likewise be offered a правило-переказ onto the
destination рахунок just chosen. Accepting SHALL store the правило; declining
SHALL store none and SHALL leave the категорія just set — or the переказ just stored — exactly as it
is. Whether the правило is stored or not, the категорія or переказ SHALL already be stored before
the offer is made, so dismissing the offer — or leaving the screen — can never lose the owner's
decision.

The offer SHALL name what it would remember in words the owner can check before accepting: the
pattern and the категорія it would target, or the pattern and «переказ на» the destination
рахунок's назва. The cases in which no offer is made at all belong to the categorisation-rules
capability.

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

#### Scenario: Retyping into a переказ offers the правило-переказ

- **WHEN** the owner retypes a витрата on platinum carrying the опис "Округлення балансу «Резерв»"
  into a переказ onto РЕЗЕРВ and saves
- **THEN** the переказ is stored and an offer appears naming the pattern "округлення балансу" and
  «переказ на РЕЗЕРВ»

#### Scenario: Accepting the правило-переказ pairs the history too

- **WHEN** that offer is accepted while two more «Без категорії» витрати carrying "Округлення
  балансу «Резерв»" are stored on platinum
- **THEN** the правило-переказ exists, both витрати are перекази onto РЕЗЕРВ, and the owner is told
  two витрати became перекази
