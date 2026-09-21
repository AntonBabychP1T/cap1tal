## ADDED Requirements

### Requirement: A переказ absorbs its зустрічний дохід

When both рахунки of a переказ report the same movement, the destination reports it as a дохід of
its own. The system SHALL NOT keep that дохід beside the переказ, so the money is counted once.

The **зустрічний дохід** of a переказ SHALL be a stored дохід that: sits on the переказ's
destination рахунок; carries the reserved джерело «Без джерела»; is of exactly the переказ's
arrived сума in the same currency; is dated no more than one calendar day before or after the
переказ; and carries no фіскальний чек. A дохід whose джерело the owner chose SHALL never be one — a
джерело is a decision — and neither SHALL a дохід the owner attached a фіскальний чек to.

A переказ SHALL look for its зустрічний дохід when a правило-переказ creates it, and when the owner
retypes a витрата into it. If one is stored, the переказ SHALL absorb it: the дохід SHALL be removed
in the same write that stores the переказ, and the переказ SHALL await nothing. If none is stored,
the переказ SHALL **await** its зустрічний дохід, and SHALL absorb the first monobank statement item
that later arrives on the destination and is its зустрічний дохід; once it has absorbed one it SHALL
await nothing. Saving an edit of a переказ that still awaits SHALL look again, as a retype does.

Only a monobank statement item is absorbed on arrival. A дохід that arrives any other way — confirmed
from a чернетка of a bank сповіщення, or recorded by hand — SHALL be stored as it is, even when it would
be the зустрічний дохід of an awaiting переказ.

A переказ SHALL absorb at most one дохід, and a дохід SHALL be absorbed by at most one переказ.
When several candidates qualify, the one dated nearest SHALL be taken, then the one stored
earliest, then the one with the smaller id, so the outcome never depends on load order.

A переказ recorded by hand as a new транзакція, a переказ stored before перекази could await, and a
переказ restored from a бекап that does not say it awaits SHALL await nothing. A переказ that awaits
and is retyped into a витрата SHALL leave nothing awaiting behind. Retyping a переказ that absorbed
a дохід back into a витрата, or deleting it, SHALL NOT bring the absorbed дохід back.

#### Scenario: A retyped переказ absorbs the дохід already stored

- **WHEN** a витрата of 616 minor units UAH on platinum dated 2026-09-12 and a дохід «Без джерела»
  of 616 minor units UAH on РЕЗЕРВ dated 2026-09-12 are stored, and the owner retypes the витрата
  into a переказ onto РЕЗЕРВ
- **THEN** the переказ of 616 minor units UAH from platinum to РЕЗЕРВ is stored, that дохід is gone,
  the розрахункові баланси of platinum and РЕЗЕРВ are exactly what they were before the retype, the
  month's дохід is 616 minor units UAH lower, and the переказ awaits nothing

#### Scenario: A переказ with no stored зустрічний дохід awaits it

- **WHEN** the owner retypes a витрата of 20 minor units UAH on platinum dated 2026-09-16 into a
  переказ onto РЕЗЕРВ and no дохід on РЕЗЕРВ qualifies
- **THEN** the переказ is stored and awaits its зустрічний дохід

#### Scenario: A переказ awaiting after a retype is met by a later sync

- **WHEN** a переказ of 20 minor units UAH onto РЕЗЕРВ dated 2026-09-16 awaits its зустрічний дохід
  and a monobank statement item of +20 dated 2026-09-16 on РЕЗЕРВ is later committed
- **THEN** no дохід of 20 is stored on РЕЗЕРВ and the переказ awaits nothing

#### Scenario: A confirmed чернетка is not absorbed

- **WHEN** a переказ of 5000 minor units UAH onto a рахунок mapped to a відстежуваний застосунок awaits its
  зустрічний дохід, and the owner confirms a дохід-чернетка of 5000 minor units UAH of the same date
  on that рахунок
- **THEN** the дохід is stored «Без джерела» and the переказ still awaits

#### Scenario: A дохід with a chosen джерело is never absorbed

- **WHEN** a дохід of 616 minor units UAH on РЕЗЕРВ dated 2026-09-12 carries the джерело Gifts and
  a витрата of the same сума and date on platinum is retyped into a переказ onto РЕЗЕРВ
