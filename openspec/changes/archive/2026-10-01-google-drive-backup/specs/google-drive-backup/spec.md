# google-drive-backup — delta

## Purpose

The owner's opt-in copy of the бекап in their own Google Drive: connecting to their account
with access to nothing but the app's own folder, sealing every бекап on the phone under a key
only they hold, uploading the current one at least once a day best-effort, keeping a few
версії бекапу without ever dropping the last good one, and bringing one back on a new phone
through an explicit, verified restore that replaces rather than merges.

## ADDED Requirements

### Requirement: Google Drive is connected only when the owner asks for it

The app SHALL make no request to Google and SHALL send nothing outside the phone for backup
purposes until the owner has explicitly connected Google Drive. Connecting SHALL ask the
owner's Google account for access to the app's own folder only, and SHALL NOT ask for access
to the owner's other files in Drive. An attempt that the owner cancels, or that Google
refuses, SHALL leave the app not connected and SHALL change nothing on the phone.

#### Scenario: Nothing leaves the phone before connecting

- **WHEN** the app has never been connected to Google Drive and a day passes with the app
  used normally
- **THEN** no бекап is uploaded and no request is made to Google

#### Scenario: Connecting asks for the app's own folder only

- **WHEN** the owner connects Google Drive
- **THEN** the access asked of their Google account is limited to the app's own folder, and
  the owner's other files in Drive are not covered by it

#### Scenario: A cancelled connection leaves nothing behind

- **WHEN** the owner starts connecting and cancels at their Google account, or Google refuses
- **THEN** the app is not connected, no бекап is uploaded, and no authorisation is kept

### Requirement: The Google authorisation is a device secret

While connected, the app SHALL keep the authorisation Google issued only in the phone's
secure storage. That authorisation SHALL NOT be written among the owner's financial data,
SHALL NOT be contained in any бекап, SHALL NOT be shown after connecting and SHALL NOT appear
in any diagnostic output. Disconnecting SHALL remove it from the phone.

#### Scenario: No бекап carries the authorisation

- **WHEN** Google Drive is connected and a бекап is made
- **THEN** the бекап contains no part of the authorisation Google issued

#### Scenario: Disconnecting removes it

- **WHEN** the owner disconnects Google Drive
- **THEN** the authorisation is no longer held on the phone and no further upload is made

### Requirement: A бекап is sealed on the phone before it is uploaded

Every бекап the app uploads SHALL be sealed on the phone under a key made when Google Drive
was first connected and kept in the phone's secure storage. What is uploaded SHALL reveal
none of the бекап's contents to anyone holding it without the key, and SHALL be sealed such
that any alteration of the uploaded bytes is detected when it is opened. A бекап that fails
to open SHALL be refused, and refusing SHALL change nothing on the phone.

#### Scenario: The uploaded bytes reveal nothing

- **WHEN** a бекап holding the owner's рахунки and транзакції is uploaded
- **THEN** the uploaded bytes contain neither the бекап's contents nor any рахунок name,
  сума, транзакція or фіскальний чек readable without the key

#### Scenario: An altered upload does not open

- **WHEN** a single byte of an uploaded бекап is changed and the app tries to open it with
  the correct key
- **THEN** opening is refused and nothing on the phone is replaced

#### Scenario: The wrong key does not open it

- **WHEN** the app tries to open an uploaded бекап with a key other than the one it was
  sealed under
- **THEN** opening is refused and nothing on the phone is replaced

### Requirement: Connecting produces a код відновлення and it is the only other way in

Connecting Google Drive on a phone that starts a new line of версії бекапу SHALL produce a
**код відновлення** — the sealing key written so a person can copy it down — and SHALL show it to
the owner, requiring them to acknowledge that they have kept it before the connection is complete.
(Connecting into a line that already exists asks for that line's код відновлення instead; the
requirement below says what happens then, and entering it correctly is that connection's
acknowledgement.) While connected, the app SHALL be able to show it again on the owner's explicit
request. The код відновлення SHALL NOT be written
among the owner's financial data and SHALL NOT be uploaded. A phone whose secure storage does
not hold the key SHALL be able to open an uploaded бекап with the код відновлення and by no
other means. A код відновлення that was copied down wrongly SHALL be refused as wrong before
anything is opened or replaced.

#### Scenario: The connection is not complete until the code is acknowledged

- **WHEN** the owner connects Google Drive on a phone starting a new line and has not yet
  acknowledged the код відновлення
- **THEN** the connection is not complete, and no бекап is uploaded

#### Scenario: A new phone opens the бекап with the код відновлення

- **WHEN** a phone that holds no key is given the correct код відновлення for an uploaded
  бекап
- **THEN** the бекап opens

#### Scenario: A phone without the key and without the code cannot open it

