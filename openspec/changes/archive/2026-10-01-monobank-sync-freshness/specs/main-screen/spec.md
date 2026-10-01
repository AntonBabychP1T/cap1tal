## ADDED Requirements

### Requirement: Головний's bank freshness leaves out a рахунок the token no longer shows

Головний's freshness line — its age and its «Синхронізовано N з M рахунків» count — and the moment
«Потребує уваги» decides its monobank row from SHALL be read over the linked рахунки the newest
stored client-info answer names, as the monobank-sync capability's «A рахунок the token no longer
shows is set aside, not failed» requires; that requirement takes precedence over the wording «every
linked рахунок» in «Головний says how fresh the bank data is». WHEN the phone holds no answer, or the
newest one names none of the linked рахунки, every linked рахунок counts, exactly as before.

#### Scenario: A closed card does not age the whole bank

- **WHEN** eight linked рахунки synced three minutes ago and a ninth, which the newest stored answer
  does not name, last synced two days ago
- **THEN** Головний says the data was updated 3 хв ago, and «Потребує уваги» carries no monobank row

#### Scenario: A token that shows nothing linked still reads stale

- **WHEN** the newest stored answer names none of the two linked рахунки, last synced two days ago,
  and the last прогін ended unavailable
- **THEN** Головний states the two-day-old moment and «Потребує уваги» carries the monobank row
