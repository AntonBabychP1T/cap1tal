## Purpose

What the owner sees and does: from a транзакція to «Сканувати QR чека», through the scanner, the
lookup and the comparison to an attached фіскальний чек whose позиції are readable under the
транзакція — with every failure named in the owner's words and retryable, and with everything
already attached readable offline.

## ADDED Requirements

### Requirement: The scan offer answers the type the form is showing, not the stored one

While a транзакція is open for editing, whether «Сканувати QR чека» is offered — and whether it is
offered prominently — SHALL be decided by the тип and the категорія the form is currently showing,
not by the ones last saved. Retyping a витрата to переказ or дохід SHALL withdraw the offer at the
moment the тип is chosen, before anything is saved; retyping a переказ back to витрата SHALL make
the offer appear the same way.

Which types are offered a scan at all, and what a транзакція already carrying a чек shows, are the
requirement "A транзакція offers scanning a чек and shows the one it has"'s and are not restated
here. This one says only which тип that requirement is asked about.

#### Scenario: Choosing переказ withdraws the scan offer

- **WHEN** the owner opens a витрата carrying no чек and chooses «переказ» as its тип without
  saving
- **THEN** «Сканувати QR чека» is no longer offered

#### Scenario: Choosing витрата brings the offer back

- **WHEN** the owner opens a переказ carrying no чек and chooses «витрата» as its тип without
  saving
- **THEN** «Сканувати QR чека» is offered

#### Scenario: The prominence follows the category being chosen

- **WHEN** the owner opens a витрата in «Побут» carrying no чек and chooses the seeded groceries
  категорія without saving
- **THEN** the scan offer is the prominent one

#### Scenario: An attached чек is shown whatever the form says

- **WHEN** the owner opens a витрата carrying a чек and chooses «переказ» as its тип without saving
- **THEN** the чек line is still shown and still opens its позиції
