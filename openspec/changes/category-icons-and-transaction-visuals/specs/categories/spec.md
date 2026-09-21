## ADDED Requirements

### Requirement: Every категорія carries an іконка from the app's own catalogue

Every категорія SHALL carry exactly one іконка категорії, drawn from a fixed catalogue built into
the app. The catalogue SHALL hold 48 іконки the owner may pick, each with a Ukrainian name and
grouped by meaning, covering at least: продукти, супермаркет, ресторан, кава, фастфуд, випічка,
доставка; авто, пальне, громадський транспорт, таксі, паркування; дім, комунальні, ремонт, меблі,
платежі; одяг, взуття, покупки; електроніка, телефон, інтернет, підписки; здоров'я, аптека, спорт,
краса, послуги; освіта, книги; подорожі, авіа, готель; розваги, кіно, ігри, музика; подарунки,
сім'я, діти, тварини, благодійність; фінанси, гроші, відсоток, робота; and «Інше», the generic
one. Two further іконки, «Питання» and «Плюс-мінус», SHALL exist only for the reserved rows below.

An іконка SHALL be a picture the app draws itself: never an image fetched from the network, never
a file the owner supplies, never an emoji. It SHALL change no number the app computes — no
витрачено, ліміт verdict, ціль, звіт or пакет для аналізу reads it.

#### Scenario: The catalogue offers the pickable іконки

- **WHEN** the owner is offered the іконки to choose from for a категорія
- **THEN** exactly 48 are offered, each with its own Ukrainian name, among them «Продукти», «Кава»,
  «Таксі», «Аптека», «Подорожі», «Тварини» and «Інше», and neither «Питання» nor «Плюс-мінус» is
  among them

#### Scenario: An іконка moves no number

- **WHEN** August holds витрати of 260000 minor units UAH in Groceries, Groceries carries a ліміт
  of 250000 minor units UAH, and the owner changes Groceries' іконка from «Продукти» to «Кава»
- **THEN** August's витрачено, the Groceries breakdown row and its over-limit verdict are exactly
  what they were before the change

### Requirement: The reserved категорії carry fixed іконки

«Без категорії» SHALL carry «Питання», «Комісія» SHALL carry «Відсоток» and «Коригування» SHALL
carry «Плюс-мінус». Like their names, these іконки SHALL NOT be changeable: an attempt to change
one SHALL be rejected and leave the row as it was. «Питання» and «Плюс-мінус» SHALL NOT be offered
to the owner for any other категорія, and creating or editing any other категорія with one of them
SHALL be rejected — they say "not yet categorised" and "unexplained money", and a категорія of the
owner's that wore them would look like one of those states. (A бекап that carries one on another
категорія is restored as it is and drawn as «Інше» — see below.)

#### Scenario: Reserved rows show their fixed іконки

- **WHEN** the owner opens the categories list on any device
- **THEN** «Без категорії» carries «Питання», «Комісія» carries «Відсоток» and «Коригування»
  carries «Плюс-мінус»

#### Scenario: Changing a reserved row's іконка is rejected

- **WHEN** the owner attempts to give «Без категорії» the іконка «Кава»
- **THEN** the change is rejected and «Без категорії» still carries «Питання»

#### Scenario: An app-only іконка cannot be given to the owner's категорія

- **WHEN** creating a категорія «Різне» with «Питання», or editing Groceries to carry «Плюс-мінус»,
  is attempted
- **THEN** both are rejected, no «Різне» exists, and Groceries keeps the іконка it had

### Requirement: The starter set arrives with its own іконки

Every starter категорія SHALL be seeded with an іконка chosen for it: Home «Дім», COFFEE ☕ «Кава»,
Groceries «Продукти», Entertainment «Розваги», Family care «Сім'я», Transport «Авто», Travel
«Подорожі», Bills «Платежі», Gifts «Подарунки», Eating out «Ресторан», Food Delivery «Доставка»,
KrayShop «Покупки», Digital «Підписки», Electronics «Електроніка», сімейний бюджет «Гроші»,
Clothing «Одяг», Health «Здоров'я», book «Книги», Pets «Тварини», Other expense «Інше», Charity
«Благодійність», Education «Освіта», habits «Інше», булка «Випічка», Services «Послуги». A starter
row's іконка SHALL follow the row, not its name: a starter категорія the owner has renamed still
starts with the іконка chosen for it. A starter row created before категорії carried іконки is not
changed by seeding; it receives this іконка when the missing іконки are filled in on opening (see
persistence).

#### Scenario: A fresh install holds the starter іконки

- **WHEN** the app is opened for the first time on an empty device
- **THEN** Groceries carries «Продукти», COFFEE ☕ carries «Кава», булка carries «Випічка» and
  Other expense carries «Інше»

#### Scenario: A renamed starter категорія starts with its own іконка

- **WHEN** the owner had renamed Groceries to «Їжа» before категорії carried іконки, and the app
  is brought to the current shape and opened
- **THEN** «Їжа» carries «Продукти»

### Requirement: Any other name starts with the іконка its words suggest

A категорія that is neither reserved nor a starter row SHALL start with the іконка its назва
suggests through a fixed keyword table built into the app: Ukrainian and English words, matched at
the start of a word of the назва with letter case ignored, the first entry of the table that
matches deciding. A назва no entry matches SHALL start with «Інше». The suggestion SHALL be
deterministic — the same назва always suggests the same іконка — and SHALL involve no language
model and no network.

