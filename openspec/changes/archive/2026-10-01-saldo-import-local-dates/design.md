## Context

`parseSaldoExport` (`src/saldo/parse.ts`) normalises Transaction Date to
`YYYY-MM-DDTHH:MM:SS.mmm` and takes the first ten characters as the leg's date. The owner's real
export (4833 rows) shows the text is UTC: 1764 rows sit at 21:00/22:00 — the Kyiv midnight of a
date-only Saldo entry — and those are exactly the rows the bug report names. `interpret.ts` uses
the normalised `datetime` only as an instant (ordering, in-transit pairing), which is correct for
UTC text and stays as it is.

monobank already solves the same problem: `src/monobank/api.ts` takes `dateOf` from its caller,
and `src/app/_layout.tsx` binds it to `dateOfEpochMs` (`src/ui/dates.ts`), the device-local
calendar date of an instant.

## Goals / Non-Goals

**Goals:** a Saldo leg is dated exactly as a monobank item at the same instant would be; tests
stay independent of the machine's time zone.

**Non-Goals:** repairing already-committed imports; honouring Accrual Month.

## Decisions

- **The parser takes `dateOf: (epochMs: number) => IsoDate` as a required argument.** The
  instant is `Date.UTC(...)` of the parsed parts — arithmetic, no clock. The calendar check
  (`isoDate(day)`) still runs first, so `2026-02-30` is still refused instead of rolling over.
  Alternative: hard-code Europe/Kyiv inside the parser. Rejected: monobank dates by the device
  zone, and two importers disagreeing about which day money moved is the bug we are fixing.
  Alternative: call `dateOfEpochMs` directly from `src/saldo/`. Rejected: tests would then depend
  on the host's `TZ`, and `src/saldo/` stays free of device concerns like `src/monobank/`.
- **`startWithText(state, text, dateOf)` threads it through**; the screen passes
  `dateOfEpochMs`. Tests pass a fixed Europe/Kyiv converter (`Intl.DateTimeFormat` with
  `timeZone: 'Europe/Kyiv'`, which Node's full ICU carries), so summer and winter offsets are
  both exercised.
- **`datetime` stays the export's UTC text.** It is an ordering key, not a displayed value.
- **Accrual divergence compares `accrualMonth` with `datetime`'s month** (the export's own date),
  per the modified verification requirement.

## Risks / Trade-offs

- [The owner's existing imported транзакції stay one day early] → out of scope for this change:
  nothing stored identifies a Saldo row. Options for the owner: restore the pre-import backup
  and import again with the fixed build, or a separate repair change that re-reads the export and
  shifts matching транзакції. Raised with the owner alongside this fix.
- [A phone set to a zone other than the one the owner used in Saldo dates differently] →
  accepted; identical to monobank's behaviour, and the owner lives in one zone.
