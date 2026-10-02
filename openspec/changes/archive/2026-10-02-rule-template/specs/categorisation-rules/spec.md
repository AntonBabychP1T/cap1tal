## ADDED Requirements

### Requirement: The app ships a шаблон of базові категорії

The app SHALL carry a built-in шаблон категоризації: a fixed set of базові категорії, each holding
merchant patterns, MCC codes, or both, and each naming one **типова категорія** among the rows the
app seeds. The шаблон SHALL be part of the app and not rows in storage, so updating the app updates
it, and neither the owner nor a restore can change what a базова категорія covers.

The базові категорії and their типові категорії SHALL be:

| Базова категорія | Типова категорія |
| --- | --- |
| Продукти | Groceries |
| Пекарня | булка |
| Кафе і ресторани | Eating out |
| Кава | COFFEE ☕ |
| Доставка їжі | Food Delivery |
| Транспорт | Transport |
| Подорожі | Travel |
| Дім | Home |
| Одяг і взуття | Clothing |
| Здоровʼя | Health |
| Електроніка | Electronics |
| Цифрове | Digital |
| Комунальні й звʼязок | Bills |
| Розваги | Entertainment |
| Спорт | Entertainment |
| Тварини | Pets |
| Книги | book |
| Освіта | Education |
| Краса й догляд | Services |
| Подарунки й квіти | Gifts |
| Благодійність | Charity |
| Алкоголь і тютюн | habits |

Every merchant pattern in the шаблон SHALL be stored folded, and SHALL be matched exactly as a
правило's pattern is — as a substring of the опис, case folded, with no transliteration between
scripts. A merchant written in both scripts in the wild SHALL therefore appear in the шаблон under
both spellings. Every MCC in the шаблон SHALL be a whole number and SHALL match by equality.

No базова категорія SHALL name «Коригування», «Комісія» or «Без категорії» as its типова
категорія: the first two are carried only by what the app creates for itself, and the third is the
absence this whole capability exists to fill.

#### Scenario: A fresh device categorises a known merchant with no setup

- **WHEN** the app is opened on a device holding no правило and an imported витрата arrives with
  the опис "АТБ 421"
- **THEN** that витрата carries Groceries

#### Scenario: A known MCC is enough on its own

- **WHEN** no правило exists and an imported витрата arrives with MCC 5411 and an опис no pattern
  matches
- **THEN** that витрата carries Groceries

#### Scenario: Both spellings of one merchant are covered

- **WHEN** no правило exists and two imported витрати arrive with the описи "UKLON" and "Уклон"
- **THEN** both carry Transport

#### Scenario: The шаблон never names a reserved категорія

- **WHEN** the шаблон is read
- **THEN** no базова категорія names «Коригування», «Комісія» or «Без категорії»

### Requirement: The owner points a базова категорія at their own категорія, or switches it off

For each базова категорія the owner SHALL be able to choose any unarchived expense категорія of
this device as its target, or to switch it off so that it matches nothing at all. That choice SHALL
be stored and SHALL survive a restart. A базова категорія the owner has not touched SHALL use its
типова категорія — so the шаблон works before anything is configured, and the menu is for
correcting it, not for switching it on.

A базова категорія whose target does not exist on this device SHALL match nothing, silently — the
same as being switched off — rather than refusing an import or landing a витрата on an id no row
carries. A target that exists but is archived SHALL keep matching, exactly as a правило's archived
target does.

Changing a target or switching a базова категорія off SHALL NOT change any транзакція that already
carries a категорія; it SHALL sweep the stored «Без категорії» витрати exactly as storing a правило
does — recorded in the журнал as one operation with its counts, and saying in the menu how many
витрати it recategorised when it moved any, and nothing when it moved none.

#### Scenario: A remapped базова категорія lands somewhere else

- **WHEN** the owner points «Продукти» at their own категорія «Їжа» and an imported витрата arrives
  with the опис "АТБ 421"
- **THEN** that витрата carries «Їжа»

#### Scenario: A switched-off базова категорія matches nothing

- **WHEN** the owner switches «Алкоголь і тютюн» off and an imported витрата arrives with MCC 5921
  that no other базова категорія and no правило matches
- **THEN** that витрата carries «Без категорії»

#### Scenario: An untouched базова категорія uses its типова категорія

- **WHEN** the owner has changed «Продукти» and nothing else, and an imported витрата arrives with
  the опис "АВРОРА"
- **THEN** that витрата carries Home

#### Scenario: The choice survives a restart

