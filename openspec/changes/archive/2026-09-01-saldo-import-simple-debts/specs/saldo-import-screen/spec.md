## REMOVED Requirements

### Requirement: Every «Борг» transaction is assigned to a person before the import can commit

**Reason**: the import no longer asks who a historic debt was with. Every «Борг» transaction
becomes a переказ on the рахунок-борг «Борги» without a decision, so there is no борги step to
show, nothing to list as unassigned, and nothing about a debt that can withhold the commit.

## MODIFIED Requirements

### Requirement: The import shows what it would do before it does anything

The system SHALL offer a one-time «Імпорт Saldo» flow that reads the chosen export, builds the
import plan from the owner's decisions and displays it, and SHALL write nothing to storage until
the owner commits. Leaving the flow before committing SHALL leave the owner's рахунки,
категорії, джерела and транзакції exactly as they were. Confirming the account map SHALL lead
straight to the verification report; the flow SHALL ask nothing about debts.

#### Scenario: Leaving before the commit stores nothing

- **WHEN** the owner opens the flow, chooses an export, confirms the map and leaves without
  committing
- **THEN** no рахунок, категорія, джерело or транзакція has been created or changed

#### Scenario: The plan is shown before it is committed

- **WHEN** an export is chosen and the account map confirmed
- **THEN** the flow shows how many транзакції the plan holds and how many рахунки, категорії and
  джерела it would create, before the commit is offered

#### Scenario: The map step leads straight to the звірка

- **WHEN** the owner has confirmed the account map of an export holding «Борг» transactions
- **THEN** the next step of the flow is the verification report, and the commit is offered from
  it without any debt having been assigned
