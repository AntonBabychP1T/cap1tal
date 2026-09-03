# backup-file Specification

## Purpose
Defines what a бекап is: one versioned file that holds the owner's whole state — рахунки,
категорії, джерела, правила, ліміти, цілі and every транзакція — what may never be in it, how it
proves it is undamaged, and how restoring one replaces everything on the phone as a single act
that either lands whole or does not happen at all.
## Requirements

### Requirement: A бекап is one versioned file holding the owner's whole state

A бекап SHALL be a single file that carries, alongside its contents: the version of the бекап
format, the version of the storage shape it was written under, the moment it was made, and one
integrity value over its contents.

Its contents SHALL be every рахунок with its назва, вид, currency, початковий залишок and
archived flag; every категорія and джерело with its archived flag; every правило with its
merchant pattern, MCC and target категорія; every ліміт with its сума and currency; every ціль
with its назва, target сума, currency, its дата where it has one, and the ids of every рахунок of
its склад; every транзакція of all five types with
its type, дата, рахунок or both рахунки, integer minor-unit сума with its currency code, категорія
or джерело, опис and original-currency сума where it has one; the marker that a Saldo import was
committed; the monobank accounts a token has shown with their links, sync boundaries, cursors, the
moment each link last synced and imported item ids; and the відстежувані застосунки of bank
notifications with the рахунок each lands on.

A ціль витрат SHALL need nothing of its own in a бекап: it is the ліміт of its категорія, which the
бекап already carries, so restoring the ліміти restores the цілі витрат with them.

Every identifier SHALL be carried verbatim, so a restored бекап refers to the same рахунки,
категорії and джерела it was made from.

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

#### Scenario: A ціль comes back with its whole склад

- **WHEN** a бекап made on a device holding the ціль «Машина» of 70000000 minor units UAH with a
  склад of a UAH рахунок, a USD рахунок and an інвестиційний рахунок is restored onto empty storage
- **THEN** «Машина» is back with the same target, the same currency and exactly those three
  рахунки in its склад, and its progress is what it was on the device the бекап came from

#### Scenario: A ціль without a дата comes back without one

- **WHEN** a бекап holding a ціль with no дата is restored
- **THEN** that ціль has no дата afterwards, and it is not overdue

#### Scenario: A ціль витрат comes back as its ліміт

- **WHEN** a бекап made on a device holding the ціль витрат «Ресторани» of at most 200000 minor
  units UAH is restored onto empty storage
- **THEN** Ресторани carries a ліміт of 200000 minor units UAH and the ціль витрат «Ресторани» is
  there again, with one сума and not two

#### Scenario: Identifiers are preserved

- **WHEN** a бекап is restored
- **THEN** every рахунок, категорія, джерело, правило, ціль and транзакція carries the identifier
  it carried when the бекап was made

### Requirement: A бекап never carries a secret or an unconfirmed capture

A бекап SHALL NOT contain the monobank token, the raw text or payload of any captured bank
notification, the fingerprints of captured notifications, any pending чернетка, the on-device
capture queue, or the cached monobank rates. Making a бекап SHALL NOT read the monobank token.

#### Scenario: Nothing secret and nothing overheard reaches the file

- **WHEN** a бекап is made on a device that holds a monobank token, two pending чернетки with the
  text their notifications carried, the fingerprints of the notifications already decided, and a
  cached monobank rate for USD
- **THEN** the бекап contains none of the token, the чернетки, their text, the fingerprints or the
  rate, while every рахунок and транзакція of that device is in it

### Requirement: A бекап names the versions it was written under and is refused when they are newer

A бекап SHALL be accepted only when its бекап format version and its storage shape version are
each the current one or older; a бекап naming a newer version of either SHALL be refused by that
reason and nothing local SHALL change. A бекап written under an older storage shape SHALL still be
restored, filling in nothing it does not name.

A бекап written under the бекап format version that named exactly one рахунок per ціль SHALL still
be restored: each of its цілі SHALL become a ціль-накопичення whose склад holds that one рахунок,
keeping its назва, target, currency and дата, and therefore showing exactly the progress it showed
on the device the бекап came from.

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

#### Scenario: A ціль of the previous format keeps its one рахунок

- **WHEN** a бекап of the previous format version, holding the ціль «Авто» of 20000000 minor units
  UAH by 2026-12-31 on the банка «Подушка», is restored
- **THEN** «Авто» is a ціль-накопичення of 20000000 minor units UAH by 2026-12-31 whose склад holds
  exactly «Подушка», and its progress is «Подушка»'s розрахунковий баланс

### Requirement: A бекап proves it is undamaged before it is trusted

A бекап whose integrity value does not match its contents, that is truncated, or that is not a
бекап at all SHALL be refused by that reason before anything local is read or written. A file that
does not name the moment it was made as a real instant SHALL be among those that are not a бекап at
all: the integrity value covers the contents and not the envelope, so nothing later can catch it.
No file SHALL ever be partly restored.

#### Scenario: An edited бекап is refused

- **WHEN** restoring a бекап whose contents were changed after it was made, so its integrity value
  no longer matches, is attempted
- **THEN** it is refused as damaged and nothing local changes

