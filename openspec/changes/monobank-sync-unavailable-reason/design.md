## Context

`src/monobank/api.ts`'s `ask()` turns every failure — a rejected fetch, a non-2xx status, a body
that will not parse, a payload `parse` rejects — into one `Outcome<T>` of kind `'unavailable'`
(besides the two named failures, `invalid-token` and `rate-limited`). `src/monobank/coordinator.ts`
carries that straight into `AccountOutcome` — also just `'unavailable'` — and
`src/ui/monobank-sync.ts`'s `journalProgress` journals it as the turn's one-word ending. See
proposal.md for why that is not enough: the platinum рахунок's turn on 2026-09-10 got
`status=200` and still ended `unavailable`, and nothing in the репорт said why.

One thing already covers part of this. `journal.watchFetch` (`src/ui/journal.ts`) journals every
request's own outcome regardless: a rejected fetch gets `не відповів`/`зірвався` on the `network`
line itself, and every HTTP answer's status rides that line's `counts.status` — a 500 or a 429 is
already legible there. So the gap is narrower than "unavailable needs a reason": it is exactly the
case where the `network` entry says the bank answered fine and the `step` entry still says
`unavailable` — a body the app could not use despite a clean HTTP answer.

## Goals / Non-Goals

**Goals:**
- Name why, when a рахунок's turn ends `unavailable` after an HTTP answer the app could not read:
  an unparseable body, a payload of the wrong shape, or — statement requests only, and the one
  cause worth calling out on its own — a row whose currency does not match the рахунок's.
- Do it without a database migration, without changing `AccountOutcome`, `SyncRun`, or any
  existing consumer's behavior for the outcomes it already handles.
- Keep `parseStatement` and `parseClientInfo`'s existing contracts (`T | undefined`) and their
  existing test suites untouched, so the money-critical parse path itself carries none of this
  change's risk.

**Non-Goals:**
- Reasons for a rejected fetch or a non-2xx/401/403/429 status. Those already read as themselves
  on the request's own `network` entry (design above); duplicating them onto the `step` entry
  would be the app quoting itself.
- A reason for the two coordinator-level `unavailable`s that are not `api.ts` parse failures at
  all: a рахунок the token no longer names (`coordinator.ts:458`), and a storage write that threw
  inside `commitStatementAnswer`'s catch (`coordinator.ts:619`). Both already have a clear, single
  cause a reader can tell from context (an owner-side storage failure, or a рахунок missing from
  the client-info answer); neither is the mystery this change exists to close, and folding them in
  would widen the surface for no signal gained today.
- Reasons for a client-info-level failure that stops a whole run (`fetchClientInfo` itself
  answering `unavailable`, which today reports every linked рахунок's turn as `unavailable` in one
  loop). The same mechanism this change adds would apply — `fetchClientInfo` goes through the same
  `ask()` — but repeating one reason across up to nine рахунок turns has not been observed and is
  left to a follow-up change if it ever is; this change adds the type and lets it flow wherever
  `finish()` already has a reason to hand it, without special-casing this path out.
- Fixing whatever made the platinum рахунок's payload unreadable. Diagnostics only.

## Decisions

**A new `UnavailableReason` on `Outcome<T>`, not a richer return from `parse`.**
`Outcome<T>`'s `unavailable` variant gains an optional `reason?: UnavailableReason` with three
values: `'unparseable-body'` (the response claimed an ok status but `response.json()` itself
threw), `'unreadable-payload'` (`parse` rejected it for any other reason), and
`'currency-mismatch'` (statement requests only — a row's `currencyCode` does not decode to the
рахунок's stored currency, the one `parse` failure with a specific, actionable story rather than
"the bank sent something odd"). `ask()` sets `'unparseable-body'` and the bare `undefined`-reason
cases itself; the finer `'currency-mismatch'` split for statements comes from a new optional
`classify` parameter to `ask()`, called only when `parse` did reject the payload.

Alternative considered: change `parseStatement`/`parseClientInfo` to return
`{ ok: true; value } | { ok: false; reason }` instead of `T | undefined`. Rejected — it touches
the signature every existing `api.test.ts` case for both functions asserts against, for a
distinction (`currency-mismatch` vs "everything else") that `parseClientInfo` never needs at all.
The `classify` callback gets the same information (the raw payload) without moving the goalposts
on either parse function's contract.

**One private classifier reusing `parseItem`'s own per-row check, not a second hand-written one.**
`parseItem` is refactored internally to route through a `readItem` that returns
`{ ok: true; value } | { ok: false; reason: UnavailableReason }`; `parseItem` keeps returning
`StatementItem | undefined` exactly as before by discarding the reason on failure, and a new
`statementUnavailableReason(payload, ctx)` walks the same array with the same `readItem`, stopping
at the same first bad row `parseStatement` itself would have stopped at, and answers that row's
reason. This is what guarantees the classifier can never name a different row, or a different
cause, than the one `parseStatement` actually failed on — hand-writing a second, similar walk
would drift from `parseItem` the first time either one is edited alone. `parseClientInfo` gets no
classifier; `ask()` defaults an un-classified rejection to `'unreadable-payload'`, which is
already the right (only) word for it.

