## MODIFIED Requirements

### Requirement: New досягнення are announced once, quietly, and in one group

Unseen досягнення SHALL be announced quietly beside the existing «Звіти» entry to «Прогрес» (one name for one, one count line for several), retaining seen state until Прогрес is opened, and using no dialog, sound or phone notification. Головний SHALL use no home widget for this announcement unless the owner has deliberately made the optional Прогрес widget visible in dashboard customisation; that widget, when visible, MAY show the same quiet, compact unseen-achievement badge reusing this same seen/count state, but SHALL evaluate nothing and mark nothing seen by being rendered — only opening «Прогрес» itself keeps that existing write.

#### Scenario: Twelve retroactive досягнення are one line
- **GIVEN** twelve unseen досягнення
- **WHEN** Звіти is read
- **THEN** one count line accompanies the Progress entry and reading it alone marks none seen

#### Scenario: One new досягнення is named
- **GIVEN** exactly one unseen досягнення
- **WHEN** Звіти is read
- **THEN** its name appears by the Progress entry without an interrupting announcement

#### Scenario: Seen is seen
- **GIVEN** twelve unseen досягнення and the optional Прогрес widget has not been made visible
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

#### Scenario: A deliberately visible Progress widget shows the same quiet badge, then loses it
- **GIVEN** the owner has made the optional Прогрес widget visible and twelve досягнення are unseen
- **WHEN** Головний opens
- **THEN** the widget shows the same quiet unseen-achievement badge «Звіти» shows, with no dialog, sound or notification
- **AND** once «Прогрес» is opened and the owner returns to Головний, the widget shows no unseen badge, exactly as «Звіти» no longer shows one

### Requirement: A device with nothing yet says so plainly

WHEN no транзакція is stored, «Прогрес» SHALL state in one sentence what the screen is for and that there is nothing yet, SHALL show no виклик and no empty progress bars, and Головний SHALL show no «Прогрес» section unless the owner has deliberately made the optional Прогрес widget visible in dashboard customisation, in which case it SHALL show that same one-sentence empty state instead of any list, bar or placeholder.

#### Scenario: A fresh install shows one sentence

- **WHEN** the owner opens «Прогрес» on a device holding no транзакція
- **THEN** one sentence states what the screen is for and that there is nothing yet, and no list, bar or placeholder is drawn
- **AND** if the owner has made the optional Прогрес widget visible, Головний shows that same one sentence in the widget instead of any list, bar or placeholder
