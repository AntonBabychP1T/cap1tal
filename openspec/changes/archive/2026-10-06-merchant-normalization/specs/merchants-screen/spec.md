## Purpose

Where the owner looks after their продавці: the «Продавці» section with the описи still nameless,
the list of продавці and each продавець's own screen, and the one naming form every way in opens,
so the most frequent spellings get one назва in a few taps.

## ADDED Requirements

### Requirement: «Без продавця» leads with the описи that matter most

The «Продавці» section SHALL open with «Без продавця». It groups every stored витрата and повернення
that carries an опис recognised as no продавець by the написання the proposal gives that опис, and
lists the groups:

- the group holding the most транзакції first; a tie goes to the group whose latest транзакція is
  the most recent;
- each with the опис of its latest транзакція as stored, and how many транзакції the group holds;
- each with «Назвати»;
- the first twenty groups, saying how many more there are when there are more.

When every such опис is recognised, «Без продавця» SHALL say so in one line instead of listing
nothing. A дохід, a переказ and a коригування SHALL NOT be listed: the list is about who the owner
paid.

#### Scenario: Branch spellings of one shop are one row

- **WHEN** «Без категорії» and other категорії hold seven витрати carrying "АТБ-Маркет 1234", five
  carrying "АТБ-Маркет 5678" and four carrying "Uklon *trip", and no продавець exists
- **THEN** «Без продавця» lists first one row for "атб" holding twelve транзакції with the latest
  of those описи, then one row for "uklon" holding four, each with «Назвати»

#### Scenario: Only twenty rows, and the rest is counted

- **WHEN** twenty-three groups of unrecognised описи exist
- **THEN** «Без продавця» lists twenty of them and says three more exist

#### Scenario: Everything recognised

- **WHEN** every stored витрата and повернення carrying an опис has a продавець
- **THEN** «Без продавця» says in one line that every опис is recognised

#### Scenario: A дохід is not a nameless продавець

- **WHEN** the only unrecognised опис is "Зарахування зарплати" on a дохід
- **THEN** «Без продавця» lists nothing for it

### Requirement: One naming form names a продавець from an опис

«Назвати» on a «Без продавця» row, and «Назвати продавця» on a транзакція, SHALL open the same form.
The form shows the опис it names from and a proposed назва and написання, both editable: the
proposal the merchants capability makes from that опис, unless the form is opened holding another
proposal for it. Whatever it holds, what is stored is validated the same way. It SHALL offer two actions:

- «Зберегти», which stores a new продавець;
- «Додати до наявного», which picks a продавець that already exists and adds the написання to it.
  The picker is a short list with the full list behind a search, as every picker in the app is.

A refusal SHALL be said in Ukrainian beside the field it concerns, and SHALL store nothing:

- a blank назва;
- a назва another продавець already has: the refusal SHALL name that продавець and offer adding
  the написання to it instead;
- a blank написання;
- a написання another продавець holds: the refusal SHALL name that продавець;
- a написання that does not occur in the опис.

Once stored, the form SHALL close. Where the розбір that follows moved any витрати, it SHALL say
how many were recategorised and how many became перекази, as storing a правило does.

#### Scenario: Naming from «Без продавця»

- **WHEN** the owner taps «Назвати» on the row for "атб", keeps the proposed «АТБ» and "атб", and
  taps «Зберегти»
- **THEN** «АТБ» exists, the row for "атб" is gone from «Без продавця», and the twelve транзакції
  have the продавець «АТБ»

#### Scenario: Adding a spelling to a продавець that exists

- **WHEN** «АТБ» exists, the owner opens the form for "ATB MARKET 23", changes the написання to
  "atb market", taps «Додати до наявного» and picks «АТБ»
- **THEN** «АТБ» holds "atb market" too and no new продавець exists

#### Scenario: A назва that is taken offers the продавець that holds it

- **WHEN** «АТБ» exists and the owner submits the form with the назва "атб"
- **THEN** nothing is stored, and the form says «АТБ» already exists and offers adding the
  написання to it

#### Scenario: A написання outside the опис is refused in words

- **WHEN** the form for "ATB MARKET 23" is submitted with the написання "атб"
- **THEN** nothing is stored and the form says, in Ukrainian, that the написання must be part of the
  опис

#### Scenario: The розбір is reported

- **WHEN** the правило "АТБ → Groceries" names «АТБ», «Продукти» is switched off, and adding "atb
  market" to it moves two витрати out of «Без категорії»
- **THEN** after the form closes the owner is told two витрати were recategorised

### Requirement: The section lists the owner's продавці

Below «Без продавця», the section SHALL list every продавець with its назва and how many stored
транзакції are recognised as it, ordered by назва with letter case folded. Tapping one SHALL open
that продавець's screen. With no продавець stored, the list SHALL say that none is named yet,
pointing at «Без продавця».

#### Scenario: The list counts what each продавець recognises

- **WHEN** «АТБ» recognises twelve транзакції and «Uklon» recognises four
- **THEN** the list shows «АТБ» with 12 and «Uklon» with 4, «АТБ» first

#### Scenario: No продавець yet

- **WHEN** no продавець is stored
- **THEN** the list says no продавець is named yet and points at «Без продавця»

### Requirement: A продавець's screen manages it

A продавець's screen SHALL show its назва and every написання it holds, and SHALL offer:

- renaming it;
- adding a написання, and removing one while more than one is held. With one написання left,
  removing it SHALL NOT be offered;
- «Обʼєднати з…», which picks another продавець, names both and what moves before it is confirmed,
  and leaves the owner on the remaining продавець's screen;
- «Видалити», confirmed first. While правила name the продавець, it SHALL say how many правила do
  instead of deleting, and SHALL lead to «Правила»;
- «Транзакції», which opens «Транзакції» narrowed to this продавець.

Every refusal SHALL be said in Ukrainian beside the field it concerns. A change that is followed by
a розбір that moved anything SHALL say how many витрати were recategorised, as the naming form
does.

#### Scenario: Renaming

- **WHEN** the owner renames «ATB Market» to «АТБ» on its screen
- **THEN** the screen and the list show «АТБ» with the same написання

#### Scenario: The last написання offers no removal

- **WHEN** the owner opens «Зерно», which holds only "зерно"
- **THEN** no removal is offered for "зерно"

#### Scenario: Merging names both before it happens

- **WHEN** the owner picks «Обʼєднати з…» on «ATB Market» and chooses «АТБ»
- **THEN** a confirmation names «ATB Market», «АТБ» and the написання and правила that move, and
  after confirming the owner is on «АТБ»'s screen holding both sets of написання

#### Scenario: Deleting a продавець that правила name leads to them

- **WHEN** «АТБ» is named by two правила and the owner taps «Видалити»
- **THEN** nothing is deleted, the screen says two правила name «АТБ», and it offers to open
  «Правила»

#### Scenario: The продавець's транзакції

- **WHEN** the owner taps «Транзакції» on «АТБ»
- **THEN** «Транзакції» opens narrowed to «АТБ»
