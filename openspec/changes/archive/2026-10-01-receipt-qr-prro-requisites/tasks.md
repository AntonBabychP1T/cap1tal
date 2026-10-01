## 1. Reading a ПРРО чек QR (`fiscal-receipts` — «The реквізити чека are read from the QR code deterministically»)

- [x] 1.1 Bug fix = failing test first. In `src/fiscal/qr.test.ts` add «A ПРРО QR with a lettered
      чек number and a colon time is read» with the owner's exact text (→ `WwNagtghkq8`,
      `4001481902`, `2026-09-12`, `17:21`, seconds `47`, 21930 UAH, `sumText` `219.30`) and
      «A time with colons to the minute is read» (`time=11:30` → `11:30`, no seconds). Replace the
      malformed-number case `id=abc` (now valid) with «A malformed фіскальний номер чека or time is
      incomplete» (`45/6`, `17:2147`, `25:00`, …). Verified by `npx vitest run src/fiscal/qr.test.ts` showing the two new
      tests red before the fix.
- [x] 1.2 Implement D1 and D2 in `src/fiscal/qr.ts`. Verified by `npx vitest run src/fiscal/qr.test.ts`
      all green, then `npm run verify`.

## 2. Attaching a ПРРО чек served as a РРО packet (`fiscal-receipts` — «A fiscal document is parsed deterministically…»)

- [x] 2.1 Failing test first. Add the scrubbed fixture `src/fiscal/fixtures/prro-elkasa-rro-packet.xml`.
      In `parse.test.ts` add «A ПРРО чек served as a РРО data packet attaches under a lettered number». Move
      the mismatched-number case to `check01-official-tovar.xml`. In `rro-packet.test.ts` assert that
      no `documentFiscalNumber` is read. Verified by `npx vitest run src/fiscal` showing those two red.
- [x] 2.2 Implement D3 in `src/fiscal/rro-packet.ts`. Verified by `npx vitest run src/fiscal` green.

## 3. Close

- [x] 3.1 `npm run verify` green, then run the diff-reviewer subagent; fix CRITICAL findings until PASS.
