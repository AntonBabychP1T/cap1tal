## Why

`monobank-sync-unavailable-reason` (archived 2026-09-10) ended by saying it fixed nothing, only
that "the next occurrence names its cause instead of repeating the mystery". The next occurrence
came: `cap1tal-report-2026-09-11-1116` (commit `8e40ae9`) caught `platinum ··6628`'s рахунок
(`IMsrAGgCC_FSNMJ1YvwUDg`) answering `status=200` in 375 ms and still ending

```
2026-09-11 10:59:43.504 · крок · monobank-sync/IMsrAGgCC_FSNMJ1YvwUDg · imported=0 · unavailable
2026-09-11 10:59:43.514 · крок · monobank-sync/IMsrAGgCC_FSNMJ1YvwUDg · currency-mismatch
```

The cause, read off the owner's own card against a temporary token: of 66 statement rows in
fourteen days, 64 carry `currencyCode` 980 and **two carry 840** — two витрати in dollars on a
hryvnia card, MCC 5734. Those two rows are not another рахунок's: their `balance` sits inside the
range the hryvnia rows trace, and their `amount ÷ operationAmount` is 44.83 and 44.63 — the
hryvnia-to-dollar rate, which can only mean `amount` is already in hryvnia while `operationAmount`
is in dollars.

So `currencyCode` on a statement row names the currency of the **operation**, not of the рахунок —
flatly contradicting its own documented description, "Код валюти рахунку відповідно ISO 4217".
`api.ts` believes the documentation, requires a row's `currencyCode` to be the рахунок's currency,
and fails the whole window when it is not. The check therefore does not merely refuse too much: it
tests a field that never held the fact it was asked about, so it can never do the job it was
written for.

What that costs is not one lost window. The cause is deterministic, so nothing advances: the
cursor stays at 3 вересня 00:00, the same window is asked for again, and it fails again — the
рахунок has imported nothing at all since it was linked. Worse, `syncOrder` puts the
longest-waiting рахунок first precisely so a failing link cannot starve the others, which here
means `platinum ··6628` heads run after run, spends the one request a minute a background chance
gets, leaves the other eight `postponed`, and makes the run report `unavailable` and fire «Не
вдалося синхронізувати monobank».

This is squarely the vision's first problem — where the money went. §5 already decides the very
case the app is refusing: "A foreign-currency purchase from a hryvnia card is spent in UAH — the
amount the bank charged; the amount in the original currency is kept for information only." The
bank is sending exactly that, correctly, and the app is throwing it away.

## What Changes

- `src/monobank/api.ts`: a statement row's `currencyCode` stops being read as the рахунок's
  currency. `amount` continues to be read as minor units of the рахунок's currency — which is what
  the API documents `amount` to be ("Сума у валюті рахунку") and what the evidence above confirms
  it is — so a витрата the bank carried out in another currency parses like any other row, and no
  longer makes its window unreadable.
- `src/monobank/api.ts`: `UnavailableReason` loses `currency-mismatch`. Nothing can produce it any
  more, and a reason the журнал can never write is worse than no reason at all. `unparseable-body`
  and `unreadable-payload` stay exactly as they are.
- Every other readability rule is untouched: `id`, `time`, `mcc`, `amount`, `description` and
  `hold` are checked exactly as before, and a row failing any of them still fails the whole window
  (`unreadable-payload`), because a window is still imported whole or not at all.
- Design D12's premise is corrected wherever the code repeats it — `src/monobank/api.ts` and
  `src/monobank/sync.ts`. It reads today that "a monobank statement names no currency for
  `operationAmount` at all"; a statement names it in `currencyCode`. The decision that follows from
  it — that an imported витрата carries no original-currency amount — is **kept**, and rewritten
  to rest on what is genuinely missing (the sync does not read the bank's own сума, and no screen
  shows one) rather than on a fact that is not true.
- `scripts/mono-statement-probe.ts`, the diagnostic that found this defect, stops implementing the
  retired rule. Its currency histogram stays — it is the evidence — but as information, not a
  verdict.

### Non-goals

- Keeping the original-currency amount. Vision §5 wants it "for information only" and the field
  is now known to be readable — and `Expense.originalAmount` with its `original_amount` /
  `original_currency` columns has existed since the first migration, so no column and no migration
  are wanted either. What is missing is that `mapStatement` does not read the bank's own сума and
  that no screen shows one on an imported витрата. Both are a change of their own, recorded for
  BACKLOG.md; `transactions` is amended here only so it stops classifying a monobank statement as a
  source that names no currency.
- The structural wedge — that any deterministically unreadable row still stops a рахунок for good
  and poisons its run's verdict. Genuinely malformed rows are rare where this one was systematic,
  and unwedging is a different decision about the owner's money (skip a row? narrow the window?)
  that deserves its own change.
- `monobank-sync-cadence`, `monobank-sync-fairness` and the alert rules are not reopened.
- Vision §14 items: none is touched.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `monobank-sync`: the requirement "Statement parsing yields items whole or fails whole" is
  replaced by "A statement payload is read whole or not at all", which keeps every other rule and
  drops the sentence making a row of another currency unreadable — the scenario asserting that a
  row of another currency is not this рахунок's statement is replaced by scenarios asserting the
  opposite, for another offered currency, for one the app does not offer, for a row naming none,
  and for a hryvnia row on a foreign-currency рахунок. The requirement "Statement items map
  deterministically to транзакції" keeps every rule and every scenario; one THEN stops resting on
  the false premise that "the statement named no currency for the operation's own сума".
- `bug-report`: the requirement "The журнал records what the app itself did, not only what refused"
  loses its scenario "A недоступно рахунок names a currency that does not match its own" — the turn
  it describes cannot end «недоступно» any more, so the entry it demands can never be written. Every
  other scenario and every other rule is kept word for word, save the "wrong shape" scenario's WHEN,
  which stops saying "for either reason other than the two above" now that one of the two is gone.
- `transactions`: the requirement "A foreign-currency purchase from a UAH card is spent in UAH"
  stops classifying a monobank statement as a source that names no currency for the merchant's
  сума — it does name one — and says plainly that an imported витрата carries none until the sync
  is changed to read it. The rule itself, and both existing scenarios, are unchanged.

## Impact

- Code: `src/monobank/api.ts` and `src/monobank/api.test.ts`. `src/monobank/coordinator.ts` keeps
  its `reason` plumbing and its flow unchanged — one doc comment repeating the retired premise is
  corrected, and the union it carries gets one member shorter, which touches
  `coordinator.test.ts` and `src/reporting/report.test.ts` where they use the retired word as a
  fixture, and `src/ui/monobank-sync.test.ts`, where the test named for the retired `bug-report`
  scenario goes with it.
- Also code: `src/monobank/sync.ts` and `src/domain/transaction.test.ts` (comments only — neither
  the витрата `mapStatement` builds nor any assertion changes), `src/monobank/sync.test.ts`, and
  `scripts/mono-statement-probe.ts`.
- No schema change, no migration, no domain change, no screen change. `Money`, what `mapStatement`
  produces, `planWindows`, the cursor, the imported-id memory and every outcome the screen renders
  stay as they are.
- Once shipped, `platinum ··6628` advances from 3 вересня on its next turn and the other eight
  рахунки stop being crowded out of background runs.
- The same latent failure is removed from the owner's `black ··7583` (USD) and `black ··4969` (EUR)
  cards and the `На облігацію` (USD) банка, where any hryvnia транзакція would have wedged them the
  same way. Probed on 2026-09-11: no rows in 31 days, so no evidence there — only the same
  mechanism waiting.
