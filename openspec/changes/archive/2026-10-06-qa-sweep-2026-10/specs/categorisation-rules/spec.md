## MODIFIED Requirements

### Requirement: Matching is deterministic and most-specific-first

Given a transaction's merchant description, when present its MCC, and the рахунок the money left,
the system SHALL return the target of the best-matching rule — a category, or a переказ to a
destination рахунок — or nothing when no rule matches. A merchant
pattern matches WHEN it occurs in the description, case-insensitively, **beginning where a word
begins** — at the start of the description or right after a character that is neither a letter nor
a digit — wherever in the description that is; a pattern that occurs only inside a word SHALL NOT
match. A pattern that itself starts with a character that is neither a letter nor a digit («*megogo»,
«-маркет») SHALL match wherever it occurs: its own first character is the boundary. A продавець
matches WHEN the description is recognised as that продавець, as the merchants capability
defines; an MCC matches WHEN it is equal; a rule holding both a merchant criterion and an MCC
matches only when both do. Case is all that is
folded: a pattern written in one script SHALL NOT match a description written in another, because
the owner writes the pattern by looking at the descriptions their bank actually sends — «Uklon»
arrives in Latin and «СІЛЬПО» in Cyrillic. Among matching rules,
a rule with both criteria SHALL beat a merchant-only rule, and a merchant-only rule SHALL beat
an MCC-only rule; among matching merchant criteria the longest SHALL win, a продавець counting as
long as the написання that recognised the description; a remaining tie SHALL
go to the most recently created rule. A rule naming a продавець SHALL therefore rank exactly as a
rule carrying, as its pattern, the написання that recognised the description, created when that
rule was. A правило-переказ and a rule naming a category SHALL be
ranked on this one ladder together, with no preference for either kind.

A rule naming a продавець SHALL NOT match a description recognised as another продавець, even
when one of its own написання occurs in that description: recognition gives one answer to one
опис, and the rule follows that answer.

A правило-переказ SHALL NOT match money leaving its own destination рахунок, nor money leaving a
рахунок in another currency than its destination: the first would be a переказ from a рахунок to
itself, and the second a переказ whose arrived сума nothing states. Such a правило SHALL take no
part in that match at all, so the best of the remaining rules decides.

#### Scenario: A merchant pattern matches case-insensitively inside the description

- **WHEN** the rule "сільпо → Groceries" exists and a transaction's description is
  "СІЛЬПО Київ вул. Хрещатик"
- **THEN** matching returns Groceries

#### Scenario: A merchant pattern inside a word does not match

- **WHEN** the rule "коло → Звички" exists and a transaction's description is "НАВКОЛО маркет"
- **THEN** matching returns nothing

#### Scenario: A merchant pattern after punctuation matches

- **WHEN** the rule "megogo → Підписки" exists and a transaction's description is "WFP*MEGOGO.NET"
- **THEN** matching returns Підписки

#### Scenario: A pattern that starts with punctuation matches wherever it occurs

- **WHEN** the rule "*megogo → Підписки" exists and a transaction's description is "WFP*MEGOGO.NET"
- **THEN** matching returns Підписки — the pattern's own «*» is where its word begins

#### Scenario: A продавець matches every spelling it is recognised by

- **WHEN** «АТБ» holds the написання "атб" and "atb", the rule "АТБ → Groceries" names it, and two
  transactions carry the descriptions "Оплата послуг АТБ-Маркет 1234" and "ATB MARKET"
- **THEN** matching returns Groceries for both

#### Scenario: A продавець ranks as long as its recognising написання

- **WHEN** «АТБ» holds "атб" and is named by the rule "АТБ → Groceries", the rule "атб 421 → Eating
  out" exists, and a transaction's description is "АТБ 421"
- **THEN** matching returns Eating out — "атб 421" is longer than "атб"

#### Scenario: A продавець rule follows recognition, not a bare substring

