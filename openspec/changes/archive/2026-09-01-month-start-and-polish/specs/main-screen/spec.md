## ADDED Requirements

### Requirement: Opening Головний again shows it from its top

WHEN the owner opens the Головний tab after having been on another tab, the screen SHALL be shown
from its top — the money and the entry form — rather than at the position it was scrolled to when
it was left. Scrolling within Головний without leaving it SHALL NOT be affected, and the feed SHALL
keep showing what is stored: only where the screen starts changes, never what it holds.

#### Scenario: Coming back lands at the start of the entry form

- **WHEN** the owner scrolls Головний down into its feed, opens Місяць, and opens Головний again
- **THEN** Головний is shown from its top, not from the middle of the entry form

#### Scenario: Scrolling within the screen is untouched

- **WHEN** the owner scrolls Головний down and stays on it
- **THEN** the screen stays where it was scrolled to
