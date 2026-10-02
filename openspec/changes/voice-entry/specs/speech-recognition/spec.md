## Purpose

The device side of dictating a фраза: recognising Ukrainian speech on the phone itself and nowhere
else, the microphone permission, every state in which recognition cannot work and what the owner is
told in it, and the guarantee that neither the audio nor the фраза is kept.

## ADDED Requirements

### Requirement: Speech is recognised on the phone only

The app SHALL recognise speech only with a recogniser that runs on the phone and SHALL never use a
recogniser that may send audio or text off the phone, whether or not the phone is online. Where the
phone offers no on-device recogniser — an older system, or no recognition service at all —
recognition SHALL be reported as unavailable on this phone, never fall back to another recogniser.
The language asked for SHALL be Ukrainian whatever the phone's own language.

#### Scenario: No on-device recogniser, no recognition

- **WHEN** the phone's system is older than the first one with on-device recognition, or it has no
  on-device recognition service
- **THEN** recognition is reported as unavailable on this phone, the microphone is not opened, and
  no other recogniser is used

#### Scenario: Recognition works with the network off

- **WHEN** the phone has on-device Ukrainian, has no network, and the owner dictates
- **THEN** the фраза is recognised as it would be online (checked by the owner on their phone)

#### Scenario: The phone in English still asks for Ukrainian

- **WHEN** the phone's language is English and the owner dictates
- **THEN** the recogniser is asked for Ukrainian, not English

### Requirement: Missing Ukrainian is said, and the phone's own settings are offered

When the on-device recogniser exists but Ukrainian is not installed on it, recognition SHALL be
reported as needing the Ukrainian language, and the app SHALL offer opening the phone's settings,
saying that Ukrainian for recognition on the phone is added there by the owner, without promising
the exact screen; the app SHALL NOT itself ask the phone to fetch a language, and SHALL NOT open a
screen for choosing a voice input service. When the phone reports the language as being added, recognition SHALL be reported as
waiting for it. When the phone has no Ukrainian to offer, recognition SHALL be reported as
unavailable on this phone. Where the phone cannot tell in advance whether Ukrainian is installed,
a missing language SHALL be reported the same way when a dictation ends because of it.

#### Scenario: Ukrainian not installed

- **WHEN** the phone's on-device recogniser lacks Ukrainian and the owner taps to dictate
- **THEN** the owner is told that Ukrainian is not yet on the phone, is offered the phone's
  settings, and the microphone is not opened

#### Scenario: The language is being added

- **WHEN** the phone reports Ukrainian as pending for its on-device recogniser
- **THEN** recognition is reported as waiting for the language, not as unavailable

#### Scenario: A phone that cannot tell in advance

- **WHEN** the phone cannot report its on-device languages in advance and a dictation ends because
  Ukrainian is missing
- **THEN** the dictation ends as language missing, said and offered exactly as when it is known in
  advance

### Requirement: The microphone permission is answered truthfully and asked for on the owner's action

The app SHALL report the microphone permission as the device has it: granted, deniable (not yet
granted and the system will ask), blocked (only the system settings can change it) or unsupported
(a build or platform where no microphone can be used). It SHALL ask for it only on the owner's own
action to dictate — tapping «Надиктувати» or holding the «+» — never on launch and never on opening
the entry form by a tap, and where it is blocked it SHALL be able to open the app's system
settings.

#### Scenario: The first dictation asks

- **WHEN** the permission is deniable and the owner taps to dictate
- **THEN** the system permission dialog is shown and its answer becomes the state

#### Scenario: Opening the form asks nothing

- **WHEN** the owner opens the entry form by tapping the «+» and does not tap to dictate
- **THEN** no permission dialog is shown and the microphone is not opened

#### Scenario: A blocked permission offers the settings

- **WHEN** the permission is blocked and the owner taps to dictate
- **THEN** no dialog appears, the state is reported as blocked and opening the app's system
  settings is offered

### Requirement: A dictation yields one фраза or one typed reason

A dictation SHALL listen from the owner's action until the owner stops speaking, taps to stop, or
cancels, and SHALL end with exactly one of: the recognised фраза; nothing heard; cancelled; the
recogniser busy; the permission missing; the language missing; the language unavailable; or failed.
While listening it SHALL report what it has heard so far. Leaving the screen, or the app going to
the background, SHALL cancel the dictation and release the microphone. Only one dictation SHALL
listen at a time: asking for a second while one listens SHALL change nothing.

#### Scenario: Silence ends it with the фраза

- **WHEN** the owner taps to dictate, the recogniser hears «п'ятсот гривень гаманець» and the owner
  stops speaking
- **THEN** the dictation ends with the фраза «п'ятсот гривень гаманець»

#### Scenario: Nothing said is nothing heard

- **WHEN** the owner taps to dictate and the recogniser hears nothing, or returns empty text
- **THEN** the dictation ends as nothing heard, not as a failure

#### Scenario: Leaving the screen releases the microphone

- **WHEN** a dictation is listening and the owner goes back or switches to another app
- **THEN** the dictation ends as cancelled and the microphone is released

#### Scenario: A second dictation does not start over the first

- **WHEN** a dictation is listening and the owner taps to dictate again
- **THEN** the listening dictation goes on and no second one starts

### Requirement: Neither the audio nor the фраза is kept

The audio of a dictation SHALL NOT be recorded to storage, kept past the dictation, or handed to
anything but the on-device recogniser. The фраза, the words heard while listening and the notes the
form shows about them SHALL NOT be stored, backed up, written to the журнал, written to the
system's log, or written by the app into a репорт про помилку — a скріншот of the entry form shows
whatever is on the screen, as every скріншот does, and leaves only by the owner's hand. What reaches
storage is only the транзакція the owner records, with the опис the owner left in the form. The
журнал MAY record that a dictation ended and which of its outcomes it was, never its words.

#### Scenario: A recorded витрата keeps only its опис

- **WHEN** the owner dictates «п'ятсот гривень гаманець опис покусать суші» and presses «Записати»
- **THEN** the stored витрата has the опис «покусать суші», and the фраза itself is found in no
  table, бекап or журнал entry

#### Scenario: A dictation's журнал entry carries no words

- **WHEN** a dictation ends with a фраза, and the form shows a note that «суші» was heard as a
  категорія not matched
- **THEN** the журнал records at most that a dictation ended with a фраза, without any of its
  words and without the note
