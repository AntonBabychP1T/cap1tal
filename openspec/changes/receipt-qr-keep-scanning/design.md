## Context

See proposal.md — Why. The two defects sit in two different layers:

- **Reading.** `readReceiptQr` (`src/fiscal/qr.ts`) calls `text.trim()` and then matches the URL
  shape. `String.prototype.trim` strips whitespace and line terminators only; `U+0000` survives and
  ends up inside whichever query value comes last. For the owner's чек that is `fn`, which fails
  `DIGITS` and is reported as `incomplete: [registrarNumber]` — exactly the text on the bug report's
  screenshot. `zbarimg` on the owner's two photos shows the payload is 105 bytes ending `…6257 00`,
  so the NUL is in the QR itself, not added by a decoder; the phone's ML Kit evidently hands it
  through too, since the camera produced the same refusal.
- **Flow.** `decoded(state, text)` (`src/ui/receipt-screen.ts`) turns every non-`lookup` reading into
  `refused`, which unmounts `CameraView`. `scan.tsx` sets `latched.current = true` on the first
  `onBarcodeScanned` call, whatever it carries. `decodedFromImage` reuses `decoded({ kind:
  'scanning' }, text)` for a picked photo.

Constraints: `src/fiscal/` and `src/ui/` stay pure and under `verify`; `scan.tsx` stays wiring; the
QR text carries the реквізити of a purchase and must never reach the журнал (fiscal-receipts design
D3, and `src/reporting/privacy.test.ts`).

## Goals / Non-Goals

**Goals:** a чек QR padded with control characters reads; the camera keeps scanning through
unaccepted decodes and shows why; a refused reading is visible in a bug report.

**Non-Goals:** changing what counts as a чек QR, the lookup, or the photo decoder; adding camera
controls; a generic «Наведіть камеру…» prompt beyond the hint the spec requires.

## Decisions

### D1. Trim control characters at both ends, inside `readReceiptQr`

Replace `text.trim()` with a strip of `[\s\u0000-\u001F\u007F]` at the start and the end of the
text (one anchored regex each, or `/^[\s\x00-\x1F\x7F]+|[\s\x00-\x1F\x7F]+$/g`). `\s` already
covers the Unicode spaces `trim` did, so nothing that read before stops reading.

- *Alternative: strip control characters everywhere.* Rejected — a NUL between digits of `fn` is
  not padding, and silently joining the digits invents a реквізит the реєстратор did not print.
- *Alternative: sanitise in the device adapters / `scan.tsx`.* Rejected — the camera and the photo
  path would each need it, neither is under `verify`, and the reader's own contract («total and
  deterministic over any text») is where the rule belongs.
- *Alternative: strip only `\0`.* Rejected — other C0 padding (`\r`, `\x1D` group separator is used
  by some GS1 encoders) is the same class of defect; the whole C0 range plus DEL is one rule.

The regression fixture is the owner's exact text with its trailing NUL (spec scenario «A чек QR
ending in a NUL is read as without it»).

### D2. `scanning` carries an optional hint; `decoded` keeps scanning on a refused reading

`FlowState`'s scanning case becomes `{ kind: 'scanning'; hint?: ScanHint }` with
`ScanHint = Extract<Refusal, { kind: 'not-a-receipt' } | { kind: 'incomplete' }>`. The reading is
split into one pure step shared by both entry points:

- `readingOutcome(text)` → `{ kind: 'looking-up', lookup } | ScanHint` (from `readReceiptQr`).
- `decoded(state, text)` (camera): not scanning → state untouched (the existing latch); `looking-up`
  → that; a hint → `{ kind: 'scanning', hint }`, **returning the same `state` object when the hint is
  equal** (same kind and, for `incomplete`, the same `missing` list in order). Referential equality
  is what makes the 30-decodes-a-second feed cheap for React and what D4 deduplicates on.
- `decodedFromImage(state, outcome)` (photo): unchanged eligibility (`scanning` with or without a
  hint counts as scanning); a `decoded` outcome goes through `readingOutcome` and a hint becomes
  `{ kind: 'refused', refusal: hint }` — a photo is one decode of one image, and «keep scanning» has
  no meaning for it (spec: «A non-чек QR in a chosen photo asks for another»).
- `scanAgain` returns `{ kind: 'scanning' }` with no hint, so a fresh scan starts clean.

The hint's sentence is `refusalView(hint).text` — the same words the refusal used, so no new copy
exists and the spec's «in the same words» holds by construction.

- *Alternative: a separate `hint` React state in `scan.tsx`.* Rejected — the decision would move
  out of `verify`, which is the reason `receipt-screen.ts` exists.
