## ADDED Requirements

### Requirement: What appears, closes or leaves moves its neighbours smoothly

A section or a service row that appears SHALL fade in, and one that disappears SHALL fade out. The
content around it SHALL move to its new place over the standard duration instead of jumping. That
covers a picker's list opening, the статок points and explanation opening, and a service row
appearing or leaving the service rail — the row «Що потребує відповіді» among them. A row leaving a
list SHALL fade out while the rows after it close the gap — an entry answered in the queue «Що
потребує відповіді» among them. A row arriving in a list, and every row present when a screen is
first drawn, SHALL appear at once, without animating in.

#### Scenario: The rail row comes and goes smoothly

- **WHEN** the last entry waiting for an answer is answered and the owner returns to Головний
- **THEN** the row «Що потребує відповіді» fades out and the content below moves up over 220 ms
  rather than jumping

#### Scenario: An answered entry leaves the queue smoothly

- **WHEN** the owner confirms a чернетка in the queue «Що потребує відповіді»
- **THEN** its row fades out and the entries below move up to close the gap

#### Scenario: A removed транзакція's row closes the gap

- **WHEN** the owner removes a транзакція in its editor and goes back to the рахунок it was listed on
- **THEN** its row fades out and the rows below move up to close the gap

#### Scenario: A long list appears at once

- **WHEN** the owner opens «Транзакції» or asks for more
- **THEN** the rows are shown at once, without appearing one by one

## REMOVED Requirements

### Requirement: What opens, closes or leaves moves its neighbours smoothly

**Reason**: It named the чернетки opening in the service rail on Головний, which this change
removes: чернетки are named in the rail row «Що потребує відповіді» and answered in the queue.
**Migration**: See "What appears, closes or leaves moves its neighbours smoothly", which keeps every
other part of it and adds the rail row and an entry answered in the queue.
