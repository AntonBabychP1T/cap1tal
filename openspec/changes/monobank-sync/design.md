# monobank-sync — design

## Context

See proposal.md — Why. This change is the engine half of tech-task §5 step 7, mirroring the
saldo-import split: pure TypeScript from API payloads to транзакції ready to store, with the
screens, migrations and token storage in the follow-up `monobank-sync-screen`.

What already exists and is reused, not rebuilt:

- `src/monobank/currency.ts` — the tokenless rate endpoint, with the two patterns this change
  copies: a `FetchLike` seam so tests never touch a network, and a parser that is the one
  place floats are allowed to exist.
- `src/domain/rules.ts` — deterministic правило matching (merchant + MCC, most-specific-first).
  The mapper calls it; nothing about matching changes.
- `src/domain/transaction.ts` — the five types, reserved ids (`UNCATEGORISED_CATEGORY_ID`,
  …). Gains `description?` and `UNSOURCED_SOURCE_ID` here.
- `src/ui/id.ts` — id generation, injected into the mapper the way repos already inject it.

Constraints: `npm run verify` stays Node-only and under a minute — no network in tests, no
native module, no Expo config change (this change needs none: no new permission, no plugin).
Money integer rules per `.claude/rules/domain.md`; no schema or migration here.

## Goals / Non-Goals

**Goals:**

- Every behaviour of the delta specs implemented as pure functions with injected effects
  (fetch, clock, timezone, id generation), fully covered by Vitest.
- The follow-up screen change can be wired with no new domain decisions: it stores what the
  engine returns, feeds back what it asks for (seen ids, link set, last-synced moment), and
  paces requests as the planner dictates.
- A dry-run the owner can run against their real token before any UI exists.

**Non-Goals:**

- No storage, no screens, no token persistence (see proposal non-goals).
- No request pacing/scheduling loop: the engine plans windows and types 429 as an outcome;
  *when* to retry is the caller's decision, made in the screen change.
- No webhook support, no background sync.

## Decisions

**D1. Layout: three new files in `src/monobank/`.** `api.ts` — endpoints, payload parsing,
typed outcomes; `sync.ts` — window planning and item→транзакція mapping; `link.ts` — the link
model. Sibling of `currency.ts`, which stays untouched. Alternative — one big `personal.ts` —
rejected: parsing, planning and mapping have different inputs and different tests.

**D2. A token-aware fetch seam, not a widened `FetchLike`.** The personal API needs an
`X-Token` header, so `api.ts` defines its own seam: `AuthFetchLike = (url, headers) =>
Promise<{ok, status, json()}>`. `currency.ts`'s `FetchLike` is left alone — widening it would
put a token parameter next to the one module that must never see one (its file comment says
exactly that).

**D3. Outcomes are a discriminated union, not exceptions.**
`Outcome<T> = { kind: 'ok'; value: T } | { kind: 'invalid-token' } | { kind: 'rate-limited' }
| { kind: 'unavailable' }`. 401/403 → invalid-token, 429 → rate-limited, everything else that
is not a parsed 200 → unavailable. Rationale: the spec forbids throwing and partial reads, and
the screen change needs to distinguish exactly these three failure states (re-enter token /
wait / shrug). The token never enters the union, so nothing downstream can log it.

**D4. Statement parsing fails whole; client-info parsing also fails whole; currency.ts's
"skip bad rows" is deliberately not copied.** A rate row is a disposable cache; a statement
row is the owner's money — silently dropping one breaks the §14 trust criterion. One
unreadable row → `unavailable` for the whole answer, and the window is retried some later
sync, nothing marked as seen.

**D5. Calendar dates come from an injected converter.** Parsers take
`dateOf: (unixSeconds: number) => IsoDate`; the app will pass a device-timezone
implementation, tests pass a fixed-zone one. Rationale: the domain has no Date objects and no
timezone opinion (`IsoDate` is a string); baking `Intl` into the parser would make tests
depend on the runner's zone.

**D6. The sync planner is data, not a loop.** `planWindows(fromMs, nowMs): Window[]` slices
the span into ≤ 31 d + 1 h windows, oldest first; `continueWindow(window, oldestItemMs):
Window | undefined` narrows a window whose answer was full (500 items). The caller owns the loop
and the 60-second pacing. Rationale: pure data in/out is testable to the millisecond, and the
API's rate limit is an I/O concern the engine must not sleep on. The continuation ends at the
oldest received item's moment *inclusive*, which can re-fetch same-second items; the seen-id set
makes the overlap harmless (spec: an id imports at most once).

`undefined` is the answer when the oldest item is already at the window's start — a continuation
that would ask for an empty or inverted span is not a request worth making, and returning a
window the caller must then check would only move that test outward. Both window ends being
inclusive is what also lets an empty span (`fromMs === nowMs`, two syncs in one millisecond) plan
no request at all: the next sync's first window still covers that moment. So that the *moment* of
the oldest item is available at all, a parsed `StatementItem` keeps `timeMs` beside its calendar
date — a calendar day is far too coarse to page on.

**D7. Mapping takes explicit context and returns what changed.**
`mapStatement(items, ctx)` with `ctx = { accountId, currency, rules, seenIds, newId }` returns
`{ transactions, seenNow }` — the транзакції to store and the ids to add to the seen set (all
readable item ids, including the zero-amount ones, so a zero item is not re-examined forever).
The seen set is input and output, never hidden state: the screen change persists it, tests
hand in literals. Категорія via `matchRule(rules, description, mcc)`; no match →
`UNCATEGORISED_CATEGORY_ID`; positive amounts → `UNSOURCED_SOURCE_ID`.

