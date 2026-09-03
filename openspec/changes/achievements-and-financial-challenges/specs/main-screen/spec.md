## ADDED Requirements

### Requirement: Головний leads to «Прогрес» when there is something to see

Головний SHALL be able to show a «Прогрес» section, rendered only when at least one earned
досягнення has not been seen or at least one виклик is accepted, exactly as the progress-screen
capability defines it. The section SHALL lead to «Прогрес» and SHALL record nothing, compute no new
money number and change nothing about the транзакції, the місячна картина or «Усього грошей».

Drawing Головний SHALL NOT evaluate досягнення.

#### Scenario: The section appears only with something in it

- **WHEN** the owner opens Головний with one unseen досягнення
- **THEN** a «Прогрес» section is shown leading to «Прогрес»

#### Scenario: Nothing waiting leaves Головний as it was

- **WHEN** the owner opens Головний with every досягнення seen and no виклик accepted
- **THEN** Головний shows exactly what it showed before this change, with no «Прогрес» section

#### Scenario: Opening Головний earns nothing

- **WHEN** the owner opens Головний four times
- **THEN** no досягнення is earned as a consequence of the screen being drawn
