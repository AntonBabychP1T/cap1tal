## MODIFIED Requirements

### Requirement: A scan yields one decoded text or one typed reason

A scan SHALL end with exactly one of: the text of the first QR code the camera decoded that the
flow accepts; cancelled, when the owner left the scanner without an accepted code; or a typed
reason the camera could not be used — permission not granted, or no camera available. While the
scan is open, every decoded QR text SHALL be handed to the flow, which decides whether it is
accepted; a text the flow does not accept SHALL leave the camera view open and decoding. Once a
text is accepted, no later decode SHALL be handed back. Decoding SHALL happen on the device; no
image SHALL leave the camera view, be stored, or be shown again after the scan. A scan SHALL
decode QR codes only; other barcode kinds SHALL be ignored.

#### Scenario: An accepted QR in view ends the scan with its text

- **WHEN** the camera decodes a QR code and the flow accepts its text
- **THEN** the scan ends with exactly that text and the camera view closes

#### Scenario: A QR the flow does not accept keeps the camera open

- **WHEN** the camera decodes a QR code whose text the flow does not accept
- **THEN** the camera view stays open and keeps decoding, and a later QR code in view is handed to
  the flow the same way

#### Scenario: Leaving the scanner is cancelled

- **WHEN** the owner leaves the scanner before any QR code is accepted, whether or not codes were
  decoded and not accepted
- **THEN** the scan ends as cancelled and nothing else happens

#### Scenario: Two codes in quick succession yield one

- **WHEN** the camera decodes the same or another code again after a text was accepted but before
  the view has closed
- **THEN** only the first accepted text is handed back
