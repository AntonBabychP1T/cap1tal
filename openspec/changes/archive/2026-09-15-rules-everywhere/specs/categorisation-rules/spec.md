## ADDED Requirements

### Requirement: Правила decide the категорія of a витрата recorded by hand

A витрата being recorded by hand SHALL be offered the категорія the owner's правила give its
опис, matched exactly as an imported транзакція's is — the same patterns, the same ladder, and no
MCC, since nothing hand-typed carries one. The offer SHALL be visible as the chosen категорія
before the витрата is recorded, and SHALL be changeable: what the owner picks themselves SHALL
stand, and SHALL NOT be replaced by a правило afterwards, however the опис changes next. An опис
that no правило matches SHALL leave the категорія exactly where it was.

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

- **WHEN** no правило matches and the owner types the опис "новий заклад" while recording a
  витрата with no категорія picked
- **THEN** the категорія is still «Без категорії» and the витрата is stored in it

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
offer to remember the decision as a правило whose target is the категорія just set. The offer
SHALL arrive with a merchant pattern already proposed from that опис, SHALL let the owner change
that pattern before it is stored, and SHALL store nothing unless the owner accepts it. Declining
SHALL leave no правило. The offer SHALL be made only when a категорія is actually set, so merely
opening a транзакція again — or editing any other field of it — SHALL offer nothing.

The proposed pattern SHALL be the опис's leading run of letters, folded to lower case and trimmed,
cut to at most its first two words — the merchant's name before the branch number, the city and the
street the bank appends, so «СІЛЬПО 123 Київ, вул. Хрещатик» proposes «сільпо» and «Нова Пошта
відділення 5» proposes «нова пошта». Two words because merchant names arrive as one or two, and a
third word is almost always what the branch is named by. An опис whose first character is not a letter SHALL propose
the whole folded, trimmed опис instead, since there is no name to cut out of it. A транзакція
carrying no опис SHALL be offered nothing: there is no pattern to propose, and a правило with no
merchant and no MCC is rejected.

What is stored SHALL be what the pattern field holds when the owner accepts, validated exactly as
a правило typed in Налаштування is — a pattern emptied before accepting SHALL be refused with the
same words, and SHALL store nothing.

The offer SHALL NOT be made when the owner's правила already give that опис the категорія being
set — the правило that would be written already exists, under whatever pattern it carries. Nor SHALL
it be made when the категорія being set is «Без категорії»: that is not a категорія a правило may
target, so the only thing the offer could end in is a refusal.

#### Scenario: Categorising an imported витрата offers the правило

- **WHEN** a витрата carrying the опис "СІЛЬПО 123 Київ, вул. Хрещатик" is put into Groceries and
  no правило matches that опис
- **THEN** a правило is offered with the merchant pattern "сільпо" and the target Groceries

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

#### Scenario: A different категорія than the правила give is still offered

- **WHEN** the правило "сільпо → Groceries" exists and a витрата carrying the опис "СІЛЬПО 123" is
  put into Eating out
- **THEN** a правило is offered with the merchant pattern "сільпо" and the target Eating out

### Requirement: A stored правило recategorises the «Без категорії» витрати it matches

Storing a правило — newly created or edited — SHALL move every stored витрата in «Без категорії»
that the owner's правила now match onto the категорія those правила give it. This SHALL happen at
once, without asking, and SHALL be complete: after storing, no витрата in «Без категорії» matches
any правило.

A move onto «Без категорії» SHALL never be made, whatever the правила say. «Без категорії» is not
a target a правило may be created with, but a бекап written elsewhere could carry one, and a розбір
that "moved" a витрата from the gap into the gap would be a move that changes nothing while
outranking the правило that would have filled it.

Matching SHALL run on the витрата's опис with no MCC — a stored транзакція keeps no MCC, the
bank's code is not carried past import — so a правило whose only criterion is an MCC SHALL move
nothing, the same restriction a чернетка from a bank сповіщення already carries. A витрата carrying
no опис SHALL match nothing and SHALL stay where it is.

It SHALL touch nothing else. A витрата in any other категорія SHALL be left exactly as it is, a
повернення SHALL be left as it is whatever its категорія, and a дохід, a переказ and a коригування
SHALL be untouched — «Коригування», «Комісія» and every категорія the owner chose are decisions,
not gaps. Every field of a moved витрата other than its категорія SHALL be unchanged, its опис
included.

The категорія a swept витрата lands on SHALL be the one the whole set of правила gives its опис,
not the target of the правило just written: a правило more specific than the new one keeps the
last word, exactly as it would at import. Deleting a правило SHALL move nothing: a витрата already
carrying a категорія is no longer a gap, and moving it back into «Без категорії» would throw away
a classification the owner is reading.

