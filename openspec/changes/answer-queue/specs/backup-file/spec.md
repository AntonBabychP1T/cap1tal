## ADDED Requirements

### Requirement: A бекап carries a правило-джерело

A бекап SHALL carry, for every правило-джерело, the джерело it names, and restoring SHALL bring it
back exactly, so a restored phone gives arriving money the same джерела it did. A бекап written
before правила-джерела existed SHALL restore with every правило targeting the категорія or the
destination рахунок it names, and no правило naming a джерело.

#### Scenario: A правило-джерело survives the round trip

- **WHEN** a бекап is made on a device holding the правило-джерело "зарахування зарплати →
  Зарплата" and a дохід of 5000000 minor units UAH it gave «Зарплата», and it is restored onto
  storage that holds nothing
- **THEN** the правило names the джерело «Зарплата», and the дохід carries «Зарплата»

#### Scenario: An older бекап restores with no правило-джерело

- **WHEN** a бекап written under the previous storage shape, holding the правила "сільпо →
  Groceries" and "округлення балансу → переказ на РЕЗЕРВ", is restored
- **THEN** the first targets Groceries, the second the destination РЕЗЕРВ, and no правило names a
  джерело

## MODIFIED Requirements

### Requirement: A бекап that contradicts itself is refused whole

A бекап SHALL be refused, with nothing restored, when what it holds cannot stand together: a
транзакція naming a рахунок, категорія or джерело the бекап does not contain; a транзакція other
than a переказ that says it awaits a зустрічний дохід; a правило naming a категорія, a destination
рахунок or a джерело the бекап does not contain, or naming more than one of the three, or none; a ліміт on a
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

#### Scenario: A UAH ціль over several currencies does not stop the restore

- **WHEN** restoring a бекап holding a ціль with a UAH target whose склад holds a UAH, a USD and a
  EUR рахунок is attempted
- **THEN** the бекап is not refused for that reason, and the ціль is restored with all three
  рахунки

#### Scenario: A чек pointing outside the бекап stops the restore

- **WHEN** restoring a бекап holding a чек whose транзакція is not among the бекап's транзакції is
  attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A правило-джерело pointing outside the бекап stops the restore

- **WHEN** restoring a бекап holding a правило whose джерело id the бекап does not carry is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A правило naming a категорія and a джерело stops the restore

- **WHEN** restoring a бекап holding a правило naming both a категорія and a джерело is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes
