## MODIFIED Requirements

### Requirement: A rule maps merchant and/or MCC to one category

A rule SHALL hold a merchant criterion, or an MCC (an integer), or both, and exactly one target:
either one expense category that exists, or one destination рахунок that exists — a
правило-переказ — or one джерело that exists — a правило-джерело. A merchant criterion SHALL be
exactly one of a merchant pattern (non-empty text)
or a продавець that exists; a rule naming both a pattern and a продавець SHALL be rejected, and so
SHALL a rule naming a продавець that does not exist. A rule holding more than one of a category, a
destination рахунок and a джерело, or none of them, SHALL be rejected. A rule with neither
criterion SHALL be
rejected; a rule targeting a category, a рахунок or a джерело that does not exist SHALL be
rejected; «Без джерела» SHALL NOT be a правило-джерело's target, for the reason «Без категорії»
is not a category rule's: it is the absence of a джерело, the very gap the правило exists to fill.
A правило-джерело whose джерело is or becomes archived SHALL keep working, as a category rule
does. A джерело is archived, never deleted — the categories capability offers no deletion — so a
правило-джерело can never be left naming a джерело that is gone. An MCC
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

#### Scenario: A правило-джерело is stored

- **WHEN** the owner creates the rule "зарахування зарплати → Зарплата" naming the джерело «Зарплата»
- **THEN** the rule exists with merchant pattern "зарахування зарплати", the джерело «Зарплата»,
  and no category and no destination рахунок

#### Scenario: A rule naming a category and a джерело is rejected

- **WHEN** a rule is created targeting Groceries and the джерело «Зарплата» at once
- **THEN** creation is rejected and nothing is stored

#### Scenario: «Без джерела» is rejected as a rule's target

- **WHEN** a rule is created naming the джерело «Без джерела»
- **THEN** creation is rejected and nothing is stored

#### Scenario: A правило-джерело keeps matching into an archived джерело

- **WHEN** the правило-джерело "відсотки → Відсотки" exists and the джерело «Відсотки» is archived
- **THEN** matching money arriving with the description "Відсотки 12.50 UAH" still returns «Відсотки»

#### Scenario: A правило-джерело to an unknown джерело is rejected

- **WHEN** a rule is created whose джерело id does not exist
- **THEN** creation is rejected and nothing is stored

### Requirement: Rules can be created, edited and deleted

The owner SHALL be able to create a rule, change its merchant criterion — a merchant pattern or a
продавець, either switched for the other — its MCC or its target — a category, a destination
рахунок or a джерело, any switched for another — and delete it. Creating or editing one
SHALL recategorise the stored витрати in «Без категорії» that the правила now match, as "A stored
правило recategorises the «Без категорії» витрати it matches" requires, and SHALL give the stored
доходи «Без джерела» that the правила-джерела now match their джерело, as "A stored правило-джерело
gives the доходи «Без джерела» it matches their джерело" requires; deleting one SHALL NOT
change any stored транзакція, and a витрата a deleted rule had categorised SHALL keep the категорія
it was given, as a переказ it made SHALL stay a переказ and a дохід it gave a джерело SHALL keep
that джерело.

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

#### Scenario: A rule switched from a category to a джерело

- **WHEN** the owner changes the rule "відсотки → Groceries" to name the джерело «Відсотки» while a дохід
  «Без джерела» of 1250 minor units UAH carrying "Відсотки за вересень" is stored
- **THEN** the same rule names «Відсотки» and no category, and that дохід carries «Відсотки»

#### Scenario: A deleted правило-джерело leaves its доходи as they are

- **WHEN** the правило-джерело "відсотки → Відсотки" gave a дохід «Відсотки» and is then deleted
- **THEN** the rule no longer exists and that дохід still carries «Відсотки»

### Requirement: Matching is deterministic and most-specific-first

Given a transaction's merchant description, when present its MCC, whether the money leaves or
arrives, and the рахунок the money left or arrived at,
the system SHALL return the target of the best-matching rule — a category, a переказ to a
destination рахунок, or a джерело — or nothing when no rule matches. A merchant
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

Matching SHALL know which way the money moves. For money leaving a рахунок, only the rules naming a
category and the правила-перекази take part, and a правило-джерело SHALL take no part at all. For
money arriving — a дохід whose джерело is being decided — only the правила-джерела take part,
ranked among themselves on this same ladder, and a rule naming a category or a правило-переказ
SHALL take no part at all; the шаблон категоризації is never consulted for money arriving. A
правило-джерело therefore never competes with a rule of another kind, and adding one changes no
match for money leaving.

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

#### Scenario: Arriving money is matched by правила-джерела alone