- **WHEN** the owner points «Продукти» at «Їжа» and the app is restarted
- **THEN** «Продукти» still targets «Їжа»

#### Scenario: A target that no longer exists matches nothing

- **WHEN** a базова категорія targets a категорія id no row carries and an imported витрата arrives
  matching only that базова категорія
- **THEN** that витрата carries «Без категорії» and the import is not refused

#### Scenario: Changing a mapping sweeps «Без категорії»

- **WHEN** a витрата carrying the опис "АТБ 421" sits in «Без категорії» because «Продукти» was off,
  and the owner points «Продукти» at Groceries
- **THEN** that витрата carries Groceries, and the menu says one витрата was recategorised

#### Scenario: Switching a базова категорія off takes nothing back

- **WHEN** a витрата carrying "АТБ 421" has been given Groceries by «Продукти», and «Продукти» is
  then switched off
- **THEN** that витрата still carries Groceries

### Requirement: The owner's правила decide before the шаблон is consulted

Deciding the категорія of a витрата SHALL try the owner's own правила first, ranked among
themselves exactly as they are today. When any правило eligible there matches, its target — a
категорія or a переказ — SHALL be the answer and the шаблон SHALL NOT be consulted at all —
however specific a базова категорія's match would have been. A правило-переказ ineligible for that
витрата (on its own destination, or in another currency) takes no part, exactly as today, so it
does not stop the шаблон from answering. Only when no eligible правило matches SHALL the шаблон be
tried, and among the базові категорії that
match, the same ladder SHALL rank them: both criteria over merchant alone, merchant alone over MCC
alone, and the longest merchant pattern over a shorter one. When neither tier matches, the витрата
SHALL fall to «Без категорії» as it does today.

This SHALL hold wherever a категорія is decided — the monobank sync, a чернетка from a bank
сповіщення, the entry form, and the sweep of «Без категорії» — so that one answer is given to one
опис everywhere in the app. The шаблон only ever names a категорія; it never turns a витрата into a
переказ.

The offer to remember a decision as a правило SHALL look at the owner's правила alone, as it does
today: a базова категорія already giving that опис the категорія being set SHALL NOT suppress it.
A правило of the owner's own outlives a later change to the шаблон or to its mapping, which is
exactly what the owner accepting the offer is asking for.

#### Scenario: A правило beats the шаблон

- **WHEN** the правило "атб → Eating out" exists and an imported витрата arrives with the опис
  "АТБ 421" and MCC 5411
- **THEN** that витрата carries Eating out

#### Scenario: An owner's MCC rule beats a шаблон merchant match

- **WHEN** the owner's only правило is "MCC 5411 → сімейний бюджет" and an imported витрата arrives
  with the опис "АТБ 421" and MCC 5411
- **THEN** that витрата carries сімейний бюджет — the owner's tier answered, so the шаблон was not
  consulted

#### Scenario: The longest шаблон pattern wins inside the шаблон

- **WHEN** no правило exists and an imported витрата arrives with the опис "BOLT FOOD" which
  «Транспорт» matches on "bolt" and «Доставка їжі» matches on "bolt food"
- **THEN** that витрата carries Food Delivery

#### Scenario: The шаблон reaches the entry form

- **WHEN** no правило exists and the owner types the опис "АТБ 421" while recording a витрата,
  having picked no категорія
- **THEN** the form shows Groceries as the chosen категорія

#### Scenario: The шаблон auto-confirms a чернетка

- **WHEN** no правило exists and a bank сповіщення drafts a витрата whose text holds "СІЛЬПО"
- **THEN** it confirms itself into a витрата carrying Groceries, exactly as a matching правило
  would have confirmed it

#### Scenario: An ineligible правило-переказ does not silence the шаблон

- **WHEN** the owner's only правило is "атб → переказ на РЕЗЕРВ" and an imported витрата arrives on
  РЕЗЕРВ itself with the опис "АТБ 421"
- **THEN** that витрата carries Groceries

#### Scenario: A шаблон match still offers the правило

- **WHEN** no правило exists, «Продукти» is at its типова категорія, a витрата carrying the опис
  "АТБ 421" is stored in Eating out, and the owner puts it into Groceries
- **THEN** a правило is offered with the merchant pattern "атб" and the target Groceries

#### Scenario: Neither tier matches

- **WHEN** no правило matches and no базова категорія matches an imported витрата
- **THEN** that витрата carries «Без категорії»

### Requirement: A newly arrived шаблон sweeps «Без категорії» once

