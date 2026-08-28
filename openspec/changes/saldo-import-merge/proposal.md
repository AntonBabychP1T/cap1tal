# saldo-import-merge — proposal

## Why

The account map is the step of the Saldo import where the owner decides what their history is
made of, and it is the step that asks the most and helps the least.

A Saldo export carries one entry per account name the file ever used, so one card that was
renamed once — «mono black», «Monobank Black», «Моно чорна» — arrives as three entries and would
become three рахунки with a third of the history each. The flow already refuses to let that
happen quietly: it shows every entry and offers «Об'єднати з…». But merging is done by hand and
one pair at a time — tap «Об'єднати з…» on one card, then hunt for the card to tap second, with
nothing on screen saying which two the app thinks are the same. On a real export of twenty-seven
accounts that is a screenful of identical rows and a decision the owner has to make from memory.

The evidence needed to propose most of those merges is already on the screen: the names
themselves, and the рахунки the owner already keeps. Nothing reads it.

## What Changes

- **The flow proposes the merges.** Before the owner touches anything, entries whose names match
  each other, or match a рахунок the owner already has, are proposed as merges — each one named,
  with the reason it was proposed, and a рахунок the owner already keeps preferred over a new one.
- **Ambiguity proposes nothing.** Where an entry matches two targets equally well, no merge is
  proposed for it and the choice stays the owner's.
- **The whole set is accepted in one step**, or refused one by one, and every proposal can be
  undone afterwards exactly as a hand-made merge can — nothing about the map becomes irreversible.
- **Merging by hand stops being a hunt.** The entry's own row offers the рахунки it could merge
  into — the other entries of the same currency and the owner's existing рахунки — as one list to
  pick from, instead of a mode in which the owner taps a second card somewhere else on screen.
- **The name matching is shared, not copied.** The evidence rules the monobank linking proposals
  use move into one pure module both capabilities read, so «what makes two account names the same
  account» has one definition and one set of tests.

## Non-goals

- **No automatic merging.** A proposal that applied itself would silently fold two рахунки the
  owner meant to keep apart into one, and the import writes history — nothing here acts without
  the owner accepting it.
- **No change to what a merge means** or to what the import writes: the redirect, the плани, the
  reconciliation report and the atomic commit are exactly as they are.
- **No cross-currency merging** — the import already rejects it and this change does not argue.
- **No matching on amounts or balances**: two accounts holding the same money is a coincidence.
- **No change to the категорії/джерела step, the борги step or the second-import warning.**
