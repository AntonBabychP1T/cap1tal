## ADDED Requirements

### Requirement: A бекап carries every рахунок's дата початкового залишку

A бекап SHALL carry each рахунок's дата початкового залишку where it has one, and restoring it
SHALL bring that дата back. A бекап made before the дата existed SHALL restore every рахунок with
no дата rather than be refused.

#### Scenario: The дата survives the round trip
- **WHEN** a бекап of a рахунок with початковий залишок 30000 EUR dated 2026-06-08 is restored onto empty storage
- **THEN** the рахунок has the same початковий залишок and дата початкового залишку

#### Scenario: An older бекап restores without dates
- **WHEN** a бекап written by the previous format, holding no дата, is restored
- **THEN** every рахунок is restored with no дата початкового залишку and the restore is not refused
