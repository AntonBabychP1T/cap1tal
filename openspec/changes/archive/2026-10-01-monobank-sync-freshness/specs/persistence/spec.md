## MODIFIED Requirements

### Requirement: The moment of the last personal-API request survives a restart

The moment at which this device last sent a **statement** request to the monobank personal API
SHALL survive closing and reopening the app: reading it SHALL yield exactly what was last written. A
client-info request, which the bank limits apart from the statement, SHALL NOT move it. Exactly one
such moment SHALL be kept — the latest — so writing a newer one replaces it rather than adding to a
history. A device that has never sent such a request SHALL answer with the absence of a moment,
never with a moment of zero standing in for one.

Nothing of the token, of an account, or of anything read from a statement SHALL be stored with it:
it is a moment, and no more.

#### Scenario: The moment is read back as it was written

- **WHEN** the moment of a statement request is stored and storage is reopened
- **THEN** reading yields that same moment

#### Scenario: A later request replaces the earlier moment

- **WHEN** one statement request's moment is stored and then a later one's is stored
- **THEN** reading yields the later moment, and the earlier one is not readable

#### Scenario: A device that never sent a request says so

- **WHEN** no statement request has ever been sent and storage is read
- **THEN** the answer is that no moment exists, and it is not a moment of zero

## ADDED Requirements

### Requirement: The moment a link became позачерговий survives a restart and stays on this phone

The moment each monobank link is позачерговий from, or its absence, SHALL survive a restart and be
read back unchanged. It SHALL arrive through a new, append-only migration that adds it as absent for
every link already stored and changes nothing else those rows hold. It is this phone's own
knowledge of what it has not yet read, so it SHALL NOT be written into a бекап, and a link restored
from one SHALL carry no such moment.

#### Scenario: A позачерговий link is still позачерговий after a restart

- **WHEN** a link became позачерговий at 10:05 and the app is restarted
- **THEN** it is read back позачерговий from 10:05

#### Scenario: The migration keeps what the links held

- **WHEN** the migration runs over a database with nine links, their cursors, last-sync and last-turn
  moments
- **THEN** every link keeps them unchanged and none is позачерговий

#### Scenario: A бекап does not carry it

- **WHEN** a бекап is made while a link is позачерговий and restored on another phone
- **THEN** the restored link is not позачерговий