- **WHEN** the rules "відсотки → Groceries" and "відсотки → джерело Відсотки" exist, and money arrives with
  the description "Відсотки за вересень"
- **THEN** matching returns the джерело «Відсотки»

#### Scenario: Leaving money ignores правила-джерела

- **WHEN** the rules "відсотки → Groceries" and, created later and longer, "відсотки за → джерело Відсотки"
  exist, and money leaves a card with the description "Відсотки за підписку"
- **THEN** matching returns Groceries

#### Scenario: The longest правило-джерело wins

- **WHEN** the rules "зарплата → джерело Зарплата" and "зарплата аванс → джерело Аванс" exist and
  money arrives with the description "Зарплата аванс жовтень"
- **THEN** matching returns the джерело «Аванс»

### Requirement: A правило is proposed from a транзакція that carries an опис

When a категорія is set on a stored витрата or повернення that carries an опис, the system SHALL
offer to remember the decision as a правило whose target is the категорія just set. When a stored
витрата that carries an опис is retyped into a переказ, the system SHALL likewise offer to remember
it as a правило-переказ whose destination is the рахунок the money was just said to arrive at.
When a джерело is set on a stored дохід that carries an опис, the system SHALL likewise offer to
remember it as a правило-джерело whose target is the джерело just set. The
offer SHALL arrive with a merchant criterion already proposed from that опис, SHALL let the owner
change it before it is stored, and SHALL store nothing unless the owner accepts it.
Declining SHALL leave no правило. The offer SHALL be made only when a категорія or a джерело is
actually set or a витрата actually becomes a переказ, so merely opening a транзакція again — or
editing any other field of it, or editing a переказ that was already one — SHALL offer nothing.

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
правило would never match it. For a джерело, the offer SHALL NOT be made when the owner's
правила-джерела already give that опис the джерело being set, nor when the джерело being set is
«Без джерела».

A дохід whose folded опис begins with «від:» is a payment from a person, and the leading name the
merchants capability proposes would name every person who ever paid. For such a дохід the proposed
pattern SHALL be the whole опис, folded and trimmed, so the правило-джерело offered names that one
sender; the owner may still edit it before accepting.

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

#### Scenario: Setting a джерело on a дохід offers the правило-джерело

- **WHEN** a дохід of 5000000 minor units UAH carrying the опис "Зарахування зарплати", recognised
  as no продавець, is given the джерело «Зарплата» and no правило-джерело matches that опис
- **THEN** a правило-джерело is offered with the merchant pattern the merchants capability proposes
  from that опис and the джерело «Зарплата», and no категорія

#### Scenario: Setting a джерело on a дохід offers nothing

- **WHEN** the правило-джерело "від: міхаіл кас'ян → Подарунки" exists and the джерело of a дохід
  carrying the опис "Від: Міхаіл Кас'ян" is changed to «Подарунки»
- **THEN** no правило is offered — the правило that would be written already exists

#### Scenario: A payment from a person proposes that person alone

- **WHEN** a дохід of 96000 minor units UAH carrying the опис "Від: Міхаіл Кас'ян" is given the
  джерело «Подарунки» and no правило-джерело matches it
- **THEN** a правило-джерело is offered with the merchant pattern "від: міхаіл кас'ян" and the
  джерело «Подарунки»

#### Scenario: A джерело an existing правило-джерело already gives offers nothing

- **WHEN** the правило-джерело "відсотки → Відсотки" exists and a дохід carrying the опис "Відсотки за
  вересень" is given «Відсотки»
- **THEN** no правило is offered

#### Scenario: A дохід put back into «Без джерела» offers nothing

- **WHEN** a дохід carrying the опис "Відсотки за вересень" is put back into «Без джерела»
- **THEN** no правило is offered and no refusal is shown

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
дохід SHALL be untouched except the зустрічний дохід a new переказ absorbs and a дохід «Без
джерела» that the same pass gives its джерело, as "A stored правило-джерело gives the доходи «Без
джерела» it matches their джерело" requires. Every field of a moved
витрата other than its категорія SHALL be unchanged, its опис and its MCC included.

The категорія or переказ a swept витрата lands on SHALL be the one the whole set of правила — and,
when none of them matches, the шаблон — gives its опис and MCC on its рахунок, not the target of the
правило just written: a правило more specific than
the new one keeps the last word, exactly as it would at import. Deleting a правило SHALL move
nothing: a витрата already carrying a категорія is no longer a gap, and moving it back into «Без
категорії» would throw away a classification the owner is reading.

