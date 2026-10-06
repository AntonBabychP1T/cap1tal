## MODIFIED Requirements

### Requirement: Dashboard layout is limited to a known widget registry

The dashboard layout SHALL contain exactly one configurable entry for each widget known to this version of the app and SHALL offer no way to create, duplicate, rename, resize or change the data source of a widget. The known set SHALL be «Витрачено цього місяця», «Останні 5 транзакцій», «Спостереження», «Топ категорій», «Статок» and «Прогрес».

#### Scenario: Every known widget is listed once
- **GIVEN** the current version knows six widgets
- **WHEN** the owner opens dashboard editing
- **THEN** all six are shown once with their preview names, visible state and place in the order
- **AND** no action offers adding a second copy or an unknown widget

#### Scenario: Repeated editing cannot create a duplicate
- **GIVEN** «Статок» is already present in the dashboard layout
- **WHEN** the owner hides it, shows it and moves it several times
- **THEN** the layout still contains exactly one «Статок» entry

### Requirement: Reset uses the current version's default

«Скинути до стандартного вигляду» SHALL replace the saved dashboard preference with the complete default layout defined by the version currently installed, after the owner confirms the reset.

#### Scenario: Reset restores the current default
- **GIVEN** widgets have been hidden and reordered
- **WHEN** the owner confirms «Скинути до стандартного вигляду»
- **THEN** the five current default widgets, «Спостереження» among them, are visible in their current default order and «Прогрес» has its current default hidden state

#### Scenario: Cancelled reset changes nothing
- **GIVEN** the owner has a customised order
- **WHEN** the owner starts reset and cancels confirmation
- **THEN** the customised order and visibility remain unchanged

## REMOVED Requirements

### Requirement: A fresh dashboard has a stable financial default

**Reason**: Its default named four widgets, and the registry now holds «Спостереження» as a fifth
visible-by-default reading. Its scenario «Fresh install uses the four-widget default» would no
longer be true, and `openspec validate` refuses a MODIFIED block that drops a scenario by name.
So the requirement is replaced whole by «A fresh dashboard shows five financial readings before
Прогрес», with the same rule and an honest scenario name.
**Migration**: None for stored data. A device with no saved preference shows the new five-widget
default. A saved preference keeps its order and visibility and receives «Спостереження» hidden at
its end, by the unchanged requirement «Saved layouts survive registry evolution safely».

## ADDED Requirements

### Requirement: A fresh dashboard shows five financial readings before Прогрес

With no saved dashboard preference, the dashboard SHALL show, in order, «Витрачено цього місяця», «Останні 5 транзакцій», «Спостереження», «Топ категорій» and «Статок». «Прогрес» SHALL be known but hidden by default, so досягнення and виклики SHALL NOT precede the primary financial readings in the default layout.

#### Scenario: Fresh install uses the five-widget default
- **GIVEN** no dashboard preference has been saved or restored
- **WHEN** Головний opens
- **THEN** the visible widgets are витрачено, the latest five транзакції, спостереження, top категорії and Статок in that order
- **AND** «Прогрес» is not visible

#### Scenario: Progress is available without taking priority by default
- **GIVEN** the fresh default is active
- **WHEN** the owner opens dashboard editing
- **THEN** «Прогрес» is offered as hidden after the five financial widgets and can be made visible deliberately

#### Scenario: A customised dashboard meets «Спостереження» hidden at its end
- **GIVEN** a layout saved before «Спостереження» existed, with «Статок» moved first and «Топ категорій» hidden
- **WHEN** the upgraded app reads it
- **THEN** the saved order and visibility are kept, «Спостереження» is offered once at the end as hidden, and the owner can show and move it like any other widget
