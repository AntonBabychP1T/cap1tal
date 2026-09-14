## 1. Reading a padded чек QR (`fiscal-receipts` — «The реквізити чека are read from the QR code deterministically»)

- [x] 1.1 Bug fix = failing test first. In `src/fiscal/qr.test.ts` add tests, run them and confirm
      they fail on the current `readReceiptQr`: «A чек QR ending in a NUL is read as without it»
      (the owner's exact text
      `https://cabinet.tax.gov.ua/cashregs/check?date=20260912&time=140004&id=19930061&sm=4370.91&fn=3000876257`
      + `'\u0000'` → `19930061`, `3000876257`, `2026-09-12`, time `14:00`, seconds `04`, 437091 UAH,
      `sumText` `4370.91`, and `toEqual` the reading of the text without the NUL); «Whitespace and
      control characters at either end are ignored» (`' \t' + link + '\r\n\u0000\u0000'`); «A control
      character inside the text is not ignored» (`fn=30008\u000076257` → `incomplete`,
      `missing: ['registrarNumber']`). Write every control character as a `\u` escape in the test
      source, never as a raw byte. Verified by `npx vitest run src/fiscal/qr.test.ts` showing exactly
      the first two new tests red (the third already passes and must stay green).
- [x] 1.2 Implement design D1 in `src/fiscal/qr.ts`: replace `trim()` with
      `.replace(/^[\s\u0000-\u001F\u007F]+|[\s\u0000-\u001F\u007F]+$/g, '')` — escapes in source, no
      raw control bytes — and update the doc comment to say only the ends are dropped. Verified by
      `npx vitest run src/fiscal/qr.test.ts` all green, including every pre-existing scenario, and by
      `git diff --numstat src/fiscal/qr.ts` showing line counts (not `-  -`, i.e. not binary).

## 2. The scan keeps going (`fiscal-receipts-screen` scan flow, `qr-scan` «A scan yields one decoded text or one typed reason»)

- [x] 2.1 Failing tests first in `src/ui/receipt-screen.test.ts` for design D2: «A non-чек QR in the
      camera keeps the camera open» (`decoded({kind:'scanning'}, 'WIFI:S:x;;')` →
      `{kind:'scanning', hint:{kind:'not-a-receipt'}}`); «An incomplete чек QR in the camera keeps
      the camera open» (hint `incomplete` naming `time` and `total`); «Aiming on until the чек QR reads
      starts the lookup» (a hinted scanning state + a complete чек text → `looking-up`); «A QR the flow
      does not accept keeps the camera open» (the same hint again returns the *same object*, `toBe`;
      a different hint returns a new one); «A non-чек QR in a chosen photo asks for another»
      (`decodedFromImage` with a Wi-Fi text → `refused` `not-a-receipt`, from plain and from hinted
      scanning); `scanAgain` yields a scanning state with no hint; «Two codes in quick succession
      yield one» still holds once `looking-up`. Existing tests that expected the camera `decoded` to
      refuse are changed to the spec's new expectation, each named in the commit. Verified by the new
      tests red against the current code.
- [x] 2.2 Implement D2 in `src/ui/receipt-screen.ts`: `ScanHint`, the optional `hint` on `scanning`,
      the shared `readingOutcome`, `decoded` with identity-preserving equal hints, and
      `decodedFromImage` turning a hint into `refused`; doc comments say «the first accepted decode
      wins». Verified by `npx vitest run src/ui/receipt-screen.test.ts` green.
- [x] 2.3 Failing tests then implementation for D4 in `receipt-screen.test.ts` / `receipt-screen.ts`:
      `readingDetail` gives `not-a-receipt` and `incomplete missing=time,total`;
      `readingJournalDetail` folded over camera decodes (same Wi-Fi text ×5, then a чек link lacking
      `sm`) exactly as `apply` does yields exactly two details in order («A repeated hint is recorded
      once»); one photo outcome with a Wi-Fi text folded through `decodedFromImage` yields one detail
      («A non-чек QR in a chosen photo asks for another»); one photo outcome with a чек link lacking
      `time` and `sm` yields one detail naming `time,total` («An incomplete чек QR in a chosen photo
      asks for another»); no detail contains the sample QR's `id`,
      `fn`, `date`, `time` or `sm` values. Also confirm (and assert in
      `src/reporting/*.test.ts` if not already covered) that `entryLine` renders a `step` with no run
      as `крок · receipt-scan/refused-reading · <detail>`. Verified by the vitest files green.

## 3. Wiring the screen (`fiscal-receipts-screen`)

