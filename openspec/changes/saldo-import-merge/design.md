# saldo-import-merge — design

## D1. One definition of "these two names are the same account"

`nameEvidence` and its normalisation move out of `src/monobank/link.ts` into
`src/domain/name-match.ts` — pure, no I/O, colocated tests — and both the monobank linking
proposals and this flow read it from there. Two capabilities proposing merges on two slightly
different notions of "same name" is the kind of divergence nobody notices until one of them is
wrong, and the import writes history.

The signals are unchanged and stay in strength order: the last four digits of a card number
appearing in both names, the same normalised name, one name inside the other as an unbroken run
of four characters or more, and a shared word of four characters or more.

## D2. What a merge proposal may target, and what it may never

A proposal for a map entry targets either another entry of the same currency or an unarchived
рахунок of the same currency that the owner already has. Currency equality is not a preference
here — the import rejects a cross-currency redirect, so proposing one would be proposing a
refusal.

An existing рахунок wins over another entry when both match: the owner keeping a рахунок called
«Monobank Black» is stronger evidence about where this history belongs than two export entries
resembling each other, and merging onto an existing рахунок is also the decision that keeps the
рахунок's opening balance and its already-recorded транзакції in one place.

## D3. No chains, no cycles, one proposal per entry

An entry proposed as a *source* of a merge is never proposed as a *target* of another, and an
entry that is a target is never proposed as a source. Without that rule A→B and B→C could both
be proposed and the owner would accept a chain whose result nobody displayed. Entries are decided
in the order the map lists them, so the first entry of a matching group becomes the target and
the rest become sources.

A tie — two targets matching an entry equally well — proposes nothing for that entry, exactly as
an ambiguous monobank link proposes nothing. The owner resolves it with the picker on the row,
which this change makes a plain list.

## D4. Accepting the set is one re-run, not many

Accepting the proposals writes every redirect into the decisions record in one transition, so the
engine (`survey` → `interpret` → `verify`) runs once over the finished map rather than once per
merge. That is not only speed: a map derived halfway through a set of merges is a map no owner
ever asked to see, and the intermediate states could show rejections that disappear a moment
later.

Nothing about a proposal is remembered. Accepting one is exactly the same decision record a hand
merge writes, so undoing it is the «Скасувати об'єднання» that already exists, and reopening the
flow proposes from scratch against whatever the map now says.

## D5. The row's own merge stops being a mode

Today merging by hand is a mode: tap «Об'єднати з…», then tap another card. The mode is invisible
once the owner scrolls, and the second tap is a hunt. It is replaced by what every other decision
in this flow uses — a list of choices on the row itself, holding the other entries of the same
currency and the owner's existing рахунки, labelled the way every other picker in the app labels
a рахунок. One tap, no mode, and the same `redirectAccount` underneath.