- **WHEN** a phone that holds no key tries to open an uploaded бекап without the код
  відновлення
- **THEN** the бекап does not open and the owner is told the код відновлення is needed

#### Scenario: A mistyped код відновлення is refused as mistyped

- **WHEN** the owner enters a код відновлення with a character wrong
- **THEN** it is refused as wrong before any бекап is opened, nothing on the phone is
  replaced, and the owner may enter it again

### Requirement: One line of версії бекапу has one код відновлення

Every версія бекапу SHALL carry, readable without the key, which sealing key it was sealed
under, so the app can say which версії it can open without opening any of them.

Connecting on a phone that holds no sealing key, where the Drive folder already holds версії
бекапу, SHALL offer continuing a line: the app SHALL ask for a код відновлення and, when it opens
a версія бекапу in the folder, SHALL adopt that key as this phone's own — so the версії of that
line stay openable and the ones this phone uploads next join them. Where the folder holds версії of
more than one line, the line adopted SHALL be the one the entered code opens. Restoring a версія
бекапу with a код відновлення SHALL adopt that key in the same way and for the same reason.

A код відновлення entered correctly SHALL itself complete the connection: the owner who typed the
code has demonstrated they hold it, so the app SHALL NOT ask them to acknowledge it again, and the
connection SHALL be complete and its daily uploads SHALL begin.

The owner who no longer has the код відновлення SHALL be able to start a new line instead. Before
they do, the app SHALL say that the версії already in Drive will no longer be openable by this
phone. Starting a new line SHALL NOT delete them.

The app SHALL NOT delete a версія бекапу it cannot open. Removing older версії — the requirement
"A new upload never destroys the last good one" — SHALL apply only to версії of the line the app is
currently uploading.

#### Scenario: A new phone continues the same backup line

- **WHEN** the owner connects Google Drive on a new phone, the folder already holds версії
  бекапу, and they enter the код відновлення of that line
- **THEN** the phone adopts that key, every версія already there stays openable, and the next
  бекап this phone uploads is sealed under the same key

#### Scenario: A версія the phone cannot open is not deleted

- **WHEN** the owner starts a new line because they no longer have the old код відновлення, and
  enough new версії бекапу are uploaded to pass the number the app keeps
- **THEN** every версія of the old line is still in the folder, and only версії of the new line
  are removed

#### Scenario: Restoring with the код відновлення joins that line too

- **WHEN** a phone holding no key restores a версія бекапу by entering its код відновлення, and
  a бекап is uploaded from that phone afterwards
- **THEN** the uploaded бекап is sealed under the same key, and it joins the версії that were
  already there rather than starting a second line

#### Scenario: Connecting with the code needs no second acknowledgement

- **WHEN** the owner connects on a keyless phone, the folder already holds версії бекапу, and
  they enter a код відновлення that opens one
- **THEN** the connection is complete without a further acknowledgement being asked for, and the
  app uploads when a бекап is next due

#### Scenario: A версія from another line is named as such, not as a mistyped code

- **WHEN** the owner restores and chooses a версія бекапу sealed under a key other than the one
  this phone holds
- **THEN** the app says that версія belongs to another код відновлення rather than saying the
  code was entered wrongly

### Requirement: The current бекап is uploaded at least once every 24 hours, best-effort

While Google Drive is connected, the app SHALL upload the current бекап when at least 24
hours have passed since the last successful upload and the system gives the app the chance to
run. When the system did not give it that chance, the app SHALL upload at the next opportunity
after the app is opened. The app SHALL NOT state a clock time at which a backup will happen.
When the current бекап holds the same state as the one last uploaded — the same integrity value
over its contents, which is the only sameness a бекап can have, since every one records the moment
it was made — the app SHALL make no new upload and SHALL leave the last successful upload
standing.

#### Scenario: A due backup runs in the background

- **WHEN** Google Drive is connected, more than 24 hours have passed since the last
  successful upload, and the system gives the app a chance to run
- **THEN** the current бекап is uploaded and the last successful upload becomes this one

#### Scenario: A missed window is caught up on opening

- **WHEN** more than 24 hours have passed since the last successful upload, the system never
  gave the app a chance to run, and the owner opens the app
- **THEN** the current бекап is uploaded

#### Scenario: An unchanged бекап is not uploaded again

- **WHEN** a backup is due and the current бекап holds exactly the state the last uploaded one
  held, carrying the same integrity value
- **THEN** no new upload is made and the last successful upload's date is unchanged

#### Scenario: A disconnected app never uploads

- **WHEN** Google Drive is not connected and 24 hours pass
- **THEN** nothing is uploaded

### Requirement: A new upload never destroys the last good one

