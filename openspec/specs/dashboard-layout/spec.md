# dashboard-layout Specification

## Purpose
Dashboard layout lets the owner arrange and hide a small, app-defined set of Головний widgets while preserving a stable financial default, safe upgrades and one copy of every widget.

## Requirements

### Requirement: Dashboard layout is limited to a known widget registry

The dashboard layout SHALL contain exactly one configurable entry for each widget known to this version of the app and SHALL offer no way to create, duplicate, rename, resize or change the data source of a widget. The initial known set SHALL be «Витрачено цього місяця», «Останні 5 транзакцій», «Топ категорій», «Статок» and «Прогрес».

#### Scenario: Every known widget is listed once
- **GIVEN** the current version knows five widgets
- **WHEN** the owner opens dashboard editing
- **THEN** all five are shown once with their preview names, visible state and place in the order
- **AND** no action offers adding a second copy or an unknown widget

#### Scenario: Repeated editing cannot create a duplicate
- **GIVEN** «Статок» is already present in the dashboard layout
- **WHEN** the owner hides it, shows it and moves it several times
- **THEN** the layout still contains exactly one «Статок» entry

### Requirement: A fresh dashboard has a stable financial default

With no saved dashboard preference, the dashboard SHALL show, in order, «Витрачено цього місяця», «Останні 5 транзакцій», «Топ категорій» and «Статок». «Прогрес» SHALL be known but hidden by default, so досягнення and виклики SHALL NOT precede the primary financial readings in the default layout.

#### Scenario: Fresh install uses the four-widget default
- **GIVEN** no dashboard preference has been saved or restored
- **WHEN** Головний opens
- **THEN** the visible widgets are витрачено, the latest five транзакції, top категорії and Статок in that order
- **AND** «Прогрес» is not visible

#### Scenario: Progress is available without taking priority by default
- **GIVEN** the fresh default is active
- **WHEN** the owner opens dashboard editing
- **THEN** «Прогрес» is offered as hidden after the four financial widgets and can be made visible deliberately

### Requirement: The owner can change widget visibility and order

Dashboard editing SHALL let the owner mark every known widget visible or hidden and move it higher or lower in one ordered list, SHALL show the resulting order before leaving, and SHALL persist the choice across app restarts. A hidden widget SHALL keep its place in the editable order, and showing it again SHALL return it to that place rather than create a new copy.

#### Scenario: A widget is hidden and the choice survives restart
- **GIVEN** «Топ категорій» is visible
- **WHEN** the owner hides it, leaves dashboard editing and restarts the app
- **THEN** Головний does not show «Топ категорій» and dashboard editing still lists it once as hidden

#### Scenario: Reordering visible widgets changes Головний
- **GIVEN** «Статок» follows «Останні 5 транзакцій»
- **WHEN** the owner moves «Статок» above «Останні 5 транзакцій» and leaves dashboard editing
- **THEN** Головний shows «Статок» before «Останні 5 транзакцій» on this and later launches

#### Scenario: Showing a hidden widget restores its chosen place
- **GIVEN** «Топ категорій» is hidden between «Останні 5 транзакцій» and «Статок» in the editable order
- **WHEN** the owner makes it visible
- **THEN** it appears between those two widgets and no duplicate appears

#### Scenario: Every widget may be hidden
- **GIVEN** the owner needs none of the configurable widgets
- **WHEN** every known widget is marked hidden
- **THEN** Головний keeps its header, dashboard editing action and any service item requiring action, and shows a compact explanation that widgets can be restored

### Requirement: Reordering is understandable and accessible

Every reorder action SHALL name the widget and direction, expose at least a 48 × 48 dp touch target, work without color or a drag gesture, and SHALL NOT offer moving the first item higher or the last item lower.

#### Scenario: A screen reader can move one widget
- **GIVEN** «Топ категорій» has a widget above and below it
- **WHEN** its reorder controls are read with TalkBack
- **THEN** the owner can invoke actions announced as moving «Топ категорій» higher or lower and can identify its new place without relying on color

#### Scenario: List boundaries have no false action
- **GIVEN** «Витрачено цього місяця» is first and «Прогрес» is last
- **WHEN** dashboard editing is read
- **THEN** витрачено offers no move-higher action and «Прогрес» offers no move-lower action

### Requirement: Reset uses the current version's default

«Скинути до стандартного вигляду» SHALL replace the saved dashboard preference with the complete default layout defined by the version currently installed, after the owner confirms the reset.

#### Scenario: Reset restores the current default
- **GIVEN** widgets have been hidden and reordered
- **WHEN** the owner confirms «Скинути до стандартного вигляду»
- **THEN** the four current default widgets are visible in their current default order and «Прогрес» has its current default hidden state

#### Scenario: Cancelled reset changes nothing
- **GIVEN** the owner has a customised order
- **WHEN** the owner starts reset and cancels confirmation
- **THEN** the customised order and visibility remain unchanged

### Requirement: Saved layouts survive registry evolution safely

The saved dashboard preference SHALL carry a layout schema version and an ordered list of widget identities with their visible states. On reading a supported older preference, the app SHALL keep the first occurrence of each known identity in its saved order and state, ignore later duplicates and unknown or removed identities, and append each known identity absent from that preference at the end as hidden. An unreadable preference or one with a layout schema version newer than the app understands SHALL show the current default without crashing. Saving after any such normalization SHALL write one entry per currently known widget under the current layout schema version.

#### Scenario: A newly introduced widget does not disrupt a customised dashboard
- **GIVEN** a saved layout predates a newly known widget
- **WHEN** the upgraded app reads it
- **THEN** the existing known widgets keep their order and visibility and the new widget is available once at the end as hidden

#### Scenario: Unknown and duplicate identities are harmless
- **GIVEN** a saved layout contains an identity this app does not know and names «Статок» twice
- **WHEN** the app reads it
- **THEN** the unknown identity is not rendered, only the first «Статок» entry is used, and Головний opens normally

#### Scenario: A removed widget is ignored
- **GIVEN** a saved layout names a widget no longer present in the current registry
- **WHEN** Головний and dashboard editing open
- **THEN** neither shows that widget and every remaining known widget still appears at most once

#### Scenario: A future or damaged preference falls back safely
- **GIVEN** the saved preference has a newer layout schema version or cannot be read as an ordered list
- **WHEN** Головний opens
- **THEN** the current default layout is shown and the rest of the owner's data remains unchanged

### Requirement: Customisation changes presentation only

Showing, hiding or moving a widget SHALL NOT change any транзакція, розрахунковий баланс, місячна картина, category breakdown, Статок, досягнення, виклик, cached rate or sync policy. A visible widget SHALL read the same existing local calculation and per-currency values as its dedicated destination, and dashboard customisation SHALL initiate no network request.

#### Scenario: Financial distinctions survive layout changes
- **GIVEN** a month containing a витрата, повернення, комісія, інвестиція, позика, repayment of principal, дохід «Відсотки» and коригування in several currencies
- **WHEN** the owner hides and shows the financial widgets and changes their order
- **THEN** витрачено still treats повернення as a negative витрата, інвестиція and позика as перекази, principal repayment as a переказ, «Відсотки» as дохід and negative коригування as spent
- **AND** no currencies are added together

#### Scenario: Editing a layout works offline
- **GIVEN** the phone has no network connection
- **WHEN** the owner edits, saves or resets dashboard layout
- **THEN** the preference and every visible local widget work without a network request
