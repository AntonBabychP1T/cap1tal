# saldo-import-merge — design

## D1. One definition of "these two names are the same account"

`nameEvidence` and its normalisation move out of `src/monobank/link.ts` into
`src/domain/name-match.ts` — pure, no I/O, colocated tests. The monobank linking proposals read it
from there.

The signals are unchanged and stay in strength order: the last four digits of a card number
appearing in both names, the same normalised name, one name inside the other as an unbroken run
of four characters or more, and a shared word of four characters or more.

## D2. The row's own merge stops being a mode

Merging by hand was a mode: tap «Об'єднати з…», then tap another card. The mode is invisible once
the owner scrolls, and the second tap is a hunt. It is replaced by what every other decision in
this flow uses — a list of choices on the row itself, holding the other entries and the owner's
existing рахунки, labelled the way every other picker in the app labels a рахунок. One tap, no
mode, and the same `redirectAccount` underneath.

The currency rides every label, because currency is the one thing that turns a redirect into a
refusal, and the owner should see it before they pick rather than after.

## D3. Why nothing proposes a merge

The first draft of this change also proposed merges from the same evidence. It shipped, the owner
ran it on their real export, and every proposal was wrong: the export's names share words
(«Monobank», «UAH») that say nothing about two entries being one card, and the digit signal that
carries monobank's linking has nothing to bite on here — a Saldo account name holds no card
number. Evidence strong enough for «which card is this monobank account» is not strong enough for
«which of these twenty-seven names are the same рахунок».

A wrong proposal in front of a step that writes history is worse than no proposal: it is a
default, and a default is what gets accepted. So the map proposes nothing and the owner picks
from the row. `src/domain/name-match.ts` stays where D1 put it — monobank still reads it.