- *Alternative: debounce — keep the refusal but only after N seconds of failed decodes.* Rejected —
  it still ends the camera, which is the owner's complaint, and adds a timer to a pure module.

### D3. The latch closes on an accepted decode only

`scan.tsx`'s `onScanned` currently latches before knowing the outcome, and computes inside a
`setState` updater — too late to decide synchronously. Deduplicating on object identity also
needs the *latest* state between `setState` and the next commit, while the camera keeps firing.
So the screen keeps one `stateRef` that is the source of truth for transitions, and **every**
transition goes through one helper:

```ts
const apply = (step: (current: FlowState) => FlowState): FlowState => {
  const before = stateRef.current;
  const next = step(before);
  if (next !== before) {
    stateRef.current = next;          // synchronously, before React commits
    setState(next);
    const detail = readingJournalDetail(before, next);   // D4
    if (detail) journal.record('step', 'receipt-scan/refused-reading', detail);
  }
  return next;
};
```

`onScanned` becomes `if (latched.current) return; const next = apply((s) => decoded(s, data)); if
(next.kind === 'looking-up') { latched.current = true; void look(next); }`. `pickPhoto`, `scanAgain`,
`begin`, `look`, `attach`, `leave`, `discard` and `again` all switch from `setState(...)` /
`setState((current) => …)` to `apply(...)`, so the ref never goes stale and no `useEffect` mirrors
it (an effect would write an older committed state back over a newer ref). The latch still guards
the burst of callbacks after an accepted decode (fiscal-receipts design D11). The existing source
check in `receipt-screen.test.ts` that asserts `decoded(current, data)` is **replaced** (not
weakened) by assertions that `scan.tsx` contains `decoded(s, data)` inside `apply`, that
`latched.current = true` appears only in the `looking-up` branch, and that no bare `setState(` call
remains outside `apply`.

### D4. Journal a refused reading from a pure transition detail

`receipt-screen.ts` exports:

- `readingDetail(refusal: ScanHint): string` — `not-a-receipt` or
  `incomplete missing=registrarNumber,total` (the `MissingRequisite` names, which are field names,
  not values).
- `readingJournalDetail(before: FlowState, after: FlowState): string | undefined` — the detail when
  `after` is a scanning state whose `hint` is set and `after !== before`, or when `after` is a
  `refused` state whose refusal is `not-a-receipt` / `incomplete` and `before` was not that same
  object; otherwise `undefined`.

Because `decoded` returns the same object for an equal hint, `apply` never calls
`readingJournalDetail` for a repeat. The count is proven purely: a test folds a sequence of camera
decodes (the same Wi-Fi text ×5, then a чек link lacking `sm`) through `decoded` +
`readingJournalDetail` exactly as `apply` does and asserts exactly two details, in order («A
repeated hint is recorded once»); another folds one photo outcome through `decodedFromImage` and
asserts one detail. A third asserts neither detail contains any of the sample QR's `id`, `fn`,
`date`, `time` or `sm` values. The entry is a lone `step` with no `run` — `journal.record`'s tail
is optional, and the task confirms `entryLine` renders such an entry as `крок · receipt-scan/refused-reading · <detail>`
before relying on it.

### D5. Rendering

Under the viewfinder and above «Обрати фото», when `state.hint` is set: a `Card` with
`ThemedText` carrying `refusalView(state.hint).text`. No button — the camera is the action. The
viewfinder keeps its fixed height (the 2026-09-02 black-screen lesson in `scan.tsx`'s styles).

## Risks / Trade-offs

- [An `incomplete` чек QR that will never read keeps the camera open indefinitely] → the hint names
  what is missing, and leaving and «Обрати фото» stay on screen; this is the owner's stated
  preference over an abrupt refusal.
- [`apply` is wiring outside `verify`; a missed `setState` would let the ref go stale] → the
  replaced source check asserts no bare `setState(` remains, and the transition logic itself is the
  pure fold tested in D4.
- [ML Kit may alternate between two readings of a moving frame, flickering the hint and adding a
  журнал entry per flip] → acceptable: entries are small and bounded by the журнал's own cap; if a
  real report shows noise, a minimum dwell can be added without changing the spec.
- [Trimming C0 characters could hide a genuinely corrupted QR] → only the ends are trimmed; the
  реквізити are still validated strictly, and the tax service is the final check on a lookup.
- [The camera path cannot be proven on the emulator — its virtual camera shows no QR] → the photo
  path proves D1 end-to-end on the emulator with the owner's own photo; D2/D3 are proven by the pure
  tests, and the camera hint is confirmed on the owner's phone (recorded in the smoke verdict).

## Migration Plan

None — no stored data, schema or setting changes. Rollback is reverting the commit.
