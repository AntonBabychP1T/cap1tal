## MODIFIED Requirements

### Requirement: Changing one's mind leaves nothing behind

WHEN the owner chooses «Скасувати», or leaves the sheet by the device's back gesture — after the
confirmation the app-shell capability asks for when the owner has typed into the sheet — the app SHALL
store no репорт, SHALL keep no скріншот, and SHALL leave no captured file anywhere on the phone.

A refused save is not changing one's mind. WHEN a save is refused the sheet SHALL stay open with
what the owner typed and with the captured скріншот still attached to it, so that the next attempt
carries the picture the first one was refused with. The captured file SHALL be discarded exactly
once, when the sheet closes without a stored репорт; a captured file SHALL NOT outlive the sheet it
was taken for.

A capture that outlived the app itself — the process died between the capture and the save — SHALL
be gone by the end of the next launch, so that a phone that crashed mid-репорт accumulates nothing.

#### Scenario: Cancelling stores nothing and keeps nothing

- **WHEN** the owner starts a репорт, types two lines and chooses «Скасувати»
- **THEN** no репорт exists, no скріншот is kept, and the file captured for it is gone from the
  phone

#### Scenario: The back gesture is the same as cancelling

- **WHEN** the owner starts a репорт and uses the device's back gesture
- **THEN** the sheet closes, no репорт exists and no captured file is left behind

#### Scenario: A refused save keeps the скріншот for the next attempt

- **WHEN** the owner saves with «Що не так?» empty, is refused, then writes one line and saves
- **THEN** the sheet stayed open with the скріншот throughout, and the stored репорт carries that
  same скріншот — the one taken of the screen the owner was complaining about

#### Scenario: A capture that outlived the app is gone at the next launch

- **WHEN** the app is killed between the capture and the save, and is opened again
- **THEN** no репорт exists from that attempt and the phone holds no captured file from it

#### Scenario: Ten cancelled reports leave ten nothings

- **WHEN** the owner starts and cancels a репорт ten times
- **THEN** «Репорти про помилки» is as empty as before and the phone holds no captured file from
  any of them
