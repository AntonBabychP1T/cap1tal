## Why

Nine рахунки are linked on the owner's phone and the синхронізація has imported nothing at all.
The журнал of the репорт taken on 2026-09-09 holds thirteen `GET /personal/client-info`, two
`GET /bank/currency` and **not one** `GET /personal/statement` — over two days, foreground and
background alike. The owner reads it as «платинова картка не синхронізується»; what is actually
true is that no рахунок does, and the platinum one is simply the one far enough down the order to
make it obvious.

Every прогін spends the bank's one-request-a-minute allowance on the client-info request that
opens it, and then owes a full minute before the first statement request — a minute neither the
фоновий прогін nor a прогін in front of the owner can sit out. That answers the vision's first
problem, «where did the money go», with an empty answer: транзакції the bank knows about never
reach the phone, so Місяць and Звіти describe a month the owner did not live.

## What Changes

- A прогін nobody asked for no longer buys баланси it already has. While the newest client-info
  answer the phone has stored is younger than the **межа свіжості** — a new глосарій term, one hour
  — the прогін uses it and sends no client-info request at all, so the request it may send goes to
  the statement, which is the one that imports. A link that answer does not name is treated exactly
  as a fetched answer treats it: the token no longer shows that рахунок. It is never a reason to
  fetch again, because a рахунок the token stopped showing keeps a stored row no answer will ever
  refresh, and treating that as a reason to refetch would re-create this defect in full.
- The прогони the owner asked for are the exception and always ask the bank, however fresh the
  stored answer is: «Синхронізувати» and the pull on Головний. Both are the owner saying «now», and
  both can afford the request — they are watching, the прогін may wait out the minute, and one
  client-info request is a tenth of a nine-рахунок sweep rather than the whole of a chance (owner's
  decision, 2026-09-09). «Asked for» is the division «Pulling down on Головний refreshes it and
  syncs monobank now» already draws for the тихий інтервал, reused rather than reinvented.
- A прогін imports no транзакція later than the moment of the answer it used, so for a рахунок it
  carries to completion the баланс банку and the транзакції committed beside it describe the same
  instant. Without that, a прогін using an hour-old answer would leave «Звірити» offering a
  коригування for an hour of the owner's real spending. A completed синхронізація is likewise
  remembered by that answer's moment, so a прогін that finds nothing left to ask about dates no sync
  the bank was never asked for.
- **BREAKING (behaviour):** a фоновий прогін loses its time budget and its wait. It sends what the
  pace allows at the moment it starts and ends; the quarter-hour cadence of the phone's own chances
  is what paces the app, rather than a `setTimeout` Android freezes along with the Activity. A
  рахунок it did not reach ends перенесено exactly as it does today.
- A прогін in front of the owner keeps its wait, its «2 з 3», its «Зупинити» and its поступитися
  untouched. The automatic one an opening or a foreground return starts gains the first bullet — a
  first statement request that goes out at once instead of a minute late — and the two asked-for
  triggers keep behaving exactly as they do today.
- The client-info requests the monobank screen sends on its own start taking the minute like every
  other request to the personal API. They already had to under «The minimum gap between requests
  holds across runs»; they did not, and once a прогін stops sending its own client-info request
  that omission becomes a statement request refused by the bank and a хід spent on it.
- Five places that stop being true are corrected: the **прогін**, **фоновий прогін** and
  **перенесено** глосарій entries, the vision's §12 sentence bounding the background run «to a few
  minutes», and `docs/tech-task.md`'s row for `monobank-background-sync`. **Межа свіжості** joins the
  глосарій as a new term.
- One consequence worth naming: перенесено becomes the ordinary outcome of a healthy phone, because
  a chance always stops at a request it may not yet send. The word stays honest — there is always
  more the прогін owes — and it means the тихий інтервал stops rationing прогони, which «A postponed
  run does not spend the quiet interval» already asks for.

Not in scope: the order of ходи, which is already right — no рахунок's хід moves today only
because no statement request is ever sent, and it starts rotating on its own the moment one is.
Nor the bank's rate limit itself, which is left modelled as one shared minute across every request
to the personal API; this change makes the прогін spend that minute on the useful request rather
than assuming a cheaper limit than the app can prove.

## Capabilities

### New Capabilities

<!-- none: every requirement below already exists and changes shape -->

### Modified Capabilities

- `monobank-sync`: a прогін reuses the newest stored client-info answer instead of spending its
  allowance on a fresh one, and bounds what it imports to that answer's moment; a фоновий прогін
  sends what the pace allows and never waits, replacing the requirement that gave it a time budget;
  the sentence exempting a budgeted прогін from the foreground-yield rule, and the follow-up run
  the quiet-interval requirement calls «a run without a budget», both name something this change
  deletes and are reworded.

## Impact

- `src/monobank/coordinator.ts` — the client-info decision, the run's span, and the storage port
  that reads the stored рахунки; `SyncStorage` gains one method.
- `src/monobank/sync.ts` — the freshness decision, pure and table-tested.
- `src/monobank/yielding.ts` — `budgetedRun` gives way to the port that never waits.
- `src/monobank/connection.ts` — its two client-info calls note the request they send.
- `src/ui/monobank-background.ts` — a фоновий прогін stops being given a budget.
- `src/platform/background-turn.ts`, `src/platform/monobank-sync-task.ts` — `BACKGROUND_TURN_BUDGET_MS`
  and its `Platform.select` go with it.
- `docs/product-vision.md` §12, `docs/glossary.md` (three corrections and one new term),
  `docs/app-overview.md`, `docs/tech-task.md` — the statements above.
- No migration, no schema change: `monobank_accounts.obtained_at` already holds everything the
  stored answer needs.
- Archive order: this change REMOVES and MODIFIES requirements owned by `monobank-background-sync`,
  which is still in flight, so it archives after it. `monobank-sync-fairness` is **not** a blocker —
  no header this change touches is one of its, and the new requirements restate its cross-run gap
  rather than weakening it. This change is also what `monobank-background-sync`'s task 9.2 — the
  owner's own money-path verification on the phone with the token — actually found, and the two are
  read together.
