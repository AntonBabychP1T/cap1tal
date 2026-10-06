## ADDED Requirements

### Requirement: A бекап absent for longer than 14 days is stated under the header

WHEN the phone holds at least one рахунок — active, archived or рахунок-борг alike — and no Google
account is remembered for backup, and more than 14 calendar days separate today from the дата of
the phone's last бекап (as the backup-file capability defines it) or, when there has been none,
from the дата the phone started counting, the service rail directly below Головний's header SHALL
carry one compact row saying since which дата, in words, there has been no бекап — or, when there
has never been one, that there has been no бекап yet. Its tap SHALL open «Бекап». The row SHALL
follow the rail's rules: outside the configurable widgets, never hidden or reordered, taking no
space when absent. It SHALL be gone as soon as a бекап makes the condition false.

#### Scenario: Fifteen days without a бекап are said

- **WHEN** the phone holds 3 рахунки, Google Drive was never connected, the last file бекап was
  saved on 2026-09-21 and today is 2026-10-06
- **THEN** the rail says there has been no бекап since 21 вересня, and its tap opens «Бекап»

#### Scenario: Fourteen days are still quiet

- **WHEN** the phone holds 3 рахунки, Google Drive was never connected, the last file бекап was
  saved on 2026-09-22 and today is 2026-10-06
- **THEN** no бекап row appears

#### Scenario: A phone that never had a бекап, counted from when it started counting

- **WHEN** the phone holds 3 рахунки, Google Drive was never connected, the phone has never had a
  бекап, started counting on 2026-09-20 and today is 2026-10-06
- **THEN** the rail says there has been no бекап yet and names no дата

#### Scenario: A freshly updated phone is given its 14 days

- **WHEN** the phone holds 12 рахунки and 4300 транзакції, has never had a бекап, started counting
  on 2026-10-01 and today is 2026-10-06
- **THEN** no бекап row appears

#### Scenario: A phone with nothing to lose stays quiet

- **WHEN** no рахунок exists, the phone has never had a бекап and started counting on 2026-09-01,
  and today is 2026-10-06
- **THEN** no бекап row appears

#### Scenario: An archived рахунок-борг is still something to lose

- **WHEN** the only рахунок is an archived рахунок-борг with a переказ of 500000 minor units UAH
  into it, the last file бекап was saved on 2026-09-01 and today is 2026-10-06
- **THEN** the rail says there has been no бекап since 1 вересня

#### Scenario: Saving a file clears the row

- **WHEN** the rail says there has been no бекап since 21 вересня and the owner opens «Бекап»,
  saves a file бекап on 2026-10-06 and returns to Головний
- **THEN** no бекап row appears

#### Scenario: Disconnecting Google Drive after uploads

- **WHEN** the phone holds 3 рахунки, the owner never saved a file бекап, the last Google Drive
  upload completed on 2026-10-04, the owner disconnected Google Drive on 2026-10-05, and today is
  2026-10-10
- **THEN** no бекап row appears; and on 2026-10-19 the rail says there has been no бекап since
  4 жовтня, never that there has been none yet

#### Scenario: A restore clears the row

- **WHEN** the rail says there has been no бекап yet and on 2026-10-06 the owner restores a бекап
  made on 2026-08-30 and returns to Головний
- **THEN** no бекап row appears

### Requirement: Google Drive keeps the бекап row silent while it works, and names itself when it does not

WHEN Google Drive is connected and no failure of it stands, Головний SHALL show no бекап row,
however long ago the last upload completed, because an unchanged бекап is not uploaded again.
WHEN a Google account is remembered for backup but the copy is not going up — Google Drive is
connected with a failure standing, Google has withdrawn the app's access, or connecting was left
before it finished — and more than 14 calendar days separate today from the дата of the phone's
last бекап or, when there has been none, from the дата the phone started counting, the service
rail SHALL carry one compact row saying that Google Drive has not saved a бекап since the дата of
the last completed Google Drive upload — including one completed before an earlier disconnect —
in words, or, when no upload ever completed, that it has
not saved one yet — never a дата of a file бекап or a restore — and its tap SHALL open «Google Drive». The row SHALL follow the
same rail rules and the same condition on holding at least one рахунок.

