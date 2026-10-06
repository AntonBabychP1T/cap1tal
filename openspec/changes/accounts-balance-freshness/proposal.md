## Why

Рахунки shows a linked рахунок's «останній баланс банку» beside its розрахунковий баланс and offers
«Звірити», which turns their difference into a коригування — but the row never says how old that
bank figure is, and «Звірити» is offered even when no прогін has ever completed for that рахунок.
Seen on the emulator during the `monobank-sync-cadence` smoke, 2026-09-09: «Чорна картка ·
останній баланс банку 12 345,00 UAH» offering «Звірити · 12 345,00 UAH» against a розрахунковий
баланс of 0,00 — a рахунок whose sync has never imported a single транзакція, behind a client-info
answer dated a year earlier, with nothing on the row hinting at either fact. Confirming «Звірити»
there would not correct a small drift; it would write the рахунок's whole history off as one
anonymous коригування instead of the real, categorised транзакції sync exists to bring in — the
opposite of "where did my money go" (vision §1) and exactly the kind of коригування §15's
under-2%-of-spending bar exists to catch.

`monobank-sync-cadence` (design.md, decision D3) deliberately left this alone: it made баланс
банку and the транзакції beside it describe the same instant *for a рахунок the прогін completes*,
and named showing the age on Рахунки a separate, untouched question. This change is that question.

## What Changes

- Every linked рахунок on Рахунки shows how long ago its баланс банку was obtained, next to the
  figure itself, in the same words Головний already uses to answer "is what I'm looking at
  current" (`freshnessLabel` in `src/ui/dates.ts` — «щойно», «3 хв тому», falling back to a dated
  moment past a day).
- «Звірити» against баланс банку is withheld for a рахунок no прогін has ever completed for; the
  row says «Ще не синхронізовано» instead, reusing the exact words the monobank screen already
  shows for the same condition. A рахунок in that state has no розрахунковий баланс sync has had a
  chance to explain, so a коригування there would not correct a drift — it would stand in for the
  транзакції sync has not imported yet, silently.
- Once a рахунок has synced at least once, «Звірити» stays offered exactly as it is today, however
  old the figure has since become — the owner now sees the age beside it, and the app does not
  block a звірка the way it never blocks acting on an over-limit категорія either (glossary.md's
  **Limit** entry: "Nothing is blocked, nothing is pushed").
- The confirmation «Звірити» shows before writing (`reconcileConfirmation`) names the age of the
  баланс банку it is about to reconcile against, so the moment that matters most — right before a
  коригування is created — is never silent about it either.
- A рахунок's рухи (`account/[id]`) show the same age beside the баланс банку they already
  display, for the same reason and at no functional cost. That screen's own «Звірити» — a typed
  фактичний залишок, offered for every unarchived рахунок whether or not a bank feeds it — is
  untouched: it is the owner's own count, not the bank's figure trusted automatically.
- `docs/glossary.md`'s **Bank balance (баланс банку)** entry gains the one sentence this change
  makes true: it is shown with the moment it was obtained. **Reconcile (звірити)** gains the one
  sentence bounding its bank-driven form: not offered from баланс банку before a рахунок's first
  sync has completed.

Non-goals, deliberately:

- **No new time-based staleness bound.** The one bound this codebase already names, **межа
  свіжості**, is `monobank-sync-cadence`'s hour for whether a stored client-info answer may serve a
  прогін nobody asked for — an internal pacing decision, not a UI judgement about whether a figure
  is too old to look at or reconcile against. A second, UI-facing bound ("warn or refuse past N
  hours") would need its own owner-approved number and would eventually block reconciling a
  рахунок whose token was revoked months ago against a balance that will never get fresher. The age
  is shown; the owner decides, exactly as they decide against every other number this app shows for
  comparison rather than enforcement.
- **No change to «Звірити» from a typed фактичний залишок** (accounts-screen's "Звірити is offered
  for every рахунок against a typed фактичний залишок") or to the domain `reconcile()` math
  (accounts' "Звірити creates a коригування for the difference") — both stay exactly as specified.
  This change only narrows when the *bank-driven* «Звірити» on Рахунки is offered and what its row
  shows.
- **No change to the monobank screen's own inventory/freshness state** (`InventoryFreshness`,
  `NEVER_SYNCED_ACCOUNT` in `src/ui/monobank-screen.ts`). This change reuses the same underlying
  signal (a link's `lastSyncedAtMs`) and the same words; it does not touch that screen.

## Capabilities

### New Capabilities

<!-- none: every requirement below already exists and gains a clause -->

### Modified Capabilities

- `accounts-screen`: "A linked рахунок shows the bank balance and can be reconciled" gains the age
  of баланс банку and withholds «Звірити» until the рахунок's first sync has completed; "Tapping a
  рахунок opens its рухи" shows that same age beside the баланс банку the рухи already display.

## Impact

- `src/ui/account-groups.ts` — `AccountRow` carries the age and whether «Звірити» is withheld for
  want of a first sync, so `accounts.tsx` only renders (the project's own split of screen logic
  from JSX).
- `src/app/(tabs)/accounts.tsx` — reads `obtainedAt` (already returned by
  `monobankRepo.getAccount()`) and `lastSyncedAtMs` (already returned by `monobankRepo.listLinks()`)
  and passes them through; neither is new data.
- `src/app/account/[id].tsx`, `src/ui/account-movements.ts` — the рухи's own баланс банку row gains
  its age.
- `docs/glossary.md` — the two sentences named above.
- No schema change, no migration: `monobank_accounts.obtained_at` and a link's `lastSyncedAtMs`
  already hold everything this needs.
