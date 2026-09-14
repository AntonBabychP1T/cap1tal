## Context

`fiscal-receipts` design D14 decodes a chosen photo or file with one call:
`scanFromURLAsync(uri, ['qr'])` over the whole image, in `src/platform/qr-image-device.ts`, folded
into `decoded | cancelled | no-qr | failed` by the port in `src/platform/qr-image.ts`. The screen
logic (`src/ui/receipt-screen.ts`) only relays that outcome. See proposal.md → Why for the file that
fails and the `zbarimg` table: the QR's one-module light margin sits against an app background as
dark as its modules, and that — not scale — is what hides it.

A prototype of the approach below was run on 2026-09-14 against that real file (Python + ImageMagick
+ `zbarimg`, scratch only): with a working copy 540, 360 or 270 px wide, the locator found the QR's
light square as exactly one candidate (420×420 at 36,1078 in the original, within rounding), and the
cut-out decoded — both with and without an added light margin. The same locator with
4-connectivity did **not** work: black modules on the square's edge split its light area into
fragments, none square. 8-connectivity joined them.

Constraints: `npm run verify` never loads a `-device.ts` adapter or a native module; the decision
logic must be plain TypeScript it can test. Hermes has no `Buffer` and no canvas — pixels have to be
reached through files and a JavaScript decoder.

## Goals / Non-Goals

**Goals:**

- A dark-surround чек screenshot decodes, with the first whole-image attempt unchanged and the
  second look paid for only on a miss.
- Where the light square is, and what to cut, is a pure function tested under `verify`.
- Every file made along the way is deleted on every outcome.

**Non-Goals:**

- A general "find a QR anywhere" engine: no tiling, no rotation, no perspective correction, no
  small-QR-on-light-paper search (proposal → Non-goals).
- Changing the port's shape, the outcomes, `receipt-screen.ts` or any text.

## Decisions

**D1. Two looks, the second only on `no-qr`.** `pickAndDecode` keeps its first call exactly as it is.
Only when that returns no barcode does it run the second look; a `decoded` first result returns at
once, and a thrown error stays `failed` without a second look (a file that could not be read will
not read better cut up). The second look's own errors — manipulator failure, a decoder exception on
an odd format — fold into `no-qr`, not `failed`: the file *was* read (the first look proved it), and
the owner's next step is the same "choose another photo". *Alternative*: always run both — rejected,
it would slow every photo that already works.

