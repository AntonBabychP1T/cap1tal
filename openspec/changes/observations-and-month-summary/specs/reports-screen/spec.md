## ADDED Requirements

### Requirement: A spelled-out finished month leads to its підсумок

WHEN the month spelled out on «Звіти» is a завершений активний місяць, the spelled-out reading
SHALL offer «Підсумок <місяця>», leading to that month's підсумок. A spelled-out current month or a
month with no транзакція SHALL offer none. Picking another month SHALL offer that month's, or none.
The offer SHALL compute nothing beyond whether the month has a підсумок.

#### Scenario: The newest finished month offers its підсумок

- **WHEN** today is 2026-10-02, October holds no транзакція yet, and «Звіти» spells out September
  2026
- **THEN** «Підсумок вересня» is offered beneath September's numbers and opens the підсумок of
  September

#### Scenario: Picking an older month offers that month's

- **WHEN** the owner picks June 2026 on the history chart and June holds транзакції
- **THEN** «Підсумок червня» is offered and opens the підсумок of June

#### Scenario: The current month offers none

- **WHEN** «Звіти» spells out the current month
- **THEN** no «Підсумок» is offered