The шаблон SHALL carry a version, and the system SHALL remember the version it last swept under.
When the app opens and the two differ, the stored «Без категорії» витрати SHALL be swept exactly as
storing a правило sweeps them, and the шаблон's version SHALL be recorded as swept. This SHALL
happen at most once per version: opening the app again under the same шаблон SHALL sweep nothing.

The version SHALL change whenever what the шаблон covers changes — a merchant added to a базова
категорія, an MCC added, a базова категорія added — so that an app update carrying new knowledge
reaches the витрати already sitting in «Без категорії», and one that carries none costs nothing.

The sweep SHALL be the ordinary one: only витрати in «Без категорії» move, they move onto what the
two tiers give their опис, and every other транзакція is untouched. Like every розбір it runs on the
опис with no MCC, so the шаблон's MCC codes move nothing here. It SHALL be recorded in the журнал as
one operation with its counts, and SHALL NOT block the app from opening — it runs among the launch
chores after the first screen is drawn, and a sweep that fails SHALL leave the version unrecorded so
the next open tries again. Nothing was triggered on any screen, so nothing about it SHALL be said to
the owner; the витрати it moved simply no longer sit in «Без категорії».

#### Scenario: The first open after an update clears what it can

- **WHEN** a device holding forty витрати in «Без категорії», eleven of which the шаблон matches,
  opens the app for the first time under a шаблон version it has not swept
- **THEN** those eleven carry the категорії the шаблон gives them, the other twenty-nine are
  unchanged, and the журнал holds one operation with the counts forty examined, eleven moved onto a
  категорія, none turned into a переказ and no зустрічний дохід absorbed

#### Scenario: Opening again sweeps nothing

- **WHEN** the app is opened again under the same шаблон version
- **THEN** no витрата is moved and no sweep operation is recorded

#### Scenario: A new шаблон version reaches the pile again

- **WHEN** an app update adds a merchant to «Продукти» and raises the шаблон's version, and the app
  is opened on a device holding a витрата in «Без категорії» carrying that merchant's опис
- **THEN** that витрата carries the категорія «Продукти» lands in

#### Scenario: A категорія the owner chose is still never taken away

- **WHEN** the first open under a new шаблон version finds a витрата in Eating out whose опис the
  шаблон matches into Groceries
- **THEN** that витрата still carries Eating out

## MODIFIED Requirements

### Requirement: Правила decide the категорія of a витрата recorded by hand

A витрата being recorded by hand SHALL be offered the категорія the owner's правила give its
опис — or, when no правило matches, the категорія the шаблон категоризації gives it — matched
exactly as an imported транзакція's is — the same two tiers, the same patterns, the same ladder,
and no MCC, since nothing hand-typed carries one. The offer SHALL be visible as the chosen категорія
before the витрата is recorded, and SHALL be changeable: what the owner picks themselves SHALL
stand, and SHALL NOT be replaced by a правило or the шаблон afterwards, however the опис changes
next. An опис that neither a правило nor a базова категорія matches SHALL leave the категорія
exactly where it was.

Where only a категорія is being decided — a витрата recorded by hand, and a чернетка from a bank
сповіщення — a правило-переказ SHALL take no part: matching there SHALL run over the правила that
name a категорія alone, as if no правило-переказ existed, and only when none of those matches is
the шаблон consulted. Recording by hand never turns a витрата
into a переказ on the owner's behalf; the owner picks the type.

A дохід, a переказ and a повернення SHALL take no категорія from a правило: a правило's target is
an expense категорія, a дохід carries a джерело instead, a переказ carries neither, and a
повернення returns to the категорія of what was bought — never to whatever its text resembles.

#### Scenario: A typed опис proposes its категорія

- **WHEN** the правило "атб → Groceries" exists and the owner types the опис "АТБ 421" into the
  entry form while recording a витрата and has picked no категорія
- **THEN** Groceries is shown as the chosen категорія of the витрата about to be recorded

#### Scenario: The owner's own pick is not overridden

- **WHEN** the правило "атб → Groceries" exists, the owner picks Eating out, and then types the
  опис "АТБ 421"
- **THEN** the категорія stays Eating out, and recording stores Eating out

#### Scenario: An опис no правило matches proposes nothing

- **WHEN** no правило and no базова категорія matches and the owner types the опис "новий заклад"
  while recording a витрата with no категорія picked
- **THEN** the категорія is still «Без категорії» and the витрата is stored in it

#### Scenario: A правило-переказ proposes nothing by hand

