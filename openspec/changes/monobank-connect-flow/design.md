# monobank-connect-flow — design

## D1. The token page is opened, not described

`https://api.monobank.ua/` is monobank's own page for a personal token: it shows a QR the owner
scans in the bank's app, and then shows the token. The app opens it with `expo-web-browser`'s
in-app browser rather than handing it to an external browser, for one reason that matters to the
owner: the return is a dismissal they control, so the app knows the exact moment they came back
and can offer what they copied. An external browser would return whenever Android felt like it.

The URL is a constant in `src/ui/monobank-screen.ts` beside the rest of the screen's words, so a
test can assert it and nothing else in the app has to know it.

## D2. The clipboard is read on an action, never on a state

Two reads exist, both the owner's own doing: the dismissal of the token page, and «Вставити з
буфера». There is no read on focus, no poll and no read after any other navigation. This is not
politeness — Android shows a system toast for every clipboard read, and an app that reads on
every opening trains its owner to ignore that toast.

`expo-clipboard` is the dependency this adds (no config plugin, no permission, no manifest
entry). Its result is passed to a pure function; nothing about the decision lives in the screen.

## D3. What counts as "shaped like a token"

`tokenCandidate(text)` trims the ends and accepts 30–64 characters of `A–Z a–z 0–9 _ -`, which is
the shape monobank's personal tokens have, and rejects everything else — a sentence, a URL, an
empty clipboard, a token with a space in the middle.

It is a filter, not a validator. The only judge of a token is monobank answering client-info,
and that order does not change: a candidate goes to `connection.submit`, and storage happens only
if the bank read it. The filter exists so the app does not send the owner's unrelated clipboard
contents — a password, an address — to the bank on the chance that it might be a token.

Rejecting silently would be worse than not offering: when the clipboard holds nothing usable the
screen says so in one line and opens the field empty.

## D4. Proposals live in `src/monobank/link.ts`

Next to `validateLink` and `suggestKind`, because a proposal is exactly "what a valid link would
be": it is built out of the same one-to-one, same-currency rule, and if that rule ever moves, a
proposal that disagreed with it would be the bug. Pure TypeScript, no React, no storage — the
screen hands it the accounts, the рахунки and the links it already has.

## D5. What the evidence is, and when it is not enough

For an unlinked monobank account, candidates are the рахунки `linkChoices` already offers:
unarchived, same currency, not already linked. Each candidate is scored on the bank's name for
the account (`black ··1234`, or a банка's title) against the рахунок's name, normalised to
lowercase with every non-alphanumeric run turned into a single space:

1. **Digits** — the last four digits of the bank's name appear as a digit run in the рахунок's
   name. The strongest signal there is, and the one the owner's own naming most often carries.
2. **Same name** — the normalised names are equal.
3. **Containment** — one normalised name contains the other as a whole word run of at least four
   characters (`black` in `monobank black`).
4. **A shared word** — a word of at least four characters in both. The weakest, and enough for
   `резерв` ↔ `резерв usd`.

The best score wins. If two candidates tie at the winning score the proposal is `ambiguous` and
carries both names: naming one of two equally likely рахунки is how a card's history silently
lands in the wrong place, and the owner resolves it in a second with the picker that is already
there. No score at all means propose a new рахунок, prefilled by `newAccountDraft` — which is
what the owner would have done anyway.

One рахунок is proposed to at most one monobank account: proposals are decided in the fetched
order, and a рахунок already spoken for by an earlier proposal is not a candidate for a later
one. Without that, two cards could both be proposed onto one рахунок and the second link would
be refused at apply time, after the owner accepted it.

Scoring never looks at balances. Two accounts holding the same amount is a coincidence, not
evidence, and a proposal that used it would be right until the day it was expensively wrong.

## D6. Accepting the set is one transaction, with one boundary

`monobankRepo.linkMany` takes the accepted proposals — each either an existing рахунок or a
рахунок to create — and one `syncStartDate`/`cursorMs`, and writes them inside one
`db.transaction`. Any refusal (`validateLink`, a missing рахунок, a unique constraint) rolls the
whole set back. A half-applied set is the one outcome worth ruling out entirely: the owner would
have to work out which of ten cards got linked, and the screen would show them a boundary that
applied to some of them.

The boundary is the same date for the whole set, confirmed before anything is written, and the
existing per-row path keeps its own. Both go through the same confirmation sentence, so the
promise about pre-boundary items and Saldo overlap is made once and shown in both places.

## D7. Nothing here is applied without the owner

`linkMany` is called from one place: the confirmation of the review list. The proposal engine has
no access to storage and cannot write; the repo has no idea proposals exist. Between them there
is one screen and one confirmation dialog.