**`readItem` catches a throwing converter itself, rather than staying a passthrough for it.**
`parseItem`'s current last line, `date: ctx.dateOf(time)`, runs only once a row has otherwise
passed every check, and a `dateOf` that throws propagates out of `parseItem` today — the exact
fixture `api.test.ts`'s "A converter that throws is unavailable, not a crash" pins, where
`fetchStatement` still answers `{ kind: 'unavailable' }` because `ask()`'s own `try { value =
parse(...) } catch { return UNAVAILABLE }` catches it one level up. `statementUnavailableReason`
is called from inside `ask()` too, but *after* that catch — nothing upstream of `classify` would
catch a throw from underneath it, and `readItem` (called by both `parseItem` and
`statementUnavailableReason`) is the one thing they share. So `readItem` wraps its own call to
`ctx.dateOf` in a try/catch and answers `{ ok: false, reason: 'unreadable-payload' }` on a throw,
making `readItem` — and therefore `statementUnavailableReason` — total: it never throws, for any
input, ever. `parseItem` built on top of it stops throwing for this one fixture too (it now
returns `undefined` instead), which is a change to *how* that row fails, not to *whether* it
does: `parseStatement` still returns `undefined` for that payload precisely as it does today, so
`ask()` still resolves `fetchStatement` to `{ kind: 'unavailable', reason: 'unreadable-payload' }`
rather than rejecting the promise. This is the one place task 1.2's "`parseItem`'s external
behavior is unchanged" claim is deliberately about `parseStatement`'s observable answer (which
rows import, and that a bad row still fails the whole payload) rather than about the throw-vs-
`undefined` mechanism by which a single row fails — the latter was never observable outside
`api.ts` to begin with, since every existing caller only reads `parseStatement`'s and
`fetchStatement`'s return values.

**The reason rides a second журнал entry under the same `accountStepName`, not a compound
`detail` or a new column.** `src/reporting/journal.ts`'s `JournalEntry.detail` is documented as
one enumerated word; `counts` is documented numbers-only (`src/db/schema.ts`'s `journal` table
comment, proven by `src/reporting/privacy.test.ts`'s "lets a count be a number and nothing else").
Neither is a place to add a second string. But nothing requires one entry to carry the whole
story: `journal.step` already writes a began-entry and an ended-entry as two rows under one `run`,
and `entryLine()` (`src/reporting/journal.ts`) renders any `step` entry with a `detail` the same
way regardless of what wrote it — so a second `step` entry, same name
(`accountStepName(monobankAccountId)`), same `run`, `detail` set to the reason, needs no change to
`entryLine`, `src/reporting/report.ts`, or the `journal` table's schema. It appears in the репорт
immediately after the outcome line for that рахунок's turn, which is where a reader is already
looking.

**`AccountResult` gains one optional field, not a variant.** `reason?: UnavailableReason` sits
beside `outcome` on `AccountResult`, present only when `outcome === 'unavailable'` and a reason is
known. Every existing reader of `AccountResult` (`worstOutcome`, `needsOwner`, the screen's
labels, `syncEnding`) ignores fields it does not read, so none of them needs to change; only
`journalProgress`'s `finished-account` case reads the new field.

## Risks / Trade-offs

- [Risk] `readItem`'s refactor touches the one function that decides which статement rows the
  owner's money import accepts. → Mitigation: `parseItem`'s observable behavior — which rows parse
  and which do not, and to what `StatementItem` — is asserted unchanged by the full existing
  `api.test.ts` suite for `parseStatement`/`parseItem`, run before and after the refactor with no
  edits to those assertions. The refactor moves logic, it does not rewrite it.
- [Risk] A рахунок whose bare `network` entry already shows `status=200` but whose `step` entry
  now also carries a `currency-mismatch` reason could read, to a future maintainer, as a fixable
  bug in `parseItem` rather than the deliberate check D4/D12 already document it as. → Mitigation:
  the new scenario in `bug-report`'s delta spec, and `statementUnavailableReason`'s own comment,
  both point back at `parseStatement`'s design D12 comment rather than restating it.
- [Trade-off] The client-info bulk-failure path is left to reuse the same mechanism without a
  dedicated test proving it does not spam nine identical reason lines — accepted per the
  Non-Goals above; nothing observed needs it, and adding a special case for a path this change
  does not otherwise touch would be scope this defect does not ask for.
