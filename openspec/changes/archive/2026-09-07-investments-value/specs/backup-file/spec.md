## ADDED Requirements

### Requirement: A бекап carries the поточна вартість of every інвестиційний рахунок

A бекап SHALL carry the поточна вартість of every рахунок that has one — its integer minor-unit
сума with its currency code and the дата it carries — and restoring SHALL put them back exactly as
they were, at most one per рахунок. A вартість is hand-entered and can be recomputed from nothing:
unlike a баланс it is not explained by транзакції, so a бекап that dropped it would lose the only
record of what an інвестиція is worth, and a restored phone would show вкладено alone for рахунки
whose worth the owner had already told the app.

A restore SHALL replace the вартості wholesale like every other part of the state: the вартості of
the phone being restored onto SHALL be gone, whether or not the бекап names one for the same
рахунок, so no figure from the replaced state survives beside the restored ones. A бекап written
before поточні вартості existed SHALL still restore, leaving the phone with none.

A бекап SHALL be refused whole, with nothing restored, when a вартість it carries names a рахунок
the бекап does not contain, names a рахунок that is not of вид `investment`, is in a currency other
than that рахунок's own, names the same рахунок more than once, or carries a negative сума — the
same shapes storage itself refuses, found before anything local is touched.

#### Scenario: A вартість survives the round trip

- **WHEN** a бекап is made on a device where a UAH `investment` рахунок has a поточна вартість of
  560000 minor units UAH dated 2026-08-28, and that бекап is restored onto storage holding nothing
- **THEN** that рахунок has a поточна вартість of 560000 minor units UAH dated 2026-08-28 again,
  its вкладено is what its restored транзакції say, and its прибуток is the difference between them

#### Scenario: A restore replaces the вартості it finds

- **WHEN** a бекап naming a вартість for one рахунок and none for another is restored onto a phone
  where both рахунки have вартості
- **THEN** the first рахунок holds the бекап's вартість and the second holds none — no вартість of
  the replaced state is left behind

#### Scenario: A бекап written before вартості existed still restores

- **WHEN** a бекап that names no поточна вартість, because it was written before they existed, is
  restored
- **THEN** its рахунки, транзакції and settings are restored and no рахунок has a поточна вартість
  afterwards

#### Scenario: A вартість pointing outside the бекап stops the restore

- **WHEN** restoring a бекап holding a вартість whose рахунок is not among the бекап's рахунки is
  attempted
- **THEN** the бекап is refused as inconsistent and every рахунок, транзакція and вартість on the
  phone is exactly what it was

#### Scenario: A вартість on the wrong вид or in the wrong currency stops the restore

- **WHEN** restoring a бекап holding a вартість for a рахунок of вид `savings`, or one of 10000
  minor units USD for a UAH `investment` рахунок, is attempted
- **THEN** the бекап is refused as inconsistent and nothing local changes
