# categorisation-rules Specification

## Purpose
The owner's stored автокатегоризація rules — "merchant / MCC → category" — and the deterministic
matching every source of a витрата runs it through before anything falls back to «Без
категорії»: the three import sources (Saldo CSV, monobank, bank notifications) and the manual
entry form alike. Storing a rule, newly created or edited, also sweeps the stored «Без категорії»
витрати it now matches, so a rule works on the pile the owner already has, not only forward.

## Requirements

### Requirement: A rule maps merchant and/or MCC to one category

A rule SHALL hold a merchant criterion, or an MCC (an integer), or both, and exactly one target:
either one expense category that exists, or one destination рахунок that exists — a
правило-переказ. A merchant criterion SHALL be exactly one of a merchant pattern (non-empty text)
or a продавець that exists; a rule naming both a pattern and a продавець SHALL be rejected, and so
SHALL a rule naming a продавець that does not exist. A rule holding both a category and a
destination рахунок, or neither, SHALL be rejected. A rule with neither criterion SHALL be
rejected; a rule targeting a category or a рахунок that does not exist SHALL be rejected; an MCC
that is not a whole number SHALL be rejected, since matching compares it for equality against the
integer the bank sends and anything else is a rule that can never fire. «Коригування» SHALL NOT be
a rule's target:
it is carried only by коригування the app itself creates, so aiming an imported витрата at it
would label one transaction type as another. «Без категорії» SHALL NOT be a rule's target either:
it is the absence of a категорія, not one, and a rule aiming at it would pin a merchant to the very
gap the rules exist to fill — outranking shorter rules that name a real категорія, and surviving
every розбір because a витрата it "moved" never left «Без категорії». A rule whose target category
is or becomes archived SHALL keep working — archiving hides a category from pickers, not from
rules; the owner retargets or deletes the rule in Налаштування if that is not what they want. A
правило-переказ whose destination рахунок is or becomes archived SHALL keep working for the same
reason.

#### Scenario: A merchant-only rule is stored

- **WHEN** the owner creates the rule "сільпо → Groceries"
- **THEN** the rule exists with merchant pattern "сільпо" and target Groceries

#### Scenario: A rule naming a продавець is stored

- **WHEN** the продавець «АТБ» exists and the owner creates the rule "АТБ → Groceries" naming it
- **THEN** the rule exists naming the продавець «АТБ», with no merchant pattern and the target
  Groceries

#### Scenario: A rule naming both a pattern and a продавець is rejected

- **WHEN** a rule is created with the merchant pattern "атб" and the продавець «АТБ» at once
- **THEN** creation is rejected and nothing is stored

#### Scenario: A rule naming an unknown продавець is rejected

- **WHEN** a rule is created naming a продавець id that does not exist
- **THEN** creation is rejected and nothing is stored

#### Scenario: A правило-переказ is stored

- **WHEN** the owner creates the rule "округлення балансу → переказ на РЕЗЕРВ"
- **THEN** the rule exists with merchant pattern "округлення балансу", the destination рахунок
  РЕЗЕРВ and no target category

#### Scenario: A rule naming both a category and a рахунок is rejected

- **WHEN** a rule is created targeting Groceries and the destination рахунок РЕЗЕРВ at once
- **THEN** creation is rejected and nothing is stored

#### Scenario: A правило-переказ to an unknown рахунок is rejected

- **WHEN** a rule is created whose destination рахунок id does not exist
- **THEN** creation is rejected and nothing is stored

#### Scenario: A rule with no criterion is rejected

- **WHEN** the owner submits a rule with neither a merchant pattern, nor a продавець, nor an MCC
- **THEN** creation is rejected and nothing is stored

#### Scenario: A rule targeting an unknown category is rejected

- **WHEN** a rule is created targeting a category id that does not exist
- **THEN** creation is rejected and nothing is stored

#### Scenario: An MCC that is not a whole number is rejected

- **WHEN** the owner submits a rule whose MCC reads "54.11"
- **THEN** creation is rejected and nothing is stored

#### Scenario: «Коригування» is rejected as a rule's target

- **WHEN** a rule is created targeting the reserved correction category
- **THEN** creation is rejected and nothing is stored

#### Scenario: A rule keeps matching into an archived category

- **WHEN** the rule "сільпо → Groceries" exists and Groceries is archived
- **THEN** matching a description containing "сільпо" still returns Groceries

#### Scenario: A правило-переказ keeps matching into an archived рахунок

- **WHEN** the rule "округлення балансу → переказ на РЕЗЕРВ" exists and РЕЗЕРВ is archived
- **THEN** matching the description "Округлення балансу «Резерв»" on a UAH card still returns the
  переказ на РЕЗЕРВ

#### Scenario: «Без категорії» is rejected as a rule's target

- **WHEN** a rule is created targeting «Без категорії»
- **THEN** creation is rejected and nothing is stored

### Requirement: Rules can be created, edited and deleted

The owner SHALL be able to create a rule, change its merchant criterion — a merchant pattern or a
продавець, either switched for the other — its MCC or its target — a category or a destination
рахунок, either switched for the other — and delete it. Creating or editing one
SHALL recategorise the stored витрати in «Без категорії» that the правила now match, as "A stored
правило recategorises the «Без категорії» витрати it matches" requires; deleting one SHALL NOT
change any stored транзакція, and a витрата a deleted rule had categorised SHALL keep the категорія
it was given, as a переказ it made SHALL stay a переказ.

#### Scenario: An edited rule carries its new target

- **WHEN** the owner changes the rule "сільпо → Groceries" to target Eating out
- **THEN** the same rule now targets Eating out

#### Scenario: A rule retargeted to a переказ runs the розбір

- **WHEN** the owner changes the rule "округлення балансу → Bills" to target a переказ onto РЕЗЕРВ
  while a «Без категорії» витрата on platinum carrying "Округлення балансу «Резерв»" is stored
- **THEN** the same rule now targets the переказ на РЕЗЕРВ, names no category, and that витрата is a
  переказ onto РЕЗЕРВ

#### Scenario: A rule switched from a pattern to a продавець

- **WHEN** the owner changes the rule "atb market → Groceries" to match by the продавець «АТБ»
- **THEN** the same rule names «АТБ», carries no pattern and still targets Groceries

#### Scenario: A deleted rule is gone and history stands

- **WHEN** a rule that earlier categorised an imported витрата into Groceries is deleted
- **THEN** the rule no longer exists and that витрата still carries Groceries

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

### Requirement: A stored правило recategorises the «Без категорії» витрати it matches

Storing a правило — newly created or edited — SHALL move every stored витрата in «Без категорії»
that the two tiers now match onto what they give it — the owner's правила first, the шаблон
категоризації only when no правило matches: onto the категорія, or — when the best правило is a
правило-переказ that matches it — into a переказ. This SHALL happen at once, without asking, and
SHALL be complete: after storing, no витрата in «Без категорії» is given a категорія or a переказ
by the правила or the шаблон on its рахунок. The same розбір SHALL also run when the owner changes
what a базова категорія points at, after every change to the продавці that the merchants
capability says is followed by one — naming, adding or removing a написання, merging and deleting
— because a правило naming a продавець matches whatever that продавець now recognises, and once
per шаблон version when the app opens, as the requirements on the шаблон say. A правило-переказ
that matches the опис of a
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

Matching SHALL run on the витрата's опис and on the MCC it carries when it carries one. An MCC is
kept only on a транзакція whose import named one — a monobank statement item — so a правило whose
only criterion is an MCC, and the MCC codes the шаблон carries, SHALL move only the витрати that
carry that MCC; a витрата carrying none, as every витрата recorded by hand, imported from Saldo,
confirmed from a bank сповіщення or imported before the MCC was kept does, SHALL be matched on its
опис alone, the same restriction a чернетка from a bank сповіщення already carries. A витрата
carrying neither an опис nor an MCC SHALL match nothing and SHALL stay where it is.

It SHALL touch nothing else. A витрата in any other категорія SHALL be left exactly as it is, a
повернення SHALL be left as it is whatever its категорія, and a переказ and a коригування SHALL be
untouched — «Коригування», «Комісія» and every категорія the owner chose are decisions, not gaps. A
дохід SHALL be untouched except the зустрічний дохід a new переказ absorbs. Every field of a moved
витрата other than its категорія SHALL be unchanged, its опис and its MCC included.

The категорія or переказ a swept витрата lands on SHALL be the one the whole set of правила — and,
when none of them matches, the шаблон — gives its опис and MCC on its рахунок, not the target of the
правило just written: a правило more specific than
the new one keeps the last word, exactly as it would at import. Deleting a правило SHALL move
nothing: a витрата already carrying a категорія is no longer a gap, and moving it back into «Без
категорії» would throw away a classification the owner is reading.

Each pass SHALL be recorded in the журнал as one operation carrying how many витрати it examined,
how many it moved onto a категорія, how many it turned into перекази and how many зустрічні доходи
those absorbed, and nothing else — the журнал holds no опис, no сума, no назва and no MCC. The count
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

- **WHEN** a витрата carrying the опис "НОВИЙ ЗАКЛАД 7" and no MCC, which no базова категорія
  matches, sits in «Без категорії» and the правило "MCC 5411 → Groceries" is created
- **THEN** that витрата still carries «Без категорії» — it carries no MCC to match

#### Scenario: An MCC-only правило moves the витрати carrying that MCC

- **WHEN** two витрати carrying the описи "НОВИЙ ЗАКЛАД 7" and "НОВИЙ ЗАКЛАД 8", which no базова
  категорія matches, sit in «Без категорії», the first carrying no MCC and the second MCC 7399, and
  the правило "MCC 7399 → Services" is created
- **THEN** the second carries Services and the first still carries «Без категорії»

#### Scenario: A правило naming a продавець sweeps every spelling

- **WHEN** «АТБ» holds "атб" and "atb", витрати carrying "АТБ 12" and "ATB MARKET" sit in «Без
  категорії» with «Продукти» switched off, and the правило "АТБ → Groceries" naming «АТБ» is
  created
- **THEN** both carry Groceries, and the owner is told two витрати were recategorised

#### Scenario: The шаблон fills what the new правило does not

- **WHEN** витрати carrying "АТБ 421" and "НОВИЙ ЗАКЛАД 7" sit in «Без категорії» with «Продукти»
  at its типова категорія, and the правило "новий заклад → Eating out" is created
- **THEN** the first carries Groceries and the second carries Eating out

#### Scenario: A витрата with no опис is not swept

- **WHEN** a витрата carrying no опис and no MCC sits in «Без категорії» and the правило "атб →
  Groceries" is created
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
  and no опис, сума, назва or MCC

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
  "АТБ 421", recognised as no продавець, is stored in Eating out, and the owner puts it into
  Groceries
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
two tiers give their опис and MCC, and every other транзакція is untouched. Like every розбір it
reads the MCC a витрата carries, so the шаблон's MCC codes move the витрати that carry one and
nothing else. It SHALL be recorded in the журнал as
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

#### Scenario: An MCC the new шаблон adds reaches the витрати carrying it

- **WHEN** an app update adds MCC 7399 to «Краса й догляд» and raises the шаблон's version, and the
  app is opened on a device holding two витрати in «Без категорії» whose описи nothing matches, one
  carrying MCC 7399 and one carrying no MCC
- **THEN** the first carries the категорія «Краса й догляд» lands in and the second still carries
  «Без категорії»

#### Scenario: A категорія the owner chose is still never taken away

- **WHEN** the first open under a new шаблон version finds a витрата in Eating out whose опис the
  шаблон matches into Groceries
- **THEN** that витрата still carries Eating out

### Requirement: A правило naming a продавець decides wherever a категорія is decided

Wherever a категорія is decided — the monobank sync, a чернетка from a bank сповіщення at drafting
and at confirmation, the entry form, and every розбір — the опис, or a чернетка's text, SHALL be
recognised against the продавці as they are stored at that moment, and a правило naming a продавець SHALL take part in
matching there exactly as the matching requirement ranks it. No place that decides a категорія
SHALL match the owner's правила without that recognition.

#### Scenario: The monobank sync honours a продавець

- **WHEN** «АТБ» holds "atb", the правило "АТБ → Eating out" names it, and a statement item of
  amount −8000 with description "ATB MARKET 23" is mapped
- **THEN** the result is a витрата of 8000 minor units in Eating out

#### Scenario: A чернетка auto-confirms by a продавець

- **WHEN** «АТБ» holds "atb", the правило "АТБ → Eating out" names it, and a money-out movement of
  12550 minor units UAH whose text holds "ATB MARKET" drafts on a watched UAH рахунок
- **THEN** a витрата of 12550 minor units UAH in Eating out exists at once and no чернетка awaits

#### Scenario: The entry form proposes by a продавець

- **WHEN** «АТБ» holds "atb", the правило "АТБ → Eating out" names it, and the owner types the
  опис "ATB 12" while recording a витрата with no категорія picked
- **THEN** Eating out is shown as the chosen категорія

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
