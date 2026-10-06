## ADDED Requirements

### Requirement: A raw чернетка on Головний offers its shown сума припущення

A raw чернетка on Головний that shows a сума припущення SHALL show «Схоже на: <сума>» beside where
its сума is entered, with «Ні». Accepting SHALL fill the сума with that amount in the рахунок's
currency, and the owner may change it before confirming. Confirming SHALL create the витрата of the
сума the чернетка then holds, exactly as with a сума the owner typed, and as a raw чернетка always
confirms. «Ні» SHALL remove the припущення and leave the сума as it is. A raw чернетка with no
припущення SHALL read and confirm exactly as before.

#### Scenario: Accept, then confirm

- **WHEN** a raw чернетка on a UAH рахунок shows «Схоже на: 250,00 ₴», and the owner accepts it and
  confirms
- **THEN** a витрата of 25000 minor units UAH exists, carrying the чернетка's text as its опис

#### Scenario: Accepted, then corrected

- **WHEN** the owner accepts «Схоже на: 250,00 ₴», changes the сума to 260,00 and confirms
- **THEN** a витрата of 26000 minor units UAH exists
