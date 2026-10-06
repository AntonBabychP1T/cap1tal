## MODIFIED Requirements

### Requirement: The refresh of the рахунки list says what it refreshes

The action that re-reads the list of monobank cards and банки without syncing транзакції SHALL be
labelled «Оновити список рахунків», so it cannot be mistaken for «Синхронізувати». WHILE no token is
configured it SHALL be shown as unavailable, because there is no list it could refresh; the screen
already offers entering a token above it.

#### Scenario: Without a token there is nothing to refresh

- **WHEN** the owner opens the monobank screen with no token kept
- **THEN** «Оновити список рахунків» is shown unavailable and tapping it does nothing

#### Scenario: The two actions read differently

- **WHEN** the owner opens the monobank screen with a token kept
- **THEN** the list refresh reads «Оновити список рахунків» and the sync reads «Синхронізувати»
