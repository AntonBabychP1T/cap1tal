## ADDED Requirements

### Requirement: The way back off the setup view always leads somewhere

The setup view SHALL carry the same way back off it that every other view opened over another
carries, and that way SHALL never do nothing. Where the owner reached the setup view from another
view, taking it SHALL return them to that view. Where the setup view is what the launch itself
opened — so there is no view underneath to return to — taking it SHALL show Головний, and SHALL
NOT leave the owner on the setup view. Which of the two happens SHALL be decided by whether there
is a view underneath at the moment it is taken, not by how the setup view was reached earlier in
the session. The phone's own back press SHALL follow the same rule: with no view underneath it
SHALL show Головний rather than close the app, and with one it SHALL return to that view.

#### Scenario: The setup view the launch opened leads on to Головний

- **WHEN** the app is launched on a device with no рахунок and no транзакція and the owner takes
  the way back off the setup view
- **THEN** Головний is shown, and the setup view is not opened again for the rest of that launch

#### Scenario: The setup view opened from Налаштування returns to Налаштування

- **WHEN** the owner opens the setup view from Налаштування and takes the way back off it
- **THEN** Налаштування is shown

#### Scenario: The way back still leads on after a step has been done from it

- **WHEN** the app is launched on a device with nothing on it, the owner completes the Saldo
  import from the setup view, returns to the setup view, and then takes the way back off it
- **THEN** Головний is shown

#### Scenario: The phone's back press on the setup view the launch opened leads on to Головний

- **WHEN** the app is launched on a device with nothing on it and the owner presses the phone's
  back button on the setup view
- **THEN** Головний is shown and the app stays open

#### Scenario: The way back is never a control that does nothing

- **WHEN** the owner takes the way back off the setup view in any state it can be in
- **THEN** the view they are shown afterwards is not the setup view
