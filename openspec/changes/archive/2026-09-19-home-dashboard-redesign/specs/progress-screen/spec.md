## MODIFIED Requirements

### Requirement: «Прогрес» is a pushed screen, never a sixth tab

«Прогрес» SHALL remain reachable through «Звіти» over the existing five tabs with «Назад», independently of unseen achievements or accepted challenges and without requiring a default Головний widget.

#### Scenario: Звіти leads to Прогрес
- **GIVEN** no unseen досягнення and no accepted виклик
- **WHEN** the owner opens «Звіти» and chooses «Прогрес»
- **THEN** the existing Progress content opens with back navigation and the same five tabs remain

#### Scenario: The tabs are unchanged
- **GIVEN** the new default dashboard
- **WHEN** the app opens
- **THEN** its five tabs remain Головний, Місяць, Рахунки, Звіти and Налаштування, with Прогрес offered over them rather than as a sixth tab

#### Scenario: Existing data survives removing the home widget
- **GIVEN** twelve earned досягнення and three accepted виклики
- **WHEN** the new dashboard is used and Прогрес is opened from Звіти
- **THEN** all earned facts, evidence, dates, challenge decisions and norms remain intact with unchanged evaluation rules

### Requirement: New досягнення are announced once, quietly, and in one group

Unseen досягнення SHALL be announced quietly beside the existing «Звіти» entry to «Прогрес» (one name for one, one count line for several), retaining seen state until Прогрес is opened and using no home widget, dialog, sound or phone notification.

#### Scenario: Twelve retroactive досягнення are one line
- **GIVEN** twelve unseen досягнення
- **WHEN** Звіти is read
- **THEN** one count line accompanies the Progress entry and reading it alone marks none seen

#### Scenario: One new досягнення is named
- **GIVEN** exactly one unseen досягнення
- **WHEN** Звіти is read
- **THEN** its name appears by the Progress entry without an interrupting announcement

#### Scenario: Seen is seen
- **GIVEN** twelve unseen досягнення
- **WHEN** Прогрес is opened and the owner returns to Звіти and Головний
- **THEN** all twelve are seen, the count announcement disappears, the Reports entry stays, and Home shows no Progress widget

#### Scenario: Nothing is pushed to the phone
- **GIVEN** an achievement becomes earned at an existing evaluation moment
- **WHEN** the result is recorded
- **THEN** no phone notification, sound or interrupting dialog is emitted

#### Scenario: Evaluation still happens only at existing moments
- **GIVEN** the app has already evaluated at startup
- **WHEN** the owner repeatedly opens Головний or Звіти without changing data
- **THEN** these renders neither evaluate achievements nor emit any notification

## REMOVED Requirements

### Requirement: Головний shows «Прогрес» only when something is waiting
**Reason**: Default Home prioritises spent, transactions, categories and Статок regardless of progress state.
**Migration**: Read all existing achievements/challenges through Reports → Progress; future customization is outside this change.
