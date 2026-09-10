## Why

`cap1tal-report-2026-09-10-2245` (commit `bf0b17e`) caught `platinum ··6628`'s рахунок
(`IMsrAGgCC_FSNMJ1YvwUDg`) taking its sync turn, its `GET /personal/statement/...` answering
`status=200` in 549 ms, and the outcome still coming to `unavailable`. Per `bug-report`'s own
purpose — "so a bug met on the phone can be reproduced and fixed from one file in a chat" — the
журнал is exactly where that answer should live, and today it does not: `unavailable` after a
successful HTTP answer collapses several distinct causes in `src/monobank/api.ts` into one word —
an unparseable body, a payload that is not the shape the endpoint promises, or (for a statement
specifically) a row whose `currencyCode` does not match the рахунок's stored currency, which is
the one cause worth flagging on its own, since it would mean this phone's idea of that рахунок's
currency has drifted from what the bank now reports. The owner cannot tell any of these apart from
the репорт, and the рахунок's next turn is a chance away — often hours, per
`monobank-sync-cadence` — so every bit of signal the one captured failure carries matters.

This does not itself answer «where did the money go» or «how much is left» — it exists to keep
the sync pipeline that answers both of those honest and debuggable when it fails, the same
instrumental role `journal-diagnostics` (archived 2026-09-09) already serves for requests,
operations and the device. This change is that same capability's next-narrowest cut: not a new
kind of entry, just a name for *why* one existing outcome happened.

## What Changes

- `src/monobank/api.ts`: `Outcome<T>`'s `unavailable` variant carries an optional machine-readable
  `reason`, distinguishing (at least) a rejected fetch, an unparseable response body, a payload
  that is not the shape the endpoint promises, an unreadable row, and — for a statement request
  only — a row's currency not matching the рахунок's. Pure, unit-tested; no journal access from
  this module, matching its existing "failures are values" design.
- `src/monobank/coordinator.ts`: the reason, when one is known, reaches `AccountResult` as an
  optional field alongside `outcome`. The token remains nowhere near it.
- `src/ui/monobank-sync.ts`: when a рахунок's turn ends `unavailable` with a known reason, the
  журнал gets one more entry for that рахунок's turn naming the reason — the device's own
  enumerated word, never a sentence the app composed, matching every other entry the журнал
  already writes.
- No new database column, no migration: the reason rides the existing nullable `detail` text
  column on a second entry, the same way a begun step and its ending are already two entries under
  one `run` mark.
- Nothing about *fixing* whatever made `platinum ··6628`'s payload unreadable — this is
  diagnostics only, so the next occurrence names its cause instead of repeating the mystery.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `bug-report`: the requirement "The журнал records what the app itself did, not only what
  refused" gains a scenario — a рахунок that ends `unavailable` names why, when the cause is
  known.

## Impact

- Code: `src/monobank/api.ts`, `src/monobank/coordinator.ts`, `src/ui/monobank-sync.ts`, and their
  test files. Possibly `src/monobank/sync.ts` if a shared parse-failure vocabulary belongs there
  instead of in `api.ts` — decided in design.md.
- No schema change, no migration, no change to `AccountOutcome`'s enum, `SyncRun`'s shape, or any
  money/domain logic. `unavailable` stays `unavailable` to every existing consumer (the screen,
  `worstOutcome`, `needsOwner`, alerts) — only a new optional, diagnostics-only detail rides beside
  it.
- Does not reopen `monobank-sync-cadence`, whose own §9.2 this same report already closed.
