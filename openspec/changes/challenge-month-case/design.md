## Context

See proposal.md — Why. `src/progress/challenges.ts` builds every виклик's sentences from labels
passed in through `ChallengeInput` (design D14 of `progress-and-challenges`: `src/progress` does not
import `src/ui`). `qa-sweep-2026-10` added `monthInYearLabel` («у вересні 2026») and
`monthAccusativeYearLabel` («вересень 2026») to that input and wired both in
`src/hooks/progress-ports.ts`; only `closeMonth` uses them. `limitHold` still interpolates
`monthLabel` («Липень 2026») after «у».

## Goals / Non-Goals

**Goals:** the ліміт виклик's reason in the right case; a test that fails for any виклик of the
catalogue that puts a heading's місяць inside a sentence, so the next template cannot repeat it.

**Non-Goals:** sentences outside the виклики; the «у»/«в» alternation of the shared helpers; no new
port, no storage, no screen change beyond the text the screen already renders.

## Decisions

### M1. The ліміт reason opens with the місяць

«У липні 2026 ліміт «Продукти» перевищено востаннє; відтоді під ним 2 з 3 завершених місяців.»
It reuses `monthInYearLabel` and the sentence-start capitalisation `closeMonth` already has
(`sentenceStart`), so no new label is needed. Keeping the old order — «…востаннє перевищено у липні
2026» — would put «у» after a vowel, where Ukrainian euphony prefers «в»; the helper always says
«у», and teaching it the alternation is out of scope. Opening the sentence with the місяць avoids
the question and matches «У вересні 2026 ще 9 записів…».

### M2. The sweep test reads the real labels and the whole catalogue

`challenges.test.ts` already passes the real `monthLabel`, `monthAccusativeYearLabel` and
`monthInYearLabel` (`qa-sweep-2026-10`, task 7.3). The new sweep offers every виклик that names a
місяць (`allChallenges`, so the three-at-a-time cap does not hide one) under two inputs — «Закрий
<місяць>» with something left and with nothing left, so both of its reason branches are read — and
for each виклик's name, reason and criterion asserts:

- none of «у», «в», «до», «з», «із», «від», «після» followed by a місяць in the heading's form,
  matched case-blind, so «у липень 2026» fails as «у Липень 2026» does. «за», «на», «по» are left
  out: «за липень», «на листопад» are correct Ukrainian;
- no capitalised місяць name except at the start of the text or after «. », «! », «? ».

The twelve nominative names are written out in the test rather than read from `months.ts`, so a
wrong table there cannot make the test agree with itself. It also asserts that the ліміт and
close-month виклики are among those read, so the sweep cannot pass by offering nothing.

### M3. Scenario wording elsewhere in the spec

Three scenarios of `challenges` outside the catalogue requirement still name «Закрий 2026-08» /
«Закрий 2026-07». `qa-sweep-2026-10` modifies only the catalogue and the accept/dismiss
requirements, so this change carries MODIFIED blocks for the other two with the names in words; the
deltas touch disjoint requirements and merge in either order.

## Risks / Trade-offs

- The ліміт виклик's reason text changes; a saved screenshot or doc quoting the old text goes stale.
  `docs/app-overview.md` is checked and updated if it quotes it.
- The sweep's capital-letter check would misfire on a категорія or ціль named like a місяць
  («Травень»). The test's own data uses no such names; the rule itself is about the label of the
  місяць, not about names the owner gives.

## Migration Plan

None — no storage.

## Open Questions

None.