Each pass SHALL be recorded in the журнал as one operation carrying how many витрати it examined,
how many it moved onto a категорія, how many it turned into перекази, how many зустрічні доходи
those absorbed, how many доходи «Без джерела» it examined and how many of them it gave a джерело,
and nothing else — the журнал holds no опис, no сума, no назва and no MCC. The counts examined
SHALL be the «Без категорії» витрати and the «Без джерела» доходи the pass considered, not every
транзакція stored.

A pass that moved anything SHALL say so where it was triggered, naming how many витрати it
recategorised, how many it turned into перекази and how many доходи it gave a джерело. The owner chose that this happens without being
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

#### Scenario: The owner is told how many доходи were given a джерело

- **WHEN** storing the правило-джерело "відсотки → Відсотки" gives five stored доходи «Без джерела» the
  джерело «Відсотки» and moves no витрата
- **THEN** the screen that stored it says five доходи were given a джерело and says nothing of
  витрати

#### Scenario: A pass that moved nothing says nothing

- **WHEN** storing a правило moves no витрата
- **THEN** nothing about a розбір is said

#### Scenario: The pass is in the журнал as counts alone

- **WHEN** a правило is stored and moves two of forty stored «Без категорії» витрати onto a
  категорія and turns one into a переказ that absorbs one дохід, while nine доходи «Без джерела»
  are stored and no правило-джерело matches any of them
- **THEN** the журнал holds one operation for that pass carrying the counts forty, two, one, one,
  nine and zero, and no опис, сума, назва or MCC

### Requirement: The offer to remember a правило says what that правило will do

The offer to remember a правило SHALL describe the target it would store: for a категорія, that
such an опис will go to that категорія; for a правило-переказ, that such an опис will become a
переказ to that рахунок; for a правило-джерело, that money arriving with such an опис will get that
джерело. It SHALL NOT speak of a категорія when it offers a переказ or a джерело.

#### Scenario: A правило-переказ is offered as a переказ

- **WHEN** the owner retypes a витрата carrying the опис "Double tap" into a переказ to «РЕЗЕРВ» and
  the app offers to remember it
- **THEN** the offer says such an опис will become a переказ to «РЕЗЕРВ», and says nothing about a
  категорія

#### Scenario: A категорія правило is offered as a категорія

- **WHEN** the owner categorises a витрата carrying the опис "Megogo" as «Підписки» and the app
  offers to remember it
- **THEN** the offer says such an опис will go to «Підписки»

#### Scenario: A правило-джерело is offered as a джерело

- **WHEN** the owner gives a дохід carrying the опис "Відсотки 12.50 UAH" the джерело «Відсотки» and the
  app offers to remember it
- **THEN** the offer says money arriving with such an опис will get the джерело «Відсотки», and says
  nothing about a категорія

## ADDED Requirements

### Requirement: A правило-джерело gives a джерело only to arriving money that has none

At the moment a дохід is recorded or imported, a правило-джерело SHALL be applied only where an
import would otherwise store it with «Без джерела»: to a monobank statement item that becomes a
дохід, as the monobank-sync capability defines, and to a дохід-чернетка at its confirmation, as the
bank-notifications capability defines. Afterwards, every розбір SHALL reach every stored дохід
carrying «Без джерела», whatever put it there — an import, a confirmed чернетка, a retype, a Saldo
row or a restored бекап — exactly as the розбір of «Без категорії» reaches every stored витрата
whatever its source: no транзакція records which door it came through, and the gap is the same
gap. It SHALL be matched
on the опис, or a чернетка's text, recognised against the продавці as they are stored at that
moment, and on the MCC when one is carried, exactly as the matching requirement ranks правила-джерела
among themselves.

At the moment of recording it SHALL NOT be applied to a дохід recorded by hand or to a дохід the
Saldo import stores — each arrives with the джерело its source named — and it SHALL never be applied
to a дохід whose джерело is anything but «Без джерела», or to a витрата, a повернення, a переказ or
a коригування. It SHALL give a джерело and nothing else: it never retypes a дохід into a повернення
or a переказ, and a дохід it gave a джерело is a дохід with a джерело the owner chose, through the
правило they wrote — so it is no longer a зустрічний дохід a later переказ may absorb.

#### Scenario: A дохід recorded by hand is not touched

- **WHEN** the правило-джерело "зарплата → Зарплата" exists and the owner records by hand a дохід of
  3000000 minor units UAH with the джерело «Фриланс» and the опис "зарплата за проєкт"
- **THEN** the дохід carries «Фриланс»

#### Scenario: The розбір reaches a дохід «Без джерела» whatever stored it

- **WHEN** a дохід «Без джерела» of 1250 minor units UAH carrying "Відсотки 12.50 UAH" was confirmed
  from a чернетка before any правило-джерело existed, another of 800 carrying "Відсотки 8.00 UAH" came
  with a restored бекап, and the правило-джерело "відсотки → Відсотки" is created
