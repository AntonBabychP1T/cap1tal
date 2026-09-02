## MODIFIED Requirements

### Requirement: A бекап is one versioned file holding the owner's whole state

A бекап SHALL be a single file that carries, alongside its contents: the version of the бекап
format, the version of the storage shape it was written under, the moment it was made, and one
integrity value over its contents.

Its contents SHALL be every рахунок with its назва, вид, currency, початковий залишок and
archived flag; every категорія and джерело with its archived flag; every правило with its
merchant pattern, MCC and target категорія; every ліміт with its сума and currency; every ціль
with its назва, target сума, currency, дата and рахунок; every транзакція of all five types with
its type, дата, рахунок or both рахунки, integer minor-unit сума with its currency code, категорія
or джерело, опис and original-currency сума where it has one; the marker that a Saldo import was
committed; the monobank accounts a token has shown with their links, sync boundaries, cursors, the
moment each link last synced and imported item ids; the відстежувані застосунки of bank notifications with the рахунок each lands on; and every фіскальний
чек with its identity, values, source snapshot and every позиція чека, attached to the транзакція
it was attached to.

Every identifier SHALL be carried verbatim, so a restored бекап refers to the same рахунки,
категорії, джерела, транзакції and чеки it was made from.

#### Scenario: Every transaction type survives the round trip

- **WHEN** a бекап is made on a device holding a витрата in a категорія, a дохід with a джерело, a
  повернення, a коригування of −3000 minor units UAH, a переказ between two UAH рахунки and a
  cross-currency переказ that left 410000 minor units UAH and arrived as 10000 minor units USD,
  and that бекап is restored onto storage that holds nothing
- **THEN** all six транзакції are there with the same types, дати, суми in their own currencies,
  категорії, джерела and both legs of each переказ, and no exchange rate exists for either переказ

#### Scenario: The distinctions of the glossary survive the round trip

- **WHEN** a бекап made on a device holding an інвестиція — a переказ onto a рахунок of вид
  `investment` — a переказ onto a рахунок-борг, a витрата «Комісія», a повернення in the same
  категорія as the витрата it undoes, and a дохід of відсотки, is restored onto empty storage
- **THEN** each is back as what it was: the інвестиція and the позика are still перекази and not
  витрати, the повернення is still a повернення and not a дохід, and every сума is still in the
  currency of the рахунок it sits on

#### Scenario: Configuration comes back with the money

- **WHEN** a бекап made on a device holding an archived категорія, a правило "сільпо → Продукти",
  a ліміт of 250000 minor units UAH, a ціль «Авто» on a рахунок, a committed Saldo import marker,
  a monobank link with its cursor, the moment it last synced and its imported item ids, and a
  відстежуваний застосунок bound to a рахунок, is restored onto empty storage
- **THEN** all of them are back with the same values, the archived категорія is still archived,
  the ліміт is still measured against its own категорія, and the link says it was last synced when
  it was rather than that it never has been

#### Scenario: A чек comes back under its транзакція without the tax service

- **WHEN** a бекап made on a device holding a витрата with an attached чек of eight позиції, one
  carrying a barcode, is restored onto empty storage with no network
- **THEN** the same витрата carries the same чек with the same eight позиції, barcode included, and
  the source snapshot, and no lookup was made

#### Scenario: Identifiers are preserved

- **WHEN** a бекап is restored
- **THEN** every рахунок, категорія, джерело, правило, ціль, транзакція and чек carries the
  identifier it carried when the бекап was made

### Requirement: A бекап names the versions it was written under and is refused when they are newer

A бекап SHALL be accepted only when its бекап format version and its storage shape version are
each the current one or older; a бекап naming a newer version of either SHALL be refused by that
reason and nothing local SHALL change. A бекап written under an older storage shape SHALL still be
restored, filling in nothing it does not name.

#### Scenario: A бекап from a newer app is refused, not half-read

- **WHEN** restoring a бекап whose бекап format version is higher than this installation's is
  attempted
- **THEN** it is refused as coming from a newer version of the app, and every рахунок, транзакція
  and setting on the phone is exactly what it was

#### Scenario: A бекап from a newer storage shape is refused

- **WHEN** restoring a бекап whose storage shape version is higher than this installation's is
  attempted
- **THEN** it is refused as coming from a newer version of the app, and nothing local changes

#### Scenario: An older бекап still restores

- **WHEN** a бекап that names no відстежувані застосунки, because it was written before they
  existed, is restored
- **THEN** its рахунки, категорії, джерела, правила, ліміти, цілі and транзакції are restored and
  no відстежуваний застосунок exists afterwards

#### Scenario: A бекап written before чеки existed restores without them

- **WHEN** a бекап that names no фіскальний чек, because it was written before чеки existed, is
  restored
- **THEN** its транзакції are restored and none of them carries a чек

### Requirement: A бекап that contradicts itself is refused whole

A бекап SHALL be refused, with nothing restored, when what it holds cannot stand together: a
транзакція naming a рахунок, категорія or джерело the бекап does not contain; a ліміт or ціль on a
рахунок or категорія it does not contain; a ціль whose currency differs from its рахунок's; a чек
naming a транзакція it does not contain, two чеки naming one транзакція, or two чеки of one
identity; a позиція naming a чек it does not contain; a сума that is not an integer in minor
units, or a сума without its currency code. The contradiction SHALL be found before anything local
is touched.

#### Scenario: A transaction pointing outside the бекап stops the restore

- **WHEN** restoring a бекап holding a витрата whose рахунок is not among the бекап's рахунки is
  attempted
- **THEN** the бекап is refused as inconsistent and every рахунок and транзакція on the phone is
  exactly what it was

#### Scenario: A ціль in another currency than its рахунок stops the restore

- **WHEN** restoring a бекап holding a ціль with a USD target on a UAH рахунок is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes

#### Scenario: A чек pointing outside the бекап stops the restore

- **WHEN** restoring a бекап holding a чек whose транзакція is not among the бекап's транзакції is
  attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes
