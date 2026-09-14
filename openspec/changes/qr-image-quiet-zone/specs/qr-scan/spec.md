## MODIFIED Requirements

### Requirement: A photo or file already on the phone can be decoded instead of the camera

The app SHALL offer decoding a QR code from an existing photo or file, chosen through the phone's
own picker, as an alternative to the camera at every point the camera can be used or asked for.
Decoding a picked image SHALL happen on the device, the same as a camera frame, and SHALL need no
camera permission and touch no camera hardware. Choosing a photo or file SHALL end with exactly one
of: the text of the first QR code found in it; cancelled, when the owner left the picker without
choosing anything; no QR found, when the chosen image carries none; or a typed reason the file
could not be opened or read. A QR code SHALL be found even when its own light margin is narrow and
the background right around it is as dark as the code itself — a чек shown in a dark-themed app
and saved as a screenshot — and the outcome no QR found SHALL be reached only after the image has
been examined for exactly that case. Nothing about the chosen file SHALL be stored or sent, and no
copy of the chosen image or of any part of it SHALL remain in the app's storage once the choice has ended,
whatever it ended with; only the decoded text, if any, continues. Examining the image for that
case SHALL NOT keep the choice from ending: if it does not finish in a bounded time, the choice
SHALL end as no QR found.

#### Scenario: A picked photo with a QR is decoded

- **WHEN** the owner chooses a photo already on the phone and it carries a QR code
- **THEN** the choice ends with exactly that QR code's text, the same as a camera decode would

#### Scenario: A чек screenshot from a dark-themed app is decoded

- **WHEN** the owner chooses a screenshot of a чек shown on a dark background, where the QR code's
  light margin is about one module wide and the background beyond it is as dark as the code's
  modules
- **THEN** the choice ends with exactly that QR code's text, not with no QR found

#### Scenario: A photo that decodes at once is decoded as before

- **WHEN** the owner chooses a photo whose QR code is found in the image as a whole
- **THEN** the choice ends with that QR code's text, and the image is not examined any further

#### Scenario: Looking harder that never finishes still ends the choice

- **WHEN** the whole image yields no QR code and examining it further does not finish in the
  bounded time
- **THEN** the choice ends with the typed reason that no QR code was found, and the scanner is not
  left waiting

#### Scenario: Leaving the picker is cancelled

- **WHEN** the owner opens the picker and leaves it without choosing a file
- **THEN** the choice ends as cancelled and nothing else happens

#### Scenario: A photo with no QR code says so

- **WHEN** the owner chooses a photo that carries no QR code, dark or light
- **THEN** the choice ends with the typed reason that no QR code was found, not with cancelled or a
  crash

#### Scenario: A file that cannot be read is a typed failure

- **WHEN** the phone cannot open or read the file the owner chose
- **THEN** the choice ends with a typed failure reason naming that, not a crash

#### Scenario: Nothing of the chosen image remains after the choice

- **WHEN** a choice of a photo or file has ended — decoded, no QR found, or failed, including after
  the image was examined for a narrow margin
- **THEN** no copy of the chosen image and no part cut from it remains in the app's storage

#### Scenario: Choosing a photo needs no camera permission

- **WHEN** the camera permission is blocked, deniable, or the build is unsupported for the camera
- **THEN** choosing a photo or file is still offered and still works, because it never asks for or
  uses the camera
