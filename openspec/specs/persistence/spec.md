# persistence Specification

## Purpose

Keeps the owner's accounts and transactions on the device across app restarts — the stored history
that the computed balance, the monthly picture and every future screen read. Storage is faithful:
what comes back is exactly what was put in, down to the minor unit and currency code.
## Requirements
### Requirement: Accounts and transactions survive a restart

Stored accounts and transactions SHALL remain readable after storage is closed and reopened; the
data SHALL live only on the device.

#### Scenario: Reopening storage returns what was stored

- **WHEN** an account and an expense of 12550 minor units UAH on it are stored, and storage is
  closed and reopened
- **THEN** the account and the expense are read back with the same values

### Requirement: Every transaction type round-trips through storage unchanged

The system SHALL store and load every transaction type — `expense`, `income`, `transfer`,
`refund`, `correction` — returning exactly the values stored: the type, the date, the account or
accounts touched, integer minor-unit amounts with their currency codes, the category of an
expense or refund, the source of an income, both legs of a transfer, and the informational
original-currency amount of an expense when present. Loading an id that was never stored SHALL
return nothing, not an error.

No transaction SHALL carry an exchange rate, and no rate SHALL be derived or stored for one. The
monobank rate this change caches is not one: it belongs to no transaction, is written by nothing
the owner does, and is read only for the display-only approximation.

#### Scenario: Expense with an original-currency amount round-trips

- **WHEN** an expense of 420000 minor units UAH with an original-currency amount of 10000 minor
  units USD is stored and loaded
- **THEN** the loaded expense holds 420000 minor units UAH, category unchanged, and the
  original-currency amount of 10000 minor units USD

#### Scenario: Cross-currency transfer round-trips with two legs and no rate

- **WHEN** a transfer that left a UAH card as 410000 minor units UAH and arrived at a USD account
  as 10000 minor units USD is stored and loaded
- **THEN** the loaded transfer holds both accounts and both amounts in their own currencies, and
  no exchange rate is stored for it or derived from it

#### Scenario: A cached monobank rate reaches no transaction

- **WHEN** a monobank rate for USD is stored and a cross-currency transfer is loaded
- **THEN** the loaded transfer still holds only its two legs, and nothing on it changes because a
  rate exists

#### Scenario: Income, refund and correction round-trip

- **WHEN** an income of 5000000 minor units UAH with source "salary", a refund of 80000 minor
  units UAH in category "clothes", and a correction of −3000 minor units UAH are stored and loaded
- **THEN** each comes back with its type, amount, currency and category or source unchanged,
  including the correction's negative sign

#### Scenario: Loading an unknown id returns nothing

- **WHEN** a transaction id that was never stored is loaded
- **THEN** no transaction is returned and no error is raised

### Requirement: A stored transaction references stored accounts

The system SHALL reject storing a transaction that references an account id not present in
storage.

#### Scenario: A transaction referencing an unknown account is rejected

- **WHEN** an expense referencing an account id that does not exist in storage is stored
- **THEN** storage rejects it with an error

### Requirement: Migrations bring an empty database to the current shape

Applying every committed migration in order to an empty database SHALL produce storage that holds
accounts and every transaction type. Committed migrations SHALL never be edited; the schema
evolves only by adding new migrations.

#### Scenario: A fresh install starts from migrations alone

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** an account and one transaction of each of the five types can be stored and read back

### Requirement: A calendar month's transactions can be read

The system SHALL list the stored transactions of one calendar month; a transaction belongs to the
month of its date.

#### Scenario: Month boundaries are respected

- **WHEN** one expense is stored dated the last day of March and another the first day of April
- **THEN** listing March returns only the first and listing April returns only the second

### Requirement: An account's transactions can be read

The system SHALL list the stored transactions touching one account, including transfers where the
account is the source or the destination.

#### Scenario: Both transfer legs count as touching

- **WHEN** an account has a stored expense, a stored transfer arriving at it, and an unrelated
  transaction between two other accounts is also stored
