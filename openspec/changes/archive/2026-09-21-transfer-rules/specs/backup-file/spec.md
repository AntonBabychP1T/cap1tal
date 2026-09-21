## ADDED Requirements

### Requirement: A бекап carries правила-перекази and awaiting перекази

A бекап SHALL carry every правило's target — its target категорія, or its destination рахунок for a
правило-переказ — and, for every переказ, whether it awaits its зустрічний дохід. Restoring SHALL
bring both back exactly. A бекап written before either existed SHALL restore with every правило
targeting the категорія it names and every переказ awaiting nothing.

#### Scenario: A правило-переказ and an awaiting переказ survive the round trip

- **WHEN** a бекап is made on a device holding the правило "округлення балансу → переказ на РЕЗЕРВ"
  and a переказ onto РЕЗЕРВ that awaits its зустрічний дохід, and it is restored onto storage that
  holds nothing
- **THEN** the правило targets the destination РЕЗЕРВ, and the переказ still awaits

#### Scenario: An older бекап restores with nothing awaiting

- **WHEN** a бекап written under the previous storage shape, holding a переказ and the правило
  "сільпо → Groceries", is restored
- **THEN** the переказ awaits nothing and the правило targets Groceries

## MODIFIED Requirements

### Requirement: A бекап that contradicts itself is refused whole

A бекап SHALL be refused, with nothing restored, when what it holds cannot stand together: a
транзакція naming a рахунок, категорія or джерело the бекап does not contain; a транзакція other
than a переказ that says it awaits a зустрічний дохід; a правило naming a категорія or a destination
рахунок the бекап does not contain, or naming both, or neither; a ліміт on a
категорія it does not contain; a ціль whose склад names a рахунок the бекап does not contain; a
ціль whose склад is empty; a ціль whose склад names one рахунок more than once; a ціль whose
currency is neither UAH nor the single currency every рахунок of its склад is in; a чек naming a
транзакція it does not contain, two чеки naming one транзакція, or two чеки of one identity; a
позиція naming a чек it does not contain; a сума
that is not an integer in minor units, or a сума without its currency code. The contradiction
SHALL be found before anything local is touched.

#### Scenario: A transaction pointing outside the бекап stops the restore

- **WHEN** restoring a бекап holding a витрата whose рахунок is not among the бекап's рахунки is
  attempted
- **THEN** the бекап is refused as inconsistent and every рахунок and транзакція on the phone is
  exactly what it was

#### Scenario: A правило-переказ pointing outside the бекап stops the restore

- **WHEN** restoring a бекап holding a правило whose destination рахунок id the бекап does not carry
  is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A правило with two targets stops the restore

- **WHEN** restoring a бекап holding a правило naming both a категорія and a destination рахунок is
  attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A ціль pointing at a рахунок outside the бекап stops the restore

- **WHEN** restoring a бекап holding a ціль whose склад names a рахунок id the бекап does not carry
  is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A ціль with an empty склад stops the restore

- **WHEN** restoring a бекап holding a ціль with no рахунок in its склад is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A ціль naming one рахунок twice stops the restore

- **WHEN** restoring a бекап holding a ціль whose склад names the same рахунок id twice is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A ціль in another currency than its рахунок stops the restore

- **WHEN** restoring a бекап holding a ціль with a USD target whose склад holds only UAH рахунки
  is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A чек pointing outside the бекап stops the restore

- **WHEN** restoring a бекап holding a чек whose транзакція is not among the бекап's транзакції is
  attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A UAH ціль over several currencies does not stop the restore

- **WHEN** restoring a бекап holding a ціль with a UAH target whose склад holds a UAH, a USD and a
  EUR рахунок is attempted
- **THEN** the бекап is not refused for that reason, and the ціль is restored with all three
  рахунки