- **THEN** both доходи carry «Відсотки»

#### Scenario: An MCC-only правило-джерело sources a statement item that carries the MCC

- **WHEN** the only правило-джерело is "MCC 4829 → Перекази від людей" and a statement item of amount
  +20000 with description "Від: Олена П." and MCC 4829 is mapped
- **THEN** the result is a дохід of 20000 minor units with the джерело «Перекази від людей»

#### Scenario: A джерело the owner chose is never replaced

- **WHEN** a дохід carrying the опис "Відсотки 12.50 UAH" carries «Подарунки» and the правило-джерело
  "відсотки → Відсотки" is created
- **THEN** that дохід still carries «Подарунки»

#### Scenario: A правило-джерело naming a продавець follows recognition

- **WHEN** «Monobank» holds the написання "monobank", the правило-джерело "Monobank → Відсотки"
  names it, and a statement item of amount +1234 with description "Monobank відсотки на залишок"
  is mapped
- **THEN** the result is a дохід of 1234 minor units with the джерело «Відсотки»

#### Scenario: A sourced дохід is not absorbed later

- **WHEN** a дохід of 616 minor units UAH on РЕЗЕРВ dated 2026-09-12 was given «Подарунки» by a
  правило-джерело, and the owner then retypes a витрата of 616 minor units UAH on platinum of the
  same date into a переказ onto РЕЗЕРВ
- **THEN** the дохід stays a дохід «Подарунки» and the переказ awaits its зустрічний дохід

### Requirement: A stored правило-джерело gives the доходи «Без джерела» it matches their джерело

Every розбір — storing a правило of any kind, newly created or edited, and every other trigger the
розбір of «Без категорії» витрати has — SHALL also give every stored дохід carrying «Без джерела»
that the правила-джерела now match the джерело of the best matching one, at once and without
asking. It SHALL be complete: after it, no дохід «Без джерела» is matched by a правило-джерело. It
SHALL change nothing of such a дохід but its джерело — its сума, currency, дата, рахунок, опис and
MCC stay — and SHALL touch no дохід carrying any other джерело. Within one pass the витрати are
swept first, so every зустрічний дохід a new переказ absorbs is absorbed before any дохід is
sourced, and a дохід that pass absorbed is never given a джерело. The джерело given SHALL be the one
the whole set of правила-джерела gives, not the target of the правило just written. Deleting a
правило-джерело SHALL change no дохід.

#### Scenario: A new правило-джерело answers the доходи already waiting

- **WHEN** three доходи «Без джерела» carrying "Відсотки 12.50 UAH", "Відсотки 8.00 UAH" and "Від:
  Міхаіл Кас'ян" are stored and the правило-джерело "відсотки → Відсотки" is created
- **THEN** the two відсотки доходи carry «Відсотки», the third still carries «Без джерела», and the
  сума, дата, рахунок and опис of all three are unchanged

#### Scenario: A more specific правило-джерело keeps the last word

- **WHEN** the правило-джерело "зарплата аванс → Аванс" exists, a дохід «Без джерела» carrying
  "Зарплата аванс жовтень" is stored, and the правило-джерело "зарплата → Зарплата" is created
- **THEN** that дохід carries «Аванс»

#### Scenario: A naming of a продавець reaches the доходи too

- **WHEN** the правило-джерело "Monobank → Відсотки" names «Monobank», a дохід «Без джерела»
  carrying "MONO BANK відсотки" is stored, and the owner adds the написання "mono bank" to «Monobank»
- **THEN** that дохід carries «Відсотки»

#### Scenario: Absorption comes before sourcing in one pass

- **WHEN** the продавець «Резерв» holds only the написання "резерв скарбничка", the правило-переказ
  "Резерв → переказ на РЕЗЕРВ" and the правило-джерело "Резерв → Подарунки" both name it, a витрата
  of 479 minor units UAH on platinum carrying "Округлення балансу «Резерв»" dated 2026-09-13 sits in
  «Без категорії», a дохід «Без джерела» of 479 minor units UAH on РЕЗЕРВ carrying "Поповнення
  «Резерв»" of the same date is stored, and the owner adds the написання "резерв" to «Резерв» — so
  one розбір finds both matches at once
- **THEN** the витрата is a переказ onto РЕЗЕРВ that absorbed the дохід, and no дохід «Подарунки»
  exists

#### Scenario: A category правило moves no дохід

- **WHEN** a дохід «Без джерела» carrying "АТБ повернення коштів" is stored and the правило "атб →
  Groceries" is created
- **THEN** that дохід still carries «Без джерела» and no категорія

