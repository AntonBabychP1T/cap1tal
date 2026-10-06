## MODIFIED Requirements

### Requirement: Statement items map deterministically to транзакції

The system SHALL map each statement item of a linked рахунок to at most one транзакція on it,
dated the item's date, carrying the item's description as its опис:

- An item with a negative amount SHALL become a витрата of the absolute amount in the
  рахунок's currency; its category SHALL be the owner's правила applied to the item's
  description and MCC — and, when no правило eligible there matches, the шаблон категоризації
  applied the same way — and «Без категорії» when neither matches. When the best matching
  правило is a правило-переказ, the item SHALL instead become a переказ from this рахунок to the
  правило's destination, carrying the absolute amount on both legs.
- An item with a positive amount SHALL first be checked against the перекази that await a
  зустрічний дохід: when it is the зустрічний дохід of one, it SHALL become no транзакція and that
  переказ SHALL await nothing. Otherwise it SHALL become a дохід of that amount whose джерело is
  the one the best of the owner's правила-джерела gives the item's description and MCC, and the
  reserved джерело «Без джерела» when none matches; the шаблон категоризації gives no джерело. A
  дохід «Без джерела» is a starting state, never a verdict:
  an arriving повернення or cashback is retyped by the owner through витрата into повернення
  (the main-screen retype rules), because the glossary forbids a повернення to end up as
  income. A правило-джерело gives a джерело and nothing else: it never makes an arriving item a
  повернення, a переказ or a коригування.
- An item on hold SHALL map exactly as a settled one — a hold is just a transaction.
- An item with a zero amount SHALL map to no транзакція.

An item that became no транзакція SHALL still count as imported, so it never imports later.

#### Scenario: A recognised merchant lands in its category

- **WHEN** the правило "сільпо → Groceries" exists and an item of amount −12550 with
  description "СІЛЬПО Київ" is mapped
- **THEN** the result is a витрата of 12550 minor units in category Groceries with опис
  "СІЛЬПО Київ"

#### Scenario: An unrecognised merchant is «Без категорії»

- **WHEN** no правило and no базова категорія matches an item of amount −8000 with description
  "НОВИЙ ЗАКЛАД"
- **THEN** the result is a витрата of 8000 minor units in «Без категорії», carrying the
  description as its опис

#### Scenario: A правило-переказ makes the item a переказ

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists and an item of amount −479
  with description "Округлення балансу «Резерв»" is mapped on the UAH рахунок platinum
- **THEN** the result is a переказ of 479 minor units UAH from platinum to РЕЗЕРВ with that опис,
  and no витрата

#### Scenario: Arriving money is a дохід «Без джерела»

- **WHEN** no правило-джерело matches and an item of amount +5000000 with description
  "Зарахування зарплати" is mapped
- **THEN** the result is a дохід of 5000000 minor units with the reserved джерело
  «Без джерела» and that опис

#### Scenario: A правило-джерело gives arriving money its джерело

- **WHEN** the правило-джерело "зарахування зарплати → Зарплата" exists and an item of amount
  +5000000 with description "Зарахування зарплати" is mapped
- **THEN** the result is a дохід of 5000000 minor units with the джерело «Зарплата» and that опис

#### Scenario: A правило-джерело never matches money leaving

- **WHEN** only the правило-джерело "відсотки → Відсотки" exists and an item of amount −2000 with
  description "Відсотки сервіс" is mapped
- **THEN** the result is a витрата of 2000 minor units in «Без категорії» unless the шаблон gives
  it a категорія, and no джерело is involved

#### Scenario: A зустрічний дохід is absorbed before any правило-джерело is asked

- **WHEN** a переказ of 616 minor units UAH from platinum to РЕЗЕРВ dated 2026-09-12 awaits its
  зустрічний дохід, the правило-джерело "поповнення → Подарунки" exists, and an item of amount +616
  with description "Поповнення «Резерв»" dated 2026-09-12 is mapped on РЕЗЕРВ
- **THEN** no транзакція results, the переказ awaits nothing, and no дохід «Подарунки» exists

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
джерела», and sync SHALL NOT invent a переказ, інвестиція, повернення, коригування, комісія,
дохід «Відсотки» from a рахунок-борг or any джерело without the owner's explicit action defined by
those capabilities. A правило-переказ the owner stored, a правило-джерело the owner stored, and a
переказ the owner retyped, are such explicit action: the переказ they produce, the зустрічний дохід
it absorbs and the джерело a правило-джерело gives are the owner's decision applied, not an
inference of sync's own. A правило-джерело gives a джерело and nothing else: it never makes an
arriving item a повернення, and it never decides that one is not.

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

- **WHEN** a positive cashback item of +1250 with description "Кешбек за вересень" arrives and no
  правило-джерело matches it
- **THEN** it is imported as a дохід «Без джерела» that the owner can retype to a повернення, and
  sync does not choose a final джерело for it

#### Scenario: A правило-джерело never turns cashback into a повернення

- **WHEN** the правило-джерело "зарплата → Зарплата" exists and a positive cashback item of +1250
  with description "Кешбек за вересень" arrives
- **THEN** it is imported as a дохід «Без джерела», never as a повернення, and only the owner's
  retype makes it the повернення in the категорія of what was bought

#### Scenario: Lending and interest are not inferred

- **WHEN** incoming money could be repayment of a debt account with interest
- **THEN** sync imports the one item as a дохід «Без джерела» and does not invent a переказ of
  principal or a separate дохід «Відсотки»