#### Scenario: A truncated бекап is refused

- **WHEN** restoring a бекап that ends midway, as a half-written file does, is attempted
- **THEN** it is refused as damaged and nothing local changes

#### Scenario: A бекап whose moment is not one is refused

- **WHEN** restoring a file that carries the бекап markers and an integrity value matching its
  contents, but names a moment that is not an instant, is attempted
- **THEN** it is refused as not a бекап before any preview is built, rather than being offered
  with a moment that is not one

#### Scenario: A file that is not a бекап is refused

- **WHEN** restoring a file that is not a бекап — a Saldo CSV export, for instance — is attempted
- **THEN** it is refused as not being a бекап, and nothing local changes

### Requirement: A бекап that contradicts itself is refused whole

A бекап SHALL be refused, with nothing restored, when what it holds cannot stand together: a
транзакція naming a рахунок, категорія or джерело the бекап does not contain; a ліміт on a
категорія it does not contain; a ціль whose склад names a рахунок the бекап does not contain; a
ціль whose склад is empty; a ціль whose склад names one рахунок more than once; a ціль whose
currency is neither UAH nor the single currency every рахунок of its склад is in; a сума
that is not an integer in minor units, or a сума without its currency code. The contradiction
SHALL be found before anything local is touched.

#### Scenario: A transaction pointing outside the бекап stops the restore

- **WHEN** restoring a бекап holding a витрата whose рахунок is not among the бекап's рахунки is
  attempted
- **THEN** the бекап is refused as inconsistent and every рахунок and транзакція on the phone is
  exactly what it was

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

### Requirement: What a restore would do is knowable before it does it

A бекап SHALL be able to say, without any local state being changed, the moment it was made, how
many рахунки and транзакції it holds, and the first and last month its транзакції fall in. The
same figures SHALL be obtainable for what is on the phone now, so the two can be put side by side
before a restore.

#### Scenario: The бекап describes itself before it is restored

- **WHEN** a бекап holding 12 рахунки and 4300 транзакції dated between 2024-01-03 and 2026-08-30
  is read for a preview
- **THEN** it reports the moment it was made, 12 рахунки, 4300 транзакції and the months
  2024-01 to 2026-08, and no рахунок, транзакція or setting on the phone has changed

### Requirement: Restoring replaces the whole state and never merges

Restoring a бекап SHALL replace everything the бекап covers with what the бекап holds: what was on
the phone and is not in the бекап SHALL be gone, and nothing SHALL be duplicated by restoring a
бекап whose contents overlap what was already there. The pending чернетки SHALL be cleared with
the state they named. The fingerprints of already-decided notifications and the cached monobank
rates SHALL be left as they are, and the monobank token SHALL be neither read nor changed.

#### Scenario: What the бекап does not hold is gone

- **WHEN** a бекап holding one рахунок and three транзакції is restored onto a phone holding four
  other рахунки and two hundred other транзакції
- **THEN** afterwards there is exactly one рахунок and three транзакції, all of them the бекап's

#### Scenario: Restoring the same бекап twice changes nothing the second time

- **WHEN** a бекап is restored and then restored again
- **THEN** the рахунки, категорії, джерела, правила, ліміти, цілі and транзакції are the same
  after the second restore as after the first, none of them doubled

#### Scenario: The чернетки go, the fingerprints stay

- **WHEN** a бекап is restored onto a phone holding two pending чернетки and the fingerprints of
  the notifications already decided
- **THEN** no чернетка remains, the fingerprints are still there, and a notification whose
  fingerprint is among them still yields no second чернетка

#### Scenario: The remembered рахунок goes with the phone it was learned on

- **WHEN** a бекап is restored onto a phone whose entry form remembers a рахунок, because the
  owner has recorded by hand on it
- **THEN** the restore lands, and the form remembers nothing until the owner records by hand
  again, rather than the restore being refused because a habit still named the replaced world

#### Scenario: Sync does not re-import what was already imported

- **WHEN** a бекап holding a monobank link, its cursor and its imported item ids is restored
- **THEN** the link, the cursor and the imported item ids are back, so an item already imported is
  still rejected as already imported, and the monobank token on the device is unchanged

#### Scenario: A link that has never synced is restored as one that never has

- **WHEN** a бекап that names no last-sync moment for a monobank link is restored — whether
  because the link has never synced, or because the бекап was written before the moment was
  carried
- **THEN** the link and its cursor are back, and the link reads as one that has never synced
  rather than as one synced at a moment nothing observed

### Requirement: A restore either lands whole or does not happen

A restore SHALL be one unit. If any part of it cannot be written, none of it SHALL be written: the
рахунки, категорії, джерела, правила, ліміти, цілі, транзакції, monobank state and відстежувані
застосунки that were there before SHALL be exactly what is there after, and the refusal SHALL say
what stopped it.

#### Scenario: A restore that fails partway leaves the phone as it was

- **WHEN** restoring a бекап is attempted and writing its last транзакція is rejected
- **THEN** nothing of the бекап is stored and every рахунок, транзакція, ліміт, ціль and правило
  the phone held before the attempt is still there, unchanged
