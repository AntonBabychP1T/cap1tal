## Context

Two leftovers from branches whose code otherwise reached main (see proposal). The numbering D8
is kept from the original monobank-connect-flow design so comments citing "design D8" read the
same; D9 is the Saldo fallback.

## D8. A proposal needs this opening's own successful answer, not just a cached row

The account list this screen shows (`shown` in `monobank.tsx`) already falls back to whatever
`monobank_accounts` rows are cached, so an offline opening still has something to show (spec:
monobank-sync-screen, "Every monobank account and its connection state is visible"). That row can
outlive the token that fetched it — removed by the owner, or left behind by an earlier install —
and it is a fine thing to keep *displaying*, but it is not "a successful client-info answer" in
the sense the proposals requirement means.

Neither is `configured`: it is `connection.state()`'s purely local fact — a token sits in secure
storage — and nothing resets it to `false` when this opening's own `connection.refresh()` comes
back `invalid-token`, `rate-limited`, `unavailable` or `storage-unavailable`. A token revoked at
the bank an hour ago still reads `configured` on this device, right next to «Токен не дійсний» —
gating proposals on `configured` would still let a stale row become a рахунок and a link, only
under a different banner than the one the smoke test found.

The fact the requirement actually means is `fetched`: the accounts this opening's own
`connection.refresh()` or `connection.submit()` last returned, set on success and by nothing
else. `suggestLinks` and `proposalRows` are therefore no longer called directly from
`monobank.tsx`. One function in `src/ui/monobank-screen.ts` — `proposalsForReview` — takes
`fetched` together with the рахунки and links the screen already has, and answers no proposals at
all while `fetched` is `undefined`: before this opening's first client-info answer, or after one
that failed however it failed. A cached row still makes a fine row on the list beneath; it does
not make a proposal, and it never reaches `linkMany`.

`fetched` is deliberately "this opening's most recent success," not "this opening's most recent
attempt": once one refresh or submit has succeeded, a *later* one failing within the same opening
leaves `fetched` as the successful one set it, and proposals keep coming from those accounts. That
is still a successful client-info answer this opening had — it is what the owner is looking at
on the list beneath — and is not the defect this closes, which is a stale row with no answer
behind it at all.

## D9. The in-transit pair's опис falls back to the arrival

The departure is the row that names where the money went, so its опис wins. But a departure with a
blank Description is not a reason to drop the arrival's words: the pair collapses into one
переказ, and the arrival is the only other text the export holds for it. So the pair resolves its
опис once — `{ ...описOf(arrival), ...описOf(departure) }`, the departure spread last so it wins
whenever it has one — and gives that same value to the переказ and to the «Комісія» split off it.
The fee follows the переказ, not the departure's own blank cell, so it is never the one line of
the pair with nothing saying which переказ it belongs to. The two texts are never joined.
