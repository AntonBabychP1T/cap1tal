## MODIFIED Requirements

### Requirement: The form asks for three lines and saves on one

The репорт form SHALL offer «Що я робив» (required), «Що сталося» and «Чого я очікував», in
Ukrainian, with the prompting failure shown above them when there is one, and SHALL save on
«Зберегти», opening the saved репорт in place of the form — except on the crash fallback, where
saving returns the owner to Головний, as that requirement says. A save with «Що я робив» empty
SHALL be refused in Ukrainian. Leaving the form by the device's back gesture SHALL store nothing.

A refusal SHALL be shown only while it is still true. The refusal of an empty «Що я робив» SHALL
disappear as soon as that line holds anything, without waiting for another «Зберегти» — the owner
has answered it, and a red line under an answered question says the form is still refusing when it
is not. A refusal that the fields cannot answer — a save the storage would not take — SHALL stay
until saving is tried again.

#### Scenario: Saving opens the saved репорт

- **WHEN** the owner writes «натиснув Записати» and saves
- **THEN** the saved репорт's screen replaces the form, showing its rendered text

#### Scenario: The required line is enforced in Ukrainian

- **WHEN** the owner saves with «Що я робив» empty
- **THEN** the form stays, nothing is stored, and the refusal names the line in Ukrainian

#### Scenario: Filling the required line clears its refusal

- **WHEN** the owner has been refused for an empty «Що я робив» and then types into that line
- **THEN** the refusal is gone before «Зберегти» is pressed again

#### Scenario: Whitespace alone does not clear it

- **WHEN** the owner has been refused for an empty «Що я робив» and types only spaces into it
- **THEN** the refusal is still shown

#### Scenario: A save that fails says so and keeps the form

- **WHEN** the owner saves a репорт and storing it fails
- **THEN** the form stays with what they wrote, nothing is stored, the owner is told in Ukrainian
  that the репорт could not be saved and why, and that failure is itself in the журнал

#### Scenario: A refusal the fields cannot answer stays

- **WHEN** a save was refused because storing it failed, and the owner edits «Що я робив»
- **THEN** that refusal is still shown, because typing does not make the storage work

#### Scenario: The back gesture discards the form

- **WHEN** the owner has typed two lines and uses the device's back gesture
- **THEN** the form closes and no репорт was created
