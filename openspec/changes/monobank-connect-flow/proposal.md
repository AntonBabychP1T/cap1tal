# monobank-connect-flow — proposal

## Why

The monobank screen works and asks the owner to do two things by hand that the app already
knows enough to do for them.

**The token.** The screen says «Ввести токен» and offers a field. It never says where a token
comes from. The owner leaves the app, remembers or searches for monobank's own token page,
signs in there, copies the token, comes back and pastes it. Every step of that is outside the
app, and the first one — finding the page — is the one people give up on. Nothing in the flow
is hard; it is simply not offered.

**The linking.** After a token validates, every card and банка is linked one at a time: expand
the row, read a picker of every unlinked рахунок of that currency, choose. For a token with ten
accounts that is ten expansions and ten pickers — and the app already holds the evidence that
would answer most of them, since the bank's own name for a card carries its last four digits
and the owner's рахунок very often carries the same four, or the same word. The screen shows
none of that. A first connection is therefore ten small decisions that all look identical, which
is exactly the shape of a step people click through without reading.

Both frictions sit on the road to FR-S2 — the answer to «куди пішли гроші» stops being complete
the moment an account is left unlinked because linking was tedious.

## What Changes

- **Getting a token starts inside the app.** The token card offers «Отримати токен у monobank»,
  which opens monobank's own personal-token page in an in-app browser. On the way back the app
  looks once at the clipboard: if it holds something shaped like a token, it is offered already
  filled in and validated against the bank without another tap, and kept only if the bank reads
  it. If it holds anything else, the field simply opens empty — nothing is guessed and nothing
  the owner did not copy is ever sent to the bank.
- **The clipboard is read only on the owner's action** — on returning from the token page, or on
  «Вставити з буфера». Never on opening the screen, never in the background, never for anything
  but a token candidate.
- **Linking gains proposals.** For every unlinked monobank account the app proposes one of:
  a named existing unlinked рахунок of the same currency that the evidence matches, or a new
  рахунок prefilled from the bank's own name. Where the evidence points at more than one рахунок
  equally, the app proposes nothing and says so — a coin-flip is not a proposal.
- **The whole set can be accepted at once.** The proposals are shown as one reviewable list with
  one sync boundary; accepting them applies every one of them in a single database transaction,
  or none. Each proposal can still be accepted, changed or refused on its own, and nothing is
  ever linked without the owner saying so.

## Non-goals

- **No OAuth, and no callback into the app.** monobank's personal API hands its token to the
  owner on monobank's own page after they confirm in the bank's app; there is no redirect back
  to a third-party application to receive it. «The token substitutes itself» is therefore
  honestly the clipboard on return, not an authorisation callback — and the proposal says so
  rather than implying a flow that does not exist.
- **No change to what a token is or where it lives**: validation before storage, secure storage
  only, never shown again — the existing requirement stands untouched.
- **No automatic linking.** A proposal that applied itself would silently decide where a card's
  history lands; every proposal waits for the owner.
- **No change to sync itself**: no new requests, no change to the boundary rule, the rate limit,
  deduplication or outcomes.
- **No matching across currencies** — `validateLink`'s same-currency rule is the floor a
  proposal is built on, not something a proposal may argue with.
