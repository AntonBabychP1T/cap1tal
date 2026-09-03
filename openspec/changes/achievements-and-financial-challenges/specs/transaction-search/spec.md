## ADDED Requirements

### Requirement: «Транзакції» can be opened already narrowed to one місяць

The system SHALL be able to open «Транзакції» narrowed to a named місяць, so a виклик whose action
is «the place where those items are answered» lands the owner on the місяць it is about rather than
on the whole history. The narrowing SHALL be an **initial value and not a lock**: it is shown in
the місяць narrowing like any other, and the owner may widen or change it exactly as they can one
they chose themselves.

A місяць that is not a calendar місяць SHALL narrow nothing, and neither SHALL an absent one: the
screen opens on the whole history rather than on an empty list or a refusal.

#### Scenario: A виклик opens the місяць it is about

- **WHEN** «Закрий 2026-08» is begun and «Транзакції» is opened for 2026-08
- **THEN** the list shows the транзакції of 2026-08, the місяць narrowing says 2026-08, and the
  owner can widen it back to every місяць

#### Scenario: Something that is not a місяць narrows nothing

- **WHEN** «Транзакції» is opened asking for «2026-13», for «серпень» or for nothing at all
- **THEN** the list shows the whole history and no narrowing is in force
