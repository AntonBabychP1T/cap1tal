## Why

The owner's Горизонт 1 asks for «спостереження, ранжовані за сумою» (roadmap 1.4, QA 2.8): the
widget on Головний shows three спостереження and Місяць and the підсумок show five, but which ones
lead is decided by *kind* first. A Netflix price change of +50 UAH is therefore always listed above
a категорія that cost 9 000 UAH more than usual, and in a busy month the three slots of Головний go
to small facts while the large one waits behind «Усі (N)». This is the "where did my money go"
problem of vision §1: the fact that explains the most money should be the first one read.

Most of roadmap 1.4 is already done by `qa-sweep-2026-10` (archived 2026-10-06) and is in the main
specs: a категорія with nothing spent this month reads «цього місяця не було» instead of «на 100 %
менше»; Місяць and the підсумок show five and fold the rest under «Ще N», Головний three and «Усі
(N)»; two витрати with one опис recorded by hand are a можливий дубль; «Не дубль» is undoable with
«Скасувати»; «Видалити одну» exists on the спостереження. This change does not re-specify any of
them. What remains is the order itself, and the roadmap's «Пороги переглянути на справжній історії
власника».

## What Changes

- **Спостереження are ranked by money weight.** Every спостереження other than a можливий дубль gets
  one money weight: the difference, in minor units of its own currency, between the сума it states
  and the сума it compares it with (|A − T| against the типова сума, S − P for already more than
  last month, the last сума minus the first for a run, |X − R| for a price change, X − R for a
  purchase above its продавець). Within a currency the larger weight comes first *whatever the
  kind*; the old kind order only breaks ties of equal weight. The per-kind sizes are the ones the
  order already uses within a kind, so no new number is computed.
- **A можливий дубль still leads**, before every other спостереження: it is a question about a
  record, not a fact about spending, and while it is unanswered every other number of the month may
  be wrong by its сума.
- **Currencies still do not mix.** UAH first, then the other currencies by code, each ranked within
  itself; no курс, no conversion, no «приблизно в гривні».
- **The caps take the heaviest.** Головний's three, and Місяць's and the підсумок's five, are the
  first of this order, so they are now the largest facts. The caps themselves are unchanged.
- **Thresholds are measured, not changed.** One task reads the owner's own бекап and records how
  many спостереження each detector states per month under today's thresholds; any retuning of 25 %,
  3 %, ×3 or 5 % is put to the owner with those numbers and would be its own change.

Non-goals:
- No change to any detector, threshold, sentence or destination of an спостереження.
- No change to the caps (3 on Головний, 5 + «Ще N» on Місяць and the підсумок) or to the «Не дубль»
  answer, its undo, or «Видалити одну» — the last belongs to the sibling `answer-queue`.
- No cross-currency ranking and no курс in спостереження.
- No dismissal, no seen state, nothing stored: спостереження stay computed when shown.

Vision §14 items touched: none. §14.10 (no forecasts) stands — ranking reads only stated сум.
§19's "[PROPOSED] thresholds" stay as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `observations`: "Спостереження are listed in one fixed order" — дублі first, then per currency by
  money weight across kinds, the kind order only as a tie-break.
- `month-screen`: "Місяць states the shown month's спостереження" — its example scenario named the
  price change first by kind; under the weight order the larger Кафе fact leads, so the scenario's
  numbers and expectation are restated.

`main-screen` («Спостереження» widget) and `month-summary` («The підсумок carries the month's
спостереження») already say "the first N in the order the observations capability defines"; their
scenarios stay true (the summary's "the дубль first" holds because дублі still lead), so neither is
modified.

## Impact

- Code: the observation order module and its test, the observations integration test fixture whose
  "A дубль leads" scenario now asserts weight order after the дубль, and the Місяць block's
  scenario test. No schema, no migration, no native module, no permission, no package or app.json
  change.
- A throwaway measurement script run against the owner's бекап outside `verify`; its findings go
  into this change's design.md, not into code.
- Sequencing: `observations` is also read by the sibling `answer-queue` (можливий дубль entries and
  «Видалити одну»); this change touches only the order requirement, but they should not be applied
  in the same wave lane without rebasing one onto the other. `month-screen` may be touched by
  `commitments-from-recurring` («Вільно після зобов'язань») — different requirement, no conflict
  beyond a text merge. `main-screen` is not touched, so no conflict with `quick-entry`,
  `commitments-from-recurring` or `backup-reminder` there.