**D8. `description?` goes on all five transaction interfaces.** Uniform optional field,
preserved by `src/ui/retype.ts` and `src/ui/entry-form.ts` edits (a couple of spread-siles to
check, property tests extended). Alternative — витрата/дохід only — rejected: retyping a mono
витрата into a переказ (the everyday card→jar case) would silently drop the bank's text, and
a round-trip retype would lose information. Absent means absent: an empty опис is no опис, so the
field is omitted rather than stored as `''`, and every builder guards it the same way.

Two consequences are deferred to `monobank-sync-screen` on purpose, and named here so neither is
mistaken for an oversight. The опис has **no column** — `src/db/schema.ts` and `src/db/mappers.ts`
are untouched, this change stores nothing, and the migration that makes the опис survive a restart
arrives with the screen that first imports one. And **«опис» gets no `docs/glossary.md` entry
here**, for the same reason «Без джерела» gets none (D9): the term is specified now and enters the
owner's vocabulary with the screen that shows it, in one doc edit rather than two.

**D9. «Без джерела» follows the reserved-id precedent exactly.** `UNSOURCED_SOURCE_ID =
'unsourced'` lands in `src/domain/transaction.ts` now; the `categories` seeding delta (row,
label, reserved-row rules, picker exclusion) and a `docs/glossary.md` entry for «Без джерела»
land in the screen change that first stores such a дохід — the same order in which the
reserved category ids preceded their rows, documented in the same code comment.

**D10. Звірити lives in `src/domain/account.ts`.** `reconcile({ accountId, computed, actual,
date, newId }): Correction | undefined` — undefined on equal balances, throw on currency
mismatch (same style as the module's other rejections). The screen change wires it to both
the баланс банку and a hand recount; here it is a pure function next to `computeBalance`, so
the "afterwards the розрахунковий баланс equals the actual balance" scenario is a direct
property test over the existing balance code.

**D11. Dry-run script reads the token from the environment, never from a file.**
`scripts/mono-dry-run.ts` (run by the owner: `MONOBANK_TOKEN=… npx tsx scripts/mono-dry-run.ts`)
fetches client-info and the last days' statement of the first account, prints parsed accounts
with balances and the mapped транзакції (empty rule set — everything lands in «Без категорії»),
stores nothing. No `.env` file is introduced anywhere — guard-bash blocks reading those, and
the agent never runs this script; like `saldo-dry-run.ts` it exists for the owner's real-data
feedback before the UI.

**D12. A monobank statement carries no operation currency, so no imported транзакція carries an
original-currency сума.** The API documents a statement row's `currencyCode` as the code of the
*account*, not of the operation, and there is no other field naming the currency `operationAmount`
is denominated in. So `currencyCode` is read here as what it is — a check that this really is the
statement of the рахунок being imported into, and a row of any other currency is unreadable — and
`operationAmount` is not read at all. A foreign purchase imports as exactly what the bank charged
the рахунок, which is the number every total uses anyway.

Rejected alternatives: reading `currencyCode` as the operation's currency (a branch that would
never fire on real data, and a false premise for `monobank-sync-screen` to build on); and inventing
the currency from a full ISO-4217 numeric table (which would still need a currency the payload does
not contain, and would mean claiming each currency's minor-digit exponent — JPY has none, TND has
three — where a wrong exponent prints a wrong number).

`Expense.originalAmount` stays in the domain: the Saldo import and manual entry do name a currency,
and this decision is about what monobank sends, not about what a витрата may hold. The dry-run over
the owner's real payloads is what confirms the documented shape before the screen change builds on
it.

## Risks / Trade-offs

- [API shape drift — the personal API is documented informally and could change] → total
  parsers turn surprises into `unavailable`, never into wrong numbers; the dry-run on the
  owner's real payloads catches drift before the screen change builds on it.
- [Credit-limit semantics: `balance` includes the credit limit, so own money =
  `balance − creditLimit`] → encoded in one place with its own scenarios; the dry-run prints
  both raw and derived figures so the owner can eyeball them against the mono app.
- [Same-moment items around a continued window boundary could arrive twice] → id dedup is the
  invariant (imports at most once, forever); overlap costs a skipped item, never a duplicate.
- [Timezone edges: an item at 00:30 Kyiv is "yesterday" in UTC] → `dateOf` is injected and
  tested at midnight boundaries; the device-zone implementation arrives with the screen
  change and inherits the tests' contract.
- [Two-leg reality of own transfers (card→jar shows on both statements) inflates витрачено and
  дохід until the owner retypes] → accepted for v1 by the proposal (vision's own default);
  «Без категорії» and «Без джерела» marks keep both visible, and the seen-id set survives the
  cleanup deletes.
- [An arriving повернення or cashback imports as дохід «Без джерела», which the glossary
  forbids as an end state ("Refund … is not income"), and it recurs monthly (mono cashback)] →
  accepted as a *starting* state, spelled out in the mapping requirement: the owner retypes it
  through витрата into повернення — the only path main-screen allows, дохід→повернення being
  expressly forbidden there. The «Без джерела» mark keeps every such дохід visible until then;
  neither this engine nor the screen change may treat cashback-as-дохід as a bug to silently
  reclassify.

## Open Questions

- Whether a банка's statement is fetched by `id` or `sendId` — the engine treats the account
  id as opaque, so the dry-run settles it without spec or code changes here.
- The exact card display-name format the owner prefers («black ··1234» vs «monobank black»)
  — a label concern for the screen change; the spec only fixes what the name must contain.
