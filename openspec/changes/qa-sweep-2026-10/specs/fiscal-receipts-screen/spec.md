## MODIFIED Requirements

### Requirement: A транзакція offers scanning a чек and shows the one it has

Editing a витрата or повернення SHALL offer «Сканувати QR чека» while the транзакція carries no
фіскальний чек. The offer SHALL be more prominent for a витрата in the seeded groceries category
— the starter set's groceries row, recognised by its identity whatever the owner has renamed it
to — than for other categories. Any транзакція that carries a чек, whatever its type has become,
SHALL show that it has one — the number of позиції and the чек's total — and SHALL lead to its
позиції, where it can be detached. A переказ, дохід or коригування SHALL offer no scan.

#### Scenario: A grocery витрата offers the scan prominently

- **WHEN** the owner opens a витрата in the seeded groceries category, renamed «Продукти», that
  carries no чек
- **THEN** «Сканувати QR чека» is offered and stands out from the rest of the form

#### Scenario: Another category offers it too

- **WHEN** the owner opens a витрата in «Побут» that carries no чек
- **THEN** «Сканувати QR чека» is offered, less prominently

#### Scenario: A транзакція with a чек shows it

- **WHEN** the owner opens a витрата carrying a чек with nine позиції totalling 74230 minor units
  UAH
- **THEN** the form shows «Фіскальний чек · 9 позицій · 742,30 UAH» in place of the scan offer, and
  tapping it opens the позиції

#### Scenario: A переказ offers no scan

- **WHEN** the owner opens a переказ that carries no чек
- **THEN** no scan is offered and no чек line is shown

#### Scenario: A retyped переказ still shows its чек

- **WHEN** a витрата carrying a чек was retyped into a переказ and the owner opens it
- **THEN** no scan is offered, the чек line is shown, and the чек can be opened and detached

### Requirement: The позиції of a чек are shown raw and offline

Opening a чек SHALL list its позиції in document order, each with its raw product name exactly as
the чек printed it, its line total, and — when the позиція holds them — its quantity with unit and
unit price; a line discount SHALL be shown beside its позиція. The list SHALL show the чек's
total, the seller when named, the date and time issued, and, when the total differs from the
транзакція's current сума, both amounts marked as different. Nothing SHALL rename, clean, group or
classify a позиція. The list SHALL be readable with no network at all.

#### Scenario: Позиції are listed as printed

- **WHEN** a чек holds «Молоко 2.5%» 4720, «Хліб житній» 3890 and «Coca-Cola 2L» 6490 minor units
  UAH
- **THEN** the list shows exactly those names with 47,20 UAH, 38,90 UAH and 64,90 UAH in that order

#### Scenario: A weighed позиція shows its quantity

- **WHEN** a позиція holds quantity 5701 thousandths of «кг» at 5230 minor units with line total
  29816
- **THEN** it shows «5,701 кг × 52,30 UAH» beside 298,16 UAH

#### Scenario: A позиція without a unit price shows no invented one

- **WHEN** a позиція holds a line total and no unit price
- **THEN** it shows the line total and no «×» line

#### Scenario: An edited транзакція marks the difference

- **WHEN** a транзакція's сума was changed to 70000 minor units UAH after a чек of 74230 was
  attached
- **THEN** the чек view shows 742,30 UAH and 700,00 UAH marked as different

#### Scenario: Offline reading

- **WHEN** the phone has no network and the owner opens an attached чек
- **THEN** every позиція is shown exactly as when it was attached
