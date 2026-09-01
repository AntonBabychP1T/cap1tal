# google-drive-backup-screen — delta

## Purpose

The «Google Drive» section of Налаштування: the one place the owner connects their Google
account, reads whether their history is safe and how recently, keeps the код відновлення,
saves or restores a версія бекапу by hand, and disconnects — every state and every refusal
said in Ukrainian, in words that name what to do next.

## ADDED Requirements

### Requirement: The Google Drive section says where the app stands

The «Google Drive» section SHALL show whether Google Drive is connected. While it is not
connected, it SHALL say what connecting does — a sealed copy of everything the app holds, in
the owner's own Google Drive, about once a day — and SHALL offer connecting as the only
action. While it is connected, it SHALL show which Google account holds the copies, the date
of the last successful бекап or that there is none yet, and the last failure with its reason
when there is one.

#### Scenario: Not connected states what connecting does

- **WHEN** the owner opens «Google Drive» and Google Drive has never been connected
- **THEN** the section explains that a sealed copy of everything goes to their own Google
  Drive about once a day, and offers connecting

#### Scenario: Connected shows the account and the last backup

- **WHEN** Google Drive is connected and the last бекап went up yesterday
- **THEN** the section shows the connected Google account and yesterday as the last
  successful бекап

#### Scenario: A failure is shown next to the last success

- **WHEN** the last бекап succeeded yesterday and today's attempt failed
- **THEN** the section shows yesterday as the last successful бекап and today's failure with
  its reason

### Requirement: Connecting ends on the код відновлення and the owner acknowledges it

Connecting from the section SHALL take the owner through their Google account and SHALL end
by showing the код відновлення with what it is for — that it is the only way a new phone
opens these copies, and that the app cannot recover it for them if they lose it together with
this phone. The section SHALL offer copying it, and SHALL require an explicit acknowledgement
that it has been kept before the connection counts as complete.

#### Scenario: The code is shown with what it is for

- **WHEN** the owner completes the Google step of connecting
- **THEN** the код відновлення is shown, with the explanation that a new phone needs it and
  that it cannot be recovered otherwise, and it can be copied

#### Scenario: Leaving without acknowledging does not complete the connection

- **WHEN** the owner leaves the section while the код відновлення is shown and returns
- **THEN** the section does not present Google Drive as connected and shows the код
  відновлення again for acknowledgement

### Requirement: The код відновлення can be retrieved while connected

While Google Drive is connected, the section SHALL offer showing the код відновлення again
behind an action the owner takes deliberately, and SHALL NOT display it as part of the
section's ordinary state.

#### Scenario: The code is not on the screen by default

- **WHEN** the owner opens «Google Drive» while connected
- **THEN** the код відновлення is not shown

#### Scenario: The owner can ask for it again

- **WHEN** the owner chooses to show the код відновлення
- **THEN** it is shown and can be copied

### Requirement: «Зберегти зараз» backs up now and reports the outcome

While connected, the section SHALL offer «Зберегти зараз», which SHALL upload the current
бекап without waiting for the daily run, SHALL show that it is running, and SHALL report the
result — the new last successful бекап, or the failure and its reason.

#### Scenario: A manual backup updates the last success

- **WHEN** the owner taps «Зберегти зараз» and the upload succeeds
- **THEN** the section shows the moment just passed as the last successful бекап

#### Scenario: A failed manual backup names its reason

- **WHEN** the owner taps «Зберегти зараз» with no network
- **THEN** the section says the бекап could not be sent and why, and the last successful
  бекап is unchanged

### Requirement: «Відновити» names the версія бекапу before replacing anything

While connected, the section SHALL offer «Відновити», which SHALL list the версії бекапу in
the folder by date, newest first. Choosing one SHALL show its date and state that restoring
replaces everything now on the phone, and SHALL require confirmation before anything is
replaced. When this phone does not hold the sealing key, the section SHALL ask for the код
відновлення first and SHALL say plainly when the one entered is wrong.

#### Scenario: The list is offered by date

- **WHEN** the owner opens «Відновити» and the folder holds three версії бекапу
- **THEN** all three are listed by their dates, newest first

#### Scenario: Confirmation is required and names what is replaced

- **WHEN** the owner chooses a версія бекапу from the list
- **THEN** its date and the fact that everything now on the phone will be replaced are shown,
  and nothing is replaced until the owner confirms

#### Scenario: A phone without the key is asked for the код відновлення

- **WHEN** the owner restores on a phone that holds no sealing key
- **THEN** the section asks for the код відновлення before opening any версія бекапу

#### Scenario: A wrong код відновлення is said plainly and can be retyped

- **WHEN** the owner enters a код відновлення that is wrong
- **THEN** the section says it is wrong, nothing is replaced, and the owner can enter it again

### Requirement: «Від'єднати Google Drive» stops backups and says what stays

While connected, the section SHALL offer «Від'єднати Google Drive», which SHALL require
confirmation and SHALL, on confirmation, stop all backups and remove the Google authorisation
from the phone. Before confirming, the section SHALL say that the версії бекапу already in
Drive stay there and that the код відновлення still opens them.

#### Scenario: Disconnecting is confirmed and explained first

- **WHEN** the owner chooses «Від'єднати Google Drive»
- **THEN** the section says the copies already in Drive stay and the код відновлення still
  opens them, and asks for confirmation

#### Scenario: After disconnecting the section is back to its offer

- **WHEN** the owner confirms disconnecting
- **THEN** the section presents Google Drive as not connected and offers connecting again

### Requirement: The section speaks Ukrainian and never shows a secret

Every state, action and refusal the section shows SHALL be written in Ukrainian and SHALL name
what the owner can do about it; no refusal SHALL be shown as untranslated engine text. The
section SHALL NOT display the monobank token or the Google authorisation.

#### Scenario: A refusal is a Ukrainian sentence with a way out

- **WHEN** any backup or restore action fails
- **THEN** what the section shows is in Ukrainian and says what the owner can do next

#### Scenario: No token or authorisation is displayed

- **WHEN** the owner opens «Google Drive» in any state
- **THEN** neither the monobank token nor the Google authorisation appears anywhere on it
