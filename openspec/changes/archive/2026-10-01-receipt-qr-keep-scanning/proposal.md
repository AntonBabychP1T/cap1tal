## Why

A real паперовий чек (bug report 2026-09-14 20:20, SM-S921B, commit e07043e; a receipt printed by an
«ІКС» реєстратор, ФН 3000876257, чек 19930061, 4370.91 грн) cannot be attached — neither by the
camera nor by «Обрати фото». The owner sees «QR чека не містить усього потрібного: фіскальний номер
реєстратора.» the moment the camera opens, with no chance to aim again. The чек's позиції are the
detail that answers "where money went" for a large grocery витрата, so a чек the app refuses is a
purchase the owner cannot explain.

The cause was isolated with `zbarimg` on the owner's own photos of this чек. The QR decodes, and its
text is a perfectly ordinary link:

```
https://cabinet.tax.gov.ua/cashregs/check?date=20260912&time=140004&id=19930061&sm=4370.91&fn=3000876257
```

— followed by one NUL byte (`0x00`). The reader trims whitespace, but NUL is not whitespace, so the
last parameter becomes `3000876257\0`, is no longer «digits and nothing else», and is reported as a
missing фіскальний номер реєстратора. Whichever parameter a registrar prints last is the one that
breaks; here it is `fn`. The same text reaches the reader from the camera and from a photo, which
is why both paths fail identically. Nothing in the журнал recorded the refused reading, so the bug
report could not show this on its own.

A second, separate problem made the first one feel like "the scanner does not work": the camera
view closes on the very first QR it decodes, whatever that QR turns out to be. A non-чек QR in the
frame, a partial read, or a чек QR the reader refuses all end the scan immediately and replace the
viewfinder with a refusal and «Сканувати ще раз». The owner's expectation — hold the phone, move
it, and let the app catch the moment the чек QR reads — is not what the screen does.

## What Changes

- The QR reader ignores C0 control characters, DEL, and whitespace around the QR text,
  so a чек QR with a trailing NUL is read like any other. A control character *inside* the text
  still makes it unreadable — only the ends are forgiven.
- While the camera is open, a decoded QR that is not a чек QR, or a чек QR lacking реквізити, no
  longer ends the scan. The viewfinder stays live, the reason is shown beside it as a hint in the
  owner's words, and scanning continues. The first decode that yields complete реквізити ends the
  scan and starts the lookup, exactly as a successful decode does today.
- A refused reading is recorded in the журнал — by the camera once per change of reason, by a chosen
  photo or file once per choice — with the reason and the names of missing реквізити only, never
  the QR text, which carries the реквізити of a purchase. A future bug report from this screen then
  shows why the scanner refused.
- Choosing a photo or file is unchanged in shape: it is one decode of one image, so a refused
  reading still ends as a named reason with scanning again (by camera or another photo) offered.
  It benefits from the NUL fix like the camera does.

Scope: the QR reading rule and the camera scan's behaviour on a refused reading. Nothing about the
lookup, the tax service request, parsing, comparison, attaching, or storage changes.

Non-goals:

- No new QR formats or other hosts — the reader still recognises only the tax service's receipt
  check page.
- No manual entry of реквізити, no torch or zoom controls, no auto-focus tuning; the camera module
  and its settings stay as they are.
- No change to the quiet-zone second look for photos (`qr-image-quiet-zone`).
- No vision §14 item is touched.

This change depends on `fiscal-receipts` (in flight, not archived); its delta specs modify
requirements that change introduces, and it archives after `fiscal-receipts` and
`qr-image-quiet-zone`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `fiscal-receipts`: «The реквізити чека are read from the QR code deterministically» — control
  characters and whitespace around the QR text are ignored; one inside it is not.
- `qr-scan`: «A scan yields one decoded text or one typed reason» — the camera hands back every
  distinct decoded text while it is open, and the scan ends only when the flow accepts one or the
  owner leaves.
- `fiscal-receipts-screen`: «The scan flow says what happened at every step and lets the owner
  retry» — a non-чек or incomplete QR seen by the camera is a hint beside the live viewfinder, not a
  refusal that closes it; a photo keeps the refusal.

## Impact

- `src/fiscal/qr.ts` (+ `qr.test.ts`): the trimming rule; a regression fixture with this чек's exact
  text including the trailing NUL.
- `src/ui/receipt-screen.ts` (+ `receipt-screen.test.ts`): the `scanning` state carries an optional
  hint; `decoded` keeps scanning on `not-a-receipt` / `incomplete`; `decodedFromImage` keeps
  refusing; the journal detail for a refused reading.
- `src/app/transaction/scan.tsx`: the latch closes only on an accepted decode; the hint is rendered
  under the viewfinder; the journal entry is written on a change of hint.
- No new dependency, native module, permission or Expo config change. No schema or migration.
