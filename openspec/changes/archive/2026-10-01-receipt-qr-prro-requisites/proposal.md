## Why

A real чек from a ПРРО (bug report 2026-09-16 10:47, SM-S921B, commit d9e7c89; «ФОРА», elKasa by
TEMABIT, ФН ПРРО 4001481902, чек WwNagtghkq8, 219.30 грн) cannot be attached. The QR fills the
screen, the camera decodes it, and the журнал records
`receipt-scan/refused-reading · incomplete missing=fiscalNumber,time` on every try.

The QR was decoded with `zbarimg` from the owner's screenshots:

```
https://cabinet.tax.gov.ua/cashregs/check?mac=e3300a…5ddf&date=20260912&time=17:21:47&fn=4001481902&id=WwNagtghkq8&sm=219.30
```

Two реквізити are spelled differently from what the reader accepts:

- `id=WwNagtghkq8` — a ПРРО's фіскальний номер чека is not always digits; the reader requires digits.
- `time=17:21:47` — the time carries colons; the reader accepts only `HHmm` / `HHmmss`.

The tax service itself serves this чек: `chkAllWeb?id=WwNagtghkq8&fn=4001481902&sm=219.30&date=2026-09-12 17:21:47&type=3`
answered 200 with the document on 2026-09-16.

With the reading fixed, the next step refuses the same чек as «not the чек looked up». elKasa serves it
as a classic РРО data packet, and the parser takes `<E NO>` for the фіскальний номер чека. Here it is
`NO="73"`, the till's document counter. `WwNagtghkq8` appears nowhere in the packet. The spec only
demands agreement on the реєстратор, the date and the total. Comparing `NO` came from the parser alone.

## What Changes

- The фіскальний номер чека is read as one or more ASCII letters and digits, kept exactly as
  written (case included). The фіскальний номер реєстратора stays digits only.
- The time of day is read as `HHmm`, `HHmmss`, `HH:mm` or `HH:mm:ss`. Nothing else changes about
  time: it is still to the minute, with seconds only when given, and still range-checked.
- A classic РРО data packet no longer reports `<E NO>` as its фіскальний номер чека. A чек in that
  dialect takes its identity from the реквізити, as a ПРРО document without `ORDERTAXNUM` already
  does. The реєстратор, date and total are still compared. A ПРРО `<CHECK>` document's
  `ORDERTAXNUM` is still compared.
- A фіскальний номер чека with any other character (e.g. `/`, `-`, a space) is still malformed and
  reported as missing.

## Capabilities

### Modified Capabilities

- `fiscal-receipts`: «The реквізити чека are read from the QR code deterministically» — accepts
  the ПРРО spellings of the фіскальний номер чека and the time; «A fiscal document is parsed
  deterministically into a чек and its позиції» — a РРО data packet names no фіскальний номер чека.

## Impact

`src/fiscal/qr.ts`, `src/fiscal/rro-packet.ts`, their tests, and a new scrubbed fixture
`src/fiscal/fixtures/prro-elkasa-rro-packet.xml` (RRN, auth code, terminal and MAC replaced). The lookup (`chk-all-web.ts`) already builds `HH:mm:ss` from the
reading and sends `id` URL-encoded; persistence and backup already store the number as text.

Depends on the unarchived `fiscal-receipts` and `receipt-qr-keep-scanning`: the QR requirement here is
keep-scanning's text plus this change. Archive this change after both.
