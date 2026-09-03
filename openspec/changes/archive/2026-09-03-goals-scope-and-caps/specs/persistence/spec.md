## ADDED Requirements

### Requirement: An existing one-рахунок ціль becomes a ціль-накопичення over that one рахунок

The migration that introduces the склад SHALL turn every ціль already stored — each of which names
exactly one рахунок — into a ціль-накопичення whose склад holds that one рахунок and nothing else,
keeping its id, its назва, its target сума, its currency and its дата unchanged. No stored ціль
SHALL lose its сума, change its currency, gain or lose a дата, or come to name a different рахунок.
After the migration, such a ціль's progress SHALL be exactly the progress it showed before it: that
one рахунок's розрахунковий баланс.

Every row stored under the previously committed migrations — рахунки, транзакції, категорії,
ліміти and the rest — SHALL survive unchanged, and the committed migrations themselves SHALL NOT
be edited.

#### Scenario: A stored ціль keeps every field and gains its склад

- **WHEN** a database holding the ціль «Авто» — 20000000 minor units UAH, дата 2026-12-31, linked
  to the банка «Подушка» — is migrated to the current shape
- **THEN** «Авто» is a ціль-накопичення of 20000000 minor units UAH with дата 2026-12-31 whose
  склад holds exactly «Подушка», under the same id

#### Scenario: The migrated ціль shows the progress it showed before

- **WHEN** «Подушка» holds a розрахунковий баланс of 5000000 minor units UAH before and after the
  migration
- **THEN** «Авто»'s progress is 5000000 minor units UAH before and after it

#### Scenario: Two цілі on one рахунок both keep it

- **WHEN** a database holding two цілі linked to the same рахунок is migrated
- **THEN** both цілі exist, and each holds that one рахунок in its own склад

#### Scenario: Nothing else in the database moves

- **WHEN** a database holding рахунки, транзакції, категорії, ліміти and цілі is migrated
- **THEN** every рахунок, транзакція, категорія and ліміт reads back exactly as before

## MODIFIED Requirements

### Requirement: Цілі survive a restart

The system SHALL store each ціль — its назва, target integer minor-units сума with currency code,
and its дата where it has one — together with its **склад**: the ids of the рахунки whose money it
counts, each рахунок standing in one ціль's склад at most once. It SHALL read all of that back
unchanged after storage is closed and reopened, including the absence of a дата. Replacing a stored
ціль under its id SHALL persist the changed values and the changed склад, adding and removing
рахунки; removing a ціль SHALL remove it and its склад and nothing else.

Storage SHALL reject a ціль whose склад names a рахунок id not present in storage, a ціль whose
склад is empty, a ціль naming the same рахунок twice, and a ціль whose currency is neither UAH nor
the single currency shared by every рахунок of its склад — the mismatches the goals capability
forbids are not representable in storage either. A ціль's currency SHALL NOT be required to equal
any one рахунок's currency.

A ціль витрат SHALL need no storage of its own: it is the ліміт of its категорія, which already
survives a restart under the ліміт's own requirement.

The ціль storage SHALL arrive by new migrations — committed migrations stay untouched — and every
row stored under the previously committed migrations SHALL survive them unchanged.

#### Scenario: A stored ціль round-trips

- **WHEN** a ціль «Машина» with a target of 70000000 minor units UAH, дата 2027-06-30 and a склад
  of three stored рахунок ids is stored and storage is closed and reopened
- **THEN** the ціль reads back with the same назва, target, currency, дата and exactly those three
  рахунок ids

#### Scenario: A ціль without a дата round-trips without one

- **WHEN** a ціль with no дата is stored and storage is closed and reopened
- **THEN** it reads back with no дата — not with today's date and not with an empty string

#### Scenario: A replaced ціль keeps its id and new values

- **WHEN** a stored ціль is replaced under its id with a target of 75000000 minor units UAH and a
  склад of two рахунки instead of three
- **THEN** loading that id returns the ціль with the new target and exactly those two рахунки

#### Scenario: A removed ціль is gone and nothing else is

- **WHEN** two цілі are stored and one is removed
- **THEN** only the other remains with its own склад intact, and every рахунок, ліміт and
  транзакція is unchanged

#### Scenario: An unknown рахунок id is rejected

- **WHEN** a ціль whose склад names a рахунок id that does not exist in storage is stored
- **THEN** storage rejects it with an error and nothing is stored

#### Scenario: An empty склад is rejected

- **WHEN** a ціль with no рахунок in its склад is stored
- **THEN** storage rejects it with an error and nothing is stored

