## ADDED Requirements

### Requirement: Звіти leads to «Прогрес»

The «Звіти» tab, where the цілі and their progress already are, SHALL offer opening «Прогрес». The
entry SHALL be present whether or not anything has been earned, and SHALL change nothing the tab
already shows.

#### Scenario: Прогрес is reachable from Звіти

- **WHEN** the owner opens «Звіти»
- **THEN** «Прогрес» can be opened from it, and every chart, ціль and number the tab already shows is
  unchanged

#### Scenario: The entry is there with nothing earned

- **WHEN** no досягнення has been earned and the owner opens «Звіти»
- **THEN** «Прогрес» can still be opened from it