- [x] 3.1 In `src/app/transaction/scan.tsx` implement D3: `stateRef` as the source of truth, the one
      `apply` helper that sets the ref synchronously, calls `setState`, and journals
      `readingJournalDetail`; `onScanned` latches and looks up only on `looking-up`; every other
      transition (`begin`, `look`, `pickPhoto`, `attach`, `again`, `leave`, `discard`, `onScanAgain`)
      goes through `apply`. In `receipt-screen.test.ts` the source check «the scanner decodes QR only
      and latches the first decode» is **replaced** by «…latches the first accepted decode»: the
      assertion `decoded(current, data)` becomes `decoded(s, data)`; add that
      `latched.current = true` occurs exactly once and after `looking-up`, that `readingJournalDetail`
      is referenced, and that `setState(` occurs only inside `apply`. Verified by `npm run typecheck`,
      `npm run lint` and `npx vitest run src/ui/receipt-screen.test.ts` green.
- [x] 3.2 Render D5 in `scan.tsx`: when `state.kind === 'scanning' && state.hint`, a `Card` with
      `refusalView(state.hint).text` between the viewfinder and «Обрати фото»; the viewfinder keeps its
      fixed height. Add `refusalView(state.hint)` to the source check. Verified by `npm run typecheck`
      and the vitest file green, and by the smoke in 6.1.

## 4. Proof on real input

- [x] 4.1 Dry run the owner's photo through the pure reader: decode
      `~/Downloads/photo_2026-09-14 20.18.46.jpeg` with `zbarimg --raw` and feed the exact bytes
      (NUL included) to `readReceiptQr` in a throwaway `npx tsx` one-liner (not committed); record in
      this task the reading it returns (`lookup` with `fn` 3000876257). Verified by the recorded
      output.
      Recorded: payload tail `... 33 30 30 30 38 37 36 32 35 37 00 0a`; reader returned
      `lookup` with `fiscalNumber=19930061`, `registrarNumber=3000876257`, `date=2026-09-12`,
      `time=14:00`, `seconds=04`, `total=437091 UAH`, `sumText=4370.91`.
## 5. Close

- [x] 5.1 Run `npm run verify` and paste the final lines
      Recorded: `Test Files 166 passed (166)`; `Tests 3342 passed (3342)`;
      `✔ verify passed (e83ede9ad0bd5cbe0571f29e1e54597b494538da)`.
- [x] 5.2 Run the diff-reviewer subagent; fix CRITICAL findings until PASS
      Recorded: `PASS (0 critical, 0 warning)` after both camera/photo lookup interleavings were
      made single-lookup and independently verified.

## 6. Post-commit smoke before archive

- [x] 6.1 After 5.1–5.2 are green, commit the verified change, then run the `smoke-runner` subagent
      (CLAUDE.md workflow step 6): push the owner's photo into the emulator's Downloads, open a
      транзакція → «Сканувати QR чека» → «Обрати фото» → pick it → the screen shows «Шукаємо чек…» and
      then a preview or a tax-service reason — never «QR чека не містить усього потрібного». Confirm
      the camera view mounts with no hint on open. Record that the live-camera hint (scenarios
      «…keeps the camera open», «Aiming on…») cannot be exercised by the emulator's virtual camera and
      is to be confirmed by the owner on SM-S921B with this чек. If smoke reveals a defect, fix it,
      repeat 5.1–5.2, commit the fix, and rerun this smoke until green. Verified by the smoke-runner
      verdict.
      Recorded after commit `0d33c84`: `SMOKE receipt-qr-keep-scanning | PASS`, Pixel_10_Pro /
      emulator-5554, reused build, no reset, no defects. The owner's photo reached «Шукаємо чек…»
      and then a valid mismatch preview (4,370.91 UAH чек versus the existing 437.40 UAH
      транзакція), never the incomplete-registrar refusal; the camera mounted with no hint. Live
      camera decode/hint sequences are not reachable on the emulator and require owner confirmation
      on SM-S921B. Evidence: `.cache/android/smoke/receipt-qr-keep-scanning/07-photo-result.png`,
      `08-photo-final.png`, `20-camera-mounted.png`, `23-mismatch-actions.png`.

## 7. Final exact-tree gate

- [x] 7.1 With the smoke-green commit checked out and no further code edits, run `npm run verify` and
      the `diff-reviewer` subagent once more; fix any CRITICAL finding through the full
      verify → review → commit → smoke loop above, then repeat this final gate until PASS. This is
      the last task before archive.
      Recorded: `Test Files 166 passed (166)`; `Tests 3342 passed (3342)`;
      `✔ verify passed (59374d4cec5d9d088d8148287f39702d81ec9384)`; final diff-reviewer
      `PASS — 0 critical, 0 warning`.
