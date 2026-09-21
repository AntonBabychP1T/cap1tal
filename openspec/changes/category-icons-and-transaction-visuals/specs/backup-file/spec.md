## ADDED Requirements

### Requirement: A бекап carries every категорія's іконка

A бекап SHALL carry the іконка of every категорія that holds one, beside its назва and archived
flag, and restoring SHALL put each back exactly as it was carried — an іконка the owner picked, a
starting one, and one this installation's catalogue does not hold alike, so an іконка is never lost
by passing through a phone that cannot draw it. A категорія that holds no іконка yet — the app has
not had an opening since it gained іконки, or the бекап was written before they existed — SHALL be
carried without one and restored without one, filling in nothing the бекап does not name. Such a
категорія SHALL be shown with its starting іконка from the moment it is restored, and SHALL be given
it in storage on the next opening, exactly as a категорія stored before іконки existed is. Джерела
carry none.

A бекап in which a категорія's іконка is neither absent (missing, or written as nothing) nor a
non-empty text SHALL be refused as damaged, whole, with nothing restored.

#### Scenario: A custom іконка survives the round trip

- **WHEN** a бекап is made on a device where Pets carries «Подарунки» and «Ремонт» carries
  «Ремонт», and that бекап is restored onto storage that holds nothing
- **THEN** Pets carries «Подарунки» and «Ремонт» carries «Ремонт» again

#### Scenario: Restore of an old бекап without іконки

- **WHEN** a бекап written before іконки existed, holding Groceries renamed to «Їжа», a категорія
  «Кафе», a категорія «Юрко» and the reserved rows, is restored
- **THEN** the restored категорії hold exactly what the бекап named and no іконка; «Їжа» is shown
  with «Продукти», «Кафе» with «Кава», «Юрко» with «Інше» and «Без категорії» with «Питання»; every
  транзакція still lands in its категорія; and after the next opening each of them holds that
  іконка in storage

#### Scenario: A бекап taken before the fill-in ran restores with starting іконки

- **WHEN** a бекап is made while some категорії hold no іконка yet — the app updated, and a
  background бекап ran before any opening — and it is restored
- **THEN** the бекап is accepted, those категорії are restored holding no іконка and are shown with
  their starting ones, and the категорії that held an іконка hold the same one again

#### Scenario: An іконка this installation does not know is carried through

- **WHEN** a бекап holding a категорія whose іконка this installation's catalogue does not hold is
  restored, and a new бекап is made from the restored phone
- **THEN** the категорія is drawn with «Інше» on this phone, and the new бекап carries the same
  іконка the first one did

#### Scenario: A malformed іконка refuses the бекап

- **WHEN** restoring a бекап whose категорія carries an іконка that is a number, or empty text, is
  attempted
- **THEN** the бекап is refused as damaged and every категорія and транзакція on the phone is
  exactly what it was

#### Scenario: A бекап with іконки is refused by an app that predates them

- **WHEN** a бекап made after this change is restored on an installation whose storage shape is
  older
- **THEN** it is refused as coming from a newer version of the app, and nothing local changes
