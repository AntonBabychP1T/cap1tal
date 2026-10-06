## Context

See proposal.md — Why. What matters here is where the code stands.

`src/app/(tabs)/accounts.tsx` builds a `bankBalances: Map<string, Money>` by looping
`monobankRepo.listLinks()` and reading `monobankRepo.getAccount(link.monobankAccountId)`; that
map, plus `computed` balances, feeds `src/ui/account-groups.ts`'s pure `accountRows()`, which
builds the `AccountRow`s the screen only renders. `src/app/account/[id].tsx` does the same join for
one рахунок and hands a bare `Money` to `src/ui/account-movements.ts`'s `accountMovements()`.

Both fields this change needs already exist on those two calls, unused today:
`monobankRepo.getAccount()` returns `StoredMonobankAccount.obtainedAt: Date`
(`src/db/monobank-repo.ts`), and `monobankRepo.listLinks()` returns
`lastSyncedAtMs: number | null` per link, backed by `monobank_links.last_synced_at`
(`src/db/schema.ts:292`) and already read the same way by `src/ui/monobank-screen.ts` to build
`NEVER_SYNCED_ACCOUNT` and `syncCoverage` for the monobank connect screen. No migration, no new
query: only the two screens' own joins drop what is already fetched.

`freshnessLabel(ms, now)` (`src/ui/dates.ts`) is the existing answer to "is what I'm looking at
current" — Головний already calls it on the oldest completed sync moment across every linked
рахунок (`src/ui/home-screen.ts:126`, «оновлено 3 хв тому»). This change asks the same question
per рахунок instead of once for the whole device.

Everything below stays provable under `npm run verify`: `account-groups.ts` and
`account-movements.ts` stay plain TypeScript with no React import, taking `now` as a parameter
exactly as `syncCoverage`/`lastSyncLine` already do, so every branch is a table test with no
screen and no emulator.

## Goals / Non-Goals

**Goals:**

- One age computation and one "has this рахунок ever synced" predicate, each written once and
  used by both screens that show баланс банку — not two hand-rolled copies of either.
- The predicate reads a link's existing `lastSyncedAtMs`; nothing new is stored, queried or
  written.
- The words `NEVER_SYNCED_ACCOUNT` already draws for the monobank screen are reused by reference,
  not retyped, so the two screens are provably saying the same thing about the same state.

**Non-Goals:**

- Not changing `monobankRepo.listLinks()` or `.getAccount()` — both already return everything this
  needs; only their callers' joins change.
- Not introducing a clock port beyond what `syncCoverage`/`lastSyncLine` already established —
  `now: Date` is a plain parameter, supplied by `new Date()` at the point each screen already
  assembles its view model on focus.
- Not touching `InventoryFreshness` or the monobank connect screen itself — see proposal.md's
  Non-Goals.
- No new time-based staleness bound for warning or refusing — see proposal.md's Non-Goals for why.

## Decisions

### D1 — The bank-side join carries three fields instead of one

`accounts.tsx`'s `bankBalances` map (keyed by рахунок id) changes value type from `Money` to a
small record — balance, `obtainedAt`, and whether the link has ever completed a sync — filled from
the same loop over `monobankRepo.listLinks()` that builds it today: the "ever synced" flag is
`link.lastSyncedAtMs !== null`, already returned by that call, so no second query joins it.
`account-movements.ts`'s one caller in `account/[id].tsx` is handed the same record instead of a
bare `Money`. One shape read by both screens, rather than a second map or a boolean threaded
separately beside the first — the exact "two reducers, one answer the day one drifts" risk
`lastSyncLine`'s own comment names for the sync-age line on Головний and the monobank screen.

### D2 — Age is `freshnessLabel`, not a new formatter

`account-groups.ts` and `account-movements.ts` both take `now: Date` as an explicit input — the
same shape `syncCoverage`/`lastSyncLine` already use — and call
`freshnessLabel(obtainedAt.getTime(), now)` verbatim. No new date-formatting rule: a linked
рахунок whose баланс банку is a year old reads exactly the way `momentLabel`'s fallback already
renders any moment that old, because `freshnessLabel` already falls through to it past a day.

### D3 — "Synced at least once" is `NEVER_SYNCED_ACCOUNT`'s own condition, reused

The predicate this change needs — has any прогін ever completed for this рахунок's link — is
exactly the negation of the condition `src/ui/monobank-screen.ts` already tests to show
`NEVER_SYNCED_ACCOUNT`. `account-groups.ts` imports that constant rather than redeclaring the
Ukrainian string, so Рахунки and the monobank screen are provably saying the same word for the
same state instead of two strings that could drift apart.

*Alternative rejected:* a time-based staleness bound instead of, or beside, this predicate — see
proposal.md's Non-Goals for why a second bound is not proposed.

### D4 — `reconcilable` gains the precondition; the age is a sibling field, not a rename

`AccountRow.reconcilable` becomes "there is a difference, it is non-zero, and the link has synced
at least once". A new `bankBalanceAge?: string` sits beside `bankBalance`, set whenever
`bankBalance` is, independent of whether the рахунок has synced — the age is shown for a рахунок
mid-first-sync too, which is the row the reported defect was seen on, and it still has a
client-info answer worth dating even though «Звірити» is withheld for it. A new
`awaitingFirstSync?: boolean` is set from `!syncedOnce` alone — **not** compounded with "and there
is a difference" — so it renders `NEVER_SYNCED_ACCOUNT` whenever the link has not synced, whether
or not the two balances happen to agree today. Compounding it with the difference check would make
`awaitingFirstSync` disagree with the monobank screen's own `NEVER_SYNCED_ACCOUNT` about the same
link in the one case a coincidental balance match arises (a freshly linked рахунок whose opening
balance happens to match its cached баланс банку) — the exact "two readings of one condition"
`lastSyncLine`'s comment warns against, which D3 exists to avoid.

### D5 — `reconcileConfirmation` takes the row it already took

No new parameter: `bankBalanceAge` sits on the same `AccountRow` the function already receives, so
the sentence it builds gains one clause reading a field that is already in scope.

## Risks / Trade-offs

- **A рахунок whose token was revoked long ago can never «Звірити» through this path again.** →
  Accepted in proposal.md's Non-Goals: the owner can still see the age and judge it, and the
  typed-фактичний-залишок «Звірити» on the рухи — untouched by this change — always remains
  available for exactly that рахунок, bank link or none.
- **`syncedOnce` is per-link, not per-баланс.** A рахунок that synced once months ago and has not
  since (background chances stopped reaching it, say) reads as synced and offers «Звірити» with a
  very old age shown beside it — the same shape of risk the reported defect had, just past the
  bright line instead of before it. → The trade-off proposal.md's Non-Goals names directly: the
  alternative is a second, arbitrary time bound with its own failure mode (permanently blocking a
  звірка that will never get fresher). The age is now always visible, which it was not before; the
  owner's judgement replaces silence, not a machine bound.
- **Two screens now read `now: Date`.** → Both already rebuild their view model on every focus
  (`useReloadOnFocus`); reading `new Date()` there costs nothing new and matches
  `syncCoverage`/`lastSyncLine`'s existing shape.

## Migration Plan

No data migration, no schema change, no native change. `monobank_accounts.obtained_at` and
`monobank_links.last_synced_at` already hold everything this needs. The behaviour lands whole with
the build: a рахунок already synced once shows «Звірити» exactly as before, now beside an age it
did not show yesterday. Rolling back is reverting the commit.
