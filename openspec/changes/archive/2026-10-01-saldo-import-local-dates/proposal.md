## Why

The owner's bug report of 2026-09-23 (raised from a рахунок screen): every транзакція imported
from Saldo sits one day early — the rent paid on the 26th shows on the 25th. Saldo writes
Transaction Date as a UTC instant without a zone marker: a транзакція the owner entered in
Saldo for 26 August is `2025-08-25T21:00` in the export (Kyiv midnight, UTC+3), a winter one
`…T22:00` (UTC+2). The import takes the date straight off the text, so everything recorded
between Kyiv midnight and 02:00/03:00 — which is every date-only entry, about a third of the
owner's export — lands on the previous day. Wrong dates put транзакції in the wrong day and, at
month edges, in the wrong month, which breaks "where did the money go" for the month view.

## What Changes

- A leg's date becomes the calendar date, in the phone's time zone, of the instant its
  Transaction Date names, read as UTC — the same rule monobank statement items are dated by.
- The accrual-month divergence note compares the Accrual Month with the month of the Transaction
  Date as the export writes it, because Saldo fills Accrual Month from that same UTC date; a
  late-evening entry on a month's last day must not be reported as a divergence.
- Ordering and in-transit pairing keep working on the export's instants; they are unchanged.

Non-goals:
- Repairing транзакції already committed by an earlier import. The database keeps neither Saldo
  ids nor the export's times, so nothing on the device can tell which imported rows moved. How
  the owner's existing data gets corrected is a separate decision (see design.md).
- Any change to how monobank or notification транзакції are dated.
- Honouring Accrual Month (перенесення транзакцій між місяцями stays outside v1, vision §14).

Maps to vision problem 1 (where the money went): a транзакція on the wrong day or month
misplaces the spend.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `saldo-import`: "The export parses into double-entry transactions" — a leg's date is the
  phone-local calendar date of the UTC instant; "The verification report proves the plan against
  Saldo's balances" — the accrual-month divergence is judged against the export's own date.

## Impact

- `src/saldo/parse.ts` (the date conversion; the parser takes the date converter as an input,
  as `src/monobank/api.ts` does), `src/saldo/interpret.ts` (the divergence comparison).
- `src/ui/saldo-import.ts` and `src/app/manage/saldo-import.tsx` pass the device's converter.
- Tests: `src/saldo/parse.test.ts`, `src/saldo/interpret.test.ts`, fixtures and the callers'
  tests updated for the new parameter.
- No schema change, no migration, no native module, no permission.