The app SHALL keep several most recent версії бекапу in its Drive folder. A new version SHALL
be uploaded in full and confirmed before any older version is removed, and the app SHALL never
remove a version while it holds no newer complete one. An upload that fails SHALL leave every
version already in the folder exactly as it was.

#### Scenario: A failed upload leaves the folder untouched

- **WHEN** an upload fails part-way
- **THEN** every версія бекапу already in the folder is unchanged and the last successful
  upload is still the one before it

#### Scenario: Older versions are pruned only after a newer one is complete

- **WHEN** the folder already holds the number of версії бекапу the app keeps and a new
  upload completes
- **THEN** the newest versions up to that number remain and only versions older than them are
  removed

### Requirement: The owner is told the last success and the last failure

The app SHALL make available, while connected, the moment of the last successful upload and
the last failure with a reason the owner can act on. A failure SHALL NOT erase or replace the
last successful upload's moment. When there has been no successful upload yet, the app SHALL
say so rather than showing an absent or invented date.

#### Scenario: A failure does not erase the last success

- **WHEN** an upload succeeded yesterday and today's upload fails
- **THEN** yesterday's success is still shown as the last successful backup, alongside
  today's failure and its reason

#### Scenario: Nothing uploaded yet is said plainly

- **WHEN** Google Drive was connected a minute ago and no upload has completed
- **THEN** the app says there is no successful backup yet, and shows no date

### Requirement: Restore is explicit, named, verified, and replaces rather than merges

The app SHALL restore only when the owner asks for it and SHALL never restore on its own. It
SHALL offer the версії бекапу in the folder by their dates, and before replacing anything it
SHALL name the версія бекапу that will be restored, its date, and that restoring replaces
everything now on the phone — and SHALL require the owner's confirmation. Restoring SHALL be
refused, with nothing on the phone changed, when the бекап does not open, fails its integrity
check, or was made by a newer version of the app than the one restoring it. A restore that
fails part-way SHALL leave the phone exactly as it was.

#### Scenario: The version and its date are named before anything is replaced

- **WHEN** the owner chooses a версія бекапу to restore
- **THEN** its date and the fact that restoring replaces everything now on the phone are
  shown, and nothing is replaced until the owner confirms

#### Scenario: Restore replaces, it does not merge

- **WHEN** the owner records a транзакція, then restores a версія бекапу made before it and
  confirms
- **THEN** the phone holds exactly what that версія бекапу held, and the транзакція recorded
  after it is gone

#### Scenario: A бекап from a newer app version is refused

- **WHEN** the chosen версія бекапу was written to a schema the app does not understand
- **THEN** restoring is refused, the owner is told why, and nothing on the phone is changed

#### Scenario: A corrupted версія бекапу is refused

- **WHEN** the chosen версія бекапу fails its integrity check
- **THEN** restoring is refused and nothing on the phone is changed

#### Scenario: A restore that fails part-way leaves the phone as it was

- **WHEN** a confirmed restore fails while it is replacing local data
- **THEN** the phone holds exactly what it held before the restore began

### Requirement: Every refusal is a state the owner is shown, never a crash

No failure of backup or restore SHALL crash the app or leave it claiming a state it is not
in. Absent network, a Google account that has withdrawn the app's access, a Drive with no room
left, and a бекап that will not open SHALL each be reported as itself, with what the owner can
do about it. When Google has withdrawn access, the app SHALL stop presenting itself as
connected and SHALL ask the owner to connect again; it SHALL NOT delete or alter local data
and SHALL NOT touch what is already in the Drive folder.

#### Scenario: No network is a reported state

- **WHEN** a backup is due and the phone has no network
- **THEN** the app reports that the backup could not be sent, stays connected, and tries again
  when a backup is next due

#### Scenario: Withdrawn access stops the claim of being connected

- **WHEN** the owner withdraws the app's access at their Google account and the app next
  tries to upload
- **THEN** the app reports that the authorisation is gone and asks the owner to connect again,
  and the owner's рахунки, транзакції and the версії бекапу already in Drive are untouched

#### Scenario: A full Drive is reported as a full Drive

- **WHEN** an upload fails because the owner's Drive has no room
- **THEN** that is the reason reported, and the last successful upload still stands

### Requirement: Named secrets and captured data never reach Google Drive

What the app uploads SHALL NOT contain the monobank token, the authorisation Google issued,
the sealing key or its код відновлення, any raw payload of a bank notification, or the
on-device capture queue.

#### Scenario: An uploaded бекап carries no secret and no captured payload

- **WHEN** monobank is connected, a bank app is watched, notifications have been captured, and
  a бекап is uploaded and then opened with the key
- **THEN** it contains no monobank token, no Google authorisation, no sealing key, no код
  відновлення, no raw notification payload and no capture queue