#### Scenario: The same рахунок twice is rejected

- **WHEN** a ціль whose склад names one рахунок id twice is stored
- **THEN** storage rejects it with an error and nothing is stored — the caller deduplicates before
  it asks, and a склад that names a рахунок twice is a mistake, not a set

#### Scenario: A currency mismatching the рахунок is rejected

- **WHEN** a ціль with a EUR target whose склад holds two USD рахунки is stored
- **THEN** storage rejects it with an error and nothing is stored

#### Scenario: A UAH ціль over рахунки of several currencies is stored

- **WHEN** a ціль with a UAH target whose склад holds a UAH, a USD and a EUR рахунок is stored
- **THEN** it reads back with its UAH target and all three рахунки

#### Scenario: A ціль in its склад's one currency is stored

- **WHEN** a ціль with a USD target whose склад holds two USD рахунки is stored
- **THEN** it reads back with its USD target and both рахунки

#### Scenario: A fresh database from migrations alone stores цілі

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** рахунки can be stored, and a ціль whose склад holds several of them can be stored and
  read back

### Requirement: The whole stored state can be read as one snapshot

The system SHALL read the whole stored state as one snapshot: every рахунок, категорія, джерело,
правило, ліміт, ціль **with the склад of рахунки it counts**, and транзакція, the marker of a
committed Saldo import, every monobank account with its link, sync boundary, cursor, moment it last
synced and imported item ids, and every відстежуваний застосунок with the рахунок it lands on —
each exactly once, with the values that are stored. The snapshot SHALL NOT include the cached
monobank rates, the fingerprints of captured notifications or any pending чернетка, and no monobank
token SHALL be read to build it.

#### Scenario: Everything stored is in the snapshot exactly once

- **WHEN** a device holding рахунки, категорії, джерела, правила, ліміти, цілі, транзакції of all
  five types across three months, a Saldo import marker, a monobank account with a link, a cursor,
  a moment it last synced and two imported item ids, and one відстежуваний застосунок is read as a
  snapshot
- **THEN** every one of those rows appears in the snapshot exactly once, with the values stored

#### Scenario: A ціль's склад is in the snapshot

- **WHEN** a device holding a ціль whose склад names three рахунки is read as a snapshot
- **THEN** the snapshot holds that ціль with exactly those three рахунок ids, each once

#### Scenario: The snapshot leaves out the cache and the captures

- **WHEN** a device that also holds a cached monobank rate, two pending чернетки and the
  fingerprints of decided notifications is read as a snapshot
- **THEN** the snapshot holds no rate, no чернетка and no fingerprint

### Requirement: The whole stored state can be replaced by a snapshot as one unit

The system SHALL replace the whole stored state with a snapshot as a single unit: after it, the
рахунки, категорії, джерела, правила, ліміти, цілі **with their склади**, транзакції, Saldo import
marker, monobank accounts, links, cursors, last-sync moments, imported item ids and відстежувані
застосунки SHALL be exactly the snapshot's, and the pending чернетки and the рахунок the entry form
remembers SHALL be gone. No склад of a ціль the snapshot does not hold SHALL survive the
replacement. The fingerprints of decided notifications and the cached monobank rates SHALL be left
untouched. If any part cannot be stored, none of it SHALL be: everything that was stored before
SHALL be exactly what is stored after.

#### Scenario: A replaced state is the snapshot's and nothing else

- **WHEN** a snapshot holding one рахунок, three транзакції and one категорія is stored as a
  replacement on a device holding four other рахунки, two hundred other транзакції and a pending
  чернетка
- **THEN** afterwards storage holds exactly that рахунок, those three транзакції and the
  snapshot's категорії, джерела, правила, ліміти and цілі, and no чернетка

#### Scenario: A replacement that fails partway stores nothing

- **WHEN** storing a snapshot whose last транзакція references a категорія the snapshot does not
  hold is attempted
- **THEN** the replacement is rejected and every рахунок, транзакція, ліміт, ціль, правило and
  monobank row the device held before is still there, unchanged

#### Scenario: The rate cache and the fingerprints survive a replacement

- **WHEN** a snapshot is stored as a replacement on a device holding a cached monobank rate for
  USD and the fingerprints of decided notifications
- **THEN** the rate and the fingerprints are still readable afterwards, unchanged

#### Scenario: Replacing leaves no склад behind

- **WHEN** a snapshot is stored as a replacement on a device whose цілі held склади of their own
- **THEN** no склад row of any ціль the snapshot does not hold remains, and each ціль the snapshot
  does hold has exactly the склад the snapshot gave it