- **THEN** the дохід is still stored with Gifts, and the переказ awaits its зустрічний дохід

#### Scenario: A дохід carrying a фіскальний чек is never absorbed

- **WHEN** a дохід «Без джерела» of 616 minor units UAH on РЕЗЕРВ dated 2026-09-12 carries a
  фіскальний чек and a витрата of the same сума and date on platinum is retyped into a переказ onto
  РЕЗЕРВ
- **THEN** the дохід and its чек are still stored, and the переказ awaits its зустрічний дохід

#### Scenario: A дохід two days away is not the зустрічний дохід

- **WHEN** a дохід «Без джерела» of 616 minor units UAH on РЕЗЕРВ is dated 2026-09-10 and a
  витрата of the same сума dated 2026-09-12 is retyped into a переказ onto РЕЗЕРВ
- **THEN** the дохід is still stored and the переказ awaits its зустрічний дохід

#### Scenario: A different сума is not the зустрічний дохід

- **WHEN** a дохід «Без джерела» of 617 minor units UAH on РЕЗЕРВ dated 2026-09-12 is stored and a
  витрата of 616 minor units UAH dated 2026-09-12 is retyped into a переказ onto РЕЗЕРВ
- **THEN** the дохід is still stored

#### Scenario: A cross-currency переказ absorbs a дохід of its arrived сума

- **WHEN** a дохід «Без джерела» of 10000 minor units USD dated 2026-09-12 is stored on a USD рахунок,
  and a витрата of 410000 minor units UAH on platinum dated 2026-09-12 is retyped into a переказ onto
  that рахунок arriving as 10000 minor units USD
- **THEN** that дохід is gone and the переказ awaits nothing

#### Scenario: Two перекази never absorb the same дохід

- **WHEN** one дохід «Без джерела» of 9 minor units UAH on РЕЗЕРВ dated 2026-09-11 is stored, and
  two витрати of 9 minor units UAH on platinum dated 2026-09-10 and 2026-09-11 are retyped into
  перекази onto РЕЗЕРВ one after the other
- **THEN** the first retyped absorbs the дохід, and the second awaits its зустрічний дохід

#### Scenario: The nearest date wins among candidates

- **WHEN** доходи «Без джерела» of 9 minor units UAH on РЕЗЕРВ dated 2026-09-10 and 2026-09-11 are
  stored and a витрата of 9 minor units UAH dated 2026-09-11 is retyped into a переказ onto РЕЗЕРВ
- **THEN** the дохід dated 2026-09-11 is absorbed and the one dated 2026-09-10 is still stored

#### Scenario: Editing an awaiting переказ looks again

- **WHEN** a переказ of 616 minor units UAH onto РЕЗЕРВ dated 2026-09-14 awaits its зустрічний дохід,
  a дохід «Без джерела» of 616 minor units UAH on РЕЗЕРВ dated 2026-09-12 is stored, and the owner
  edits the переказ's date to 2026-09-12 and saves
- **THEN** that дохід is gone and the переказ awaits nothing

#### Scenario: A переказ recorded by hand awaits nothing

- **WHEN** the owner records a new переказ of 5000 minor units UAH from platinum to РЕЗЕРВ from the
  entry form while a дохід «Без джерела» of 5000 minor units UAH on РЕЗЕРВ of the same date is stored
- **THEN** the дохід is still stored and the переказ awaits nothing

#### Scenario: An awaiting переказ retyped into a витрата leaves nothing awaiting

- **WHEN** a переказ of 20 minor units UAH onto РЕЗЕРВ awaits its зустрічний дохід, the owner retypes
  it into a витрата, and a monobank statement item of +20 of the same date on РЕЗЕРВ is later committed
- **THEN** the витрата is stored in «Без категорії» and a дохід «Без джерела» of 20 minor units UAH is
  stored on РЕЗЕРВ

#### Scenario: Retyping back does not restore the absorbed дохід

- **WHEN** a переказ that absorbed a дохід is retyped back into a витрата
- **THEN** the витрата is stored in «Без категорії» and no дохід reappears