- **THEN** listing the account's transactions returns the expense and the transfer, and not the
  unrelated transaction

### Requirement: A stored transaction can be replaced or removed

The system SHALL replace a stored transaction with an updated one under the same id, and SHALL
remove a stored transaction so that it no longer appears in any listing.

#### Scenario: Retyping an expense into a transfer keeps the id

- **WHEN** a stored expense is replaced under the same id by a transfer between two accounts
- **THEN** loading that id returns the transfer and the expense is gone

#### Scenario: A removed transaction disappears from listings

- **WHEN** a stored expense is removed
- **THEN** it no longer appears in the listing of its month or its account

### Requirement: The archived flag round-trips through storage

The system SHALL store whether an account is archived and return it unchanged on load; an account
stored without the flag SHALL load as unarchived. The flag SHALL be stored by a new migration —
committed migrations stay untouched.

#### Scenario: An archived account survives a restart

- **WHEN** an account is stored as archived, and storage is closed and reopened
- **THEN** the account loads as archived

#### Scenario: A fresh database from migrations alone stores the flag

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** an archived account and an unarchived account can be stored and read back with their
  flags intact

#### Scenario: A pre-migration account loads unarchived

- **WHEN** an account row stored under the previously committed migrations alone is brought to
  the current shape by the new migration and loaded
- **THEN** it loads unarchived, with its name, kind, currency and opening balance unchanged

### Requirement: The latest stored transactions can be listed

The system SHALL list the latest stored transactions up to a requested count, ordered by date,
newest date first; transactions of the same date SHALL be ordered by when they were stored, most
recently stored first. Replacing a stored transaction under its id SHALL NOT change its place
among transactions of the same date; a replacement carrying a different date SHALL take the place
its new date gives it.

#### Scenario: Newest date comes first

- **WHEN** an expense dated 2026-08-20 and an expense dated 2026-08-24 are stored, and the latest
  transactions are listed
- **THEN** the expense dated 2026-08-24 comes before the expense dated 2026-08-20

#### Scenario: Same-date transactions are ordered by storage recency

- **WHEN** two expenses with the same date are stored one after the other
- **THEN** the one stored second comes first in the latest listing

#### Scenario: The requested count is respected

- **WHEN** three transactions are stored and the latest two are requested
- **THEN** exactly the two latest are returned, in order

#### Scenario: Replacing a transaction keeps its place

- **WHEN** two same-date expenses are stored one after the other, and the first-stored one is
  then replaced under its id with a changed amount
- **THEN** the second-stored expense still comes first in the latest listing

#### Scenario: A replacement with a new date takes its new place

- **WHEN** an expense dated 2026-08-20 and an expense dated 2026-08-24 are stored, and the one
  dated 2026-08-20 is then replaced under its id with the date 2026-08-25
- **THEN** the replaced expense comes first in the latest listing

### Requirement: The last obtained monobank rate survives a restart

The system SHALL store, per currency, the most recently obtained monobank rate together with the
moment it was obtained, and after a restart SHALL read back the same rate and the same moment.
Obtaining a newer rate for a currency SHALL replace that currency's stored rate. The stored rate
is a cache for the display-only approximation: losing it SHALL lose nothing but the approximate
figure until a rate is obtained again.

#### Scenario: A stored rate is still there after a restart

- **WHEN** a monobank rate for USD is stored and the app restarts
- **THEN** reading the rate for USD returns the same rate and the moment it was obtained

#### Scenario: A newer rate replaces the older one

- **WHEN** a rate for USD is stored and a newer rate for USD is obtained
- **THEN** reading the rate for USD returns only the newer rate and its moment

### Requirement: Categories, sources and rules survive a restart

Stored categories, sources and rules SHALL remain readable after storage is closed and reopened,
returning exactly what was stored: names, the archived flag, and a rule's merchant pattern, MCC
and target category.

#### Scenario: A renamed, archived and ruled state round-trips