- **WHEN** «Bolt» holds "bolt" and is named by the rule "Bolt → Transport", «Bolt Food» holds "bolt
  food" and no rule names it, and a transaction's description is "BOLT FOOD 3411"
- **THEN** the rule naming «Bolt» does not match — the description is recognised as «Bolt Food»

#### Scenario: An MCC matches exactly

- **WHEN** the rule "MCC 5411 → Groceries" exists and a transaction carries MCC 5411 and the
  description "новий магазин"
- **THEN** matching returns Groceries

#### Scenario: Both-criteria beats merchant-only

- **WHEN** the rules "uklon → Transport" and "uklon + MCC 4121 → Travel" exist and a transaction
  is "Uklon" with MCC 4121
- **THEN** matching returns Travel

#### Scenario: Merchant beats MCC

- **WHEN** the rules "MCC 5411 → Groceries" and "аптека → Health" exist and a transaction is
  "Аптека 24" with MCC 5411
- **THEN** matching returns Health

#### Scenario: The longest merchant pattern wins

- **WHEN** the rules "кава → COFFEE ☕" and "кавамашина → Home" exist and a transaction's
  description contains "кавамашина"
- **THEN** matching returns Home

#### Scenario: An exact tie goes to the newest rule

- **WHEN** the rules "атб → Groceries" and, created later, "атб → Eating out" both exist and a
  transaction's description contains "АТБ"
- **THEN** matching returns Eating out

#### Scenario: A правило-переказ wins by the same ladder

- **WHEN** the rules "округлення → Bills" and "округлення балансу → переказ на РЕЗЕРВ" exist, and
  money leaves a UAH card with the description "Округлення балансу «Резерв»"
- **THEN** matching returns the переказ на РЕЗЕРВ — the longer pattern wins

#### Scenario: A правило-переказ does not match money leaving its destination

- **WHEN** the rules "округлення → Bills" and "округлення балансу → переказ на РЕЗЕРВ" exist, and
  money leaves РЕЗЕРВ itself with the description "Округлення балансу «Резерв»"
- **THEN** matching returns Bills

#### Scenario: A правило-переказ does not match across currencies

- **WHEN** only the rule "округлення балансу → переказ на РЕЗЕРВ" exists, РЕЗЕРВ is in UAH, and
  money leaves a USD card with the description "Округлення балансу «Резерв»"
- **THEN** matching returns nothing

#### Scenario: No matching rule returns nothing

- **WHEN** no rule matches a transaction's description and MCC
- **THEN** matching returns nothing

### Requirement: A правило is proposed from a транзакція that carries an опис

When a категорія is set on a stored витрата or повернення that carries an опис, the system SHALL
offer to remember the decision as a правило whose target is the категорія just set. When a stored
витрата that carries an опис is retyped into a переказ, the system SHALL likewise offer to remember
it as a правило-переказ whose destination is the рахунок the money was just said to arrive at. The
offer SHALL arrive with a merchant criterion already proposed from that опис, SHALL let the owner
change it before it is stored, and SHALL store nothing unless the owner accepts it.
Declining SHALL leave no правило. The offer SHALL be made only when a категорія is actually set or
a витрата actually becomes a переказ, so merely opening a транзакція again — or editing any other
field of it, or editing a переказ that was already one — SHALL offer nothing.

When the опис is recognised as a продавець, the proposed criterion SHALL be that продавець, and
the owner SHALL be able to replace it by the pattern proposed from the опис, editable, before
accepting. When the опис is recognised as no продавець, the proposed criterion SHALL be that
pattern.

The proposed pattern SHALL be the написання the merchants capability proposes from that опис, by
exactly its rule and nothing restated here — so «СІЛЬПО 123 Київ, вул. Хрещатик» proposes «сільпо»,
«Оплата послуг АТБ-Маркет 1234» proposes «атб» and «Oplata poslug MEGOGO 1234» proposes
«megogo» rather than a service word, a pattern that would capture every service payment. A транзакція carrying no опис SHALL be offered nothing: there is no criterion to propose, and a
правило with no merchant criterion and no MCC is rejected.

