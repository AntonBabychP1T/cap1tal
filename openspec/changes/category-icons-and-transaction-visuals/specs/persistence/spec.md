## ADDED Requirements

### Requirement: A категорія's іконка survives a restart

A категорія's stored іконка SHALL be read back exactly as it was stored after storage is closed and
reopened — an іконка the owner picked, a starting one, and one this installation's catalogue does
not hold alike — together with its назва and its archived flag.

#### Scenario: A picked іконка round-trips

- **WHEN** a категорія «Ремонт» carrying «Ремонт», and an archived Pets carrying «Подарунки», are
  stored, and storage is closed and reopened
- **THEN** both are read back with the same назва, archived flag and іконка

#### Scenario: An іконка this installation does not know round-trips unchanged

- **WHEN** a категорія is stored carrying an іконка this installation's catalogue does not hold,
  and storage is closed and reopened
- **THEN** the same іконка is read back

### Requirement: The іконка arrives by a new migration that keeps every stored row, and missing ones are filled in on opening

The категорія's іконка SHALL be introduced by a new migration; committed migrations SHALL stay
untouched. Every рахунок, категорія, джерело, правило, ліміт, ціль and транзакція stored under the
previously committed migrations SHALL survive the new migration unchanged — ids, назви, archived
flags and every reference intact.

After the migration a категорія may hold no іконка yet. Such a категорія SHALL be shown with its
starting іконка from the first frame — a reserved row its fixed one, a starter row its own whatever
it is named now, any other row the one its current назва suggests — and SHALL be given exactly that
іконка in storage during that same opening. A категорія already holding an іконка SHALL NOT be
touched, and filling in SHALL change nothing else about any row. Filling in is not seeding: seeding
still creates only what is missing and changes no row that exists; filling in writes only an іконка,
and only where none is held.

#### Scenario: Pre-migration rows survive the migration unchanged

- **WHEN** a renamed starter категорія, an archived категорія, a правило onto it, a ліміт on it, a
  витрата and a повернення in it and a коригування are stored under the previously committed
  migrations alone, and the database is brought to the current shape
- **THEN** all of them load unchanged — ids, назви, archived flags, types, суми, currencies, дати
  and references intact

#### Scenario: Existing категорії get their starting іконки on the first opening

- **WHEN** a device holds Groceries renamed to «Їжа», a категорія «Кава з собою» the owner created
  by hand, a категорія «Юрко» and «Без категорії», all stored before іконки existed, and the app is
  brought to the current shape and opened
- **THEN** «Їжа» carries «Продукти», «Кава з собою» carries «Кава», «Юрко» carries «Інше» and «Без
  категорії» carries «Питання»

#### Scenario: Filling in happens once

- **WHEN** after the first opening the owner changes «Юрко» to «Подарунки», and the app is opened
  again
- **THEN** «Юрко» still carries «Подарунки»

#### Scenario: A fresh database from migrations alone stores an іконка

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a категорія with an іконка can be stored and read back with it
