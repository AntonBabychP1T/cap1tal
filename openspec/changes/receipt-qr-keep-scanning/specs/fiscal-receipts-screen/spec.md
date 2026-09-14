## MODIFIED Requirements

### Requirement: The scan flow says what happened at every step and lets the owner retry

Starting «Сканувати QR чека» SHALL ask for the camera permission if needed and open the scanner,
which SHALL also offer choosing an existing photo or file as an alternative to the camera; after a
QR yielding complete реквізити is decoded — by the camera or by a chosen photo or file — the
screen SHALL show that the чек is being looked up, then either the comparison and the позиції
about to be attached, or one named reason.

While the camera is scanning, a decoded QR that is not a чек QR, or a чек QR that lacks реквізити,
SHALL NOT end the scan: the camera view SHALL stay open and keep decoding, the reason SHALL be
shown beside the camera view as a hint in the same words as the corresponding reason below, and
the hint SHALL stay until a decode yields a different reason or complete реквізити, or the scan
otherwise ends (the owner leaves, or a chosen photo or file ends in a refusal or a lookup). The first
decode yielding complete реквізити SHALL end the scan and start the lookup, whatever hint was shown
before it. Each distinct hint shown SHALL be recorded in the журнал with the reason and, for
missing реквізити, their names — never the text of the QR or any реквізит value; the same hint
seen again in a row SHALL NOT be recorded again. A chosen photo or file whose QR is not a чек QR or
lacks реквізити SHALL be recorded the same way, once per choice.

Each reason SHALL be shown in Ukrainian in the owner's terms, and SHALL offer what can be done
next:

- camera permission refused: the reason, the system settings when the permission is blocked, and
  choosing a photo or file, which needs no camera permission;
- no camera on this device: the reason, and choosing a photo or file;
- the QR is not a чек: while the camera is scanning, the hint with the camera kept open; for a
  chosen photo or file, the reason, and scanning again (by camera or by choosing another photo or
  file);
- the чек QR lacks реквізити: while the camera is scanning, the hint naming what is missing with
  the camera kept open; for a chosen photo or file, the reason naming what is missing, and
  scanning again;
- the chosen photo carries no QR code: the reason, and choosing another photo or file, or scanning
  by camera;
- the chosen file could not be opened or read: the reason, and choosing another photo or file, or
  scanning by camera;
- the чек was not found: the reason, a note that a чек may appear at the tax service with a
  delay, and «Повторити» without scanning again;
- no network, or the tax service unavailable: the reason and «Повторити» without scanning again;
- the tax service refused the request or answered in a shape the app cannot read: the reason
  that the service has changed and the app needs an update, and «Повторити»;
- the document served is not a fiscal document, is not a sale or a return (a shift or service
  document), or is not the чек looked up (it names another реєстратор, date or total): the
  reason, and scanning again;
- the чек is already attached to another транзакція: the reason naming that транзакція;
- this транзакція already carries a чек: the reason.

Leaving the scanner SHALL end the flow with nothing stored. Retrying SHALL reuse the decoded
реквізити while the screen is open; nothing SHALL be retried on its own, in the background, or
after the screen is left.

#### Scenario: A successful scan ends in a preview to confirm

- **WHEN** the QR is a чек, the lookup finds it and its total equals the транзакція's сума
- **THEN** the screen shows the позиції about to be attached with the total, and offers
  «Прикріпити»

#### Scenario: A mismatch is a warning with a choice

- **WHEN** the lookup finds the чек and its total 74230 differs from the транзакція's 70000 minor
  units UAH
- **THEN** the screen states both amounts as not matching and offers «Прикріпити все одно» and
  «Скасувати», attaching nothing until one is chosen

#### Scenario: A чек not found can be retried without scanning again

- **WHEN** the lookup answers not-found
- **THEN** the screen says the чек was not found, that it may appear later, and offers
  «Повторити», which looks the same реквізити up again

#### Scenario: Offline is a reason, not a crash

- **WHEN** the phone is offline when the lookup starts
- **THEN** the screen says there is no connection and offers «Повторити», and the транзакція is
  otherwise usable as before