Each pass SHALL be recorded in the журнал as one operation carrying how many витрати it examined
and how many it moved, and nothing else — the журнал holds no опис, no сума and no назва. The
count examined SHALL be the «Без категорії» витрати the pass considered, not every транзакція
stored.

A pass that moved anything SHALL say so where it was triggered, naming how many витрати it
recategorised. The owner chose that this happens without being asked; being told afterwards is what
keeps a правило written too broadly findable — the витрати it moved no longer carry the «Без
категорії» mark, and the журнал holds counts and nothing that could lead back to them. A pass that
moved nothing SHALL say nothing.

#### Scenario: A new правило clears the matching витрати out of «Без категорії»

- **WHEN** three витрати carrying описи "АТБ 421", "АТБ 12" and "НОВИЙ ЗАКЛАД" are stored in «Без
  категорії» and the правило "атб → Groceries" is created
- **THEN** the two "АТБ" витрати carry Groceries, the third still carries «Без категорії», and the
  сума, дата, рахунок and опис of all three are unchanged

#### Scenario: A категорія the owner chose is never taken away

- **WHEN** a витрата carrying the опис "АТБ 421" is stored in Eating out and the правило "атб →
  Groceries" is created
- **THEN** that витрата still carries Eating out

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

- **WHEN** a витрата carrying the опис "АТБ 421" sits in «Без категорії» and the правило
  "MCC 5411 → Groceries" is created
- **THEN** that витрата still carries «Без категорії»

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

- **WHEN** storing a правило moves eleven витрати out of «Без категорії»
- **THEN** the screen that stored it says eleven витрати were recategorised

#### Scenario: A pass that moved nothing says nothing

- **WHEN** storing a правило moves no витрата
- **THEN** nothing about a розбір is said

#### Scenario: The pass is in the журнал as counts alone

- **WHEN** a правило is stored and moves two of forty stored «Без категорії» витрати
- **THEN** the журнал holds one operation for that pass carrying the counts forty and two, and no
  опис, сума or назва

## MODIFIED Requirements

### Requirement: A rule maps merchant and/or MCC to one category

A rule SHALL hold a merchant pattern (non-empty text), or an MCC (an integer), or both, and
exactly one target expense category that exists. A rule with neither criterion SHALL be rejected;
a rule targeting a category that does not exist SHALL be rejected; an MCC that is not a whole
number SHALL be rejected, since matching compares it for equality against the integer the bank
sends and anything else is a rule that can never fire. «Коригування» SHALL NOT be a rule's target:
it is carried only by коригування the app itself creates, so aiming an imported витрата at it
would label one transaction type as another. «Без категорії» SHALL NOT be a rule's target either:
it is the absence of a категорія, not one, and a rule aiming at it would pin a merchant to the very
gap the rules exist to fill — outranking shorter rules that name a real категорія, and surviving
every розбір because a витрата it "moved" never left «Без категорії». A rule whose target category
is or becomes archived SHALL keep working — archiving hides a category from pickers, not from
rules; the owner retargets or deletes the rule in Налаштування if that is not what they want.

#### Scenario: A merchant-only rule is stored

- **WHEN** the owner creates the rule "сільпо → Groceries"
- **THEN** the rule exists with merchant pattern "сільпо" and target Groceries

#### Scenario: A rule with no criterion is rejected

- **WHEN** the owner submits a rule with neither a merchant pattern nor an MCC
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

#### Scenario: «Без категорії» is rejected as a rule's target

- **WHEN** a rule is created targeting «Без категорії»
- **THEN** creation is rejected and nothing is stored

#### Scenario: A rule keeps matching into an archived category

- **WHEN** the rule "сільпо → Groceries" exists and Groceries is archived
- **THEN** matching a description containing "сільпо" still returns Groceries

### Requirement: Rules can be created, edited and deleted

The owner SHALL be able to create a rule, change its merchant pattern, MCC or target category,
and delete it. Creating or editing one SHALL recategorise the stored витрати in «Без категорії»
that the правила now match, as "A stored правило recategorises the «Без категорії» витрати it
matches" requires; deleting one SHALL NOT change any stored транзакція, and a витрата a deleted
rule had categorised SHALL keep the категорія it was given.

#### Scenario: An edited rule carries its new target

- **WHEN** the owner changes the rule "сільпо → Groceries" to target Eating out
- **THEN** the same rule now targets Eating out

#### Scenario: A deleted rule is gone and history stands

- **WHEN** a rule that earlier categorised an imported витрата into Groceries is deleted
- **THEN** the rule no longer exists and that витрата still carries Groceries
