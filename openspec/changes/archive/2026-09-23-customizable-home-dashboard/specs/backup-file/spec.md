## ADDED Requirements

### Requirement: A бекап carries the dashboard layout preference

A бекап SHALL carry the owner's dashboard layout schema version, the ordered known widget identities and each visible state when that preference exists, and restoring SHALL replace the local dashboard preference with the бекап's preference as part of the same all-or-nothing restore. A бекап written before dashboard customisation existed SHALL still restore and SHALL leave Головний on the current default layout.

#### Scenario: Custom layout survives the round trip
- **GIVEN** the owner has hidden «Топ категорій», made «Прогрес» visible and moved «Статок» first
- **WHEN** a бекап is made and restored onto storage holding nothing
- **THEN** dashboard editing shows the same order and visible states and Головний renders that restored layout

#### Scenario: Restore replaces the local preference
- **GIVEN** the phone has one customised dashboard layout and the бекап carries another
- **WHEN** the бекап is restored
- **THEN** only the бекап's dashboard preference remains and no local widget entry is merged into it

#### Scenario: An older backup restores to the current default
- **GIVEN** a valid бекап was written before dashboard layout was carried
- **WHEN** it is restored
- **THEN** the restore succeeds and Головний uses the current default dashboard layout

#### Scenario: Layout restore is atomic with the money
- **GIVEN** a бекап carries a dashboard preference and restoring one of its транзакції fails
- **WHEN** restore is attempted
- **THEN** neither the dashboard preference nor any рахунок, транзакція or other setting changes

#### Scenario: Unknown or duplicate widget identities do not refuse the бекап
- **GIVEN** a бекап's dashboard layout names a widget identity this app version does not know and names «Статок» twice
- **WHEN** the бекап is validated
- **THEN** it is accepted as structurally valid, unlike a бекап that contradicts itself over accounts or rules — normalization, not backup validation, decides what is rendered — and restoring it succeeds

