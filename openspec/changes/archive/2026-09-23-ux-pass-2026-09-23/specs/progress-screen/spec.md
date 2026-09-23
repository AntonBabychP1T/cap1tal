## ADDED Requirements

### Requirement: Earned досягнення read as a compact list

«Отримані» SHALL list the earned досягнення as rows of one list — each its title and its дата
досягнення, opening its detail on tap — rather than a card per досягнення. «У процесі» SHALL read
the same way, each row its title and how far it has come.

#### Scenario: Seventeen earned досягнення

- **WHEN** seventeen досягнення are earned
- **THEN** «Отримані» is one list of seventeen rows, newest first, each opening its detail on tap

#### Scenario: Measurable progress reads as rows too

- **WHEN** two досягнення are in progress
- **THEN** «У процесі» is one list of two rows, each naming how far it has come and opening its
  detail on tap
