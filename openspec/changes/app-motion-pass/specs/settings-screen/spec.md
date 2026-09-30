## ADDED Requirements

### Requirement: The Налаштування tab offers the «Вібрація» switch

The «Налаштування» tab SHALL offer a «Вібрація» switch below its sections, showing whether haptics
play (the `motion` capability). It SHALL show on until the owner turns it off or a restored бекап
carries it off. Flipping it SHALL store the choice at once and SHALL apply from the owner's next
action, with no restart. Apart from restoring a бекап (`backup-file`), it SHALL be the only place
the preference is changed.

#### Scenario: The switch is on by default

- **WHEN** the owner opens «Налаштування» on a phone where the switch was never touched
- **THEN** «Вібрація» shows on

#### Scenario: Turning vibration off is kept

- **WHEN** the owner turns «Вібрація» off and restarts the app
- **THEN** «Вібрація» still shows off and no haptic plays