#### Scenario: A working Google Drive with an old upload is quiet

- **WHEN** the phone holds 3 рахунки, Google Drive is connected with no failure standing, the last
  upload completed on 2026-09-01 because nothing changed since, and today is 2026-10-06
- **THEN** no бекап row appears

#### Scenario: A failing Google Drive is named

- **WHEN** the phone holds 3 рахунки, Google Drive is connected, the last upload completed on
  2026-09-01, the upload of 2026-10-05 failed for lack of network, no file бекап is newer, and
  today is 2026-10-06
- **THEN** the rail says Google Drive has not saved a бекап since 1 вересня, and its tap opens
  «Google Drive»

#### Scenario: A recent failure after a recent upload is quiet

- **WHEN** the phone holds 3 рахунки, Google Drive is connected, the last upload completed on
  2026-10-01, the upload of
  2026-10-05 failed, and today is 2026-10-06
- **THEN** no бекап row appears

#### Scenario: Withdrawn access is named as Google Drive's

- **WHEN** the phone holds 3 рахунки, Google has withdrawn the app's access, the last upload
  completed on 2026-09-10 and today is 2026-10-06
- **THEN** the rail says Google Drive has not saved a бекап since 10 вересня, and its tap opens
  «Google Drive»

#### Scenario: An unfinished connection that never uploaded

- **WHEN** the phone holds 3 рахунки, the owner chose a Google account on 2026-09-15 and left before the код відновлення was
  dealt with, no бекап has ever been made, the phone started counting on 2026-09-15, and today is
  2026-10-06
- **THEN** the rail says Google Drive has not saved a бекап yet, and its tap opens «Google Drive»

#### Scenario: The Google Drive row names Google Drive's own дата

- **WHEN** the phone holds 3 рахунки, Google Drive is connected with a failure standing, the last
  upload completed on 2026-09-01, the last file бекап was saved on 2026-09-15, and today is
  2026-10-06
- **THEN** the rail says Google Drive has not saved a бекап since 1 вересня, not since 15 вересня,
  and its tap opens «Google Drive»

#### Scenario: Reconnecting after a disconnect names the upload kept from before

- **WHEN** the phone holds 3 рахунки, the owner never saved a file бекап, the last Google Drive
  upload completed on 2026-09-10, the owner disconnected Google Drive on 2026-09-12, connected it
  again on 2026-09-20 and its first upload failed with the failure still standing, and today is
  2026-10-06
- **THEN** the rail says Google Drive has not saved a бекап since 10 вересня, never that it has not
  saved one yet, and its tap opens «Google Drive»

#### Scenario: A newer file бекап answers for a failing Google Drive

- **WHEN** the phone holds 3 рахунки, Google Drive is connected with a failure standing, the last
  upload completed on 2026-09-01, the last file бекап was saved on 2026-10-02, and today is 2026-10-06
- **THEN** no бекап row appears

### Requirement: The бекап row is quiet and stays until a бекап answers it

The бекап row SHALL be the only way Головний speaks of a missing бекап: neither its appearing nor
its staying SHALL post a notification, play a sound, open a dialog or make a network request. It
SHALL offer no way to dismiss or postpone it; it SHALL stay on every opening of Головний until a
бекап makes its condition false. It SHALL carry no сума, no назва of a рахунок and no count of
транзакції.

#### Scenario: The row announces nothing

- **WHEN** the condition for the бекап row becomes true overnight and the owner opens Головний on
  2026-10-06
- **THEN** the row is shown in the rail, and no notification was posted, no sound played, no dialog
  opened and no request left the phone

#### Scenario: Reopening does not make it go away

- **WHEN** the rail shows the бекап row, the owner opens «Бекап» and goes back without saving, then
  closes and reopens the app on the same day
- **THEN** the бекап row is still shown, and nowhere does it offer to be hidden
