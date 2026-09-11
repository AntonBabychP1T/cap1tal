## Context

See proposal.md — Why. What matters here is the shape of the code the change lands in.

`readItem` in `src/monobank/api.ts` is the single place a statement row becomes an item, shared by
`parseStatement` (which decides what a рахунок imports) and `statementUnavailableReason` (which
only explains a rejected payload), so the two can never disagree about which row failed or why. Its
last check before building the item is:

```ts
const numeric = row.currencyCode;
if (typeof numeric !== 'number' || CURRENCY_BY_NUMERIC[numeric] !== ctx.currency) {
  return MISMATCHED_CURRENCY;
}
```

`ctx.currency` is not a guess: `coordinator.ts` passes `bankAccount.currency`, which comes from
client-info for that same account id, and `upsertAccounts` rewrites the stored currency on every
answer. So the two sides of that comparison were never the same kind of fact — one is the рахунок's
currency, the other, as measured, is the operation's.

The archived design `2026-08-27-monobank-sync` D12 named this exact reading and rejected it as "a
branch that would never fire on real data". It fires: two of 66 rows on `platinum ··6628` in
fourteen days.

## Goals / Non-Goals

**Goals:**

- A foreign-currency транзакція charged to a рахунок parses like any other row, so the window it sits
  in imports and the cursor moves.
- No parse strictness that guards money is weakened.
- The journal keeps naming causes it can actually produce, and stops carrying one it cannot.

**Non-Goals:**

- Reading `operationAmount`. Out of scope per the proposal; D12's *decision* is kept, only its
  premise corrected.
- Any change to `coordinator.ts`'s flow, to the cursor, to paging, to the imported-id memory, or to
  what the monobank screen renders.
- Un-wedging a рахунок stopped by a genuinely unreadable row. Still whole-or-nothing, still forever.

## Decisions

**D1. Drop the check rather than narrow it.** The comparison is deleted, `MISMATCHED_CURRENCY` and
the row's `currencyCode` read with it; `amount` continues to be read as `money(amount, ctx.currency)`
exactly as today.

The reason to delete rather than soften is that the check is not too strict, it is aimed at the
wrong fact. It was written (D12) as "a check that this really is the statement of the рахунок being
imported into". A field holding the operation's currency cannot answer that question for any row,
so no threshold, allow-list or tolerance makes it answer it. What actually establishes the рахунок
is the account id in the request URL, and that is not in doubt.

*Alternatives considered.* **Accept only a mismatch whose code the app offers** (so USD on a UAH
рахунок passes, an unoffered code still fails): arbitrary — the app's three currencies are the ones
a рахунок may be *opened* in, which says nothing about where the owner may spend. It would also
leave the very failure this change exists to remove in place for a витрата in złoty. **Verify the
рахунок by `balance` continuity instead**: it is what convinced us during diagnosis, but as a rule
it is fragile (a window's first row has nothing to be continuous with) and it would turn a parser
into a reconciler. **Guard on the two сума fields being equal**: the evidence does offer one real
discriminator — a row the bank carried out in another currency has `amount ≠ operationAmount` (they
stood at a ratio of 44.83), while a row genuinely belonging to a рахунок of that other currency
would have them equal — so «a foreign code *and* equal amounts» could have stayed unreadable. It is
rejected because it needs `operationAmount`, which this change declares a non-goal, and because it
makes the parser reconcile two сума fields against each other to decide whether to read a third.
**Keep the check and skip only the mismatching rows**: that silently drops real spending, breaks
whole-or-nothing, and contradicts vision §5, which says a foreign purchase from a hryvnia card *is*
a UAH витрата.

**D2. Retire `currency-mismatch` from `UnavailableReason` instead of leaving it unreachable.** With
D1 nothing produces it. A reason kept in the union would be a word the журнал can never write and a
branch no test can reach honestly — and the previous change shipped this vocabulary precisely so
that every word in it means something the owner may actually meet. `unparseable-body` and
`unreadable-payload` are unchanged, `Outcome`'s shape is unchanged, and `coordinator.ts`'s `reason`
plumbing is unchanged; only the union has one member fewer.

**D3. Correct D12's premise in `api.ts`'s own comment, keep its decision.** The module comment and
`parseStatement`'s doc comment both assert that a statement "names no currency for `operationAmount`
at all". That is now known to be false — `currencyCode` names it. The comments are rewritten to say
the true thing and to rest the same conclusion on scope instead — and on the right scope: the store
is not what is missing (`Expense.originalAmount` and the `original_amount` / `original_currency`
columns have existed since the first migration, and `persistence` already requires the round-trip);
what is missing is that `mapStatement` does not read the bank's own сума and that no screen shows
one on an imported витрата. This matters beyond tidiness because D12's stated premise is what a
future change would reason from, and replacing one false premise with another would waste the whole
point of the change.

**D4. The failing test comes first, and it is the shape the owner's card actually sent.** Per hard
rule 2. The regression test builds a statement of the рахунок's own currency plus a row naming
another — the 64-and-2 shape, minus the volume — and asserts today's parser rejects the window
before the fix and yields every item after it. A second test covers a code outside
`CURRENCY_BY_NUMERIC` entirely, which is the case D1's rejected alternative would still have failed.

**D5. Nothing is migrated and nothing is re-fetched by hand.** A рахунок stopped by this rule kept
its cursor where it was, which is exactly where reading must resume; `windowsOf` plans from that
cursor on the next turn and the previously unreadable windows are asked for again in the ordinary
course. No schema change, no migration, no data repair, no native or Expo config change.

## Risks / Trade-offs

- [The app no longer notices if the bank ever answers with a different рахунок's statement] → it
  never did: the field it watched holds the operation's currency, so the check passed or failed for
  reasons unrelated to the question. What identifies the рахунок is the account id in the URL, and
  `amount` is documented and measured as being in that рахунок's currency.
- [A row whose `currencyCode` is absent or malformed now parses instead of failing] → it was never
  money: the app reads no сума from that field. Every field a сума is built from — `amount`, and the
  рахунок's own currency — is checked exactly as before.
- [The journal loses a word it used to be able to write] → the word named a thing that cannot
  happen. `unreadable-payload` still covers every remaining way a row can fail, and the two runs
  that produced `currency-mismatch` are in the archived reports if the history is ever wanted.
- [Foreign purchases now import at the hryvnia сума only, with the original сума discarded] →
  unchanged from today for every рахунок that was not stuck, and it is what vision §5 asks for. The
  original сума becoming readable is recorded as a BACKLOG item, not smuggled in here.
