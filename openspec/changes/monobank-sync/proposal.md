# monobank-sync — proposal

## Why

The owner's history moved over from Saldo and manual tracking works, but every monobank
transaction — the bulk of all spending — is still typed by hand. Step 7 of tech-task §5
(FR-S2, FR-A3, FR-T6) is the main value the vision names: monobank captured automatically, so
both questions — where the money went and how much is left — are answered from numbers the
owner did not have to type and can trust. The milestone reads "після 7 — mono тягнеться сам".

Like step 6, this step is too big for one change, and the same split worked there: this change
is the **engine** — everything about the sync that is pure TypeScript, from API payloads and
the owner's stored rules to transactions ready to store, with no I/O, no React, no Drizzle. A
follow-up change (`monobank-sync-screen`) adds token storage on the device, the migrations and
repos, the Налаштування section, and the Рахунки screen actions (баланс банку, «звірити»,
sync) that run this engine. That screen change must surface every unlinked monobank account of
the token, so FR-S2's "по всіх картках і банках" stays reachable — a link left unmade is the
owner's visible decision, never a silent gap.

The «курс» part of step 7 is already done: monobank's tokenless currency endpoint, the cached
rate and the approximate-UAH display landed with `monthly-picture`. Nothing here touches it.

## What Changes

- **New capability `monobank-sync`** — the pure engine in `src/monobank/` (sibling of
  `currency.ts`, same FetchLike pattern, floats stop at the parser):
  - **Client-info**: fetch + total parse of the personal API's account list — cards and jars
    (банки), each with its monobank id, currency (ISO-4217 numeric → code, only the offered
    UAH/EUR/USD kept), a display name, and the bank balance in integer minor units. A card's
    own money is `balance − creditLimit` — the credit limit is the bank's money, not the
    owner's, so the баланс банку the app reports subtracts it and may be negative.
  - **Linking model**: a monobank account maps onto at most one рахунок and a рахунок onto at
    most one monobank account, currencies equal; a card suggests kind `spending`, a jar kind
    `savings`. Unlinked monobank accounts are ignored. The owner's confirmations arrive with
    the follow-up screen; the engine defines what a valid link is.
  - **Statement sync planning**: per linked account, from a given start moment to now, in
    windows the API accepts (≤ 31 days + 1 hour), continuing a window whose answer was full
    (500 items) until it is short — no item is lost to paging. Rate-limit (429), offline and
    invalid-token answers are typed outcomes, never exceptions or partial garbage; a token
    the API rejects is a state the screen will surface, not a crash.
  - **Item → transaction mapping**: a statement item with a negative amount becomes a витрата
    of |amount| in the account's currency — categorised through the owner's stored rules by
    description and MCC, else «Без категорії»; a positive amount becomes a дохід with the new
    reserved джерело «Без джерела»; the item's description becomes the transaction's опис;
    a foreign-currency purchase is the exact сума the bank charged and nothing besides — the
    statement names no currency for `operationAmount`, and an amount without a currency is not
    money this app holds; a hold is just a transaction (vision §13.4). Deduplication is by monobank's statement item
    id against the set of ids already seen — an id once seen never imports again, even after
    the owner deletes or retypes what it created.
- **`transactions` (modified)**: any transaction MAY carry an informational опис — the text
  the bank sent ("СІЛЬПО", "Uklon"). It never affects any total, and it survives edits and
  retypes. Imports create it; manual entry stays minimal and does not ask for one.
- **`accounts` (modified)**: звірити — given a рахунок's розрахунковий баланс and the actual
  balance (the bank's, or a recount), the difference becomes a коригування dated today on that
  рахунок; no difference, no коригування. FR-T6's semantics already exist; this adds the one
  computation that creates коригування in-app, which the screen change will wire to both the
  баланс банку and a cash recount.
- **Domain constant** `UNSOURCED_SOURCE_ID` for «Без джерела», exactly as the reserved
  category ids arrived before their rows: the engine references it now, the `categories`
  seeding delta arrives with the screen change that first stores such a дохід.
- **Dry-run script** `scripts/mono-dry-run.ts` (dev-only, like `saldo-dry-run.ts`): the owner
  runs it with their token in an environment variable; it fetches client-info and a statement
  window and prints the parsed accounts and the mapped transactions without storing anything.
  The token is never written to disk and never read by the agent.

Non-goals of this change (deliberate, most land in `monobank-sync-screen`):

- No screens, no storage, no migrations: nothing here writes to the database or renders.
- No token storage — where the token lives on the device is the screen change's decision;
  here the token is a function argument.
- No automatic pairing of the two statement items a card→card or card→jar transfer produces
  on two linked accounts: each imports as витрата / дохід and the owner retypes, exactly as
  the vision's default prescribes ("every transaction is spending until I mark it as a
  transfer"). Auto-pairing is a possible later change once real sync data shows the shape.
- No webhooks — the app polls; a webhook needs a reachable URL, which vision §12 rules out.
- No push notifications, no other banks' APIs (vision §13).

## Capabilities

### New Capabilities

- `monobank-sync`: the engine that turns the monobank personal API's payloads into the app's
  truth — client-info parsing (cards, jars, balances, credit limit), the account-linking
  model, statement window planning with paging and typed failures, and the deterministic
  mapping of statement items to transactions with rule categorisation and id-based
  deduplication.

### Modified Capabilities

- `transactions`: a transaction MAY carry an informational опис that no total reads and every
  edit and retype preserves; and the original-currency сума of a foreign purchase is kept only
  when the source names the currency it is in — a monobank statement does not, so an import from
  one keeps none (design D12), while the Saldo export and hand entry are unaffected.
- `accounts`: звірити creates a коригування for the difference between the розрахунковий
  баланс and an actual balance.

## Impact

- New code: `src/monobank/api.ts` (client-info + statement fetch/parse), `src/monobank/sync.ts`
  (window planning, paging, dedup, item mapping), `src/monobank/link.ts` (linking model);
  names indicative, final layout in design.md.
- Touched code: `src/domain/transaction.ts` (опис on the five types, `UNSOURCED_SOURCE_ID`),
  `src/domain/account.ts` (звірити computation), `src/ui/retype.ts`, `src/ui/entry-form.ts` and
  `src/app/transaction/[id].tsx` only as far as preserving an опис they now carry through.
- New script: `scripts/mono-dry-run.ts`.
- No new dependencies, no schema change, no migration; `npm run verify` stays Node-only and
  under a minute. The monobank personal API is called only by the dry-run script the owner
  runs and, later, by the app with the owner's token — never by tests, which stub FetchLike
  exactly as `currency.test.ts` does.
