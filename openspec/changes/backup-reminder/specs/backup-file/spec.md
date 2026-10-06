## ADDED Requirements

### Requirement: The phone remembers its last бекап, and only a real one counts

The app SHALL remember on the phone the moment of its last file бекап — set when a бекап file has
been written to the place the owner chose, together with the name it was given and how many
рахунки and транзакції it held — and the moment of its last confirmed restore, together with the
moment the restored бекап was made. A save the owner backed out of, or one that failed, SHALL NOT
change what is remembered. A restore that was refused or failed SHALL NOT change it either.
This phone's last бекап SHALL be the latest of: the last file бекап, the last confirmed restore,
and the last completed Google Drive upload. Disconnecting Google Drive SHALL NOT forget the last
completed upload: the phone SHALL keep its moment as part of what it remembers. Making a пакет для аналізу or a репорт про помилку
SHALL NOT count as a бекап.

What is remembered SHALL survive closing and restarting the app.

#### Scenario: A saved file is remembered across a restart

- **WHEN** the owner saves a file бекап on 2026-10-05 holding 12 рахунки and 4300 транзакції, then
  closes the app and opens it again on 2026-10-06
- **THEN** the phone's last бекап is the moment of that save on 2026-10-05, named
  «cap1tal-2026-10-05.json», with 12 рахунки and 4300 транзакції

#### Scenario: A dismissed chooser is not a бекап

- **WHEN** the last file бекап was saved on 2026-09-21 and on 2026-10-06 the owner taps «Зберегти у
  файл» and dismisses the system's choice of destination
- **THEN** the phone's last бекап is still the one of 2026-09-21

#### Scenario: A failed save is not a бекап

- **WHEN** the last file бекап was saved on 2026-09-21 and on 2026-10-06 the file cannot be written
- **THEN** the phone's last бекап is still the one of 2026-09-21

#### Scenario: A confirmed restore counts at the moment it lands

- **WHEN** on 2026-10-06 the owner confirms restoring a бекап made on 2026-08-30 and it lands
- **THEN** the phone's last бекап is the restore of 2026-10-06, remembered as made from the бекап
  of 2026-08-30

#### Scenario: A refused restore changes nothing remembered

- **WHEN** the last file бекап was saved on 2026-09-21 and on 2026-10-06 the owner picks a damaged
  бекап, which is refused
- **THEN** the phone's last бекап is still the one of 2026-09-21

#### Scenario: A Google Drive upload is a бекап

- **WHEN** the last file бекап was saved on 2026-09-01 and the last Google Drive upload completed
  on 2026-10-04
- **THEN** the phone's last бекап is the upload of 2026-10-04

#### Scenario: Disconnecting Google Drive after uploads

- **WHEN** the owner never saved a file бекап, the last Google Drive upload completed on
  2026-10-04, and on 2026-10-05 the owner disconnects Google Drive
- **THEN** the phone's last бекап is still the upload of 2026-10-04, and after a restart on
  2026-10-06 it still is

#### Scenario: A пакет для аналізу is not a бекап

- **WHEN** the last file бекап was saved on 2026-09-21 and on 2026-10-06 the owner hands a пакет
  для аналізу and a репорт про помилку to another app
- **THEN** the phone's last бекап is still the one of 2026-09-21

### Requirement: What the phone remembers of its бекапи never travels in a бекап

What the phone remembers of its бекапи is this phone's own bookkeeping: it SHALL NOT be written
into a бекап, and restoring a бекап SHALL NOT bring back another phone's moments — only the moment
of that restore itself.

#### Scenario: The remembered moments do not travel in a бекап

- **WHEN** a phone whose last file бекап was saved on 2026-09-21 makes a бекап on 2026-10-05 and a
  second phone that never saved one restores it on 2026-10-06
- **THEN** the бекап file holds no moment of a previous бекап, and the second phone's last бекап is
  its restore of 2026-10-06, made from the бекап of 2026-10-05

### Requirement: A phone with no бекап yet counts from its first opening

Until the phone has had its first бекап, the app SHALL remember the moment it started counting:
the first time a version of the app that remembers бекапи was opened on this phone. Later openings
SHALL NOT move it.

#### Scenario: A phone with no бекап yet knows since when it has been counting

- **WHEN** the owner first opens a version of the app that remembers бекапи on 2026-10-06 and has
  never saved, uploaded or restored a бекап on this phone
- **THEN** the phone has no last бекап and has been counting since 2026-10-06, and opening the app
  again on 2026-10-10 does not move that start
