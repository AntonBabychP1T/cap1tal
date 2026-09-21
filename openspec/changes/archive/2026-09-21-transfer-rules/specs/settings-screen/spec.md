## MODIFIED Requirements

### Requirement: The Правила section manages the rules

The «Правила» section SHALL list every rule as its merchant pattern and/or MCC with its target: the
target category's name, or «переказ на» and the destination рахунок's назва for a правило-переказ.
It SHALL offer creating, editing and deleting rules per the categorisation-rules capability. The
rule form SHALL let the owner choose what the rule targets — a категорія or a переказ on to a
рахунок — and SHALL then offer the matching picker: unarchived категорії for the first, unarchived
рахунки for the second. Switching what the rule targets SHALL drop the choice made for the other,
so a rule is never submitted naming both.

#### Scenario: A created rule appears in the list

- **WHEN** the owner creates the rule "сільпо → Groceries"
- **THEN** the «Правила» section lists it with its pattern and the category name Groceries

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