- **WHEN** the правила "округлення → Bills" and "округлення балансу → переказ на РЕЗЕРВ" exist and
  the owner types the опис "Округлення балансу" while recording a витрата with no категорія picked
- **THEN** Bills is shown as the chosen категорія, and recording stores a витрата in Bills — no
  переказ

#### Scenario: A правило takes no part in a дохід

- **WHEN** the правило "атб → Groceries" exists and the owner records a дохід carrying the опис
  "АТБ 421"
- **THEN** the дохід is stored with the джерело the owner chose and no категорія, and the правило
  changed nothing

#### Scenario: A правило takes no part in a повернення

- **WHEN** the правило "атб → Groceries" exists and the owner records a повернення into Clothing
  carrying the опис "АТБ 421"
- **THEN** the повернення is stored in Clothing

### Requirement: A stored правило recategorises the «Без категорії» витрати it matches

Storing a правило — newly created or edited — SHALL move every stored витрата in «Без категорії»
that the two tiers now match onto what they give it — the owner's правила first, the шаблон
категоризації only when no правило matches: onto the категорія, or — when the best правило is a
правило-переказ that matches it — into a переказ. This SHALL happen at once, without asking, and
SHALL be complete: after storing, no витрата in «Без категорії» is given a категорія or a переказ
by the правила or the шаблон on its рахунок. The same розбір SHALL also run when the owner changes
what a базова категорія points at, and once per шаблон version when the app opens, as the
requirements on the шаблон say. A правило-переказ that matches the опис of a
витрата on its own destination, or on a рахунок in another currency, gives it nothing; only the
шаблон may still answer for that витрата, and when it does not, the витрата stays.

A витрата turned into a переказ SHALL keep its identity, date and опис; the переказ SHALL leave the
рахунок the витрата was on and arrive at the правило's destination, carrying the витрата's сума on
both legs. It SHALL absorb its зустрічний дохід exactly as the transactions capability defines, and
SHALL await one when none is stored.

A move onto «Без категорії» SHALL never be made, whatever the правила say. «Без категорії» is not
a target a правило may be created with, but a бекап written elsewhere could carry one, and a розбір
that "moved" a витрата from the gap into the gap would be a move that changes nothing while
outranking the правило that would have filled it.

Matching SHALL run on the витрата's опис with no MCC — a stored транзакція keeps no MCC, the
bank's code is not carried past import — so a правило whose only criterion is an MCC SHALL move
nothing, and neither SHALL the MCC codes the шаблон carries, the same restriction a чернетка from a bank сповіщення already carries. A витрата carrying
no опис SHALL match nothing and SHALL stay where it is.

It SHALL touch nothing else. A витрата in any other категорія SHALL be left exactly as it is, a
повернення SHALL be left as it is whatever its категорія, and a переказ and a коригування SHALL be
untouched — «Коригування», «Комісія» and every категорія the owner chose are decisions, not gaps. A
дохід SHALL be untouched except the зустрічний дохід a new переказ absorbs. Every field of a moved
витрата other than its категорія SHALL be unchanged, its опис included.

The категорія or переказ a swept витрата lands on SHALL be the one the whole set of правила — and,
when none of them matches, the шаблон — gives its опис on its рахунок, not the target of the
правило just written: a правило more specific than
the new one keeps the last word, exactly as it would at import. Deleting a правило SHALL move
nothing: a витрата already carrying a категорія is no longer a gap, and moving it back into «Без
категорії» would throw away a classification the owner is reading.

Each pass SHALL be recorded in the журнал as one operation carrying how many витрати it examined,
how many it moved onto a категорія, how many it turned into перекази and how many зустрічні доходи
those absorbed, and nothing else — the журнал holds no опис, no сума and no назва. The count
examined SHALL be the «Без категорії» витрати the pass considered, not every транзакція stored.

A pass that moved anything SHALL say so where it was triggered, naming how many витрати it
recategorised and how many it turned into перекази. The owner chose that this happens without being
asked; being told afterwards is what keeps a правило written too broadly findable — the витрати it
moved no longer carry the «Без категорії» mark, and the журнал holds counts and nothing that could
lead back to them. A pass that moved nothing SHALL say nothing.

#### Scenario: A new правило clears the matching витрати out of «Без категорії»

- **WHEN** three витрати carrying описи "АТБ 421", "АТБ 12" and "НОВИЙ ЗАКЛАД" are stored in «Без
  категорії» and the правило "атб → Groceries" is created
- **THEN** the two "АТБ" витрати carry Groceries, the third still carries «Без категорії», and the
  сума, дата, рахунок and опис of all three are unchanged

