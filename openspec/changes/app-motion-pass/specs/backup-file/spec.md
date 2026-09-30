## ADDED Requirements

### Requirement: A бекап carries the vibration preference

A бекап SHALL carry whether the owner's «Вібрація» switch is on or off, when the owner has ever set
it. Restoring SHALL replace the local preference with the бекап's as part of the same all-or-nothing
restore, and the restored value SHALL govern the switch and every haptic from the owner's next
action, with no restart. A бекап that does not carry it, including one written before the switch
existed, SHALL still restore, and SHALL leave «Вібрація» on. A бекап whose vibration preference is
not a plain on or off SHALL be refused whole.

#### Scenario: Vibration off survives the round trip

- **GIVEN** the owner has turned «Вібрація» off
- **WHEN** a бекап is made and restored onto storage holding nothing
- **THEN** «Вібрація» shows off, and storing a транзакція right after the restore plays no haptic

#### Scenario: An older бекап restores with vibration on

- **GIVEN** a valid бекап written before the vibration preference was carried, and a phone where
  «Вібрація» is off
- **WHEN** it is restored
- **THEN** the restore succeeds and «Вібрація» shows on

#### Scenario: The preference restores atomically with the money

- **GIVEN** a бекап carrying «Вібрація» off, one of whose транзакції fails to restore
- **WHEN** restore is attempted
- **THEN** neither the vibration preference nor any рахунок, транзакція or other setting changes

#### Scenario: A malformed vibration preference refuses the бекап

- **GIVEN** a бекап whose integrity value matches, but whose vibration preference is the text "yes"
  instead of on or off
- **WHEN** restoring it is attempted
- **THEN** it is refused whole and nothing local changes