- **WHEN** a category renamed to «Продукти», an archived source, and a rule with merchant pattern
  "сільпо", MCC 5411 and target «Продукти» are stored, and storage is closed and reopened
- **THEN** all three are read back with the same values, including the archived flag and both
  rule criteria

### Requirement: A transaction references stored categories and sources

The system SHALL reject storing a витрата or повернення whose category id is not present in
storage, and a дохід whose source id is not present in storage. Every other scenario of this
capability that names a category or a source — the round-trips of витрата, повернення and дохід —
presumes those rows are in storage; they always are, because the starter set is seeded on every
opening and the reserved rows arrive with the migration.

#### Scenario: An unknown category id is rejected

- **WHEN** an expense referencing a category id that does not exist in storage is stored
- **THEN** storage rejects it with an error

#### Scenario: An unknown source id is rejected

- **WHEN** an income referencing a source id that does not exist in storage is stored
- **THEN** storage rejects it with an error

### Requirement: The category and source references arrive by a new migration that keeps stored rows

The categories, sources and rules tables and the transaction's category and source references
SHALL be introduced by a new migration; committed migrations SHALL stay untouched. Transaction
and account rows stored under the previously committed migrations SHALL survive the new migration
unchanged, and the reserved category ids they already carry SHALL satisfy the new references once
the reserved rows exist.

#### Scenario: Pre-migration transactions survive the migration unchanged

- **WHEN** an expense in the reserved uncategorised category, a витрата "Комісія" in the reserved
  fees category and a переказ are stored under the previously committed migrations alone, and the
  database is brought to the current shape
- **THEN** all three load unchanged — types, amounts, currencies, dates and category ids intact

#### Scenario: A fresh database from migrations alone stores every list

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a category, a source, a rule and one transaction of each of the five types can be
  stored and read back

### Requirement: An import plan is stored as one whole or not at all

The system SHALL store an import plan — its рахунки with their назви, види, currencies and
початкові залишки, the replaced початковий залишок of a рахунок the plan maps onto, its
категорії, its джерела, every транзакція of the plan in the plan's own order, and the marker
recording that an import was committed — as a single unit. If any part of it cannot be stored,
none of it SHALL be stored: the рахунки, категорії, джерела, транзакції and the marker that were
there before SHALL be exactly what is there after.

#### Scenario: A stored plan reads back whole

- **WHEN** a plan holding two рахунки, one new категорія, one new джерело and three транзакції is
  stored
- **THEN** both рахунки, the категорія, the джерело and all three транзакції read back with the
  values the plan held, and each рахунок's розрахунковий баланс is its початковий залишок plus its
  транзакції

#### Scenario: A plan that fails partway stores nothing

- **WHEN** storing a plan whose last транзакція references a категорія the plan never creates is
  attempted
- **THEN** storing is rejected and neither the рахунки, the категорії, the джерела nor the earlier
  транзакції of that plan are in storage

#### Scenario: A failed commit leaves no marker

- **WHEN** storing that plan is attempted on a device where no import was ever committed
- **THEN** reading the import marker afterwards still returns nothing

#### Scenario: A plan mapping onto an existing рахунок replaces its opening balance

- **WHEN** a plan whose рахунок carries an existing рахунок's id and a початковий залишок of 12300
  minor units UAH is stored, and that рахунок's stored початковий залишок was 5000
- **THEN** no second рахунок is created and the existing рахунок's початковий залишок is 12300
  minor units UAH

#### Scenario: The plan's order becomes the stored order

- **WHEN** a plan holding two транзакції of one date — the export's earlier one first — is stored
- **THEN** the latest listing returns the export's later one first, as it does for any two
  same-date транзакції stored one after the other

### Requirement: The moment of a committed import is stored

The system SHALL store the moment an import plan was committed and SHALL read it back after a
restart; committing another plan SHALL replace it with the newer moment. Before any import has
been committed, reading it SHALL return nothing, not an error. The marker SHALL be stored by a new
migration — committed migrations stay untouched — and рахунки, транзакції, категорії, джерела and
правила stored under the previously committed migrations SHALL survive it unchanged.

