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
does.

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
- **THEN** that витрата carries Groceries

#### Scenario: Switching a базова категорія off takes nothing back

- **WHEN** a витрата carrying "АТБ 421" has been given Groceries by «Продукти», and «Продукти» is
  then switched off
- **THEN** that витрата still carries Groceries

### Requirement: The owner's правила decide before the шаблон is consulted

Deciding the категорія of a витрата SHALL try the owner's own правила first, ranked among
themselves exactly as they are today. When any правило matches, its target SHALL be the answer and
the шаблон SHALL NOT be consulted at all — however specific a базова категорія's match would have
been. Only when no правило matches SHALL the шаблон be tried, and among the базові категорії that
match, the same ladder SHALL rank them: both criteria over merchant alone, merchant alone over MCC
alone, and the longest merchant pattern over a shorter one. When neither tier matches, the витрата
SHALL fall to «Без категорії» as it does today.

This SHALL hold wherever a категорія is decided — the monobank sync, a чернетка from a bank
сповіщення, the entry form, and the sweep of «Без категорії» — so that one answer is given to one
опис everywhere in the app.

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
two tiers give their опис, and every other транзакція is untouched. It SHALL be recorded in the
журнал as one operation with its counts, and SHALL NOT block the app from opening — a sweep that
fails SHALL leave the version unrecorded so the next open tries again.

#### Scenario: The first open after an update clears what it can

- **WHEN** a device holding forty витрати in «Без категорії», eleven of which the шаблон matches,
  opens the app for the first time under a шаблон version it has not swept
- **THEN** those eleven carry the категорії the шаблон gives them, the other twenty-nine are
  unchanged, and the журнал holds one operation with the counts forty and eleven

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
