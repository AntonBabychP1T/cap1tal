## MODIFIED Requirements

### Requirement: Tapping the нагадування opens where the day is recorded

Tapping the нагадування SHALL open Головний — where the «+» records a транзакція and the rail row
«Що потребує відповіді» names the pending чернетки, one tap from the queue where they are answered —
whether the app was running or not.

#### Scenario: A tap while the app is closed opens Головний

- **WHEN** the app is not running and the owner taps the нагадування
- **THEN** the app opens on Головний, showing the «+» that records and naming any pending чернетки
  in the rail row «Що потребує відповіді»

#### Scenario: A tap while the app is running opens Головний

- **WHEN** the app is open on another screen and the owner taps the нагадування
- **THEN** Головний is shown