#### Scenario: A Ukrainian name suggests its іконка

- **WHEN** a категорія named «Кафе біля дому» starts with a suggested іконка
- **THEN** it is «Кава»

#### Scenario: Letter case does not matter

- **WHEN** категорії named «ТАКСІ» and «таксі» each start with a suggested іконка
- **THEN** both start with «Таксі»

#### Scenario: An English name suggests its іконка

- **WHEN** a категорія named «Pharmacy» starts with a suggested іконка
- **THEN** it is «Аптека»

#### Scenario: An unknown category name gets the generic іконка

- **WHEN** a категорія named «Юрко» starts with a suggested іконка
- **THEN** it is «Інше»

#### Scenario: The suggestion is the same every time

- **WHEN** «Продукти АТБ» is suggested an іконка twice, on two separate openings of the app
- **THEN** both times it is «Продукти»

### Requirement: The owner chooses the іконка when creating a категорія and can change it

Creating a категорія SHALL take a назва and an іконка from the pickable catalogue; a категорія
created without an іконка being chosen SHALL be stored with the one its назва suggests. The owner
SHALL be able to change the іконка of any категорія that is not reserved, archived ones included,
and to change its назва and іконка together as one save. A save the categories rules reject — an
empty назва, a new назва another unarchived категорія carries — SHALL store neither the new назва
nor the new іконка; a save that keeps the категорія's назва as it is SHALL NOT be refused for that
назва, even where an unarchived категорія of the same назва exists beside an archived one. An іконка
the catalogue does not offer SHALL be rejected.

#### Scenario: A new категорія is created with the іконка picked

- **WHEN** the owner creates the категорія «Ремонт» and picks the іконка «Ремонт»
- **THEN** «Ремонт» exists and carries «Ремонт»

#### Scenario: A new категорія created without a pick carries its suggestion

- **WHEN** the owner creates the категорія «Кава з собою» without picking an іконка
- **THEN** it is stored carrying «Кава»

#### Scenario: The іконка is changed

- **WHEN** the owner changes the іконка of Pets from «Тварини» to «Подарунки»
- **THEN** Pets carries «Подарунки», its назва is still Pets, and its витрати still reference it

#### Scenario: A refused save changes nothing

- **WHEN** the owner edits Pets to the назва Groceries, while an unarchived Groceries exists, and
  the іконка «Кава», and saves
- **THEN** the save is rejected, and Pets is still named Pets and still carries the іконка it had

#### Scenario: An archived категорія's іконка can be changed

- **WHEN** the owner archives habits and then changes its іконка to «Спорт»
- **THEN** habits carries «Спорт» and is still archived

#### Scenario: An archived категорія sharing its назва with an unarchived one can have its іконка changed

- **WHEN** the owner has archived Pets, created a new unarchived Pets, and changes only the іконка
  of the archived Pets to «Подарунки»
- **THEN** the change is stored, the archived Pets carries «Подарунки» and is still archived, and
  the new Pets is untouched

### Requirement: A stored іконка changes only when the owner changes it

Once a категорія carries an іконка, only the owner changing it SHALL change it. Renaming SHALL NOT
change it, whatever the new назва would suggest; archiving and unarchiving SHALL keep it; reopening
the app, seeding, an import and a restore of the same state SHALL NOT recompute it. An archived
категорія SHALL keep showing its іконка wherever its history is shown, exactly as it keeps its
назва.

#### Scenario: A rename keeps the owner's іконка

- **WHEN** a категорія named «Кафе» carries «Кава» and the owner renames it to «Таксі»
- **THEN** it is named «Таксі» and still carries «Кава»

#### Scenario: A picked іконка survives reopening

- **WHEN** the owner picks «Ігри» for a категорія named «Кава з друзями» and the app is reopened
- **THEN** it still carries «Ігри», not the «Кава» its назва suggests

#### Scenario: Archiving keeps the іконка on its history

- **WHEN** Pets carries «Тварини», holds витрати in August, and the owner archives it
- **THEN** Pets is not offered when recording a витрата, and its August витрати still show Pets with
  «Тварини»

#### Scenario: Unarchiving keeps the іконка

- **WHEN** the owner archives Pets, which carries «Подарунки», and unarchives it
- **THEN** Pets carries «Подарунки»

### Requirement: An іконка the catalogue does not know is drawn as «Інше»

A категорія that is not reserved and whose stored іконка is not one of the pickable іконки of this
installation's catalogue — one a newer version of the app stored, arriving by a бекап, or an
app-only one a бекап put there — SHALL be drawn with «Інше» everywhere it is shown, and its stored
іконка SHALL stay as it is until the owner picks another. No категорія SHALL ever be drawn without
an іконка.

#### Scenario: An unknown stored іконка is drawn generic and kept

- **WHEN** a категорія's stored іконка is one this installation's catalogue does not hold
- **THEN** it is drawn with «Інше», and reading it back from storage still returns the іконка that
  was stored

#### Scenario: An app-only іконка on the owner's категорія is drawn generic

- **WHEN** a restored категорія Groceries carries «Питання»
- **THEN** Groceries is drawn with «Інше», and only «Без категорії» is drawn with «Питання»
