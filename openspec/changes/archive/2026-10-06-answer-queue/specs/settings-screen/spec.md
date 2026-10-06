## MODIFIED Requirements

### Requirement: The Правила section manages the rules

The «Правила» section SHALL list every rule as its merchant criterion — the merchant pattern, or
«продавець» and the продавець's назва — and/or MCC with its target: the
target category's name, «переказ на» and the destination рахунок's назва for a правило-переказ, or
«джерело» and the джерело's назва for a правило-джерело.
It SHALL offer creating, editing and deleting rules per the categorisation-rules capability. The
rule form SHALL let the owner choose what the rule matches by — a pattern typed by hand, or a
продавець picked from the продавці, the picker being a short list with the full list behind a
search — and SHALL drop the choice made for the other when this is switched, so a rule is never
submitted naming both. The rule form SHALL let the owner choose what the rule targets — a
категорія, a переказ on to a
рахунок, or a джерело for money arriving — and SHALL then offer the matching picker: unarchived
категорії for the first, unarchived рахунки for the second, unarchived джерела other than «Без
джерела» for the third. Switching what the rule targets SHALL drop the choice made for the others,
so a rule is never submitted naming two. With no продавець stored, the form SHALL still offer the
pattern and SHALL say that продавці are named in «Продавці».

#### Scenario: A created rule appears in the list

- **WHEN** the owner creates the rule "сільпо → Groceries"
- **THEN** the «Правила» section lists it with its pattern and the category name Groceries

#### Scenario: A rule naming a продавець appears in the list

- **WHEN** the owner creates a rule matching by the продавець «АТБ» and targeting Groceries
- **THEN** the «Правила» section lists it as «продавець АТБ» with the category name Groceries

#### Scenario: Switching the criterion drops the other choice

- **WHEN** the owner types the pattern "атб" in the rule form, switches to a продавець, picks «АТБ»,
  picks Groceries and saves
- **THEN** the stored rule names the продавець «АТБ» and carries no pattern

#### Scenario: A правило-переказ appears in the list

- **WHEN** the owner creates a rule with the pattern "округлення балансу" targeting a переказ on to
  РЕЗЕРВ
- **THEN** the «Правила» section lists it with its pattern and «переказ на РЕЗЕРВ»

#### Scenario: Switching the target drops the other choice

- **WHEN** the owner picks Groceries in the rule form, switches the target to a переказ, picks
  РЕЗЕРВ and saves
- **THEN** the stored rule targets the переказ на РЕЗЕРВ and names no category

#### Scenario: A deleted rule leaves the list

- **WHEN** the owner deletes that rule and confirms
- **THEN** the «Правила» section no longer lists it

#### Scenario: A правило-джерело appears in the list

- **WHEN** the owner creates a rule with the pattern "зарахування зарплати" targeting the джерело
  «Зарплата»
- **THEN** the «Правила» section lists it with its pattern and «джерело Зарплата»

#### Scenario: The джерело picker offers no «Без джерела»

- **WHEN** the owner switches the rule form's target to a джерело
- **THEN** the unarchived джерела are offered and «Без джерела» is not among them

#### Scenario: Switching from a категорія to a джерело drops the категорія

- **WHEN** the owner picks Groceries in the rule form, switches the target to a джерело, picks
  «Відсотки» and saves
- **THEN** the stored rule names the джерело «Відсотки» and no category
