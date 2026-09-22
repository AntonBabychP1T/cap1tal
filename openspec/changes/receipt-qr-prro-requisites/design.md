## Context

`readReceiptQr` (`src/fiscal/qr.ts`) is deliberately strict. The strictness was calibrated on
hardware реєстратори, whose чек numbers are digits and whose time is `HHmmss`. A ПРРО (elKasa)
prints an alphanumeric чек number and a colon-separated time.

## Decisions

### D1 — фіскальний номер чека: `^[0-9A-Za-z]+$`, as written

The one real alphanumeric number is `WwNagtghkq8`, and the tax service matches it case-sensitively as
given. The widening is to ASCII letters and digits only — the evidence, and no further. Punctuation
stays malformed so the reader still refuses what it has never seen. The фіскальний номер реєстратора
keeps `^\d+$`: the ПРРО's ФН here is digits too.

### D2 — time: `HHmm`, `HHmmss`, `HH:mm`, `HH:mm:ss`

One regex with an optional colon between each pair, but the colon use must be consistent: either
none or all. `17:2147` is malformed. The range checks are unchanged.

### D3 — a РРО data packet names no фіскальний номер чека

`rro-packet.ts` stops setting `documentFiscalNumber` from `<E NO>`. `NO` is the till's document
counter. The only hardware sample (DATECS, `NO="696582"`) happens to print it as the чек number, and
the elKasa ПРРО's `NO="73"` does not. The packet has no attribute that tells the two apart except
guesses (`NDv`, an empty `ZN`) resting on one sample each. So the packet's identity comes from the
lookup, exactly as for a ПРРО `<CHECK>` without `ORDERTAXNUM` (fiscal-receipts D2a). What is lost is
small: the tax service found the document by that very `id`. The реєстратор, the date and the total
are still compared. The one test of a mismatched number moves to the `<CHECK>` fixture, whose
`ORDERTAXNUM` is a real fiscal number.

Verified live on 2026-09-16: the owner's QR → `chkAllWeb` → parse → `attachable`, 2 позиції.

## Risks

- A ПРРО number with other characters (a dot, a dash) would still be refused. It would show up the
  same way this one did — `refused-reading · incomplete missing=fiscalNumber` in the журнал — and be
  widened on evidence.