#### Scenario: The moment survives a restart

- **WHEN** an import plan is committed and storage is closed and reopened
- **THEN** reading the import marker returns the moment that import was committed

#### Scenario: Before any import there is no marker

- **WHEN** the import marker is read on a device where no import has been committed
- **THEN** nothing is returned and no error is raised

#### Scenario: A second import replaces the moment

- **WHEN** a second plan is committed later
- **THEN** reading the marker returns only the later moment

#### Scenario: A fresh database from migrations alone holds the marker

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** an import marker can be stored and read back, and a рахунок and one транзакція of each
  of the five types can still be stored and read back

#### Scenario: Rows stored before the migration survive it

- **WHEN** a рахунок, a категорія, a джерело, a правило and one транзакція of each type are stored
  under the previously committed migrations alone, and the database is brought to the current shape
- **THEN** all of them load unchanged and no import marker exists

### Requirement: Monobank links and progress survive a restart

The system SHALL store each active link's monobank account id, рахунок id, confirmed first-sync
boundary, committed cursor and latest баланс банку, and SHALL read them back unchanged after a
restart. A monobank account and a рахунок SHALL each occur in at most one active link, and every
stored balance SHALL carry the linked рахунок's currency.

#### Scenario: A link resumes after restart

- **WHEN** a UAH link with a confirmed boundary, committed cursor and баланс банку is stored and
  storage is reopened
- **THEN** the same monobank account is linked to the same UAH рахунок with the same boundary,
  cursor and bank balance

#### Scenario: A second active link is rejected

- **WHEN** storage already links monobank account M to рахунок A and an attempt is made to link M
  to рахунок B or another monobank account to A
- **THEN** the attempted second link is rejected and the existing link remains unchanged

### Requirement: Imported monobank item ids are remembered independently of transactions

The system SHALL store each imported monobank item id with its monobank account id and SHALL keep
that pair after the created транзакція is edited or deleted and after the account is unlinked, so
the item can never import twice.

#### Scenario: Deleting a transaction keeps its imported id

- **WHEN** an imported транзакція is deleted and storage is reopened
- **THEN** its monobank item id is still remembered and the same item is rejected as already
  imported

#### Scenario: The same item id belongs separately to each bank account

- **WHEN** two different monobank accounts each import an item with id X
- **THEN** both account-and-X pairs can be stored, while storing either pair a second time is
  rejected

### Requirement: A statement answer commits atomically

The system SHALL store one statement answer's new транзакції, imported item ids, resulting cursor
and latest баланс банку as one unit; if any value cannot be stored, none of those values SHALL
change.

#### Scenario: A transaction failure rolls back sync metadata

- **WHEN** one statement answer contains two valid mapped транзакції but storing the second is
  rejected
- **THEN** neither транзакція nor either imported item id is stored, and the cursor and баланс
  банку retain their previous values

#### Scenario: A complete answer survives restart whole

- **WHEN** a statement answer with three new транзакції is committed and storage is reopened
- **THEN** all three транзакції and their imported item ids, the resulting cursor and the latest
  баланс банку are present together

### Requirement: A transaction's informational description survives a restart

The system SHALL store and load the optional опис of every транзакція type unchanged; a
транзакція with no опис SHALL still load with none, and adding the field SHALL NOT change any
amount, currency, category, source or monthly number.

#### Scenario: An imported description round-trips

- **WHEN** an imported витрата with опис "СІЛЬПО Київ" is stored and storage is reopened
- **THEN** the витрата still carries that exact опис and all its money and category fields are
  unchanged

#### Scenario: An old transaction gains no invented description

- **WHEN** a транзакція stored before опис existed is brought to the current storage shape
- **THEN** it loads with no опис and every pre-existing field remains unchanged

### Requirement: Monobank storage arrives through append-only migrations without a token