What is stored SHALL be what the offer holds when the owner accepts, validated exactly as a
правило typed in Налаштування is — a pattern emptied before accepting SHALL be refused with the
same words, and SHALL store nothing.

The offer SHALL NOT be made when the owner's правила already give that опис the категорія being
set — or, for a переказ, already give that опис, on the рахунок the money left, a переказ to the
same destination — the правило that would be written already exists, under whatever criterion it
carries. Nor SHALL it be made when the категорія being set is «Без категорії»: that is not a
категорія a правило may target, so the only thing the offer could end in is a refusal. Nor SHALL
a правило-переказ be offered for a переказ between рахунки in different currencies: such a
правило would never match it.

#### Scenario: Categorising an imported витрата offers the правило

- **WHEN** a витрата carrying the опис "СІЛЬПО 123 Київ, вул. Хрещатик" is put into Groceries,
  that опис is recognised as no продавець, and no правило matches it
- **THEN** a правило is offered with the merchant pattern "сільпо" and the target Groceries

#### Scenario: A recognised опис offers its продавець

- **WHEN** «АТБ» holds "атб" and "atb", no правило names it or matches the опис, and a витрата
  carrying the опис "ATB MARKET" is put into Groceries
- **THEN** a правило is offered naming the продавець «АТБ» with the target Groceries

#### Scenario: The продавець can be replaced by a pattern

- **WHEN** that offer is switched to a pattern and accepted unchanged
- **THEN** the правило "atb market → Groceries" is stored, and no правило names «АТБ»

#### Scenario: Service words are skipped in the proposed pattern

- **WHEN** a витрата carrying the опис "Оплата послуг АТБ-Маркет 1234 Київ", recognised as no
  продавець, is put into Groceries and no правило matches it
- **THEN** a правило is offered with the merchant pattern "атб" and the target Groceries

#### Scenario: A transliterated service word is skipped in the proposed pattern

- **WHEN** a витрата carrying the опис "Oplata poslug MEGOGO 1234", recognised as no продавець,
  is put into Підписки and no правило matches it
- **THEN** a правило is offered with the merchant pattern "megogo" and the target Підписки

#### Scenario: Retyping a витрата into a переказ offers the правило-переказ

- **WHEN** a витрата on a UAH card carrying the опис "Округлення балансу «Резерв»" is retyped into a
  переказ onto the UAH рахунок РЕЗЕРВ and no правило matches that опис
- **THEN** a правило is offered with the merchant pattern "округлення балансу" and the destination
  рахунок РЕЗЕРВ

#### Scenario: A recognised опис offers a правило-переказ naming its продавець

- **WHEN** «Резерв» holds "округлення балансу", no правило names it or matches the опис, and a
  витрата on a UAH card carrying "Округлення балансу «Резерв»" is retyped into a переказ onto the
  UAH рахунок РЕЗЕРВ
- **THEN** a правило is offered naming the продавець «Резерв» with the destination рахунок РЕЗЕРВ

#### Scenario: A cross-currency переказ offers no правило

- **WHEN** a витрата on a UAH card carrying the опис "Купівля валюти" is retyped into a переказ onto
  a USD рахунок
- **THEN** no правило is offered

#### Scenario: A переказ an existing правило-переказ already gives offers nothing

- **WHEN** the правило "округлення балансу → переказ на РЕЗЕРВ" exists and a витрата on a UAH card
  carrying the опис "Округлення балансу «Резерв»" is retyped into a переказ onto РЕЗЕРВ
- **THEN** no правило is offered

#### Scenario: The proposed pattern can be changed before it is stored

- **WHEN** that offer is taken after the pattern is changed to "сільпо 123"
- **THEN** the правило "сільпо 123 → Groceries" is stored, and no правило carrying "сільпо" alone
  exists

#### Scenario: An опис that starts with no letter proposes the whole of itself

- **WHEN** a витрата carrying the опис "7-Eleven Kyiv" is put into Groceries and no правило matches
- **THEN** a правило is offered with the merchant pattern "7-eleven kyiv"

