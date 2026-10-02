## ADDED Requirements

### Requirement: The шаблон mapping survives a restart

The owner's choice for each базова категорія — the категорія of this device it lands in, or that it
is switched off — SHALL be stored and SHALL be read back unchanged after a restart. A базова
категорія the owner has never touched SHALL be stored as nothing at all, so it keeps following its
типова категорія as the app's шаблон changes with the app.

Storage SHALL hold at most one choice per базова категорія, and a stored choice naming a категорія
SHALL reference a stored категорія — a категорія a choice points at SHALL NOT be deletable out from
under it. The шаблон itself — which merchants and MCC codes each базова категорія covers — SHALL
NOT be stored: it is the app's, and storage holds only what the owner decided about it.

The mapping SHALL arrive by a new migration that leaves every stored row as it is.

#### Scenario: A choice is read back after a restart

- **WHEN** «Продукти» is pointed at «Їжа» and «Алкоголь і тютюн» is switched off, and storage is
  opened again
- **THEN** «Продукти» reads back as «Їжа», «Алкоголь і тютюн» reads back as off, and every other
  базова категорія reads back as untouched

#### Scenario: One choice per базова категорія

- **WHEN** «Продукти» is pointed at «Їжа» and then at «Groceries»
- **THEN** storage holds exactly one choice for «Продукти» and it names Groceries

#### Scenario: A категорія a choice points at cannot be deleted out from under it

- **WHEN** deleting a категорія that a stored choice names is attempted
- **THEN** it is refused and both the категорія and the choice are unchanged

#### Scenario: The migration keeps what is stored

- **WHEN** storage holding рахунки, транзакції, категорії and правила is brought to the shape that
  has the mapping
- **THEN** every stored row is unchanged and no базова категорія has a stored choice
