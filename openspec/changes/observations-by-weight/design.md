## Context

See proposal.md — Why. The спостереження are produced by six pure detectors and put in one order by
a single comparator (the observation order module); Головний takes the first three of that list,
Місяць and the підсумок the first five plus «Ще N». Today the comparator sorts by kind, then
currency, then a per-kind size in minor units, then names and ids. Everything downstream already
says "the first N in the order the observations capability defines", so changing the comparator is
the whole behavioural change; the caps, sentences, destinations and the «Не дубль» flow are
untouched.

The per-kind sizes the comparator already computes (|A − T|, S − P, last − first, |X − R|, X − R)
are exactly the money weight the spec now defines, so no detector gains a field.

## Goals / Non-Goals

**Goals:**
- One cross-kind order inside a currency, by money weight, with дублі kept first.
- A record of how many спостереження today's thresholds state on the owner's real history, so the
  owner can decide on retuning with numbers in hand.

**Non-Goals:**
- No threshold constant changes (they are pinned by spec scenarios; a retune is a separate change
  with the owner's decision).
- No UI change beyond what the reordering produces; no new screen state, no stored value, no
  migration, no native module, permission, package.json or app.json / config-plugin change.

## Decisions

**D1. Money weight = the stated difference from the comparison сума.** Each kind already states
two сум: the one it is about and the one it compares it with. The weight is their difference,
signed so it is never negative (each detector only fires when its difference points the stated
way, so S − P, X − R and last − first are ≥ 0; |·| for the two two-sided kinds). This reads "how
much money is unusual here", which is the owner's «ранжовані за сумою» without favouring large
categories that merely behaved normally.
Alternatives: *the stated сума itself* (A, S, X) — rejected: Оренда at its usual 15 000 UAH would
outrank a real 3 000 UAH surprise, and a «цього місяця не було» fact would weigh zero; *the
percentage* — rejected: it is exactly what QA 2.8 found noisy (small категорії with big
percentages); *weight divided by the currency's поріг помітності* — rejected: the price-change and
дубль detectors have no поріг by design.

**D2. A можливий дубль leads regardless of weight.** It is not a fact about spending but a question
about whether a record exists twice; until answered, every other number of the month may be off by
its сума, and the owner's answer takes one tap in place. A 125 UAH дубль therefore stays above a
9 000 UAH Продукти fact. Alternative: weigh a дубль by its сума — rejected because burying the one
спостереження that has an answer under facts that have none makes «чистий місяць» (vision §15)
slower, and the sibling `answer-queue` relies on дублі being findable. Listed as an owner question.

**D3. Rank within a currency; UAH first, then by code; never convert.** The observations capability
already forbids a курс («no курс», "Nothing SHALL ever be compared across currencies or
converted"), and the glossary keeps «приблизно в гривні» a secondary display, never an input to a
rule. Converting at monobank's current rate would also make the order depend on a fetched rate rather
than on the stored транзакції alone, which the "computed from the stored state and today's date
alone" rule excludes. Consequence: on Головний a large USD
fact never displaces a UAH one from the three slots; the owner's life is in UAH and other
currencies are rare, so this is accepted and asked.

**D4. Ties of weight fall back to the old kind order**, minus the дубль: price change, purchase,
already-more, vs-типова, run. The old order put the more specific facts first; keeping it as the
tie-break preserves determinism with no new rule. Then the existing text/id tie-breaks, compared by
code unit.

**D5. Thresholds are measured on the owner's history, not invented.** Measurement only: it traces
to no requirement and edits no source. A throwaway script in the session scratchpad (never
committed, never part of `verify`) restores the owner's latest бекап into an in-memory database
with the real migrations, runs the observations entry point for every завершений активний місяць
and the current month with today's constants, and then post-filters the result using the сум each
спостереження states: a band of 35 % keeps a vs-типова fact only when |A − T| ≥ 35 % of T; a поріг
of 5 % keeps a fact of a kind that uses the поріг only when its money weight is ≥ 5 % of the
currency's типова сума of витрачено, taken from the window module's baseline for that month and
currency. A post-filter can only show what stricter thresholds would remove, which is the question
QA 2.8 raised (too many facts); looser values are not measured. The table goes into this file under
"Measurement"; a retune is proposed to the owner as its own change.
Candidate inputs found on this machine: `~/Downloads/cap1tal-2026-09-23.json` (newest file бекап)
and the emulator pull under `.cache/android/owner-db/`. The script reads them locally, sends
nothing anywhere, and the table records only counts — no описи and no сум.

Implementation shape: in the order module, replace the kind-first comparison with: дубль vs
non-дубль; currency; for two дублі the existing later-date / larger-сума keys; otherwise weight
(the existing per-kind size), then a tie-break kind rank without the дубль entry; then the
existing tie-break texts. Pure function, no `now`, integer arithmetic only.

## Risks / Trade-offs

- [A price change of +50 UAH sinks below the cap in busy months] → It is still on Місяць behind
  «Ще N»; the sibling `commitments-from-recurring` turns regular payments into зобов'язання, where a
  price change matters more. Owner question.
- [Many unanswered дублі fill all three slots on Головний] → Already the behaviour today; the
  sibling `answer-queue` gives them one place to be answered quickly.
- [The integration fixture "A дубль leads" changes its expected order] → The scenario is restated in
  the delta with new numbers; the test is updated to the new expectation explicitly, not weakened.
- [The measurement reads personal financial data] → Local only, counts only in the write-up, the
  restored database lives in the scratchpad and is not committed.

## Migration Plan

None: no stored state changes. Rollback is reverting the comparator.

## Open Questions

Open questions for the owner (none changes the tasks):
1. Should a можливий дубль keep leading (D2), or be ranked by its сума like any fact?
2. Is "UAH first, other currencies after" right for Головний's three slots (D3), or should the
   widget reserve a slot for the heaviest non-UAH fact when one exists?
3. After the measurement (task 3.1): keep 25 % / 3 % / ×3 / 5 %, or retune? Any retune is a
   separate change with the measured counts as its evidence.

## Measurement

To be filled by task 3.1.
