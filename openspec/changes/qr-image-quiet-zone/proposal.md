## Why

«Обрати фото» (fiscal-receipts, design D14) fails on the most natural photo it will ever be given:
a screenshot of a чек shown in a dark-themed app. The real file that exposed it
(`2026-09-12 10.30.55.jpg`, 1080×2340, a monobank чек screen) carries a perfectly valid чек QR, yet
the chosen photo ends as «На цьому фото немає QR-коду.» — so the owner cannot attach the позиції of
a purchase to the транзакція it explains, which is the whole of the "where money went" answer a чек
adds.

The cause was isolated on 2026-09-14 with `zbarimg`, a decoder independent of the phone's ML Kit:

| Input | Decoded |
| --- | --- |
| the whole screenshot | no |
| every tile of a 1080², 810² and 540² grid at half-tile stride | no |
| the QR's own light square alone (420×420) | yes |
| the same square scaled to 30% | yes |
| the square alone on a white 1080×2340 page (4% of the area) | yes |
| the square with 2 or 6 px of the real dark surround | yes |
| the square with 12 px or more of the real dark surround | no |
| the square alone on a black 1080×2340 page | no |
| global threshold, negation, flood-filling the background white | no |

The QR's light margin (its quiet zone) is about one module wide — the standard asks for four — and
directly outside it the app's background (~#1E2127) is the same darkness as the code's own modules
(~#1A–#27). The finder patterns bleed into the page, and a detector looking at the whole image
cannot see where the code ends. Neither scale (the first hypothesis) nor tiling fixes it: every tile
still carries the dark surround, and no brightness threshold separates modules from background.
What does fix it is cutting the QR's light square out of its surround and giving it a proper light
margin.

## What Changes

- When decoding a chosen photo or file finds no QR code in the whole image, the app looks for the
  light, roughly square region a QR code sits in, cuts it out of whatever surrounds it, gives it a
  light margin, and decodes again. Only if that also finds nothing does the choice end as no QR
  found.
- A photo that decodes on the first try decodes exactly as today; the extra look happens only on a
  miss.
- Every intermediate image made while looking is removed when the choice ends, on every outcome —
  the existing promise that nothing about the chosen file is stored now covers the cut-outs too.
- Outcomes, refusals and screen texts are unchanged: `decoded`, `cancelled`, `no-qr`, `failed`, and
  «На цьому фото немає QR-коду.» when the second look finds nothing either.

**Non-goals**

- A small QR on a *light* background (a paper чек photographed from far away). The evidence above
  shows scale alone does not stop decoding; if a real far-away photo ever fails, it gets its own
  change with its own file.
- More than one QR in an image, choosing between several, or reading anything but QR.
- The live camera scan — unchanged. So are the screen, the refusals and their texts.
- Any new permission. No vision §14 item is touched.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `qr-scan`: «A photo or file already on the phone can be decoded instead of the camera» — a QR
  whose narrow light margin sits against a background as dark as its modules SHALL still be found,
  and nothing derived from the chosen image SHALL outlive the choice. The capability is introduced
  by `fiscal-receipts`, still in flight, so this delta modifies the requirement as that change
  writes it.

## Impact

- `src/platform/qr-image-device.ts` — the second look on a `no-qr` miss, and cleanup of every
  derived file.
- `src/platform/qr-quiet-zone.ts` (new) — pure TypeScript: from decoded pixels, where the light QR
  square is and what to cut, and the order of the two looks and the cleanup over injected steps;
  tested under `verify` with synthetic pixel grids and a steps double.
- `scripts/qr-quiet-zone-dry-run.ts` (new) — runs the locator on a real image on the Mac and writes
  the cut-out, so the approach is checked with `zbarimg` on the real file before the emulator.
- Dependencies: **`expo-image-manipulator` ~57.0.17 — a new native module** (a rebuild, not just
  Metro); `jpeg-js` ^0.4.4 — pure JavaScript, no native code.
- No schema, migration, backup or screen change.

## Depends on

`fiscal-receipts`. This change modifies the `qr-scan` requirement and the device adapter that
change introduces; it is implemented on top of it and archives **after** it. Because a MODIFIED
delta replaces the whole requirement, the delta's base text is re-checked against the archived
`openspec/specs/qr-scan/spec.md` before this change archives (task 5.2), so an edit `fiscal-receipts`
still makes to that requirement is not silently overwritten.
