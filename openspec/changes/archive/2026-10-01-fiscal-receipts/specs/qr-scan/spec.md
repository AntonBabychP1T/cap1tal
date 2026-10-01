## Purpose

The device side of scanning: whether the camera may be used to read a QR code, how that permission
is asked for, and how one decoded QR text is handed back — as values the screen shows in the
owner's words, on a build where scanning cannot work as much as on one where it can.

## ADDED Requirements

### Requirement: Camera permission is answered truthfully and asked for on the owner's action

The app SHALL report the camera permission as the device has it: granted, deniable (not yet
granted and the system will ask), blocked (denied in a way the system will not ask again, so only
the system settings can change it), or unsupported (a build or platform where no camera can be
used). Asking for the permission SHALL happen only when the owner starts a scan, never on launch
or on opening a транзакція, and SHALL yield the new state as a value. Where the state is blocked,
the app SHALL be able to open the system settings for the app.

#### Scenario: A first scan asks

- **WHEN** the permission is deniable and the owner starts a scan
- **THEN** the system permission dialog is shown, and the answer becomes the new state — granted
  or, if refused, deniable or blocked as the system says

#### Scenario: A blocked permission offers the settings

- **WHEN** the permission is blocked and the owner starts a scan
- **THEN** no dialog appears, the state is reported as blocked, and opening the app's system
  settings is offered

#### Scenario: A build without a camera says so

- **WHEN** the app runs where no camera can be used
- **THEN** the state is unsupported, distinct from blocked, and no dialog or settings screen is
  offered

### Requirement: A scan yields one decoded text or one typed reason

A scan SHALL end with exactly one of: the text of the first QR code the camera decoded; cancelled,
when the owner left the scanner without a code being decoded; or a typed reason the camera could
not be used — permission not granted, or no camera available. Decoding SHALL happen on the device;
no image SHALL leave the camera view, be stored, or be shown again after the scan. A scan SHALL
decode QR codes only; other barcode kinds SHALL be ignored.

#### Scenario: A QR in view ends the scan with its text

- **WHEN** the camera decodes a QR code
- **THEN** the scan ends with exactly that text and the camera view closes

#### Scenario: Leaving the scanner is cancelled

- **WHEN** the owner leaves the scanner before any QR code is decoded
- **THEN** the scan ends as cancelled and nothing else happens

#### Scenario: Two codes in quick succession yield one

- **WHEN** the camera decodes the same or another code again before the view has closed
- **THEN** only the first decoded text is handed back

### Requirement: A photo or file already on the phone can be decoded instead of the camera

The app SHALL offer decoding a QR code from an existing photo or file, chosen through the phone's
own picker, as an alternative to the camera at every point the camera can be used or asked for.
Decoding a picked image SHALL happen on the device, the same as a camera frame, and SHALL need no
camera permission and touch no camera hardware. Choosing a photo or file SHALL end with exactly one
of: the text of the first QR code found in it; cancelled, when the owner left the picker without
choosing anything; no QR found, when the chosen image carries none; or a typed reason the file
could not be opened or read. Nothing about the chosen file SHALL be stored or sent; only the
decoded text, if any, continues.

#### Scenario: A picked photo with a QR is decoded

- **WHEN** the owner chooses a photo already on the phone and it carries a QR code
- **THEN** the choice ends with exactly that QR code's text, the same as a camera decode would

#### Scenario: Leaving the picker is cancelled

- **WHEN** the owner opens the picker and leaves it without choosing a file
- **THEN** the choice ends as cancelled and nothing else happens

#### Scenario: A photo with no QR code says so

- **WHEN** the owner chooses a photo that carries no QR code
- **THEN** the choice ends with the typed reason that no QR code was found, not with cancelled or a
  crash

#### Scenario: A file that cannot be read is a typed failure

- **WHEN** the phone cannot open or read the file the owner chose
- **THEN** the choice ends with a typed failure reason naming that, not a crash

#### Scenario: Choosing a photo needs no camera permission

- **WHEN** the camera permission is blocked, deniable, or the build is unsupported for the camera
- **THEN** choosing a photo or file is still offered and still works, because it never asks for or
  uses the camera