#### Scenario: A changed service is named as such

- **WHEN** the lookup answers request-rejected or unreadable
- **THEN** the screen says the tax service answered in a way this version cannot read, and offers
  «Повторити»

#### Scenario: A non-чек QR in the camera keeps the camera open

- **WHEN** the camera is scanning and decodes a Wi-Fi QR
- **THEN** the camera view stays open and keeps decoding, and beside it the screen says this is not
  a чек QR; nothing is looked up

#### Scenario: An incomplete чек QR in the camera keeps the camera open

- **WHEN** the camera is scanning and decodes a чек QR lacking the сума and the time
- **THEN** the camera view stays open and keeps decoding, and beside it the screen names the сума
  and the time as missing; nothing is looked up

#### Scenario: Aiming on until the чек QR reads starts the lookup

- **WHEN** the camera, while scanning, first decodes a Wi-Fi QR and then a чек QR with complete
  реквізити
- **THEN** the hint is shown after the first decode, and the second decode ends the scan and the
  screen shows the чек is being looked up

#### Scenario: A repeated hint is recorded once

- **WHEN** the camera decodes the same Wi-Fi QR many times in a row, and then a чек QR lacking the
  сума
- **THEN** the журнал gains exactly two entries for the scan — one naming a non-чек QR and one naming
  the сума as missing — and neither contains the text of either QR

#### Scenario: A non-чек QR in a chosen photo asks for another

- **WHEN** the owner chooses a photo whose QR is a Wi-Fi QR
- **THEN** the screen says this is not a чек QR and offers scanning again by camera or choosing
  another photo or file, and the журнал gains one entry naming a non-чек QR without its text

#### Scenario: An incomplete чек QR in a chosen photo asks for another

- **WHEN** the owner chooses a photo whose чек QR lacks the сума and the time
- **THEN** the screen names the сума and the time as missing and offers scanning again by camera or
  choosing another photo or file, and the журнал gains one entry naming only those missing
  реквізити without the QR text or any реквізит value

#### Scenario: A document that is not the чек asks for another scan

- **WHEN** the lookup finds a document that is a shift-open document, or one naming a different
  реєстратор than the QR
- **THEN** the screen says the document served is not the чек of this QR, offers scanning again,
  and nothing is stored

#### Scenario: A photo already on the phone is looked up the same as a camera scan

- **WHEN** the owner chooses «Обрати фото» and picks a photo carrying a чек QR
- **THEN** the screen shows the чек is being looked up, exactly as a camera decode would

#### Scenario: A photo with no QR code offers trying again

- **WHEN** the owner chooses a photo that carries no QR code
- **THEN** the screen says no QR code was found in that photo, and offers choosing another photo or
  scanning by camera

#### Scenario: Leaving the photo picker changes nothing

- **WHEN** the owner opens the photo picker and leaves it without choosing anything
- **THEN** the scanner stays open exactly as it was, and nothing else happens

#### Scenario: A device with no camera can still import a photo

- **WHEN** the app runs where no camera can be used
- **THEN** the reason names that, and «Обрати фото» is offered in its place

#### Scenario: A blocked camera still allows choosing a photo

- **WHEN** the camera permission is blocked
- **THEN** the reason and the system-settings offer are shown, and «Обрати фото» is offered beside
  them, working without asking for the camera permission

#### Scenario: A photo decoded while the camera is blocked reaches the same preview

- **WHEN** the camera permission is blocked and the owner chooses «Обрати фото» and picks a photo
  carrying a чек QR whose total matches the транзакція's сума
- **THEN** the screen shows the чек being looked up and then the preview with «Прикріпити», exactly
  as a successful camera scan would — the blocked camera permission stops the camera, not this

#### Scenario: Cancelling leaves nothing behind

- **WHEN** the owner leaves the scanner or chooses «Скасувати» at the preview
- **THEN** no чек is stored and the транзакція is unchanged

#### Scenario: A транзакція gone during the flow ends it

- **WHEN** the транзакція was deleted while the scan flow was open and the owner chooses
  «Прикріпити»
- **THEN** nothing is stored, the screen says the транзакція no longer exists, and the flow ends