#### Scenario: An emptied pattern stores nothing

- **WHEN** the offer is accepted with the pattern field emptied
- **THEN** it is refused in the same words a правило with neither criterion is refused with, and no
  правило is stored

#### Scenario: A declined offer stores nothing

- **WHEN** the offer is declined
- **THEN** no правило exists and the витрата still carries Groceries

#### Scenario: A повернення is offered the правило too

- **WHEN** a повернення carrying the опис "СІЛЬПО 123 Київ" is put into Groceries and no правило
  matches that опис
- **THEN** a правило is offered with the merchant pattern "сільпо" and the target Groceries

#### Scenario: Setting a джерело on a дохід offers nothing

- **WHEN** the джерело of a дохід carrying the опис "СІЛЬПО 123 Київ" is changed
- **THEN** no правило is offered

#### Scenario: Editing a переказ offers nothing

- **WHEN** a переказ carrying the опис "СІЛЬПО 123 Київ" is edited
- **THEN** no правило is offered

#### Scenario: Moving a витрата back into «Без категорії» offers nothing

- **WHEN** a витрата carrying the опис "СІЛЬПО 123 Київ" is put back into «Без категорії»
- **THEN** no правило is offered and no refusal is shown

#### Scenario: A витрата with no опис is offered nothing

- **WHEN** a витрата carrying no опис is put into Groceries
- **THEN** no правило is offered

#### Scenario: Nothing is offered for a правило that already covers it

- **WHEN** the правило "сільпо → Groceries" exists and a витрата carrying the опис "СІЛЬПО 123" is
  put into Groceries
- **THEN** no правило is offered

#### Scenario: A правило naming the продавець already covers it

- **WHEN** the правило "АТБ → Groceries" names «АТБ», which holds "atb", and a витрата carrying the
  опис "ATB MARKET" is put into Groceries
- **THEN** no правило is offered

#### Scenario: A different категорія than the правила give is still offered

- **WHEN** the правило "сільпо → Groceries" exists and a витрата carrying the опис "СІЛЬПО 123" is
  put into Eating out
- **THEN** a правило is offered with the merchant pattern "сільпо" and the target Eating out

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

Every merchant pattern in the шаблон SHALL be stored folded, and SHALL be matched as a substring
of the опис anywhere in it, case folded, with no transliteration between scripts — unlike a
правило's pattern, which matches only where a word begins: the шаблон's patterns are written as
fragments («ярня», «kava») that occur inside the words banks send, while a правило's pattern is
the owner's own word. A merchant written in both scripts in the wild SHALL therefore appear in the шаблон under
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

#### Scenario: A шаблон fragment inside a word still matches

- **WHEN** no правило exists and an imported витрата arrives with the опис "AROMAKAVA 12" and the
  шаблон holds the pattern "kava" under Кава
- **THEN** that витрата carries COFFEE ☕

#### Scenario: The шаблон never names a reserved категорія

- **WHEN** the шаблон is read
- **THEN** no базова категорія names «Коригування», «Комісія» or «Без категорії»

## ADDED Requirements

### Requirement: The offer to remember a правило says what that правило will do

The offer to remember a правило SHALL describe the target it would store: for a категорія, that
such an опис will go to that категорія; for a правило-переказ, that such an опис will become a
переказ to that рахунок. It SHALL NOT speak of a категорія when it offers a переказ.

#### Scenario: A правило-переказ is offered as a переказ

- **WHEN** the owner retypes a витрата carrying the опис "Double tap" into a переказ to «РЕЗЕРВ» and
  the app offers to remember it
- **THEN** the offer says such an опис will become a переказ to «РЕЗЕРВ», and says nothing about a
  категорія

#### Scenario: A категорія правило is offered as a категорія

- **WHEN** the owner categorises a витрата carrying the опис "Megogo" as «Підписки» and the app
  offers to remember it
- **THEN** the offer says such an опис will go to «Підписки»
