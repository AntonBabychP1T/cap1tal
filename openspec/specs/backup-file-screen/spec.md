# backup-file-screen Specification

## Purpose
The «Бекап» section of Налаштування — where the owner saves their whole state to one file and
brings it back from one, sees what a бекап holds and what restoring would replace before agreeing
to it, and is told in their own words when a file cannot be used.
## Requirements

### Requirement: The «Бекап» section offers saving and restoring, and says what the file is

The «Бекап» section SHALL offer «Зберегти у файл» and «Відновити з файлу». It SHALL state that the
file holds the owner's financial data unencrypted, and that restoring replaces everything now on
the phone.

#### Scenario: The section opens on its two actions and its warning

- **WHEN** the owner opens «Бекап»
- **THEN** «Зберегти у файл» and «Відновити з файлу» are offered, with the words that the file is
  unencrypted and that restoring replaces everything on the phone

### Requirement: Saving produces one file, named by its date, and hands it to the owner

«Зберегти у файл» SHALL produce one бекап of the current state, name it so that its date is
visible in the name, and hand it to the system so the owner chooses where it goes. When it has
been handed over, the screen SHALL say what was saved — the moment of the бекап and how many
рахунки and транзакції it holds. If the owner backs out of choosing a destination, the screen
SHALL claim no бекап was saved.

#### Scenario: A saved бекап is reported by what it holds

- **WHEN** the owner taps «Зберегти у файл» on a phone with 12 рахунки and 4300 транзакції, and
  hands the file on
- **THEN** the screen says a бекап of that moment with 12 рахунки and 4300 транзакції was saved,
  and the file's name carries the date it was made

#### Scenario: Backing out claims nothing

- **WHEN** the owner taps «Зберегти у файл» and then dismisses the system's choice of destination
- **THEN** the screen does not say a бекап was saved, and offers «Зберегти у файл» again

#### Scenario: A save that fails says so

- **WHEN** the file cannot be produced or handed over
- **THEN** the screen says the бекап was not saved and why, and nothing about the phone's data has
  changed

### Requirement: A file chosen for restore is checked before it is offered as restorable

«Відновити з файлу» SHALL let the owner pick a file, and SHALL refuse an unusable one in Ukrainian
by its reason — not a бекап, damaged, from a newer version of the app, or holding contents that
contradict each other — without touching anything on the phone and while still offering to pick
another file.

#### Scenario: A file that is not a бекап is named as such

- **WHEN** the owner picks a Saldo CSV export
- **THEN** the screen says this file is not a бекап, offers to pick another, and no рахунок or
  транзакція changes

#### Scenario: A damaged бекап is named as damaged

- **WHEN** the owner picks a бекап whose integrity check fails
- **THEN** the screen says the file is damaged and cannot be restored, and nothing on the phone
  changes

#### Scenario: A бекап from a newer app is named as such

- **WHEN** the owner picks a бекап written by a newer version of the app
- **THEN** the screen says it was made by a newer version and that the app must be updated first,
  and nothing on the phone changes

### Requirement: The restore preview is shown, and replacing waits for the owner's word

Before anything is replaced, the screen SHALL show what the бекап holds — the moment it was made,
how many рахунки and транзакції, and the months they span — beside the same figures for what is on
the phone now, and SHALL state that everything now on the phone will be replaced. Restoring SHALL
happen only after the owner confirms; backing out SHALL leave the phone exactly as it was.

#### Scenario: The preview puts the бекап beside the phone

- **WHEN** the owner picks a valid бекап made on 2026-08-30 holding 12 рахунки and 4300
  транзакції, while the phone holds 3 рахунки and 40 транзакції
- **THEN** the screen shows both sets of figures, the months the бекап spans, and that restoring
  replaces the phone's 3 рахунки and 40 транзакції

#### Scenario: Backing out of the preview restores nothing

- **WHEN** the owner sees the preview and backs out
- **THEN** the phone still holds its own 3 рахунки and 40 транзакції, and no бекап was restored

### Requirement: The result of a restore is reported, and a failed one leaves the phone as it was

After the owner confirms, the screen SHALL report success with what was restored, and the app
SHALL then show the restored state everywhere it shows рахунки and транзакції. A restore that
fails SHALL be reported as failed with its reason, and the phone SHALL hold exactly what it held
before the attempt.

#### Scenario: A successful restore is reported and visible

- **WHEN** the owner confirms restoring a бекап holding 12 рахунки and 4300 транзакції
- **THEN** the screen says that many рахунки and транзакції were restored, and «Рахунки» shows the
  бекап's 12 рахунки

#### Scenario: A failed restore changes nothing

- **WHEN** the owner confirms a restore and writing it is rejected partway
- **THEN** the screen says the restore failed and why, and «Рахунки» still shows the рахунки the
  phone held before