**D2. Pixels through `expo-image-manipulator` and `jpeg-js`.** The second look renders a working
copy with `ImageManipulator.manipulate(uri).resize({ width: 360 }).renderAsync()` →
`saveAsync({ format: SaveFormat.JPEG, compress: 0.92 })`, reads its bytes with `expo-file-system`'s
`new File(uri).arrayBuffer()`, and decodes them to RGBA with `jpeg-js`'s `decode(bytes, { useTArray:
true })`. Width 360 (never upscaled: an image narrower than that is used at its own width) keeps the
JavaScript decode and the scan small — about 360×780 = 280 k pixels for a phone screenshot — and was
proven sufficient by the prototype, which also succeeded at 270. The working copy's JPEG, not the
original, is what `jpeg-js` reads, so whatever the manipulator can open (PNG screenshots, HEIC
photos) arrives as a JPEG.

*New dependencies, named explicitly*: **`expo-image-manipulator` ~57.0.17 — a native module**,
autolinked, no config plugin, no permission, no `app.json` change, but it needs a rebuild
(`scripts/android.sh up`), and D14's lesson applies — `verify` cannot prove it loads. `jpeg-js`
^0.4.4 — pure JavaScript, BSD-3-Clause, runs under Node too, which is what lets the dry-run script
(D5) use the identical decode. If `jpeg-js` ships no type declarations, a minimal ambient
declaration goes in `types/`. *Alternatives*: `expo-image-manipulator`'s `base64` output — rejected,
Hermes has no `Buffer`, and bytes from `File` avoid a base64 round-trip; a new native module that
finds the square in Kotlin — rejected, untestable under `verify` and Android-only.

**D3. The locator is pure: `src/platform/qr-quiet-zone.ts`.**
`findQrSquares(image: { width; height; data: Uint8Array /* RGBA */ }): readonly SquareCandidate[]`
and `cutRect(candidate, workingWidth, originalWidth, originalHeight): Rect` (plus the light margin
size, D4). Steps, each matching what the prototype did:

1. Luminance per pixel (integer Rec. 601 weights, `(299r + 587g + 114b) / 1000`), a 256-bin
   histogram, and Otsu's threshold over it; light = luminance above the threshold.
2. Connected components of light pixels, **8-connected**, with an explicit `Int32Array` stack (no
   recursion — Hermes' stack is small), tracking each component's bounding box and pixel count.
3. A component is a candidate when: its shorter side is at least 21 px (a version-1 QR at one pixel
   per module); side ratio within 0.8–1.25; light fill of its box within 0.35–0.85 (a QR is roughly
   half light — a solid light rectangle or a sparse text line falls outside); its box is at most 90%
   of the image (a light page is not a QR's square).
4. Candidates ordered by box area, largest first; at most three are returned.

`cutRect` maps a candidate's box to the original's pixels (`scale = originalWidth / workingWidth`)
and shrinks it **inward** by `ceil(scale)` on every side, so rounding can only cut into the light
margin, never pull the dark surround back in — the margin is replaced in D4 anyway. The result is
clamped to the image. This file is the only new logic `verify` sees, and it is in `src/platform/`
beside `qr-image.ts` because it serves that adapter only; it imports nothing.

*Alternatives*: a global threshold with no components — rejected by the evidence, modules and
background are the same darkness; flood-filling the background light — tried, it leaks through the
thin margin into the code; morphological dilation before labelling — unnecessary once 8-connectivity
joins the fragments, and it would merge text lines into the square.

**D4. Cut, add a light margin, decode.** `expo-image-manipulator`'s `extent` action turned out to be
web-only: the installed `~57.0.17` package's `.d.ts` marks it `@platform web`, and its Android native
module (`ImageManipulatorModule.kt`) registers only `resize`, `rotate`, `flip` and `crop` — no
transformer adds a border on this platform (confirmed by reading the Kotlin source, task 1.1, after
the original `.extent(...)` plan below was found to throw on Android before any code was written
against it). The margin is built in pure TypeScript instead, with the same primitives D5's dry run
already needed because it runs under plain Node with no native module at all:

For each candidate in order: `ImageManipulator.manipulate(uri).crop(rect).renderAsync()` →
`saveAsync({ format: SaveFormat.JPEG, compress: 0.92 })` cuts the candidate out of the *original*
at full resolution — `crop` is the one geometry op the manipulator does support on Android, so it
still does the expensive part (reading a possibly large source image) natively. `new
File(cropUri).arrayBuffer()` and `jpeg-js`'s `decode(bytes, { useTArray: true })` read the crop
back to RGBA — smaller than the original in the common case (proposal → Why: the real чек QR square
is 420×420 of a 1080×2340 source, a few percent of the area) and bounded worst-case by the same 90%-
of-image cap `findQrSquares` already applies to any candidate, so this JS decode stays bounded even
when a candidate is not small. `padWithMargin(image, margin)` (new pure function beside
`findQrSquares`/`cutRect` in `qr-quiet-zone.ts`) returns a `(width + 2·margin) × (height +
2·margin)` RGBA buffer, opaque white (`255,255,255,255`) outside the centered original, `margin =
floor(side / 8)` as before (≥ 4 modules for any code up to version 6, which covers every чек QR met
so far). `jpeg-js`'s `encode({ width, height, data }, 92)` re-encodes the padded buffer, and `new
File(paddedUri).create()` + `.write(bytes)` writes it into the cache directory before
`scanFromURLAsync(paddedUri, ['qr'])` reads it. The first text found is the outcome. None found in
any candidate → `no-qr`. The prototype decoded with and without the margin; the margin is kept
because the standard asks for it and ML Kit, not zbar, is what runs on the phone.

*Alternative rejected during this change*: keep `.extent()` and just fix the option shape —
rejected outright once the Kotlin source showed no `extent` function is registered at all; it is
not a shape mismatch to patch, the action does not exist on Android.

**`jpeg-js`'s `encode()` needs `Buffer`, which D2 already says Hermes does not have.** Found by the
`diff-reviewer` subagent during this change, reading `jpeg-js`'s own source rather than trusting the
dry run (D5), which runs under real Node and so never exercises this at all: unlike `decode`,
`encode()` has no `useTArray` escape — bundled, `typeof module !== 'undefined'` is always true (Metro
wraps every module), so it unconditionally `return`s `Buffer.from(byteout)`. `qr-image-device.ts`
therefore defines a `Buffer.from` of its own — returning a plain `Uint8Array`, all every caller here
ever needs — the first time it is asked for, only if nothing has defined a real one first. Not the
`buffer` npm package (nothing else in the app touches `Buffer`, so pulling in a full polyfill for one
call is more than this needs) and not a global fix in the app's own entry (`index.ts`) — scoped to
the one file that needs it, the same as every other platform quirk in this directory. Confirmed by
running `jpeg-js.encode()` under Node with `Buffer` deliberately deleted: it throws
`ReferenceError: Buffer is not defined` without the shim, and returns a proper `Uint8Array` with it.

**D5. A dry run on the real file before the emulator.** `scripts/qr-quiet-zone-dry-run.ts <image>`
(run by hand with `npx tsx`, never by `verify`, like `saldo-dry-run.ts`) decodes a JPEG with
`jpeg-js`, box-downscales it to width 360 in plain TypeScript, runs `findQrSquares` and `cutRect`,
and writes each cut-out with the margin to the scratch directory with `jpeg-js`'s `encode`, printing
the rects — so `zbarimg` can confirm the TypeScript locator matches the prototype on
`2026-09-12 10.30.55.jpg` before a native build is spent. The downscale differs from the
manipulator's; that is why the emulator smoke (task 4) remains the proof.

**D6. Every derived file is deleted.** The working copy and every cut-out are deleted in a `finally`
alongside the picker's cached copy the adapter already deletes, each deletion in its own `try` — the
qr-scan requirement's "no part cut from it remains". The manipulator writes into the app's cache
directory; the smoke checks it is empty of them afterwards.

**D7. The sequence of D1, D4 and D6 is pure too.** `decodeImage(uri, steps)` in
`qr-quiet-zone.ts` takes a `QuietZoneSteps` value — `scan(uri)`, `workingCopy(uri, width)` returning
`{ uri, width, height, originalWidth, originalHeight }`, `pixels(uri)`, `cutWithMargin(uri, rect,
margin)` returning a URI, and `remove(uri)` — and returns `decoded | no-qr`, or rethrows the first
scan's error for the adapter to fold into `failed`. `cutWithMargin` stays one step from
`decodeImage`'s point of view — what it does inside (crop, read, `padWithMargin`, encode, write, per
D4) is the adapter's business, invisible to the orchestration and its test double, which only needs
a URI back. The adapter's steps are thin wrappers over `scanFromURLAsync`, `ImageManipulator`,
`File` and `jpeg-js`; the order (first look, second look only on a miss, candidates in order, stop
at the first text, second-look errors → `no-qr`, every file made removed on every path) is proven
in `qr-quiet-zone.test.ts` with an in-test double of the steps. The picker, its cancel and its
cached copy stay in the adapter as today.

**D8. The second look has a deadline.** D14's `expo-image-loader` bug was a promise that never
settled, and this change adds another native module that `verify` cannot load. `decodeImage` races
the whole second look against a timer (8 s, injected via `steps` so tests use fake time) and ends as
`no-qr` when it fires. A step that settles after the deadline is not awaited, but any URI it
eventually returns is still passed to `remove` when it arrives, so a late file is not left behind.
The first look has no deadline — it is exactly D14's call, unchanged.

## Risks / Trade-offs

- [A manipulator action assumed available does not exist on this platform, as `.extent()` did not
  on Android — caught during task 1.1 by reading the Kotlin source before any code depended on it]
  → D4 no longer calls `.extent()` at all; the margin is built in pure TypeScript with `jpeg-js`,
  proven by `qr-quiet-zone.test.ts` rather than trusted to the native module. The remaining native
  calls (`crop`, `resize`, `renderAsync`, `saveAsync`) are still confirmed against the Kotlin source
  in task 1.1, not assumed from the `.d.ts` alone.
- [A pure-JS dependency assumes an environment Hermes does not provide, as `jpeg-js`'s `encode()`
  assumed a global `Buffer` — caught by the `diff-reviewer` subagent reading its source, not by the
  dry run (D5), which runs under real Node and so never exercises the gap at all] → the shim in
  `qr-image-device.ts` (design D4) closes it; because D1 folds every second-look failure into
  `no-qr` rather than a crash, this class of bug is silent on the device — it looks exactly like "no
  QR found" — which is the whole reason the emulator smoke (task 4) has to actually see the чек
  screenshot decode, not merely see the app not crash.
- [ML Kit behaves differently from zbar on the cut-out] → the emulator smoke with the real file is
  mandatory before archive (task 4.2); if the cut-out fails on the device but decodes in `zbarimg`,
  stop and revisit D4 (margin size, PNG instead of JPEG) rather than tuning blind.
- [The native module does not load, as `expo-image-loader` once silently did not] → D1 makes any
  manipulator error a `no-qr`, D8 makes a promise that never settles a `no-qr` too, and the smoke
  picks the real file, so the fix is proven on the device, not only by the deadline.
- [An EXIF-rotated camera photo swaps its axes] → `originalWidth`/`originalHeight` come from the
  manipulator's own full-size render of the image, never from picker or asset metadata, so the rect
  is mapped onto the same orientation the crop is applied to; a `cutRect` test covers a portrait
  working copy of a landscape-reported source.
- [A light photo with many square-ish light shapes yields three wrong candidates] → three extra
  decodes of small images, then `no-qr` exactly as today; nothing wrong is ever attached, because a
  decoded text still goes through the same чек parsing and сума comparison.
- [Slower "no QR" answer] → only on a miss; bounded by one 360-px decode and at most three small
  crops. The smoke notes the time on the emulator; there is no spinner change.
- [QR versions above 6 get a margin under 4 modules] → acceptable: the cut-out is already free of the
  dark surround, which is what the evidence says matters.

## Migration Plan

None — no data, schema or setting changes. Rollback is reverting the adapter to its single call and
removing the two dependencies.
