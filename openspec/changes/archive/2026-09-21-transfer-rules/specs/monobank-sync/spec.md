## MODIFIED Requirements

### Requirement: Statement items map deterministically to транзакції

The system SHALL map each statement item of a linked рахунок to at most one транзакція on it,
dated the item's date, carrying the item's description as its опис:

- An item with a negative amount SHALL become a витрата of the absolute amount in the
  рахунок's currency; its category SHALL be the owner's правила applied to the item's
  description and MCC, and «Без категорії» when no правило matches. When the best matching
  правило is a правило-переказ, the item SHALL instead become a переказ from this рахунок to the
  правило's destination, carrying the absolute amount on both legs.
- An item with a positive amount SHALL become a дохід of that amount with the reserved джерело
  «Без джерела» — unless it is the зустрічний дохід of a переказ that awaits one, in which case it
  SHALL become no транзакція and that переказ SHALL await nothing. A дохід «Без джерела» is a
  starting state, never a verdict:
  an arriving повернення or cashback is retyped by the owner through витрата into повернення
  (the main-screen retype rules), because the glossary forbids a повернення to end up as
  income.
- An item on hold SHALL map exactly as a settled one — a hold is just a transaction.
- An item with a zero amount SHALL map to no транзакція.

An item that became no транзакція SHALL still count as imported, so it never imports later.

#### Scenario: A recognised merchant lands in its category

- **WHEN** the правило "сільпо → Groceries" exists and an item of amount −12550 with
  description "СІЛЬПО Київ" is mapped
- **THEN** the result is a витрата of 12550 minor units in category Groceries with опис
  "СІЛЬПО Київ"

#### Scenario: An unrecognised merchant is «Без категорії»

- **WHEN** no правило matches an item of amount −8000 with description "НОВИЙ ЗАКЛАД"
- **THEN** the result is a витрата of 8000 minor units in «Без категорії», carrying the
  description as its опис

#### Scenario: A правило-переказ makes the item a переказ

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists and an item of amount −479
  with description "Округлення балансу «Резерв»" is mapped on the UAH рахунок platinum
- **THEN** the result is a переказ of 479 minor units UAH from platinum to РЕЗЕРВ with that опис,
  and no витрата

#### Scenario: Arriving money is a дохід «Без джерела»

- **WHEN** an item of amount +5000000 with description "Зарахування зарплати" is mapped
- **THEN** the result is a дохід of 5000000 minor units with the reserved джерело
  «Без джерела» and that опис

#### Scenario: A foreign purchase is a витрата of what the bank charged

- **WHEN** a UAH card's item of amount −420000 for a purchase made abroad is mapped
- **THEN** the result is a витрата of 420000 minor units UAH, carrying no original-currency
  amount — the sync does not read the one the statement names

#### Scenario: A hold maps like anything else

- **WHEN** an item of amount −30000 marked hold is mapped
- **THEN** the result is a витрата of 30000 minor units — nothing about it says hold

#### Scenario: A zero amount maps to nothing

- **WHEN** an item of amount 0 is mapped
- **THEN** no транзакція results

### Requirement: Sync preserves the transaction distinctions until the owner retypes them

Sync SHALL apply the existing item mapping without inferring relationships between separate
statement rows on its own: money leaving starts as a витрата, money arriving starts as a дохід «Без
джерела», and sync SHALL NOT invent a переказ, інвестиція, повернення, коригування, комісія or дохід
«Відсотки» from a рахунок-борг without the owner's explicit action defined by those capabilities. A
правило-переказ the owner stored, and a переказ the owner retyped, are such explicit action: the
переказ they produce, and the зустрічний дохід it absorbs, are the owner's decision applied, not an
inference of sync's own.

#### Scenario: Two own-account legs are not paired automatically

- **WHEN** no правило-переказ matches, and a card-to-банка movement arrives as a negative card item
  and a positive банка item
- **THEN** sync stores a витрата and a дохід «Без джерела», and neither is called a переказ or
  інвестиція until the owner retypes it

#### Scenario: A правило-переказ pairs the two legs

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists, and a rounding arrives as an
  item of −20 on platinum and an item of +20 on РЕЗЕРВ of the same date
- **THEN** exactly one транзакція is stored for it — a переказ of 20 minor units UAH from platinum to
  РЕЗЕРВ — whichever of the two рахунки is synced first

#### Scenario: Cashback is not silently finalised as income

- **WHEN** a positive cashback item arrives
- **THEN** it is imported as a дохід «Без джерела» that the owner can retype to a повернення, and
  sync does not choose a final джерело for it

#### Scenario: Lending and interest are not inferred

- **WHEN** incoming money could be repayment of a debt account with interest
- **THEN** sync imports the one item as a дохід «Без джерела» and does not invent a переказ of
  principal or a separate дохід «Відсотки»

## ADDED Requirements

### Requirement: A statement answer pairs a переказ with its зустрічний дохід in one commit

Pairing SHALL be part of committing one statement answer, whole or not at all, together with that
answer's транзакції, imported item ids, баланс банку and cursor:

- a переказ a правило-переказ made from an outgoing item SHALL absorb its зустрічний дохід if one is
  already stored, and SHALL await one otherwise;
- an incoming item that is the зустрічний дохід of a stored переказ awaiting one SHALL store no
  дохід and SHALL make that переказ await nothing.

An answer that fails to commit SHALL leave every переказ awaiting exactly what it awaited before and
every дохід exactly where it was.

#### Scenario: The card is synced before рахунок РЕЗЕРВ

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists, platinum's answer holding an
  item of −978 dated 2026-09-14 commits while nothing is stored on РЕЗЕРВ, and later РЕЗЕРВ's answer
  holding an item of +978 dated 2026-09-14 commits
- **THEN** after the first commit a переказ of 978 minor units UAH awaits its зустрічний дохід, and
  after the second no дохід of 978 is stored on РЕЗЕРВ and the переказ awaits nothing

#### Scenario: Рахунок РЕЗЕРВ is synced before the card

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists, РЕЗЕРВ's answer holding an
  item of +978 dated 2026-09-14 commits first, and platinum's answer holding an item of −978 dated
  2026-09-14 commits later
- **THEN** after the first commit a дохід «Без джерела» of 978 is stored on РЕЗЕРВ, and after the
  second that дохід is gone and one переказ of 978 minor units UAH awaits nothing

#### Scenario: An incoming item with no awaiting переказ stays a дохід

- **WHEN** an item of +978 dated 2026-09-14 on РЕЗЕРВ is committed and no переказ onto РЕЗЕРВ awaits a
  зустрічний дохід of that сума within one day
- **THEN** a дохід «Без джерела» of 978 minor units UAH is stored

#### Scenario: A failed commit pairs nothing

- **WHEN** committing РЕЗЕРВ's answer holding the зустрічний дохід of an awaiting переказ fails
- **THEN** the переказ still awaits, no дохід from that answer is stored, and the item is not
  remembered as imported