The monobank link, progress, imported-id, balance, опис and last-completed-sync storage SHALL be
introduced only by new migrations that preserve all existing рахунки, транзакції, категорії,
джерела, правила, Saldo import state and rate cache. The monobank token SHALL have no column or row
in this storage.

#### Scenario: Existing financial data survives the migration

- **WHEN** a database holding every транзакція type, рахунки, list rows, rules, a Saldo import
  marker and rates is brought to the current shape
- **THEN** every existing value loads unchanged and no monobank token exists in the database

#### Scenario: An existing link survives gaining the moment

- **WHEN** a database holding monobank links, imported item ids and bank balances is brought to the
  current shape
- **THEN** every link loads unchanged, holding no last-completed-sync moment, and its imported item
  ids and balance are untouched

#### Scenario: A fresh database supports monobank metadata but not the token

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** links, cursors, imported ids, bank balances, transaction описи and the moment a link
  last completed a sync can be stored, and no storage location for a monobank token exists

### Requirement: A category's ліміт survives a restart

The system SHALL store at most one ліміт per category — an integer minor-units сума with its
currency code — and read it back unchanged after storage is closed and reopened. Storing a ліміт
for a category that already has one SHALL replace it; clearing SHALL remove it; a ліміт
referencing a category id not present in storage SHALL be rejected. The ліміт storage SHALL
arrive by a new migration — committed migrations stay untouched — and every row stored under the
previously committed migrations SHALL survive it unchanged.

#### Scenario: A stored ліміт is still there after a restart

- **WHEN** a ліміт of 250000 minor units UAH is stored for a category and storage is closed and
  reopened
- **THEN** reading that category's ліміт returns 250000 minor units UAH

#### Scenario: Storing again replaces, clearing removes

- **WHEN** a ліміт of 250000 minor units UAH is stored for a category, then a ліміт of 300000
  minor units UAH is stored for it, then the ліміт is cleared
- **THEN** after the second store the category's ліміт reads 300000 minor units UAH, and after
  the clear the category has no ліміт

#### Scenario: An unknown category id is rejected

- **WHEN** a ліміт referencing a category id that does not exist in storage is stored
- **THEN** storage rejects it with an error

#### Scenario: A fresh database from migrations alone stores ліміти

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a ліміт can be stored for a seeded category and read back

#### Scenario: Rows stored before the migration survive it

- **WHEN** рахунки, категорії, джерела, правила, monobank links and one транзакція of each type
  are stored under the previously committed migrations alone, and the database is brought to the
  current shape
- **THEN** all of them load unchanged and no category has a ліміт

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

### Requirement: The whole stored history can be listed

The system SHALL list every stored транзакція, each exactly once, so the history series can be
computed from one reading.

#### Scenario: Every stored транзакція is returned once

- **WHEN** транзакції are stored in three different months and the whole history is listed
- **THEN** every stored транзакція is returned exactly once

### Requirement: Watched apps survive a restart

The system SHALL store every watch — the app package with the рахунок it maps to — and SHALL
load the same set after storage is reopened; a removed watch SHALL stay removed.

#### Scenario: A watch round-trips

- **WHEN** a watch mapping "ua.privatbank.ap24" to a stored рахунок is stored and storage is
  reopened
- **THEN** the watch loads with the same package and the same рахунок

#### Scenario: A removed watch stays removed

- **WHEN** a stored watch is removed and storage is reopened
- **THEN** no watch for that package loads, while every other watch is unchanged

### Requirement: Чернетки survive a restart until settled

The system SHALL store every pending чернетка whole — its рахунок, date, text, and its
proposal: a витрата of a сума, a дохід of a сума, or raw with no сума and an optional
original-currency reference — and SHALL load it unchanged after storage is reopened. A settled
чернетка (confirmed or dismissed) SHALL NOT load as pending again.

#### Scenario: A pending чернетка round-trips whole

