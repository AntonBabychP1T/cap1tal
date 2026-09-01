# saldo-import-merge — proposal

## Why

The account map is the step of the Saldo import where the owner decides what their history is
made of, and merging was the decision it helped with least.

A Saldo export carries one entry per account name the file ever used, so one card that was
renamed once — «mono black», «Monobank Black», «Моно чорна» — arrives as three entries and would
become three рахунки with a third of the history each. The flow already refuses to let that
happen quietly: it shows every entry and offers «Об'єднати з…». But merging was a *mode* — tap
«Об'єднати з…» on one card, then hunt for the card to tap second, somewhere else on a screen of
twenty-seven near-identical rows, with nothing saying what the second tap would join.

## What Changes

- **Merging by hand stops being a hunt.** The entry's own row offers the рахунки it could merge
  into — the other entries and the owner's existing рахунки — as one list to pick from, labelled
  with the currency, instead of a mode in which the owner taps a second card elsewhere on screen.
- **The name matching moves into `src/domain/name-match.ts`** — a pure module with its own tests,
  read by the monobank linking proposals.

## Non-goals

- **No proposed merges.** An earlier draft of this change had the flow read the names and propose
  pairs. On the owner's real export every proposal it made was wrong — a shared word like
  «Monobank» is not evidence that two cards are one card — and a wrong proposal in front of a step
  that writes history is worse than no proposal. The list on the row is what helped; it is all
  that ships. See `saldo-import-simple-debts`, which withdrew the rest.
- **No automatic merging** of any kind: the import writes history, and nothing here acts without
  the owner picking it.
- **No change to what a merge means** or to what the import writes: the redirect, the плани, the
  reconciliation report and the atomic commit are exactly as they are.
- **No cross-currency merging** — the import already rejects it and this change does not argue.
- **No matching on amounts or balances**: two accounts holding the same money is a coincidence.
- **No change to the категорії/джерела step or the second-import warning.**
