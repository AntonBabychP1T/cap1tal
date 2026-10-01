## ADDED Requirements

### Requirement: The moment of the last personal-API request survives a restart

The moment at which this device last sent a request to the monobank personal API SHALL survive
closing and reopening the app: reading it SHALL yield exactly what was last written. Exactly one
such moment SHALL be kept — the latest — so writing a newer one replaces it rather than adding to a
history. A device that has never sent such a request SHALL answer with the absence of a moment,
never with a moment of zero standing in for one.

Nothing of the token, of an account, or of anything read from a statement SHALL be stored with it:
it is a moment, and no more.

#### Scenario: The moment is read back as it was written

- **WHEN** the moment of a request is stored and storage is reopened
- **THEN** reading yields that same moment

#### Scenario: A later request replaces the earlier moment

- **WHEN** one request's moment is stored and then a later request's moment is stored
- **THEN** reading yields the later moment, and the earlier one is not readable

#### Scenario: A device that never sent a request says so

- **WHEN** no request has ever been sent and storage is read
- **THEN** the answer is that no moment exists, and it is not a moment of zero

### Requirement: The moment each link last had a turn survives a restart

For every monobank link, the moment at which a run last sent a request about it SHALL survive
closing and reopening the app, and SHALL be readable beside that link's own sync cursor and
last-sync moment. A link no run has ever sent a request about SHALL be readable as having no such
moment — distinct from a moment of zero, and distinct from a link that has had a turn but never
completed a sync.

The moment SHALL be kept independently of the moment a sync last *completed* for that link: a turn
that ended in a failure moves the first and leaves the second exactly as it was.

It belongs to the link: unlinking SHALL take it with the link, and linking the same monobank
account again SHALL start it with no moment. Unlike that link's last-sync moment it SHALL NOT
travel in a бекап — it is what *this* phone last asked the bank about that link, not something the
owner's money or settings say — so a restored link SHALL read back as one that has never had a
turn, while its cursor, its sync boundary and its last-sync moment are restored as they were.

#### Scenario: A link's turn is read back as it was written

- **WHEN** a turn is remembered for a link and storage is reopened
- **THEN** reading that link yields the same moment

#### Scenario: A link that has never had a turn says so

- **WHEN** a link is created and no run has sent a request about it
- **THEN** reading it yields no turn moment, and not a moment of zero

#### Scenario: A failed turn moves only the turn

- **WHEN** a link that completed a sync yesterday has a turn today that ends unavailable
- **THEN** its turn moment is today and its last completed sync is still yesterday

#### Scenario: Relinking starts the turns again

- **WHEN** a monobank account that had turns is unlinked and linked again
- **THEN** the new link has no turn moment, while the imported item ids of that monobank account
  are still remembered

#### Scenario: A restored link has had no turn

- **WHEN** a бекап made on a device whose links have turn moments is restored elsewhere
- **THEN** each restored link reads back with no turn moment, and with its cursor, its sync
  boundary and its last-sync moment exactly as the бекап holds them

### Requirement: The remembered request moment and per-link turns arrive through an append-only migration that keeps stored rows

The storage for the remembered request moment and for each link's turn moment SHALL arrive as a new
migration applied on top of every committed one, leaving those unchanged. Applying it to a database
already holding рахунки, транзакції, monobank links, imported item ids, per-account last-sync
moments and the remembered sync attempt SHALL leave every one of those rows exactly as it was, and
every link it finds SHALL read back as one that has never had a turn.

#### Scenario: The migration adds storage and touches nothing

- **WHEN** the new migration is applied to a database holding рахунки, транзакції, monobank links,
  imported item ids, last-sync moments and a remembered sync attempt
- **THEN** the request moment and per-link turns can be stored and read, and every previously
  stored row is unchanged

#### Scenario: Links that existed before the migration have had no turn

- **WHEN** the new migration is applied to a database holding links with last-sync moments
- **THEN** each of those links reads back with its last-sync moment intact and with no turn moment

#### Scenario: An empty database reaches the current shape

- **WHEN** every committed migration is applied in order to an empty database
- **THEN** the remembered request moment and a link's turn moment can be written and read back

### Requirement: The remembered request moment stays on the phone that made it

The remembered request moment SHALL NOT travel in a бекап, and restoring a бекап SHALL leave
whatever moment this device holds exactly as it was. It is what *this* phone last asked the bank,
operational state about one device like the remembered sync attempt and the сповіщення про збій
standing on it; a moment carried from another phone would make this one wait out a request it
never sent, or send one the bank will refuse. The per-link turn moments are out of the бекап for
the same reason, though they are restored as absent rather than left alone, because a restore
replaces every link there is.

#### Scenario: A бекап carries no request moment

- **WHEN** a бекап is made on a device that has sent a request
- **THEN** the file contains no request moment, while every рахунок, транзакція and monobank link
  of that device is in it

#### Scenario: A restore leaves this phone's request moment alone

- **WHEN** a бекап made on another device is restored onto a phone that sent a request a minute ago
- **THEN** that moment is still remembered, unchanged