- **WHEN** a raw чернетка with text "FOREIGN 10.00 USD" and 1000 minor units USD as its
  original-currency reference is stored and storage is reopened
- **THEN** it loads pending on the same рахунок with the same date, text and reference

#### Scenario: A settled чернетка does not return

- **WHEN** a чернетка is settled by confirmation or dismissal and storage is reopened
- **THEN** it is not among the pending чернетки

### Requirement: Seen fingerprints are remembered independently of чернетки and транзакції

The system SHALL store every seen fingerprint and SHALL keep it after the чернетка it came
with was confirmed or dismissed and after the транзакція it led to was edited or deleted, so
the same captured notification can never draft twice.

#### Scenario: A deleted транзакція keeps its fingerprint

- **WHEN** a чернетка was confirmed, its транзакція deleted, and storage is reopened
- **THEN** the fingerprint is still remembered and the same captured notification yields
  nothing

### Requirement: A capture outcome commits atomically

The system SHALL store a capture outcome as one unit — the fingerprint together with the
чернетка it drafted, or together with the auto-confirmed транзакція — and if any part cannot
be stored, none SHALL change.

#### Scenario: A failed draft stores no fingerprint

- **WHEN** storing a drafted чернетка is rejected
- **THEN** its fingerprint is not remembered either, so the redelivered capture can draft again

#### Scenario: A committed outcome survives restart whole

- **WHEN** an auto-confirmed витрата commits with its fingerprint and storage is reopened
- **THEN** the витрата and the remembered fingerprint are both present

### Requirement: Notification storage arrives through append-only migrations

The watch, fingerprint and чернетка storage SHALL be introduced only by new migrations that
preserve every existing рахунок, транзакція, категорія, джерело, правило, ліміт, ціль,
monobank and Saldo state and rate cache. No raw capture queue SHALL be stored — the waiting
queue lives with the capture layer, not in the owner's database.

#### Scenario: Existing data survives the migration

- **WHEN** a database holding every stored shape is brought to the current storage shape
- **THEN** every existing value loads unchanged, and watches, fingerprints and чернетки can be
  stored

#### Scenario: A fresh database starts empty of notification state

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** no watch, fingerprint or чернетка exists and each can be stored

### Requirement: The moment a link last completed a sync survives a restart

The system SHALL store, per monobank link, the moment at which a sync last completed for it, and
read it back unchanged after storage is closed and reopened. A link SHALL be storable with no such
moment — the state of a link that has never synced — and storing a newer moment SHALL replace the
one held. Removing the link SHALL remove the moment with it, leaving every транзакція, imported-id
memory, опис and last known баланс банку untouched. The moment SHALL be about the link alone: two
links SHALL hold their moments independently.

#### Scenario: A stored moment reads back unchanged

- **WHEN** a link is stored with the moment of a completed sync and storage is closed and reopened
- **THEN** the link reads back with the same moment

#### Scenario: A link that never synced holds no moment

- **WHEN** a link is stored and no sync has completed for it
- **THEN** it reads back with no moment, and that is distinguishable from a moment of zero

#### Scenario: A newer moment replaces the older one

- **WHEN** a second sync completes for a link that already held a moment
- **THEN** the link holds only the newer moment

#### Scenario: Two links keep their moments apart

- **WHEN** one link holds the moment of a sync and a second link holds an earlier one
- **THEN** each reads back with its own moment

#### Scenario: Removing the link removes only the moment

- **WHEN** a link holding a moment is removed
- **THEN** the moment is gone with it and every транзакція, imported item id, опис and last known
  баланс банку of that monobank account remains

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

### Requirement: Stored transactions can be searched and narrowed

The system SHALL find stored транзакції by a **search** and by **filters**, returning a
транзакція only when it satisfies every filter given and, when a search is given, the search too.

A search SHALL be satisfied by any one of the things given with it: a text occurring in the опис,
matched without regard to letter case and at any position; a сума equal to a given amount on
either leg, whatever the currency; or the транзакція carrying one of the given категорії or
джерела. The filters SHALL be one рахунок — counting a переказ on either leg — and one calendar
month; each SHALL only ever remove транзакції from the result.

