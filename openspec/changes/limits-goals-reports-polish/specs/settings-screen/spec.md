## MODIFIED Requirements

### Requirement: The Ліміти section manages the limits

The «Ліміти» section SHALL show every unarchived category with its ліміт or its absence, and an
archived category carrying a ліміт visibly set apart, so a leftover ліміт can still be found and
cleared. It SHALL offer setting, changing and clearing a ліміт per the limits capability, the
сума entered in major units the way an amount is entered when recording, with the ліміт's
currency chosen from the same currencies a рахунок can be created in, defaulting to UAH.

WHILE the editor of a category's ліміт is open, the device's own back gesture SHALL close that
editor and leave the section open, discarding what was typed and storing nothing; only with no
editor open SHALL it leave the section. The editor is what the owner opened last, so it is what
the back gesture undoes first.

#### Scenario: A set ліміт appears with its category

- **WHEN** the owner sets a ліміт of "2500" in UAH on Groceries in the «Ліміти» section
- **THEN** the section shows Groceries with a ліміт of 250000 minor units UAH, and August's
  Groceries spending above it marks the category over limit

#### Scenario: A ліміт can be set in another offered currency

- **WHEN** the owner sets a ліміт of "100" in USD on the category Travel
- **THEN** Travel carries a ліміт of 10000 minor units USD, and only Travel's USD spending is
  judged against it

#### Scenario: A cleared ліміт leaves the category listed

- **WHEN** the owner clears the ліміт of Groceries
- **THEN** the section still shows Groceries, now with no ліміт

#### Scenario: An archived category with a ліміт stays visible

- **WHEN** the owner archives Pets while it carries a ліміт
- **THEN** the «Ліміти» section shows Pets visibly set apart, its ліміт clearable, while an
  archived category without a ліміт is not listed

#### Scenario: The back gesture closes an open ліміт editor

- **WHEN** the owner opens the ліміт editor on Groceries, types "2500" and uses the device's back
  gesture
- **THEN** the editor closes, the «Ліміти» section is still open, and Groceries' ліміт is
  unchanged

#### Scenario: The back gesture leaves the section when no editor is open

- **WHEN** the owner uses the device's back gesture on «Ліміти» with no editor open
- **THEN** the «Ліміти» section is left, exactly as its own way back does

### Requirement: The Цілі section manages the цілі

The «Цілі» section SHALL list every ціль with its назва, target, дата and linked рахунок, and
SHALL offer creating, editing and deleting per the goals capability, deletion after
confirmation. Linking SHALL offer the unarchived рахунки; a ціль whose рахунок was archived
SHALL stay listed and editable.

WHILE the form of a ціль is open, the device's own back gesture SHALL close that form and leave
the section open, discarding what was typed and storing nothing; only with no form open SHALL it
leave the section — the same rule the «Ліміти» section carries, for the same reason.

#### Scenario: A created ціль appears in the list

- **WHEN** the owner creates the ціль «Авто» for "200000" UAH by 2026-12-31 on the jar «Подушка»
- **THEN** the «Цілі» section lists «Авто» with a target of 20000000 minor units UAH, the дата
  and the рахунок «Подушка»

#### Scenario: A deletion is confirmed first

- **WHEN** the owner deletes the ціль «Авто» and confirms
- **THEN** «Авто» is gone from the list and from «Звіти»

#### Scenario: An archived рахунок is not offered for a new ціль

- **WHEN** the owner creates a ціль while a рахунок is archived
- **THEN** that рахунок is not among the offered рахунки, while an existing ціль linked to it
  stays listed

#### Scenario: The back gesture closes an open ціль form

- **WHEN** the owner opens the form of a new ціль, fills in its назва and uses the device's back
  gesture
- **THEN** the form closes, the «Цілі» section is still open, and no ціль has been created
