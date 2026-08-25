# categorisation-rules Specification (delta)

## Purpose

The owner's stored автокатегоризація rules — "merchant / MCC → category" — and the deterministic
matching every import source (Saldo CSV, monobank, bank notifications) will run its transactions
through before anything falls back to «Без категорії».

## ADDED Requirements

### Requirement: A rule maps merchant and/or MCC to one category

A rule SHALL hold a merchant pattern (non-empty text), or an MCC (an integer), or both, and
exactly one target expense category that exists. A rule with neither criterion SHALL be rejected;
a rule targeting a category that does not exist SHALL be rejected; an MCC that is not a whole
number SHALL be rejected, since matching compares it for equality against the integer the bank
sends and anything else is a rule that can never fire. «Коригування» SHALL NOT be a rule's target:
it is carried only by коригування the app itself creates, so aiming an imported витрата at it
would label one transaction type as another. A rule whose target category
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

#### Scenario: A rule keeps matching into an archived category

- **WHEN** the rule "сільпо → Groceries" exists and Groceries is archived
- **THEN** matching a description containing "сільпо" still returns Groceries

### Requirement: Rules can be created, edited and deleted

The owner SHALL be able to create a rule, change its merchant pattern, MCC or target category,
and delete it. A deleted rule SHALL NOT affect transactions already categorised by it — a rule
acts at import time, never retroactively.

#### Scenario: An edited rule carries its new target

- **WHEN** the owner changes the rule "сільпо → Groceries" to target Eating out
- **THEN** the same rule now targets Eating out

#### Scenario: A deleted rule is gone and history stands

- **WHEN** a rule that earlier categorised an imported витрата into Groceries is deleted
- **THEN** the rule no longer exists and that витрата still carries Groceries

### Requirement: Matching is deterministic and most-specific-first

Given a transaction's merchant description and, when present, its MCC, the system SHALL return
the target category of the best-matching rule, or nothing when no rule matches. A merchant
pattern matches WHEN it occurs anywhere in the description, case-insensitively; an MCC matches
WHEN it is equal; a rule holding both criteria matches only when both do. Case is all that is
folded: a pattern written in one script SHALL NOT match a description written in another, because
the owner writes the pattern by looking at the descriptions their bank actually sends — «Uklon»
arrives in Latin and «СІЛЬПО» in Cyrillic. Among matching rules,
a rule with both criteria SHALL beat a merchant-only rule, and a merchant-only rule SHALL beat
an MCC-only rule; among matching merchant patterns the longest SHALL win; a remaining tie SHALL
go to the most recently created rule.

#### Scenario: A merchant pattern matches case-insensitively inside the description

- **WHEN** the rule "сільпо → Groceries" exists and a transaction's description is
  "СІЛЬПО Київ вул. Хрещатик"
- **THEN** matching returns Groceries

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

#### Scenario: No matching rule returns nothing

- **WHEN** no rule matches a transaction's description and MCC
- **THEN** matching returns nothing