Results SHALL come in the latest listing's order — newest date first, then most recently stored,
then by id — and SHALL be returned up to a requested count from a requested starting position, so
the whole history can be read on in pages without re-reading what came before. A search matching
nothing SHALL return nothing rather than everything.

#### Scenario: An опис is found by part of it, in any case

- **WHEN** транзакції with описи "СІЛЬПО Київ" and "Нова пошта" are stored and the search text is
  "сільпо"
- **THEN** only the first is returned

#### Scenario: A сума finds both legs of a переказ

- **WHEN** a переказ of 120000 minor units UAH on both legs and a витрата of 1200 minor units UAH
  are stored, and the search сума is 120000 minor units
- **THEN** the переказ is returned and the витрата is not

#### Scenario: A категорія given with the search matches its транзакції

- **WHEN** a витрата in Groceries carries no опис at all and the search gives the text "прод"
  together with Groceries among its категорії
- **THEN** that витрата is returned

#### Scenario: Filters narrow the search

- **WHEN** a витрата in Groceries on рахунок A and a витрата in Groceries on рахунок B are
  stored, and the search gives Groceries while the рахунок filter is A
- **THEN** only the витрата on рахунок A is returned

#### Scenario: A month bounds the result

- **WHEN** matching транзакції are stored dated the last day of March and the first day of April,
  and the month filter is March
- **THEN** only the one dated in March is returned

#### Scenario: Pages continue where the previous one ended

- **WHEN** five matching транзакції are stored and two are requested from the position after the
  first two
- **THEN** the third and fourth in the latest listing's order are returned, in that order

#### Scenario: Nothing matching returns nothing

- **WHEN** no stored транзакція satisfies the search and filters given
- **THEN** no транзакція is returned

### Requirement: The рахунок last recorded on by hand survives a restart

The system SHALL store the рахунок of the owner's most recent hand-recorded транзакція and load
it unchanged after a restart, so the entry form can open on it. Storing it SHALL be the caller's
explicit act: nothing SHALL set it as a side effect of storing a транзакція, so an import, a sync
or a confirmed чернетка leaves it as it was. At most one such рахунок SHALL be remembered, and
storing another SHALL replace it. A device that has never recorded by hand SHALL load none.

#### Scenario: The remembered рахунок comes back

- **WHEN** a рахунок is remembered as the last hand-recorded one and storage is reopened
- **THEN** exactly that рахунок is loaded

#### Scenario: Only the latest one is kept

- **WHEN** one рахунок is remembered and then another is
- **THEN** the second is loaded and the first is not

#### Scenario: Storing a транзакція remembers nothing by itself

- **WHEN** транзакції are stored without the рахунок being remembered explicitly
- **THEN** no remembered рахунок is loaded

#### Scenario: A fresh database remembers none

- **WHEN** all committed migrations are applied to an empty database
- **THEN** no remembered рахунок is loaded and nothing fails

### Requirement: The remembered рахунок arrives by a new migration that keeps stored rows

The storage for the remembered рахунок SHALL be introduced by a new migration; committed
migrations SHALL stay untouched. Every row stored under the previously committed migrations —
рахунки, транзакції, категорії, джерела, правила, ліміти, цілі, monobank state, чернетки and
their fingerprints — SHALL survive the new migration unchanged.

#### Scenario: Pre-migration rows survive unchanged

- **WHEN** a рахунок and one транзакція of each type are stored under the previously committed
  migrations alone, and the database is brought to the current shape
- **THEN** all of them load unchanged — types, amounts, currencies, dates, categories and
  descriptions intact — and no рахунок is remembered

#### Scenario: A fresh database from migrations alone remembers a рахунок

- **WHEN** all committed migrations are applied in order to an empty database
- **THEN** a рахунок can be remembered as the last hand-recorded one and read back