#### Scenario: A new правило-переказ turns matching витрати into перекази

- **WHEN** a витрата of 479 minor units UAH on the card platinum carrying the опис "Округлення
  балансу «Резерв»" and dated 2026-09-13 sits in «Без категорії», a дохід «Без джерела» of 479
  minor units UAH dated 2026-09-13 is stored on РЕЗЕРВ, and the правило "округлення балансу →
  переказ на РЕЗЕРВ" is created
- **THEN** the same транзакція is a переказ of 479 minor units UAH from platinum to РЕЗЕРВ dated
  2026-09-13 with that опис, the дохід is gone, and the переказ awaits nothing

#### Scenario: A правило-переказ leaves a витрата on its own destination where it is

- **WHEN** a витрата carrying the опис "Округлення балансу «Резерв»" sits in «Без категорії» on РЕЗЕРВ
  itself and the правило "округлення балансу → переказ на РЕЗЕРВ" is created
- **THEN** that витрата is still a витрата in «Без категорії»

#### Scenario: A категорія the owner chose is never taken away

- **WHEN** a витрата carrying the опис "АТБ 421" is stored in Eating out and the правило "атб →
  Groceries" is created
- **THEN** that витрата still carries Eating out

#### Scenario: A правило-переказ does not take a витрата out of a chosen категорія

- **WHEN** a витрата carrying the опис "Округлення балансу «Резерв»" is stored in Bills and the
  правило "округлення балансу → переказ на РЕЗЕРВ" is created
- **THEN** that витрата is still a витрата in Bills

#### Scenario: A more specific правило keeps the last word during the sweep

- **WHEN** the правило "атб 421 → Eating out" exists, a витрата carrying the опис "АТБ 421" sits
  in «Без категорії», and the правило "атб → Groceries" is created
- **THEN** that витрата carries Eating out — the longer pattern wins the sweep as it would an
  import

#### Scenario: A витрата already moved is not swept again

- **WHEN** the правило "атб → Groceries" has moved a витрата carrying "АТБ 421" onto Groceries and
  the правило "атб 421 → Eating out" is created afterwards
- **THEN** that витрата still carries Groceries — only «Без категорії» is swept

#### Scenario: A правило targeting «Без категорії» moves nothing

- **WHEN** storage holds a правило "сільпо → Без категорії" that a restore put there, and a витрата
  carrying the опис "СІЛЬПО 123" sits in «Без категорії»
- **THEN** the розбір moves it nowhere and it still carries «Без категорії»

#### Scenario: An MCC-only правило moves nothing

- **WHEN** a витрата carrying the опис "НОВИЙ ЗАКЛАД 7", which no базова категорія matches, sits in
  «Без категорії» and the правило "MCC 5411 → Groceries" is created
- **THEN** that витрата still carries «Без категорії»

#### Scenario: The шаблон fills what the new правило does not

- **WHEN** витрати carrying "АТБ 421" and "НОВИЙ ЗАКЛАД 7" sit in «Без категорії» with «Продукти»
  at its типова категорія, and the правило "новий заклад → Eating out" is created
- **THEN** the first carries Groceries and the second carries Eating out

#### Scenario: A витрата with no опис is not swept

- **WHEN** a витрата carrying no опис sits in «Без категорії» and the правило "атб → Groceries" is
  created
- **THEN** that витрата still carries «Без категорії»

#### Scenario: A повернення is not swept

- **WHEN** a повернення carrying the опис "АТБ 421" is stored in «Без категорії» and the правило
  "атб → Groceries" is created
- **THEN** the повернення still carries «Без категорії»

#### Scenario: Deleting a правило moves nothing

- **WHEN** the правило "атб → Groceries" has moved a витрата onto Groceries and is then deleted
- **THEN** that витрата still carries Groceries

#### Scenario: The owner is told how many moved

- **WHEN** storing a правило moves eleven витрати out of «Без категорії», three of them into
  перекази
- **THEN** the screen that stored it says eight витрати were recategorised and three became
  перекази

#### Scenario: A pass that moved nothing says nothing

- **WHEN** storing a правило moves no витрата
- **THEN** nothing about a розбір is said

#### Scenario: The pass is in the журнал as counts alone

- **WHEN** a правило is stored and moves two of forty stored «Без категорії» витрати onto a
  категорія and turns one into a переказ that absorbs one дохід
- **THEN** the журнал holds one operation for that pass carrying the counts forty, two, one and one,
  and no опис, сума or назва
